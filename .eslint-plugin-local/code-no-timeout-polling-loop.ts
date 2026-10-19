/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { TSESTree } from '@typescript-eslint/utils';

const sleepFunctions = new Set(['timeout', 'sleep', 'delay', 'wait']);

type LoopNode = TSESTree.ForStatement | TSESTree.ForOfStatement | TSESTree.ForInStatement | TSESTree.WhileStatement | TSESTree.DoWhileStatement;

function unwrap(node: TSESTree.Expression): TSESTree.Expression {
	while (node.type === 'TSAsExpression' || node.type === 'TSNonNullExpression' || node.type === 'TSSatisfiesExpression') {
		node = node.expression;
	}
	return node;
}

function isFunction(node: TSESTree.Node): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration {
	return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration';
}

function isCallTo(node: TSESTree.Node, name: string): node is TSESTree.CallExpression {
	return node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === name;
}

/** The single expression of `() => expr` or `() => { expr; }`. */
function onlyExpression(fn: TSESTree.Node): TSESTree.Node | undefined {
	if (!isFunction(fn)) {
		return undefined;
	}
	if (fn.body.type !== 'BlockStatement') {
		return fn.body;
	}
	return fn.body.body.length === 1 && fn.body.body[0].type === 'ExpressionStatement' ? fn.body.body[0].expression : undefined;
}

/**
 * An executor that does nothing but resolve on a timer, such as
 * `r => setTimeout(r, n)` or `function (r) { setTimeout(() => r(), n); }`.
 * Executors that also subscribe to a signal or do work are not sleeps.
 */
function isTimerOnlyExecutor(executor: TSESTree.Node): boolean {
	const resolve = isFunction(executor) ? executor.params[0] : undefined;
	const call = onlyExpression(executor);
	if (resolve?.type !== 'Identifier' || !call || !isCallTo(call, 'setTimeout')) {
		return false;
	}
	const callback = call.arguments[0];
	if (callback?.type === 'Identifier') {
		return callback.name === resolve.name;
	}
	const resolveCall = callback && onlyExpression(callback);
	return !!resolveCall && isCallTo(resolveCall, resolve.name);
}

/**
 * `timeout(n)`, `sleep(n)`, `new Promise(r => setTimeout(r, n))` and the
 * awaited `setTimeout(n)` of `timers/promises`.
 */
function isTimerSleep(node: TSESTree.Expression): boolean {
	node = unwrap(node);
	if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
		return sleepFunctions.has(node.callee.name) || node.callee.name === 'setTimeout';
	}
	if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'Promise') {
		const executor = node.arguments[0];
		return !!executor && isTimerOnlyExecutor(executor);
	}
	return false;
}

/** Method names that read state, such as `getX`, `isX`, `find` or `Date.now`, matched by camelCase prefix. */
const readPrefixes = ['get', 'read', 'list', 'find', 'filter', 'has', 'is', 'some', 'every', 'includes', 'at', 'indexOf', 'map', 'keys', 'values', 'entries', 'count', 'query', 'peek', 'lookup', 'stat', 'exists', 'parse', 'stringify', 'join', 'slice', 'now', 'toString'];

function isReadName(name: string): boolean {
	return readPrefixes.some(prefix => name === prefix || (name.startsWith(prefix) && /[A-Z]/.test(name.charAt(prefix.length))));
}

function calleeName(callee: TSESTree.Expression): string | undefined {
	if (callee.type === 'Identifier') {
		return callee.name;
	}
	if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
		return callee.property.name;
	}
	return undefined;
}

/**
 * Whether evaluating `node` only reads state. This is conservative: calls
 * count as reads only by name, and anything unknown counts as work.
 */
function isRead(node: TSESTree.Node | null | undefined): boolean {
	if (!node) {
		return true;
	}
	switch (node.type) {
		case 'Literal':
		case 'Identifier':
		case 'ThisExpression':
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
			return true;
		case 'TemplateLiteral':
			return node.expressions.every(isRead);
		case 'MemberExpression':
			return isRead(node.object) && (!node.computed || isRead(node.property));
		case 'ChainExpression':
		case 'TSAsExpression':
		case 'TSNonNullExpression':
		case 'TSSatisfiesExpression':
			return isRead(node.expression);
		case 'AwaitExpression':
		case 'SpreadElement':
			return isRead(node.argument);
		case 'UnaryExpression':
			return node.operator !== 'delete' && isRead(node.argument);
		case 'BinaryExpression':
		case 'LogicalExpression':
			return isRead(node.left) && isRead(node.right);
		case 'ConditionalExpression':
			return isRead(node.test) && isRead(node.consequent) && isRead(node.alternate);
		case 'ArrayExpression':
			return node.elements.every(isRead);
		case 'ObjectExpression':
			return node.properties.every(property => property.type === 'SpreadElement' ? isRead(property) : isRead(property.value));
		case 'CallExpression': {
			const name = calleeName(node.callee);
			const receiver = node.callee.type === 'MemberExpression' ? node.callee.object : undefined;
			return !!name && isReadName(name) && isRead(receiver) && node.arguments.every(isRead);
		}
		default:
			return false;
	}
}

