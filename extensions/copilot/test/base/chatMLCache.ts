/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SQLiteSlottedCache } from './cache';
import { CacheableChatRequest, CachedResponse, IChatMLCache } from './cachingChatMLFetcher';
import { CurrentTestRunInfo } from './simulationContext';

export class ChatMLSQLiteCache extends SQLiteSlottedCache<CacheableChatRequest, CachedResponse> implements IChatMLCache {
	constructor(salt: string, info: CurrentTestRunInfo) {
		super('request', salt, info);
	}
}
