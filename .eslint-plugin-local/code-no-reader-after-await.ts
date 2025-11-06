/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/utils';
import * as eslint from 'eslint';

export = new class NoReaderAfterAwait implements eslint.Rule.RuleModule {
	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			'CallExpression': (node: any) => {
				const callExpression = node as TSESTree.CallExpression;

				if (!isFunctionWithReader(callExpression.callee)) {
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

				checkFunctionForAwaitBeforeReader(functionArg, readerName, context);
			}
		};
	}
};

function checkFunctionForAwaitBeforeReader(
	fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
	readerName: string,
	context: eslint.Rule.RuleContext
) {
	const awaitPositions: { line: number; column: number }[] = [];
	const visited = new Set<TSESTree.Node>();

	function collectPositions(node: TSESTree.Node) {
		if (visited.has(node)) {
			return;
		}
		visited.add(node);

		if (node.type === 'AwaitExpression') {
			awaitPositions.push({
				line: node.loc?.start.line || 0,
				column: node.loc?.start.column || 0
			});
		} else if (node.type === 'CallExpression' && isReaderMethodCall(node, readerName)) {
			if (awaitPositions.length > 0) {
				const methodName = getMethodName(node);
				context.report({
					node: node,
					message: `Reader method '${methodName}' should not be called after 'await'. The reader becomes invalid after async operations.`
				});
			}
		}

		// Safely traverse known node types only
		switch (node.type) {
			case 'BlockStatement':
				node.body.forEach(stmt => collectPositions(stmt));
				break;
			case 'ExpressionStatement':
				collectPositions(node.expression);
				break;
			case 'VariableDeclaration':
				node.declarations.forEach(decl => {
					if (decl.init) { collectPositions(decl.init); }
				});
				break;
			case 'AwaitExpression':
				if (node.argument) { collectPositions(node.argument); }
				break;
			case 'CallExpression':
				node.arguments.forEach(arg => collectPositions(arg));
				break;
			case 'IfStatement':
				collectPositions(node.test);
				collectPositions(node.consequent);
				if (node.alternate) { collectPositions(node.alternate); }
				break;
			case 'TryStatement':
				collectPositions(node.block);
				if (node.handler) { collectPositions(node.handler.body); }
				if (node.finalizer) { collectPositions(node.finalizer); }
				break;
			case 'ReturnStatement':
				if (node.argument) { collectPositions(node.argument); }
				break;
			case 'BinaryExpression':
			case 'LogicalExpression':
				collectPositions(node.left);
				collectPositions(node.right);
				break;
			case 'MemberExpression':
				collectPositions(node.object);
				if (node.computed) { collectPositions(node.property); }
				break;
			case 'AssignmentExpression':
				collectPositions(node.left);
				collectPositions(node.right);
				break;
		}
	}

	if (fn.body) {
		collectPositions(fn.body);
	}
}

function getMethodName(callExpression: TSESTree.CallExpression): string {
	if (callExpression.callee.type === 'MemberExpression' &&
		callExpression.callee.property.type === 'Identifier') {
		return callExpression.callee.property.name;
	}
	return 'read';
}

function isReaderMethodCall(node: TSESTree.CallExpression, readerName: string): boolean {
	if (node.callee.type === 'MemberExpression') {
		// Pattern 1: reader.read() or reader.readObservable()
		if (node.callee.object.type === 'Identifier' &&
			node.callee.object.name === readerName &&
			node.callee.property.type === 'Identifier') {
			return ['read', 'readObservable'].includes(node.callee.property.name);
		}

		// Pattern 2: observable.read(reader) or observable.readObservable(reader)
		if (node.callee.property.type === 'Identifier' &&
			['read', 'readObservable'].includes(node.callee.property.name)) {
			// Check if the reader is passed as the first argument
			return node.arguments.length > 0 &&
				node.arguments[0].type === 'Identifier' &&
				node.arguments[0].name === readerName;
		}
	}
	return false;
}

const readerFunctions = new Set(['derived', 'autorun', 'autorunOpts', 'autorunHandleChanges', 'autorunSelfDisposable']);

function getReaderParameterName(fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): string | null {
	if (fn.params.length === 0) {
		return null;
	}
	const firstParam = fn.params[0];
	if (firstParam.type === 'Identifier') {
		return firstParam.name;
	}
	return null;
}

function isFunctionWithReader(callee: TSESTree.Node): boolean {
	if (callee.type === 'Identifier') {
		return readerFunctions.has(callee.name);
	}
	return false;
}
