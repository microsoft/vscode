/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/experimental-utils';
import * as eslint from 'eslint';

function isCallExpression(node: TSESTree.Node): node is TSESTree.CallExpression {
	return node.type === 'CallExpression';
}

function isFunctionExpression(node: TSESTree.Node): node is TSESTree.FunctionExpression {
	return node.type.includes('FunctionExpression');
}

export = new class NoAsyncSuite implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		function hasAsyncSuite(node: any) {
			if (isCallExpression(node) && node.arguments.length >= 2 && isFunctionExpression(node.arguments[1]) && node.arguments[1].async) {
				return context.report({
					node: node as any,
					message: 'suite factory function should never be async'
				});
			}
		}

		return {
			['CallExpression[callee.name=/suite$/][arguments]']: hasAsyncSuite,
		};
	}
};
