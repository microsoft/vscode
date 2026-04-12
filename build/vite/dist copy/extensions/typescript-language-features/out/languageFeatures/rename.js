"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const languageIds = __importStar(require("../configuration/languageIds"));
const api_1 = require("../tsServer/api");
const typeConverters = __importStar(require("../typeConverters"));
const typescriptService_1 = require("../typescriptService");
const configuration_1 = require("../utils/configuration");
const dependentRegistration_1 = require("./util/dependentRegistration");
class TypeScriptRenameProvider {
    language;
    client;
    fileConfigurationManager;
    constructor(language, client, fileConfigurationManager) {
        this.language = language;
        this.client = client;
        this.fileConfigurationManager = fileConfigurationManager;
    }
    async prepareRename(document, position, token) {
        const response = await this.execRename(document, position, token);
        if (!response) {
            return undefined;
        }
        switch (response.type) {
            case 'rename': {
                const renameInfo = response.body.info;
                if (!renameInfo.canRename) {
                    return Promise.reject(renameInfo.localizedErrorMessage);
                }
                return typeConverters.Range.fromTextSpan(renameInfo.triggerSpan);
            }
            case 'jsxLinkedEditing': {
                return response.spans
                    .map(typeConverters.Range.fromTextSpan)
                    .find(range => range.contains(position));
            }
        }
    }
    async provideRenameEdits(document, position, newName, token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file) {
            return undefined;
        }
        const response = await this.execRename(document, position, token);
        if (!response || token.isCancellationRequested) {
            return undefined;
        }
        switch (response.type) {
            case 'rename': {
                const renameInfo = response.body.info;
                if (!renameInfo.canRename) {
                    return Promise.reject(renameInfo.localizedErrorMessage);
                }
                if (renameInfo.fileToRename) {
                    const edits = await this.renameFile(renameInfo.fileToRename, renameInfo.fullDisplayName, newName, token);
                    if (edits) {
                        return edits;
                    }
                    else {
                        return Promise.reject(vscode.l10n.t("An error occurred while renaming file"));
                    }
                }
                return this.updateLocs(response.body.locs, newName);
            }
            case 'jsxLinkedEditing': {
                return this.updateLocs([{
                        file,
                        locs: response.spans.map((span) => ({ ...span })),
                    }], newName);
            }
        }
    }
    async execRename(document, position, token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file) {
            return undefined;
        }
        // Prefer renaming matching jsx tag when available
        if (this.client.apiVersion.gte(api_1.API.v510) &&
            (0, configuration_1.readUnifiedConfig)('preferences.renameMatchingJsxTags', true, { scope: document, fallbackSection: this.language.id }) &&
            this.looksLikePotentialJsxTagContext(document, position)) {
            const args = typeConverters.Position.toFileLocationRequestArgs(file, position);
            const response = await this.client.execute('linkedEditingRange', args, token);
            if (response.type !== 'response' || !response.body) {
                return undefined;
            }
            return { type: 'jsxLinkedEditing', spans: response.body.ranges };
        }
        const args = {
            ...typeConverters.Position.toFileLocationRequestArgs(file, position),
            findInStrings: false,
            findInComments: false
        };
        return this.client.interruptGetErr(async () => {
            this.fileConfigurationManager.ensureConfigurationForDocument(document, token);
            const response = await this.client.execute('rename', args, token);
            if (response.type !== 'response' || !response.body) {
                return undefined;
            }
            return { type: 'rename', body: response.body };
        });
    }
    looksLikePotentialJsxTagContext(document, position) {
        if (![languageIds.typescriptreact, languageIds.javascript, languageIds.javascriptreact].includes(document.languageId)) {
            return false;
        }
        const prefix = document.getText(new vscode.Range(position.line, 0, position.line, position.character));
        return /\<\/?\s*[\w\d_$.]*$/.test(prefix);
    }
    updateLocs(locations, newName) {
        const edit = new vscode.WorkspaceEdit();
        for (const spanGroup of locations) {
            const resource = this.client.toResource(spanGroup.file);
            for (const textSpan of spanGroup.locs) {
                edit.replace(resource, typeConverters.Range.fromTextSpan(textSpan), (textSpan.prefixText || '') + newName + (textSpan.suffixText || ''));
            }
        }
        return edit;
    }
    async renameFile(fileToRename, fullDisplayName, newName, token) {
        // Make sure we preserve file extension if extension is unchanged or none provided
        if (!path.extname(newName)) {
            newName += path.extname(fileToRename);
        }
        else if (path.extname(newName) === path.extname(fullDisplayName)) {
            newName = newName.slice(0, newName.length - path.extname(newName).length) + path.extname(fileToRename);
        }
        const dirname = path.dirname(fileToRename);
        const newFilePath = path.join(dirname, newName);
        const args = {
            file: fileToRename,
            oldFilePath: fileToRename,
            newFilePath: newFilePath,
        };
        const response = await this.client.execute('getEditsForFileRename', args, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        const edits = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body);
        edits.renameFile(vscode.Uri.file(fileToRename), vscode.Uri.file(newFilePath));
        return edits;
    }
}
function register(selector, language, client, fileConfigurationManager) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.Semantic),
    ], () => {
        return vscode.languages.registerRenameProvider(selector.semantic, new TypeScriptRenameProvider(language, client, fileConfigurationManager));
    });
}
//# sourceMappingURL=rename.js.map