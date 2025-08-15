/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { OperatingSystem } from '../../../../../base/common/platform.js';
import { isPowerShell } from './runInTerminalHelpers.js';

function createNumberRange(start: number, end: number): string[] {
	const result: string[] = [];
	for (let i = start; i <= end; i++) {
		result.push(i.toString());
	}
	return result;
}

function flatMapRedirection(range: string[], mapper: (n: string) => string[]): string[] {
	const result: string[] = [];
	for (const item of range) {
		result.push(...mapper(item));
	}
	return result;
}

function sortByStringLengthDesc(arr: string[]): string[] {
	return [...arr].sort((a, b) => b.length - a.length);
}

// Derived from https://github.com/microsoft/vscode/blob/315b0949786b3807f05cb6acd13bf0029690a052/extensions/terminal-suggest/src/tokens.ts#L14-L18
// Some of these can match the same string, so the order matters.
//
// This isn't perfect, at some point it would be better off moving over to tree sitter for this
// instead of simple string matching.
const shellTypeResetChars: { [key: string]: string[] } = {
	'sh': sortByStringLengthDesc([
		// Redirection docs (bash) https://www.gnu.org/software/bash/manual/html_node/Redirections.html
		...createNumberRange(1, 9).concat('').map(n => `${n}<<<`), // Here strings
		...flatMapRedirection(createNumberRange(1, 9).concat(''), n => createNumberRange(1, 9).map(m => `${n}>&${m}`)), // Redirect stream to stream
		...createNumberRange(1, 9).concat('').map(n => `${n}<>`),  // Open file descriptor for reading and writing
		...createNumberRange(1, 9).concat('&', '').map(n => `${n}>>`),
		...createNumberRange(1, 9).concat('&', '').map(n => `${n}>`),
		'0<', '||', '&&', '|&', '<<', '&', ';', '{', '>', '<', '|'
	]),
	'zsh': sortByStringLengthDesc([
		// Redirection docs https://zsh.sourceforge.io/Doc/Release/Redirection.html
		...createNumberRange(1, 9).concat('').map(n => `${n}<<<`), // Here strings
		...flatMapRedirection(createNumberRange(1, 9).concat(''), n => createNumberRange(1, 9).map(m => `${n}>&${m}`)), // Redirect stream to stream
		...createNumberRange(1, 9).concat('').map(n => `${n}<>`),  // Open file descriptor for reading and writing
		...createNumberRange(1, 9).concat('&', '').map(n => `${n}>>`),
		...createNumberRange(1, 9).concat('&', '').map(n => `${n}>`),
		'<(', '||', '>|', '>!', '&&', '|&', '&', ';', '{', '<(', '<', '|'
	]),
	'pwsh': sortByStringLengthDesc([
		// Redirection docs: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_redirection?view=powershell-7.5
		...flatMapRedirection(createNumberRange(1, 6).concat('*', ''), n => createNumberRange(1, 6).map(m => `${n}>&${m}`)), // Stream to stream redirection
		...createNumberRange(1, 6).concat('*', '').map(n => `${n}>>`),
		...createNumberRange(1, 6).concat('*', '').map(n => `${n}>`),
		'&&', '<', '|', ';', '!', '&'
	])
};

/**
 * Simple quote-aware command parser that respects shell quoting rules.
 * This is a minimal tree-sitter-like implementation focused on fixing the quoted string issue.
 */
function parseCommandWithQuotes(commandLine: string): string[] {
	const commands: string[] = [];
	let current = '';
	let inQuote = false;
	let quoteChar = '';
	let i = 0;
	
	// Operators that separate commands (in order of length for proper matching)
	const operators = ['&&', '||', '|&', '<<<', '>>', '>&', '<>', '|', '&', ';', '>', '<'];
	
	function isOperatorAt(pos: number): string | null {
		for (const op of operators) {
			if (commandLine.substring(pos, pos + op.length) === op) {
				return op;
			}
		}
		return null;
	}
	
	while (i < commandLine.length) {
		const char = commandLine[i];
		
		if (inQuote) {
			// We're inside a quote, look for the closing quote
			current += char;
			if (char === quoteChar && (i === 0 || commandLine[i - 1] !== '\\')) {
				// Found unescaped closing quote
				inQuote = false;
				quoteChar = '';
			}
		} else {
			// We're not in a quote
			if (char === '"' || char === "'") {
				// Starting a quoted section
				inQuote = true;
				quoteChar = char;
				current += char;
			} else {
				// Check if we hit an operator
				const operator = isOperatorAt(i);
				if (operator) {
					// Found an operator, save current command and skip operator
					if (current.trim()) {
						commands.push(current.trim());
					}
					current = '';
					i += operator.length - 1; // -1 because loop will increment
				} else {
					current += char;
				}
			}
		}
		i++;
	}
	
	// Add the last command if any
	if (current.trim()) {
		commands.push(current.trim());
	}
	
	return commands;
}

/**
 * Split command line into sub-commands using quote-aware parsing.
 * This properly handles shell syntax including quotes, unlike the naive string splitting.
 */
function splitCommandLineIntoSubCommandsWithQuoteAwareness(commandLine: string, envShell: string, envOS: OperatingSystem): string[] {
	if (!commandLine.trim()) {
		return [];
	}

	try {
		// Use quote-aware parsing
		return parseCommandWithQuotes(commandLine);
	} catch (error) {
		// If parsing fails, fall back to the original implementation
		console.warn('Quote-aware parsing failed, falling back to string splitting:', error);
		return splitCommandLineIntoSubCommandsLegacy(commandLine, envShell, envOS);
	}
}

/**
 * Legacy implementation using string splitting (kept as fallback).
 */
function splitCommandLineIntoSubCommandsLegacy(commandLine: string, envShell: string, envOS: OperatingSystem): string[] {
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
	const resetChars = shellTypeResetChars[shellType];
	if (resetChars) {
		for (const chars of resetChars) {
			for (let i = 0; i < subCommands.length; i++) {
				const subCommand = subCommands[i];
				if (subCommand.indexOf(chars) !== -1) {
					subCommands.splice(i, 1, ...subCommand.split(chars).map(e => e.trim()));
					i--;
				}
			}
		}
	}
	return subCommands.filter(e => e.length > 0);
}

export function splitCommandLineIntoSubCommands(commandLine: string, envShell: string, envOS: OperatingSystem): string[] {
	return splitCommandLineIntoSubCommandsWithQuoteAwareness(commandLine, envShell, envOS);
}

export function extractInlineSubCommands(commandLine: string, envShell: string, envOS: OperatingSystem): string[] {
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

	// Remove duplicates and return as array
	const uniqueCommands: string[] = [];
	for (const cmd of inlineCommands) {
		if (uniqueCommands.indexOf(cmd) === -1) {
			uniqueCommands.push(cmd);
		}
	}
	
	return uniqueCommands;
}