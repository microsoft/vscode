"use strict";

import * as vscode from "vscode";
import {BaseFormatter} from "./baseFormatter";
import * as settings from "./../common/configSettings";

export class YapfFormatter extends BaseFormatter {
    constructor(outputChannel: vscode.OutputChannel) {
        super("yapf", outputChannel);
    }

    public formatDocument(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        let yapfPath = this.pythonSettings.formatting.yapfPath;
        return super.provideDocumentFormattingEdits(document, options, token, `${yapfPath} --diff`);
    }
}