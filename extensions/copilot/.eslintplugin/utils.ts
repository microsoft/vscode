/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ESTree, Visitor } from '@oxlint/plugins';

export function createImportRuleListener(validateImport: (node: ESTree.StringLiteral, value: string) => void): Visitor {

	function _checkImport(node: ESTree.Node | null) {
		if (node && node.type === 'Literal' && typeof node.value === 'string') {
			validateImport(node, node.value);
		}
	}

	return {
		// import ??? from 'module'
		ImportDeclaration: (node: ESTree.ImportDeclaration) => {
			_checkImport(node.source);
		},
		// import('module').then(...) OR await import('module')
		['CallExpression[callee.type="Import"][arguments.length=1] > Literal']: (node: ESTree.Node) => {
			_checkImport(node);
		},
		// import foo = ...
		['TSImportEqualsDeclaration > TSExternalModuleReference > Literal']: (node: ESTree.Node) => {
			_checkImport(node);
		},
		// export ?? from 'module'
		ExportAllDeclaration: (node: ESTree.ExportAllDeclaration) => {
			_checkImport(node.source);
		},
		// export {foo} from 'module'
		ExportNamedDeclaration: (node: ESTree.ExportNamedDeclaration) => {
			_checkImport(node.source);
		},

	};
}
