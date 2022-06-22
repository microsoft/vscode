/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { TerminalSettingId, TerminalShellType } from 'vs/platform/terminal/common/terminal';

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
		@IStorageService private readonly _storageService: IStorageService
	) {
		super();

		// Init cache
		this._entries = new LRUCache<string, T>(this._getHistoryLimit());

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
}
