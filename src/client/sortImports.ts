"use strict";

import * as vscode from "vscode";
import * as sortProvider from "./providers/importSortProvider";

export function activate(context: vscode.ExtensionContext) {
    let rootDir = context.asAbsolutePath(".");
    let disposable = vscode.commands.registerCommand("python.sortImports", () => {
        let activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.languageId !== "python") {
            vscode.window.showErrorMessage("Please open a Python source file to sort the imports.");
            return;
        }
        new sortProvider.PythonImportSortProvider().sortImports(rootDir, activeEditor.document).then(changes => {
            if (changes.length === 0) {
                return;
            }

            activeEditor.edit(builder => {
                changes.forEach(change => builder.replace(change.range, change.newText));
            });
        }).catch(error => {
            let message = typeof error === "string" ? error : (error.message ? error.message : error);
            vscode.window.showErrorMessage(message);
        });
    });

    context.subscriptions.push(disposable);
}