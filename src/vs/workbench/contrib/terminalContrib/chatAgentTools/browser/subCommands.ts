/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { OperatingSystem } from '../../../../../base/common/platform.js';
import { isPowerShell } from './runInTerminalHelpers.js';

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

export function splitCommandLineIntoSubCommands(commandLine: string, envShell: string, envOS: OperatingSystem): string[] {
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
