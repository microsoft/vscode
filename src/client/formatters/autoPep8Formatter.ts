"use strict";

import * as vscode from "vscode";
import {BaseFormatter} from "./baseFormatter";
import * as settings from "../common/configSettings";

export class AutoPep8Formatter extends BaseFormatter {
    constructor(protected outputChannel: vscode.OutputChannel, protected pythonSettings: settings.IPythonSettings, protected workspaceRootPath: string) {
        super("autopep8", outputChannel, pythonSettings, workspaceRootPath);
    }

    public formatDocument(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        let autopep8Path = this.pythonSettings.formatting.autopep8Path;
        return super.provideDocumentFormattingEdits(document, options, token, `${autopep8Path} --diff`);
    }
}