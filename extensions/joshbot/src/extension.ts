/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.log('JoshBot extension is now active!');

	const disposable = vscode.commands.registerCommand('joshbot.hello', () => {
		vscode.window.showInformationMessage('Hello from JoshBot!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {
	// This method is called when the extension is deactivated
}
