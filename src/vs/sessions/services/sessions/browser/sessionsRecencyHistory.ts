/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ITransaction, observableValue } from '../../../../base/common/observable.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export type SessionRecencyEntry = {
	readonly kind: 'session';
	readonly sessionResource: URI;
	readonly chatResource: URI | undefined;
} | {
	readonly kind: 'newSession';
} | {
	readonly kind: 'customView';
	readonly id: string;
};

interface ISerializedRecencyEntry {
	readonly session: string;
	readonly chat?: string;
}

export function getRecencyEntryKey(entry: SessionRecencyEntry): string {
	switch (entry.kind) {
		case 'session':
			return JSON.stringify([entry.kind, getComparisonKey(entry.sessionResource), entry.chatResource && getComparisonKey(entry.chatResource)]);
		case 'newSession':
			return entry.kind;
		case 'customView':
			return `${entry.kind}:${entry.id}`;
	}
}

/**
 * Shared MRU ordering for session navigation and the recent-sessions picker.
 * Session/chat entries persist across reloads; singleton view entries are window-local.
 */
export class SessionsRecencyHistory extends Disposable {

	private static readonly STORAGE_KEY = 'agentSessions.recencyHistory';
	private static readonly MAX_SESSION_ENTRIES = 50;

	private _entries: SessionRecencyEntry[] = [];

	private readonly _version = observableValue<number>(this, 0);

	/** Bumped whenever {@link entries} changes, so observers can react. */
	get version(): IObservable<number> {
		return this._version;
	}

	/** The recency entries in MRU order (index 0 is the most recently opened). */
	get entries(): readonly SessionRecencyEntry[] {
		return this._entries;
	}

	constructor(
		private readonly _storageService: IStorageService,
		private readonly _logService: ILogService,
	) {
		super();

		this._entries = this._load();
	}

	/** Promote the opened destination to the front, keeping only its most recent occurrence. */
	markOpened(entry: SessionRecencyEntry, tx?: ITransaction): void {
		const key = getRecencyEntryKey(entry);
		const existingIndex = this._entries.findIndex(e => getRecencyEntryKey(e) === key);
		if (existingIndex === 0) {
			// Already at the front: nothing to do.
			return;
		}

		if (existingIndex > 0) {
			this._entries.splice(existingIndex, 1);
		}

		this._entries.unshift(entry);

		let sessionEntries = 0;
		this._entries = this._entries.filter(candidate => candidate.kind !== 'session' || ++sessionEntries <= SessionsRecencyHistory.MAX_SESSION_ENTRIES);

		this._save();
		this._bumpVersion(tx);
	}

	/** Remove every entry matching the given predicate. */
	remove(predicate: (entry: SessionRecencyEntry) => boolean): void {
		const next = this._entries.filter(e => !predicate(e));
		if (next.length === this._entries.length) {
			return;
		}
		this._entries = next;
		this._save();
		this._bumpVersion();
	}

	private _bumpVersion(tx?: ITransaction): void {
		this._version.set(this._version.get() + 1, tx);
	}

	private _load(): SessionRecencyEntry[] {
		const raw = this._storageService.get(SessionsRecencyHistory.STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return [];
		}
		try {
			const parsed = JSON.parse(raw) as ISerializedRecencyEntry[];
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed
				.filter(e => e && typeof e.session === 'string')
				.map(e => ({
					kind: 'session',
					sessionResource: URI.parse(e.session),
					chatResource: e.chat ? URI.parse(e.chat) : undefined,
				}));
		} catch (error) {
			this._logService.warn('[SessionsRecencyHistory] failed to parse persisted recency history', error);
			return [];
		}
	}

	private _save(): void {
		const serialized: ISerializedRecencyEntry[] = this._entries
			.filter(e => e.kind === 'session')
			.map(e => ({
				session: e.sessionResource.toString(),
				chat: e.chatResource?.toString(),
			}));
		if (serialized.length === 0) {
			this._storageService.remove(SessionsRecencyHistory.STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}
		this._storageService.store(SessionsRecencyHistory.STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
