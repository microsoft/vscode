/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem, type OperatingSystem as OperatingSystemType } from '../../../../../base/common/platform.js';
import { isPowerShell } from './runInTerminalHelpers.js';

/**
 * Strips sub-shell wrappers from a command line to get the inner command for auto-approval.
 * For example, "powershell -command 'git status'" becomes "git status".
 */
export function stripSubShellWrappers(commandLine: string, shell: string, os: OperatingSystemType): string {
	const trimmed = commandLine.trim();

	// Handle PowerShell sub-shell wrappers
	if (isPowerShell(shell, os)) {
		// Match patterns like: powershell -command "..." or pwsh -c "..."
		const pwshMatch = trimmed.match(/^(?:powershell(?:\.exe)?|pwsh(?:\.exe)?)\s+(?:-command|-c)\s+['"](.+)['"]$/i);
		if (pwshMatch && pwshMatch[1]) {
			return stripSubShellWrappers(pwshMatch[1], shell, os);
		}

		// Match patterns like: powershell -command ... (without quotes)
		const pwshNoQuotesMatch = trimmed.match(/^(?:powershell(?:\.exe)?|pwsh(?:\.exe)?)\s+(?:-command|-c)\s+(.+)$/i);
		if (pwshNoQuotesMatch && pwshNoQuotesMatch[1]) {
			return stripSubShellWrappers(pwshNoQuotesMatch[1], shell, os);
		}
	}

	// Handle bash/sh sub-shell wrappers
	if (!isPowerShell(shell, os)) {
		// Match patterns like: bash -c "..." or sh -c "..."
		const bashMatch = trimmed.match(/^(?:bash|sh|zsh)\s+(?:-c|--command)\s+['"](.+)['"]$/i);
		if (bashMatch && bashMatch[1]) {
			return stripSubShellWrappers(bashMatch[1], shell, os);
		}

		// Match patterns like: bash -c ... (without quotes)
		const bashNoQuotesMatch = trimmed.match(/^(?:bash|sh|zsh)\s+(?:-c|--command)\s+(.+)$/i);
		if (bashNoQuotesMatch && bashNoQuotesMatch[1]) {
			return stripSubShellWrappers(bashNoQuotesMatch[1], shell, os);
		}
	}

	// Handle cmd.exe sub-shell wrappers (Windows)
	if (os === OperatingSystem.Windows) {
		// Match patterns like: cmd /c "..." or cmd.exe /c "..."
		const cmdMatch = trimmed.match(/^cmd(?:\.exe)?\s+\/c\s+['"](.+)['"]$/i);
		if (cmdMatch && cmdMatch[1]) {
			return stripSubShellWrappers(cmdMatch[1], shell, os);
		}

		// Match patterns like: cmd /c ... (without quotes)
		const cmdNoQuotesMatch = trimmed.match(/^cmd(?:\.exe)?\s+\/c\s+(.+)$/i);
		if (cmdNoQuotesMatch && cmdNoQuotesMatch[1]) {
			return stripSubShellWrappers(cmdNoQuotesMatch[1], shell, os);
		}
	}

	return trimmed;
}

function createNumberRange(start: number, end: number): string[] {
	return Array.from({ length: end - start + 1 }, (_, i) => (start + i).toString());
}

function sortByStringLengthDesc(arr: string[]): string[] {
	return [...arr].sort((a, b) => b.length - a.length);
}

// Derived from https://github.com/microsoft/vscode/blob/315b0949786b3807f05cb6acd13bf0029690a052/extensions/terminal-suggest/src/tokens.ts#L14-L18
// Some of these can match the same string, so the order matters.
//
// This isn't perfect, at some point it would be better off moving over to tree sitter for this
// instead of simple string matching.
const shellTypeResetChars = new Map<'sh' | 'zsh' | 'pwsh', string[]>([
	['sh', sortByStringLengthDesc([
		// Redirection docs (bash) https://www.gnu.org/software/bash/manual/html_node/Redirections.html
		...createNumberRange(1, 9).concat('').map(n => `${n}<<<`), // Here strings
		...createNumberRange(1, 9).concat('').flatMap(n => createNumberRange(1, 9).map(m => `${n}>&${m}`)), // Redirect stream to stream
		...createNumberRange(1, 9).concat('').map(n => `${n}<>`),  // Open file descriptor for reading and writing
		...createNumberRange(1, 9).concat('&', '').map(n => `${n}>>`),
		...createNumberRange(1, 9).concat('&', '').map(n => `${n}>`),
		'0<', '||', '&&', '|&', '<<', '&', ';', '{', '>', '<', '|'
	])],
	['zsh', sortByStringLengthDesc([
		// Redirection docs https://zsh.sourceforge.io/Doc/Release/Redirection.html
		...createNumberRange(1, 9).concat('').map(n => `${n}<<<`), // Here strings
		...createNumberRange(1, 9).concat('').flatMap(n => createNumberRange(1, 9).map(m => `${n}>&${m}`)), // Redirect stream to stream
		...createNumberRange(1, 9).concat('').map(n => `${n}<>`),  // Open file descriptor for reading and writing
		...createNumberRange(1, 9).concat('&', '').map(n => `${n}>>`),
		...createNumberRange(1, 9).concat('&', '').map(n => `${n}>`),
		'<(', '||', '>|', '>!', '&&', '|&', '&', ';', '{', '<(', '<', '|'
	])],
	['pwsh', sortByStringLengthDesc([
		// Redirection docs: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_redirection?view=powershell-7.5
		...createNumberRange(1, 6).concat('*', '').flatMap(n => createNumberRange(1, 6).map(m => `${n}>&${m}`)), // Stream to stream redirection
		...createNumberRange(1, 6).concat('*', '').map(n => `${n}>>`),
		...createNumberRange(1, 6).concat('*', '').map(n => `${n}>`),
		'&&', '<', '|', ';', '!', '&'
	])],
]);

export function splitCommandLineIntoSubCommands(commandLine: string, envShell: string, envOS: OperatingSystemType): string[] {
	let shellType: 'sh' | 'zsh' | 'pwsh';
	const envShellWithoutExe = envShell.replace(/\.exe$/, '');
	if (isPowerShell(envShell, envOS)) {
		shellType = 'pwsh';
	} else {
		switch (envShellWithoutExe) {
			case 'zsh': shellType = 'zsh'; break;
			default: shellType = 'sh'; break;
		}
	}
	const subCommands = [commandLine];
	const resetChars = shellTypeResetChars.get(shellType);
	if (resetChars) {
		for (const chars of resetChars) {
			for (let i = 0; i < subCommands.length; i++) {
				const subCommand = subCommands[i];
				if (subCommand.includes(chars)) {
					subCommands.splice(i, 1, ...subCommand.split(chars).map(e => e.trim()));
					i--;
				}
			}
		}
	}
	return subCommands.filter(e => e.length > 0);
}

export function extractInlineSubCommands(commandLine: string, envShell: string, envOS: OperatingSystemType): Set<string> {
	const inlineCommands: string[] = [];
	const shellType = isPowerShell(envShell, envOS) ? 'pwsh' : 'sh';

	/**
	 * Extract command substitutions that start with a specific prefix and are enclosed in parentheses
	 * Handles nested parentheses correctly
	 */
	function extractWithPrefix(text: string, prefix: string): string[] {
		const results: string[] = [];
		let i = 0;

		while (i < text.length) {
			const startIndex = text.indexOf(prefix, i);
			if (startIndex === -1) {
				break;
			}

			const contentStart = startIndex + prefix.length;
			if (contentStart >= text.length || text[contentStart] !== '(') {
				i = startIndex + 1;
				continue;
			}

			// Find the matching closing parenthesis, handling nested parentheses
			let parenCount = 1;
			let j = contentStart + 1;

			while (j < text.length && parenCount > 0) {
				if (text[j] === '(') {
					parenCount++;
				} else if (text[j] === ')') {
					parenCount--;
				}
				j++;
			}

			if (parenCount === 0) {
				// Found matching closing parenthesis
				const innerCommand = text.substring(contentStart + 1, j - 1).trim();
				if (innerCommand) {
					results.push(innerCommand);
					// Recursively extract nested inline commands
					results.push(...extractInlineSubCommands(innerCommand, envShell, envOS));
				}
			}

			i = startIndex + 1;
		}

		return results;
	}

	/**
	 * Extract backtick command substitutions (legacy POSIX)
	 */
	function extractBackticks(text: string): string[] {
		const results: string[] = [];
		let i = 0;

		while (i < text.length) {
			const startIndex = text.indexOf('`', i);
			if (startIndex === -1) {
				break;
			}

			const endIndex = text.indexOf('`', startIndex + 1);
			if (endIndex === -1) {
				break;
			}

			const innerCommand = text.substring(startIndex + 1, endIndex).trim();
			if (innerCommand) {
				results.push(innerCommand);
				// Recursively extract nested inline commands
				results.push(...extractInlineSubCommands(innerCommand, envShell, envOS));
			}

			i = endIndex + 1;
		}

		return results;
	}

	if (shellType === 'pwsh') {
		// PowerShell command substitution patterns
		inlineCommands.push(...extractWithPrefix(commandLine, '$'));  // $(command)
		inlineCommands.push(...extractWithPrefix(commandLine, '@'));  // @(command)
		inlineCommands.push(...extractWithPrefix(commandLine, '&'));  // &(command)
	} else {
		// POSIX shell (bash, zsh, sh) command substitution patterns
		inlineCommands.push(...extractWithPrefix(commandLine, '$'));  // $(command)
		inlineCommands.push(...extractWithPrefix(commandLine, '<'));  // <(command) - process substitution
		inlineCommands.push(...extractWithPrefix(commandLine, '>'));  // >(command) - process substitution
		inlineCommands.push(...extractBackticks(commandLine));        // `command`
	}

	return new Set(inlineCommands);
}
