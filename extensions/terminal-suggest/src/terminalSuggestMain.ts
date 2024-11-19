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


export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.window.registerTerminalCompletionProvider({
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
			let result: vscode.TerminalCompletionItem[] = [];
			const specs = [codeCompletionSpec, codeInsidersCompletionSpec];
			for (const spec of specs) {
				const specName = getLabel(spec);
				if (!specName || !availableCommands.has(specName)) {
					continue;
				}
				if (terminalContext.commandLine.startsWith(specName)) {
					if ('options' in codeInsidersCompletionSpec && codeInsidersCompletionSpec.options) {
						for (const option of codeInsidersCompletionSpec.options) {
							const optionLabel = getLabel(option);
							if (!optionLabel) {
								continue;
							}

							if (optionLabel.startsWith(prefix) || (prefix.length > specName.length && prefix.trim() === specName)) {
								result.push(createCompletionItem(terminalContext.cursorPosition, prefix, optionLabel, option.description, false, vscode.TerminalCompletionItemKind.Flag));
							}
							if (option.args !== undefined) {
								const args = Array.isArray(option.args) ? option.args : [option.args];
								for (const arg of args) {
									if (!arg) {
										continue;
									}

									if (arg.template) {
										// TODO: return file/folder completion items
										if (arg.template === 'filepaths') {
											// if (label.startsWith(prefix+\s*)) {
											// result.push(FilePathCompletionItem)
											// }
										} else if (arg.template === 'folders') {
											// if (label.startsWith(prefix+\s*)) {
											// result.push(FolderPathCompletionItem)
											// }
										}
										continue;
									}

									const precedingText = terminalContext.commandLine.slice(0, terminalContext.cursorPosition);
									const expectedText = `${optionLabel} `;
									if (arg.suggestions?.length && precedingText.includes(expectedText)) {
										// there are specific suggestions to show
										result = [];
										const indexOfPrecedingText = terminalContext.commandLine.lastIndexOf(expectedText);
										const currentPrefix = precedingText.slice(indexOfPrecedingText + expectedText.length);
										for (const suggestion of arg.suggestions) {
											const suggestionLabel = getLabel(suggestion);
											if (suggestionLabel && suggestionLabel.startsWith(currentPrefix)) {
												const hasSpaceBeforeCursor = terminalContext.commandLine[terminalContext.cursorPosition - 1] === ' ';
												// prefix will be '' if there is a space before the cursor
												result.push(createCompletionItem(terminalContext.cursorPosition, precedingText, suggestionLabel, arg.name, hasSpaceBeforeCursor, vscode.TerminalCompletionItemKind.Argument));
											}
										}
										if (result.length) {
											return result;
										}
									}
								}
							}
						}
					}
				}
			}

			for (const command of availableCommands) {
				if (command.startsWith(prefix)) {
					result.push(createCompletionItem(terminalContext.cursorPosition, prefix, command));
				}
			}

			if (token.isCancellationRequested) {
				return undefined;
			}
			const uniqueResults = new Map<string, vscode.TerminalCompletionItem>();
			for (const item of result) {
				if (!uniqueResults.has(item.label)) {
					uniqueResults.set(item.label, item);
				}
			}
			return uniqueResults.size ? Array.from(uniqueResults.values()) : undefined;
		}
	}));
}

function getLabel(spec: Fig.Spec | Fig.Arg | Fig.Suggestion | string): string | undefined {
	if (typeof spec === 'string') {
		return spec;
	}
	if (typeof spec.name === 'string') {
		return spec.name;
	}
	if (!Array.isArray(spec.name) || spec.name.length === 0) {
		return;
	}
	return spec.name[0];
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

