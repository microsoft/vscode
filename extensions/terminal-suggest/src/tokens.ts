/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalShellType } from './terminalSuggestMain';


export const enum TokenType {
	Command,
	Argument,
}

const shellTypeResetChars = new Map<TerminalShellType, string[]>([
	[TerminalShellType.Bash, ['>', '>>', '<', '2>', '2>>', '&>', '&>>', '|', '|&', '&&', '||', '&', ';', '(', '{', '<<']],
	[TerminalShellType.Zsh, ['>', '>>', '<', '2>', '2>>', '&>', '&>>', '<>', '|', '|&', '&&', '||', '&', ';', '(', '{', '<<', '<<<', '<(']],
	[TerminalShellType.PowerShell, ['>', '>>', '<', '2>', '2>>', '*>', '*>>', '|', '-and', '-or', '-not', '!', '&', ';', '-eq', '-ne', '-gt', '-lt', '-ge', '-le', '-like', '-notlike', '-match', '-notmatch', '-contains', '-notcontains', '-in', '-notin']]
]);

// Command separators that start new command contexts (vs logical operators that stay in argument context)
const shellTypeCommandSeparators = new Map<TerminalShellType, string[]>([
	[TerminalShellType.Bash, ['|', '|&', '&&', '||', '&', ';', '(', '{']],
	[TerminalShellType.Zsh, ['|', '|&', '&&', '||', '&', ';', '(', '{']],
	[TerminalShellType.PowerShell, ['|', '&', ';']]
]);

const defaultShellTypeResetChars = shellTypeResetChars.get(TerminalShellType.Bash)!;
const defaultShellTypeCommandSeparators = shellTypeCommandSeparators.get(TerminalShellType.Bash)!;

export { shellTypeResetChars, defaultShellTypeResetChars, shellTypeCommandSeparators, defaultShellTypeCommandSeparators };

export function getTokenType(ctx: { commandLine: string; cursorPosition: number }, shellType: TerminalShellType | undefined): TokenType {
	const beforeCursor = ctx.commandLine.substring(0, ctx.cursorPosition);
	const commandResetChars = shellType === undefined ? defaultShellTypeResetChars : shellTypeResetChars.get(shellType) ?? defaultShellTypeResetChars;
	
	// Check if the text before cursor ends with any reset character AND has whitespace after it
	const trimmedBeforeCursor = beforeCursor.trim();
	for (const separator of commandResetChars) {
		if (trimmedBeforeCursor.endsWith(separator)) {
			// Check if there's whitespace after the separator in the original (non-trimmed) text
			const separatorEndIndex = beforeCursor.lastIndexOf(separator) + separator.length;
			if (separatorEndIndex < ctx.cursorPosition && /\s/.test(ctx.commandLine[separatorEndIndex])) {
				return TokenType.Command;
			}
			// If cursor is immediately after separator with no space, don't show suggestions
			if (separatorEndIndex === ctx.cursorPosition) {
				return TokenType.Argument; // Don't show command suggestions
			}
		}
	}
	
	// Find the last command separator (that starts a new command context)
	const commandSeparators = shellType === undefined ? defaultShellTypeCommandSeparators : shellTypeCommandSeparators.get(shellType) ?? defaultShellTypeCommandSeparators;
	let lastSeparatorIndex = -1;
	for (const separator of commandSeparators) {
		const index = beforeCursor.lastIndexOf(separator);
		if (index > lastSeparatorIndex) {
			lastSeparatorIndex = index + separator.length - 1;
		}
	}
	
	// Get the text after the last separator (or from the beginning if no separator found)
	const afterSeparator = lastSeparatorIndex >= 0 ? beforeCursor.slice(lastSeparatorIndex + 1) : beforeCursor;
	
	// Check if the content after separator contains a space (indicating we have command + args)
	const trimmedAfterSeparator = afterSeparator.trim();
	const spaceIndex = trimmedAfterSeparator.indexOf(' ');
	if (spaceIndex === -1) {
		// No space found, so we're still in the command part
		return TokenType.Command;
	}
	
	// We have a space, so check if cursor is in the command part or argument part
	const commandPart = trimmedAfterSeparator.substring(0, spaceIndex);
	
	// Calculate position within the afterSeparator text
	const leadingWhitespace = afterSeparator.length - trimmedAfterSeparator.length;
	const positionInTrimmed = ctx.cursorPosition - (lastSeparatorIndex + 1) - leadingWhitespace;
	
	if (positionInTrimmed <= commandPart.length) {
		return TokenType.Command;
	}
	
	return TokenType.Argument;
}
