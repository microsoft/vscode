/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
	const disposable = vscode.commands.registerCommand('helloWorld.hello', () => {
		vscode.window.showInformationMessage('Hello World from VS Code!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate(): void {
	// Nothing to clean up
}