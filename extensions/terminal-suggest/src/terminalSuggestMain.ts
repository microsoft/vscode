/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecOptionsWithStringEncoding, execSync } from 'child_process';
import codeInsidersCompletionSpec from './completions/code-insiders';
import codeCompletionSpec from './completions/code';
import cdSpec from './completions/cd';

let cachedAvailableCommands: Set<string> | undefined;
let cachedBuiltinCommands: Map<string, string[]> | undefined;

export const availableSpecs = [codeCompletionSpec, codeInsidersCompletionSpec, cdSpec];

function getBuiltinCommands(shell: string): string[] | undefined {
	try {
		const shellType = path.basename(shell, path.extname(shell));
		const cachedCommands = cachedBuiltinCommands?.get(shellType);
		if (cachedCommands) {
			return cachedCommands;
		}
		const filter = (cmd: string) => cmd;
		const options: ExecOptionsWithStringEncoding = { encoding: 'utf-8', shell };
		switch (shellType) {
			case 'bash': {
				const bashOutput = execSync('compgen -b', options);
				const bashResult = bashOutput.split('\n').filter(filter);
				if (bashResult.length) {
					cachedBuiltinCommands?.set(shellType, bashResult);
					return bashResult;
				}
				break;
			}
			case 'zsh': {
				const zshOutput = execSync('printf "%s\\n" ${(k)builtins}', options);
				const zshResult = zshOutput.split('\n').filter(filter);
				if (zshResult.length) {
					cachedBuiltinCommands?.set(shellType, zshResult);
					return zshResult;
				}
			}
			case 'fish': {
				// TODO: ghost text in the command line prevents
				// completions from working ATM for fish
				const fishOutput = execSync('functions -n', options);
				const fishResult = fishOutput.split(', ').filter(filter);
				if (fishResult.length) {
					cachedBuiltinCommands?.set(shellType, fishResult);
					return fishResult;
				}
				break;
			}
			case 'pwsh': {
				// native pwsh completions are builtin to vscode
				return [];
			}
		}
		return;

	} catch (error) {
		console.error('Error fetching builtin commands:', error);
		return;
	}
}

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.window.registerTerminalCompletionProvider({
		id: 'terminal-suggest',
		async provideTerminalCompletions(terminal: vscode.Terminal, terminalContext: { commandLine: string; cursorPosition: number }, token: vscode.CancellationToken): Promise<vscode.TerminalCompletionItem[] | vscode.TerminalCompletionList | undefined> {
			if (token.isCancellationRequested) {
				return;
			}

			// TODO: Leverage shellType when available https://github.com/microsoft/vscode/issues/230165
			const shellPath = ('shellPath' in terminal.creationOptions ? terminal.creationOptions.shellPath : undefined) ?? vscode.env.shell;
			if (!shellPath) {
				return;
			}

			const commandsInPath = await getCommandsInPath();
			const builtinCommands = getBuiltinCommands(shellPath);
			if (!commandsInPath || !builtinCommands) {
				return;
			}
			const commands = [...commandsInPath, ...builtinCommands];

			const prefix = getPrefix(terminalContext.commandLine, terminalContext.cursorPosition);

			const result = await getCompletionItemsFromSpecs(availableSpecs, terminalContext, commands, prefix, terminal.shellIntegration?.cwd, token);
			if (result.cwd && (result.filesRequested || result.foldersRequested)) {
				// const cwd = resolveCwdFromPrefix(prefix, terminal.shellIntegration?.cwd) ?? terminal.shellIntegration?.cwd;
				return new vscode.TerminalCompletionList(result.items, { filesRequested: result.filesRequested, foldersRequested: result.foldersRequested, cwd: result.cwd, pathSeparator: osIsWindows() ? '\\' : '/' });
			}
			return result.items;
		}
	}, '/', '\\'));
}


