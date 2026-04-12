"use strict";
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
exports.GitEditorDocumentLinkProvider = exports.GitEditor = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path = __importStar(require("path"));
const vscode_1 = require("vscode");
const util_1 = require("./util");
class GitEditor {
    env;
    disposable = util_1.EmptyDisposable;
    featureDescription = 'git editor';
    constructor(ipc) {
        if (ipc) {
            this.disposable = ipc.registerHandler('git-editor', this);
        }
        this.env = {
            GIT_EDITOR: `"${path.join(__dirname, ipc ? 'git-editor.sh' : 'git-editor-empty.sh')}"`,
            VSCODE_GIT_EDITOR_NODE: process.execPath,
            VSCODE_GIT_EDITOR_EXTRA_ARGS: '',
            VSCODE_GIT_EDITOR_MAIN: path.join(__dirname, 'git-editor-main.js')
        };
    }
    async handle({ commitMessagePath }) {
        if (commitMessagePath) {
            const uri = vscode_1.Uri.file(commitMessagePath);
            const doc = await vscode_1.workspace.openTextDocument(uri);
            await vscode_1.window.showTextDocument(doc, { preview: false });
            return new Promise((c) => {
                const onDidClose = vscode_1.window.tabGroups.onDidChangeTabs(async (tabs) => {
                    if (tabs.closed.some(t => t.input instanceof vscode_1.TabInputText && t.input.uri.toString() === uri.toString())) {
                        onDidClose.dispose();
                        return c(true);
                    }
                });
            });
        }
        return Promise.resolve(false);
    }
    getEnv() {
        const config = vscode_1.workspace.getConfiguration('git');
        return config.get('useEditorAsCommitInput') ? this.env : {};
    }
    getTerminalEnv() {
        const config = vscode_1.workspace.getConfiguration('git');
        return config.get('useEditorAsCommitInput') && config.get('terminalGitEditor') ? this.env : {};
    }
    dispose() {
        this.disposable.dispose();
    }
}
exports.GitEditor = GitEditor;
class GitEditorDocumentLinkProvider {
    _model;
    _regex = /^#\s+(modified|new file|deleted|renamed|copied|type change):\s+(?<file1>.*?)(?:\s+->\s+(?<file2>.*))*$/gm;
    constructor(_model) {
        this._model = _model;
    }
    provideDocumentLinks(document, token) {
        if (token.isCancellationRequested) {
            return [];
        }
        const repository = this._model.getRepository(document.uri);
        if (!repository) {
            return [];
        }
        const links = [];
        for (const match of document.getText().matchAll(this._regex)) {
            if (!match.groups) {
                continue;
            }
            const { file1, file2 } = match.groups;
            if (file1) {
                links.push(this._createDocumentLink(repository, document, match, file1));
            }
            if (file2) {
                links.push(this._createDocumentLink(repository, document, match, file2));
            }
        }
        return links;
    }
    _createDocumentLink(repository, document, match, file) {
        const startIndex = match[0].indexOf(file);
        const startPosition = document.positionAt(match.index + startIndex);
        const endPosition = document.positionAt(match.index + startIndex + file.length);
        const documentLink = new vscode_1.DocumentLink(new vscode_1.Range(startPosition, endPosition), vscode_1.Uri.file(path.join(repository.root, file)));
        documentLink.tooltip = vscode_1.l10n.t('Open File');
        return documentLink;
    }
}
exports.GitEditorDocumentLinkProvider = GitEditorDocumentLinkProvider;
//# sourceMappingURL=gitEditor.js.map