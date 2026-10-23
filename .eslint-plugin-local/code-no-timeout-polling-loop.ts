/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { TSESTree } from '@typescript-eslint/utils';

const sleepFunctions = new Set(['timeout', 'sleep', 'delay', 'wait']);

/** Sleeps that are also called on a namespace, such as `async.timeout(n)`. A member `wait()` usually waits on a barrier. */
const memberSleepFunctions = new Set(['timeout', 'sleep', 'delay']);

/** Functions that call back on a later macrotask or animation frame. */
const timerFunctions = new Set(['setTimeout', 'setImmediate', 'requestAnimationFrame']);

/** Assertions of `assert`. `throws` and `rejects` call back and are not included. */
const assertFunctions = new Set(['ok', 'equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual', 'notDeepEqual', 'deepStrictEqual', 'notDeepStrictEqual', 'match', 'doesNotMatch', 'fail']);

/** Settles a `DeferredPromise`. */
const settleMethods = new Set(['complete', 'error']);

const noNames: ReadonlySet<string> = new Set();

type LoopNode = TSESTree.ForStatement | TSESTree.ForOfStatement | TSESTree.ForInStatement | TSESTree.WhileStatement | TSESTree.DoWhileStatement;
type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

function unwrap(node: TSESTree.Expression): TSESTree.Expression {
	while (node.type === 'TSAsExpression' || node.type === 'TSNonNullExpression' || node.type === 'TSSatisfiesExpression') {
		node = node.expression;
	}
	return node;
}

function isFunction(node: TSESTree.Node | null | undefined): node is FunctionNode {
	return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression' || node?.type === 'FunctionDeclaration';
}

