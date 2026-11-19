/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Visitor } from '@oxlint/plugins';

export default new class NoDangerousTypeAssertions implements CreateRule {

	create(context: Context): Visitor {
		return {
			// Disallow type assertions on object literals: <T>{ ... } or {} as T
			['TSTypeAssertion > ObjectExpression, TSAsExpression > ObjectExpression']: (node: ESTree.ObjectExpression) => {
				const parent = node.parent as ESTree.TSTypeAssertion | ESTree.TSAsExpression;
				if (
					// Allow `as const` assertions
					(parent.typeAnnotation.type === 'TSTypeReference' && parent.typeAnnotation.typeName.type === 'Identifier' && parent.typeAnnotation.typeName.name === 'const')

					// For also now still allow `any` casts
					|| (parent.typeAnnotation.type === 'TSAnyKeyword')
				) {
					return;
				}

				context.report({
					node,
					message: `Don't use type assertions for creating objects as this can hide type errors.`
				});
			},
		};
	}
};
