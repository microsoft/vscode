/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// import * as which from 'which';

const commonCommands: string[] = ['cd', 'ls', 'which', 'echo'];

export async function activate(context: vscode.ExtensionContext): Promise<void> {

	(vscode as any).window.registerTerminalCompletionProvider({
		async provideTerminalCompletions(terminal: vscode.Terminal, terminalContext: { shellType: string; commandLine: string }, token: vscode.CancellationToken) {
			if (token.isCancellationRequested) {
				return;
			}
			if (terminalContext.shellType === 'pwsh') {
				return;
			}

			const fuzzyMatch = (pattern: string, str: string) => {
				const patternLower = pattern.toLowerCase();
				const strLower = str.toLowerCase();
				let patternIndex = 0;
				for (let i = 0; i < strLower.length; i++) {
					if (strLower[i] === patternLower[patternIndex]) {
						patternIndex++;
					}
					if (patternIndex === patternLower.length) {
						return true;
					}
				}
				return false;
			};

			const commandLine = terminalContext.commandLine;
			const filteredCommands = commonCommands.filter(command => fuzzyMatch(commandLine, command));
			if (filteredCommands.length) {
				const result = filteredCommands.map(command => {
					return {
						label: command,
						kind: (vscode as any).TerminalCompletionItemKind.Method,
						detail: 'detail',
						documentation: 'This is a test',
					};
				});
				return result;
			}
			return;
		}
	});

}
