/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { TSESTree } from '@typescript-eslint/utils';
import { posix } from 'path';

const helperModules = [
	'/vs/base/test/common/timeTravelScheduler.js',
	'/vs/base/test/common/virtualScheduling/index.js',
	'/vs/base/test/common/virtualScheduling/runWithFakedTimers.js',
];
const testFunctions = new Set(['test', 'it']);
const hookFunctions = new Set(['setup', 'teardown', 'suiteSetup', 'suiteTeardown', 'before', 'after', 'beforeEach', 'afterEach']);
const mochaContextMethods = new Set(['timeout', 'retries', 'slow']);

type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

function isFunction(node: TSESTree.Node): node is FunctionNode {
	return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration';
}

function unwrap(node: TSESTree.Node): TSESTree.Node {
	while (node.type === 'AwaitExpression' || node.type === 'TSAsExpression' || node.type === 'TSNonNullExpression' || node.type === 'TSSatisfiesExpression') {
		node = node.type === 'AwaitExpression' ? node.argument : node.expression;
	}
	return node;
}

/** Resolves `test`, `test.skip`, `test.only` and `(cond ? test.skip : test)` to `test`. */
function calleeName(callee: TSESTree.Node): string | undefined {
	if (callee.type === 'Identifier') {
		return callee.name;
	}
	if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.property.type === 'Identifier' && (callee.property.name === 'skip' || callee.property.name === 'only')) {
		return callee.object.name;
	}
	if (callee.type === 'ConditionalExpression') {
		return calleeName(callee.consequent) ?? calleeName(callee.alternate);
	}
	return undefined;
}

/** The name of the call that `fn` is passed to as a callback, e.g. `test` or `setup`. */
function callbackOwner(fn: FunctionNode): string | undefined {
	const parent = fn.parent;
	return parent?.type === 'CallExpression' && parent.arguments.includes(fn as TSESTree.CallExpressionArgument) ? calleeName(parent.callee) : undefined;
}

/** `this.timeout(...)` and friends configure mocha and may precede the wrapped body. */
function isMochaContextCall(statement: TSESTree.Statement): boolean {
	if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'CallExpression') {
		return false;
	}
	const callee = statement.expression.callee;
	return callee.type === 'MemberExpression' && callee.object.type === 'ThisExpression' && callee.property.type === 'Identifier' && mochaContextMethods.has(callee.property.name);
}

function bodyStatements(fn: FunctionNode): TSESTree.Statement[] | undefined {
	return fn.body.type === 'BlockStatement' ? fn.body.body.filter(statement => !isMochaContextCall(statement)) : undefined;
}

function isStatementOf(statement: TSESTree.Statement, call: TSESTree.CallExpression): boolean {
	if (statement.type === 'ReturnStatement') {
		return !!statement.argument && unwrap(statement.argument) === call;
	}
	return statement.type === 'ExpressionStatement' && unwrap(statement.expression) === call;
}

/** Whether `call` is the entire body of `fn`. */
function isWholeBody(fn: FunctionNode, call: TSESTree.CallExpression): boolean {
	const statements = bodyStatements(fn);
	if (!statements) {
		return unwrap(fn.body) === call;
	}
	return statements.length === 1 && isStatementOf(statements[0], call);
}

function isInert(node: TSESTree.Node | null): boolean {
	if (!node) {
		return true;
	}
	switch (node.type) {
		case 'Literal': return true;
		case 'Identifier': return node.name === 'undefined';
		case 'TemplateLiteral': return node.expressions.length === 0;
		case 'UnaryExpression': return isInert(node.argument);
		case 'TSAsExpression': return isInert(node.expression);
		case 'ArrayExpression': return node.elements.every(element => element !== null && element.type !== 'SpreadElement' && isInert(element));
		case 'ObjectExpression': return node.properties.every(property => property.type === 'Property' && !property.computed && isInert(property.value));
		default: return false;
	}
}

/**
 * `onHistory` is only invoked after the post-callback drain, so assertions on
 * the captured history must follow the call. Allow inert variable declarations
 * before it and synchronous calls (assertions) after it.
 */
