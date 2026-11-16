/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class ApiInterfaceNaming implements CreateRule {

	private static _nameRegExp = /^I[A-Z]/;

	readonly meta: RuleMeta = {
		messages: {
			naming: 'Interfaces must not be prefixed with uppercase `I`',
		},
		schema: false,
	};

	create(context: Context): Visitor {

		return {
			['TSInterfaceDeclaration Identifier']: (node: ESTree.IdentifierReference | ESTree.IdentifierName | ESTree.BindingIdentifier) => {

				const name = node.name;
				if (ApiInterfaceNaming._nameRegExp.test(name)) {
					context.report({
						node,
						messageId: 'naming'
					});
				}
			}
		};
	}
};

