/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';
import * as ESTree from 'estree';
import * as visitorKeys from 'eslint-visitor-keys';

export = new class NoObservableGetInReactiveContext implements eslint.Rule.RuleModule {
	meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		docs: {
			description: 'Disallow calling .get() on observables inside reactive contexts in favor of .read(undefined).',
		},
		fixable: 'code',
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			'CallExpression': (node: any) => {
				const callExpression = node as TSESTree.CallExpression;

				if (!isReactiveFunctionWithReader(callExpression.callee)) {
					return;
				}

				const functionArg = callExpression.arguments.find(arg =>
					arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression'
				) as TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | undefined;

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
	fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
	readerName: string,
	context: eslint.Rule.RuleContext
) {
	const visited = new Set<TSESTree.Node>();

	function traverse(node: TSESTree.Node) {
		if (visited.has(node)) {
			return;
		}
		visited.add(node);

		if (node.type === 'CallExpression' && isObservableGetCall(node)) {
			// Flag .get() calls since we're always in a reactive context here
			context.report({
				node: node as any as ESTree.Node,
				message: `Observable '.get()' should not be used in reactive context. Use '.read(${readerName})' instead to properly track dependencies or '.read(undefined)' to be explicit about an untracked read.`,
				fix: (fixer) => {
					const memberExpression = node.callee as TSESTree.MemberExpression;
					return fixer.replaceText(node as any, `${context.getSourceCode().getText(memberExpression.object as any)}.read(undefined)`);
				}
			});
		}

		walkChildren(node, traverse);
	}

	if (fn.body) {
		traverse(fn.body);
	}
}

function isObservableGetCall(node: TSESTree.CallExpression): boolean {
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

function getReaderParameterName(fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): string | null {
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

function isReactiveFunctionWithReader(callee: TSESTree.Node): boolean {
	if (callee.type === 'Identifier') {
		return reactiveFunctions.has(callee.name);
	}
	return false;
}

function walkChildren(node: TSESTree.Node, cb: (child: TSESTree.Node) => void) {
	const keys = visitorKeys.KEYS[node.type] || [];
	for (const key of keys) {
		const child = (node as any)[key];
		if (Array.isArray(child)) {
			for (const item of child) {
				if (item && typeof item === 'object' && item.type) {
					cb(item);
				}
			}
		} else if (child && typeof child === 'object' && child.type) {
			cb(child);
		}
	}
}
