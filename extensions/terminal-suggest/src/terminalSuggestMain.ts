/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExecOptionsWithStringEncoding } from 'child_process';
import * as vscode from 'vscode';
import azdSpec from './completions/azd';
import cdSpec from './completions/cd';
import codeCompletionSpec from './completions/code';
import codeInsidersCompletionSpec from './completions/code-insiders';
import codeTunnelCompletionSpec from './completions/code-tunnel';
import codeTunnelInsidersCompletionSpec from './completions/code-tunnel-insiders';
import copilotSpec from './completions/copilot';
import gitCompletionSpec from './completions/git';
import ghCompletionSpec from './completions/gh';
import npxCompletionSpec from './completions/npx';
import setLocationSpec from './completions/set-location';
import { upstreamSpecs } from './constants';
import { ITerminalEnvironment, PathExecutableCache, watchPathDirectories } from './env/pathExecutableCache';
import { executeCommand, executeCommandTimeout, IFigExecuteExternals } from './fig/execute';
import { getFigSuggestions } from './fig/figInterface';
import { createCompletionItem } from './helpers/completionItem';
import { osIsWindows } from './helpers/os';
import { createTimeoutPromise } from './helpers/promise';
import { getFriendlyResourcePath } from './helpers/uri';
import { getBashGlobals } from './shell/bash';
import { getFishGlobals } from './shell/fish';
import { getPwshGlobals } from './shell/pwsh';
import { getZshGlobals } from './shell/zsh';
import { defaultShellTypeResetChars, getTokenType, shellTypeResetChars, TokenType } from './tokens';
import type { ICompletionResource } from './types';
import { basename } from 'path';

export const enum TerminalShellType {
	Bash = 'bash',
	Fish = 'fish',
	Zsh = 'zsh',
	PowerShell = 'pwsh',
	WindowsPowerShell = 'powershell',
	GitBash = 'gitbash',
}

const isWindows = osIsWindows();
type ShellGlobalsCacheEntry = {
	commands: ICompletionResource[] | undefined;
	existingCommands?: string[];
};

type ShellGlobalsCacheEntryWithMeta = ShellGlobalsCacheEntry & { timestamp: number };
const cachedGlobals: Map<string, ShellGlobalsCacheEntryWithMeta> = new Map();
const inflightRequests: Map<string, Promise<ICompletionResource[] | undefined>> = new Map();
let pathExecutableCache: PathExecutableCache;
const CACHE_KEY = 'terminalSuggestGlobalsCacheV2';
let globalStorageUri: vscode.Uri;
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function getCacheKey(machineId: string, remoteAuthority: string | undefined, shellType: TerminalShellType): string {
	return `${machineId}:${remoteAuthority ?? 'local'}:${shellType}`;
}

export const availableSpecs: Fig.Spec[] = [
	azdSpec,
	cdSpec,
	codeInsidersCompletionSpec,
	codeCompletionSpec,
	codeTunnelCompletionSpec,
	codeTunnelInsidersCompletionSpec,
	copilotSpec,
	gitCompletionSpec,
	ghCompletionSpec,
	npxCompletionSpec,
	setLocationSpec,
];
for (const spec of upstreamSpecs) {
	availableSpecs.push(require(`./completions/upstream/${spec}`).default);
}

const getShellSpecificGlobals: Map<TerminalShellType, (options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>) => Promise<(string | ICompletionResource)[]>> = new Map([
	[TerminalShellType.Bash, getBashGlobals],
	[TerminalShellType.Zsh, getZshGlobals],
	[TerminalShellType.GitBash, getBashGlobals], // Git Bash is a bash shell
	// TODO: Ghost text in the command line prevents completions from working ATM for fish
	[TerminalShellType.Fish, getFishGlobals],
	[TerminalShellType.PowerShell, getPwshGlobals],
	[TerminalShellType.WindowsPowerShell, getPwshGlobals],
]);

