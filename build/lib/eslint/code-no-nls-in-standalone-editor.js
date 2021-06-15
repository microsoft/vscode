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
                noNls: 'Not allowed to import vs/nls in standalone editor modules. Use standaloneStrings.ts'
            }
        };
    }
    create(context) {
        const fileName = context.getFilename();
        if (/vs(\/|\\)editor(\/|\\)standalone(\/|\\)/.test(fileName)
            || /vs(\/|\\)editor(\/|\\)common(\/|\\)standalone(\/|\\)/.test(fileName)
            || /vs(\/|\\)editor(\/|\\)editor.api/.test(fileName)
            || /vs(\/|\\)editor(\/|\\)editor.main/.test(fileName)
            || /vs(\/|\\)editor(\/|\\)editor.worker/.test(fileName)) {
            return utils_1.createImportRuleListener((node, path) => {
                // resolve relative paths
                if (path[0] === '.') {
                    path = path_1.join(context.getFilename(), path);
                }
                if (/vs(\/|\\)nls/.test(path)) {
                    context.report({
                        loc: node.loc,
                        messageId: 'noNls'
                    });
                }
            });
        }
        return {};
    }
};
