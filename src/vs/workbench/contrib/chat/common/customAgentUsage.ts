/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

const CUSTOM_AGENT_USE_COUNT_STORAGE_KEY = 'chat.customAgentUsage.count';
const CUSTOM_AGENT_LAST_USED_STORAGE_KEY = 'chat.customAgentUsage.lastUsed';

/**
 * Best-effort, machine-local use of custom agents, i.e. agents not built into the product, shared by all
 * windows, profiles and applications. Overlapping window writes can lose increments.
 */
export class CustomAgentUsage {
	constructor(private readonly storageService: IStorageService) { }

	/** How many requests were submitted with a custom agent. */
	get useCount(): number {
		return this.storageService.getNumber(CUSTOM_AGENT_USE_COUNT_STORAGE_KEY, StorageScope.APPLICATION_SHARED, 0);
	}

	/** When a request was last submitted with a custom agent, in milliseconds since the epoch. */
	get lastUsed(): number | undefined {
		return this.storageService.getNumber(CUSTOM_AGENT_LAST_USED_STORAGE_KEY, StorageScope.APPLICATION_SHARED);
	}

	recordUse(timestamp = Date.now()): void {
		this.storageService.storeAll([
			{ key: CUSTOM_AGENT_USE_COUNT_STORAGE_KEY, value: this.useCount + 1, scope: StorageScope.APPLICATION_SHARED, target: StorageTarget.MACHINE },
			{ key: CUSTOM_AGENT_LAST_USED_STORAGE_KEY, value: Math.max(this.lastUsed ?? 0, timestamp), scope: StorageScope.APPLICATION_SHARED, target: StorageTarget.MACHINE },
		], false);
	}
}
