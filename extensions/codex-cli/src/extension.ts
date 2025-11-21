/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
	const disposable = vscode.commands.registerCommand('codex.runTask', () => {
		vscode.window.showInformationMessage('Codex: Run Task (stub)');
	});

	context.subscriptions.push(disposable);
}

export function deactivate(): void {
	// No-op for now
}
