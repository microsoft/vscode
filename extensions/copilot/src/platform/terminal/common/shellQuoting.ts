/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Quotes a value so a shell passes it along as a single, literal argument.
 *
 * Single quotes are preferred over double quotes because they suppress variable expansion
 * and command substitution outright, instead of relying on every special character (`$`,
 * a backtick, a backslash) being individually escaped.
 *
 * @param value The value to quote.
 * @param shell The detected shell, from `vscode.TerminalState.shell`. Shells that are unknown
 * or not listed fall back to POSIX rules.
 */
export function quoteShellArgument(value: string, shell: string | undefined): string {
	switch (shell) {
		case 'pwsh':
			// A single-quoted PowerShell string is literal; an embedded ' is escaped by doubling it.
			return `'${value.replace(/'/g, `''`)}'`;
		case 'cmd':
			// cmd.exe quotes only with double quotes and has no escape character inside them, so
			// an embedded " cannot be represented and is dropped rather than split the argument.
			return `"${value.replace(/"/g, '')}"`;
		default:
			// In POSIX shells everything inside single quotes is literal, so an embedded ' is
			// produced by closing the quote, escaping the quote, then reopening.
			return `'${value.replace(/'/g, `'\\''`)}'`;
	}
}
