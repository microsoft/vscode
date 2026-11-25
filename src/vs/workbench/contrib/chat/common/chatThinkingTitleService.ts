/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { StringSHA1 } from '../../../../base/common/hash.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatUtilityModelService } from './chatUtilityModelService.js';
import { ChatConfiguration } from './constants.js';
import { ChatMessageRole, ILanguageModelsService } from './languageModels.js';
import { chatSessionResourceToId } from './model/chatUri.js';

export const IChatThinkingTitleService = createDecorator<IChatThinkingTitleService>('chatThinkingTitleService');

export interface IChatThinkingTitleRequest {
	readonly sessionResource: URI;
	readonly content: string;
	readonly legacyId?: string;
	readonly isValidTitle?: (title: string) => boolean;
}

export interface IChatThinkingTitleService {
	readonly _serviceBrand: undefined;
	getCachedTitle(request: IChatThinkingTitleRequest): string | undefined;
	generateTitle(request: IChatThinkingTitleRequest, isRelevant: () => boolean, token: CancellationToken): Promise<string | undefined>;
}

interface IThinkingTitleCacheEntry {
	readonly title: string;
	readonly storedAt: number;
}

const cacheStorageKey = 'chat.thinkingTitleCache';
const cacheTtlMs = 7 * 24 * 60 * 60 * 1000;
const cacheMaxEntries = 1000;

/** Shares thinking-title requests and lazily merges profile storage changes with pending local titles. */
export class ChatThinkingTitleService extends Disposable implements IChatThinkingTitleService {
	declare readonly _serviceBrand: undefined;
	private cache: Map<string, IThinkingTitleCacheEntry> | undefined;
	private readonly pendingEntries = new Map<string, IThinkingTitleCacheEntry>();
	private readonly saveScheduler = this._register(new RunOnceScheduler(() => this.save(), 1000));

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatUtilityModelService private readonly utilityModelService: IChatUtilityModelService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(storageService.onWillSaveState(() => this.save()));
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, cacheStorageKey, this._store)(event => {
			if (event.external) {
				this.cache = undefined;
			}
		}));
	}

	getCachedTitle(request: IChatThinkingTitleRequest): string | undefined {
		const cache = this.load();
		const cached = cache.get(this.getCacheKey(request)) ?? (request.legacyId ? cache.get(`${chatSessionResourceToId(request.sessionResource)}:${request.legacyId}`) : undefined);
		return cached && Date.now() - cached.storedAt <= cacheTtlMs && (!request.isValidTitle || request.isValidTitle(cached.title)) ? cached.title : undefined;
	}

	async generateTitle(request: IChatThinkingTitleRequest, isRelevant: () => boolean, token: CancellationToken): Promise<string | undefined> {
		if (token.isCancellationRequested || !isRelevant() || this._store.isDisposed) {
			return undefined;
		}
		const content = request.content.slice(0, 2000);
		if (!content.trim()) {
			return undefined;
		}
		const key = this.getCacheKey(request);
		const cached = this.getCachedTitle(request);
		if (cached) {
			return cached;
		}
		if (this.configurationService.getValue<boolean>(ChatConfiguration.ThinkingGenerateTitles) === false) {
			return undefined;
		}

		try {
			const models = await this.languageModelsService.selectLanguageModels({ vendor: 'copilot', id: 'copilot-utility-small' });
			if (!models.length || token.isCancellationRequested || !isRelevant()) {
				return undefined;
			}
			const title = (await this.utilityModelService.sendRequest({
				purpose: 'thinkingTitle',
				model: models[0],
				background: true,
				key,
				isRelevant,
				messages: [{
					role: ChatMessageRole.User, content: [{
						type: 'text', value: `Summarize the following reasoning and activity in a single sentence under 10 words.
Start with a past-tense verb, such as "Reviewed", "Planned", "Analyzed", or "Updated".
Describe what was considered or done, not that thinking occurred. Omit tool names, quotes and trailing punctuation.
Only mention blocked or failed actions if the content explicitly says so.

Content: ${content}`
					}]
				}],
			}, token))?.trim();
			if (title && !this._store.isDisposed && !title.toLowerCase().includes('can\'t assist with that')) {
				const cache = this.load();
				const entry = { title, storedAt: Date.now() };
				cache.delete(key);
				cache.set(key, entry);
				this.pendingEntries.set(key, entry);
				if (!this.saveScheduler.isScheduled()) {
					this.saveScheduler.schedule();
				}
				return title;
			}
		} catch (error) {
			if (!token.isCancellationRequested && !isCancellationError(error)) {
				this.logService.warn('[ChatThinkingTitle] Failed to generate a visible thinking title', error);
			}
		}
		return undefined;
	}

	private getCacheKey(request: IChatThinkingTitleRequest): string {
		const hash = new StringSHA1();
		hash.update(request.content.slice(0, 2000));
		return `${chatSessionResourceToId(request.sessionResource)}:thinking:${hash.digest()}`;
	}

	private load(): Map<string, IThinkingTitleCacheEntry> {
		if (!this.cache) {
			this.cache = new Map();
			const now = Date.now();
			const stored = this.storageService.getObject<Record<string, { title?: unknown; storedAt?: unknown }>>(cacheStorageKey, StorageScope.PROFILE, {});
			if (!isObject(stored)) {
				this.logService.warn('[ChatThinkingTitle] Ignoring an invalid persisted title cache');
			} else {
				for (const [key, value] of Object.entries(stored)) {
					if (!isObject(value) || typeof value.title !== 'string' || typeof value.storedAt !== 'number' || !Number.isFinite(value.storedAt)) {
						this.logService.warn('[ChatThinkingTitle] Ignoring an invalid persisted title entry');
						continue;
					}
					if (now - value.storedAt <= cacheTtlMs) {
						this.cache.set(key, { title: value.title, storedAt: value.storedAt });
					}
				}
			}
			for (const [key, entry] of this.pendingEntries) {
				const persisted = this.cache.get(key);
				if (now - entry.storedAt <= cacheTtlMs && (!persisted || entry.storedAt >= persisted.storedAt)) {
					this.cache.set(key, entry);
				}
			}
		}
		return this.cache;
	}

	private save(): void {
		if (!this.pendingEntries.size) {
			return;
		}
		const cache = this.load();
		const now = Date.now();
		const entries = [...cache].filter(([, entry]) => now - entry.storedAt <= cacheTtlMs)
			.sort((a, b) => b[1].storedAt - a[1].storedAt).slice(0, cacheMaxEntries);
		cache.clear();
		for (const [key, entry] of entries) {
			cache.set(key, entry);
		}
		this.storageService.store(cacheStorageKey, JSON.stringify(Object.fromEntries(entries)), StorageScope.PROFILE, StorageTarget.MACHINE);
		this.pendingEntries.clear();
	}

	override dispose(): void {
		this.save();
		super.dispose();
	}
}
