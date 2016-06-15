"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {sendCommand} from "./../common/childProc";
import * as settings from "./../common/configSettings";
import {getTextEdits} from "./../common/editor";

export abstract class BaseFormatter {
    public Id: string;
    protected outputChannel: vscode.OutputChannel;
    protected pythonSettings: settings.IPythonSettings;

    constructor(id: string, outputChannel: vscode.OutputChannel) {
        this.Id = id;
        this.outputChannel = outputChannel;
        this.pythonSettings = settings.PythonSettings.getInstance();
    }

    public abstract formatDocument(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]>;

    protected provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken, cmdLine: string): Thenable<vscode.TextEdit[]> {
        // Todo: Save the contents of the file to a temporary file and format that instead saving the actual file
        // This could unnecessarily trigger other behaviours
        return document.save().then(saved => {
            let filePath = document.uri.fsPath;
            if (!fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`File ${filePath} does not exist`);
                return [];
            }

            this.outputChannel.clear();
            let fileDir = path.dirname(document.uri.fsPath);

            return sendCommand(cmdLine, fileDir).then(data => {
                return getTextEdits(document.getText(), data);
            }).catch(errorMsg => {
                this.outputChannel.appendLine(errorMsg);
                throw new Error(`There was an error in formatting the document. View the Python output window for details.`);
            });
        });
    }
}
