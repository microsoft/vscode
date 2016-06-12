'use strict';

import * as vscode from 'vscode';
import * as sortProvider from './providers/importSortProvider';

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
