/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

type VisitorKeys = Context['sourceCode']['visitorKeys'];

export default new class NoObservableGetInReactiveContext implements CreateRule {
	meta: RuleMeta = {
		type: 'problem',
		docs: {
			description: 'Disallow calling .get() on observables inside reactive contexts in favor of .read(undefined).',
		},
		fixable: 'code',
	};

	create(context: Context): Visitor {
		return {
			'CallExpression': (callExpression: ESTree.CallExpression) => {

				if (!isReactiveFunctionWithReader(callExpression.callee)) {
					return;
				}

				const functionArg = callExpression.arguments.find(arg =>
					arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression'
				) as ESTree.ArrowFunctionExpression | ESTree.Function | undefined;

				if (!functionArg) {
					return;
				}

				const readerName = getReaderParameterName(functionArg);
				if (!readerName) {
					return;
				}

				checkFunctionForObservableGetCalls(functionArg, readerName, context);
			}
		};
	}
};

function checkFunctionForObservableGetCalls(
	fn: ESTree.ArrowFunctionExpression | ESTree.Function,
	readerName: string,
	context: Context
) {
	const visited = new Set<ESTree.Node>();

	function traverse(node: ESTree.Node) {
		if (visited.has(node)) {
			return;
		}
		visited.add(node);

		if (node.type === 'CallExpression' && isObservableGetCall(node)) {
			// Flag .get() calls since we're always in a reactive context here
			context.report({
				node: node,
				message: `Observable '.get()' should not be used in reactive context. Use '.read(${readerName})' instead to properly track dependencies or '.read(undefined)' to be explicit about an untracked read.`,
				fix: (fixer) => {
					const memberExpression = node.callee as ESTree.MemberExpression;
					return fixer.replaceText(node, `${context.sourceCode.getText(memberExpression.object)}.read(undefined)`);
				}
			});
		}

		walkChildren(node, context.sourceCode.visitorKeys, traverse);
	}

	if (fn.body) {
		traverse(fn.body);
	}
}

function isObservableGetCall(node: ESTree.CallExpression): boolean {
	// Look for pattern: something.get()
	if (node.callee.type === 'MemberExpression' &&
		node.callee.property.type === 'Identifier' &&
		node.callee.property.name === 'get' &&
		node.arguments.length === 0) {

		// This is a .get() call with no arguments, which is likely an observable
		return true;
	}
	return false;
}

const reactiveFunctions = new Set([
	'derived',
	'derivedDisposable',
	'derivedHandleChanges',
	'derivedOpts',
	'derivedWithSetter',
	'derivedWithStore',
	'autorun',
	'autorunOpts',
	'autorunHandleChanges',
	'autorunSelfDisposable',
	'autorunDelta',
	'autorunWithStore',
	'autorunWithStoreHandleChanges',
	'autorunIterableDelta'
]);

function getReaderParameterName(fn: ESTree.ArrowFunctionExpression | ESTree.Function): string | null {
	if (fn.params.length === 0) {
		return null;
	}
	const firstParam = fn.params[0];
	if (firstParam.type === 'Identifier') {
		// Accept any parameter name as a potential reader parameter
		// since reactive functions should always have the reader as the first parameter
		return firstParam.name;
	}
	return null;
}

function isReactiveFunctionWithReader(callee: ESTree.Node): boolean {
	if (callee.type === 'Identifier') {
		return reactiveFunctions.has(callee.name);
	}
	return false;
}

function walkChildren(node: ESTree.Node, visitorKeys: VisitorKeys, cb: (child: ESTree.Node) => void) {
	const keys = getEcmaScriptKeys(visitorKeys, node.type);
	for (const key of keys) {
		const child = (node as unknown as Record<string, unknown>)[key];
		if (Array.isArray(child)) {
			for (const item of child) {
				if (isNode(item)) {
					cb(item);
				}
			}
		} else if (isNode(child)) {
			cb(child);
		}
	}
}

/**
 * This rule used to traverse with the keys of `eslint-visitor-keys`, which has no keys for TypeScript-only nodes and
 * properties. Skip those to traverse the same children, and so report the same problems.
 */
const typeScriptOnlyKeys = new Set(['decorators', 'typeAnnotation', 'typeParameters', 'returnType', 'typeArguments', 'superTypeArguments', 'implements']);
const typesUnknownToESLint = new Set(['AccessorProperty', 'Decorator', 'ParenthesizedExpression', 'V8IntrinsicExpression']);
const ecmaScriptKeysCache = new Map<string, readonly string[]>();

function getEcmaScriptKeys(visitorKeys: VisitorKeys, type: string): readonly string[] {
	let keys = ecmaScriptKeysCache.get(type);
	if (!keys) {
		keys = type.startsWith('TS') || typesUnknownToESLint.has(type) ? [] : (visitorKeys[type] ?? []).filter(key => !typeScriptOnlyKeys.has(key));
		ecmaScriptKeysCache.set(type, keys);
	}
	return keys;
}

function isNode(value: unknown): value is ESTree.Node {
	return !!value && typeof value === 'object' && !!(value as { type?: unknown }).type;
}
