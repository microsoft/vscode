/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/experimental-utils';

export function createImportRuleListener(validateImport: (node: TSESTree.Literal, value: string) => any): eslint.Rule.RuleListener {

	function _checkImport(node: TSESTree.Node | null) {
		if (node && node.type === 'Literal' && typeof node.value === 'string') {
			validateImport(node, node.value);
		}
	}

	return {
		// import ??? from 'module'
		ImportDeclaration: (node: any) => {
			_checkImport((<TSESTree.ImportDeclaration>node).source);
		},
		// import('module').then(...)
		CallExpression: (node: any) => {
			const { callee, arguments: args } = <TSESTree.CallExpression>node;
			if ((<any>callee.type) === 'Import' && args.length > 0 && args[0]?.type === 'Literal') {
				_checkImport(args[0]);
			}
		},
		// import foo = ...
		[AST_NODE_TYPES.TSImportEqualsDeclaration]: (node: any) => {
			const { moduleReference } = (<TSESTree.TSImportEqualsDeclaration>node);
			if (moduleReference.type === AST_NODE_TYPES.TSExternalModuleReference) {
				_checkImport((<TSESTree.Literal>(<TSESTree.TSExternalModuleReference>moduleReference).expression));
			}
		},
		// export ?? from 'module'
		ExportAllDeclaration: (node: any) => {
			_checkImport((<TSESTree.ExportAllDeclaration>node).source);
		},
		// export {foo} from 'module'
		ExportNamedDeclaration: (node: any) => {
			_checkImport((<TSESTree.ExportNamedDeclaration>node).source);
		},

	};
}
