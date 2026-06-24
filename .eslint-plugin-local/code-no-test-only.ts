/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';

export default new class NoTestOnly implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
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
