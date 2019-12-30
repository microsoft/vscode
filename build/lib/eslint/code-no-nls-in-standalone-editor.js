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
                noNls: 'Not allowed to import vs/nls in standalone editor modules. Use standaloneStrings.ts'
            }
        };
    }
    create(context) {
        const fileName = context.getFilename();
        if (!(/vs(\/|\\)editor(\/|\\)standalone(\/|\\)/.test(fileName)
            || /vs(\/|\\)editor(\/|\\)common(\/|\\)standalone(\/|\\)/.test(fileName)
            || /vs(\/|\\)editor(\/|\\)editor.api/.test(fileName)
            || /vs(\/|\\)editor(\/|\\)editor.main/.test(fileName)
            || /vs(\/|\\)editor(\/|\\)editor.worker/.test(fileName))) {
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
        if (/vs(\/|\\)nls/.test(path)) {
            context.report({
                node,
                messageId: 'noNls'
            });
        }
    }
};
