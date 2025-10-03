/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

export = new class NoAnyCasts implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			'TSTypeAssertion[typeAnnotation.type="TSAnyKeyword"], TSAsExpression[typeAnnotation.type="TSAnyKeyword"]': (node: TSESTree.TSTypeAssertion | TSESTree.TSAsExpression) => {
				context.report({
					node,
					message: `Avoid casting to 'any' type. Consider using a more specific type or type guards for better type safety.`
				});
			}
		};
	}
};
