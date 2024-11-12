/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { Arg, FigSpec, Option, Subcommand, Suggestion } from './types';
const builtinCommands: string[] | undefined = getBuiltinCommands();

// TODO: use shell type to determine which builtin commands to use
function getBuiltinCommands(): string[] | undefined {
	try {
		// bash
		const bashOutput = execSync('compgen -b', { encoding: 'utf-8' });
		const bashResult = bashOutput.split('\n').filter(cmd => cmd);
		if (bashResult.length) {
			return bashResult;
		}
		// zsh
		const zshOutput = execSync('printf "%s\n" ${(k)builtins}', { encoding: 'utf-8' });
		const zshResult = zshOutput.split('\n').filter(cmd => cmd);
		if (zshResult.length) {
			return zshResult;
		}
		// fish
		const fishOutput = execSync('functions -n', { encoding: 'utf-8' });
		const fishResult = fishOutput.split(', ').filter(cmd => cmd);
		if (fishResult.length) {
			return fishResult;
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


async function getCompletionSpecs(commands: Set<string>): Promise<FigSpec[]> {
	const completionSpecs: FigSpec[] = [];
	// TODO: try to use typescript instead?
	try {
		// Use a relative path to the autocomplete/src folder
		const dirPath = path.resolve(__dirname, 'autocomplete');
		const files = await findFiles(dirPath, '.js');

		const filtered = files.filter(file => commands.has(path.basename(file).replace('.js', '')));
		if (filtered.length === 0) {
			return completionSpecs;
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

(vscode as any).window.registerTerminalCompletionProvider({
	id: 'terminal-suggest',
	async provideTerminalCompletions(terminal: vscode.Terminal, terminalContext: { commandLine: string; cursorPosition: number }, token: vscode.CancellationToken): Promise<vscode.TerminalCompletionItem[] | undefined> {
		// Early cancellation check
		if (token.isCancellationRequested) {
			return;
		}

		// TODO: Leverage shellType when available https://github.com/microsoft/vscode/issues/230165
		//       terminal.state.shellType

		// TODO: cache
		const availableCommands = await getCommandsInPath();
		const specs = await getCompletionSpecs(availableCommands);
		builtinCommands?.forEach(command => availableCommands.add(command));

		const prefix = getPrefix(terminalContext.commandLine, terminalContext.cursorPosition);

		const result: vscode.TerminalCompletionItem[] = [];
		for (const spec of specs) {
			const name = getLabel(spec);
			if (!name || !availableCommands.has(name)) {
				continue;
			}
			if (spec.args && name === 'cd') {
				const escapedName = escapeRegExp(name);
				if (terminalContext.commandLine.match(new RegExp(`${escapedName}\\s+$`))) {
					console.log('command has args', spec.args, terminalContext.commandLine.match(new RegExp(`${escapedName}\\s+`)));
				}
			}

			if (spec.args && terminalContext.commandLine.match(new RegExp(`${escapeRegExp(name)}\\s+$`))) {
				const fileArgument = shouldShowFile(spec.args) && !onlyShowFolders(spec.args);
				const folderArgument = onlyShowFolders(spec.args);
				console.log('command has fileArgument, folderArgument', fileArgument, folderArgument);
				if (fileArgument || folderArgument) {
					// TODO: return special items
					console.log('pushing');
					result.push(createCompletionItem(terminalContext.commandLine, terminalContext.cursorPosition, ' ', fileArgument ? 'file' : 'folder', fileArgument ? 'File argument' : 'Folder argument'));
				}
				if (spec.args.suggestions) {
					for (const suggestion of spec.args.suggestions) {
						const suggestionName = getLabel(suggestion);
						if (suggestionName) {
							result.push(createCompletionItem(terminalContext.commandLine, terminalContext.cursorPosition, ' ', suggestionName, `Suggestion for ${name}: ${suggestion.description}`));
						}
					}
				}
			}

			if (!prefix) {
				continue;
			}
			if (name.startsWith(prefix)) {
				result.push(createCompletionItem(terminalContext.commandLine, terminalContext.cursorPosition, prefix, name, spec.description));
			}
			// TODO:
			// deal with args on FigSpec, esp if non optional.
			// args.template = "filepaths", should return our special kind of terminal completion
			if (spec.options) {
				for (const option of spec.options) {
					const optionName = getLabel(option);
					if (optionName && optionName.startsWith(prefix)) {
						result.push(createCompletionItem(terminalContext.commandLine, terminalContext.cursorPosition, prefix, optionName, option.description));
					}
				}
			}

			if (spec.subcommands) {
				for (const subcommand of spec.subcommands) {
					const subCommandName = getLabel(subcommand);
					if (subCommandName && (name + ' ' + subCommandName).startsWith(prefix)) {
						result.push(createCompletionItem(terminalContext.commandLine, terminalContext.cursorPosition, prefix, name + ' ' + subCommandName, subcommand.description));
					}
				}
			}
			if (spec.args) {
				if (spec.args.suggestions) {
					for (const suggestion of spec.args.suggestions) {
						const suggestionName = getLabel(suggestion);
						if (suggestionName && suggestionName.startsWith(prefix)) {
							result.push(createCompletionItem(terminalContext.commandLine, terminalContext.cursorPosition, prefix, suggestionName, `Suggestion for ${name}: ${suggestion.description}`));
						}
					}
				}
			}
		}

		console.log('extension completion count: ' + result.length);
		// Return the completion results or undefined if no results
		return result.length ? result : undefined;
	}
}, [' ']);

function getLabel(spec: FigSpec | Option | Subcommand | Suggestion): string | undefined {
	if (typeof spec.name === 'string') {
		return spec.name;
	}
	if (!Array.isArray(spec.name) || spec.name.length === 0) {
		return;
	}
	return spec.name[0];
}

function createCompletionItem(commandLine: string, cursorPosition: number, prefix: string, label: string, description?: string): vscode.TerminalCompletionItem {
	return {
		label,
		isFile: false,
		isDirectory: false,
		detail: description ?? '',
		replacementIndex: cursorPosition - prefix.length,
		replacementLength: label.length - prefix.length,
	};
}

function shouldShowFile(arg?: Arg): boolean {
	return arg?.template === 'filepaths';
}

function onlyShowFolders(arg?: Arg): boolean {
	console.log(isFilepathsGenerator(arg?.generators));
	return isFilepathsGenerator(arg?.generators);
}
function isFilepathsGenerator(generator: any) {
	if (!generator || typeof generator !== 'object') {
		return false;
	}
	// HACK because the generator object is not at all what I expect
	// per logging below
	return !!Object.keys(generator).find(key => key === 'getQueryTerm');
	// console.log('Generator:', generator);
	// console.log('Type of generator:', typeof generator);

	// if (generator && typeof generator === 'object') {
	// 	console.log('Keys in generator:', Object.keys(generator));
	// 	Object.keys(generator).forEach(key => {
	// 		console.log(`Key: ${key}, Type: ${typeof generator[key]}`);
	// 	});
	// 	console.log('showFolders:', generator?.showFolders);
	// }
	// return (
	// 	generator &&
	// 	typeof generator === 'object' &&
	// 	'showFolders' in generator &&
	// 	generator.showFolders === 'only'
	// );
}
async function getCommandsInPath(): Promise<Set<string>> {
	// todo: use semicolon for windows
	const paths = process.env.PATH?.split(':') || [];
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

	// Return the match if found, otherwise undefined
	return match ? match[0] : undefined;
}
function escapeRegExp(str: string) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
