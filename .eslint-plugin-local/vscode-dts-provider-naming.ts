/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/utils';
import * as eslint from 'eslint';

export default new class ApiProviderNaming implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			naming: 'A provider should only have functions like provideXYZ or resolveXYZ',
		},
		schema: false,
	};

	private static _providerFunctionNames = /^(provide|resolve|prepare).+/;

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const config = context.options[0] as { allowed: string[] };
		const allowed = new Set(config.allowed);

		return {
			['TSInterfaceDeclaration[id.name=/.+Provider/] TSMethodSignature']: (node: TSESTree.Node) => {
				const interfaceName = ((node as TSESTree.Identifier).parent?.parent as TSESTree.TSInterfaceDeclaration).id.name;
				if (allowed.has(interfaceName)) {
					// allowed
					return;
				}

				const methodName = ((node as TSESTree.TSMethodSignatureNonComputedName).key as TSESTree.Identifier).name;

				if (!ApiProviderNaming._providerFunctionNames.test(methodName)) {
					context.report({
						node,
						messageId: 'naming'
					});
				}
			}
		};
	}
};
