/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWhenIdle } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
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

// TODO: Store per shell

// Frontend vs backend?

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
		this._workspaceStorageKey = `${this._workspaceContextService.getWorkspace().id}:${this._shell}:${this._getDataKey()}`;
		console.log('created');
		runWhenIdle(() => this._ensureLoadedState());
	}

	protected abstract _getDataKey(): string;
	abstract isEqual(a: T, b: T): boolean;

	add(entry: T): void {
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

	remove(entry: T): void {
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
		console.log('save state');
		if (!this._isDirty) {
			return;
		}
		const data = JSON.stringify(Array.from(this._entries.values()));
		this._storageService.store(this._workspaceStorageKey, data, StorageScope.GLOBAL, StorageTarget.MACHINE);
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
