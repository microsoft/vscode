/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/** A single recently-opened entry: a chat within a session, or a session when no specific chat applies. */
export interface IRecencyEntry {
	readonly sessionResource: URI;
	readonly chatResource: URI | undefined;
}

interface ISerializedRecencyEntry {
	readonly session: string;
	readonly chat?: string;
}

/** Identity of an entry, used for de-duplication: a (session, chat) pair. */
function entryKey(sessionResource: URI, chatResource: URI | undefined): string {
	return `${sessionResource.toString()}::${chatResource?.toString() ?? ''}`;
}

/**
 * The single source of truth for "recently opened" ordering across the sessions
 * UI. Maintains an MRU-ordered list of `(session, chat)` entries (index 0 is the
 * most recently opened), deduplicated by the `(session, chat)` pair and capped at
 * {@link MAX_RECENCY_ENTRIES}. The list is persisted so recency survives reloads.
 *
 * Both the sessions picker (via
 * {@link ISessionsManagementService.getRecentlyOpenedSessions}) and the
 * Back/Forward navigation ({@link SessionsNavigation}) build on top of this.
 */
export class SessionsRecencyHistory extends Disposable {

	private static readonly STORAGE_KEY = 'agentSessions.recencyHistory';
	private static readonly MAX_RECENCY_ENTRIES = 50;

	private _entries: IRecencyEntry[] = [];

	private readonly _version = observableValue<number>(this, 0);

	/** Bumped whenever {@link entries} changes, so observers can react. */
	get version(): IObservable<number> {
		return this._version;
	}

	/** The recency entries in MRU order (index 0 is the most recently opened). */
	get entries(): readonly IRecencyEntry[] {
		return this._entries;
	}

	constructor(
		private readonly _storageService: IStorageService,
		private readonly _logService: ILogService,
	) {
		super();

		this._entries = this._load();
	}

	/**
	 * Record that the given session (optionally a specific chat within it) was
	 * explicitly opened, promoting it to the front of the MRU list.
	 */
	markOpened(sessionResource: URI, chatResource: URI | undefined): void {
		const key = entryKey(sessionResource, chatResource);
		const existingIndex = this._entries.findIndex(e => entryKey(e.sessionResource, e.chatResource) === key);
		if (existingIndex === 0) {
			// Already at the front: nothing to do.
			return;
		}

		if (existingIndex > 0) {
			this._entries.splice(existingIndex, 1);
		}

		this._entries.unshift({ sessionResource, chatResource });

		if (this._entries.length > SessionsRecencyHistory.MAX_RECENCY_ENTRIES) {
			this._entries.length = SessionsRecencyHistory.MAX_RECENCY_ENTRIES;
		}

		this._save();
		this._bumpVersion();
	}

	/** Remove every entry matching the given predicate. */
	remove(predicate: (entry: IRecencyEntry) => boolean): void {
		const next = this._entries.filter(e => !predicate(e));
		if (next.length === this._entries.length) {
			return;
		}
		this._entries = next;
		this._save();
		this._bumpVersion();
	}

	private _bumpVersion(): void {
		this._version.set(this._version.get() + 1, undefined);
	}

	private _load(): IRecencyEntry[] {
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
					sessionResource: URI.parse(e.session),
					chatResource: e.chat ? URI.parse(e.chat) : undefined,
				}));
		} catch (error) {
			this._logService.warn('[SessionsRecencyHistory] failed to parse persisted recency history', error);
			return [];
		}
	}

	private _save(): void {
		if (this._entries.length === 0) {
			this._storageService.remove(SessionsRecencyHistory.STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}
		const serialized: ISerializedRecencyEntry[] = this._entries.map(e => ({
			session: e.sessionResource.toString(),
			chat: e.chatResource?.toString(),
		}));
		this._storageService.store(SessionsRecencyHistory.STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
