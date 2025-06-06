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
	
	// If there's no content after separator (empty or only whitespace), 
	// check if there's at least one space for command mode
	if (afterSeparator.trim() === '') {
		// If there's at least one space after separator, it's command mode
		// If there's no space (cursor immediately after separator), it's argument mode
		return afterSeparator.length > 0 ? TokenType.Command : TokenType.Argument;
	}
	
	// For the remaining cases, use a simpler heuristic:
	// Look at the trimmed content after separator and see if it looks like we're still
	// in the process of typing a command (vs clearly in arguments)
	
	const trimmedAfterSeparator = afterSeparator.trim();
	
	// If no spaces at all, definitely command
	if (trimmedAfterSeparator.indexOf(' ') === -1) {
		return TokenType.Command;
	}
	
	// If there are spaces, we need to be smarter
	// Heuristic: if the text after separator looks like it has just one word and some
	// partial typing, consider it command mode. Otherwise, argument mode.
	const words = trimmedAfterSeparator.split(/\s+/).filter(w => w.length > 0);
	
	// Single complete word followed by more text usually means arguments
	if (words.length >= 2) {
		// But if it's just 2 words and the second is very short (1-2 chars), 
		// it might still be command completion
		if (words.length === 2 && words[1].length <= 2) {
			return TokenType.Command;
		}
		return TokenType.Argument;
	}
	
	// Single word - check if cursor is clearly past it with trailing space
	if (words.length === 1) {
		const separatorEndPos = lastSeparatorIndex + 1;
		const leadingWhitespace = afterSeparator.length - trimmedAfterSeparator.length;
		const trimmedStartPos = separatorEndPos + leadingWhitespace;
		const wordEndPos = trimmedStartPos + words[0].length;
		
		// If cursor is past the word with trailing space, it's argument mode
		if (ctx.cursorPosition > wordEndPos) {
			return TokenType.Argument;
		}
		return TokenType.Command;
	}
	
	// Default to command mode for edge cases
	return TokenType.Command;
}
