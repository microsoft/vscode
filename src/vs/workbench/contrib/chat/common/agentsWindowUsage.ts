/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from './constants.js';

/** Reads the existing cumulative count of sessions created in the Agents Window. */
export class AgentsWindowUsage {
	constructor(private readonly storageService: IStorageService) { }

	get createdSessionCount(): number {
		return this.storageService.getNumber(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, StorageScope.APPLICATION, 0);
	}

	onDidChangeCreatedSessionCount(store: DisposableStore): Event<number> {
		return Event.map(
			this.storageService.onDidChangeValue(StorageScope.APPLICATION, AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, store),
			() => this.createdSessionCount,
		);
	}
}
