/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../base/common/themables.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const IPullRequestIconCache = createDecorator<IPullRequestIconCache>('pullRequestIconCache');

/**
 * A small, bounded, persistent cache of the last-known pull-request status icon,
 * keyed by the pull request's link (its `https://github.com/<owner>/<repo>/pull/<n>`
 * URL).
 *
 * Sessions compute their PR icon from a live, asynchronously-fetched pull-request
 * model, so on startup the icon is missing until the first fetch completes. This
 * cache lets a session render its last-known icon instantly and then refine it once
 * the live model resolves.
 *
 * Only the {@link MAX_CACHED_ICONS} most recently updated entries are retained so
 * the backing storage cannot grow without bound.
 */
export interface IPullRequestIconCache {
	readonly _serviceBrand: undefined;

	/** The last icon stored for `prLink`, or `undefined` if none is cached. */
	get(prLink: string): ThemeIcon | undefined;

	/**
	 * Remember `icon` as the last-known icon for `prLink`, making it the most
	 * recently updated entry. A no-op when the icon is unchanged. Evicts the
	 * least-recently-updated entries beyond the cap and persists the result.
	 */
	set(prLink: string, icon: ThemeIcon): void;
}

/** Retain only the most recently updated pull-request icons. */
const MAX_CACHED_ICONS = 50;

const STORAGE_KEY = 'sessions.github.pullRequestIconCache';

interface IStoredEntry {
	readonly link: string;
	readonly icon: ThemeIcon;
}

export class PullRequestIconCache implements IPullRequestIconCache {

	declare readonly _serviceBrand: undefined;

	/**
	 * Cached icons keyed by PR link. A `Map` preserves insertion order, which we
	 * treat as recency: the most recently updated entry is last, so eviction
	 * removes the first (oldest) key.
	 */
	private readonly _icons = new Map<string, ThemeIcon>();

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		this._load();
	}

	get(prLink: string): ThemeIcon | undefined {
		return this._icons.get(prLink);
	}

	set(prLink: string, icon: ThemeIcon): void {
		const existing = this._icons.get(prLink);
		if (existing && ThemeIcon.isEqual(existing, icon)) {
			// Icon unchanged: keep its current recency and avoid a redundant write.
			return;
		}

		// Re-insert so the entry becomes the most recently updated.
		this._icons.delete(prLink);
		this._icons.set(prLink, icon);

		// Drop the least recently updated entries beyond the cap.
		while (this._icons.size > MAX_CACHED_ICONS) {
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
			if (entry && typeof entry.link === 'string' && ThemeIcon.isThemeIcon(entry.icon)) {
				this._icons.set(entry.link, entry.icon);
			}
		}
	}

	private _save(): void {
		const entries: IStoredEntry[] = [];
		for (const [link, icon] of this._icons) {
			entries.push({ link, icon });
		}
		this._storageService.store(STORAGE_KEY, JSON.stringify(entries), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}
