/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	// Register the Hello World command
	const disposable = vscode.commands.registerCommand('hello-world.helloWorld', () => {
		// Show a Hello World message
		vscode.window.showInformationMessage('Hello World from VS Code!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {
	// This method is called when your extension is deactivated
}