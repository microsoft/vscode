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
const vscode = __importStar(require("vscode"));
const fileSchemes_1 = require("../configuration/fileSchemes");
const languageDescription_1 = require("../configuration/languageDescription");
const languageIds_1 = require("../configuration/languageIds");
const dispose_1 = require("../utils/dispose");
/**
 * When clause context set when the current file is managed by vscode's built-in typescript extension.
 */
class ManagedFileContextManager extends dispose_1.Disposable {
    static contextName = 'typescript.isManagedFile';
    isInManagedFileContext = false;
    constructor(activeJsTsEditorTracker) {
        super();
        activeJsTsEditorTracker.onDidChangeActiveJsTsEditor(this.onDidChangeActiveTextEditor, this, this._disposables);
        this.onDidChangeActiveTextEditor(activeJsTsEditorTracker.activeJsTsEditor);
    }
    dispose() {
        // Clear the context
        this.updateContext(false);
        super.dispose();
    }
    onDidChangeActiveTextEditor(editor) {
        if (editor) {
            this.updateContext(this.isManagedFile(editor));
        }
        else {
            this.updateContext(false);
        }
    }
    updateContext(newValue) {
        if (newValue === this.isInManagedFileContext) {
            return;
        }
        vscode.commands.executeCommand('setContext', ManagedFileContextManager.contextName, newValue);
        this.isInManagedFileContext = newValue;
    }
    isManagedFile(editor) {
        return this.isManagedScriptFile(editor) || this.isManagedConfigFile(editor);
    }
    isManagedScriptFile(editor) {
        return (0, languageIds_1.isSupportedLanguageMode)(editor.document) && !fileSchemes_1.disabledSchemes.has(editor.document.uri.scheme);
    }
    isManagedConfigFile(editor) {
        return (0, languageDescription_1.isJsConfigOrTsConfigFileName)(editor.document.fileName);
    }
}
exports.default = ManagedFileContextManager;
//# sourceMappingURL=managedFileContext.js.map