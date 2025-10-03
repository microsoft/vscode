/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

export = new class NoAnyCasts implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			// Detect TSTypeAssertion: <any>value
			'TSTypeAssertion': (node: any) => {
				const typeAssertion = node as TSESTree.TSTypeAssertion;
				if (typeAssertion.typeAnnotation.type === 'TSAnyKeyword') {
					context.report({
						node,
						message: `Avoid casting to 'any' type. Consider using a more specific type or type guards for better type safety.`
					});
				}
			},

			// Detect TSAsExpression: value as any
			'TSAsExpression': (node: any) => {
				const asExpression = node as TSESTree.TSAsExpression;
				if (asExpression.typeAnnotation.type === 'TSAnyKeyword') {
					context.report({
						node,
						message: `Avoid casting to 'any' type. Consider using a more specific type or type guards for better type safety.`
					});
				}
			}
		};
	}
};
