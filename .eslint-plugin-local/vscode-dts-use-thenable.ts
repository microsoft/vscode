/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class ApiEventNaming implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			usage: 'Use the Thenable-type instead of the Promise type',
		},
		schema: false,
	};

	create(context: Context): Visitor {



		return {
			['TSTypeAnnotation TSTypeReference Identifier[name="Promise"]']: (node: ESTree.IdentifierReference) => {

				context.report({
					node,
					messageId: 'usage',
				});
			}
		};
	}
};
