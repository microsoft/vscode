'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import {BaseFormatter} from './baseFormatter';
import * as settings from './../common/configSettings';

export class YapfFormatter extends BaseFormatter {
    constructor(outputChannel: vscode.OutputChannel) {
        super("yapf", outputChannel);
    }

    public formatDocument(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        var yapfPath = this.pythonSettings.formatting.yapfPath;
        var fileDir = path.dirname(document.uri.fsPath);
        return super.provideDocumentFormattingEdits(document, options, token, `${yapfPath} "${document.uri.fsPath}"`);
    }
}