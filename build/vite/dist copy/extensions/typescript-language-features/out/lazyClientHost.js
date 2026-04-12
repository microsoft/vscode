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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLazyClientHost = createLazyClientHost;
exports.lazilyActivateClient = lazilyActivateClient;
const vscode = __importStar(require("vscode"));
const typeScriptServiceClientHost_1 = __importDefault(require("./typeScriptServiceClientHost"));
const managedFileContext_1 = __importDefault(require("./ui/managedFileContext"));
const fileSchemes = __importStar(require("./configuration/fileSchemes"));
const languageDescription_1 = require("./configuration/languageDescription");
const lazy_1 = require("./utils/lazy");
function createLazyClientHost(context, onCaseInsensitiveFileSystem, services, onCompletionAccepted) {
    return new lazy_1.Lazy(() => {
        return new typeScriptServiceClientHost_1.default(languageDescription_1.standardLanguageDescriptions, context, onCaseInsensitiveFileSystem, services, onCompletionAccepted);
    });
}
function lazilyActivateClient(lazyClientHost, pluginManager, activeJsTsEditorTracker, onActivate = () => Promise.resolve()) {
    const disposables = [];
    const supportedLanguage = [
        ...languageDescription_1.standardLanguageDescriptions.map(x => x.languageIds),
        ...pluginManager.plugins.map(x => x.languages)
    ].flat();
    let hasActivated = false;
    const maybeActivate = (textDocument) => {
        if (!hasActivated && isSupportedDocument(supportedLanguage, textDocument)) {
            hasActivated = true;
            onActivate().then(() => {
                // Force activation
                void lazyClientHost.value;
                disposables.push(new managedFileContext_1.default(activeJsTsEditorTracker));
            });
            return true;
        }
        return false;
    };
    const didActivate = vscode.workspace.textDocuments.some(maybeActivate);
    if (!didActivate) {
        const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
            if (maybeActivate(doc)) {
                openListener.dispose();
            }
        }, undefined, disposables);
    }
    return new vscode.Disposable(() => {
        disposables.forEach(d => d.dispose());
    });
}
function isSupportedDocument(supportedLanguage, document) {
    return (supportedLanguage.indexOf(document.languageId) >= 0 || (0, languageDescription_1.isJsConfigOrTsConfigFileName)(document.fileName))
        && !fileSchemes.disabledSchemes.has(document.uri.scheme);
}
//# sourceMappingURL=lazyClientHost.js.map