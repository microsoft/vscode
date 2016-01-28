/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import {BaseFormatter} from './baseFormatter';
import * as settings from './../common/configSettings';

export class AutoPep8Formatter extends BaseFormatter {
    private pythonSettings: settings.IPythonSettings;
    constructor(settings: settings.IPythonSettings, outputChannel:vscode.OutputChannel) {
        super("autopep8", outputChannel);
        this.pythonSettings = settings;
    }

    public formatDocument(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
        var autopep8Path = this.pythonSettings.formatting.autopep8Path;
        var fileDir = path.dirname(document.uri.fsPath);
        return super.provideDocumentFormattingEdits(document, options, token, `${autopep8Path} ${document.uri.fsPath}`);
    }
}