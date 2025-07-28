/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
	console.log('Hello World extension is now active!');

	// Register the "Hello World" command
	const disposable = vscode.commands.registerCommand('hello-world.helloWorld', () => {
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from VS Code!');
	});

	// Register a command that shows workspace information
	const workspaceInfoDisposable = vscode.commands.registerCommand('hello-world.showWorkspaceInfo', () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const message = workspaceFolders
			? `You have ${workspaceFolders.length} workspace folder(s) open`
			: 'No workspace folder is open';
		vscode.window.showInformationMessage(message);
	});

	context.subscriptions.push(disposable, workspaceInfoDisposable);
}

export function deactivate(): void {
	// This method is called when your extension is deactivated
}