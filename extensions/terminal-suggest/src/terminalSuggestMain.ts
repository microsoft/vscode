/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecOptionsWithStringEncoding, execSync } from 'child_process';
import completionSpec from './completions/code-insiders';

let cachedAvailableCommands: Set<string> | undefined;
let cachedBuiltinCommands: Map<string, string[]> | undefined;

function getBuiltinCommands(shell: string): string[] | undefined {
	try {
		const shellType = path.basename(shell);
		const cachedCommands = cachedBuiltinCommands?.get(shellType);
		if (cachedCommands) {
			return cachedCommands;
		}
		const options: ExecOptionsWithStringEncoding = { encoding: 'utf-8', shell };
		switch (shellType) {
			case 'bash': {
				const bashOutput = execSync('compgen -b', options);
				const bashResult = bashOutput.split('\n').filter(cmd => cmd);
				if (bashResult.length) {
					cachedBuiltinCommands?.set(shellType, bashResult);
					return bashResult;
				}
				break;
			}
			case 'zsh': {
				const zshOutput = execSync('printf "%s\\n" ${(k)builtins}', options);
				const zshResult = zshOutput.split('\n').filter(cmd => cmd);
				if (zshResult.length) {
					cachedBuiltinCommands?.set(shellType, zshResult);
					return zshResult;
				}
			}
			case 'fish': {
				// TODO: ghost text in the command line prevents
				// completions from working ATM for fish
				const fishOutput = execSync('functions -n', options);
				const fishResult = fishOutput.split(', ').filter(cmd => cmd);
				if (fishResult.length) {
					cachedBuiltinCommands?.set(shellType, fishResult);
					return fishResult;
				}
				break;
			}
		}
		// native pwsh completions are builtin to vscode
		return;

	} catch (error) {
		console.error('Error fetching builtin commands:', error);
		return;
	}
}

vscode.window.registerTerminalCompletionProvider({
	id: 'terminal-suggest',
	async provideTerminalCompletions(terminal: vscode.Terminal, terminalContext: { commandLine: string; cursorPosition: number }, token: vscode.CancellationToken): Promise<vscode.TerminalCompletionItem[] | undefined> {
		if (token.isCancellationRequested) {
			return;
		}

		const availableCommands = await getCommandsInPath();
		if (!availableCommands) {
			return;
		}

		// TODO: Leverage shellType when available https://github.com/microsoft/vscode/issues/230165
		const shellPath = 'shellPath' in terminal.creationOptions ? terminal.creationOptions.shellPath : vscode.env.shell;
		if (!shellPath) {
			return;
		}

		const builtinCommands = getBuiltinCommands(shellPath);
		builtinCommands?.forEach(command => availableCommands.add(command));

		const prefix = getPrefix(terminalContext.commandLine, terminalContext.cursorPosition);
		if (prefix === undefined) {
			return;
		}

		const result: vscode.TerminalCompletionItem[] = [];
		if (!('options' in completionSpec) || !completionSpec.options) {
			return;
		}

		for (const spec of completionSpec.options) {
			const label = getLabel(spec);
			if (!label) {
				continue;
			}
			if (label.startsWith(prefix)) {
				result.push(createCompletionItem(terminalContext.cursorPosition, prefix, label, spec.description));
			}
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		for (const command of availableCommands) {
			if (command.startsWith(prefix)) {
				result.push(createCompletionItem(terminalContext.cursorPosition, prefix, command));
			}
		}

		if (token.isCancellationRequested) {
			return undefined;
		}
		return result.length ? result : undefined;
	}
});

function getLabel(spec: Fig.Spec): string | undefined {
	if (typeof spec.name === 'string') {
		return spec.name;
	}
	if (!Array.isArray(spec.name) || spec.name.length === 0) {
		return;
	}
	return spec.name[0];
}

function createCompletionItem(cursorPosition: number, prefix: string, label: string, description?: string): vscode.TerminalCompletionItem {
	return {
		label,
		isFile: false,
		isDirectory: false,
		detail: description ?? '',
		replacementIndex: prefix === '' ? 0 : cursorPosition - prefix.length,
		replacementLength: label.length - prefix.length,
	};
}

async function getCommandsInPath(): Promise<Set<string> | undefined> {
	if (cachedAvailableCommands) {
		return cachedAvailableCommands;
	}
	const paths = os.platform() === 'win32' ? process.env.PATH?.split(';') : process.env.PATH?.split(':');
	if (!paths) {
		return;
	}

	const executables = new Set<string>();
	for (const path of paths) {
		try {
			const dirExists = await fs.stat(path).then(stat => stat.isDirectory()).catch(() => false);
			if (!dirExists) {
				continue;
			}
			const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(path));
			for (const [file, fileType] of files) {
				if (fileType === vscode.FileType.File) {
					executables.add(file);
				}
			}
		} catch (e) {
			// Ignore errors for directories that can't be read
			continue;
		}
	}
	cachedAvailableCommands = executables;
	return executables;
}

function getPrefix(commandLine: string, cursorPosition: number): string | undefined {
	// Return an empty string if the command line is empty after trimming
	if (commandLine.trim() === '') {
		return '';
	}

	// Check if cursor is not at the end and there's non-whitespace after the cursor
	if (cursorPosition < commandLine.length && /\S/.test(commandLine[cursorPosition])) {
		return undefined;
	}

	// Extract the part of the line up to the cursor position
	const beforeCursor = commandLine.slice(0, cursorPosition);

	// Find the last word boundary before the cursor
	const match = beforeCursor.match(/[\w-]+$/);

	// Return the match if found, otherwise undefined
	return match ? match[0] : undefined;
}

