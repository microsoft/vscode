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
		const shellType = path.basename(shell);
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
			const shellPath = 'shellPath' in terminal.creationOptions ? terminal.creationOptions.shellPath : vscode.env.shell;
			if (!shellPath) {
				return;
			}

			const commandsInPath = await getCommandsInPath();
			const builtinCommands = getBuiltinCommands(shellPath);
			if (!commandsInPath || !builtinCommands) {
				return;
			}
			const commands = [...commandsInPath, ...builtinCommands];

			const items: vscode.TerminalCompletionItem[] = [];
			const prefix = getPrefix(terminalContext.commandLine, terminalContext.cursorPosition);

			const specCompletions = await getCompletionItemsFromSpecs(availableSpecs, terminalContext, commands, prefix, token);

			items.push(...specCompletions.items);
			let filesRequested = specCompletions.filesRequested;
			let foldersRequested = specCompletions.foldersRequested;

			if (!specCompletions.specificSuggestionsProvided) {
				for (const command of commands) {
					if (command.startsWith(prefix) && !items.find(item => item.label === command)) {
						items.push(createCompletionItem(terminalContext.cursorPosition, prefix, command));
					}
				}
			}

			if (token.isCancellationRequested) {
				return undefined;
			}

			const shouldShowResourceCompletions =
				(
					// If the command line is empty
					terminalContext.commandLine.trim().length === 0
					// or no completions are found
					|| !items?.length
					// or the completion found is '.'
					|| items.length === 1 && items[0].label === '.'
				)
				// and neither files nor folders are going to be requested (for a specific spec's argument)
				&& (!filesRequested && !foldersRequested);

			if (shouldShowResourceCompletions) {
				filesRequested = true;
				foldersRequested = true;
			}
			if (filesRequested || foldersRequested) {
				return new vscode.TerminalCompletionList(items, { filesRequested, foldersRequested, cwd: terminal.shellIntegration?.cwd, pathSeparator: osIsWindows() ? '\\' : '/' });
			}
			return items;
		}
	}));
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

function createCompletionItem(cursorPosition: number, prefix: string, label: string, description?: string, hasSpaceBeforeCursor?: boolean, kind?: vscode.TerminalCompletionItemKind): vscode.TerminalCompletionItem {
	return {
		label,
		detail: description ?? '',
		replacementIndex: hasSpaceBeforeCursor ? cursorPosition : cursorPosition - 1,
		replacementLength: label.length - prefix.length,
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

export function getCompletionItemsFromSpecs(specs: Fig.Spec[], terminalContext: { commandLine: string; cursorPosition: number }, availableCommands: string[], prefix: string, token?: vscode.CancellationToken): { items: vscode.TerminalCompletionItem[]; filesRequested: boolean; foldersRequested: boolean; specificSuggestionsProvided: boolean } {
	const items: vscode.TerminalCompletionItem[] = [];
	let filesRequested = false;
	let foldersRequested = false;
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
				// or the prefix matches the command and the prefix is not equal to the command
				|| !!prefix && specLabel.startsWith(prefix) && specLabel !== prefix
			) {
				// push it to the completion items
				items.push(createCompletionItem(terminalContext.cursorPosition, prefix, specLabel));
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
							items.push(createCompletionItem(terminalContext.cursorPosition, prefix, optionLabel, option.description, false, vscode.TerminalCompletionItemKind.Flag));
						}
						const expectedText = `${specLabel} ${optionLabel} `;
						if (!precedingText.includes(expectedText)) {
							continue;
						}
						const indexOfPrecedingText = terminalContext.commandLine.lastIndexOf(expectedText);
						const currentPrefix = precedingText.slice(indexOfPrecedingText + expectedText.length);
						const argsCompletions = getCompletionItemsFromArgs(option.args, currentPrefix, terminalContext, precedingText);
						if (!argsCompletions) {
							continue;
						}
						// return early so that we don't show the other completions
						return argsCompletions;
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
				const argsCompletions = getCompletionItemsFromArgs(spec.args, currentPrefix, terminalContext, precedingText);
				if (!argsCompletions) {
					continue;
				}
				items.push(...argsCompletions.items);
				filesRequested = filesRequested || argsCompletions.filesRequested;
				foldersRequested = foldersRequested || argsCompletions.foldersRequested;
			}
		}
	}
	return { items, filesRequested, foldersRequested, specificSuggestionsProvided: false };
}

function getCompletionItemsFromArgs(args: Fig.SingleOrArray<Fig.Arg> | undefined, currentPrefix: string, terminalContext: { commandLine: string; cursorPosition: number }, precedingText: string): { items: vscode.TerminalCompletionItem[]; filesRequested: boolean; foldersRequested: boolean; specificSuggestionsProvided: boolean } | undefined {
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

				for (const suggestionLabel of suggestionLabels) {
					if (items.find(i => i.label === suggestionLabel)) {
						continue;
					}
					if (suggestionLabel && suggestionLabel.startsWith(currentPrefix.trim()) && suggestionLabel !== currentPrefix.trim()) {
						const hasSpaceBeforeCursor = terminalContext.commandLine[terminalContext.cursorPosition - 1] === ' ';
						// prefix will be '' if there is a space before the cursor
						const description = typeof suggestion !== 'string' ? suggestion.description : '';
						items.push(createCompletionItem(terminalContext.cursorPosition, precedingText, suggestionLabel, description, hasSpaceBeforeCursor, vscode.TerminalCompletionItemKind.Argument));
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