async function getShellGlobals(
	shellType: TerminalShellType,
	existingCommands?: Set<string>,
	machineId?: string,
	remoteAuthority?: string
): Promise<ICompletionResource[] | undefined> {
	if (!machineId) {
		// fallback: don't cache
		return await fetchAndCacheShellGlobals(shellType, existingCommands, undefined, undefined);
	}
	const cacheKey = getCacheKey(machineId, remoteAuthority, shellType);
	const cached = cachedGlobals.get(cacheKey);
	const now = Date.now();
	const existingCommandsArr = existingCommands ? Array.from(existingCommands) : undefined;
	let shouldRefresh = false;
	if (cached) {
		// Evict if too old
		if (now - cached.timestamp > CACHE_MAX_AGE_MS) {
			cachedGlobals.delete(cacheKey);
			await writeGlobalsCache();
		} else {
			if (existingCommandsArr && cached.existingCommands) {
				if (existingCommandsArr.length !== cached.existingCommands.length) {
					shouldRefresh = true;
				}
			} else if (existingCommandsArr || cached.existingCommands) {
				shouldRefresh = true;
			}
			if (!shouldRefresh && cached.commands) {
				// NOTE: This used to trigger a background refresh in order to ensure all commands
				// are up to date, but this ends up launching way too many processes. Especially on
				// Windows where this caused significant performance issues as processes can block
				// the extension host for several seconds
				// (https://github.com/microsoft/vscode/issues/259343).
				return cached.commands;
			}
		}
	}
	// No cache or should refresh
	return await fetchAndCacheShellGlobals(shellType, existingCommands, machineId, remoteAuthority);
}

async function fetchAndCacheShellGlobals(
	shellType: TerminalShellType,
	existingCommands?: Set<string>,
	machineId?: string,
	remoteAuthority?: string,
	background?: boolean
): Promise<ICompletionResource[] | undefined> {
	const cacheKey = getCacheKey(machineId ?? 'no-machine-id', remoteAuthority, shellType);

	// Check if there's a cached entry
	const cached = cachedGlobals.get(cacheKey);
	if (cached) {
		return cached.commands;
	}

	// Check if there's already an in-flight request for this cache key
	const existingRequest = inflightRequests.get(cacheKey);
	if (existingRequest) {
		// Wait for the existing request to complete rather than spawning a new process
		return existingRequest;
	}

	// Create a new request and store it in the inflight map
	const requestPromise = (async () => {
		try {
			let execShellType = shellType;
			if (shellType === TerminalShellType.GitBash) {
				execShellType = TerminalShellType.Bash; // Git Bash is a bash shell
			}
			const options: ExecOptionsWithStringEncoding = { encoding: 'utf-8', shell: execShellType, windowsHide: true };
			const mixedCommands: (string | ICompletionResource)[] | undefined = await getShellSpecificGlobals.get(shellType)?.(options, existingCommands);
			const normalizedCommands = mixedCommands?.map(command => typeof command === 'string' ? ({ label: command }) : command);
			if (machineId) {
				const cacheKey = getCacheKey(machineId, remoteAuthority, shellType);
				cachedGlobals.set(cacheKey, {
					commands: normalizedCommands,
					existingCommands: existingCommands ? Array.from(existingCommands) : undefined,
					timestamp: Date.now()
				});
				await writeGlobalsCache();
			}
			return normalizedCommands;
		} catch (error) {
			if (!background) {
				console.error('Error fetching builtin commands:', error);
			}
			return;
		} finally {
			// Always remove the promise from inflight requests when done
			inflightRequests.delete(cacheKey);
		}
	})();

	// Store the promise in the inflight map
	inflightRequests.set(cacheKey, requestPromise);

	return requestPromise;
}


async function writeGlobalsCache(): Promise<void> {
	if (!globalStorageUri) {
		return;
	}
	// Remove old entries
	const now = Date.now();
	for (const [key, value] of cachedGlobals.entries()) {
		if (now - value.timestamp > CACHE_MAX_AGE_MS) {
			cachedGlobals.delete(key);
		}
	}
	const obj: Record<string, ShellGlobalsCacheEntryWithMeta> = {};
	for (const [key, value] of cachedGlobals.entries()) {
		obj[key] = value;
	}
	try {
		// Ensure the directory exists
		const terminalSuggestDir = vscode.Uri.joinPath(globalStorageUri, 'terminal-suggest');
		await vscode.workspace.fs.createDirectory(terminalSuggestDir);
		const cacheFile = vscode.Uri.joinPath(terminalSuggestDir, `${CACHE_KEY}.json`);
		const data = Buffer.from(JSON.stringify(obj), 'utf8');
		await vscode.workspace.fs.writeFile(cacheFile, data);
	} catch (err) {
		console.error('Failed to write terminal suggest globals cache:', err);
	}
}


