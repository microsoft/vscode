/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalShellType } from './terminalSuggestMain';


export const enum TokenType {
	Command,
	Argument,
}

export const shellTypeResetChars = new Map<TerminalShellType, string[]>([
	[TerminalShellType.Bash, ['>', '>>', '<', '2>', '2>>', '&>', '&>>', '|', '|&', '&&', '||', '&', ';', '(', '{', '<<']],
	[TerminalShellType.Zsh, ['>', '>>', '<', '2>', '2>>', '&>', '&>>', '<>', '|', '|&', '&&', '||', '&', ';', '(', '{', '<<', '<<<', '<(']],
	[TerminalShellType.PowerShell, ['>', '>>', '<', '2>', '2>>', '*>', '*>>', '|', ';', ' -and ', ' -or ', ' -not ', '!', '&', ' -eq ', ' -ne ', ' -gt ', ' -lt ', ' -ge ', ' -le ', ' -like ', ' -notlike ', ' -match ', ' -notmatch ', ' -contains ', ' -notcontains ', ' -in ', ' -notin ']]
]);

export const defaultShellTypeResetChars = shellTypeResetChars.get(TerminalShellType.Bash)!;

export function getTokenType(ctx: { commandLine: string; cursorIndex: number }, shellType: TerminalShellType | undefined): TokenType {
	const commandLine = ctx.commandLine;
	const cursorPosition = ctx.cursorIndex;
	const commandResetChars = shellType === undefined ? defaultShellTypeResetChars : shellTypeResetChars.get(shellType) ?? defaultShellTypeResetChars;

	// Check for reset char before the current word
	const beforeCursor = commandLine.substring(0, cursorPosition);
	const wordStart = beforeCursor.lastIndexOf(' ') + 1;
	const beforeWord = commandLine.substring(0, wordStart);

	// Look for " <reset char> " before the word
	for (const resetChar of commandResetChars) {
		const pattern = shellType === TerminalShellType.PowerShell ? `${resetChar}` : ` ${resetChar} `;
		if (beforeWord.endsWith(pattern)) {
			return TokenType.Command;
		}
	}

	// Fallback to original logic for the very first command
	const spaceIndex = beforeCursor.lastIndexOf(' ');
	if (spaceIndex === -1) {
		return TokenType.Command;
	}
	const previousTokens = beforeCursor.substring(0, spaceIndex + 1).trim();
	if (commandResetChars.some(e => previousTokens.endsWith(e))) {
		return TokenType.Command;
	}
	return TokenType.Argument;
}
