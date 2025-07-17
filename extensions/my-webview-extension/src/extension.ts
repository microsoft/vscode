/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('myWebview.start', () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showErrorMessage('❗ No active editor found. Please open an HTML file.');
      return;
    }

    const document = editor.document;

    if (document.languageId !== 'html') {
      vscode.window.showErrorMessage('❗ Only HTML files can be rendered in the webview.');
      return;
    }

    const htmlContent = document.getText();

    const panel = vscode.window.createWebviewPanel(
      'simpleWebview',
      'HTML Preview from File',
      vscode.ViewColumn.One,
      {
        enableScripts: true // If your HTML includes JavaScript
      }
    );

    panel.webview.html = htmlContent;
  });

  context.subscriptions.push(disposable);
}
