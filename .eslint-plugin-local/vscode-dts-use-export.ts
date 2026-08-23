/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/utils';
import * as eslint from 'eslint';
import type * as ESTree from 'estree';

export default new class VscodeDtsUseExport implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			useExport: `Public api types must use 'export'`,
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			['TSModuleDeclaration :matches(TSInterfaceDeclaration, ClassDeclaration, VariableDeclaration, TSEnumDeclaration, TSTypeAliasDeclaration)']: (node: ESTree.Node) => {
				const parent = (node as TSESTree.Node).parent;
				if (parent && parent.type !== TSESTree.AST_NODE_TYPES.ExportNamedDeclaration) {
					context.report({
						node,
						messageId: 'useExport'
					});
				}
			}
		};
	}
};

