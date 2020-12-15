"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path_1 = require("path");
const utils_1 = require("./utils");
module.exports = new class {
    constructor() {
        this.meta = {
            messages: {
                layerbreaker: 'Bad layering. You are not allowed to access {{from}} from here, allowed layers are: [{{allowed}}]'
            },
            docs: {
                url: 'https://github.com/microsoft/vscode/wiki/Source-Code-Organization'
            }
        };
    }
    create(context) {
        const fileDirname = path_1.dirname(context.getFilename());
        const parts = fileDirname.split(/\\|\//);
        const ruleArgs = context.options[0];
        let config;
        for (let i = parts.length - 1; i >= 0; i--) {
            if (ruleArgs[parts[i]]) {
                config = {
                    allowed: new Set(ruleArgs[parts[i]]).add(parts[i]),
                    disallowed: new Set()
                };
                Object.keys(ruleArgs).forEach(key => {
                    if (!config.allowed.has(key)) {
                        config.disallowed.add(key);
                    }
                });
                break;
            }
        }
        if (!config) {
            // nothing
            return {};
        }
        return utils_1.createImportRuleListener((node, path) => {
            if (path[0] === '.') {
                path = path_1.join(path_1.dirname(context.getFilename()), path);
            }
            const parts = path_1.dirname(path).split(/\\|\//);
            for (let i = parts.length - 1; i >= 0; i--) {
                const part = parts[i];
                if (config.allowed.has(part)) {
                    // GOOD - same layer
                    break;
                }
                if (config.disallowed.has(part)) {
                    // BAD - wrong layer
                    context.report({
                        loc: node.loc,
                        messageId: 'layerbreaker',
                        data: {
                            from: part,
                            allowed: [...config.allowed.keys()].join(', ')
                        }
                    });
                    break;
                }
            }
        });
    }
};
