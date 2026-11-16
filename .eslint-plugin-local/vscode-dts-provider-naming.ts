/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class ApiProviderNaming implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			naming: 'A provider should only have functions like provideXYZ or resolveXYZ',
		},
		schema: false,
	};

	private static _providerFunctionNames = /^(provide|resolve|prepare).+/;

	create(context: Context): Visitor {

		const config = context.options[0] as { allowed: string[] };
		const allowed = new Set(config.allowed);

		return {
			['TSInterfaceDeclaration[id.name=/.+Provider/] TSMethodSignature']: (node: ESTree.TSMethodSignature) => {
				const interfaceName = (node.parent?.parent as ESTree.TSInterfaceDeclaration).id.name;
				if (allowed.has(interfaceName)) {
					// allowed
					return;
				}

				const methodName = (node.key as ESTree.IdentifierName).name;

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
