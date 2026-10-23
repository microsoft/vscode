/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getPullRequestUrlKey } from '../../../../platform/github/common/githubUrls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { computePullRequestIcon, getPullRequestDisplayState, GitHubPullRequestState, IGitHubPullRequest } from '../common/types.js';

export const IPullRequestIconCache = createDecorator<IPullRequestIconCache>('pullRequestIconCache');

export interface ICachedPullRequestState {
	readonly state: GitHubPullRequestState;
	readonly isDraft: boolean;
	readonly lastChecked: number;
}

export interface ICachedPullRequestEntry {
	readonly icon?: ThemeIcon;
	readonly pullRequest?: ICachedPullRequestState;
}

/** Bounded, persistent last-known PR state and icons, keyed by normalized PR URL. */
export interface IPullRequestIconCache {
	readonly _serviceBrand: undefined;

	/** The last icon stored for `prLink`, or `undefined` if none is cached. */
	get(prLink: string): ThemeIcon | undefined;

	getEntry(prLink: string): ICachedPullRequestEntry | undefined;

	getState(prLink: string): ICachedPullRequestState | undefined;

	setState(prLink: string, pullRequest: Pick<IGitHubPullRequest, 'state' | 'isDraft'>): void;

	/** Remembers an icon without allowing an observed merge to regress. */
	set(prLink: string, icon: ThemeIcon): void;
}

/** Retain only the most recently updated pull-request cache entries. */
const MAX_CACHED_ENTRIES = 1000;

const STORAGE_KEY = 'sessions.github.pullRequestIconCache';

interface IStoredEntry extends ICachedPullRequestEntry {
	readonly link: string;
}

export class PullRequestIconCache implements IPullRequestIconCache {

	declare readonly _serviceBrand: undefined;

	private readonly _icons = new Map<string, IStoredEntry>();

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		this._load();
	}

	get(prLink: string): ThemeIcon | undefined {
		return this._icons.get(getPullRequestUrlKey(prLink))?.icon;
	}

	getEntry(prLink: string): ICachedPullRequestEntry | undefined {
		const entry = this._icons.get(getPullRequestUrlKey(prLink));
		if (!entry || entry.pullRequest || entry.icon?.id !== Codicon.gitPullRequestDone.id) {
			return entry;
		}
		return { ...entry, pullRequest: { state: GitHubPullRequestState.Merged, isDraft: false, lastChecked: 0 } };
	}

	getState(prLink: string): ICachedPullRequestState | undefined {
		return this.getEntry(prLink)?.pullRequest;
	}

	setState(prLink: string, pullRequest: Pick<IGitHubPullRequest, 'state' | 'isDraft'>): void {
		const key = getPullRequestUrlKey(prLink);
		const existing = this._icons.get(key);
		if (this.getState(key)?.state === GitHubPullRequestState.Merged && pullRequest.state !== GitHubPullRequestState.Merged) {
			return;
		}
		this._store({
			...existing,
			link: key,
			icon: existing?.pullRequest?.state === pullRequest.state && existing.pullRequest.isDraft === pullRequest.isDraft
				? existing.icon : computePullRequestIcon(getPullRequestDisplayState(pullRequest.state, pullRequest.isDraft)),
			pullRequest: { state: pullRequest.state, isDraft: pullRequest.isDraft, lastChecked: Date.now() },
		});
	}

	set(prLink: string, icon: ThemeIcon): void {
		const key = getPullRequestUrlKey(prLink);
		const existing = this._icons.get(key);
		if (this.getState(key)?.state === GitHubPullRequestState.Merged && icon.id !== Codicon.gitPullRequestDone.id) {
			return;
		}
		if (existing?.icon && ThemeIcon.isEqual(existing.icon, icon)) {
			// Icon unchanged: keep its current recency and avoid a redundant write.
			return;
		}

		this._store({ ...existing, link: key, icon });
	}

	private _store(entry: IStoredEntry): void {
		this._icons.delete(entry.link);
		this._icons.set(entry.link, entry);
		// Drop the least recently updated entries beyond the cap.
		while (this._icons.size > MAX_CACHED_ENTRIES) {
			const oldest = this._icons.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this._icons.delete(oldest);
		}

		this._save();
	}

	private _load(): void {
		const raw = this._storageService.get(STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return;
		}

		let entries: readonly IStoredEntry[];
		try {
			entries = JSON.parse(raw);
		} catch {
			// Corrupt cache: ignore and start fresh.
			return;
		}

		if (!Array.isArray(entries)) {
			return;
		}

		for (const entry of entries) {
			if (entry && typeof entry.link === 'string') {
				const icon = ThemeIcon.isThemeIcon(entry.icon) ? entry.icon : undefined;
				const candidate = entry.pullRequest;
				const pullRequest = candidate
					&& (candidate.state === GitHubPullRequestState.Open || candidate.state === GitHubPullRequestState.Closed || candidate.state === GitHubPullRequestState.Merged)
					&& typeof candidate.isDraft === 'boolean'
					&& typeof candidate.lastChecked === 'number' && Number.isFinite(candidate.lastChecked) && candidate.lastChecked >= 0
					? { state: candidate.state, isDraft: candidate.isDraft, lastChecked: candidate.lastChecked } : undefined;
				if (icon || pullRequest) {
					const link = getPullRequestUrlKey(entry.link);
					this._icons.delete(link);
					this._icons.set(link, { link, icon, pullRequest });
				}
			}
		}
		while (this._icons.size > MAX_CACHED_ENTRIES) {
			const oldest = this._icons.keys().next().value;
			if (oldest !== undefined) {
				this._icons.delete(oldest);
			}
		}
	}

	private _save(): void {
		const entries: IStoredEntry[] = [];
		for (const entry of this._icons.values()) {
			entries.push(entry);
		}
		this._storageService.store(STORAGE_KEY, JSON.stringify(entries), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}
