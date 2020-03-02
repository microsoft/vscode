"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createImportRuleListener = void 0;
function createImportRuleListener(validateImport) {
    function _checkImport(node) {
        if (node && node.type === 'Literal' && typeof node.value === 'string') {
            validateImport(node, node.value);
        }
    }
    return {
        // import ??? from 'module'
        ImportDeclaration: (node) => {
            _checkImport(node.source);
        },
        // import('module').then(...) OR await import('module')
        ['CallExpression[callee.type="Import"][arguments.length=1] > Literal']: (node) => {
            _checkImport(node);
        },
        // import foo = ...
        ['TSImportEqualsDeclaration > TSExternalModuleReference > Literal']: (node) => {
            _checkImport(node);
        },
        // export ?? from 'module'
        ExportAllDeclaration: (node) => {
            _checkImport(node.source);
        },
        // export {foo} from 'module'
        ExportNamedDeclaration: (node) => {
            _checkImport(node.source);
        },
    };
}
exports.createImportRuleListener = createImportRuleListener;
