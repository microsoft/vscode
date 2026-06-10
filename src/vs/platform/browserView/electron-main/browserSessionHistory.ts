/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { StorageScope, StorageTarget } from '../../storage/common/storage.js';
import {
	BrowserHistoryStore,
	IBrowserHistoryItemHandle,
	ISerializedBrowserFaviconsSnapshot,
	ISerializedBrowserHistoryEntriesSnapshot,
} from '../common/browserHistory.js';
import { BrowserViewStorageScope, IBrowserViewStorageKeys } from '../common/browserView.js';
import type { BrowserSession } from './browserSession.js';

const FLUSH_INTERVAL_MS = 2000;

export interface IBrowserSessionHistory {
	readonly storageKeys: IBrowserViewStorageKeys;
	add(url: string, title: string, favicon?: string, userInitiated?: boolean): IBrowserHistoryItemHandle;
	/**
	 * Delete history entries. Pass `undefined` to wipe everything (entries
	 * and favicons); otherwise only the listed entry ids are removed.
	 */
	delete(entryIds?: readonly number[]): void;
	/** Update the maximum number of entries retained. Excess oldest entries are evicted immediately. */
	setMaxEntries(max: number): void;
}

/**
 * Per-{@link BrowserSession} navigation history. The two sub-stores get
 * independent throttled writers so the (large) favicon map is only
 * rewritten when an image is added or removed.
 *
 * Throttling: the first change schedules a flush {@link FLUSH_INTERVAL_MS}ms
 * later; subsequent changes within that window are picked up by the pending
 * flush (since it reads current state at flush time).
 */
export class BrowserSessionHistory extends Disposable implements IBrowserSessionHistory {

	private readonly _historyStore = this._register(new BrowserHistoryStore());

	private _storage: IApplicationStorageMainService | undefined;
	private _persistable = false;

	private readonly _entriesFlush = this._register(new RunOnceScheduler(() => this._flushEntries(), FLUSH_INTERVAL_MS));
	private readonly _faviconsFlush = this._register(new RunOnceScheduler(() => this._flushFavicons(), FLUSH_INTERVAL_MS));

	readonly storageKeys: IBrowserViewStorageKeys;

	constructor(session: BrowserSession) {
		super();

		this.storageKeys = session.storageScope === BrowserViewStorageScope.Ephemeral
			? {}
			: {
				history: `browser.history.entries.${session.id}`,
				favicons: `browser.history.favicons.${session.id}`,
			};

		this._register(this._historyStore.entries.onDidChange(() => {
			if (this._persistable && !this._entriesFlush.isScheduled()) {
				this._entriesFlush.schedule();
			}
		}));
		this._register(this._historyStore.favicons.onDidChange(() => {
			if (this._persistable && !this._faviconsFlush.isScheduled()) {
				this._faviconsFlush.schedule();
			}
		}));
	}

	connectStorage(storage: IApplicationStorageMainService): void {
		if (this._storage || !this.storageKeys.history) {
			return;
		}
		this._storage = storage;
		this._load();
		this._persistable = true;
	}

	add(url: string, title: string, favicon?: string, userInitiated?: boolean): IBrowserHistoryItemHandle {
		return this._historyStore.add(url, title, favicon, userInitiated);
	}

	delete(entryIds?: readonly number[]): void {
		if (entryIds === undefined) {
			this._historyStore.clear();
		} else {
			for (const id of entryIds) {
				this._historyStore.entries.delete(id);
			}
		}
		this.flushNow();
	}

	setMaxEntries(max: number): void {
		this._historyStore.setMaxEntries(max);
	}

	flushNow(): void {
		if (this._entriesFlush.isScheduled()) {
			this._entriesFlush.cancel();
			this._flushEntries();
		}
		if (this._faviconsFlush.isScheduled()) {
			this._faviconsFlush.cancel();
			this._flushFavicons();
		}
	}

	private _load(): void {
		const storage = this._storage;
		const { history: historyKey, favicons: faviconsKey } = this.storageKeys;
		if (!storage || !historyKey || !faviconsKey) {
			return;
		}

		const entries = parseSnapshot<ISerializedBrowserHistoryEntriesSnapshot>(storage.get(historyKey, StorageScope.APPLICATION));
		const favicons = parseSnapshot<ISerializedBrowserFaviconsSnapshot>(storage.get(faviconsKey, StorageScope.APPLICATION));

		// Hydration fires onDidChange; suppress flushes so we don't rewrite what we just read.
		this._persistable = false;
		try {
			this._historyStore.entries.hydrate(entries);
			this._historyStore.favicons.hydrate(favicons);
		} finally {
			this._persistable = true;
		}
	}

	private _flushEntries(): void {
		const storage = this._storage;
		const key = this.storageKeys.history;
		if (!storage || !key) {
			return;
		}
		const snapshot = this._historyStore.entries.serialize();
		writeSnapshot(storage, key, snapshot, snapshot.items.length === 0);
	}

	private _flushFavicons(): void {
		const storage = this._storage;
		const key = this.storageKeys.favicons;
		if (!storage || !key) {
			return;
		}
		const snapshot = this._historyStore.favicons.serialize();
		writeSnapshot(storage, key, snapshot, Object.keys(snapshot.map).length === 0);
	}
}

function writeSnapshot(storage: IApplicationStorageMainService, key: string, snapshot: unknown, isEmpty: boolean): void {
	if (isEmpty) {
		storage.remove(key, StorageScope.APPLICATION);
	} else {
		storage.store(key, JSON.stringify(snapshot), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

function parseSnapshot<T>(raw: string | undefined): T | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(raw) as T;
		if (!parsed || typeof parsed !== 'object') {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}
