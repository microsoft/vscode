/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env } from '../../../../base/common/process.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { GeneralShellType, PosixShellType, TerminalSettingId, TerminalShellType } from '../../../../platform/terminal/common/terminal.js';
import { URI } from '../../../../base/common/uri.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { Schemas } from '../../../../base/common/network.js';
import { isWindows, OperatingSystem } from '../../../../base/common/platform.js';
import { join } from '../../../../base/common/path.js';

/**
 * Tracks a list of generic entries.
 */
export interface ITerminalPersistedHistory<T> {
	/**
	 * The persisted entries.
	 */
	readonly entries: IterableIterator<[string, T]>;
	/**
	 * Adds an entry.
	 */
	add(key: string, value: T): void;
	/**
	 * Removes an entry.
	 */
	remove(key: string): void;
	/**
	 * Clears all entries.
	 */
	clear(): void;
}

interface ISerializedCache<T> {
	entries: { key: string; value: T }[];
}

const enum Constants {
	DefaultHistoryLimit = 100
}

const enum StorageKeys {
	Entries = 'terminal.history.entries',
	Timestamp = 'terminal.history.timestamp'
}

let commandHistory: ITerminalPersistedHistory<{ shellType: TerminalShellType }> | undefined = undefined;
export function getCommandHistory(accessor: ServicesAccessor): ITerminalPersistedHistory<{ shellType: TerminalShellType | undefined }> {
	if (!commandHistory) {
		commandHistory = accessor.get(IInstantiationService).createInstance(TerminalPersistedHistory, 'commands') as TerminalPersistedHistory<{ shellType: TerminalShellType }>;
	}
	return commandHistory;
}

let directoryHistory: ITerminalPersistedHistory<{ remoteAuthority?: string }> | undefined = undefined;
export function getDirectoryHistory(accessor: ServicesAccessor): ITerminalPersistedHistory<{ remoteAuthority?: string }> {
	if (!directoryHistory) {
		directoryHistory = accessor.get(IInstantiationService).createInstance(TerminalPersistedHistory, 'dirs') as TerminalPersistedHistory<{ remoteAuthority?: string }>;
	}
	return directoryHistory;
}

// Shell file history loads once per shell per window
const shellFileHistory: Map<TerminalShellType | undefined, string[] | null> = new Map();
export async function getShellFileHistory(accessor: ServicesAccessor, shellType: TerminalShellType | undefined): Promise<string[]> {
	const cached = shellFileHistory.get(shellType);
	if (cached === null) {
		return [];
	}
	if (cached !== undefined) {
		return cached;
	}
	let result: IterableIterator<string> | undefined;
	switch (shellType) {
		case PosixShellType.Bash:
			result = await fetchBashHistory(accessor);
			break;
		case GeneralShellType.PowerShell:
			result = await fetchPwshHistory(accessor);
			break;
		case PosixShellType.Zsh:
			result = await fetchZshHistory(accessor);
			break;
		case PosixShellType.Fish:
			result = await fetchFishHistory(accessor);
			break;
		case GeneralShellType.Python:
			result = await fetchPythonHistory(accessor);
			break;
		default: return [];
	}
	if (result === undefined) {
		shellFileHistory.set(shellType, null);
		return [];
	}
	const array = Array.from(result);
	shellFileHistory.set(shellType, array);
	return array;
}
export function clearShellFileHistory() {
	shellFileHistory.clear();
}

export class TerminalPersistedHistory<T> extends Disposable implements ITerminalPersistedHistory<T> {
	private readonly _entries: LRUCache<string, T>;
	private _timestamp: number = 0;
	private _isReady = false;
	private _isStale = true;

	get entries(): IterableIterator<[string, T]> {
		this._ensureUpToDate();
		return this._entries.entries();
	}

