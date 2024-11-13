/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecOptionsWithStringEncoding, execSync } from 'child_process';
import { FigSpec, Option, Subcommand, Suggestion } from './types';

function getBuiltinCommands(shell: string): string[] | undefined {
	try {
		const shellType = path.basename(shell);
		const options: ExecOptionsWithStringEncoding = { encoding: 'utf-8', shell };
		switch (shellType) {
			case 'bash': {
				const bashOutput = execSync('compgen -b', options);
				const bashResult = bashOutput.split('\n').filter(cmd => cmd);
				if (bashResult.length) {
					return bashResult;
				}
				break;
			}
			case 'zsh': {
				const zshOutput = execSync('printf "%s\\n" ${(k)builtins}', options);
				const zshResult = zshOutput.split('\n').filter(cmd => cmd);
				if (zshResult.length) {
					return zshResult;
				}
			}
			case 'fish': {
				// TODO: ghost text in the command line prevents
				// completions from working ATM for fish
				const fishOutput = execSync('functions -n', options);
				const fishResult = fishOutput.split(', ').filter(cmd => cmd);
				if (fishResult.length) {
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

async function findFiles(dir: string, ext: string): Promise<string[]> {
	let results: string[] = [];
	const list = await fs.readdir(dir, { withFileTypes: true });
	for (const file of list) {
		const filePath = path.resolve(dir, file.name);
		if (file.isDirectory()) {
			results = results.concat(await findFiles(filePath, ext));
		} else if (file.isFile() && file.name.endsWith(ext)) {
			results.push(filePath);
		}
	}
	return results;
}


async function getCompletionSpecs(commands: Set<string>): Promise<FigSpec[] | undefined> {
	const completionSpecs: FigSpec[] = [];
	try {
		const dirPath = path.resolve(__dirname, 'autocomplete');
		const files = await findFiles(dirPath, '.js');

		const filtered = files.filter(file => commands.has(path.basename(file).replace('.js', '')));
		if (filtered.length === 0) {
			return;
		}

		for (const file of filtered) {
			try {
				const module = await import(file);
				if (module.default && 'name' in module.default) {
					completionSpecs.push(module.default);
				} else {
					console.warn(`No default export found in ${file} ${JSON.stringify(module)}`);
				}
			} catch (e) {
				console.warn('Error importing completion spec:', file);
				continue;
			}
		}

	} catch (error) {
		console.warn(`Error importing completion specs: ${error.message}`);
	}
	return completionSpecs;
}

vscode.window.registerTerminalCompletionProvider({
	id: 'terminal-suggest',
	async provideTerminalCompletions(terminal: vscode.Terminal, terminalContext: { commandLine: string; cursorPosition: number }, token: vscode.CancellationToken): Promise<vscode.TerminalCompletionItem[] | undefined> {
		if (token.isCancellationRequested) {
			return;
		}

		// TODO: Cache available commands
		const availableCommands = await getCommandsInPath();
		if (!availableCommands) {
			return;
		}

		const specs = await getCompletionSpecs(availableCommands);
		if (!specs) {
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

		for (const spec of specs) {
			const commandName = getLabel(spec);
			if (!commandName || !availableCommands.has(commandName)) {
				continue;
			}

			if (commandName.startsWith(prefix)) {
				result.push(createCompletionItem(terminalContext.cursorPosition, prefix, commandName, spec.description));
			}
		}

		return result.length ? result : undefined;
	}
});

function getLabel(spec: FigSpec | Option | Subcommand | Suggestion): string | undefined {
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
		replacementIndex: cursorPosition - prefix.length,
		replacementLength: label.length - prefix.length,
	};
}

async function getCommandsInPath(): Promise<Set<string> | undefined> {
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
	return executables;
}

function getPrefix(commandLine: string, cursorPosition: number): string | undefined {
	// Check if cursor is not at the end and there's non-whitespace after the cursor
	if (cursorPosition < commandLine.length && /\S/.test(commandLine[cursorPosition])) {
		return undefined;
	}

	// Extract the part of the line up to the cursor position
	const beforeCursor = commandLine.slice(0, cursorPosition);

	// Find the last word boundary before the cursor
	const match = beforeCursor.match(/\b\w+$/);
	console.log('match', match, 'before cursor', beforeCursor);

	// Return the match if found, otherwise undefined
	return match ? match[0] : undefined;
}

