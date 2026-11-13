/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Visitor } from '@oxlint/plugins';

function isCallExpression(node: ESTree.Node): node is ESTree.CallExpression {
	return node.type === 'CallExpression';
}

function isFunctionExpression(node: ESTree.Node): node is ESTree.Function | ESTree.ArrowFunctionExpression {
	return node.type.includes('FunctionExpression');
}

export default new class NoAsyncSuite implements CreateRule {

	create(context: Context): Visitor {
		function hasAsyncSuite(tsNode: ESTree.Node) {
			if (isCallExpression(tsNode) && tsNode.arguments.length >= 2 && isFunctionExpression(tsNode.arguments[1]) && tsNode.arguments[1].async) {
				return context.report({
					node: tsNode,
					message: 'suite factory function should never be async'
				});
			}
		}

		return {
			['CallExpression[callee.name=/suite$/][arguments]']: hasAsyncSuite,
		};
	}
};
