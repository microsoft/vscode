"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path_1 = require("path");
module.exports = new class NoNlsInStandaloneEditorRule {
    constructor() {
        this.meta = {
            type: 'problem',
            schema: {},
            messages: {
                badImport: 'Not allowed to import standalone editor modules. See https://github.com/Microsoft/vscode/wiki/Code-Organization'
            }
        };
    }
    create(context) {
        if (/vs(\/|\\)editor/.test(context.getFilename())) {
            // the vs/editor folder is allowed to use the standalone editor
            return {};
        }
        return {
            ImportDeclaration: (node) => {
                this._checkImport(context, node, node.source.value);
            },
            CallExpression: (node) => {
                var _a;
                const { callee, arguments: args } = node;
                if (callee.type === 'Import' && ((_a = args[0]) === null || _a === void 0 ? void 0 : _a.type) === 'Literal') {
                    this._checkImport(context, node, args[0].value);
                }
            }
        };
    }
    _checkImport(context, node, path) {
        if (typeof path !== 'string') {
            return;
        }
        // resolve relative paths
        if (path[0] === '.') {
            path = path_1.join(context.getFilename(), path);
        }
        if (/vs(\/|\\)editor(\/|\\)standalone(\/|\\)/.test(path)
            || /vs(\/|\\)editor(\/|\\)common(\/|\\)standalone(\/|\\)/.test(path)
            || /vs(\/|\\)editor(\/|\\)editor.api/.test(path)
            || /vs(\/|\\)editor(\/|\\)editor.main/.test(path)
            || /vs(\/|\\)editor(\/|\\)editor.worker/.test(path)) {
            context.report({
                node,
                messageId: 'badImport'
            });
        }
    }
};
