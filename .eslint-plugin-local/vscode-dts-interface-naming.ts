/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

export = new class ApiInterfaceNaming implements eslint.Rule.RuleModule {

	private static _nameRegExp = /^I[A-Z]/;

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			naming: 'Interfaces must not be prefixed with uppercase `I`',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		return {
			['TSInterfaceDeclaration Identifier']: (node: any) => {

				const name = (<TSESTree.Identifier>node).name;
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

