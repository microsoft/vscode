/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// import * as which from 'which';

export async function activate(context: vscode.ExtensionContext): Promise<void> {

	(vscode as any).window.registerTerminalCompletionProvider({
		async provideTerminalCompletions(terminal: vscode.Terminal, terminalContext: { shellType: string; commandLine: string }, token: vscode.CancellationToken) {
			if (token.isCancellationRequested) {
				return;
			}
			if (terminalContext.shellType === 'pwsh') {
				return;
			}
			const commandLine = terminalContext.commandLine;
			// if (commandLine.startsWith('cd')) {
			return [
				{
					label: commandLine,
					kind: (vscode as any).TerminalCompletionItemKind.Flag,
					detail: 'type is ' + terminalContext.shellType,
					documentation: 'This is a test',
				},
			];
			// }
			return;
		},
	});

}
