/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';
import * as vscode from 'vscode';

export function activateIndentFormatProvider(context: vscode.ExtensionContext) {
    let disposable = vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument);

    context.subscriptions.push(disposable);
}

function onDidChangeTextDocument(eventArgs: vscode.TextDocumentChangeEvent) {
    if (eventArgs.contentChanges.length !== 1 && eventArgs.contentChanges[0].text !== "\r\n") {
        return;
    }


}