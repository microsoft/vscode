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
 * - "|" → Command (empty input shows available commands)
 * - "git|" → Command (typing command name)
 * - "git |" → Argument (cursor after command with space)
 * - "git status|" → Argument (cursor in arguments)
 * - "ls && |" → Command (new command after separator with space)
 * - "ls &&|" → Argument (cursor immediately after separator, no space)
 * - "git commit ; |" → Command (new command after semicolon with space)
 * - "git commit ;|" → Argument (cursor immediately after semicolon, no space)
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
	// this indicates we're at the start of a new command context
	// Examples: "ls && |" → Command, "|" → Command, "ls &&|" → Argument (no space)
	if (afterSeparator.trim() === '') {
		// For empty input or separator with trailing space, show commands
		// For cursor immediately after separator with no space, don't show suggestions
		return afterSeparator.length > 0 || lastSeparatorIndex === -1 ? TokenType.Command : TokenType.Argument;
	}

	const trimmedAfterSeparator = afterSeparator.trim();
	
	// If the trimmed text contains a space, we're clearly in argument mode
	// Examples: "git status --all|" → Argument, "ls && git status|" → Argument
	if (trimmedAfterSeparator.includes(' ')) {
		return TokenType.Argument;
	}

	// If there's a trailing space after the command name, we're in argument mode
	// Examples: "git |" → Argument, "ls && git |" → Argument
	if (afterSeparator.endsWith(' ')) {
		return TokenType.Argument;
	}

	// No spaces and no trailing space means we're still typing the command name
	// Examples: "git|" → Command, "ls && git|" → Command
	return TokenType.Command;
}