	constructor(
		private readonly _storageDataKey: string,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		super();

		// Init cache
		this._entries = new LRUCache<string, T>(this._getHistoryLimit());

		// Listen for config changes to set history limit
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.ShellIntegrationCommandHistory)) {
				this._entries.limit = this._getHistoryLimit();
			}
		}));

		// Listen to cache changes from other windows
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, this._getTimestampStorageKey(), this._store)(() => {
			if (!this._isStale) {
				this._isStale = this._storageService.getNumber(this._getTimestampStorageKey(), StorageScope.APPLICATION, 0) !== this._timestamp;
			}
		}));
	}

	add(key: string, value: T) {
		this._ensureUpToDate();
		this._entries.set(key, value);
		this._saveState();
	}

	remove(key: string) {
		this._ensureUpToDate();
		this._entries.delete(key);
		this._saveState();
	}

	clear() {
		this._ensureUpToDate();
		this._entries.clear();
		this._saveState();
	}

	private _ensureUpToDate() {
		// Initial load
		if (!this._isReady) {
			this._loadState();
			this._isReady = true;
		}

		// React to stale cache caused by another window
		if (this._isStale) {
			// Since state is saved whenever the entries change, it's a safe assumption that no
			// merging of entries needs to happen, just loading the new state.
			this._entries.clear();
			this._loadState();
			this._isStale = false;
		}
	}

	private _loadState() {
		this._timestamp = this._storageService.getNumber(this._getTimestampStorageKey(), StorageScope.APPLICATION, 0);

		// Load global entries plus
		const serialized = this._loadPersistedState();
		if (serialized) {
			for (const entry of serialized.entries) {
				this._entries.set(entry.key, entry.value);
			}
		}
	}

	private _loadPersistedState(): ISerializedCache<T> | undefined {
		const raw = this._storageService.get(this._getEntriesStorageKey(), StorageScope.APPLICATION);
		if (raw === undefined || raw.length === 0) {
			return undefined;
		}
		let serialized: ISerializedCache<T> | undefined = undefined;
		try {
			serialized = JSON.parse(raw);
		} catch {
			// Invalid data
			return undefined;
		}
		return serialized;
	}

	private _saveState() {
		const serialized: ISerializedCache<T> = { entries: [] };
		this._entries.forEach((value, key) => serialized.entries.push({ key, value }));
		this._storageService.store(this._getEntriesStorageKey(), JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._timestamp = Date.now();
		this._storageService.store(this._getTimestampStorageKey(), this._timestamp, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private _getHistoryLimit() {
		const historyLimit = this._configurationService.getValue(TerminalSettingId.ShellIntegrationCommandHistory);
		return typeof historyLimit === 'number' ? historyLimit : Constants.DefaultHistoryLimit;
	}

	private _getTimestampStorageKey() {
		return `${StorageKeys.Timestamp}.${this._storageDataKey}`;
	}

	private _getEntriesStorageKey() {
		return `${StorageKeys.Entries}.${this._storageDataKey}`;
	}
}

export async function fetchBashHistory(accessor: ServicesAccessor): Promise<IterableIterator<string> | undefined> {
	const fileService = accessor.get(IFileService);
	const remoteAgentService = accessor.get(IRemoteAgentService);
	const remoteEnvironment = await remoteAgentService.getEnvironment();
	if (remoteEnvironment?.os === OperatingSystem.Windows || !remoteEnvironment && isWindows) {
		return undefined;
	}
	const content = await fetchFileContents(env['HOME'], '.bash_history', false, fileService, remoteAgentService);
	if (content === undefined) {
		return undefined;
	}
	// .bash_history does not differentiate wrapped commands from multiple commands. Parse
	// the output to get the
	const fileLines = content.split('\n');
	const result: Set<string> = new Set();
	let currentLine: string;
	let currentCommand: string | undefined = undefined;
	let wrapChar: string | undefined = undefined;
	for (let i = 0; i < fileLines.length; i++) {
		currentLine = fileLines[i];
		if (currentCommand === undefined) {
			currentCommand = currentLine;
		} else {
			currentCommand += `\n${currentLine}`;
		}
		for (let c = 0; c < currentLine.length; c++) {
			if (wrapChar) {
				if (currentLine[c] === wrapChar) {
					wrapChar = undefined;
				}
			} else {
				if (currentLine[c].match(/['"]/)) {
					wrapChar = currentLine[c];
				}
			}
		}
		if (wrapChar === undefined) {
			if (currentCommand.length > 0) {
				result.add(currentCommand.trim());
			}
			currentCommand = undefined;
		}
	}

	return result.values();
}

export async function fetchZshHistory(accessor: ServicesAccessor) {
	const fileService = accessor.get(IFileService);
	const remoteAgentService = accessor.get(IRemoteAgentService);
	const remoteEnvironment = await remoteAgentService.getEnvironment();
	if (remoteEnvironment?.os === OperatingSystem.Windows || !remoteEnvironment && isWindows) {
		return undefined;
	}
	const content = await fetchFileContents(env['HOME'], '.zsh_history', false, fileService, remoteAgentService);
	if (content === undefined) {
		return undefined;
	}
	const fileLines = content.split(/\:\s\d+\:\d+;/);
	const result: Set<string> = new Set();
	for (let i = 0; i < fileLines.length; i++) {
		const sanitized = fileLines[i].replace(/\\\n/g, '\n').trim();
		if (sanitized.length > 0) {
			result.add(sanitized);
		}
	}
	return result.values();
}


export async function fetchPythonHistory(accessor: ServicesAccessor): Promise<IterableIterator<string> | undefined> {
	const fileService = accessor.get(IFileService);
	const remoteAgentService = accessor.get(IRemoteAgentService);

	const content = await fetchFileContents(env['HOME'], '.python_history', false, fileService, remoteAgentService);

	if (content === undefined) {
		return undefined;
	}

	// Python history file is a simple text file with one command per line
	const fileLines = content.split('\n');
	const result: Set<string> = new Set();

	fileLines.forEach(line => {
		if (line.trim().length > 0) {
			result.add(line.trim());
		}
	});

	return result.values();
}

export async function fetchPwshHistory(accessor: ServicesAccessor) {
	const fileService: Pick<IFileService, 'readFile'> = accessor.get(IFileService);
	const remoteAgentService: Pick<IRemoteAgentService, 'getConnection' | 'getEnvironment'> = accessor.get(IRemoteAgentService);
	let folderPrefix: string | undefined;
	let filePath: string;
	const remoteEnvironment = await remoteAgentService.getEnvironment();
	const isFileWindows = remoteEnvironment?.os === OperatingSystem.Windows || !remoteEnvironment && isWindows;
	if (isFileWindows) {
		folderPrefix = env['APPDATA'];
		filePath = 'Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt';
	} else {
		folderPrefix = env['HOME'];
		filePath = '.local/share/powershell/PSReadline/ConsoleHost_history.txt';
	}
	const content = await fetchFileContents(folderPrefix, filePath, isFileWindows, fileService, remoteAgentService);
	if (content === undefined) {
		return undefined;
	}
	const fileLines = content.split('\n');
	const result: Set<string> = new Set();
	let currentLine: string;
	let currentCommand: string | undefined = undefined;
	let wrapChar: string | undefined = undefined;
	for (let i = 0; i < fileLines.length; i++) {
		currentLine = fileLines[i];
		if (currentCommand === undefined) {
			currentCommand = currentLine;
		} else {
			currentCommand += `\n${currentLine}`;
		}
		if (!currentLine.endsWith('`')) {
			const sanitized = currentCommand.trim();
			if (sanitized.length > 0) {
				result.add(sanitized);
			}
			currentCommand = undefined;
			continue;
		}
		// If the line ends with `, the line may be wrapped. Need to also test the case where ` is
		// the last character in the line
		for (let c = 0; c < currentLine.length; c++) {
			if (wrapChar) {
				if (currentLine[c] === wrapChar) {
					wrapChar = undefined;
				}
			} else {
				if (currentLine[c].match(/`/)) {
					wrapChar = currentLine[c];
				}
			}
		}
		// Having an even number of backticks means the line is terminated
		// TODO: This doesn't cover more complicated cases where ` is within quotes
		if (!wrapChar) {
			const sanitized = currentCommand.trim();
			if (sanitized.length > 0) {
				result.add(sanitized);
			}
			currentCommand = undefined;
		} else {
			// Remove trailing backtick
			currentCommand = currentCommand.replace(/`$/, '');
			wrapChar = undefined;
		}
	}

	return result.values();
}

export async function fetchFishHistory(accessor: ServicesAccessor) {
	const fileService = accessor.get(IFileService);
	const remoteAgentService = accessor.get(IRemoteAgentService);
	const remoteEnvironment = await remoteAgentService.getEnvironment();
	if (remoteEnvironment?.os === OperatingSystem.Windows || !remoteEnvironment && isWindows) {
		return undefined;
	}

	/**
	 * From `fish` docs:
	 * > The command history is stored in the file ~/.local/share/fish/fish_history
	 *   (or $XDG_DATA_HOME/fish/fish_history if that variable is set) by default.
	 *
	 * (https://fishshell.com/docs/current/interactive.html#history-search)
	 */
	const overridenDataHome = env['XDG_DATA_HOME'];

	// TODO: Unchecked fish behavior:
	// What if XDG_DATA_HOME was defined but somehow $XDG_DATA_HOME/fish/fish_history
	// was not exist. Does fish fall back to ~/.local/share/fish/fish_history?

	const content = await (overridenDataHome
		? fetchFileContents(env['XDG_DATA_HOME'], 'fish/fish_history', false, fileService, remoteAgentService)
		: fetchFileContents(env['HOME'], '.local/share/fish/fish_history', false, fileService, remoteAgentService));
	if (content === undefined) {
		return undefined;
	}

	/**
	 * These apply to `fish` v3.5.1:
	 * - It looks like YAML but it's not. It's, quoting, *"a broken psuedo-YAML"*.
	 *   See these discussions for more details:
	 *   - https://github.com/fish-shell/fish-shell/pull/6493
	 *   - https://github.com/fish-shell/fish-shell/issues/3341
	 * - Every record should exactly start with `- cmd:` (the whitespace between `-` and `cmd` cannot be replaced with tab)
	 * - Both `- cmd: echo 1` and `- cmd:echo 1` are valid entries.
	 * - Backslashes are esacped as `\\`.
	 * - Multiline commands are joined with a `\n` sequence, hence they're read as single line commands.
	 * - Property `when` is optional.
	 * - History navigation respects the records order and ignore the actual `when` property values (chronological order).
	 * - If `cmd` value is multiline , it just takes the first line. Also YAML operators like `>-` or `|-` are not supported.
	 */
	const result: Set<string> = new Set();
	const cmds = content.split('\n')
		.filter(x => x.startsWith('- cmd:'))
		.map(x => x.substring(6).trimStart());
	for (let i = 0; i < cmds.length; i++) {
		const sanitized = sanitizeFishHistoryCmd(cmds[i]).trim();
		if (sanitized.length > 0) {
			result.add(sanitized);
		}
	}
	return result.values();
}

export function sanitizeFishHistoryCmd(cmd: string): string {
	/**
	 * NOTE
	 * This repeatedReplace() call can be eliminated by using look-ahead
	 * caluses in the original RegExp pattern:
	 *
	 * >>> ```ts
	 * >>> cmds[i].replace(/(?<=^|[^\\])((?:\\\\)*)(\\n)/g, '$1\n')
	 * >>> ```
	 *
	 * But since not all browsers support look aheads we opted to a simple
	 * pattern and repeatedly calling replace method.
	 */
	return repeatedReplace(/(^|[^\\])((?:\\\\)*)(\\n)/g, cmd, '$1$2\n');
}

function repeatedReplace(pattern: RegExp, value: string, replaceValue: string): string {
	let last;
	let current = value;
	while (true) {
		last = current;
		current = current.replace(pattern, replaceValue);
		if (current === last) {
			return current;
		}
	}
}

async function fetchFileContents(
	folderPrefix: string | undefined,
	filePath: string,
	isFileWindows: boolean,
	fileService: Pick<IFileService, 'readFile'>,
	remoteAgentService: Pick<IRemoteAgentService, 'getConnection'>,
): Promise<string | undefined> {
	if (!folderPrefix) {
		return undefined;
	}
	const connection = remoteAgentService.getConnection();
	const isRemote = !!connection?.remoteAuthority;
	const historyFileUri = URI.from({
		scheme: isRemote ? Schemas.vscodeRemote : Schemas.file,
		authority: isRemote ? connection.remoteAuthority : undefined,
		path: URI.file(join(folderPrefix, filePath)).path
	});
	let content: IFileContent;
	try {
		content = await fileService.readFile(historyFileUri);
	} catch (e: unknown) {
		// Handle file not found only
		if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
			return undefined;
		}
		throw e;
	}
	if (content === undefined) {
		return undefined;
	}
	return content.value.toString();
}
