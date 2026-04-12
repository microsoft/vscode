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
class TypeScriptDocumentHighlightProvider {
    client;
    constructor(client) {
        this.client = client;
    }
    async provideMultiDocumentHighlights(document, position, otherDocuments, token) {
        const allFiles = [document, ...otherDocuments].map(doc => this.client.toOpenTsFilePath(doc)).filter(file => !!file);
        const file = this.client.toOpenTsFilePath(document);
        if (!file || allFiles.length === 0) {
            return [];
        }
        const args = {
            ...typeConverters.Position.toFileLocationRequestArgs(file, position),
            filesToSearch: allFiles
        };
        const response = await this.client.execute('documentHighlights', args, token);
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        const result = response.body.map(highlightItem => new vscode.MultiDocumentHighlight(vscode.Uri.file(highlightItem.file), [...convertDocumentHighlight(highlightItem)]));
        return result;
    }
    async provideDocumentHighlights(document, position, token) {
        const file = this.client.toOpenTsFilePath(document);
        if (!file) {
            return [];
        }
        const args = {
            ...typeConverters.Position.toFileLocationRequestArgs(file, position),
            filesToSearch: [file]
        };
        const response = await this.client.execute('documentHighlights', args, token);
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        return response.body.flatMap(convertDocumentHighlight);
    }
}
function convertDocumentHighlight(highlight) {
    return highlight.highlightSpans.map(span => new vscode.DocumentHighlight(typeConverters.Range.fromTextSpan(span), span.kind === 'writtenReference' ? vscode.DocumentHighlightKind.Write : vscode.DocumentHighlightKind.Read));
}
function register(selector, client) {
    const provider = new TypeScriptDocumentHighlightProvider(client);
    return vscode.Disposable.from(vscode.languages.registerDocumentHighlightProvider(selector.syntax, provider), vscode.languages.registerMultiDocumentHighlightProvider(selector.syntax, provider));
}
//# sourceMappingURL=documentHighlight.js.map