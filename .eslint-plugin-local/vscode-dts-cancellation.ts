/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class ApiProviderNaming implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			noToken: 'Function lacks a cancellation token, preferable as last argument',
		},
		schema: false,
	};

	create(context: Context): Visitor {

		return {
			['TSInterfaceDeclaration[id.name=/.+Provider/] TSMethodSignature[key.name=/^(provide|resolve).+/]']: (node: ESTree.TSMethodSignature) => {

				let found = false;
				for (const param of node.params) {
					if (param.type === 'Identifier') {
						found = found || param.name === 'token';
					}
				}

				if (!found) {
					context.report({
						node,
						messageId: 'noToken'
					});
				}
			}
		};
	}
};
