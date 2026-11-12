/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class DeclareServiceBrand implements CreateRule {

	readonly meta: RuleMeta = {
		fixable: 'code',
		schema: false,
	};

	create(context: Context): Visitor {
		return {
			['PropertyDefinition[key.name="_serviceBrand"][value]']: (node: ESTree.PropertyDefinition) => {
				return context.report({
					node,
					message: `The '_serviceBrand'-property should not have a value`,
					fix: (fixer) => {
						return fixer.replaceText(node, 'declare _serviceBrand: undefined;');
					}
				});
			}
		};
	}
};
