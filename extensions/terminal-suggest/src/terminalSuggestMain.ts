/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExecOptionsWithStringEncoding } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import cdSpec from './completions/cd';
import codeCompletionSpec from './completions/code';
import codeInsidersCompletionSpec from './completions/code-insiders';
import setLocationSpec from './completions/set-location';
import { upstreamSpecs } from './constants';
import { PathExecutableCache } from './env/pathExecutableCache';
import { osIsWindows } from './helpers/os';
import { getFriendlyResourcePath } from './helpers/uri';
import { getBashGlobals } from './shell/bash';
import { getFishGlobals } from './shell/fish';
import { getPwshGlobals } from './shell/pwsh';
import { getZshGlobals } from './shell/zsh';
import { getTokenType, TokenType } from './tokens';
import type { ICompletionResource } from './types';
import { createCompletionItem } from './helpers/completionItem';
import { getFigSuggestions } from './fig/figInterface';
import { executeCommand, executeCommandTimeout, IFigExecuteExternals } from './fig/execute';

// TODO: remove once API is finalized
export const enum TerminalShellType {
	Sh = 1,
	Bash = 2,
	Fish = 3,
	Csh = 4,
	Ksh = 5,
	Zsh = 6,
	CommandPrompt = 7,
	GitBash = 8,
	PowerShell = 9,
	Python = 10,
	Julia = 11,
	NuShell = 12,
	Node = 13
}

const isWindows = osIsWindows();
const cachedGlobals: Map<TerminalShellType, ICompletionResource[] | undefined> = new Map();
let pathExecutableCache: PathExecutableCache;

export const availableSpecs: Fig.Spec[] = [
	cdSpec,
	codeInsidersCompletionSpec,
	codeCompletionSpec,
	setLocationSpec,
];
for (const spec of upstreamSpecs) {
	availableSpecs.push(require(`./completions/upstream/${spec}`).default);
}

const getShellSpecificGlobals: Map<TerminalShellType, (options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>) => Promise<(string | ICompletionResource)[]>> = new Map([
	[TerminalShellType.Bash, getBashGlobals],
	[TerminalShellType.Zsh, getZshGlobals],
	// TODO: Ghost text in the command line prevents completions from working ATM for fish
	[TerminalShellType.Fish, getFishGlobals],
	[TerminalShellType.PowerShell, getPwshGlobals],
]);

async function getShellGlobals(shellType: TerminalShellType, existingCommands?: Set<string>): Promise<ICompletionResource[] | undefined> {
	try {
		const cachedCommands = cachedGlobals.get(shellType);
		if (cachedCommands) {
			return cachedCommands;
		}
		const shell = getShell(shellType);
		if (!shell) {
			return;
		}
		const options: ExecOptionsWithStringEncoding = { encoding: 'utf-8', shell };
		const mixedCommands: (string | ICompletionResource)[] | undefined = await getShellSpecificGlobals.get(shellType)?.(options, existingCommands);
		const normalizedCommands = mixedCommands?.map(command => typeof command === 'string' ? ({ label: command }) : command);
		cachedGlobals.set(shellType, normalizedCommands);
		return normalizedCommands;

	} catch (error) {
		console.error('Error fetching builtin commands:', error);
		return;
	}
}

