/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWhenIdle } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { TerminalShellType } from 'vs/platform/terminal/common/terminal';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

/**
 * Tracks a list of generic entries.
 */
export interface ITerminalPersistedHistory<T> {
	/**
	 * The persisted entries
	 */
	readonly entries: IterableIterator<T>;
	/**
	 * Adds an entry.
	 */
	add(entry: T): void;
	/**
	 * Removes an entry.
	 */
	remove(entry: T): void;
	/**
	 * A function that returns whether two entries are the same. This is required to correctly add
	 * and remove entries when T is not a primitive.
	 */
	isEqual(a: T, b: T): boolean;
}

const enum Constants {
	HistoryKeysStorageKey = 'terminal.history.keys'
}

export function clearCommandHistory(accessor: ServicesAccessor) {
	const storageService = accessor.get(IStorageService);
	for (const h of commandHistory.values()) {
		h.clear();
	}
	commandHistory.clear();
	storageService.remove(Constants.HistoryKeysStorageKey, StorageScope.GLOBAL);
}

const commandHistory: Map<string, TerminalPersistedCommands> = new Map();
export function getCommandHistory(accessor: ServicesAccessor, shellType: TerminalShellType): TerminalPersistedCommands {
	const shellKey = shellType ?? 'undefined';
	let history = commandHistory.get(shellKey);
	if (!history) {
		history = accessor.get(IInstantiationService).createInstance(TerminalPersistedCommands, shellKey);
		commandHistory.set(shellKey, history);
	}
	return history;
}

abstract class BaseTerminalPersistedHistory<T> extends Disposable implements ITerminalPersistedHistory<T> {
	private _entries: Set<T> = new Set();

	get entries(): IterableIterator<T> {
		this._ensureLoadedState();
		return this._entries.values();
	}

	private _isReady = false;
	private _isDirty = false;
	private _workspaceStorageKey: string;

	constructor(
		private readonly _shell: string,
		private readonly _storageService: IStorageService,
		private readonly _workspaceContextService: IWorkspaceContextService
	) {
		super();
		this._register(this._storageService.onWillSaveState(() => this._saveState()));
		this._workspaceStorageKey = `terminal.history.entry.${this._workspaceContextService.getWorkspace().id}:${this._shell}:${this._getDataKey()}`;
		console.log('created');
		runWhenIdle(() => this._ensureLoadedState());
	}

	protected abstract _getDataKey(): string;
	abstract isEqual(a: T, b: T): boolean;

	add(entry: T) {
		this._ensureLoadedState();
		if (typeof entry === 'object') {
			for (const e of this._entries) {
				if (this.isEqual(e, entry)) {
					return;
				}
			}
		}
		console.log('add', entry);
		this._entries.add(entry);
		this._isDirty = true;
	}

	remove(entry: T) {
		this._ensureLoadedState();
		if (typeof entry === 'object') {
			for (const e of this._entries) {
				if (this.isEqual(e, entry)) {
					this._entries.delete(e);
					return;
				}
			}
		}
		this._entries.delete(entry);
		this._isDirty = true;
	}

	clear() {
		this._entries.clear();
		this._storageService.remove(this._workspaceStorageKey, StorageScope.GLOBAL);
	}

	private _ensureLoadedState() {
		if (this._isReady) {
			return;
		}
		this._loadState();
		this._isReady = true;
	}

	private _loadState() {
		// Load global entries plus
		const text = this._storageService.get(this._workspaceStorageKey, StorageScope.GLOBAL);
		if (text === undefined || text.length === 0) {
			return;
		}
		const list = JSON.parse(text);
		console.log('imported', list);
		if (Array.isArray(list)) {
			for (const entry of list) {
				this._entries.add(entry);
			}
		}
	}

	private _saveState() {
		if (!this._isDirty) {
			return;
		}
		// Store the shell and workspace-specific entry
		const data = JSON.stringify(Array.from(this._entries.values()));
		this._storageService.store(this._workspaceStorageKey, data, StorageScope.GLOBAL, StorageTarget.MACHINE);
		// Store the key in the global list of keys
		const keysJson = this._storageService.get(Constants.HistoryKeysStorageKey, StorageScope.GLOBAL);
		let keys: string[] | undefined;
		try {
			if (keysJson !== undefined) {
				keys = JSON.parse(keysJson);
			}
		} catch {
			// Swallow as keys get set to default after
		}
		if (keys === undefined) {
			keys = [];
		}
		keys.push(this._workspaceStorageKey);
		this._storageService.store(Constants.HistoryKeysStorageKey, data, StorageScope.GLOBAL, StorageTarget.MACHINE);
	}
}

export class TerminalPersistedCommands extends BaseTerminalPersistedHistory<string> {
	constructor(
		shell: string,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService
	) {
		super(shell, storageService, workspaceContextService);
	}

	protected _getDataKey(): string {
		return 'commands';
	}

	isEqual(a: string, b: string): boolean {
		return a === b;
	}
}
