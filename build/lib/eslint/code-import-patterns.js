"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path_1 = require("path");
const minimatch = require("minimatch");
module.exports = new class {
    constructor() {
        this.meta = {
            type: 'problem',
            schema: {},
            messages: {
                badImport: 'Imports violates \'{{restrictions}}\' restrictions. See https://github.com/Microsoft/vscode/wiki/Code-Organization'
            }
        };
    }
    create(context) {
        const configs = context.options;
        for (const config of configs) {
            if (minimatch(context.getFilename(), config.target)) {
                return {
                    ImportDeclaration: (node) => {
                        this._checkImport(context, config, node, node.source.value);
                    },
                    CallExpression: (node) => {
                        var _a;
                        const { callee, arguments: args } = node;
                        if (callee.type === 'Import' && ((_a = args[0]) === null || _a === void 0 ? void 0 : _a.type) === 'Literal') {
                            this._checkImport(context, config, node, args[0].value);
                        }
                    }
                };
            }
        }
        return {};
    }
    _checkImport(context, config, node, path) {
        if (typeof path !== 'string') {
            return;
        }
        // resolve relative paths
        if (path[0] === '.') {
            path = path_1.join(context.getFilename(), path);
        }
        let restrictions;
        if (typeof config.restrictions === 'string') {
            restrictions = [config.restrictions];
        }
        else {
            restrictions = config.restrictions;
        }
        let matched = false;
        for (const pattern of restrictions) {
            if (minimatch(path, pattern)) {
                matched = true;
                break;
            }
        }
        if (!matched) {
            // None of the restrictions matched
            context.report({
                node,
                messageId: 'badImport',
                data: {
                    restrictions: restrictions.join(' or ')
                }
            });
        }
    }
};
