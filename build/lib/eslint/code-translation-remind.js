"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var _a;
const fs_1 = require("fs");
const utils_1 = require("./utils");
module.exports = new (_a = class TranslationRemind {
        constructor() {
            this.meta = {
                messages: {
                    missing: 'Please add \'{{resource}}\' to ./build/lib/i18n.resources.json file to use translations here.'
                }
            };
        }
        create(context) {
            return utils_1.createImportRuleListener((node, path) => this._checkImport(context, node, path));
        }
        _checkImport(context, node, path) {
            if (path !== TranslationRemind.NLS_MODULE) {
                return;
            }
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
                    loc: node.loc,
                    messageId: 'missing',
                    data: { resource }
                });
            }
        }
    },
    _a.NLS_MODULE = 'vs/nls',
    _a);
