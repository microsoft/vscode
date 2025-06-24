/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('joshbot.remoteAgent', async (args: any) => {
		// args may include chat history or other context from the chat widget
		const chatHistory = args?.chatHistory ?? [];
		// Implement your agent logic here
		const response = `JoshBot received ${chatHistory.length} messages. Hello from JoshBot!`;
		vscode.window.showInformationMessage(response);
		// Optionally, return a result to the chat system
		return { response };
	});

	context.subscriptions.push(disposable);
}

export function deactivate() { }
