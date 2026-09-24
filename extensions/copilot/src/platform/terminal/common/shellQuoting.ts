/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const agentCliShells: ReadonlySet<string> = new Set(['claude', 'codex', 'commandcode', 'copilot', 'gemini']);

/**
 * Builds a `git commit` command that commits with the given message when typed into a terminal
 * running the given shell. Known shells get single quotes, which keep the message intact, line
 * breaks included. Any other shell gets one `-m` per paragraph, reduced to characters that every
 * shell treats literally inside double quotes.
 *
 * @param message The commit message.
 * @param shell The detected shell, from `vscode.TerminalState.shell`.
 * @returns The command, or `undefined` if the terminal runs an agent CLI, whose prompt must not
 * receive the message, or if no text is left.
 */
export function buildGitCommitCommand(message: string, shell: string | undefined): string | undefined {
	if (shell !== undefined && agentCliShells.has(shell)) {
		return undefined;
	}

	// Typed control characters are line-editor commands, e.g. Backspace can erase the opening quote.
	message = message.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '');
	if (!message.trim()) {
		return undefined;
	}

	switch (shell) {
		case 'bash':
		case 'gitbash':
		case 'ksh':
		case 'sh':
		case 'zsh':
			return `git commit -m '${message.replace(/'/g, `'\\''`)}'`;
		case 'fish':
			// fish treats \' and \\ as escapes inside single quotes.
			return `git commit -m '${message.replace(/[\\']/g, '\\$&')}'`;
		case 'pwsh': {
			// Windows PowerShell 5.1 doesn't escape " when passing arguments to programs, and a
			// trailing \ escapes the closing quote it adds. git strips the space added after it.
			const value = message.replace(/"/g, `'`).replace(/\\$/, '\\ ');
			// Typographic single quotes also end the string; each kind is escaped by doubling it.
			return `git commit -m '${value.replace(/['\u2018\u2019\u201a\u201b]/g, '$&$&')}'`;
		}
		default: {
			// For example, cmd.exe runs each line as it's entered and expands %VAR% inside quotes.
			const paragraphs = message.split(/\n\s*\n/).map(toLiteral).filter(paragraph => paragraph.length > 0);
			return paragraphs.length > 0 ? `git commit ${paragraphs.map(paragraph => `-m "${paragraph}"`).join(' ')}` : undefined;
		}
	}
}

/**
 * Reduces a paragraph to a single line that any shell treats literally inside double quotes.
 */
function toLiteral(paragraph: string): string {
	return paragraph
		.replace(/["`\u201c\u201d\u201e\u2018\u2019\u201a\u201b]/g, `'`)
		.replace(/\\/g, '/')
		.replace(/[$!%]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}
