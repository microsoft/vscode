/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {sendCommand} from './../common/childProc';

export abstract class BaseFormatter {
    public Id: string;
    protected outputChannel: vscode.OutputChannel;

    constructor(id: string, outputChannel: vscode.OutputChannel) {
        this.Id = id;
        this.outputChannel = outputChannel;
    }
    public formatDocument(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        return Promise.resolve([]);
    }

    protected provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken, cmdLine: string): Thenable<vscode.TextEdit[]> {
        var fileDir = path.dirname(document.uri.fsPath);
        return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            document.save().then(saved=> {
                var filePath = document.uri.fsPath;
                if (!fs.existsSync(filePath)) {
                    vscode.window.showErrorMessage(`File ${filePath} does not exist`)
                    return resolve([]);
                }

                this.outputChannel.clear();

                sendCommand(cmdLine, fileDir).then(data=> {
                    var formattedText = data;
                    if (document.getText() === formattedText) {
                        return resolve([]);
                    }

                    var range = new vscode.Range(document.lineAt(0).range.start, document.lineAt(document.lineCount - 1).range.end)
                    var txtEdit = new vscode.TextEdit(range, formattedText);
                    resolve([txtEdit]);

                }, errorMsg => {
                    vscode.window.showErrorMessage(`There was an error in formatting the document. View the Python output window for details.`);
                    this.outputChannel.appendLine(errorMsg);
                    return resolve([]);
                });
            });
        });
    }
}
