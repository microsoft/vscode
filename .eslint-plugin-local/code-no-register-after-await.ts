/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/utils';
import * as eslint from 'eslint';
import type * as ESTree from 'estree';

/**
 * Reports disposables that are registered on `this` after an `await` when nothing between the await and the
 * registration re-checks whether the object was disposed, or the operation cancelled, while awaiting.
 *
 * Adding to a disposed `DisposableStore` only logs a warning and leaks the added object, and setting the value of a
 * disposed `MutableDisposable` silently drops it. The leak then surfaces later, often in the leak check of an
 * unrelated test.
 *
 * Registrations:
 * - `this._register(x)`
 * - `this.<store>.add(x)`, where `<store>` is declared in the class as a `DisposableStore` or `DisposableSet`, or is
 *   named like a store (`_store`, `_disposables`, `renderDisposables`, `_toDispose`, ...)
 * - `this.<field>.value = x`, where `<field>` is declared in the class as a `MutableDisposable`
 * - `this.<field>.set(key, x)`, where `<field>` is declared in the class as a `DisposableMap`
 *
 * Checks: a condition on an `isDisposed`/`disposed`-style member or variable, `isCancellationRequested`, or `aborted`
 * that keeps the registration from running once the object is gone, such as `if (check) { ...; return; }`,
 * `if (!check) { register }`, or `check ? x.dispose() : register`. Calls such as `signal.throwIfAborted()` also count,
 * because they throw once the operation was cancelled. Awaiting `raceCancellationError(...)` does not: it can resolve
 * after the token was cancelled.
 *
 * `this._registerOrDispose(x)` and `store.addOrDispose(x)` are not registrations: they dispose `x` if the owner was
 * already disposed.
 *
 * The analysis is syntactic and per function: nested functions are analyzed on their own.
 */
export default new class NoRegisterAfterAwait implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			registerAfterAwait: 'Disposable registered with \'{{name}}\' after \'await\' without re-checking disposal. If the object was disposed while awaiting, the registered value leaks. Use `this._registerOrDispose(x)` or `store.addOrDispose(x)`, or, if more work follows, check `this._store.isDisposed` (or a cancellation token or abort signal) after the await, dispose what was created, and return.',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const analyzer = new Analyzer(context);
		const check = (node: eslint.Rule.Node) => analyzer.checkFunction(node as unknown as FunctionNode);
		return {
			'FunctionDeclaration[async=true]': check,
			'FunctionExpression[async=true]': check,
			'ArrowFunctionExpression[async=true]': check,
		};
	}
};

type FunctionNode = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

/**
 * Whether an `await` may have happened since the function started or since the last disposal check, on some path
 * that reaches this point. `undefined` means the point is unreachable.
 */
type State = boolean | undefined;

/** How control leaves a statement, and the state on each of those paths. */
interface Completion {
	readonly normal: State;
	readonly breaks: State;
	readonly continues: State;
}

/** What a condition proves about the object being alive (not disposed or cancelled). */
interface Guard {
	readonly aliveIfTrue: boolean;
	readonly aliveIfFalse: boolean;
}

/** How a field of the class manages disposables, if at all. */
type FieldKind = 'store' | 'mutable' | 'map' | 'other';

const noGuard: Guard = { aliveIfTrue: false, aliveIfFalse: false };
const unreachable: Completion = { normal: undefined, breaks: undefined, continues: undefined };

/** Member and variable names, without leading `_`, that tell whether an object was disposed or an operation cancelled. */
const interruptionCheckName = /^(?:(?:is|was)?disposed|(?:is)?disposing|isCancellationRequested|(?:is)?aborted|(?:is)?cancell?ed)$/i;

/** Functions that throw once the object was disposed or the operation cancelled, such as `signal.throwIfAborted()`. */
const throwingCheckName = /^throwIf(?:Aborted|Cancell?ed|CancellationRequested|Disposed)$/;