async function readGlobalsCache(): Promise<void> {
	if (!globalStorageUri) {
		return;
	}
	try {
		const terminalSuggestDir = vscode.Uri.joinPath(globalStorageUri, 'terminal-suggest');
		const cacheFile = vscode.Uri.joinPath(terminalSuggestDir, `${CACHE_KEY}.json`);
		const data = await vscode.workspace.fs.readFile(cacheFile);
		const obj = JSON.parse(data.toString()) as Record<string, ShellGlobalsCacheEntryWithMeta>;
		if (obj) {
			for (const key of Object.keys(obj)) {
				cachedGlobals.set(key, obj[key]);
			}
		}
	} catch (err) {
		// File might not exist yet, which is expected on first run
		if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
			// This is expected on first run
			return;
		}
		console.error('Failed to read terminal suggest globals cache:', err);
	}
}



export async function activate(context: vscode.ExtensionContext) {
	pathExecutableCache = new PathExecutableCache();
	context.subscriptions.push(pathExecutableCache);
	let currentTerminalEnv: ITerminalEnvironment = process.env;

	globalStorageUri = context.globalStorageUri;
	await readGlobalsCache();

	// Get a machineId for this install (persisted per machine, not synced)
	const machineId = await vscode.env.machineId;
	const remoteAuthority = vscode.env.remoteName;

	context.subscriptions.push(vscode.window.registerTerminalCompletionProvider({
		async provideTerminalCompletions(terminal: vscode.Terminal, terminalContext: vscode.TerminalCompletionContext, token: vscode.CancellationToken): Promise<vscode.TerminalCompletionItem[] | vscode.TerminalCompletionList | undefined> {
			currentTerminalEnv = terminal.shellIntegration?.env?.value ?? process.env;
			if (token.isCancellationRequested) {
				console.debug('#terminalCompletions token cancellation requested');
				return;
			}

			const shellType: string | undefined = 'shell' in terminal.state ? terminal.state.shell as string : undefined;
			const terminalShellType = getTerminalShellType(shellType);
			if (!terminalShellType) {
				console.debug(`#terminalCompletions Shell type ${shellType} not supported`);
				return;
			}

			const commandsInPath = await pathExecutableCache.getExecutablesInPath(terminal.shellIntegration?.env?.value, terminalShellType);
			const shellGlobals = await getShellGlobals(terminalShellType, commandsInPath?.labels, machineId, remoteAuthority) ?? [];

			if (!commandsInPath?.completionResources) {
				console.debug('#terminalCompletions No commands found in path');
				return;
			}
			// Order is important here, add shell globals first so they are prioritized over path commands
			const commands = [...shellGlobals, ...commandsInPath.completionResources];
			const currentCommandString = getCurrentCommandAndArgs(terminalContext.commandLine, terminalContext.cursorIndex, terminalShellType);
			const pathSeparator = isWindows ? '\\' : '/';
			const tokenType = getTokenType(terminalContext, terminalShellType);
			const result = await Promise.race([
				getCompletionItemsFromSpecs(
					availableSpecs,
					terminalContext,
					commands,
					currentCommandString,
					tokenType,
					terminal.shellIntegration?.cwd,
					getEnvAsRecord(currentTerminalEnv),
					terminal.name,
					token
				),
				createTimeoutPromise(5000, undefined)
			]);
			if (!result) {
				console.debug('#terminalCompletions Timed out fetching completions from specs');
				return;
			}

			if (terminal.shellIntegration?.env) {
				const homeDirCompletion = result.items.find(i => i.label === '~');
				if (homeDirCompletion && terminal.shellIntegration.env?.value?.HOME) {
					homeDirCompletion.documentation = getFriendlyResourcePath(vscode.Uri.file(terminal.shellIntegration.env.value.HOME), pathSeparator, vscode.TerminalCompletionItemKind.Folder);
					homeDirCompletion.kind = vscode.TerminalCompletionItemKind.Folder;
				}
			}

			const cwd = result.cwd ?? terminal.shellIntegration?.cwd;
			if (cwd && (result.showFiles || result.showFolders)) {
				const globPattern = createFileGlobPattern(result.fileExtensions);
				return new vscode.TerminalCompletionList(result.items, {
					showFiles: result.showFiles,
					showDirectories: result.showFolders,
					globPattern,
					cwd,
				});
			}
			return result.items;
		}
	}, '/', '\\'));
	await watchPathDirectories(context, currentTerminalEnv, pathExecutableCache);

	context.subscriptions.push(vscode.commands.registerCommand('terminal.integrated.suggest.clearCachedGlobals', () => {
		cachedGlobals.clear();
	}));
}