/**
 * Adjusts the current working directory based on a given prefix if it is a folder.
 * @param prefix - The folder path prefix.
 * @param currentCwd - The current working directory.
 * @returns The new working directory.
 */
export async function resolveCwdFromPrefix(prefix: string, currentCwd?: vscode.Uri): Promise<vscode.Uri | undefined> {
	if (!currentCwd) {
		return;
	}
	try {
		// Get the nearest folder path from the prefix. This ignores everything after the `/` as
		// they are what triggers changes in the directory.
		let lastSlashIndex: number;
		if (osIsWindows()) {
			// TODO: This support is very basic, ideally the slashes supported would depend upon the
			//       shell type. For example git bash under Windows does not allow using \ as a path
			//       separator.
			lastSlashIndex = prefix.lastIndexOf('\\');
			if (lastSlashIndex === -1) {
				lastSlashIndex = prefix.lastIndexOf('/');
			}
		} else {
			lastSlashIndex = prefix.lastIndexOf('/');
		}
		const relativeFolder = lastSlashIndex === -1 ? '' : prefix.slice(0, lastSlashIndex);

		// Resolve the absolute path of the prefix
		const resolvedPath = path.resolve(currentCwd?.fsPath, relativeFolder);
		const stat = await fs.stat(resolvedPath);

		// Check if the resolved path exists and is a directory
		if (stat.isDirectory()) {
			return currentCwd.with({ path: resolvedPath });
		}
	} catch {
		// Ignore errors
	}

	// If the prefix is not a folder, return the current cwd
	return currentCwd;
}


function getLabel(spec: Fig.Spec | Fig.Arg | Fig.Suggestion | string): string[] | undefined {
	if (typeof spec === 'string') {
		return [spec];
	}
	if (typeof spec.name === 'string') {
		return [spec.name];
	}
	if (!Array.isArray(spec.name) || spec.name.length === 0) {
		return;
	}
	return spec.name;
}

function createCompletionItem(commandLine: string, cursorPosition: number, prefix: string, label: string, description?: string, kind?: vscode.TerminalCompletionItemKind): vscode.TerminalCompletionItem {
	return {
		label,
		detail: description ?? '',
		replacementIndex: commandLine.length - prefix.length >= 0 ? commandLine.length - prefix.length : commandLine[cursorPosition - 1] === ' ' ? cursorPosition : cursorPosition - 1,
		replacementLength: prefix.length,
		kind: kind ?? vscode.TerminalCompletionItemKind.Method
	};
}

