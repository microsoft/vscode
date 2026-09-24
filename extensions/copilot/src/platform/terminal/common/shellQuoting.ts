/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Quotes a value so that typing it into a terminal passes it to the shell as a single, literal
 * argument. Single quotes keep a typed line break inside the argument instead of running it.
 *
 * @param value The value to quote.
 * @param shell The detected shell, from `vscode.TerminalState.shell`.
 * @returns The quoted value, or `undefined` if it can't be quoted safely for the shell.
 */
export function quoteShellArgument(value: string, shell: string | undefined): string | undefined {
	// Typed control characters are line-editor commands, e.g. Backspace can erase the opening quote.
	if (/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(value)) {
		return undefined;
	}

	switch (shell) {
		case 'bash':
		case 'gitbash':
		case 'ksh':
		case 'sh':
		case 'zsh':
			return `'${value.replace(/'/g, `'\\''`)}'`;
		case 'fish':
			// fish treats \' and \\ as escapes inside single quotes.
			return `'${value.replace(/[\\']/g, '\\$&')}'`;
		case 'pwsh':
			// Windows PowerShell 5.1 doesn't escape " when passing arguments to programs, and a
			// trailing \ escapes the closing quote it adds.
			if (value.includes('"') || value.endsWith('\\')) {
				return undefined;
			}
			// Typographic single quotes also end the string; each kind is escaped by doubling it.
			return `'${value.replace(/['\u2018\u2019\u201a\u201b]/g, '$&$&')}'`;
		default:
			// For example, cmd.exe expands %VAR% inside quotes and runs each line as it's entered.
			return undefined;
	}
}
