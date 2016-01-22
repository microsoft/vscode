/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { dirname, basename } from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';

const AUTOPEP8_COMMANDLINE = "autopep8";

export class PythonAutoPep8FormattingEditProvider implements vscode.DocumentFormattingEditProvider {
    public constructor() {
    }

    public provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            var filePath = document.uri.fsPath;
            if (!fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`File ${filePath} does not exist`)
                return resolve([]);
            }

            child_process.exec(`${AUTOPEP8_COMMANDLINE} "${filePath}"`, (error, stdout, stderr) => {
                if (error || stderr) {
                    vscode.window.showErrorMessage(`File ${filePath} does not exist`)
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
