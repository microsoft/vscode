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
exports.runSelectedScript = runSelectedScript;
exports.selectAndRunScriptFromFolder = selectAndRunScriptFromFolder;
const vscode = __importStar(require("vscode"));
const tasks_1 = require("./tasks");
function runSelectedScript(context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const document = editor.document;
    const contents = document.getText();
    const script = (0, tasks_1.findScriptAtPosition)(editor.document, contents, editor.selection.anchor);
    if (script) {
        (0, tasks_1.runScript)(context, script, document);
    }
    else {
        const message = vscode.l10n.t("Could not find a valid npm script at the selection.");
        vscode.window.showErrorMessage(message);
    }
}
async function selectAndRunScriptFromFolder(context, selectedFolders) {
    if (selectedFolders.length === 0) {
        return;
    }
    const selectedFolder = selectedFolders[0];
    const taskList = await (0, tasks_1.detectNpmScriptsForFolder)(context, selectedFolder);
    if (taskList && taskList.length > 0) {
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Select an npm script to run in folder';
        quickPick.items = taskList;
        const toDispose = [];
        const pickPromise = new Promise((c) => {
            toDispose.push(quickPick.onDidAccept(() => {
                toDispose.forEach(d => d.dispose());
                c(quickPick.selectedItems[0]);
            }));
            toDispose.push(quickPick.onDidHide(() => {
                toDispose.forEach(d => d.dispose());
                c(undefined);
            }));
        });
        quickPick.show();
        const result = await pickPromise;
        quickPick.dispose();
        if (result) {
            vscode.tasks.executeTask(result.task);
        }
    }
    else {
        vscode.window.showInformationMessage(`No npm scripts found in ${selectedFolder.fsPath}`, { modal: true });
    }
}
//# sourceMappingURL=commands.js.map