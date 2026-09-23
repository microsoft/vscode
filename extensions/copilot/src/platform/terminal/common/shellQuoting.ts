/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Quotes a value so that typing it into a terminal running the given shell passes it along as a
 * single, literal argument.
 *
 * Typed text reaches the shell's line editor before its parser: every line break is an Enter key
 * press, and control characters trigger editing commands. Single quotes are used because they
 * suppress expansion and substitution outright, instead of relying on every special character
 * being escaped, and they let a line break continue the argument rather than run the command.
 *
 * @param value The value to quote.
 * @param shell The detected shell, from `vscode.TerminalState.shell`.
 * @returns The quoted value, or `undefined` if it cannot be quoted safely for the shell, in which
 * case it must not be sent to the terminal.
 */
export function quoteShellArgument(value: string, shell: string | undefined): string | undefined {
	// Typed control characters are line-editor commands; for example, Backspace can erase the
	// opening quote and Escape clears the line in PSReadLine. No quoting can contain them.
	if (/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(value)) {
		return undefined;
	}

	switch (shell) {
		case 'bash':
		case 'gitbash':
		case 'ksh':
		case 'sh':
		case 'zsh':
			// Everything inside POSIX single quotes is literal, so an embedded ' is produced by
			// closing the quote, escaping the quote, then reopening.
			return `'${value.replace(/'/g, `'\\''`)}'`;
		case 'fish':
			// fish treats \' and \\ as escapes even inside single quotes.
			return `'${value.replace(/[\\']/g, '\\$&')}'`;
		case 'pwsh':
			// Legacy native argument passing, the default in Windows PowerShell 5.1, does not escape
			// an embedded double quote when building a program's command line, so the quote splits
			// the argument. It also lets a trailing backslash escape the closing quote it adds.
			if (value.includes('"') || value.endsWith('\\')) {
				return undefined;
			}
			// PowerShell also ends a single-quoted string at typographic single quotes, and each kind
			// of quote is escaped by doubling it.
			return `'${value.replace(/['\u2018\u2019\u201a\u201b]/g, '$&$&')}'`;
		default:
			// cmd.exe expands %VAR% inside quotes and runs each line as soon as it is entered, csh
			// expands ! inside single quotes and cannot continue them onto a new line, nu has no
			// escape for a single quote, and the rules of other or undetected shells are unknown.
			return undefined;
	}
}
