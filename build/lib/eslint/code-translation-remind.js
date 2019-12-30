"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var _a;
const fs_1 = require("fs");
module.exports = new (_a = class TranslationRemind {
        constructor() {
            this.meta = {
                type: 'problem',
                schema: {},
                messages: {
                    missing: 'Please add \'{{resource}}\' to ./build/lib/i18n.resources.json file to use translations here.'
                }
            };
        }
        create(context) {
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
            if (path === TranslationRemind.NLS_MODULE) {
                const currentFile = context.getFilename();
                const matchService = currentFile.match(/vs\/workbench\/services\/\w+/);
                const matchPart = currentFile.match(/vs\/workbench\/contrib\/\w+/);
                if (!matchService && !matchPart) {
                    return;
                }
                const resource = matchService ? matchService[0] : matchPart[0];
                let resourceDefined = false;
                let json;
                try {
                    json = fs_1.readFileSync('./build/lib/i18n.resources.json', 'utf8');
                }
                catch (e) {
                    console.error('[translation-remind rule]: File with resources to pull from Transifex was not found. Aborting translation resource check for newly defined workbench part/service.');
                    return;
                }
                const workbenchResources = JSON.parse(json).workbench;
                workbenchResources.forEach((existingResource) => {
                    if (existingResource.name === resource) {
                        resourceDefined = true;
                        return;
                    }
                });
                if (!resourceDefined) {
                    context.report({
                        node,
                        messageId: 'missing',
                        data: { resource }
                    });
                }
            }
        }
    },
    _a.NLS_MODULE = 'vs/nls',
    _a);
