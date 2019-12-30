/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import * as estree from 'estree';

//https://github.com/estree/estree/blob/master/es2015.md#exportnameddeclaration
declare interface ExportNamedDeclaration {
	type: "ExportNamedDeclaration";
	declaration: estree.Declaration | null;
	specifiers: [estree.ExportSpecifier];
	source: estree.Literal | null;
}

export function createImportRuleListener(validateImport: (node: estree.SimpleLiteral, value: string) => any): eslint.Rule.RuleListener {

	function _checkImport(node: estree.Literal | null) {
		if (node && node.type === 'Literal' && typeof node.value === 'string') {
			validateImport(<estree.SimpleLiteral>node, node.value);
		}
	}

	return {
		// import ??? from 'module'
		ImportDeclaration: (node: estree.Node) => {
			_checkImport((<estree.ImportDeclaration>node).source);
		},
		// import('module').then(...)
		CallExpression: (node: estree.Node) => {
			const { callee, arguments: args } = <estree.CallExpression>node;
			if ((<any>callee.type) === 'Import' && args[0]?.type === 'Literal') {
				_checkImport(<estree.SimpleLiteral>args[0]);
			}
		},
		// export ?? from 'module'
		ExportAllDeclaration: (node: estree.Node) => {
			_checkImport((<estree.ExportAllDeclaration>node).source);
		},
		// export {foo} from 'module'
		ExportNamedDeclaration: (node: estree.Node) => {
			_checkImport((<ExportNamedDeclaration>node).source);
		}
	};
}