/**
 * Adjusts the current working directory based on a given current command string if it is a folder.
 * @param currentCommandString - The current command string, which might contain a folder path prefix.
 * @param currentCwd - The current working directory.
 * @returns The new working directory.
 */
export async function resolveCwdFromCurrentCommandString(currentCommandString: string, currentCwd?: vscode.Uri): Promise<vscode.Uri | undefined> {
	const prefix = currentCommandString.split(/\s+/).pop()?.trim() ?? '';

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

		// Use vscode.Uri.joinPath for path resolution
		const resolvedUri = vscode.Uri.joinPath(currentCwd, relativeFolder);

		const stat = await vscode.workspace.fs.stat(resolvedUri);
		if (stat.type & vscode.FileType.Directory) {
			return resolvedUri;
		}
	} catch {
		// Ignore errors
	}

	// No valid path found
	return undefined;
}

// Retrurns the string that represents the current command and its arguments up to the cursor position.
// Uses shell specific separators to determine the current command and its arguments.
export function getCurrentCommandAndArgs(commandLine: string, cursorIndex: number, shellType: TerminalShellType | undefined): string {

	// Return an empty string if the command line is empty after trimming
	if (commandLine.trim() === '') {
		return '';
	}

	// Check if cursor is not at the end and there's non-whitespace after the cursor
	if (cursorIndex < commandLine.length && /\S/.test(commandLine[cursorIndex])) {
		return '';
	}

	// Extract the part of the line up to the cursor position
	const beforeCursor = commandLine.slice(0, cursorIndex);

	const resetChars = shellType ? shellTypeResetChars.get(shellType) ?? defaultShellTypeResetChars : defaultShellTypeResetChars;
	// Find the last reset character before the cursor
	let lastResetIndex = -1;
	for (const char of resetChars) {
		const idx = beforeCursor.lastIndexOf(char);
		if (idx > lastResetIndex) {
			lastResetIndex = idx;
		}
	}

	// The start of the current command string is after the last reset char (plus one for the char itself)
	const currentCommandStart = lastResetIndex + 1;
	const currentCommandString = beforeCursor.slice(currentCommandStart).replace(/^\s+/, '');

	return currentCommandString;
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
	currentCommandString: string,
	tokenType: TokenType,
	shellIntegrationCwd: vscode.Uri | undefined,
	env: Record<string, string>,
	name: string,
	token?: vscode.CancellationToken,
	executeExternals?: IFigExecuteExternals,
): Promise<{ items: vscode.TerminalCompletionItem[]; showFiles: boolean; showFolders: boolean; fileExtensions?: string[]; cwd?: vscode.Uri }> {
	let items: vscode.TerminalCompletionItem[] = [];
	let showFiles = false;
	let showFolders = false;
	let hasCurrentArg = false;
	let fileExtensions: string[] | undefined;

	if (isWindows) {
		const spaceIndex = currentCommandString.indexOf(' ');
		const commandEndIndex = spaceIndex === -1 ? currentCommandString.length : spaceIndex;
		const lastDotIndex = currentCommandString.lastIndexOf('.', commandEndIndex);
		if (lastDotIndex > 0) { // Don't treat dotfiles as extensions
			currentCommandString = currentCommandString.substring(0, lastDotIndex) + currentCommandString.substring(spaceIndex);
		}
	}

	let executeExternalsFallbackCwd = shellIntegrationCwd?.fsPath;
	if (!executeExternalsFallbackCwd) {
		console.error('No shellIntegrationCwd set, falling back to process.cwd()');
		executeExternalsFallbackCwd = process.cwd();
	}
	const executeExternalsFallbacks: {
		cwd: string;
		env: Record<string, string | undefined>;
	} = {
		cwd: executeExternalsFallbackCwd,
		env,
	};
	const executeExternalsWithFallback = executeExternals ?? {
		executeCommand: executeCommand.bind(executeCommand, executeExternalsFallbacks),
		executeCommandTimeout: executeCommandTimeout.bind(executeCommandTimeout, executeExternalsFallbacks),
	};

	const result = await getFigSuggestions(specs, terminalContext, availableCommands, currentCommandString, tokenType, shellIntegrationCwd, env, name, executeExternalsWithFallback, token);
	if (result) {
		hasCurrentArg ||= result.hasCurrentArg;
		showFiles ||= result.showFiles;
		showFolders ||= result.showFolders;
		fileExtensions = result.fileExtensions;
		if (result.items) {
			items = items.concat(result.items);
		}
	}

	if (tokenType === TokenType.Command) {
		// Include builitin/available commands in the results
		const labels = new Set(items.map((i) => typeof i.label === 'string' ? i.label : i.label.label));
		for (const command of availableCommands) {
			const commandTextLabel = typeof command.label === 'string' ? command.label : command.label.label;
			// Remove any file extension for matching on Windows
			const labelWithoutExtension = isWindows ? commandTextLabel.replace(/\.[^ ]+$/, '') : commandTextLabel;
			if (!labels.has(labelWithoutExtension)) {
				items.push(createCompletionItem(
					terminalContext.cursorIndex,
					currentCommandString,
					command,
					command.detail,
					command.documentation,
					vscode.TerminalCompletionItemKind.Method
				));
				labels.add(commandTextLabel);
			}
			else {
				const existingItem = items.find(i => (typeof i.label === 'string' ? i.label : i.label.label) === commandTextLabel);
				if (!existingItem) {
					continue;
				}

				existingItem.documentation ??= command.documentation;
				existingItem.detail ??= command.detail;
			}
		}
		showFiles = true;
		showFolders = true;
	} else if (!items.length && !showFiles && !showFolders && !hasCurrentArg) {
		showFiles = true;
		showFolders = true;
	}

	let cwd: vscode.Uri | undefined;
	if (shellIntegrationCwd && (showFiles || showFolders)) {
		cwd = await resolveCwdFromCurrentCommandString(currentCommandString, shellIntegrationCwd);
	}

	return { items, showFiles, showFolders, fileExtensions, cwd };
}

