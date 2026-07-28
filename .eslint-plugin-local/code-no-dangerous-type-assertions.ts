/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { TSESTree } from '@typescript-eslint/utils';

export default new class NoDangerousTypeAssertions implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			// Disallow type assertions on object literals: <T>{ ... } or {} as T
			['TSTypeAssertion > ObjectExpression, TSAsExpression > ObjectExpression']: (node: ESTree.ObjectExpression) => {
				const objectNode = node as TSESTree.ObjectExpression;

				const parent = objectNode.parent as TSESTree.TSTypeAssertion | TSESTree.TSAsExpression;
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
