/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { TSESTree } from '@typescript-eslint/utils';

export function createImportRuleListener(validateImport: (node: TSESTree.Literal, value: string) => any): eslint.Rule.RuleListener {

	function _checkImport(node: TSESTree.Node | null) {
		if (node && node.type === 'Literal' && typeof node.value === 'string') {
			validateImport(node, node.value);
		}
	}

	return {
		// import ??? from 'module'
		ImportDeclaration: (node: ESTree.ImportDeclaration) => {
			_checkImport((node as TSESTree.ImportDeclaration).source);
		},
		// import foo = require('module')
		// Listen to node types rather than selectors such as `TSImportEqualsDeclaration > TSExternalModuleReference > Literal`,
		// which are matched against every literal in the file. (`import('module')` is an `ImportExpression`, not checked here.)
		TSImportEqualsDeclaration: (rawNode: ESTree.Node) => {
			const node = rawNode as TSESTree.Node;
			if (node.type === 'TSImportEqualsDeclaration' && node.moduleReference.type === 'TSExternalModuleReference') {
				_checkImport(node.moduleReference.expression);
			}
		},
		// export ?? from 'module'
		ExportAllDeclaration: (node: ESTree.ExportAllDeclaration) => {
			_checkImport((node as TSESTree.ExportAllDeclaration).source);
		},
		// export {foo} from 'module'
		ExportNamedDeclaration: (node: ESTree.ExportNamedDeclaration) => {
			_checkImport((node as TSESTree.ExportNamedDeclaration).source);
		},

	};
}
