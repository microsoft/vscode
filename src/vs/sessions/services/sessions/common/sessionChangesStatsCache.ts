/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IReader, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISession } from './session.js';

/** The aggregate diff counts the changes pill reports for a session. */
export interface ISessionChangesStats {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

/**
 * The session's aggregate changes as the changes pill reports them, or `undefined`
 * while the session has not reported any changes data yet.
 *
 * The provider-supplied {@link ISession.changesSummary} is the authoritative
 * aggregate; without it the changes of the default changeset (or the session's
 * top-level changes when no changeset is default) are aggregated. A session with
 * neither a summary nor any changeset has not reported yet — an empty changeset
 * list, in contrast, is a reported "no changes".
 */
export function readSessionChangesStats(session: ISession, reader: IReader | undefined): ISessionChangesStats | undefined {
	const summary = session.changesSummary?.read(reader);
	if (summary) {
		return { files: summary.files, insertions: summary.additions, deletions: summary.deletions };
	}

	const changesets = session.changesets.read(reader);
	const defaultChangeset = changesets?.find(changeset => changeset.isDefault.read(reader));
	const changes = defaultChangeset?.changes.read(reader) ?? session.changes.read(reader);
	if (changesets === undefined && changes.length === 0) {
		return undefined;
	}

	let insertions = 0, deletions = 0;
	for (const change of changes) {
		insertions += change.insertions;
		deletions += change.deletions;
	}
	return { files: changes.length, insertions, deletions };
}

function sessionChangesStatsEqual(a: ISessionChangesStats | undefined, b: ISessionChangesStats | undefined): boolean {
	if (!a || !b) {
		return a === b;
	}
	return a.files === b.files && a.insertions === b.insertions && a.deletions === b.deletions;
}

export const ISessionChangesStatsCache = createDecorator<ISessionChangesStatsCache>('sessionChangesStatsCache');

/**
 * Remembers the changes pill last shown for a session so it can be rendered
 * optimistically the next time that session is opened, instead of only appearing
 * once the provider has reported its (often late) changes data.
 *
 * The cache is bounded and persisted in global storage, so it survives restarts
 * and is shared by every window.
 */
export interface ISessionChangesStatsCache {
	readonly _serviceBrand: undefined;

	/** The stats last recorded for `sessionId`, if still cached. */
	get(sessionId: string, reader: IReader | undefined): ISessionChangesStats | undefined;

	/**
	 * Records the stats currently shown for `sessionId`, making it the most
	 * recent entry. Stats without files drop the entry, so a session whose
	 * changes went away does not keep an optimistic pill.
	 */
	set(sessionId: string, stats: ISessionChangesStats): void;
}

/** How many sessions are remembered; the oldest entry is evicted beyond this. */
export const MAX_CACHED_SESSION_CHANGES_STATS = 30;

const STORAGE_KEY = 'sessions.changesStatsCache';

interface IStoredEntry {
	readonly sessionId: string;
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

/** Exported for direct instantiation in tests; consumers should depend on {@link ISessionChangesStatsCache}. */
export class SessionChangesStatsCache extends Disposable implements ISessionChangesStatsCache {

	declare readonly _serviceBrand: undefined;

	/** Insertion ordered, oldest entry first. */
	private readonly _entries: ISettableObservable<ReadonlyMap<string, ISessionChangesStats>>;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._entries = observableValue<ReadonlyMap<string, ISessionChangesStats>>(this, this._load());

		// Every window shares the cache, so pick up what another window recorded.
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, STORAGE_KEY, this._store)(e => {
			if (e.external) {
				this._entries.set(this._load(), undefined);
			}
		}));
	}

	get(sessionId: string, reader: IReader | undefined): ISessionChangesStats | undefined {
		return this._entries.read(reader).get(sessionId);
	}

	set(sessionId: string, stats: ISessionChangesStats): void {
		const current = this._entries.get();
		const existing = current.get(sessionId);
		if (stats.files === 0 && existing === undefined) {
			return;
		}
		const isNewest = sessionId === Array.from(current.keys()).at(-1);
		if (isNewest && sessionChangesStatsEqual(existing, stats)) {
			return;
		}

		// Re-inserting moves the session to the end, so eviction always drops the
		// session whose pill was recorded longest ago.
		const updated = new Map(current);
		updated.delete(sessionId);
		if (stats.files > 0) {
			updated.set(sessionId, stats);
		}

		while (updated.size > MAX_CACHED_SESSION_CHANGES_STATS) {
			const oldest = updated.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			updated.delete(oldest);
		}

		this._entries.set(updated, undefined);
		this._save(updated);
	}

	private _load(): ReadonlyMap<string, ISessionChangesStats> {
		const entries = new Map<string, ISessionChangesStats>();
		const raw = this._storageService.get(STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return entries;
		}

		try {
			const stored: readonly IStoredEntry[] = JSON.parse(raw);
			if (!Array.isArray(stored)) {
				return entries;
			}
			for (const entry of stored.slice(-MAX_CACHED_SESSION_CHANGES_STATS)) {
				if (typeof entry?.sessionId === 'string' && typeof entry.files === 'number' && typeof entry.insertions === 'number' && typeof entry.deletions === 'number') {
					entries.set(entry.sessionId, { files: entry.files, insertions: entry.insertions, deletions: entry.deletions });
				}
			}
		} catch {
			// Corrupt state starts over rather than breaking the pill.
			return new Map();
		}
		return entries;
	}

	private _save(entries: ReadonlyMap<string, ISessionChangesStats>): void {
		if (entries.size === 0) {
			this._storageService.remove(STORAGE_KEY, StorageScope.APPLICATION);
			return;
		}

		const stored = [...entries].map(([sessionId, stats]) => ({ sessionId, ...stats } satisfies IStoredEntry));
		this._storageService.store(STORAGE_KEY, JSON.stringify(stored), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

registerSingleton(ISessionChangesStatsCache, SessionChangesStatsCache, InstantiationType.Delayed);
