"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as child_process from "child_process";
import {getTextEditsFromPatch, getTempFileWithDocumentContents} from "../common/editor";

export class PythonImportSortProvider {
    public sortImports(extensionDir: string, document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
        if (document.lineCount === 1) {
            return Promise.resolve([]);
        }
        return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            // isort does have the ability to read from the process input stream and return the formatted code out of the output stream
            // However they don't support returning the diff of the formatted text when reading data from the input stream
            // Yes getting text formatted that way avoids having to create a temporary file, however the diffing will have
            // to be done here in node (extension), i.e. extension cpu, i.e. les responsive solution
            let importScript = path.join(extensionDir, "pythonFiles", "sortImports.py");
            let tmpFileCreated = document.isDirty;
            let filePromise = tmpFileCreated ? getTempFileWithDocumentContents(document) : Promise.resolve(document.fileName);
            filePromise.then(filePath => {
                child_process.exec(`python "${importScript}" "${filePath}" --diff`, (error, stdout, stderr) => {
                    if (tmpFileCreated) {
                        fs.unlink(filePath);
                    }
                    if (error || (stderr && stderr.length > 0)) {
                        return reject(error ? error : stderr);
                    }

                    let formattedText = stdout;
                    let edits = getTextEditsFromPatch(document.getText(), stdout);
                    resolve(edits);
                });
            }).catch(reject);
        });
    }
}