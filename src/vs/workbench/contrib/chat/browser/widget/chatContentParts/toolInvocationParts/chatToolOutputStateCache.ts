/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../../base/common/event.js';
import { LRUCache } from '../../../../../../../base/common/map.js';
import { createDecorator } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../../../platform/storage/common/storage.js';
import { InstantiationType, registerSingleton } from '../../../../../../../platform/instantiation/common/extensions.js';

export interface IOutputState {
	webviewOrigin: string;
	height: number;
	webviewState?: string;
}

export const IChatToolOutputStateCache = createDecorator<IChatToolOutputStateCache>('IChatToolOutputStateCache');

export interface IChatToolOutputStateCache {
	readonly _serviceBrand: undefined;

	get(toolCallId: string): IOutputState | undefined;
	set(toolCallId: string, state: IOutputState): void;
}

const CACHE_STORAGE_KEY = 'chat/toolOutputStateCache';
const CACHE_LIMIT = 100;

export class ChatToolOutputStateCache implements IChatToolOutputStateCache {

	declare readonly _serviceBrand: undefined;

	private readonly _cache = new LRUCache<string, IOutputState>(CACHE_LIMIT, 0.75);

	constructor(@IStorageService storageService: IStorageService) {
		// Restore cached states from storage
		const raw = storageService.get(CACHE_STORAGE_KEY, StorageScope.WORKSPACE, '{}');
		this._deserialize(raw);

		// Store cached states on shutdown
		const onWillSaveStateBecauseOfShutdown = Event.filter(storageService.onWillSaveState, e => e.reason === WillSaveStateReason.SHUTDOWN);
		Event.once(onWillSaveStateBecauseOfShutdown)(() => {
			storageService.store(CACHE_STORAGE_KEY, this._serialize(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		});
	}

	get(toolCallId: string): IOutputState | undefined {
		return this._cache.get(toolCallId);
	}

	set(toolCallId: string, state: IOutputState): void {
		this._cache.set(toolCallId, state);
	}

	private _serialize(): string {
		const data: Record<string, IOutputState> = Object.create(null);
		for (const [key, value] of this._cache) {
			data[key] = value;
		}
		return JSON.stringify(data);
	}

	private _deserialize(raw: string): void {
		try {
			const data: Record<string, IOutputState> = JSON.parse(raw);
			for (const key in data) {
				const state = data[key];
				// Validate the shape of the cached data
				if (typeof state.webviewOrigin === 'string' && typeof state.height === 'number') {
					this._cache.set(key, state);
				}
			}
		} catch {
			// ignore parse errors
		}
	}
}

registerSingleton(IChatToolOutputStateCache, ChatToolOutputStateCache, InstantiationType.Delayed);
