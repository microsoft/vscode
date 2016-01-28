'use strict';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as sortProvider from './providers/importSortProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    var rootDir = context.asAbsolutePath(".");
    var disposable = vscode.commands.registerCommand('python.sortImports', () => {
        
        var activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            new sortProvider.PythonImportSortProvider().sortImports(rootDir, activeEditor.document).then(changes=> {
                if (!Array.isArray(changes) || changes.length === 0) {
                    return;
                }

                activeEditor.edit(builder=> {
                    builder.replace(changes[0].range, changes[0].newText)
                });
            });
        }
    });


    context.subscriptions.push(disposable);
}