function isCallTo(node: TSESTree.Node, name: string): node is TSESTree.CallExpression {
	return node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === name;
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

function isPromise(node: TSESTree.Node): node is TSESTree.NewExpression {
	return node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'Promise';
}

/** The single expression of `() => expr`, `() => { expr; }` or `() => { return expr; }`, without a `void`. */
function onlyExpression(fn: TSESTree.Node): TSESTree.Expression | undefined {
	if (!isFunction(fn)) {
		return undefined;
	}
	let expression: TSESTree.Expression | undefined | null;
	if (fn.body.type !== 'BlockStatement') {
		expression = fn.body;
	} else if (fn.body.body.length === 1) {
		const statement = fn.body.body[0];
		expression = statement.type === 'ExpressionStatement' ? statement.expression : statement.type === 'ReturnStatement' ? statement.argument : undefined;
	}
	return expression?.type === 'UnaryExpression' && expression.operator === 'void' ? expression.argument : expression ?? undefined;
}

/** The callback of `setTimeout(callback, n)`, `setImmediate(callback)` or `window.requestAnimationFrame(callback)`. */
function timerCallback(node: TSESTree.Node | undefined): TSESTree.CallExpressionArgument | undefined {
	if (node?.type !== 'CallExpression') {
		return undefined;
	}
	const name = calleeName(node.callee);
	return name && timerFunctions.has(name) ? node.arguments[0] : undefined;
}

/** `setTimeout(resolve, n)`, `setImmediate(() => resolve())`, `requestAnimationFrame(() => requestAnimationFrame(() => resolve()))` */
function resolvesOnTimer(node: TSESTree.Node | undefined, resolve: string): boolean {
	const callback = timerCallback(node);
	if (callback?.type === 'Identifier') {
		return callback.name === resolve;
	}
	const call = callback && onlyExpression(callback);
	return !!call && (isCallTo(call, resolve) || resolvesOnTimer(call, resolve));
}

/**
 * An executor that does nothing but resolve on a timer, such as
 * `r => setTimeout(r, n)`, `r => void setImmediate(r)` or
 * `function (r) { requestAnimationFrame(() => r()); }`. Executors that also
 * subscribe to a signal or do work are not sleeps.
 */
function isTimerOnlyExecutor(executor: TSESTree.Node): boolean {
	const resolve = isFunction(executor) ? executor.params[0] : undefined;
	return resolve?.type === 'Identifier' && resolvesOnTimer(onlyExpression(executor), resolve.name);
}

/** `new Promise(() => { })`, which never settles. */
function isNeverSettlingPromise(node: TSESTree.Node | undefined): boolean {
	const executor = node && isPromise(node) ? node.arguments[0] : undefined;
	return isFunction(executor) && (executor.params.length === 0 || (executor.body.type === 'BlockStatement' && executor.body.body.length === 0));
}

function paramNames(fn: FunctionNode | undefined): ReadonlySet<string> {
	const names = new Set<string>();
	for (const param of fn?.params ?? []) {
		const name = param.type === 'AssignmentPattern' ? param.left : param;
		if (name.type === 'Identifier') {
			names.add(name.name);
		}
	}
	return names;
}

function enclosingFunction(node: TSESTree.Node): FunctionNode | undefined {
	for (let current = node.parent; current; current = current.parent) {
		if (isFunction(current)) {
			return current;
		}
	}
	return undefined;
}

/** The `resolve` and `reject` of the promise executor that `node` is in, if any. */
function executorParams(node: TSESTree.Node): ReadonlySet<string> {
	const executor = enclosingFunction(node);
	return executor?.parent && isPromise(executor.parent) && executor.parent.arguments[0] === executor ? paramNames(executor) : noNames;
}

/** Method names that read state, such as `getX`, `isX`, `find` or `Date.now`, matched by camelCase prefix. */
const readPrefixes = ['get', 'read', 'list', 'find', 'filter', 'has', 'is', 'some', 'every', 'includes', 'at', 'indexOf', 'map', 'keys', 'values', 'entries', 'count', 'query', 'peek', 'lookup', 'stat', 'exists', 'parse', 'stringify', 'join', 'slice', 'now', 'toString', 'closest', 'contains', 'matches'];
const readName = new RegExp(`^(?:${readPrefixes.join('|')})(?:$|[A-Z])`);

function isReadName(name: string): boolean {
	return readName.test(name);
}

function isExit(statement: TSESTree.Statement | undefined): statement is TSESTree.BreakStatement | TSESTree.ContinueStatement | TSESTree.ReturnStatement | TSESTree.ThrowStatement {
	return statement?.type === 'BreakStatement' || statement?.type === 'ContinueStatement' || statement?.type === 'ReturnStatement' || statement?.type === 'ThrowStatement';
}

/** Recognizes awaited sleeps, including same-file helpers that only sleep. */
class Sleeps {

	private readonly helpers = new Map<FunctionNode, boolean>();
	private readonly sourceCode: eslint.SourceCode;

	constructor(sourceCode: eslint.SourceCode) {
		this.sourceCode = sourceCode;
	}

	/**
	 * `timeout(n)`, `async.timeout(n)`, `new Promise(r => setTimeout(r, n))`,
	 * the awaited `setTimeout(n)` and `setImmediate()` of `timers/promises`,
	 * `raceTimeout` on a promise that never settles, and calls of same-file
	 * helpers that only sleep, such as `tick()` or a renamed import of `timeout`.
	 */
	isSleep(node: TSESTree.Expression): boolean {
		node = unwrap(node);
		if (isPromise(node)) {
			return !!node.arguments[0] && isTimerOnlyExecutor(node.arguments[0]);
		}
		if (node.type !== 'CallExpression') {
			return false;
		}
		const callee = node.callee;
		const name = calleeName(callee);
		if (name === 'raceTimeout') {
			return this.isNeverSettling(node.arguments[0]);
		}
		if (callee.type === 'Identifier') {
			return sleepFunctions.has(callee.name) || callee.name === 'setTimeout' || callee.name === 'setImmediate' || this.isSleepHelper(callee);
		}
		return !!name && memberSleepFunctions.has(name) && node.arguments.length > 0;
	}

	private isSleepHelper(identifier: TSESTree.Identifier): boolean {
		const definition = this.definition(identifier);
		if (definition?.type === 'ImportSpecifier') {
			return definition.imported.type === 'Identifier' && sleepFunctions.has(definition.imported.name);
		}
		if (!isFunction(definition)) {
			return false;
		}
		let result = this.helpers.get(definition);
		if (result === undefined) {
			this.helpers.set(definition, false);
			result = definition.body.type === 'BlockStatement' ? this.onlySleeps(definition.body.body) : this.isSleep(definition.body);
			this.helpers.set(definition, result);
		}
		return result;
	}

	/** `await sleep();`, `return sleep();` and `for (...) { await sleep(); }` */
	private onlySleeps(statements: TSESTree.Statement[]): boolean {
		return statements.length > 0 && statements.every(statement => {
			switch (statement.type) {
				case 'ExpressionStatement':
					return statement.expression.type === 'AwaitExpression' && this.isSleep(statement.expression.argument);
				case 'ReturnStatement':
					return !!statement.argument && this.isSleep(statement.argument.type === 'AwaitExpression' ? statement.argument.argument : statement.argument);
				case 'ForStatement':
					return this.onlySleeps(statement.body.type === 'BlockStatement' ? statement.body.body : [statement.body]);
				default:
					return false;
			}
		});
	}

	private isNeverSettling(node: TSESTree.CallExpressionArgument | undefined): boolean {
		if (!node || node.type === 'SpreadElement') {
			return false;
		}
		node = unwrap(node);
		return isNeverSettlingPromise(node.type === 'Identifier' ? this.definition(node) : node);
	}

	/** The function or `const` initializer that an identifier is bound to in this file, or its import. */
	private definition(identifier: TSESTree.Identifier): TSESTree.Node | undefined {
		for (let scope: eslint.Scope.Scope | null = this.sourceCode.getScope(identifier as ESTree.Node); scope; scope = scope.upper) {
			const variable = scope.set.get(identifier.name);
			if (variable) {
				const definition = variable.defs.length === 1 ? variable.defs[0] : undefined;
				const node = definition?.node as TSESTree.Node | undefined;
				switch (definition?.type) {
					case 'FunctionName':
						return node;
					case 'ImportBinding':
						return node?.type === 'ImportSpecifier' ? node : undefined;
					case 'Variable':
						return node?.type === 'VariableDeclarator' && node.parent.kind === 'const' && node.init ? unwrap(node.init) : undefined;
					default:
						return undefined;
				}
			}
		}
		return undefined;
	}
}

/**
 * Classifies the statements of a loop body, or of a function or timer callback
 * that polls, as statements that only wait and check state. Records the sleep
 * of the poll and how it repeats.
 */
class Poll {

	sleep: TSESTree.Node | undefined;
	/** The function called or rescheduled itself. */
	repeats = false;
	/** A promise was settled conditionally. */
	settles = false;
	/** A timer was cleared. */
	clears = false;

	private readonly sleeps: Sleeps;
	/** The polling function, which calls its parameters to read state, such as `predicate` of `waitFor(predicate)`. */
	private readonly owner: FunctionNode | undefined;
	private ownerParams: ReadonlySet<string> | undefined;
	/** The name of a function that polls by calling or rescheduling itself. */
	private readonly self: string | undefined;
	/** For timer callbacks, a node within the promise executor whose `resolve` and `reject` settle the poll. */
	private readonly settler: TSESTree.Node | undefined;
	private settlerParams: ReadonlySet<string> | undefined;

	constructor(sleeps: Sleeps, owner: FunctionNode | undefined, self?: string, settler?: TSESTree.Node) {
		this.sleeps = sleeps;
		this.owner = owner;
		this.self = self;
		this.settler = settler;
	}

	private get params(): ReadonlySet<string> {
		return this.ownerParams ??= paramNames(this.owner);
	}

	private get settleNames(): ReadonlySet<string> {
		return this.settlerParams ??= this.settler ? executorParams(this.settler) : noNames;
	}

	waits(statements: TSESTree.Statement[], inTry = false, nested = false): boolean {
		return statements.every(statement => this.waitsIn(statement, inTry, nested));
	}

	private waitsIn(statement: TSESTree.Statement, inTry: boolean, nested: boolean): boolean {
		switch (statement.type) {
			case 'EmptyStatement':
			case 'BreakStatement':
			case 'ContinueStatement':
				return true;
			case 'BlockStatement':
				return this.waits(statement.body, inTry, nested);
			case 'VariableDeclaration':
				return statement.declarations.every(declaration => this.isRead(declaration.init, inTry));
			case 'ExpressionStatement':
				return this.waitsInExpression(statement, inTry, nested);
			case 'ReturnStatement':
				return this.isSelfCall(statement.argument) || (!this.isParamCall(statement.argument) && this.isRead(statement.argument, inTry));
			case 'ThrowStatement':
				return this.isRead(statement.argument, inTry);
			case 'IfStatement':
				return this.isBranch(statement.consequent, inTry) && (!statement.alternate || this.isBranch(statement.alternate, inTry));
			case 'TryStatement':
				return this.waits(statement.block.body, true, true)
					&& (!statement.handler || this.waits(statement.handler.body.body, inTry, true))
					&& (!statement.finalizer || this.waits(statement.finalizer.body, inTry, nested));
			default:
				return false;
		}
	}

	private waitsInExpression(statement: TSESTree.ExpressionStatement, inTry: boolean, nested: boolean): boolean {
		const expression = statement.expression;
		if ((expression.type === 'AwaitExpression' && this.sleeps.isSleep(expression.argument)) || this.isReschedule(expression)) {
			this.sleep ??= statement;
			return true;
		}
		if (this.isSelfCall(expression)) {
			return true;
		}
		if (this.isSettle(expression)) {
			this.settles ||= nested;
			return true;
		}
		// bookkeeping: `attempts++`, `attempts += 1`, `state = await read()`
		if (expression.type === 'UpdateExpression') {
			return expression.argument.type === 'Identifier';
		}
		if (expression.type === 'AssignmentExpression') {
			return expression.left.type === 'Identifier' && this.isRead(expression.right, inTry);
		}
		return this.isRead(expression, inTry);
	}

	/** An `if` branch either only waits, or it ends the iteration. */
	private isBranch(statement: TSESTree.Statement, inTry: boolean): boolean {
		return this.isExitBranch(statement, inTry) || this.waitsIn(statement, inTry, true);
	}

	/**
	 * A branch that ends the iteration. Work before a `break`, `return` or
	 * `throw` runs once on the way out, but work before a `continue` or a
	 * recursive call runs on every iteration, and work in a `try` block is
	 * retried when it throws, so such a loop drives an operation instead of only
	 * waiting.
	 */
	private isExitBranch(statement: TSESTree.Statement, inTry: boolean): boolean {
		const statements = statement.type === 'BlockStatement' ? statement.body : [statement];
		const last = statements.at(-1);
		if (!isExit(last)) {
			return false;
		}
		const repeats = last.type === 'ContinueStatement' || (last.type === 'ReturnStatement' && this.isSelfCall(last.argument));
		return repeats || inTry ? this.waits(statements, inTry, true) : true;
	}

	/**
	 * `return await task()` of `retry(task)`. A poll inspects the result of its
	 * probe, as in `result = await fn(); if (accept(result)) { return result; }`,
	 * but returning the result of a callback retries an operation.
	 */
	private isParamCall(node: TSESTree.Expression | null | undefined): boolean {
		node = node && unwrap(node.type === 'AwaitExpression' ? node.argument : node);
		return node?.type === 'CallExpression' && node.callee.type === 'Identifier' && this.params.has(node.callee.name);
	}

	/** `await waitFor(predicate)` or `return waitFor(predicate)` in `waitFor` itself */
	private isSelfCall(node: TSESTree.Expression | null | undefined): boolean {
		if (!node || !this.self) {
			return false;
		}
		node = unwrap(node.type === 'AwaitExpression' ? node.argument : node);
		if (isCallTo(node, this.self) && node.arguments.every(argument => this.isRead(argument, false))) {
			this.repeats = true;
			return true;
		}
		return false;
	}

	/** `setTimeout(check, n)` or `setTimeout(() => check(), n)` in `check` itself */
	private isReschedule(node: TSESTree.Expression): boolean {
		if (!this.self) {
			return false;
		}
		const callback = timerCallback(node);
		const call = callback && (callback.type === 'Identifier' ? callback : onlyExpression(callback));
		if (call && (call.type === 'Identifier' ? call.name === this.self : isCallTo(call, this.self))) {
			this.repeats = true;
			return true;
		}
		return false;
	}

	/** `resolve()`, `deferred.complete()` or `clearInterval(handle)` in a timer callback */
	private isSettle(node: TSESTree.Expression): boolean {
		if (!this.settler) {
			return false;
		}
		node = node.type === 'UnaryExpression' && node.operator === 'void' ? node.argument : node;
		if (node.type !== 'CallExpression' || !node.arguments.every(argument => this.isRead(argument, false))) {
			return false;
		}
		const name = calleeName(node.callee);
		if (name === 'clearInterval' || name === 'clearTimeout') {
			this.clears = true;
			return true;
		}
		return node.callee.type === 'Identifier' ? this.settleNames.has(node.callee.name) : !!name && settleMethods.has(name);
	}

	/**
	 * Whether evaluating `node` only reads state. This is conservative: calls
	 * count as reads only by name, and anything unknown counts as work.
	 * Assertions only count as reads in a `try` block, which retries them.
	 * Elsewhere they test each sample, which is not a wait.
	 */
	private isRead(node: TSESTree.Node | null | undefined, inTry: boolean): boolean {
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
				return node.expressions.every(expression => this.isRead(expression, inTry));
			case 'MemberExpression':
				return this.isRead(node.object, inTry) && (!node.computed || this.isRead(node.property, inTry));
			case 'ChainExpression':
			case 'TSAsExpression':
			case 'TSNonNullExpression':
			case 'TSSatisfiesExpression':
				return this.isRead(node.expression, inTry);
			case 'AwaitExpression':
			case 'SpreadElement':
				return this.isRead(node.argument, inTry);
			case 'UnaryExpression':
				return node.operator !== 'delete' && this.isRead(node.argument, inTry);
			case 'BinaryExpression':
			case 'LogicalExpression':
				return this.isRead(node.left, inTry) && this.isRead(node.right, inTry);
			case 'ConditionalExpression':
				return this.isRead(node.test, inTry) && this.isRead(node.consequent, inTry) && this.isRead(node.alternate, inTry);
			case 'ArrayExpression':
				return node.elements.every(element => this.isRead(element, inTry));
			case 'ObjectExpression':
				return node.properties.every(property => this.isRead(property.type === 'SpreadElement' ? property : property.value, inTry));
			case 'NewExpression':
				// `new Error(...)`
				return node.callee.type === 'Identifier' && node.callee.name.endsWith('Error') && node.arguments.every(argument => this.isRead(argument, inTry));
			case 'CallExpression':
				return this.isReadCall(node.callee, inTry) && node.arguments.every(argument => this.isRead(argument, inTry));
			default:
				return false;
		}
	}

	private isReadCall(callee: TSESTree.Expression, inTry: boolean): boolean {
		if (callee.type === 'Identifier') {
			return isReadName(callee.name) || this.params.has(callee.name) || (inTry && (callee.name === 'assert' || assertFunctions.has(callee.name)));
		}
		if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') {
			return false;
		}
		const receiver = callee.object.type === 'Identifier' ? callee.object.name : undefined;
		if (receiver === 'console' || (inTry && receiver === 'assert' && assertFunctions.has(callee.property.name))) {
			return true;
		}
		return isReadName(callee.property.name) && this.isRead(callee.object, inTry);
	}
}

