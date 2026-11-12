/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Visitor } from '@oxlint/plugins';

export default new class NoTestOnly implements CreateRule {

	create(context: Context): Visitor {
		return {
			['MemberExpression[object.name=/^(test|suite)$/][property.name="only"]']: (node: ESTree.MemberExpression) => {
				return context.report({
					node,
					message: 'only is a dev-time tool and CANNOT be pushed'
				});
			}
		};
	}
};
