/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// import * as which from 'which';

export async function activate(context: vscode.ExtensionContext): Promise<void> {

	(vscode as any).registerTerminalCompletionProvider({
		async provideTerminalCompletions(terminal: vscode.Terminal, context: any, token: vscode.CancellationToken) {
			if (token.isCancellationRequested) {
				return;
			}
			if (context.shellType === 'pwsh') {
				return;
			}
			const commandLine = context.commandLine;
			if (commandLine.startsWith('cd')) {
				return [
					{
						label: 'foo',
						kind: (vscode as any).TerminalCompletionItemKind.Flag,
						description: 'bar'
					},
				];
			}
			return;
		},
	});

}
