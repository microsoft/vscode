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

/**
 * Determines whether the cursor position in a command line represents a command or argument context.
 * This is used to provide appropriate terminal suggestions - commands vs arguments/flags.
 * 
 * @param ctx - Context containing the command line text and cursor position
 * @param shellType - The type of shell (bash, zsh, powershell) to determine appropriate separators
 * @returns TokenType.Command for command context, TokenType.Argument for argument context
 * 
 * Examples:
 * - "git |" → Command (cursor after space following separator)
 * - "git;" → Argument (cursor immediately after separator, no space)
 * - "ls && git |" → Command (git is new command after &&)
 * - "git status |" → Argument (cursor is in arguments of git command)
 * - "git s|" → Command (partial command name)
 * - "git status --all |" → Argument (cursor in arguments area)
 */
export function getTokenType(ctx: { commandLine: string; cursorPosition: number }, shellType: TerminalShellType | undefined): TokenType {
	const beforeCursor = ctx.commandLine.substring(0, ctx.cursorPosition);
	const commandResetChars = shellType === undefined ? defaultShellTypeResetChars : shellTypeResetChars.get(shellType) ?? defaultShellTypeResetChars;
	
	// Check if the text before cursor ends with any reset character AND has whitespace after it
	// Examples: "git commit ; |" → Command, "git commit;|" → Argument (no space after separator)
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
	// Examples: in "ls && git status", find the "&&" separator
	const commandSeparators = shellType === undefined ? defaultShellTypeCommandSeparators : shellTypeCommandSeparators.get(shellType) ?? defaultShellTypeCommandSeparators;
	let lastSeparatorIndex = -1;
	for (const separator of commandSeparators) {
		const index = beforeCursor.lastIndexOf(separator);
		if (index > lastSeparatorIndex) {
			lastSeparatorIndex = index + separator.length - 1;
		}
	}
	
	// Get the text after the last separator (or from the beginning if no separator found)
	// Examples: "ls && git status" → "git status", "git status" → "git status"
	const afterSeparator = lastSeparatorIndex >= 0 ? beforeCursor.slice(lastSeparatorIndex + 1) : beforeCursor;
	
	// If there's no content after separator (empty or only whitespace), 
	// check if there's at least one space for command mode
	// Examples: "ls && |" → Command, "ls &&|" → Argument
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
	// Examples: "ls && git|" → Command, "ls && g|" → Command
	if (trimmedAfterSeparator.indexOf(' ') === -1) {
		return TokenType.Command;
	}
	
	// If there are spaces, we need to be smarter
	// Heuristic: if the text after separator looks like it has just one word and some
	// partial typing, consider it command mode. Otherwise, argument mode.
	const words = trimmedAfterSeparator.split(/\s+/).filter(w => w.length > 0);
	
	// Single complete word followed by more text usually means arguments
	// Examples: "git status --all|" → Argument, "git s|" → Command (short second word)
	if (words.length >= 2) {
		// But if it's just 2 words and the second is very short (1-2 chars), 
		// it might still be command completion
		// Examples: "git s|" → Command, "git status|" → Argument
		if (words.length === 2 && words[1].length <= 2) {
			return TokenType.Command;
		}
		return TokenType.Argument;
	}
	
	// Single word - check if cursor is clearly past it with trailing space
	// Examples: "git |" → Argument, "gi|" → Command
	if (words.length === 1) {
		const separatorEndPos = lastSeparatorIndex + 1;
		const leadingWhitespace = afterSeparator.length - trimmedAfterSeparator.length;
		const trimmedStartPos = separatorEndPos + leadingWhitespace;
		const wordEndPos = trimmedStartPos + words[0].length;
		
		// If cursor is past the word with trailing space, it's argument mode
		// Examples: "git |" → Argument, "gi|" → Command
		if (ctx.cursorPosition > wordEndPos) {
			return TokenType.Argument;
		}
		return TokenType.Command;
	}
	
	// Default to command mode for edge cases
	return TokenType.Command;
}
