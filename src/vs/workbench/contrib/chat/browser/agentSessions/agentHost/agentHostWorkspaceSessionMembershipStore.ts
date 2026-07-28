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
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';

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
	/** Sets exact last-seen timestamps from a complete backend snapshot and prunes memberships absent for over 30 days. */
	reconcileBackendSessions(sessionKeys: readonly string[]): void;
	/** Refreshes one membership after an isolated backend notification. */
	markSeen(key: string): void;
	/** Returns whether a session belongs to this workspace, recording new multi-root provenance when appropriate. */
	shouldInclude(key: string, workingDirectories: readonly URI[], isPendingLocalSession: boolean): boolean;
	/** Removes durable provenance after the backend session is definitively deleted. */
	remove(key: string): void;
	/** Returns whether this eligible Editor multi-root workspace has recorded the session. */
	has(key: string): boolean;
}

/**
 * Keeps multi-root sessions associated with the Editor Window workspace where they were first seen, even when that workspace's folders later change.
 * Backend snapshots batch last-seen updates and stale pruning; outside Editor multi-root workspaces the storage remains dormant.
 */
export class AgentHostWorkspaceSessionMembershipStore implements IAgentHostWorkspaceSessionMembershipStore {

	declare readonly _serviceBrand: undefined;
	private readonly _entries = new Map<string, number>();
	private _loaded = false;
	private _dirty = false;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly _logService: ILogService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) { }

	protected now(): number {
		return Date.now();
	}

	reconcileBackendSessions(sessionKeys: readonly string[]): void {
		if (!this._isEnabled()) {
			return;
		}
		this._ensureLoaded();

		const now = this.now();
		const present = new Set(sessionKeys);
		for (const key of present) {
			if (this._entries.has(key) && this._entries.get(key) !== now) {
				this._entries.set(key, now);
				this._dirty = true;
			}
		}
		for (const [key, lastSeenAt] of this._entries) {
			if (!present.has(key) && now - lastSeenAt > RETENTION_MS) {
				this._entries.delete(key);
				this._dirty = true;
			}
		}
		this._flushIfDirty();
	}

	shouldInclude(key: string, workingDirectories: readonly URI[], isPendingLocalSession: boolean): boolean {
		const folders = this._workspaceContextService.getWorkspace().folders;
		const pathMatches = workingDirectories.some(directory =>
			folders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(directory, folder.uri))
		);
		const isMultiRootSession = workingDirectories.length > 1;

		if (folders.length === 0) {
			return true;
		}
		if (!this._isEnabled() || !isMultiRootSession) {
			return pathMatches;
		}
		this._ensureLoaded();
		if (!this._entries.has(key) && (isPendingLocalSession || pathMatches)) {
			this._entries.set(key, this.now());
			this._dirty = true;
		}
		return this._entries.has(key);
	}

	markSeen(key: string): void {
		if (!this._isEnabled()) {
			return;
		}
		this._ensureLoaded();
		this._markSeen(key, this.now());
		this._flushIfDirty();
	}

	remove(key: string): void {
		if (!this._isEnabled()) {
			return;
		}
		this._ensureLoaded();
		if (this._entries.delete(key)) {
			this._dirty = true;
			this._flushIfDirty();
		}
	}

	has(key: string): boolean {
		if (!this._isEnabled()) {
			return false;
		}
		this._ensureLoaded();
		return this._entries.has(key);
	}

	/** Restricts durable provenance to Editor Windows with an actual multi-root workspace. */
	private _isEnabled(): boolean {
		return !this._environmentService.isSessionsWindow
			&& this._workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE
			&& this._workspaceContextService.getWorkspace().folders.length > 1;
	}

	/** Loads workspace membership lazily so ineligible windows never read this storage. */
	private _ensureLoaded(): void {
		if (!this._loaded) {
			this._loaded = true;
			this._load();
		}
	}

	/** Advances notification-driven freshness only after the daily write-throttle interval. */
	private _markSeen(key: string, now: number): void {
		const lastSeenAt = this._entries.get(key);
		if (lastSeenAt === undefined || now - lastSeenAt < SEEN_WRITE_INTERVAL_MS) {
			return;
		}
		this._entries.set(key, now);
		this._dirty = true;
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

	/** Persists all accumulated membership changes in one whole-map write. */
	private _flushIfDirty(): void {
		if (!this._dirty) {
			return;
		}
		if (this._entries.size === 0) {
			this._storageService.remove(STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			const value: ISerializedMembership = {
				version: 1,
				sessions: [...this._entries].map(([key, lastSeenAt]) => ({ key, lastSeenAt })),
			};
			this._storageService.store(STORAGE_KEY, JSON.stringify(value), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		this._dirty = false;
	}
}

registerSingleton(IAgentHostWorkspaceSessionMembershipStore, AgentHostWorkspaceSessionMembershipStore, InstantiationType.Delayed);
