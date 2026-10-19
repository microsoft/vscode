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

function containsSetTimeoutCall(node: TSESTree.Node): boolean {
	if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'setTimeout') {
		return true;
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === 'parent') {
			continue;
		}
		const children = Array.isArray(value) ? value : [value];
		for (const child of children) {
			if (child && typeof child === 'object' && typeof (child as TSESTree.Node).type === 'string' && containsSetTimeoutCall(child as TSESTree.Node)) {
				return true;
			}
		}
	}
	return false;
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
		return !!executor && isFunction(executor) && containsSetTimeoutCall(executor.body);
	}
	return false;
}

function isAwaitedSleep(statement: TSESTree.Statement): statement is TSESTree.ExpressionStatement & { expression: TSESTree.AwaitExpression } {
	return statement.type === 'ExpressionStatement' && statement.expression.type === 'AwaitExpression' && isTimerSleep(statement.expression.argument);
}

function isExit(statement: TSESTree.Statement): boolean {
	return statement.type === 'BreakStatement' || statement.type === 'ContinueStatement' || statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement';
}

function alwaysExits(statement: TSESTree.Statement): boolean {
	if (statement.type === 'BlockStatement') {
		return statement.body.length > 0 && isExit(statement.body[statement.body.length - 1]);
	}
	return isExit(statement);
}

/** `if (done) { break; }`, `if (Date.now() > deadline) { throw ... }` */
function isGuard(statement: TSESTree.Statement): boolean {
	return statement.type === 'IfStatement' && alwaysExits(statement.consequent) && (!statement.alternate || alwaysExits(statement.alternate));
}

/** `const state = read();`, `state = await read();` */
function isRead(statement: TSESTree.Statement): boolean {
	if (statement.type === 'VariableDeclaration') {
		return true;
	}
	return statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression' && statement.expression.operator === '=' && statement.expression.left.type === 'Identifier';
}

function bodyStatements(loop: LoopNode): TSESTree.Statement[] {
	return loop.body.type === 'BlockStatement' ? loop.body.body : [loop.body];
}

/**
 * The sleep of a loop that does nothing but sleep and check state: its body
 * consists only of awaited timer sleeps, exit guards and variable reads.
 */
function pollingSleep(loop: LoopNode): TSESTree.Statement | undefined {
	const statements = bodyStatements(loop);
	const sleep = statements.find(isAwaitedSleep);
	const onlyWaits = statements.every(statement => isAwaitedSleep(statement) || isGuard(statement) || isRead(statement) || statement.type === 'EmptyStatement');
	return onlyWaits ? sleep : undefined;
}

/** Code within a `runWithFakedTimers` callback runs on virtual time, which makes polling deterministic. */
function isInFakedTimers(node: TSESTree.Node): boolean {
	for (let current: TSESTree.Node | undefined = node.parent; current; current = current.parent) {
		if (isFunction(current) && current.parent?.type === 'CallExpression' && current.parent.arguments.includes(current as TSESTree.CallExpressionArgument)) {
			const callee = current.parent.callee;
			if (callee.type === 'Identifier' && callee.name === 'runWithFakedTimers') {
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
