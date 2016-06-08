'use strict';

import vscode = require('vscode');
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';

export class PythonImportSortProvider {
    public sortImports(extensionDir: string, document: vscode.TextDocument): Thenable<vscode.TextEdit[]> {
        return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            var filePath = document.uri.fsPath;
            var importScript = path.join(extensionDir, "pythonFiles", "sortImports.py");
            if (!fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`File ${filePath} does not exist`)
                return resolve([]);
            }

            var ext = path.extname(filePath);
            var tmp = require("tmp");
            tmp.file({ postfix: ext }, function _tempFileCreated(err, tmpFilePath, fd) {
                if (err) {
                    reject(err);
                    return;
                }
                var documentText = document.getText();
                fs.writeFile(tmpFilePath, documentText, ex=> {
                    if (ex) {
                        vscode.window.showErrorMessage(`Failed to create a temporary file, ${ex.message}`);
                        return;
                    }

                    child_process.exec(`python "${importScript}" "${tmpFilePath}"`, (error, stdout, stderr) => {
                        if (error || stderr) {
                            vscode.window.showErrorMessage(`File ${filePath} does not exist`)
                            return resolve([]);
                        }

                        fs.readFile(tmpFilePath, (ex, data) => {
                            if (ex) {
                                vscode.window.showErrorMessage(`Failed to create a temporary file for sorting, ${ex.message}`);
                                return;
                            }

                            var formattedText = data.toString('utf-8');
                            //Nothing to do 
                            if (document.getText() === formattedText) {
                                return resolve([]);
                            }

                            var range = new vscode.Range(document.lineAt(0).range.start, document.lineAt(document.lineCount - 1).range.end)
                            var txtEdit = new vscode.TextEdit(range, formattedText);
                            resolve([txtEdit]);
                        });
                    });
                });
            });

        });
    }
}
