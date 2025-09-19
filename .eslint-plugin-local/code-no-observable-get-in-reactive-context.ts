/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';
import * as ESTree from 'estree';

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
				message: `Observable '.get()' should not be used in reactive context. Use '.read(${readerName})' instead to properly track dependencies or '.read(undefined)' to be explicit about a untracked read.`,
				fix: (fixer) => {
					const memberExpression = node.callee as TSESTree.MemberExpression;
					return fixer.replaceText(node as any, `${context.getSourceCode().getText(memberExpression.object as any)}.read(undefined)`);
				}
			});
		}

		// Traverse child nodes
		switch (node.type) {
			case 'BlockStatement':
				node.body.forEach(stmt => traverse(stmt));
				break;
			case 'ExpressionStatement':
				traverse(node.expression);
				break;
			case 'VariableDeclaration':
				node.declarations.forEach(decl => {
					if (decl.init) { traverse(decl.init); }
				});
				break;
			case 'CallExpression':
				node.arguments.forEach(arg => traverse(arg));
				if (node.callee) { traverse(node.callee); }
				break;
			case 'IfStatement':
				traverse(node.test);
				traverse(node.consequent);
				if (node.alternate) { traverse(node.alternate); }
				break;
			case 'TryStatement':
				traverse(node.block);
				if (node.handler) { traverse(node.handler.body); }
				if (node.finalizer) { traverse(node.finalizer); }
				break;
			case 'ReturnStatement':
				if (node.argument) { traverse(node.argument); }
				break;
			case 'BinaryExpression':
			case 'LogicalExpression':
				traverse(node.left);
				traverse(node.right);
				break;
			case 'MemberExpression':
				traverse(node.object);
				if (node.computed && node.property) { traverse(node.property); }
				break;
			case 'AssignmentExpression':
				traverse(node.left);
				traverse(node.right);
				break;
			case 'ConditionalExpression':
				traverse(node.test);
				traverse(node.consequent);
				traverse(node.alternate);
				break;
			case 'ArrayExpression':
				node.elements.forEach(elem => { if (elem) { traverse(elem); } });
				break;
			case 'ObjectExpression':
				node.properties.forEach(prop => {
					if (prop.type === 'Property') {
						if (prop.key) { traverse(prop.key); }
						if (prop.value) { traverse(prop.value); }
					}
				});
				break;
			case 'ForStatement':
				if (node.init) { traverse(node.init); }
				if (node.test) { traverse(node.test); }
				if (node.update) { traverse(node.update); }
				traverse(node.body);
				break;
			case 'WhileStatement':
				traverse(node.test);
				traverse(node.body);
				break;
			case 'UpdateExpression':
				traverse(node.argument);
				break;
			case 'UnaryExpression':
				traverse(node.argument);
				break;
			case 'ArrowFunctionExpression':
			case 'FunctionExpression':
				// Traverse nested functions since they can access the reader parameter from closure
				if (node.body) { traverse(node.body); }
				break;
			case 'FunctionDeclaration':
				// Function declarations within reactive context should also be checked
				if (node.body) { traverse(node.body); }
				break;
		}
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
