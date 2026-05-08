/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Launch the `sota` CLI inside the integrated terminal. Reuses an existing
 * terminal named "sota" when one is already open so the user doesn't end up
 * with a stack of identical terminals after multiple clicks.
 *
 * The optional `args` payload lets the status-bar quick-pick deep-link into
 * sub-commands (e.g. `sota resume`) without juggling a second command id.
 */
export function registerOpenCliInTerminalCommand(context: vscode.ExtensionContext): void {
	const handler = (payload?: { args?: string }): void => {
		const args = payload?.args ?? 'chat';
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		const existing = vscode.window.terminals.find(t => t.name === 'sota');
		const terminal = existing ?? vscode.window.createTerminal({
			name: 'sota',
			cwd,
		});
		terminal.show();
		terminal.sendText(`sota ${args}`);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.openCliHere', handler),
	);
}
