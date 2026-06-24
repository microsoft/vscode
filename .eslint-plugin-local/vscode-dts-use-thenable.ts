/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';

export default new class ApiEventNaming implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			usage: 'Use the Thenable-type instead of the Promise type',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {



		return {
			['TSTypeAnnotation TSTypeReference Identifier[name="Promise"]']: (node: ESTree.Identifier) => {

				context.report({
					node,
					messageId: 'usage',
				});
			}
		};
	}
};
