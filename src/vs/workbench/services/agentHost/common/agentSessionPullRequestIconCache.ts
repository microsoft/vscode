/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const IAgentSessionPullRequestIconCache = createDecorator<IAgentSessionPullRequestIconCache>('agentSessionPullRequestIconCache');

export interface IAgentSessionPullRequestIconCache {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	get(pullRequestUrl: string): ThemeIcon | undefined;
	set(pullRequestUrl: string, icon: ThemeIcon): void;
}

const MAX_CACHED_ICONS = 50;
const STORAGE_KEY = 'sessions.github.pullRequestIconCache';

interface IStoredEntry {
	readonly link: string;
	readonly icon: ThemeIcon;
}

export class AgentSessionPullRequestIconCache extends Disposable implements IAgentSessionPullRequestIconCache {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _icons = new Map<string, ThemeIcon>();

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._load();
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, STORAGE_KEY, this._store)(() => {
			if (this._load()) {
				this._onDidChange.fire();
			}
		}));
	}

	get(pullRequestUrl: string): ThemeIcon | undefined {
		return this._icons.get(pullRequestUrl);
	}

	set(pullRequestUrl: string, icon: ThemeIcon): void {
		const existing = this._icons.get(pullRequestUrl);
		if (existing && ThemeIcon.isEqual(existing, icon)) {
			return;
		}

		this._icons.delete(pullRequestUrl);
		this._icons.set(pullRequestUrl, icon);
		while (this._icons.size > MAX_CACHED_ICONS) {
			const oldest = this._icons.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this._icons.delete(oldest);
		}

		this._save();
		this._onDidChange.fire();
	}

	private _load(): boolean {
		const next = new Map<string, ThemeIcon>();
		const raw = this._storageService.get(STORAGE_KEY, StorageScope.APPLICATION);
		if (raw) {
			try {
				const entries: readonly IStoredEntry[] = JSON.parse(raw);
				if (Array.isArray(entries)) {
					for (const entry of entries) {
						if (entry && typeof entry.link === 'string' && ThemeIcon.isThemeIcon(entry.icon)) {
							next.set(entry.link, entry.icon);
						}
					}
				}
			} catch {
				// Ignore corrupt cache data.
			}
		}

		const changed = next.size !== this._icons.size || [...next].some(([link, icon]) => {
			const existing = this._icons.get(link);
			return !existing || !ThemeIcon.isEqual(existing, icon);
		});
		if (changed) {
			this._icons.clear();
			for (const [link, icon] of next) {
				this._icons.set(link, icon);
			}
		}
		return changed;
	}

	private _save(): void {
		const entries = [...this._icons].map(([link, icon]) => ({ link, icon }));
		this._storageService.store(STORAGE_KEY, JSON.stringify(entries), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

registerSingleton(IAgentSessionPullRequestIconCache, AgentSessionPullRequestIconCache, InstantiationType.Delayed);
