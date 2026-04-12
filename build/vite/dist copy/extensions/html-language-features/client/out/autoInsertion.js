"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateAutoInsertion = activateAutoInsertion;
const vscode_1 = require("vscode");
function activateAutoInsertion(provider, languageParticipants, runtime) {
    const disposables = [];
    vscode_1.workspace.onDidChangeTextDocument(onDidChangeTextDocument, null, disposables);
    let anyIsEnabled = false;
    const isEnabled = {
        'autoQuote': false,
        'autoClose': false
    };
    updateEnabledState();
    vscode_1.window.onDidChangeActiveTextEditor(updateEnabledState, null, disposables);
    let timeout = undefined;
    disposables.push({
        dispose: () => {
            timeout?.dispose();
        }
    });
    function updateEnabledState() {
        anyIsEnabled = false;
        const editor = vscode_1.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const document = editor.document;
        if (!languageParticipants.useAutoInsert(document.languageId)) {
            return;
        }
        const configurations = vscode_1.workspace.getConfiguration(undefined, document.uri);
        isEnabled['autoQuote'] = configurations.get('html.autoCreateQuotes') ?? false;
        isEnabled['autoClose'] = configurations.get('html.autoClosingTags') ?? false;
        anyIsEnabled = isEnabled['autoQuote'] || isEnabled['autoClose'];
    }
    function onDidChangeTextDocument({ document, contentChanges, reason }) {
        if (!anyIsEnabled || contentChanges.length === 0 || reason === vscode_1.TextDocumentChangeReason.Undo || reason === vscode_1.TextDocumentChangeReason.Redo) {
            return;
        }
        const activeDocument = vscode_1.window.activeTextEditor && vscode_1.window.activeTextEditor.document;
        if (document !== activeDocument) {
            return;
        }
        if (timeout) {
            timeout.dispose();
        }
        const lastChange = contentChanges[contentChanges.length - 1];
        if (lastChange.rangeLength === 0 && isSingleLine(lastChange.text)) {
            const lastCharacter = lastChange.text[lastChange.text.length - 1];
            if (isEnabled['autoQuote'] && lastCharacter === '=') {
                doAutoInsert('autoQuote', document, lastChange);
            }
            else if (isEnabled['autoClose'] && (lastCharacter === '>' || lastCharacter === '/')) {
                doAutoInsert('autoClose', document, lastChange);
            }
        }
    }
    function isSingleLine(text) {
        return !/\n/.test(text);
    }
    function doAutoInsert(kind, document, lastChange) {
        const rangeStart = lastChange.range.start;
        const version = document.version;
        timeout = runtime.timer.setTimeout(() => {
            const position = new vscode_1.Position(rangeStart.line, rangeStart.character + lastChange.text.length);
            provider(kind, document, position).then(text => {
                if (text && isEnabled[kind]) {
                    const activeEditor = vscode_1.window.activeTextEditor;
                    if (activeEditor) {
                        const activeDocument = activeEditor.document;
                        if (document === activeDocument && activeDocument.version === version) {
                            const selections = activeEditor.selections;
                            if (selections.length && selections.some(s => s.active.isEqual(position))) {
                                activeEditor.insertSnippet(new vscode_1.SnippetString(text), selections.map(s => s.active));
                            }
                            else {
                                activeEditor.insertSnippet(new vscode_1.SnippetString(text), position);
                            }
                        }
                    }
                }
            });
            timeout = undefined;
        }, 100);
    }
    return vscode_1.Disposable.from(...disposables);
}
//# sourceMappingURL=autoInsertion.js.map