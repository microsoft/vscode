/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class ApiTypeDiscrimination implements CreateRule {

	readonly meta: RuleMeta = {
		docs: { url: 'https://github.com/microsoft/vscode/wiki/Extension-API-guidelines' },
		messages: {
			noTypeDiscrimination: 'Do not use type discrimination properties'
		},
		schema: false,
	};

	create(context: Context): Visitor {
		return {
			['TSPropertySignature[optional=false] TSTypeAnnotation TSLiteralType Literal']: (node: ESTree.StringLiteral | ESTree.NumericLiteral | ESTree.BooleanLiteral | ESTree.NullLiteral | ESTree.BigIntLiteral | ESTree.RegExpLiteral) => {
				const raw = String(node.raw);

				if (/^('|").*\1$/.test(raw)) {

					context.report({
						node: node,
						messageId: 'noTypeDiscrimination'
					});
				}
			}
		};
	}
};
