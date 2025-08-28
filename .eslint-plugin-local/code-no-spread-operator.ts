/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

export = new class NoSpreadOperator implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'suggestion',
		docs: {
			description: 'Disallow spread operator for performance reasons',
			category: 'Best Practices',
			recommended: false,
		},
		messages: {
			noSpreadInArray: 'Avoid using spread operator in arrays. Consider using pushMany() from vs/base/common/arrays.ts, splice(), or Array.concat() instead for better performance.',
			noSpreadInObject: 'Avoid using spread operator in objects. Consider using object assignment or Object.assign() instead for better performance.',
			noSpreadInCall: 'Avoid using spread operator in function calls. Consider using apply() or refactoring the function to accept arrays instead for better performance.',
		},
		schema: []
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			// Detect spread in array literals: [...array]
			'ArrayExpression > SpreadElement'(node: TSESTree.SpreadElement): void {
				context.report({
					node: node as any,
					messageId: 'noSpreadInArray'
				});
			},

			// Detect spread in object literals: {...object}
			'ObjectExpression > SpreadElement'(node: TSESTree.SpreadElement): void {
				context.report({
					node: node as any,
					messageId: 'noSpreadInObject'
				});
			},

			// Detect spread in function calls: func(...args)
			'CallExpression > SpreadElement'(node: TSESTree.SpreadElement): void {
				context.report({
					node: node as any,
					messageId: 'noSpreadInCall'
				});
			},

			// Detect spread in new expressions: new Constructor(...args)
			'NewExpression > SpreadElement'(node: TSESTree.SpreadElement): void {
				context.report({
					node: node as any,
					messageId: 'noSpreadInCall'
				});
			}
		};
	}
};