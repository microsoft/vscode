"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as child_process from "child_process";

export class PythonImportSortProvider {
    public sortImports(extensionDir: string, document: vscode.TextDocument): Thenable<vscode.TextEdit[]> {
        return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            let filePath = document.uri.fsPath;
            let importScript = path.join(extensionDir, "pythonFiles", "sortImports.py");
            if (!fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`File ${filePath} does not exist`);
                return resolve([]);
            }

            let ext = path.extname(filePath);
            let tmp = require("tmp");
            tmp.file({ postfix: ext }, function _tempFileCreated(err, tmpFilePath, fd) {
                if (err) {
                    reject(err);
                    return;
                }
                let documentText = document.getText();
                fs.writeFile(tmpFilePath, documentText, ex => {
                    if (ex) {
                        vscode.window.showErrorMessage(`Failed to create a temporary file, ${ex.message}`);
                        return;
                    }

                    child_process.exec(`python "${importScript}" "${tmpFilePath}"`, (error, stdout, stderr) => {
                        if (error || stderr) {
                            vscode.window.showErrorMessage(`File ${filePath} does not exist`);
                            return resolve([]);
                        }

                        fs.readFile(tmpFilePath, (ex, data) => {
                            if (ex) {
                                vscode.window.showErrorMessage(`Failed to create a temporary file for sorting, ${ex.message}`);
                                return;
                            }

                            let formattedText = data.toString("utf-8");
                            // Nothing to do 
                            if (document.getText() === formattedText) {
                                return resolve([]);
                            }

                            let range = new vscode.Range(document.lineAt(0).range.start, document.lineAt(document.lineCount - 1).range.end);
                            let txtEdit = new vscode.TextEdit(range, formattedText);
                            resolve([txtEdit]);
                        });
                    });
                });
            });

        });
    }
}
