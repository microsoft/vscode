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
exports.VsCodeMdWorkspace = void 0;
const vscode = __importStar(require("vscode"));
const dispose_1 = require("../util/dispose");
const file_1 = require("../util/file");
const inMemoryDocument_1 = require("./inMemoryDocument");
const resourceMap_1 = require("../util/resourceMap");
/**
 * Provides set of markdown files known to VS Code.
 *
 * This includes both opened text documents and markdown files in the workspace.
 */
class VsCodeMdWorkspace extends dispose_1.Disposable {
    #watcher;
    #documentCache = new resourceMap_1.ResourceMap();
    #utf8Decoder = new TextDecoder('utf-8');
    constructor() {
        super();
        this.#watcher = this._register(vscode.workspace.createFileSystemWatcher('**/*.md'));
        this._register(this.#watcher.onDidChange(async (resource) => {
            this.#documentCache.delete(resource);
        }));
        this._register(this.#watcher.onDidDelete(resource => {
            this.#documentCache.delete(resource);
        }));
        this._register(vscode.workspace.onDidOpenTextDocument(e => {
            this.#documentCache.delete(e.uri);
        }));
        this._register(vscode.workspace.onDidCloseTextDocument(e => {
            this.#documentCache.delete(e.uri);
        }));
    }
    #isRelevantMarkdownDocument(doc) {
        return (0, file_1.isMarkdownFile)(doc) && doc.uri.scheme !== 'vscode-bulkeditpreview';
    }
    async getOrLoadMarkdownDocument(resource) {
        const existing = this.#documentCache.get(resource);
        if (existing) {
            return existing;
        }
        const matchingDocument = vscode.workspace.textDocuments.find((doc) => this.#isRelevantMarkdownDocument(doc) && doc.uri.toString() === resource.toString());
        if (matchingDocument) {
            this.#documentCache.set(resource, matchingDocument);
            return matchingDocument;
        }
        if (!(0, file_1.looksLikeMarkdownPath)(resource)) {
            return undefined;
        }
        try {
            const bytes = await vscode.workspace.fs.readFile(resource);
            // We assume that markdown is in UTF-8
            const text = this.#utf8Decoder.decode(bytes);
            const doc = new inMemoryDocument_1.InMemoryDocument(resource, text, 0);
            this.#documentCache.set(resource, doc);
            return doc;
        }
        catch {
            return undefined;
        }
    }
}
exports.VsCodeMdWorkspace = VsCodeMdWorkspace;
//# sourceMappingURL=workspace.js.map