function getEnvAsRecord(shellIntegrationEnv: ITerminalEnvironment): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(shellIntegrationEnv ?? process.env)) {
		if (typeof value === 'string') {
			env[key] = value;
		}
	}
	if (!shellIntegrationEnv) {
		sanitizeProcessEnvironment(env);
	}
	return env;
}

function getTerminalShellType(shellType: string | undefined): TerminalShellType | undefined {
	switch (shellType) {
		case 'bash':
			return TerminalShellType.Bash;
		case 'gitbash':
			return TerminalShellType.GitBash;
		case 'zsh':
			return TerminalShellType.Zsh;
		case 'pwsh':
			return basename(vscode.env.shell, '.exe') === 'powershell' ? TerminalShellType.WindowsPowerShell : TerminalShellType.PowerShell;
		case 'fish':
			return TerminalShellType.Fish;
		default:
			return undefined;
	}
}

export function sanitizeProcessEnvironment(env: Record<string, string>, ...preserve: string[]): void {
	const set = preserve.reduce<Record<string, boolean>>((set, key) => {
		set[key] = true;
		return set;
	}, {});
	const keysToRemove = [
		/^ELECTRON_.$/,
		/^VSCODE_(?!(PORTABLE|SHELL_LOGIN|ENV_REPLACE|ENV_APPEND|ENV_PREPEND)).+$/,
		/^SNAP(|_.*)$/,
		/^GDK_PIXBUF_.$/,
	];
	const envKeys = Object.keys(env);
	envKeys
		.filter(key => !set[key])
		.forEach(envKey => {
			for (let i = 0; i < keysToRemove.length; i++) {
				if (envKey.search(keysToRemove[i]) !== -1) {
					delete env[envKey];
					break;
				}
			}
		});
}

function createFileGlobPattern(fileExtensions?: string[]): string | undefined {
	if (!fileExtensions || fileExtensions.length === 0) {
		return undefined;
	}
	const exts = fileExtensions.map(ext => ext.startsWith('.') ? ext.slice(1) : ext);
	if (exts.length === 1) {
		return `**/*.${exts[0]}`;
	}
	return `**/*.{${exts.join(',')}}`;
}
