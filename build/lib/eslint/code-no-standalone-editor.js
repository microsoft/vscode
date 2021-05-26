"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path_1 = require("path");
const utils_1 = require("./utils");
module.exports = new class NoNlsInStandaloneEditorRule {
    constructor() {
        this.meta = {
            messages: {
                badImport: 'Not allowed to import standalone editor modules.'
            },
            docs: {
                url: 'https://github.com/microsoft/vscode/wiki/Source-Code-Organization'
            }
        };
    }
    create(context) {
        if (/vs(\/|\\)editor/.test(context.getFilename())) {
            // the vs/editor folder is allowed to use the standalone editor
            return {};
        }
        return (0, utils_1.createImportRuleListener)((node, path) => {
            // resolve relative paths
            if (path[0] === '.') {
                path = (0, path_1.join)(context.getFilename(), path);
            }
            if (/vs(\/|\\)editor(\/|\\)standalone(\/|\\)/.test(path)
                || /vs(\/|\\)editor(\/|\\)common(\/|\\)standalone(\/|\\)/.test(path)
                || /vs(\/|\\)editor(\/|\\)editor.api/.test(path)
                || /vs(\/|\\)editor(\/|\\)editor.main/.test(path)
                || /vs(\/|\\)editor(\/|\\)editor.worker/.test(path)) {
                context.report({
                    loc: node.loc,
                    messageId: 'badImport'
                });
            }
        });
    }
};