const fieldKindsByType = new Map<string, FieldKind>([
	['DisposableStore', 'store'],
	['DisposableSet', 'store'],
	['MutableDisposable', 'mutable'],
	['MandatoryMutableDisposable', 'mutable'],
	['DisposableMap', 'map'],
	['DisposableResourceMap', 'map'],
]);

/** Children that hold types or metadata rather than code that runs. */
const ignoredKeys = new Set(['parent', 'typeAnnotation', 'typeArguments', 'typeParameters', 'returnType', 'decorators']);

function join(a: State, b: State): State {
	if (a === undefined) {
		return b;
	}
	if (b === undefined) {
		return a;
	}
	return a || b;
}

/** The state after a check proved the object alive. */
function checked(state: State): State {
	return state === undefined ? undefined : false;
}

/** The state after an `await`. */
function awaited(state: State): State {
	return state === undefined ? undefined : true;
}

function normal(state: State): Completion {
	return { normal: state, breaks: undefined, continues: undefined };
}

function isNode(value: unknown): value is TSESTree.Node {
	return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function isFunction(node: TSESTree.Node): boolean {
	return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration'
		|| node.type === 'ClassExpression' || node.type === 'ClassDeclaration';
}

function unwrap(node: TSESTree.Node): TSESTree.Node {
	while (node.type === 'ChainExpression' || node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression'
		|| node.type === 'TSSatisfiesExpression' || node.type === 'TSTypeAssertion') {
		node = node.expression;
	}
	return node;
}

function memberName(node: TSESTree.Node): string | undefined {
	if (node.type === 'Identifier') {
		return node.name;
	}
	if (node.type === 'PrivateIdentifier') {
		return `#${node.name}`;
	}
	return undefined;
}

/** The field name in `this.<field>`. */
function thisFieldName(node: TSESTree.Node): string | undefined {
	node = unwrap(node);
	if (node.type === 'MemberExpression' && !node.computed && unwrap(node.object).type === 'ThisExpression') {
		return memberName(node.property);
	}
	return undefined;
}

function looksLikeStore(field: string): boolean {
	const name = field.replace(/^[#_]+/, '');
	return /^(?:store|disposables|toDispose)$/i.test(name) || /(?:Disposables|Store|ToDispose)$/.test(name);
}

class Analyzer {

	private readonly context: eslint.Rule.RuleContext;
	private readonly visitorKeys: eslint.SourceCode.VisitorKeys;
	private readonly awaits = new WeakMap<TSESTree.Node, boolean>();
	private readonly fieldKinds = new WeakMap<TSESTree.ClassBody, Map<string, FieldKind>>();

	constructor(context: eslint.Rule.RuleContext) {
		this.context = context;
		this.visitorKeys = context.sourceCode.visitorKeys;
	}

	checkFunction(fn: FunctionNode): void {
		const classBody = findEnclosingClassBody(fn);
		const reported = new Set<TSESTree.Node>();

		const report = (node: TSESTree.Node, name: string) => {
			if (!reported.has(node)) {
				reported.add(node);
				this.context.report({ node: node as unknown as ESTree.Node, messageId: 'registerAfterAwait', data: { name } });
			}
		};

		const fieldKind = (field: string): FieldKind => {
			const declared = classBody && this.getFieldKinds(classBody).get(field);
			if (declared) {
				return declared;
			}
			return looksLikeStore(field) ? 'store' : 'other';
		};

		const registrationCall = (node: TSESTree.CallExpression): string | undefined => {
			const callee = unwrap(node.callee);
			if (callee.type !== 'MemberExpression' || callee.computed) {
				return undefined;
			}
			const method = memberName(callee.property);
			if (unwrap(callee.object).type === 'ThisExpression') {
				return method === '_register' ? 'this._register' : undefined;
			}
			const field = thisFieldName(callee.object);
			if (!field) {
				return undefined;
			}
			const kind = fieldKind(field);
			if ((method === 'add' && kind === 'store') || (method === 'set' && kind === 'map')) {
				return `this.${field}.${method}`;
			}
			return undefined;
		};

		const registrationAssignment = (node: TSESTree.AssignmentExpression): string | undefined => {
			const left = unwrap(node.left);
			const right = unwrap(node.right);
			if (node.operator !== '=' || left.type !== 'MemberExpression' || left.computed || memberName(left.property) !== 'value') {
				return undefined;
			}
			if ((right.type === 'Identifier' && right.name === 'undefined') || (right.type === 'Literal' && right.value === null)) {
				return undefined; // clearing
			}
			const field = thisFieldName(left.object);
			return field && fieldKind(field) === 'mutable' ? `this.${field}.value` : undefined;
		};

		const statement = (node: TSESTree.Node, state: State): Completion => {
			if (state === undefined) {
				return unreachable;
			}
			switch (node.type) {
				case 'BlockStatement':
				case 'StaticBlock':
					return statements(node.body, state);
				case 'ExpressionStatement':
					return normal(expression(node.expression, state));
				case 'VariableDeclaration': {
					let current: State = state;
					for (const declarator of node.declarations) {
						if (declarator.init) {
							current = expression(declarator.init, current);
						}
					}
					return normal(current);
				}
				case 'ReturnStatement':
				case 'ThrowStatement':
					if (node.argument) {
						expression(node.argument, state);
					}
					return unreachable;
				case 'BreakStatement':
					return { normal: undefined, breaks: state, continues: undefined };
				case 'ContinueStatement':
					return { normal: undefined, breaks: undefined, continues: state };
				case 'IfStatement': {
					const afterTest = expression(node.test, state);
					const guard = this.guardOf(node.test);
					const consequent = statement(node.consequent, guard.aliveIfTrue ? checked(afterTest) : afterTest);
					const alternateState = guard.aliveIfFalse ? checked(afterTest) : afterTest;
					const alternate = node.alternate ? statement(node.alternate, alternateState) : normal(alternateState);
					return {
						normal: join(consequent.normal, alternate.normal),
						breaks: join(consequent.breaks, alternate.breaks),
						continues: join(consequent.continues, alternate.continues),
					};
				}
				case 'WhileStatement':
					return loop(state, head => {
						const afterTest = expression(node.test, head);
						const guard = this.guardOf(node.test);
						const body = statement(node.body, guard.aliveIfTrue ? checked(afterTest) : afterTest);
						return { exit: guard.aliveIfFalse ? checked(afterTest) : afterTest, back: join(body.normal, body.continues), breaks: body.breaks };
					});
				case 'DoWhileStatement':
					return loop(state, head => {
						const body = statement(node.body, head);
						const afterTest = expression(node.test, join(body.normal, body.continues));
						const guard = this.guardOf(node.test);
						return { exit: guard.aliveIfFalse ? checked(afterTest) : afterTest, back: guard.aliveIfTrue ? checked(afterTest) : afterTest, breaks: body.breaks };
					});
				case 'ForStatement': {
					let entry: State = state;
					if (node.init) {
						entry = node.init.type === 'VariableDeclaration' ? statement(node.init, entry).normal : expression(node.init, entry);
					}
					return loop(entry, head => {
						const afterTest = node.test ? expression(node.test, head) : head;
						const guard = node.test ? this.guardOf(node.test) : noGuard;
						const body = statement(node.body, guard.aliveIfTrue ? checked(afterTest) : afterTest);
						let back = join(body.normal, body.continues);
						if (node.update) {
							back = expression(node.update, back);
						}
						const exit = node.test ? (guard.aliveIfFalse ? checked(afterTest) : afterTest) : undefined;
						return { exit, back, breaks: body.breaks };
					});
				}
				case 'ForInStatement':
				case 'ForOfStatement': {
					const afterRight = expression(node.right, state);
					if (node.type === 'ForOfStatement' && node.await) {
						// Every iteration, and leaving the loop, waits for the iterator.
						const body = statement(node.body, awaited(afterRight));
						return normal(join(awaited(afterRight), body.breaks));
					}
					return loop(afterRight, head => {
						const body = statement(node.body, head);
						return { exit: head, back: join(body.normal, body.continues), breaks: body.breaks };
					});
				}
				case 'SwitchStatement': {
					const afterDiscriminant = expression(node.discriminant, state);
					let fallthrough: State = undefined;
					let breaks: State = undefined;
					let continues: State = undefined;
					for (const switchCase of node.cases) {
						const entry = switchCase.test ? expression(switchCase.test, afterDiscriminant) : afterDiscriminant;
						const body = statements(switchCase.consequent, join(entry, fallthrough));
						fallthrough = body.normal;
						breaks = join(breaks, body.breaks);
						continues = join(continues, body.continues);
					}
					const hasDefault = node.cases.some(switchCase => !switchCase.test);
					return { normal: join(join(fallthrough, breaks), hasDefault ? undefined : afterDiscriminant), breaks: undefined, continues };
				}
				case 'TryStatement': {
					const block = statement(node.block, state);
					// An exception can leave the try block before or after any of its awaits.
					const thrown = state || this.containsAwait(node.block);
					let completed = block.normal;
					let breaks = block.breaks;
					let continues = block.continues;
					let escaping: State = thrown;
					if (node.handler) {
						const handler = statement(node.handler.body, thrown);
						completed = join(completed, handler.normal);
						breaks = join(breaks, handler.breaks);
						continues = join(continues, handler.continues);
						escaping = thrown || this.containsAwait(node.handler.body);
					}
					if (!node.finalizer) {
						return { normal: completed, breaks, continues };
					}
					// Check the finally block for every way of entering it, but continue with the state of normal completion.
					const viaFinalizer = statement(node.finalizer, join(join(completed, escaping), join(breaks, continues)));
					const finalizer = statement(node.finalizer, completed);
					if (this.containsAwait(node.finalizer)) {
						breaks = awaited(breaks);
						continues = awaited(continues);
					}
					// A `break` or `continue` in the finally block can leave it from any way of entering it.
					return { normal: finalizer.normal, breaks: join(breaks, viaFinalizer.breaks), continues: join(continues, viaFinalizer.continues) };
				}
				case 'LabeledStatement': {
					const body = statement(node.body, state);
					return { normal: join(body.normal, body.breaks), breaks: body.breaks, continues: body.continues };
				}
				case 'FunctionDeclaration':
				case 'ClassDeclaration':
					return normal(state);
				default:
					if (node.type.startsWith('TS')) {
						return normal(state); // type declarations
					}
					return normal(expression(node, state));
			}
		};

		const statements = (nodes: readonly TSESTree.Node[], state: State): Completion => {
			let current: State = state;
			let breaks: State = undefined;
			let continues: State = undefined;
			for (const node of nodes) {
				const completion = statement(node, current);
				breaks = join(breaks, completion.breaks);
				continues = join(continues, completion.continues);
				current = completion.normal;
			}
			return { normal: current, breaks, continues };
		};

		/**
		 * Runs a loop body once, and again if the back edge brings an await into the next iteration.
		 * The state is a single boolean, so the second run is the fixed point.
		 */
		const loop = (entry: State, iterate: (head: State) => { exit: State; back: State; breaks: State }): Completion => {
			let result = iterate(entry);
			const head = join(entry, result.back);
			if (head !== entry) {
				result = iterate(head);
			}
			return normal(join(result.exit, result.breaks));
		};

		const expression = (node: TSESTree.Node, state: State): State => {
			if (state === undefined || isFunction(node)) {
				return state;
			}
			switch (node.type) {
				case 'AwaitExpression':
					return awaited(expression(node.argument, state));
				case 'ConditionalExpression': {
					const afterTest = expression(node.test, state);
					const guard = this.guardOf(node.test);
					return join(
						expression(node.consequent, guard.aliveIfTrue ? checked(afterTest) : afterTest),
						expression(node.alternate, guard.aliveIfFalse ? checked(afterTest) : afterTest));
				}
				case 'LogicalExpression': {
					const afterLeft = expression(node.left, state);
					const guard = node.operator === '??' ? noGuard : this.guardOf(node.left);
					const alive = node.operator === '&&' ? guard.aliveIfTrue : guard.aliveIfFalse;
					return join(afterLeft, expression(node.right, alive ? checked(afterLeft) : afterLeft));
				}
				case 'CallExpression': {
					let current = expression(node.callee, state);
					for (const argument of node.arguments) {
						current = expression(argument, current);
					}
					const name = current ? registrationCall(node) : undefined;
					if (name) {
						report(node, name);
					}
					return isThrowingCheck(node) ? checked(current) : current;
				}
				case 'AssignmentExpression': {
					const current = expression(node.right, expression(node.left, state));
					const name = current ? registrationAssignment(node) : undefined;
					if (name) {
						report(node, name);
					}
					return current;
				}
				default:
					return children(node, state);
			}
		};

		/** Walks the children of a node in evaluation (source) order. */
		const children = (node: TSESTree.Node, state: State): State => {
			let current = state;
			for (const key of this.visitorKeys[node.type] ?? []) {
				if (ignoredKeys.has(key)) {
					continue;
				}
				const value = (node as unknown as Record<string, unknown>)[key];
				if (Array.isArray(value)) {
					for (const child of value) {
						if (isNode(child)) {
							current = expression(child, current);
						}
					}
				} else if (isNode(value)) {
					current = expression(value, current);
				}
			}
			return current;
		};

		if (fn.body.type === 'BlockStatement') {
			statement(fn.body, false);
		} else {
			expression(fn.body, false);
		}
	}

	/** What a condition proves about the object being alive. */
	private guardOf(node: TSESTree.Node): Guard {
		node = unwrap(node);
		if (this.containsAwait(node)) {
			return noGuard; // the check may run before the await
		}
		if (node.type === 'UnaryExpression' && node.operator === '!') {
			const guard = this.guardOf(node.argument);
			return { aliveIfTrue: guard.aliveIfFalse, aliveIfFalse: guard.aliveIfTrue };
		}
		if (node.type === 'LogicalExpression' && node.operator !== '??') {
			const left = this.guardOf(node.left);
			const right = this.guardOf(node.right);
			return node.operator === '||'
				? { aliveIfTrue: left.aliveIfTrue && right.aliveIfTrue, aliveIfFalse: left.aliveIfFalse || right.aliveIfFalse }
				: { aliveIfTrue: left.aliveIfTrue || right.aliveIfTrue, aliveIfFalse: left.aliveIfFalse && right.aliveIfFalse };
		}
		return isInterruptionCheck(node) ? { aliveIfTrue: false, aliveIfFalse: true } : noGuard;
	}

	/** Whether a node contains an `await`, outside of nested functions. */
	private containsAwait(node: TSESTree.Node): boolean {
		let result = this.awaits.get(node);
		if (result === undefined) {
			result = false;
			if (node.type === 'AwaitExpression' || (node.type === 'ForOfStatement' && node.await)) {
				result = true;
			} else if (!isFunction(node)) {
				for (const key of this.visitorKeys[node.type] ?? []) {
					if (ignoredKeys.has(key)) {
						continue;
					}
					const value = (node as unknown as Record<string, unknown>)[key];
					const nodes = Array.isArray(value) ? value : [value];
					if (nodes.some(child => isNode(child) && this.containsAwait(child))) {
						result = true;
						break;
					}
				}
			}
			this.awaits.set(node, result);
		}
		return result;
	}

	/** The kinds of the fields that the class declares or assigns as disposable containers. */
	private getFieldKinds(classBody: TSESTree.ClassBody): Map<string, FieldKind> {
		let kinds = this.fieldKinds.get(classBody);
		if (kinds) {
			return kinds;
		}
		const result = new Map<string, FieldKind>();
		kinds = result;
		const declare = (field: string | undefined, kind: FieldKind | undefined) => {
			if (field && kind && (kind !== 'other' || !result.has(field))) {
				result.set(field, kind);
			}
		};
		for (const member of classBody.body) {
			if ((member.type === 'PropertyDefinition' || member.type === 'AccessorProperty') && !member.computed) {
				declare(memberName(member.key), kindOfDeclaration(member.typeAnnotation, member.value));
			} else if (member.type === 'MethodDefinition' && member.kind === 'constructor') {
				for (const param of member.value.params) {
					if (param.type === 'TSParameterProperty' && param.parameter.type === 'Identifier') {
						declare(param.parameter.name, kindOfDeclaration(param.parameter.typeAnnotation, null));
					}
				}
			}
		}
		// Fields assigned anywhere in the class, such as `this._store = new DisposableStore()` in the constructor.
		const visit = (node: TSESTree.Node) => {
			if (node.type === 'AssignmentExpression' && node.operator === '=') {
				const kind = kindOfValue(node.right);
				if (kind && kind !== 'other') {
					declare(thisFieldName(node.left), kind);
				}
			}
			for (const key of this.visitorKeys[node.type] ?? []) {
				if (ignoredKeys.has(key)) {
					continue;
				}
				const value = (node as unknown as Record<string, unknown>)[key];
				for (const child of Array.isArray(value) ? value : [value]) {
					if (isNode(child) && child.type !== 'ClassBody') {
						visit(child);
					}
				}
			}
		};
		classBody.body.forEach(visit);
		this.fieldKinds.set(classBody, kinds);
		return kinds;
	}
}

function findEnclosingClassBody(node: TSESTree.Node): TSESTree.ClassBody | undefined {
	for (let current = node.parent; current; current = current.parent) {
		if (current.type === 'ClassBody') {
			return current;
		}
	}
	return undefined;
}

/**
 * Whether a condition reads disposal or cancellation state: `this._store.isDisposed`, `this._isDisposed`,
 * `model.isDisposed()`, `token.isCancellationRequested`, `signal.aborted`, or a variable such as `disposed`.
 */
function isInterruptionCheck(node: TSESTree.Node): boolean {
	node = unwrap(node);
	if (node.type === 'CallExpression' && node.arguments.length === 0) {
		node = unwrap(node.callee);
	}
	const name = node.type === 'MemberExpression' && !node.computed ? memberName(node.property) : memberName(node);
	return !!name && interruptionCheckName.test(name.replace(/^[#_]+/, ''));
}

/** Whether a call throws when the object was disposed or the operation cancelled. */
function isThrowingCheck(node: TSESTree.CallExpression): boolean {
	const callee = unwrap(node.callee);
	const name = callee.type === 'MemberExpression' && !callee.computed ? memberName(callee.property) : memberName(callee);
	return !!name && throwingCheckName.test(name);
}

function kindOfDeclaration(annotation: TSESTree.TSTypeAnnotation | undefined, value: TSESTree.Expression | null): FieldKind | undefined {
	const fromValue = value ? kindOfValue(value) : undefined;
	const fromType = annotation ? kindOfType(annotation.typeAnnotation) : undefined;
	if (fromValue && fromValue !== 'other') {
		return fromValue;
	}
	return fromType ?? fromValue;
}

/** The kind of `new DisposableStore()`, also when wrapped as in `this._register(new DisposableStore())`. */
function kindOfValue(node: TSESTree.Node): FieldKind | undefined {
	node = unwrap(node);
	if (node.type === 'CallExpression' && node.arguments.length === 1) {
		return kindOfValue(node.arguments[0]);
	}
	if (node.type === 'NewExpression') {
		return node.callee.type === 'Identifier' ? fieldKindsByType.get(node.callee.name) ?? 'other' : 'other';
	}
	if (node.type === 'ArrayExpression' || node.type === 'ObjectExpression' || node.type === 'Literal' || node.type === 'TemplateLiteral') {
		return 'other';
	}
	return undefined;
}

function kindOfType(node: TSESTree.TypeNode): FieldKind {
	if (node.type === 'TSTypeReference' && node.typeName.type === 'Identifier') {
		return fieldKindsByType.get(node.typeName.name) ?? 'other';
	}
	if (node.type === 'TSUnionType') {
		const kinds = node.types.map(kindOfType);
		return kinds.find(kind => kind !== 'other') ?? 'other';
	}
	return 'other';
}
