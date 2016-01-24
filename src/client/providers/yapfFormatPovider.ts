/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';

export class PythonYapfFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
    private rootDir:string= "";
    public constructor(rootDir) {
        this.rootDir = rootDir;
    }

    public provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        var yapfPath = vscode.workspace.getConfiguration("python").get<string>("formatting.yapfPath", "");
        var fileDir = path.dirname(document.uri.fsPath);
        if (yapfPath.trim().length === 0){
            yapfPath = "python " + path.join(this.rootDir, "pythonFiles", "formatYapf.py");
        }
        return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            var filePath = document.uri.fsPath;
            if (!fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`File ${filePath} does not exist`)
                return resolve([]);
            }

            child_process.exec(`${yapfPath} "${filePath}"`, {cwd:fileDir}, (error, stdout, stderr) => {
                if ((error || stderr) && (typeof stdout !== "string" || stdout.length === 0)) {
                    var errorMsg = (error && error.message) ? error.message : (stderr && stderr.length > 0 ? stderr.toString("utf-8") : "");
                    vscode.window.showErrorMessage(`There was an error in formatting the document. View the console log for details. ${errorMsg}`);
                    console.error(errorMsg);
                    return resolve([]);
                }
                
                //Nothing to do
                var formattedText = stdout.toString('utf-8');
                if (document.getText() === formattedText) {
                    return resolve([]);
                }

                var range = new vscode.Range(document.lineAt(0).range.start, document.lineAt(document.lineCount - 1).range.end)
                var txtEdit = new vscode.TextEdit(range, formattedText);
                resolve([txtEdit]);
            });
        });
    }
}
