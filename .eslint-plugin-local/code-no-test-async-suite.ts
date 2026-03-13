/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { TSESTree } from '@typescript-eslint/utils';

function isCallExpression(node: TSESTree.Node): node is TSESTree.CallExpression {
	return node.type === 'CallExpression';
}

function isFunctionExpression(node: TSESTree.Node): node is TSESTree.FunctionExpression {
	return node.type.includes('FunctionExpression');
}

export default new class NoAsyncSuite implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		function hasAsyncSuite(node: ESTree.Node) {
			const tsNode = node as TSESTree.Node;
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
