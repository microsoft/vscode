/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env } from 'vs/base/common/process';
import { Disposable } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { FileOperationError, FileOperationResult, IFileContent, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { TerminalSettingId, TerminalShellType } from 'vs/platform/terminal/common/terminal';
import { join } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { Schemas } from 'vs/base/common/network';

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
export function getCommandHistory(accessor: ServicesAccessor): ITerminalPersistedHistory<{ shellType: TerminalShellType }> {
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
		@IFileService private readonly _fileService: IFileService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		super();

		// Init cache
		this._entries = new LRUCache<string, T>(this._getHistoryLimit());

		this._fetchBashHistory().then(e => {
			console.log('bash history result', Array.from(e!));
		});
		this._fetchZshHistory().then(e => {
			console.log('zsh history result', Array.from(e!));
		});

		// Listen for config changes to set history limit
		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.ShellIntegrationCommandHistory)) {
				this._entries.limit = this._getHistoryLimit();
			}
		});

		// Listen to cache changes from other windows
		this._storageService.onDidChangeValue(e => {
			if (e.key === this._getTimestampStorageKey() && !this._isStale) {
				this._isStale = this._storageService.getNumber(this._getTimestampStorageKey(), StorageScope.APPLICATION, 0) !== this._timestamp;
			}
		});
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

	private async _fetchBashHistory(): Promise<IterableIterator<string> | undefined> {
		const content = await this._fetchFileContents(env['HOME'], '.bash_history');
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
				// TODO: Should the commands be trimmed here and elsewhere?
				result.add(currentCommand);
				currentCommand = undefined;
			}
		}

		return result.values();
	}

	private async _fetchZshHistory() {
		const content = await this._fetchFileContents(env['HOME'], '.zsh_history');
		if (content === undefined) {
			return undefined;
		}
		const fileLines = content.split(/\:\s\d+\:\d+;/);
		const result: Set<string> = new Set();
		for (let i = 0; i < fileLines.length; i++) {
			result.add(fileLines[i].replace(/\\\n/g, '\n').trim());
		}
		return result;
	}

	private async _fetchFileContents(folder: string | undefined, fileName: string): Promise<string | undefined> {
		if (!folder) {
			return undefined;
		}
		const isRemote = !!this._remoteAgentService.getConnection()?.remoteAuthority;
		const historyFileUri = URI.from({
			scheme: isRemote ? Schemas.vscodeRemote : Schemas.file,
			path: join(folder, fileName)
		});
		let content: IFileContent;
		try {
			content = await this._fileService.readFile(historyFileUri);
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
}
