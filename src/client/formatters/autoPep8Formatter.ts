"use strict";

import * as vscode from "vscode";
import {BaseFormatter} from "./baseFormatter";

export class AutoPep8Formatter extends BaseFormatter {
    constructor(outputChannel: vscode.OutputChannel) {
        super("autopep8", outputChannel);
    }

    public formatDocument(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        let autopep8Path = this.pythonSettings.formatting.autopep8Path;
        return super.provideDocumentFormattingEdits(document, options, token, `${autopep8Path} --diff`);
    }
}