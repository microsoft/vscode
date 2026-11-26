/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class ApiLiteralOrTypes implements CreateRule {

	readonly meta: RuleMeta = {
		docs: { url: 'https://github.com/microsoft/vscode/wiki/Extension-API-guidelines#enums' },
		messages: { useEnum: 'Use enums, not literal-or-types', },
		schema: false,
	};

	create(context: Context): Visitor {
		return {
			['TSTypeAnnotation TSUnionType']: (node: ESTree.TSUnionType) => {
				if (node.types.every(value => value.type === 'TSLiteralType')) {
					context.report({
						node: node,
						messageId: 'useEnum'
					});
				}
			}
		};
	}
};