function bodyStatements(loop: LoopNode): TSESTree.Statement[] {
	return loop.body.type === 'BlockStatement' ? loop.body.body : [loop.body];
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
			polling: 'Do not wait for a state change by polling a timer, whether in a loop, a function that calls or reschedules itself, or a `setInterval` callback. The time budget depends on timer clamping and machine load, so the test is flaky on slow machines, and a bounded poll that runs out continues with stale state and fails somewhere else. Await a signal for the state change instead, e.g. a `DeferredPromise`, `Event.toPromise(...)`, `waitForState(...)` or the promise of the operation itself, or use `runWithFakedTimers` for code that is driven by timers.',
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

		const sleeps = new Sleeps(context.sourceCode);
		const report = (node: TSESTree.Node, at: TSESTree.Node) => {
			if (!isInFakedTimers(at)) {
				context.report({ node: node as ESTree.Node, messageId: 'polling' });
			}
		};

		/**
		 * A loop whose body only sleeps and checks state: awaited sleeps, exit
		 * guards, reads and bookkeeping. Conditions are not classified, since
		 * they are the state being polled.
		 */
		const checkLoop = (loop: LoopNode) => {
			const poll = new Poll(sleeps, enclosingFunction(loop));
			if (poll.waits(bodyStatements(loop)) && poll.sleep) {
				report(poll.sleep, loop);
			}
		};

		/**
		 * A function that only sleeps and checks state, and then calls or
		 * reschedules itself. Only functions that refer to their own name are
		 * classified, which keeps the rule cheap.
		 */
		const checkRecursion = (fn: FunctionNode, name: string) => {
			if (fn.body.type !== 'BlockStatement' || !context.sourceCode.scopeManager?.acquire(fn as ESTree.Node)?.through.some(reference => reference.identifier.name === name)) {
				return;
			}
			const poll = new Poll(sleeps, fn, name, fn);
			if (poll.waits(fn.body.body) && poll.repeats && poll.sleep) {
				report(poll.sleep, fn);
			}
		};

		/** `const handle = setInterval(() => { if (done) { clearInterval(handle); resolve(); } }, n)` */
		const checkInterval = (call: TSESTree.CallExpression) => {
			const callback = call.arguments[0];
			if (!isFunction(callback) || callback.body.type !== 'BlockStatement') {
				return;
			}
			const poll = new Poll(sleeps, undefined, undefined, call);
			if (poll.waits(callback.body.body) && poll.settles && poll.clears) {
				report(call, call);
			}
		};

		return {
			ForStatement: (node: ESTree.Node) => checkLoop(node as TSESTree.ForStatement),
			ForOfStatement: (node: ESTree.Node) => checkLoop(node as TSESTree.ForOfStatement),
			ForInStatement: (node: ESTree.Node) => checkLoop(node as TSESTree.ForInStatement),
			WhileStatement: (node: ESTree.Node) => checkLoop(node as TSESTree.WhileStatement),
			DoWhileStatement: (node: ESTree.Node) => checkLoop(node as TSESTree.DoWhileStatement),
			// `function waitFor() { ... }`
			FunctionDeclaration: (node: ESTree.Node) => {
				const fn = node as TSESTree.FunctionDeclaration;
				if (fn.id) {
					checkRecursion(fn, fn.id.name);
				}
			},
			VariableDeclarator: (node: ESTree.Node) => {
				const declarator = node as TSESTree.VariableDeclarator;
				const init = declarator.init;
				if (declarator.id.type !== 'Identifier' || !init) {
					return;
				}
				if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
					// `const waitFor = () => { ... }`
					checkRecursion(init, declarator.id.name);
				} else if (init.type === 'CallExpression' && calleeName(init.callee) === 'setInterval') {
					// `const handle = setInterval(...)`: a waiter keeps the handle to clear the interval. Visiting
					// declarators instead of every call keeps the rule cheap.
					checkInterval(init);
				}
			},
		};
	}
};
