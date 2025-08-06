/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
	// Register the hello command
	const helloCommand = vscode.commands.registerCommand('helloWorld.hello', () => {
		const message = 'Hello World from VS Code!';
		vscode.window.showInformationMessage(message, 'Show Again', 'Copy to Clipboard').then(selection => {
			if (selection === 'Show Again') {
				vscode.window.showInformationMessage('Hello again! 👋');
			} else if (selection === 'Copy to Clipboard') {
				vscode.env.clipboard.writeText(message);
				vscode.window.showInformationMessage('Message copied to clipboard!');
			}
		});
	});

	context.subscriptions.push(helloCommand);
}

export function deactivate(): void {
	// Extension is being deactivated
}