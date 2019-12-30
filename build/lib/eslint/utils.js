"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
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
        // import('module').then(...)
        CallExpression: (node) => {
            var _a;
            const { callee, arguments: args } = node;
            if (callee.type === 'Import' && args.length > 0 && ((_a = args[0]) === null || _a === void 0 ? void 0 : _a.type) === 'Literal') {
                _checkImport(args[0]);
            }
        },
        // export ?? from 'module'
        ExportAllDeclaration: (node) => {
            _checkImport(node.source);
        },
        // export {foo} from 'module'
        ExportNamedDeclaration: (node) => {
            _checkImport(node.source);
        }
    };
}
exports.createImportRuleListener = createImportRuleListener;
