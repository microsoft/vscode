"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
module.exports = new class ApiVsCodeInComments {
    constructor() {
        this.meta = {
            messages: {
                comment: `Don't use the term 'vs code' in comments`
            }
        };
    }
    create(context) {
        const sourceCode = context.getSourceCode();
        return {
            ['Program']: (_node) => {
                for (const comment of sourceCode.getAllComments()) {
                    if (comment.type !== 'Block') {
                        continue;
                    }
                    if (!comment.range) {
                        continue;
                    }
                    const startIndex = comment.range[0] + '/*'.length;
                    const re = /vs code/ig;
                    let match;
                    while ((match = re.exec(comment.value))) {
                        // Allow using 'VS Code' in quotes
                        if (comment.value[match.index - 1] === `'` && comment.value[match.index + match[0].length] === `'`) {
                            continue;
                        }
                        // Types for eslint seem incorrect
                        const start = sourceCode.getLocFromIndex(startIndex + match.index);
                        const end = sourceCode.getLocFromIndex(startIndex + match.index + match[0].length);
                        context.report({
                            messageId: 'comment',
                            loc: { start, end }
                        });
                    }
                }
            }
        };
    }
};