async function getCommandsInPath(): Promise<Set<string> | undefined> {
	if (cachedAvailableCommands) {
		return cachedAvailableCommands;
	}
	const paths = osIsWindows() ? process.env.PATH?.split(';') : process.env.PATH?.split(':');
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
				if (fileType === vscode.FileType.File || fileType === vscode.FileType.SymbolicLink) {
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

function getPrefix(commandLine: string, cursorPosition: number): string {
	// Return an empty string if the command line is empty after trimming
	if (commandLine.trim() === '') {
		return '';
	}

	// Check if cursor is not at the end and there's non-whitespace after the cursor
	if (cursorPosition < commandLine.length && /\S/.test(commandLine[cursorPosition])) {
		return '';
	}

	// Extract the part of the line up to the cursor position
	const beforeCursor = commandLine.slice(0, cursorPosition);

	// Find the last sequence of non-whitespace characters before the cursor
	const match = beforeCursor.match(/(\S+)\s*$/);

	// Return the match if found, otherwise undefined
	return match ? match[0] : '';
}

export function asArray<T>(x: T | T[]): T[];
export function asArray<T>(x: T | readonly T[]): readonly T[];
export function asArray<T>(x: T | T[]): T[] {
	return Array.isArray(x) ? x : [x];
}

export async function getCompletionItemsFromSpecs(specs: Fig.Spec[], terminalContext: { commandLine: string; cursorPosition: number }, availableCommands: string[], prefix: string, shellIntegrationCwd?: vscode.Uri, token?: vscode.CancellationToken): Promise<{ items: vscode.TerminalCompletionItem[]; filesRequested: boolean; foldersRequested: boolean; cwd?: vscode.Uri }> {
	const items: vscode.TerminalCompletionItem[] = [];
	let filesRequested = false;
	let foldersRequested = false;
	let specificSuggestionsProvided = false;
	const firstCommand = getFirstCommand(terminalContext.commandLine);
	for (const spec of specs) {
		const specLabels = getLabel(spec);
		if (!specLabels) {
			continue;
		}
		for (const specLabel of specLabels) {
			if (!availableCommands.includes(specLabel) || (token && token?.isCancellationRequested)) {
				continue;
			}
			//
			if (
				// If the prompt is empty
				!terminalContext.commandLine
				// or the first command matches the command
				|| !!firstCommand && specLabel.startsWith(firstCommand)
			) {
				// push it to the completion items
				items.push(createCompletionItem(terminalContext.commandLine, terminalContext.cursorPosition, prefix, specLabel));
			}
			if (!terminalContext.commandLine.startsWith(specLabel)) {
				// the spec label is not the first word in the command line, so do not provide options or args
				continue;
			}
			const precedingText = terminalContext.commandLine.slice(0, terminalContext.cursorPosition + 1);
			if ('options' in spec && spec.options) {
				for (const option of spec.options) {
					const optionLabels = getLabel(option);
					if (!optionLabels) {
						continue;
					}
					for (const optionLabel of optionLabels) {
						if (!items.find(i => i.label === optionLabel) && optionLabel.startsWith(prefix) || (prefix.length > specLabel.length && prefix.trim() === specLabel)) {
							items.push(createCompletionItem(terminalContext.commandLine, terminalContext.cursorPosition, prefix, optionLabel, option.description, vscode.TerminalCompletionItemKind.Flag));
						}
						const expectedText = `${specLabel} ${optionLabel} `;
						if (!precedingText.includes(expectedText)) {
							continue;
						}
						const indexOfPrecedingText = terminalContext.commandLine.lastIndexOf(expectedText);
						const currentPrefix = precedingText.slice(indexOfPrecedingText + expectedText.length);
						const argsCompletions = getCompletionItemsFromArgs(option.args, currentPrefix, terminalContext);
						if (!argsCompletions) {
							continue;
						}
						specificSuggestionsProvided = true;
						const argCompletions = argsCompletions.items;
						foldersRequested = foldersRequested || argsCompletions.foldersRequested;
						filesRequested = filesRequested || argsCompletions.filesRequested;
						let cwd: vscode.Uri | undefined;
						if (shellIntegrationCwd && (filesRequested || foldersRequested)) {
							cwd = await resolveCwdFromPrefix(prefix, shellIntegrationCwd) ?? shellIntegrationCwd;
						}
						specificSuggestionsProvided = argsCompletions.specificSuggestionsProvided;
						return { items: argCompletions, filesRequested, foldersRequested, cwd };
					}
				}
			}
			if ('args' in spec && asArray(spec.args)) {
				const expectedText = `${specLabel} `;
				if (!precedingText.includes(expectedText)) {
					continue;
				}
				const indexOfPrecedingText = terminalContext.commandLine.lastIndexOf(expectedText);
				const currentPrefix = precedingText.slice(indexOfPrecedingText + expectedText.length);
				const argsCompletions = getCompletionItemsFromArgs(spec.args, currentPrefix, terminalContext);
				if (!argsCompletions) {
					continue;
				}
				items.push(...argsCompletions.items);
				specificSuggestionsProvided = argsCompletions.specificSuggestionsProvided;
				filesRequested = filesRequested || argsCompletions.filesRequested;
				foldersRequested = foldersRequested || argsCompletions.foldersRequested;
			}
		}
	}

	if (!specificSuggestionsProvided && (filesRequested === foldersRequested)) {
		// Include builitin/available commands in the results
		for (const command of availableCommands) {
			if ((!terminalContext.commandLine.trim() || firstCommand && command.startsWith(firstCommand)) && !items.find(item => item.label === command)) {
				items.push(createCompletionItem(terminalContext.commandLine, terminalContext.cursorPosition, prefix, command));
			}
		}
	}

	const shouldShowResourceCompletions =
		(
			// If the command line is empty
			terminalContext.commandLine.trim().length === 0
			// or no completions are found and the prefix is empty
			|| !items?.length
			// or all of the items are '.' or '..' IE file paths
			|| items.length && items.every(i => ['.', '..'].includes(i.label))
		)
		// and neither files nor folders are going to be requested (for a specific spec's argument)
		&& (!filesRequested && !foldersRequested);

	if (shouldShowResourceCompletions) {
		filesRequested = true;
		foldersRequested = true;
	}
	let cwd: vscode.Uri | undefined;
	if (shellIntegrationCwd && (filesRequested || foldersRequested)) {
		cwd = await resolveCwdFromPrefix(prefix, shellIntegrationCwd) ?? shellIntegrationCwd;
	}
	return { items, filesRequested, foldersRequested, cwd };
}

function getCompletionItemsFromArgs(args: Fig.SingleOrArray<Fig.Arg> | undefined, currentPrefix: string, terminalContext: { commandLine: string; cursorPosition: number }): { items: vscode.TerminalCompletionItem[]; filesRequested: boolean; foldersRequested: boolean; specificSuggestionsProvided: boolean } | undefined {
	if (!args) {
		return;
	}

	let items: vscode.TerminalCompletionItem[] = [];
	let filesRequested = false;
	let foldersRequested = false;
	for (const arg of asArray(args)) {
		if (!arg) {
			continue;
		}
		if (arg.template) {
			if (arg.template === 'filepaths') {
				filesRequested = true;
			} else if (arg.template === 'folders') {
				foldersRequested = true;
			}
		}
		if (arg.suggestions?.length) {
			// there are specific suggestions to show
			items = [];
			for (const suggestion of arg.suggestions) {
				const suggestionLabels = getLabel(suggestion);
				if (!suggestionLabels) {
					continue;
				}
				const twoWordsBefore = terminalContext.commandLine.slice(0, terminalContext.cursorPosition).split(' ').at(-2);
				const wordBefore = terminalContext.commandLine.slice(0, terminalContext.cursorPosition).split(' ').at(-1);
				for (const suggestionLabel of suggestionLabels) {
					if (items.find(i => i.label === suggestionLabel)) {
						continue;
					}
					if (!arg.isVariadic && twoWordsBefore === suggestionLabel && wordBefore?.trim() === '') {
						return { items: [], filesRequested, foldersRequested, specificSuggestionsProvided: false };
					}
					if (suggestionLabel && suggestionLabel.startsWith(currentPrefix.trim())) {
						const description = typeof suggestion !== 'string' ? suggestion.description : '';
						items.push(createCompletionItem(terminalContext.commandLine, terminalContext.cursorPosition, wordBefore ?? '', suggestionLabel, description, vscode.TerminalCompletionItemKind.Argument));
					}
				}
			}
			if (items.length) {
				return { items, filesRequested, foldersRequested, specificSuggestionsProvided: true };
			}
		}
	}
	return { items, filesRequested, foldersRequested, specificSuggestionsProvided: false };
}

function osIsWindows(): boolean {
	return os.platform() === 'win32';
}

function getFirstCommand(commandLine: string): string | undefined {
	const wordsOnLine = commandLine.split(' ');
	let firstCommand: string | undefined = wordsOnLine[0];
	if (wordsOnLine.length > 1) {
		firstCommand = undefined;
	} else if (wordsOnLine.length === 0) {
		firstCommand = commandLine;
	}
	return firstCommand;
}
