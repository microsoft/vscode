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
exports.insertModesValues = exports.Config = exports.joinLines = exports.wait = exports.CURSOR = void 0;
exports.rndName = rndName;
exports.createRandomFile = createRandomFile;
exports.deleteFile = deleteFile;
exports.withRandomFileEditor = withRandomFileEditor;
exports.createTestEditor = createTestEditor;
exports.assertEditorContents = assertEditorContents;
exports.updateConfig = updateConfig;
exports.enumerateConfig = enumerateConfig;
exports.onChangedDocument = onChangedDocument;
exports.retryUntilDocumentChanges = retryUntilDocumentChanges;
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path_1 = require("path");
const vscode = __importStar(require("vscode"));
function rndName() {
    let name = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 10; i++) {
        name += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return name;
}
function createRandomFile(contents = '', fileExtension = 'txt') {
    return new Promise((resolve, reject) => {
        const tmpFile = (0, path_1.join)(os.tmpdir(), rndName() + '.' + fileExtension);
        fs.writeFile(tmpFile, contents, (error) => {
            if (error) {
                return reject(error);
            }
            resolve(vscode.Uri.file(tmpFile));
        });
    });
}
function deleteFile(file) {
    return new Promise((resolve, reject) => {
        fs.unlink(file.fsPath, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(true);
            }
        });
    });
}
exports.CURSOR = '$$CURSOR$$';
function withRandomFileEditor(contents, fileExtension, run) {
    const cursorIndex = contents.indexOf(exports.CURSOR);
    return createRandomFile(contents.replace(exports.CURSOR, ''), fileExtension).then(file => {
        return vscode.workspace.openTextDocument(file).then(doc => {
            return vscode.window.showTextDocument(doc).then((editor) => {
                if (cursorIndex >= 0) {
                    const pos = doc.positionAt(cursorIndex);
                    editor.selection = new vscode.Selection(pos, pos);
                }
                return run(editor, doc).then(_ => {
                    if (doc.isDirty) {
                        return doc.save().then(() => {
                            return deleteFile(file);
                        });
                    }
                    else {
                        return deleteFile(file);
                    }
                });
            });
        });
    });
}
const wait = (ms) => new Promise(resolve => setTimeout(() => resolve(), ms));
exports.wait = wait;
const joinLines = (...args) => args.join(os.platform() === 'win32' ? '\r\n' : '\n');
exports.joinLines = joinLines;
async function createTestEditor(uri, ...lines) {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    await editor.insertSnippet(new vscode.SnippetString((0, exports.joinLines)(...lines)), new vscode.Range(0, 0, 1000, 0));
    return editor;
}
function assertEditorContents(editor, expectedDocContent, message) {
    const cursorIndex = expectedDocContent.indexOf(exports.CURSOR);
    assert.strictEqual(editor.document.getText(), expectedDocContent.replace(exports.CURSOR, ''), message);
    if (cursorIndex >= 0) {
        const expectedCursorPos = editor.document.positionAt(cursorIndex);
        assert.deepStrictEqual({ line: editor.selection.active.line, character: editor.selection.active.line }, { line: expectedCursorPos.line, character: expectedCursorPos.line }, 'Cursor position');
    }
}
async function updateConfig(documentUri, newConfig) {
    const oldConfig = {};
    const config = vscode.workspace.getConfiguration(undefined, documentUri);
    for (const configKey of Object.keys(newConfig)) {
        oldConfig[configKey] = config.get(configKey);
        await new Promise((resolve, reject) => config.update(configKey, newConfig[configKey], vscode.ConfigurationTarget.Global)
            .then(() => resolve(), reject));
    }
    return oldConfig;
}
exports.Config = Object.freeze({
    autoClosingBrackets: 'editor.autoClosingBrackets',
    completeFunctionCalls: 'js/ts.suggest.completeFunctionCalls',
    insertMode: 'editor.suggest.insertMode',
    snippetSuggestions: 'editor.snippetSuggestions',
    suggestSelection: 'editor.suggestSelection',
    quoteStyle: 'js/ts.preferences.quoteStyle',
});
exports.insertModesValues = Object.freeze(['insert', 'replace']);
async function enumerateConfig(documentUri, configKey, values, f) {
    for (const value of values) {
        const newConfig = { [configKey]: value };
        await updateConfig(documentUri, newConfig);
        await f(JSON.stringify(newConfig));
    }
}
function onChangedDocument(documentUri, disposables) {
    return new Promise(resolve => vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.toString() === documentUri.toString()) {
            resolve(e.document);
        }
    }, undefined, disposables));
}
async function retryUntilDocumentChanges(documentUri, options, disposables, exec) {
    const didChangeDocument = onChangedDocument(documentUri, disposables);
    let done = false;
    const result = await Promise.race([
        didChangeDocument,
        (async () => {
            for (let i = 0; i < options.retries; ++i) {
                await (0, exports.wait)(options.timeout);
                if (done) {
                    return;
                }
                await exec();
            }
        })(),
    ]);
    done = true;
    return result;
}
//# sourceMappingURL=testUtils.js.map