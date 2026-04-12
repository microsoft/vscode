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
const vscode = __importStar(require("vscode"));
const typeConverters = __importStar(require("../typeConverters"));
const dependentRegistration_1 = require("./util/dependentRegistration");
class TypeScriptFormattingProvider {
    client;
    fileConfigurationManager;
    constructor(client, fileConfigurationManager) {
        this.client = client;
        this.fileConfigurationManager = fileConfigurationManager;
    }
    async provideDocumentRangeFormattingEdits(document, range, options, token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file) {
            return undefined;
        }
        await this.fileConfigurationManager.ensureConfigurationOptions(document, options, token);
        const args = typeConverters.Range.toFormattingRequestArgs(file, range);
        const response = await this.client.execute('format', args, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        return response.body.map(typeConverters.TextEdit.fromCodeEdit);
    }
    async provideOnTypeFormattingEdits(document, position, ch, options, token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file) {
            return undefined;
        }
        await this.fileConfigurationManager.ensureConfigurationOptions(document, options, token);
        const args = {
            ...typeConverters.Position.toFileLocationRequestArgs(file, position),
            key: ch
        };
        const response = await this.client.execute('formatonkey', args, token);
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        const result = [];
        for (const edit of response.body) {
            const textEdit = typeConverters.TextEdit.fromCodeEdit(edit);
            const range = textEdit.range;
            // Work around for https://github.com/microsoft/TypeScript/issues/6700.
            // Check if we have an edit at the beginning of the line which only removes white spaces and leaves
            // an empty line. Drop those edits
            if (range.start.character === 0 && range.start.line === range.end.line && textEdit.newText === '') {
                const lText = document.lineAt(range.start.line).text;
                // If the edit leaves something on the line keep the edit (note that the end character is exclusive).
                // Keep it also if it removes something else than whitespace
                if (lText.trim().length > 0 || lText.length > range.end.character) {
                    result.push(textEdit);
                }
            }
            else {
                result.push(textEdit);
            }
        }
        return result;
    }
}
function register(selector, language, client, fileConfigurationManager) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireGlobalUnifiedConfig)('format.enabled', { fallbackSection: language.id, fallbackSubSectionNameOverride: 'format.enable' }),
    ], () => {
        const formattingProvider = new TypeScriptFormattingProvider(client, fileConfigurationManager);
        return vscode.Disposable.from(vscode.languages.registerOnTypeFormattingEditProvider(selector.syntax, formattingProvider, ';', '}', '\n'), vscode.languages.registerDocumentRangeFormattingEditProvider(selector.syntax, formattingProvider));
    });
}
//# sourceMappingURL=formatting.js.map