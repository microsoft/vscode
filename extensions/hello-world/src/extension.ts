/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * This method is called when your extension is activated
 * Your extension is activated the very first time the command is executed
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Hello World extension is now active!');

	// Register the command that is defined in the package.json file
	const disposable = vscode.commands.registerCommand('helloWorld.sayHello', () => {
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from VS Code!');
	});

	context.subscriptions.push(disposable);

	// Log successful activation
	console.log('Hello World extension activated successfully');
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {
	console.log('Hello World extension is deactivated');
}