/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, isActiveAgentsWindowUser } from '../../../../platform/chat/common/agentsWindowInvitation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

const AGENTS_WINDOW_TOTAL_REQUESTS_STORAGE_KEY = 'agentSessions.totalRequests';

/** Reads and records machine-local Agents Window session creation and requests across workspaces and profiles. */
export class AgentsWindowUsage {
	constructor(private readonly storageService: IStorageService) { }

	get createdSessionCount(): number {
		return this.storageService.getNumber(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, StorageScope.APPLICATION, 0);
	}

	/**
	 * Requests the user submitted from the Agents Window. Each created session began with a request, so
	 * until the first request is recorded, the created session count stands in for earlier requests.
	 */
	get requestCount(): number {
		return this.storageService.getNumber(AGENTS_WINDOW_TOTAL_REQUESTS_STORAGE_KEY, StorageScope.APPLICATION) ?? this.createdSessionCount;
	}

	recordRequest(): number {
		const count = this.requestCount + 1;
		this.storageService.store(AGENTS_WINDOW_TOTAL_REQUESTS_STORAGE_KEY, count, StorageScope.APPLICATION, StorageTarget.MACHINE);
		return count;
	}

	isActiveUser(now = Date.now()): boolean {
		return isActiveAgentsWindowUser(this.storageService, now);
	}

	recordSessionCreated(now = Date.now()): number {
		const count = this.createdSessionCount + 1;
		this.storageService.storeAll([
			{ key: AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, value: now, scope: StorageScope.APPLICATION, target: StorageTarget.MACHINE },
			{ key: AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, value: count, scope: StorageScope.APPLICATION, target: StorageTarget.MACHINE },
		], false);
		return count;
	}

	onDidChange(store: DisposableStore): Event<void> {
		return Event.map(Event.any(
			this.storageService.onDidChangeValue(StorageScope.APPLICATION, AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, store),
			this.storageService.onDidChangeValue(StorageScope.APPLICATION, AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, store),
		), () => undefined);
	}

	onDidChangeCreatedSessionCount(store: DisposableStore): Event<number> {
		return Event.map(
			this.storageService.onDidChangeValue(StorageScope.APPLICATION, AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, store),
			() => this.createdSessionCount,
		);
	}

	onDidChangeRequestCount(store: DisposableStore): Event<number> {
		return Event.map(Event.any(
			this.storageService.onDidChangeValue(StorageScope.APPLICATION, AGENTS_WINDOW_TOTAL_REQUESTS_STORAGE_KEY, store),
			this.storageService.onDidChangeValue(StorageScope.APPLICATION, AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, store),
		), () => this.requestCount);
	}
}
