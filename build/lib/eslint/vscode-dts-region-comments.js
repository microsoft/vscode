"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
module.exports = new class ApiEventNaming {
    constructor() {
        this.meta = {
            messages: {
                comment: 'region comments should start with the GH issue link, e.g #region https://github.com/microsoft/vscode/issues/<number>',
            }
        };
    }
    create(context) {
        const sourceCode = context.getSourceCode();
        return {
            ['Program']: (_node) => {
                for (let comment of sourceCode.getAllComments()) {
                    if (comment.type !== 'Line') {
                        continue;
                    }
                    if (!comment.value.match(/^\s*#region /)) {
                        continue;
                    }
                    if (!comment.value.match(/https:\/\/github.com\/microsoft\/vscode\/issues\/\d+/i)) {
                        context.report({
                            node: comment,
                            messageId: 'comment',
                        });
                    }
                }
            }
        };
    }
};
