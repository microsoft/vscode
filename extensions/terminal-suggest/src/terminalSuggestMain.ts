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

let cachedAvailableCommands: Set<string> | undefined;
let cachedBuiltinCommands: Map<string, string[]> | undefined;

function getBuiltinCommands(shell: string): string[] | undefined {
	try {
		const shellType = path.basename(shell);
		const cachedCommands = cachedBuiltinCommands?.get(shellType);
		if (cachedCommands) {
			return cachedCommands;
		}
		// fixes a bug with file/folder completions brought about by the '.' command
		const filter = (cmd: string) => cmd && cmd !== '.';
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
		}
		// native pwsh completions are builtin to vscode
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

			const specs = [codeCompletionSpec, codeInsidersCompletionSpec];
			const specCompletions = await getCompletionItemsFromSpecs(specs, terminalContext, new Set(commands), prefix, token);

			let filesRequested = specCompletions.filesRequested;
			let foldersRequested = specCompletions.foldersRequested;
			items.push(...specCompletions.items);

			if (!specCompletions.specificSuggestionsProvided) {
				for (const command of commands) {
					if (command.startsWith(prefix)) {
						items.push(createCompletionItem(terminalContext.cursorPosition, prefix, command));
					}
				}
			}

			if (token.isCancellationRequested) {
				return undefined;
			}

			const uniqueResults = new Map<string, vscode.TerminalCompletionItem>();
			for (const item of items) {
				if (!uniqueResults.has(item.label)) {
					uniqueResults.set(item.label, item);
				}
			}
			const resultItems = uniqueResults.size ? Array.from(uniqueResults.values()) : undefined;

			// If no completions are found, the prefix is a path, and neither files nor folders
			// are going to be requested (for a specific spec's argument), show file/folder completions
			const shouldShowResourceCompletions = !resultItems?.length && prefix.match(/^[./\\ ]/) && !filesRequested && !foldersRequested;
			if (shouldShowResourceCompletions) {
				filesRequested = true;
				foldersRequested = true;
			}

			if (filesRequested || foldersRequested) {
				return new vscode.TerminalCompletionList(resultItems, { filesRequested, foldersRequested, cwd: terminal.shellIntegration?.cwd, pathSeparator: shellPath.includes('/') ? '/' : '\\' });
			}
			return resultItems;
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

function getCompletionItemsFromSpecs(specs: Fig.Spec[], terminalContext: { commandLine: string; cursorPosition: number }, availableCommands: Set<string>, prefix: string, token: vscode.CancellationToken): { items: vscode.TerminalCompletionItem[]; filesRequested: boolean; foldersRequested: boolean; specificSuggestionsProvided: boolean } {
	let items: vscode.TerminalCompletionItem[] = [];
	let filesRequested = false;
	let foldersRequested = false;
	for (const spec of specs) {
		const specLabels = getLabel(spec);
		if (!specLabels) {
			continue;
		}
		for (const specLabel of specLabels) {
			if (!availableCommands.has(specLabel) || token.isCancellationRequested) {
				continue;
			}
			if (terminalContext.commandLine.startsWith(specLabel)) {
				if ('options' in spec && spec.options) {
					for (const option of spec.options) {
						const optionLabels = getLabel(option);
						if (!optionLabels) {
							continue;
						}
						for (const optionLabel of optionLabels) {
							if (optionLabel.startsWith(prefix) || (prefix.length > specLabel.length && prefix.trim() === specLabel)) {
								items.push(createCompletionItem(terminalContext.cursorPosition, prefix, optionLabel, option.description, false, vscode.TerminalCompletionItemKind.Flag));
							}
							if (!option.args) {
								continue;
							}
							const args = asArray(option.args);
							for (const arg of args) {
								if (!arg) {
									continue;
								}
								const precedingText = terminalContext.commandLine.slice(0, terminalContext.cursorPosition + 1);
								const expectedText = `${specLabel} ${optionLabel} `;
								if (!precedingText.includes(expectedText)) {
									continue;
								}
								if (arg.template) {
									if (arg.template === 'filepaths') {
										if (precedingText.includes(expectedText)) {
											filesRequested = true;
										}
									} else if (arg.template === 'folders') {
										if (precedingText.includes(expectedText)) {
											foldersRequested = true;
										}
									}
								}
								if (arg.suggestions?.length) {
									// there are specific suggestions to show
									items = [];
									const indexOfPrecedingText = terminalContext.commandLine.lastIndexOf(expectedText);
									const currentPrefix = precedingText.slice(indexOfPrecedingText + expectedText.length);
									for (const suggestion of arg.suggestions) {
										const suggestionLabels = getLabel(suggestion);
										if (!suggestionLabels) {
											continue;
										}
										for (const suggestionLabel of suggestionLabels) {
											if (suggestionLabel && suggestionLabel.startsWith(currentPrefix.trim())) {
												const hasSpaceBeforeCursor = terminalContext.commandLine[terminalContext.cursorPosition - 1] === ' ';
												// prefix will be '' if there is a space before the cursor
												items.push(createCompletionItem(terminalContext.cursorPosition, precedingText, suggestionLabel, arg.name, hasSpaceBeforeCursor, vscode.TerminalCompletionItemKind.Argument));
											}
										}
									}
									if (items.length) {
										return { items, filesRequested, foldersRequested, specificSuggestionsProvided: true };
									}
								}
							}
						}
					}
				}
			}
		}
	}
	return { items, filesRequested, foldersRequested, specificSuggestionsProvided: false };
}

