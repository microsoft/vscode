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
const dispose_1 = require("../utils/dispose");
const configuration_1 = require("../utils/configuration");
const dependentRegistration_1 = require("./util/dependentRegistration");
class TagClosing extends dispose_1.Disposable {
    client;
    _disposed = false;
    _timeout = undefined;
    _cancel = undefined;
    constructor(client) {
        super();
        this.client = client;
        vscode.workspace.onDidChangeTextDocument(event => this.onDidChangeTextDocument(event), null, this._disposables);
    }
    dispose() {
        super.dispose();
        this._disposed = true;
        if (this._timeout) {
            clearTimeout(this._timeout);
            this._timeout = undefined;
        }
        if (this._cancel) {
            this._cancel.cancel();
            this._cancel.dispose();
            this._cancel = undefined;
        }
    }
    onDidChangeTextDocument({ document, contentChanges, reason }) {
        if (contentChanges.length === 0 || reason === vscode.TextDocumentChangeReason.Undo || reason === vscode.TextDocumentChangeReason.Redo) {
            return;
        }
        const activeDocument = vscode.window.activeTextEditor?.document;
        if (document !== activeDocument) {
            return;
        }
        const filepath = this.client.toOpenTsFilePath(document);
        if (!filepath) {
            return;
        }
        if (typeof this._timeout !== 'undefined') {
            clearTimeout(this._timeout);
        }
        if (this._cancel) {
            this._cancel.cancel();
            this._cancel.dispose();
            this._cancel = undefined;
        }
        const lastChange = contentChanges[contentChanges.length - 1];
        const lastCharacter = lastChange.text[lastChange.text.length - 1];
        if (lastChange.rangeLength > 0 || lastCharacter !== '>' && lastCharacter !== '/') {
            return;
        }
        const priorCharacter = lastChange.range.start.character > 0
            ? document.getText(new vscode.Range(lastChange.range.start.translate({ characterDelta: -1 }), lastChange.range.start))
            : '';
        if (priorCharacter === '>') {
            return;
        }
        const version = document.version;
        this._timeout = setTimeout(async () => {
            this._timeout = undefined;
            if (this._disposed) {
                return;
            }
            const addedLines = lastChange.text.split(/\r\n|\n/g);
            const position = addedLines.length <= 1
                ? lastChange.range.start.translate({ characterDelta: lastChange.text.length })
                : new vscode.Position(lastChange.range.start.line + addedLines.length - 1, addedLines[addedLines.length - 1].length);
            const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
            this._cancel = new vscode.CancellationTokenSource();
            const response = await this.client.execute('jsxClosingTag', args, this._cancel.token);
            if (response.type !== 'response' || !response.body) {
                return;
            }
            if (this._disposed) {
                return;
            }
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                return;
            }
            const insertion = response.body;
            const activeDocument = activeEditor.document;
            if (document === activeDocument && activeDocument.version === version) {
                activeEditor.insertSnippet(this.getTagSnippet(insertion), this.getInsertionPositions(activeEditor, position));
            }
        }, 100);
    }
    getTagSnippet(closingTag) {
        const snippet = new vscode.SnippetString();
        snippet.appendPlaceholder('', 0);
        snippet.appendText(closingTag.newText);
        return snippet;
    }
    getInsertionPositions(editor, position) {
        const activeSelectionPositions = editor.selections.map(s => s.active);
        return activeSelectionPositions.some(p => p.isEqual(position))
            ? activeSelectionPositions
            : position;
    }
}
function requireActiveDocumentSetting(selector, language) {
    return new dependentRegistration_1.Condition(() => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !vscode.languages.match(selector, editor.document)) {
            return false;
        }
        return !!(0, configuration_1.readUnifiedConfig)('autoClosingTags.enabled', true, { scope: editor.document, fallbackSection: language.id, fallbackSubSectionNameOverride: 'autoClosingTags' });
    }, handler => {
        return vscode.Disposable.from(vscode.window.onDidChangeActiveTextEditor(handler), vscode.workspace.onDidOpenTextDocument(handler), vscode.workspace.onDidChangeConfiguration(handler));
    });
}
function register(selector, language, client) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        requireActiveDocumentSetting(selector.syntax, language)
    ], () => new TagClosing(client));
}
//# sourceMappingURL=tagClosing.js.map