export async function activate(context: vscode.ExtensionContext) {
	pathExecutableCache = new PathExecutableCache();
	context.subscriptions.push(pathExecutableCache);

	context.subscriptions.push(vscode.window.registerTerminalCompletionProvider({
		id: 'terminal-suggest',
		async provideTerminalCompletions(terminal: vscode.Terminal, terminalContext: vscode.TerminalCompletionContext, token: vscode.CancellationToken): Promise<vscode.TerminalCompletionItem[] | vscode.TerminalCompletionList | undefined> {
			if (token.isCancellationRequested) {
				return;
			}

			const shellType: TerminalShellType | undefined = 'shellType' in terminal.state ? terminal.state.shellType as TerminalShellType : undefined;
			if (!shellType) {
				return;
			}

			const commandsInPath = await pathExecutableCache.getExecutablesInPath(terminal.shellIntegration?.env?.value);
			const shellGlobals = await getShellGlobals(shellType, commandsInPath?.labels) ?? [];
			if (!commandsInPath?.completionResources) {
				return;
			}
			// Order is important here, add shell globals first so they are prioritized over path commands
			const commands = [...shellGlobals, ...commandsInPath.completionResources];
			const prefix = getPrefix(terminalContext.commandLine, terminalContext.cursorPosition);
			const pathSeparator = isWindows ? '\\' : '/';
			const tokenType = getTokenType(terminalContext, shellType);
			const result = await getCompletionItemsFromSpecs(availableSpecs, terminalContext, commands, prefix, tokenType, terminal.shellIntegration?.cwd, getEnvAsRecord(terminal.shellIntegration?.env?.value), terminal.name, token);
			if (terminal.shellIntegration?.env) {
				const homeDirCompletion = result.items.find(i => i.label === '~');
				if (homeDirCompletion && terminal.shellIntegration.env?.value?.HOME) {
					homeDirCompletion.documentation = getFriendlyResourcePath(vscode.Uri.file(terminal.shellIntegration.env.value.HOME), pathSeparator, vscode.TerminalCompletionItemKind.Folder);
					homeDirCompletion.kind = vscode.TerminalCompletionItemKind.Folder;
				}
			}

			if (result.cwd && (result.filesRequested || result.foldersRequested)) {
				return new vscode.TerminalCompletionList(result.items, { filesRequested: result.filesRequested, foldersRequested: result.foldersRequested, fileExtensions: result.fileExtensions, cwd: result.cwd, env: terminal.shellIntegration?.env?.value });
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
		if (isWindows) {
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
	return undefined;
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
	terminalContext: vscode.TerminalCompletionContext,
	availableCommands: ICompletionResource[],
	prefix: string,
	tokenType: TokenType,
	shellIntegrationCwd: vscode.Uri | undefined,
	env: Record<string, string>,
	name: string,
	token?: vscode.CancellationToken,
	executeExternals?: IFigExecuteExternals,
): Promise<{ items: vscode.TerminalCompletionItem[]; filesRequested: boolean; foldersRequested: boolean; fileExtensions?: string[]; cwd?: vscode.Uri }> {
	const items: vscode.TerminalCompletionItem[] = [];
	let filesRequested = false;
	let foldersRequested = false;
	let hasCurrentArg = false;
	let fileExtensions: string[] | undefined;

	let precedingText = terminalContext.commandLine.slice(0, terminalContext.cursorPosition + 1);
	if (isWindows) {
		const spaceIndex = precedingText.indexOf(' ');
		const commandEndIndex = spaceIndex === -1 ? precedingText.length : spaceIndex;
		const lastDotIndex = precedingText.lastIndexOf('.', commandEndIndex);
		if (lastDotIndex > 0) { // Don't treat dotfiles as extensions
			precedingText = precedingText.substring(0, lastDotIndex) + precedingText.substring(spaceIndex);
		}
	}

	const result = await getFigSuggestions(specs, terminalContext, availableCommands, prefix, tokenType, shellIntegrationCwd, env, name, precedingText, executeExternals ?? { executeCommand, executeCommandTimeout }, token);
	if (result) {
		hasCurrentArg ||= result.hasCurrentArg;
		filesRequested ||= result.filesRequested;
		foldersRequested ||= result.foldersRequested;
		fileExtensions = result.fileExtensions;
		if (result.items) {
			items.push(...result.items);
		}
	}

	if (tokenType === TokenType.Command) {
		// Include builitin/available commands in the results
		const labels = new Set(items.map((i) => typeof i.label === 'string' ? i.label : i.label.label));
		for (const command of availableCommands) {
			const commandTextLabel = typeof command.label === 'string' ? command.label : command.label.label;
			if (!labels.has(commandTextLabel)) {
				items.push(createCompletionItem(
					terminalContext.cursorPosition,
					prefix,
					command,
					command.detail,
					command.documentation
				));
				labels.add(commandTextLabel);
			} else {
				const existingItem = items.find(i => (typeof i.label === 'string' ? i.label : i.label.label) === commandTextLabel);
				if (!existingItem) {
					continue;
				}
				const preferredItem = compareItems(existingItem, command);
				if (preferredItem) {
					items.splice(items.indexOf(existingItem), 1, preferredItem);
				}
			}
		}
		filesRequested = true;
		foldersRequested = true;
	}
	// For arguments when no fig suggestions are found these are fallback suggestions
	else if (!items.length && !filesRequested && !foldersRequested && !hasCurrentArg) {
		if (terminalContext.allowFallbackCompletions) {
			filesRequested = true;
			foldersRequested = true;
		}
	}

	let cwd: vscode.Uri | undefined;
	if (shellIntegrationCwd && (filesRequested || foldersRequested)) {
		cwd = await resolveCwdFromPrefix(prefix, shellIntegrationCwd);
	}

	return { items, filesRequested, foldersRequested, fileExtensions, cwd };
}

function compareItems(existingItem: vscode.TerminalCompletionItem, command: ICompletionResource): vscode.TerminalCompletionItem | undefined {
	let score = typeof command.label === 'object' ? (command.label.detail !== undefined ? 1 : 0) : 0;
	score += typeof command.label === 'object' ? (command.label.description !== undefined ? 2 : 0) : 0;
	score += command.documentation ? typeof command.documentation === 'string' ? 2 : 3 : 0;
	if (score > 0) {
		score -= typeof existingItem.label === 'object' ? (existingItem.label.detail !== undefined ? 1 : 0) : 0;
		score -= typeof existingItem.label === 'object' ? (existingItem.label.description !== undefined ? 2 : 0) : 0;
		score -= existingItem.documentation ? typeof existingItem.documentation === 'string' ? 2 : 3 : 0;
		if (score >= 0) {
			return { ...command, replacementIndex: existingItem.replacementIndex, replacementLength: existingItem.replacementLength };
		}
	}
}

function getShell(shellType: TerminalShellType): string | undefined {
	switch (shellType) {
		case TerminalShellType.Bash:
			return 'bash';
		case TerminalShellType.Fish:
			return 'fish';
		case TerminalShellType.Zsh:
			return 'zsh';
		case TerminalShellType.PowerShell:
			return 'pwsh';
		default: {
			return undefined;
		}
	}
}

function getEnvAsRecord(shellIntegrationEnv: { [key: string]: string | undefined } | undefined): Record<string, string> {
	const env: Record<string, string> = {};
	if (shellIntegrationEnv) {
		for (const [key, value] of Object.entries(shellIntegrationEnv)) {
			if (typeof value === 'string') {
				env[key] = value;
			}
		}
	}
	return env;
}
