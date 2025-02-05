/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalShellType } from './terminalSuggestMain';

export const enum TokenType {
	Command,
	Argument,
}

const shellTypeResetChars: { [key: number]: string[] | undefined } = {
	[TerminalShellType.Bash]: ['>', '>>', '<', '2>', '2>>', '&>', '&>>', '|', '|&', '&&', '||', '&', ';', '(', '{', '<<'],
	[TerminalShellType.Zsh]: ['>', '>>', '<', '2>', '2>>', '&>', '&>>', '<>', '|', '|&', '&&', '||', '&', ';', '(', '{', '<<', '<<<', '<('],
	[TerminalShellType.PowerShell]: ['>', '>>', '<', '2>', '2>>', '*>', '*>>', '|', '-and', '-or', '-not', '!', '&', '-eq', '-ne', '-gt', '-lt', '-ge', '-le', '-like', '-notlike', '-match', '-notmatch', '-contains', '-notcontains', '-in', '-notin']
};

const defaultShellTypeResetChars = shellTypeResetChars[TerminalShellType.Bash]!;

export function getTokenType(ctx: { commandLine: string; cursorPosition: number }, shellType: TerminalShellType | undefined): TokenType {
	const spaceIndex = ctx.commandLine.substring(0, ctx.cursorPosition).lastIndexOf(' ');
	if (spaceIndex === -1) {
		return TokenType.Command;
	}
	const previousTokens = ctx.commandLine.substring(0, spaceIndex + 1).trim();
	const commandResetChars = shellType === undefined ? defaultShellTypeResetChars : shellTypeResetChars[shellType] ?? defaultShellTypeResetChars;
	if (commandResetChars.some(e => previousTokens.endsWith(e))) {
		return TokenType.Command;
	}
	return TokenType.Argument;
}