function isAwaitedSleep(statement: TSESTree.Statement): statement is TSESTree.ExpressionStatement & { expression: TSESTree.AwaitExpression } {
	return statement.type === 'ExpressionStatement' && statement.expression.type === 'AwaitExpression' && isTimerSleep(statement.expression.argument);
}

function isExit(statement: TSESTree.Statement): boolean {
	return statement.type === 'BreakStatement' || statement.type === 'ContinueStatement' || statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement';
}

/** `const state = read();`, `state = await read();` */
function isReadStatement(statement: TSESTree.Statement): boolean {
	if (statement.type === 'VariableDeclaration') {
		return statement.declarations.every(declaration => isRead(declaration.init));
	}
	return statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression' && statement.expression.operator === '=' && statement.expression.left.type === 'Identifier' && isRead(statement.expression.right);
}

/**
 * A branch that ends the iteration. Work before a `break`, `return` or `throw`
 * runs once on the way out, but work before a `continue` runs on every
 * iteration, so such a loop drives an operation instead of only waiting.
 */
function isExitBranch(statement: TSESTree.Statement): boolean {
	if (statement.type !== 'BlockStatement') {
		return isExit(statement);
	}
	const last = statement.body.at(-1);
	if (!last || !isExit(last)) {
		return false;
	}
	return last.type !== 'ContinueStatement' || statement.body.slice(0, -1).every(isReadStatement);
}

/** `if (done) { break; }`, `if (Date.now() > deadline) { throw ... }` */
function isGuard(statement: TSESTree.Statement): boolean {
	return statement.type === 'IfStatement' && isExitBranch(statement.consequent) && (!statement.alternate || isExitBranch(statement.alternate));
}

function bodyStatements(loop: LoopNode): TSESTree.Statement[] {
	return loop.body.type === 'BlockStatement' ? loop.body.body : [loop.body];
}

/**
 * The sleep of a loop that does nothing but sleep and check state: its body
 * consists only of awaited timer sleeps, exit guards and reads. Conditions
 * are not classified, since they are the state being polled.
 */
function pollingSleep(loop: LoopNode): TSESTree.Statement | undefined {
	const statements = bodyStatements(loop);
	const sleep = statements.find(isAwaitedSleep);
	const onlyWaits = statements.every(statement => isAwaitedSleep(statement) || isGuard(statement) || isReadStatement(statement) || statement.type === 'EmptyStatement');
	return onlyWaits ? sleep : undefined;
}

/** `runWithFakedTimers({ useFakeTimers: false }, ...)` runs on real time. */
function disablesFakeTimers(call: TSESTree.CallExpression): boolean {
	const options = call.arguments[0];
	return options?.type === 'ObjectExpression' && options.properties.some(property => property.type === 'Property'
		&& !property.computed
		&& property.key.type === 'Identifier' && property.key.name === 'useFakeTimers'
		&& property.value.type === 'Literal' && property.value.value === false);
}

/**
 * Code within a `runWithFakedTimers` callback runs on virtual time, which
 * makes polling deterministic. A callback that opts out of fake timers still
 * runs on the virtual time of an enclosing callback, if any.
 */
function isInFakedTimers(node: TSESTree.Node): boolean {
	for (let current: TSESTree.Node | undefined = node.parent; current; current = current.parent) {
		const call = current.parent;
		if (isFunction(current) && call?.type === 'CallExpression' && call.arguments.includes(current as TSESTree.CallExpressionArgument)) {
			if (call.callee.type === 'Identifier' && call.callee.name === 'runWithFakedTimers' && !disablesFakeTimers(call)) {
				return true;
			}
		}
	}
	return false;
}

export default new class NoTimeoutPollingLoop implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		messages: {
			polling: 'Do not wait for a state change by polling a timer in a loop. The time budget depends on timer clamping and machine load, so the test is flaky on slow machines, and a bounded loop that runs out continues with stale state and fails somewhere else. Await a signal for the state change instead, e.g. a `DeferredPromise`, `Event.toPromise(...)`, `waitForState(...)` or the promise of the operation itself, or use `runWithFakedTimers` for code that is driven by timers.',
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

		const check = (loop: LoopNode) => {
			const sleep = pollingSleep(loop);
			if (sleep && !isInFakedTimers(loop)) {
				context.report({ node: sleep as ESTree.Node, messageId: 'polling' });
			}
		};

		return {
			ForStatement: (node: ESTree.Node) => check(node as TSESTree.ForStatement),
			ForOfStatement: (node: ESTree.Node) => check(node as TSESTree.ForOfStatement),
			ForInStatement: (node: ESTree.Node) => check(node as TSESTree.ForInStatement),
			WhileStatement: (node: ESTree.Node) => check(node as TSESTree.WhileStatement),
			DoWhileStatement: (node: ESTree.Node) => check(node as TSESTree.DoWhileStatement),
		};
	}
};
