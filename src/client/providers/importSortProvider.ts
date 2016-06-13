"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as child_process from "child_process";
import {getTextEditsFromPatch} from "../common/editor";

export class PythonImportSortProvider {
    public sortImports(extensionDir: string, document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
        if (document.lineCount === 1) {
            return Promise.resolve([]);
        }
        let filePath = document.uri.fsPath;
        let importScript = path.join(extensionDir, "pythonFiles", "sortImports.py");
        return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            let ext = path.extname(filePath);
            let tmp = require("tmp");
            tmp.file({ postfix: ext }, function (err, tmpFilePath, fd) {
                if (err) {
                    return reject(err);
                }
                fs.writeFile(tmpFilePath, document.getText(), ex => {
                    if (ex) {
                        return reject(`Failed to create a temporary file, ${ex.message}`);
                    }

                    child_process.exec(`python "${importScript}" "${tmpFilePath}" --diff`, (error, stdout, stderr) => {
                        if (error || (stderr && stderr.length > 0)) {
                            return reject(error ? error : stderr);
                        }

                        let formattedText = stdout;
                        let edits = getTextEditsFromPatch(document.getText(), stdout);
                        resolve(edits);
                    });
                });
            });
        });
    }
}