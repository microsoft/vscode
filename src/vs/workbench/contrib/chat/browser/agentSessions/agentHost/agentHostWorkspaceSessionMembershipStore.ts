/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { isObject } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';

const STORAGE_KEY = 'agentHost.workspaceSessionMembership.v1';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SEEN_WRITE_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface IStoredMembership {
	readonly key: string;
	readonly lastSeenAt: number;
}

interface ISerializedMembership {
	readonly version: 1;
	readonly sessions: readonly IStoredMembership[];
}

export const IAgentHostWorkspaceSessionMembershipStore = createDecorator<IAgentHostWorkspaceSessionMembershipStore>('agentHostWorkspaceSessionMembershipStore');

export interface IAgentHostWorkspaceSessionMembershipStore {
	readonly _serviceBrand: undefined;
	/** Refreshes last-seen timestamps from a complete backend snapshot and prunes memberships absent for over 30 days. */
	reconcileBackendSessions(sessionKeys: readonly string[]): void;
	shouldInclude(key: string, workingDirectories: readonly URI[], isPendingLocalSession: boolean): boolean;
	remove(key: string): void;
	has(key: string): boolean;
}

/** Persists multi-root session provenance for the current workspace. */
export class AgentHostWorkspaceSessionMembershipStore implements IAgentHostWorkspaceSessionMembershipStore {

	declare readonly _serviceBrand: undefined;
	private readonly _entries = new Map<string, number>();

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._load();
	}

	protected now(): number {
		return Date.now();
	}

	reconcileBackendSessions(sessionKeys: readonly string[]): void {
		if (this._workspaceContextService.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
			return;
		}

		const now = this.now();
		const present = new Set(sessionKeys);
		let didChange = false;
		for (const key of present) {
			didChange = this._markSeen(key, now) || didChange;
		}
		for (const [key, lastSeenAt] of this._entries) {
			if (!present.has(key) && now - lastSeenAt > RETENTION_MS) {
				this._entries.delete(key);
				didChange = true;
			}
		}
		if (didChange) {
			this._save();
		}
	}

	shouldInclude(key: string, workingDirectories: readonly URI[], isPendingLocalSession: boolean): boolean {
		const folders = this._workspaceContextService.getWorkspace().folders;
		const pathMatches = workingDirectories.some(directory =>
			folders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(directory, folder.uri))
		);
		const isWorkspace = this._workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
		const isMultiRootSession = workingDirectories.length > 1;

		if (isWorkspace && isMultiRootSession) {
			if (this._entries.has(key)) {
				this._markSeenAndSave(key);
			} else if (isPendingLocalSession || pathMatches) {
				this._entries.set(key, this.now());
				this._save();
			}
		}

		if (folders.length === 0) {
			return true;
		}
		if (folders.length === 1 || !isMultiRootSession || !isWorkspace) {
			return pathMatches;
		}
		return this._entries.has(key);
	}

	remove(key: string): void {
		if (this._entries.delete(key)) {
			this._save();
		}
	}

	has(key: string): boolean {
		return this._entries.has(key);
	}

	private _markSeenAndSave(key: string): void {
		if (this._markSeen(key, this.now())) {
			this._save();
		}
	}

	private _markSeen(key: string, now: number): boolean {
		const lastSeenAt = this._entries.get(key);
		if (lastSeenAt === undefined || now - lastSeenAt < SEEN_WRITE_INTERVAL_MS) {
			return false;
		}
		this._entries.set(key, now);
		return true;
	}

	private _load(): void {
		const raw = this._storageService.get(STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			const value: unknown = JSON.parse(raw);
			if (!isObject(value)) {
				return;
			}
			const serialized = value as Record<string, unknown>;
			if (serialized.version !== 1 || !Array.isArray(serialized.sessions)) {
				return;
			}
			for (const entry of serialized.sessions) {
				if (isObject(entry)) {
					const membership = entry as Record<string, unknown>;
					if (typeof membership.key === 'string' && typeof membership.lastSeenAt === 'number' && Number.isFinite(membership.lastSeenAt)) {
						this._entries.set(membership.key, membership.lastSeenAt);
					}
				}
			}
		} catch (error) {
			this._logService.warn('[AgentHostWorkspaceSessionMembershipStore] Failed to parse persisted membership', error);
		}
	}

	private _save(): void {
		if (this._entries.size === 0) {
			this._storageService.remove(STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}
		const value: ISerializedMembership = {
			version: 1,
			sessions: [...this._entries].map(([key, lastSeenAt]) => ({ key, lastSeenAt })),
		};
		this._storageService.store(STORAGE_KEY, JSON.stringify(value), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

registerSingleton(IAgentHostWorkspaceSessionMembershipStore, AgentHostWorkspaceSessionMembershipStore, InstantiationType.Delayed);
