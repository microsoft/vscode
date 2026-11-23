/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

export default new class VscodeDtsUseExport implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			useExport: `Public api types must use 'export'`,
		},
		schema: false,
	};

	create(context: Context): Visitor {
		return {
			['TSModuleDeclaration :matches(TSInterfaceDeclaration, ClassDeclaration, VariableDeclaration, TSEnumDeclaration, TSTypeAliasDeclaration)']: (node: ESTree.Node) => {
				const parent = node.parent;
				if (parent && parent.type !== 'ExportNamedDeclaration') {
					context.report({
						node,
						messageId: 'useExport'
					});
				}
			}
		};
	}
};

