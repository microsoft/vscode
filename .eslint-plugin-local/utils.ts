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
		// import foo = require('module')
		// Listen to node types rather than selectors such as `TSImportEqualsDeclaration > TSExternalModuleReference > Literal`,
		// which are matched against every literal in the file. (`import('module')` is an `ImportExpression`, not checked here.)
		TSImportEqualsDeclaration: (node: ESTree.TSImportEqualsDeclaration) => {
			if (node.type === 'TSImportEqualsDeclaration' && node.moduleReference.type === 'TSExternalModuleReference') {
				_checkImport(node.moduleReference.expression);
			}
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
