"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
module.exports = new class ApiEventNaming {
    constructor() {
        this.meta = {
            messages: {
                comment: 'region comments should start with a camel case identifier, `:`, then either a GH issue link or owner, e.g #region myProposalName: https://github.com/microsoft/vscode/issues/<number>',
            }
        };
    }
    create(context) {
        const sourceCode = context.getSourceCode();
        return {
            ['Program']: (_node) => {
                for (const comment of sourceCode.getAllComments()) {
                    if (comment.type !== 'Line') {
                        continue;
                    }
                    if (!/^\s*#region /.test(comment.value)) {
                        continue;
                    }
                    if (!/^\s*#region ([a-z]+): (@[a-z]+|https:\/\/github.com\/microsoft\/vscode\/issues\/\d+)/i.test(comment.value)) {
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
