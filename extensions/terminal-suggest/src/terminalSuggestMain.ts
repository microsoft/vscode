/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecOptionsWithStringEncoding, execSync } from 'child_process';
import { upstreamSpecs } from './constants';
import codeCompletionSpec from './completions/code';
import cdSpec from './completions/cd';
import codeInsidersCompletionSpec from './completions/code-insiders';

let cachedAvailableCommandsPath: string | undefined;
let cachedAvailableCommands: Set<string> | undefined;
const cachedBuiltinCommands: Map<string, string[] | undefined> = new Map();

export const availableSpecs: Fig.Spec[] = [
	cdSpec,
	codeInsidersCompletionSpec,
	codeCompletionSpec,
];
for (const spec of upstreamSpecs) {
	availableSpecs.push(require(`./completions/upstream/${spec}`).default);
}

function getBuiltinCommands(shell: string): string[] | undefined {
	try {
		const shellType = path.basename(shell, path.extname(shell));
		const cachedCommands = cachedBuiltinCommands.get(shellType);
		if (cachedCommands) {
			return cachedCommands;
		}
		const filter = (cmd: string) => cmd;
		const options: ExecOptionsWithStringEncoding = { encoding: 'utf-8', shell };
		let commands: string[] | undefined;
		switch (shellType) {
			case 'bash': {
				const bashOutput = execSync('compgen -b', options);
				commands = bashOutput.split('\n').filter(filter);
				break;
			}
			case 'zsh': {
				const zshOutput = execSync('printf "%s\\n" ${(k)builtins}', options);
				commands = zshOutput.split('\n').filter(filter);
				break;
			}
			case 'fish': {
				// TODO: Ghost text in the command line prevents completions from working ATM for fish
				const fishOutput = execSync('functions -n', options);
				commands = fishOutput.split(', ').filter(filter);
				break;
			}
			case 'pwsh': {
				// TODO: Select `CommandType, DisplayName` and map to a rich type with kind and detail
				const output = execSync('Get-Command -All | Select-Object Name | ConvertTo-Json', options);
				let json: any;
				try {
					json = JSON.parse(output);
				} catch (e) {
					console.error('Error parsing pwsh output:', e);
					return [];
				}
				commands = (json as any[]).map(e => e.Name);
				break;
			}
		}
		cachedBuiltinCommands.set(shellType, commands);
		return commands;

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

			const commandsInPath = await getCommandsInPath(terminal.shellIntegration?.env);
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

function createCompletionItem(cursorPosition: number, prefix: string, label: string, description?: string, kind?: vscode.TerminalCompletionItemKind): vscode.TerminalCompletionItem {
	const endsWithSpace = prefix.endsWith(' ');
	const lastWord = endsWithSpace ? '' : prefix.split(' ').at(-1) ?? '';
	return {
		label,
		detail: description ?? '',
		replacementIndex: cursorPosition - lastWord.length,
		replacementLength: lastWord.length,
		kind: kind ?? vscode.TerminalCompletionItemKind.Method
	};
}

async function isExecutable(filePath: string): Promise<boolean> {
	// Windows doesn't have the concept of an executable bit and running any
	// file is possible. We considered using $PATHEXT here but since it's mostly
	// there for legacy reasons and it would be easier and more intuitive to add
	// a setting if needed instead.
	if (osIsWindows()) {
		return true;
	}
	try {
		const stats = await fs.stat(filePath);
		// On macOS/Linux, check if the executable bit is set
		return (stats.mode & 0o100) !== 0;
	} catch (error) {
		// If the file does not exist or cannot be accessed, it's not executable
		return false;
	}
}

async function getCommandsInPath(env: { [key: string]: string | undefined } = process.env): Promise<Set<string> | undefined> {
	// Get PATH value
	let pathValue: string | undefined;
	if (osIsWindows()) {
		const caseSensitivePathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
		if (caseSensitivePathKey) {
			pathValue = env[caseSensitivePathKey];
		}
	} else {
		pathValue = env.PATH;
	}
	if (pathValue === undefined) {
		return;
	}

	// Check cache
	if (cachedAvailableCommands && cachedAvailableCommandsPath === pathValue) {
		return cachedAvailableCommands;
	}

	// Extract executables from PATH
	const isWindows = osIsWindows();
	const paths = pathValue.split(isWindows ? ';' : ':');
	const pathSeparator = isWindows ? '\\' : '/';
	const executables = new Set<string>();
	for (const path of paths) {
		try {
			const dirExists = await fs.stat(path).then(stat => stat.isDirectory()).catch(() => false);
			if (!dirExists) {
				continue;
			}
			const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(path));

			for (const [file, fileType] of files) {
				if (fileType !== vscode.FileType.Unknown && fileType !== vscode.FileType.Directory && await isExecutable(path + pathSeparator + file)) {
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

export async function getCompletionItemsFromSpecs(
	specs: Fig.Spec[],
	terminalContext: { commandLine: string; cursorPosition: number },
	availableCommands: string[],
	prefix: string,
	shellIntegrationCwd?: vscode.Uri,
	token?: vscode.CancellationToken
): Promise<{ items: vscode.TerminalCompletionItem[]; filesRequested: boolean; foldersRequested: boolean; cwd?: vscode.Uri }> {
	const items: vscode.TerminalCompletionItem[] = [];
	let filesRequested = false;
	let foldersRequested = false;

	const firstCommand = getFirstCommand(terminalContext.commandLine);
	const precedingText = terminalContext.commandLine.slice(0, terminalContext.cursorPosition + 1);

	for (const spec of specs) {
		const specLabels = getLabel(spec);

		if (!specLabels) {
			continue;
		}

		for (const specLabel of specLabels) {
			if (!availableCommands.includes(specLabel) || (token && token.isCancellationRequested)) {
				continue;
			}

			if (
				// If the prompt is empty
				!terminalContext.commandLine
				// or the first command matches the command
				|| !!firstCommand && specLabel.startsWith(firstCommand)
			) {
				// push it to the completion items
				items.push(createCompletionItem(terminalContext.cursorPosition, prefix, specLabel));
			}

			if (!terminalContext.commandLine.startsWith(specLabel)) {
				// the spec label is not the first word in the command line, so do not provide options or args
				continue;
			}

			const argsCompletionResult = handleArguments(specLabel, spec, terminalContext, precedingText);
			if (argsCompletionResult) {
				items.push(...argsCompletionResult.items);
				filesRequested ||= argsCompletionResult.filesRequested;
				foldersRequested ||= argsCompletionResult.foldersRequested;
			}

			const optionsCompletionResult = handleOptions(specLabel, spec, terminalContext, precedingText, prefix);
			if (optionsCompletionResult) {
				items.push(...optionsCompletionResult.items);
				filesRequested ||= optionsCompletionResult.filesRequested;
				foldersRequested ||= optionsCompletionResult.foldersRequested;
			}
		}
	}

	const shouldShowResourceCompletions =
		(!terminalContext.commandLine.trim() || !items.length) &&
		!filesRequested &&
		!foldersRequested;

	const shouldShowCommands = !terminalContext.commandLine.substring(0, terminalContext.cursorPosition).trimStart().includes(' ');

	if (shouldShowCommands && !filesRequested && !foldersRequested) {
		// Include builitin/available commands in the results
		const labels = new Set(items.map((i) => i.label));
		for (const command of availableCommands) {
			if (!labels.has(command)) {
				items.push(createCompletionItem(terminalContext.cursorPosition, prefix, command));
			}
		}
	}

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

function handleArguments(specLabel: string, spec: Fig.Spec, terminalContext: { commandLine: string; cursorPosition: number }, precedingText: string): { items: vscode.TerminalCompletionItem[]; filesRequested: boolean; foldersRequested: boolean } | undefined {
	let args;
	if ('args' in spec && spec.args && asArray(spec.args)) {
		args = asArray(spec.args);
	}
	const expectedText = `${specLabel} `;

	if (!precedingText.includes(expectedText)) {
		return;
	}

	const currentPrefix = precedingText.slice(precedingText.lastIndexOf(expectedText) + expectedText.length);
	const argsCompletions = getCompletionItemsFromArgs(args, currentPrefix, terminalContext);

	if (!argsCompletions) {
		return;
	}

	return argsCompletions;
}

function handleOptions(specLabel: string, spec: Fig.Spec, terminalContext: { commandLine: string; cursorPosition: number }, precedingText: string, prefix: string): { items: vscode.TerminalCompletionItem[]; filesRequested: boolean; foldersRequested: boolean } | undefined {
	let options;
	if ('options' in spec && spec.options) {
		options = spec.options;
	}
	if (!options) {
		return;
	}

	const optionItems: vscode.TerminalCompletionItem[] = [];

	for (const option of options) {
		const optionLabels = getLabel(option);

		if (!optionLabels) {
			continue;
		}

		for (const optionLabel of optionLabels) {
			if (
				// Already includes this option
				optionItems.find((i) => i.label === optionLabel)
			) {
				continue;
			}

			optionItems.push(
				createCompletionItem(
					terminalContext.cursorPosition,
					prefix,
					optionLabel,
					option.description,
					vscode.TerminalCompletionItemKind.Flag
				)
			);

			const expectedText = `${specLabel} ${optionLabel} `;
			if (!precedingText.includes(expectedText)) {
				continue;
			}

			const currentPrefix = precedingText.slice(precedingText.lastIndexOf(expectedText) + expectedText.length);
			const argsCompletions = getCompletionItemsFromArgs(option.args, currentPrefix, terminalContext);

			if (argsCompletions) {
				return { items: argsCompletions.items, filesRequested: argsCompletions.filesRequested, foldersRequested: argsCompletions.foldersRequested };
			}
		}
	}

	return { items: optionItems, filesRequested: false, foldersRequested: false };
}


function getCompletionItemsFromArgs(args: Fig.SingleOrArray<Fig.Arg> | undefined, currentPrefix: string, terminalContext: { commandLine: string; cursorPosition: number }): { items: vscode.TerminalCompletionItem[]; filesRequested: boolean; foldersRequested: boolean } | undefined {
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
						return { items: [], filesRequested, foldersRequested };
					}
					if (suggestionLabel && suggestionLabel.startsWith(currentPrefix.trim())) {
						const description = typeof suggestion !== 'string' ? suggestion.description : '';
						items.push(createCompletionItem(terminalContext.cursorPosition, wordBefore ?? '', suggestionLabel, description, vscode.TerminalCompletionItemKind.Argument));
					}
				}
			}
			if (items.length) {
				return { items, filesRequested, foldersRequested };
			}
		}
	}
	return { items, filesRequested, foldersRequested };
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
