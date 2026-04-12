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
exports.ActiveJsTsEditorTracker = void 0;
const vscode = __importStar(require("vscode"));
const languageDescription_1 = require("../configuration/languageDescription");
const languageIds_1 = require("../configuration/languageIds");
const dispose_1 = require("../utils/dispose");
const arrays_1 = require("../utils/arrays");
/**
 * Tracks the active JS/TS editor.
 *
 * This tries to handle the case where the user focuses in the output view / debug console.
 * When this happens, we want to treat the last real focused editor as the active editor,
 * instead of using `vscode.window.activeTextEditor`
 */
class ActiveJsTsEditorTracker extends dispose_1.Disposable {
    _activeJsTsEditor;
    _onDidChangeActiveJsTsEditor = this._register(new vscode.EventEmitter());
    onDidChangeActiveJsTsEditor = this._onDidChangeActiveJsTsEditor.event;
    constructor() {
        super();
        this._register(vscode.window.onDidChangeActiveTextEditor(_ => this.update()));
        this._register(vscode.window.onDidChangeVisibleTextEditors(_ => this.update()));
        this._register(vscode.window.tabGroups.onDidChangeTabGroups(_ => this.update()));
        this.update();
    }
    get activeJsTsEditor() {
        return this._activeJsTsEditor;
    }
    update() {
        // Use tabs to find the active editor.
        // This correctly handles switching to the output view / debug console, which changes the activeEditor but not
        // the active tab.
        const editorCandidates = this.getEditorCandidatesForActiveTab();
        const managedEditors = editorCandidates.filter(editor => this.isManagedFile(editor));
        const newActiveJsTsEditor = managedEditors.at(0);
        if (this._activeJsTsEditor !== newActiveJsTsEditor) {
            this._activeJsTsEditor = newActiveJsTsEditor;
            this._onDidChangeActiveJsTsEditor.fire(this._activeJsTsEditor);
        }
    }
    getEditorCandidatesForActiveTab() {
        const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (!tab) {
            return [];
        }
        // Basic text editor tab
        if (tab.input instanceof vscode.TabInputText) {
            const inputUri = tab.input.uri;
            const editor = vscode.window.visibleTextEditors.find(editor => {
                return editor.document.uri.toString() === inputUri.toString()
                    && editor.viewColumn === tab.group.viewColumn;
            });
            return editor ? [editor] : [];
        }
        // Diff editor tab. We could be focused on either side of the editor.
        if (tab.input instanceof vscode.TabInputTextDiff) {
            const original = tab.input.original;
            const modified = tab.input.modified;
            // Check the active editor first. However if a non tab editor like the output view is focused,
            // we still need to check the visible text editors.
            // TODO: This may return incorrect editors incorrect as there does not seem to be a reliable way to map from an editor to the
            // view column of its parent diff editor. See https://github.com/microsoft/vscode/issues/201845
            return (0, arrays_1.coalesce)([vscode.window.activeTextEditor, ...vscode.window.visibleTextEditors]).filter(editor => {
                return (editor.document.uri.toString() === original.toString() || editor.document.uri.toString() === modified.toString())
                    && editor.viewColumn === undefined; // Editors in diff views have undefined view columns
            });
        }
        // Notebook editor. Find editor for notebook cell.
        if (tab.input instanceof vscode.TabInputNotebook) {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                return [];
            }
            // Notebooks cell editors have undefined view columns.
            if (activeEditor.viewColumn !== undefined) {
                return [];
            }
            const notebook = vscode.window.visibleNotebookEditors.find(editor => editor.notebook.uri.toString() === tab.input.uri.toString()
                && editor.viewColumn === tab.group.viewColumn);
            return notebook?.notebook.getCells().some(cell => cell.document.uri.toString() === activeEditor.document.uri.toString()) ? [activeEditor] : [];
        }
        return [];
    }
    isManagedFile(editor) {
        return this.isManagedScriptFile(editor) || this.isManagedConfigFile(editor);
    }
    isManagedScriptFile(editor) {
        return (0, languageIds_1.isSupportedLanguageMode)(editor.document);
    }
    isManagedConfigFile(editor) {
        return (0, languageDescription_1.isJsConfigOrTsConfigFileName)(editor.document.fileName);
    }
}
exports.ActiveJsTsEditorTracker = ActiveJsTsEditorTracker;
//# sourceMappingURL=activeJsTsEditorTracker.js.map