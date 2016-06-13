"use strict";

import * as vscode from "vscode";
import * as path from "path";
import {BaseFormatter} from "./baseFormatter";
import * as settings from "./../common/configSettings";
import {sendCommand} from "./../common/childProc";
import * as fs from "fs";
import {getTextEditsFromPatch} from "./../common/editor";

export class YapfFormatter extends BaseFormatter {
    constructor(outputChannel: vscode.OutputChannel) {
        super("yapf", outputChannel);
    }

    public formatDocument(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        let yapfPath = this.pythonSettings.formatting.yapfPath;
        let fileDir = path.dirname(document.uri.fsPath);
        let commandLine = `${yapfPath} "${document.uri.fsPath}" --diff`;

        return document.save().then(saved => {
            let filePath = document.uri.fsPath;
            if (!fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`File ${filePath} does not exist`)
                return [];
            }

            this.outputChannel.clear();

            return sendCommand(commandLine, fileDir).then(data => {
                return getTextEditsFromPatch(document.getText(), data);
            }).catch(errorMsg => {
                this.outputChannel.appendLine(errorMsg);
                throw new Error(`There was an error in formatting the document. View the Python output window for details.`);
            });
        });
    }
}