function isOnHistoryCapture(fn: FunctionNode, call: TSESTree.CallExpression): boolean {
	const options = call.arguments[0];
	if (options?.type !== 'ObjectExpression' || !options.properties.some(property => property.type === 'Property' && !property.computed && property.key.type === 'Identifier' && property.key.name === 'onHistory')) {
		return false;
	}
	const statements = bodyStatements(fn);
	const index = statements?.findIndex(statement => statement.type === 'ExpressionStatement' && unwrap(statement.expression) === call) ?? -1;
	if (!statements || index === -1) {
		return false;
	}
	const before = statements.slice(0, index);
	const after = statements.slice(index + 1);
	return before.every(statement => statement.type === 'VariableDeclaration' && statement.declarations.every(declaration => isInert(declaration.init)))
		&& after.every(statement => statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression');
}

export default new class RunWithFakedTimersWholeTest implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		messages: {
			partial: '`runWithFakedTimers` must wrap the entire test body: `test(\'...\', () => runWithFakedTimers({}, async () => { ... }))`. Code outside the callback runs on real timers, and the drain after the callback can fire unrelated pending timers (e.g. polls) before the code that follows. Move setup and assertions into the callback.',
			nested: 'Do not nest `runWithFakedTimers`. The outer call already provides virtual time, and the inner drain runs in the middle of the test.',
			floating: '`runWithFakedTimers` must be awaited or returned. Otherwise the test can finish before the callback, the drain, and the restoration of the real timers have run.',
			hook: 'Do not call `runWithFakedTimers` from a setup or teardown hook. Wrap each test body instead, so that setup and test run on the same clock.',
		},
		schema: [{
			type: 'object',
			properties: {
				exclude: { type: 'array', items: { type: 'string' } },
			},
			additionalProperties: false,
		}],
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const config = context.options[0] as { exclude?: string[] } | undefined;
		const filename = context.filename.replace(/\\/g, '/');
		if (config?.exclude?.some(e => filename.endsWith(e))) {
			return {};
		}

		const calls = new Set<TSESTree.CallExpression>();

		const check = (call: TSESTree.CallExpression) => {
			let parent = call.parent;
			while (parent?.type === 'TSAsExpression' || parent?.type === 'TSNonNullExpression' || parent?.type === 'TSSatisfiesExpression') {
				parent = parent.parent;
			}
			if (parent?.type === 'ExpressionStatement') {
				return context.report({ node: call as ESTree.Node, messageId: 'floating' });
			}

			let fn: FunctionNode | undefined;
			for (let node: TSESTree.Node | undefined = call.parent; node; node = node.parent) {
				if (isFunction(node)) {
					fn ??= node;
					// the callback of another runWithFakedTimers call
					if (node.parent?.type === 'CallExpression' && calls.has(node.parent) && node.parent.arguments[1] === node) {
						return context.report({ node: call as ESTree.Node, messageId: 'nested' });
					}
				}
			}
			if (!fn) {
				return context.report({ node: call as ESTree.Node, messageId: 'partial' });
			}

			const owner = callbackOwner(fn);
			if (owner && testFunctions.has(owner)) {
				if (!isWholeBody(fn, call) && !isOnHistoryCapture(fn, call)) {
					context.report({ node: call as ESTree.Node, messageId: 'partial' });
				}
				return;
			}
			if (owner && hookFunctions.has(owner)) {
				return context.report({ node: call as ESTree.Node, messageId: 'hook' });
			}

			// A wrapper helper such as `function withX(fn) { return runWithFakedTimers({}, ...); }`
			// is fine, as long as it is not defined within a test or hook.
			for (let node: TSESTree.Node | undefined = fn.parent; node; node = node.parent) {
				const enclosingOwner = isFunction(node) ? callbackOwner(node) : undefined;
				if (enclosingOwner && testFunctions.has(enclosingOwner)) {
					return context.report({ node: call as ESTree.Node, messageId: 'partial' });
				}
				if (enclosingOwner && hookFunctions.has(enclosingOwner)) {
					return context.report({ node: call as ESTree.Node, messageId: 'hook' });
				}
			}
			if (!isWholeBody(fn, call)) {
				context.report({ node: call as ESTree.Node, messageId: 'partial' });
			}
		};

		return {
			ImportDeclaration: (node: ESTree.ImportDeclaration) => {
				const source = node.source.value;
				if (typeof source !== 'string') {
					return;
				}
				const resolved = source.startsWith('.') ? posix.join(posix.dirname(filename), source) : source;
				if (!helperModules.some(m => resolved.endsWith(m))) {
					return;
				}
				for (const specifier of node.specifiers) {
					if (specifier.type !== 'ImportSpecifier' || specifier.imported.type !== 'Identifier' || specifier.imported.name !== 'runWithFakedTimers') {
						continue;
					}
					for (const variable of context.sourceCode.getDeclaredVariables(specifier)) {
						for (const reference of variable.references) {
							const identifier = reference.identifier as TSESTree.Identifier;
							if (identifier.parent?.type === 'CallExpression' && identifier.parent.callee === identifier) {
								calls.add(identifier.parent);
							}
						}
					}
				}
			},
			'Program:exit': () => {
				for (const call of calls) {
					check(call);
				}
			},
		};
	}
};
