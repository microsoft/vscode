/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatAgentLocation } from './constants.js';
import { ILanguageModelsService } from './languageModels.js';

/** Shared persistence for native picker snapshots and new-chat defaults. */
export class ChatModelConfigurationPersistence {
	constructor(
		private readonly storageService: IStorageService,
		private readonly languageModelsService: Pick<ILanguageModelsService, 'setModelConfiguration'>,
	) { }

	static storageKey(location: ChatAgentLocation, sessionType?: string): string {
		return sessionType ? `chat.modelConfiguration.${location}.${sessionType}` : `chat.modelConfiguration.${location}`;
	}

	readBucket(key: string): IStringDictionary<IStringDictionary<unknown>> {
		const result: IStringDictionary<IStringDictionary<unknown>> = Object.create(null);
		const raw = this.storageService.get(key, StorageScope.APPLICATION);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					for (const [modelId, entry] of Object.entries(parsed)) {
						if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
							result[modelId] = entry as IStringDictionary<unknown>;
						}
					}
				}
			} catch {
				// Match the native picker's recovery from malformed persisted JSON.
			}
		}
		return result;
	}

	writeEntry(key: string, modelId: string, values: IStringDictionary<unknown>): void {
		const bucket = this.readBucket(key);
		bucket[modelId] = values;
		this.storageService.store(key, JSON.stringify(bucket), StorageScope.APPLICATION, StorageTarget.USER);
	}

	mirror(modelId: string, values: IStringDictionary<unknown>): Promise<void> {
		return this.languageModelsService.setModelConfiguration(modelId, values);
	}
}
