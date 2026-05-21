/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { LRUCache } from '../../../../../../base/common/map.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../../platform/storage/common/storage.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';

export interface IOutputPartState {
	height: number;
	webviewState?: string;
}

export const IChatOutputPartStateCache = createDecorator<IChatOutputPartStateCache>('IChatOutputPartStateCache');

export interface IChatOutputPartStateCache {
	readonly _serviceBrand: undefined;

	get(key: string): IOutputPartState | undefined;
	set(key: string, state: IOutputPartState): void;
}

const CACHE_STORAGE_KEY = 'chat/outputPartStateCache';
const LEGACY_CACHE_STORAGE_KEY = 'chat/toolOutputStateCache';
const CACHE_LIMIT = 100;

export class ChatOutputPartStateCache implements IChatOutputPartStateCache {

	declare readonly _serviceBrand: undefined;

	private readonly _cache = new LRUCache<string, IOutputPartState>(CACHE_LIMIT, 0.75);

	constructor(@IStorageService storageService: IStorageService) {
		const raw = storageService.get(CACHE_STORAGE_KEY, StorageScope.WORKSPACE, storageService.get(LEGACY_CACHE_STORAGE_KEY, StorageScope.WORKSPACE, '{}'));
		this._deserialize(raw);

		const onWillSaveStateBecauseOfShutdown = Event.filter(storageService.onWillSaveState, e => e.reason === WillSaveStateReason.SHUTDOWN);
		Event.once(onWillSaveStateBecauseOfShutdown)(() => {
			storageService.store(CACHE_STORAGE_KEY, this._serialize(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		});
	}

	get(key: string): IOutputPartState | undefined {
		return this._cache.get(key);
	}

	set(key: string, state: IOutputPartState): void {
		this._cache.set(key, state);
	}

	private _serialize(): string {
		const data: Record<string, IOutputPartState> = Object.create(null);
		for (const [key, value] of this._cache) {
			data[key] = value;
		}
		return JSON.stringify(data);
	}

	private _deserialize(raw: string): void {
		try {
			const data: Record<string, Partial<IOutputPartState>> = JSON.parse(raw);
			for (const key in data) {
				const state = data[key];
				if (typeof state.height === 'number') {
					this._cache.set(key, { height: state.height, webviewState: typeof state.webviewState === 'string' ? state.webviewState : undefined });
				}
			}
		} catch {
			// ignore parse errors
		}
	}
}

registerSingleton(IChatOutputPartStateCache, ChatOutputPartStateCache, InstantiationType.Delayed);
