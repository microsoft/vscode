"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = void 0;
const vscode = require("vscode");
const model_1 = require("./model");
function register(tree, context) {
    function findLocations(title, command) {
        if (vscode.window.activeTextEditor) {
            const input = new model_1.ReferencesTreeInput(title, new vscode.Location(vscode.window.activeTextEditor.document.uri, vscode.window.activeTextEditor.selection.active), command);
            tree.setInput(input);
        }
    }
    context.subscriptions.push(vscode.commands.registerCommand('references-view.findReferences', () => findLocations('References', 'vscode.executeReferenceProvider')), vscode.commands.registerCommand('references-view.findImplementations', () => findLocations('Implementations', 'vscode.executeImplementationProvider')), 
    // --- legacy name
    vscode.commands.registerCommand('references-view.find', (...args) => vscode.commands.executeCommand('references-view.findReferences', ...args)), vscode.commands.registerCommand('references-view.removeReferenceItem', removeReferenceItem), vscode.commands.registerCommand('references-view.copy', copyCommand), vscode.commands.registerCommand('references-view.copyAll', copyAllCommand), vscode.commands.registerCommand('references-view.copyPath', copyPathCommand));
    // --- references.preferredLocation setting
    let showReferencesDisposable;
    const config = 'references.preferredLocation';
    function updateShowReferences(event) {
        if (event && !event.affectsConfiguration(config)) {
            return;
        }
        const value = vscode.workspace.getConfiguration().get(config);
        showReferencesDisposable?.dispose();
        showReferencesDisposable = undefined;
        if (value === 'view') {
            showReferencesDisposable = vscode.commands.registerCommand('editor.action.showReferences', async (uri, position, locations) => {
                const input = new model_1.ReferencesTreeInput(vscode.l10n.t('References'), new vscode.Location(uri, position), 'vscode.executeReferenceProvider', locations);
                tree.setInput(input);
            });
        }
    }
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(updateShowReferences));
    context.subscriptions.push({ dispose: () => showReferencesDisposable?.dispose() });
    updateShowReferences();
}
exports.register = register;
const copyAllCommand = async (item) => {
    if (item instanceof model_1.ReferenceItem) {
        copyCommand(item.file.model);
    }
    else if (item instanceof model_1.FileItem) {
        copyCommand(item.model);
    }
};
function removeReferenceItem(item) {
    if (item instanceof model_1.FileItem) {
        item.remove();
    }
    else if (item instanceof model_1.ReferenceItem) {
        item.remove();
    }
}
async function copyCommand(item) {
    let val;
    if (item instanceof model_1.ReferencesModel) {
        val = await item.asCopyText();
    }
    else if (item instanceof model_1.ReferenceItem) {
        val = await item.asCopyText();
    }
    else if (item instanceof model_1.FileItem) {
        val = await item.asCopyText();
    }
    if (val) {
        await vscode.env.clipboard.writeText(val);
    }
}
async function copyPathCommand(item) {
    if (item instanceof model_1.FileItem) {
        if (item.uri.scheme === 'file') {
            vscode.env.clipboard.writeText(item.uri.fsPath);
        }
        else {
            vscode.env.clipboard.writeText(item.uri.toString(true));
        }
    }
}
//# sourceMappingURL=index.js.map