/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Visitor } from '@oxlint/plugins';

export default new class NoAnyCasts implements CreateRule {

	create(context: Context): Visitor {
		return {
			'TSTypeAssertion[typeAnnotation.type="TSAnyKeyword"], TSAsExpression[typeAnnotation.type="TSAnyKeyword"]': (node: ESTree.TSTypeAssertion | ESTree.TSAsExpression) => {
				context.report({
					node,
					message: `Avoid casting to 'any' type. Consider using a more specific type or type guards for better type safety.`
				});
			}
		};
	}
};
