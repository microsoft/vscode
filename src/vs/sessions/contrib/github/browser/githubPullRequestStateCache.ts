/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { getPullRequestKey } from '../common/utils.js';
import { GitHubPullRequestState } from '../common/types.js';

/**
 * The minimal last-seen pull request state needed to render the sessions list
 * PR icon. The icon glyph is fully determined by {@link iconState}, the same
 * value {@link computePullRequestIcon} consumes.
 */
export interface IPullRequestStateSnapshot {
	readonly iconState: GitHubPullRequestState | 'draft';
}

interface IStoredPullRequestStateEntry {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	readonly iconState: GitHubPullRequestState | 'draft';
	/** Epoch ms of the last write; used to evict the oldest entries. */
	readonly lastUpdated: number;
}

const STORAGE_KEY = 'sessions.github.pullRequestState';

/** Cap the number of persisted PR states; oldest entries are evicted first. */
const MAX_ENTRIES = 100;

const SAVE_DEBOUNCE_MS = 500;

/**
 * Caches the last-seen pull request state per `(owner, repo, number)` so the
 * sessions list can render the PR icon for any session — not just the active
 * one — and can show it instantly on reload from global storage.
 *
 * The cache is the source of truth the providers read for the icon; it is
 * written to whenever a session's PR is fetched or polled (see
 * {@link IGitHubService.fetchPullRequestState} / `pollPullRequestState`). State
 * is retained when a session becomes inactive/invisible (we simply stop
 * polling), so the icon keeps rendering from the last-seen value.
 */
export class GitHubPullRequestStateCache extends Disposable {

	/** Live snapshot observables, created lazily per key. */
	private readonly _observables = new Map<string, ISettableObservable<IPullRequestStateSnapshot | undefined>>();

	/** Persisted source of truth, mirrored to {@link _observables}. */
	private readonly _entries = new Map<string, IStoredPullRequestStateEntry>();

	private readonly _saveScheduler = this._register(new RunOnceScheduler(() => this._save(), SAVE_DEBOUNCE_MS));

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._load();

		// Flush any pending debounced write before the window goes away so the
		// icons are available on the next reload.
		this._register(this._storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN && this._saveScheduler.isScheduled()) {
				this._saveScheduler.cancel();
				this._save();
			}
		}));
	}

	/**
	 * Returns a stable observable of the last-seen state for the given pull
	 * request. The observable is created on first access (seeded from persisted
	 * storage) and reused thereafter so consumers stay subscribed across writes.
	 */
	getState(owner: string, repo: string, prNumber: number): IObservable<IPullRequestStateSnapshot | undefined> {
		return this._getOrCreateObservable(getPullRequestKey(owner, repo, prNumber));
	}

	/**
	 * Records the latest state for a pull request and schedules a debounced
	 * persist. Evicts the oldest entries when the cap is exceeded.
	 */
	setState(owner: string, repo: string, prNumber: number, snapshot: IPullRequestStateSnapshot): void {
		const key = getPullRequestKey(owner, repo, prNumber);
		const existing = this._entries.get(key);
		if (existing && existing.iconState === snapshot.iconState) {
			// No glyph change — just bump recency so the entry survives eviction.
			this._entries.set(key, { ...existing, lastUpdated: Date.now() });
			this._scheduleSave();
			return;
		}

		this._entries.set(key, { owner, repo, number: prNumber, iconState: snapshot.iconState, lastUpdated: Date.now() });
		this._getOrCreateObservable(key).set({ iconState: snapshot.iconState }, undefined);
		this._evictIfNeeded();
		this._scheduleSave();
	}

	private _getOrCreateObservable(key: string): ISettableObservable<IPullRequestStateSnapshot | undefined> {
		let observable = this._observables.get(key);
		if (!observable) {
			const entry = this._entries.get(key);
			observable = observableValue<IPullRequestStateSnapshot | undefined>(`githubPullRequestState.${key}`, entry ? { iconState: entry.iconState } : undefined);
			this._observables.set(key, observable);
		}
		return observable;
	}

	private _evictIfNeeded(): void {
		while (this._entries.size > MAX_ENTRIES) {
			let oldestKey: string | undefined;
			let oldestTime = Number.POSITIVE_INFINITY;
			for (const [key, entry] of this._entries) {
				if (entry.lastUpdated < oldestTime) {
					oldestTime = entry.lastUpdated;
					oldestKey = key;
				}
			}
			if (oldestKey === undefined) {
				break;
			}
			this._entries.delete(oldestKey);
			// Drop the icon for the evicted PR so any subscriber stops rendering a
			// stale value; the observable is kept so the subscription stays valid.
			this._observables.get(oldestKey)?.set(undefined, undefined);
		}
	}

	private _scheduleSave(): void {
		if (!this._saveScheduler.isScheduled()) {
			this._saveScheduler.schedule();
		}
	}

	private _load(): void {
		const raw = this._storageService.get(STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return;
		}
		if (!Array.isArray(parsed)) {
			return;
		}
		for (const candidate of parsed) {
			const entry = this._coerceEntry(candidate);
			if (entry) {
				this._entries.set(getPullRequestKey(entry.owner, entry.repo, entry.number), entry);
			}
		}
		this._evictIfNeeded();
	}

	private _coerceEntry(candidate: unknown): IStoredPullRequestStateEntry | undefined {
		if (!candidate || typeof candidate !== 'object') {
			return undefined;
		}
		const { owner, repo, number, iconState, lastUpdated } = candidate as Record<string, unknown>;
		if (typeof owner !== 'string' || typeof repo !== 'string' || typeof number !== 'number') {
			return undefined;
		}
		if (iconState !== GitHubPullRequestState.Open && iconState !== GitHubPullRequestState.Closed && iconState !== GitHubPullRequestState.Merged && iconState !== 'draft') {
			return undefined;
		}
		return { owner, repo, number, iconState, lastUpdated: typeof lastUpdated === 'number' ? lastUpdated : 0 };
	}

	private _save(): void {
		if (this._entries.size === 0) {
			this._storageService.remove(STORAGE_KEY, StorageScope.APPLICATION);
			return;
		}
		const entries = [...this._entries.values()];
		this._storageService.store(STORAGE_KEY, JSON.stringify(entries), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}
