/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentSession, type IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType, type INotification, type SessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionStatus, type SessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';

/**
 * Minimal agent-host connection surface needed by the session list store.
 */
export interface IAgentHostSessionListConnection {
	readonly onDidNotification: Event<INotification>;
	listSessions(): Promise<IAgentSessionMetadata[]>;
	disposeSession(session: URI): Promise<void>;
	dispatch(channel: string, action: SessionAction): void;
}

/**
 * Provider-tagged backend session entry owned by the shared session-list store.
 */
export interface IAgentHostSessionListEntry {
	readonly provider: string;
	readonly rawId: string;
	readonly summary: SessionSummary;
}

/**
 * Provider-tagged backend session removal emitted by the shared session-list store.
 */
export interface IAgentHostSessionListRemoval {
	readonly provider: string;
	readonly rawId: string;
	readonly session: URI;
}

/**
 * Backend session delta emitted by the shared session-list store. Every delta
 * carries the affected entries, so consumers can apply them incrementally:
 * narrow notifications carry the single changed/removed entry, while a refresh
 * carries the full current entry set (plus any sessions that dropped out).
 */
export interface IAgentHostSessionListDelta {
	readonly addedOrUpdated?: readonly IAgentHostSessionListEntry[];
	readonly removed?: readonly IAgentHostSessionListRemoval[];
}

/**
 * Shared provider-agnostic cache of agent-host sessions. It owns the
 * provider-wide listSessions refresh, workspace filtering, and root session
 * notifications. Per-provider list controllers project this state into chat
 * session items.
 */
export class AgentHostSessionListStore extends Disposable {

	private readonly _onDidChangeSessions = this._register(new Emitter<IAgentHostSessionListDelta>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _entries = new Map<string, IAgentHostSessionListEntry>();
	/**
	 * Backend session keys for sessions a controller created locally (via
	 * `newChatSessionItem`) that the backend has not yet announced. Tracked here
	 * so per-provider controllers stay stateless; cleared once the backend
	 * surfaces or removes the session.
	 */
	private readonly _pendingNewSessions = new Set<string>();
	private _cacheValid = false;
	private _refreshInFlight: Promise<void> | undefined;
	/**
	 * Incremented whenever the in-memory list is mutated outside of
	 * {@link refresh}. Used to detect races where a `root/sessionAdded`,
	 * `root/sessionRemoved`, or `root/sessionSummaryChanged` notification
	 * arrives while a `listSessions()` round-trip is in flight.
	 */
	private _mutationGeneration = 0;

	constructor(
		private readonly _connection: IAgentHostSessionListConnection,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._register(this._connection.onDidNotification(n => this._onNotification(n)));

		// Re-fetch the session list whenever the set of VS Code workspace
		// folders changes, since filtering depends on it. The agent host itself
		// doesn't know which workspace this VS Code window has open.
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._cacheValid = false;
			void this.refresh(CancellationToken.None);
		}));
	}

	getSessions(provider: string): readonly IAgentHostSessionListEntry[] {
		return [...this._entries.values()].filter(entry => entry.provider === provider);
	}

	/** Record a session created locally before the backend has announced it. */
	addPendingNewSession(provider: string, rawId: string): void {
		this._pendingNewSessions.add(this._key(provider, rawId));
	}

	/** Whether a session was created locally and the backend has not surfaced it yet. */
	isPendingNewSession(provider: string, rawId: string): boolean {
		return this._pendingNewSessions.has(this._key(provider, rawId));
	}

	resetCache(): void {
		this._cacheValid = false;
		this._mutationGeneration++;
	}

	async disposeSession(provider: string, rawId: string): Promise<void> {
		await this._connection.disposeSession(AgentSession.uri(provider, rawId));
	}

	setSessionArchived(provider: string, rawId: string, archived: boolean): void {
		const session = AgentSession.uri(provider, rawId);
		const key = this._key(provider, rawId);
		const cached = this._entries.get(key);
		let updated: IAgentHostSessionListEntry | undefined;
		if (cached) {
			const status = archived
				? cached.summary.status | SessionStatus.IsArchived
				: cached.summary.status & ~SessionStatus.IsArchived;
			if (status === cached.summary.status) {
				return;
			}
			updated = { ...cached, summary: { ...cached.summary, status } };
		}

		this._mutationGeneration++;
		this._connection.dispatch(session.toString(), {
			type: ActionType.SessionIsArchivedChanged,
			isArchived: archived,
		});
		if (updated) {
			this._entries.set(key, updated);
			this._onDidChangeSessions.fire({ addedOrUpdated: [updated] });
		}
	}

	removeSession(provider: string, rawId: string): void {
		// Bump the generation unconditionally — even when the entry isn't present
		// locally. A `root/sessionRemoved` (or an optimistic delete) can arrive
		// while a `listSessions()` is in flight whose snapshot predates the
		// removal; invalidating that snapshot here prevents `_doRefresh` from
		// resurrecting the just-removed session.
		this._mutationGeneration++;
		const key = this._key(provider, rawId);
		// Clear any local pending marker even when there's no backend entry yet:
		// an optimistic delete can target a session the backend never announced.
		this._pendingNewSessions.delete(key);
		const entry = this._entries.get(key);
		if (!entry) {
			return;
		}

		this._entries.delete(key);
		this._onDidChangeSessions.fire({ removed: [this._toRemoval(entry)] });
	}

	async refresh(token: CancellationToken): Promise<void> {
		if (this._refreshInFlight) {
			return this._refreshInFlight;
		}

		this._refreshInFlight = this._doRefresh(token);
		try {
			await this._refreshInFlight;
		} finally {
			this._refreshInFlight = undefined;
		}
	}

	private async _doRefresh(token: CancellationToken): Promise<void> {
		if (this._cacheValid) {
			return;
		}

		const previousEntries = [...this._entries.values()];
		const startGeneration = this._mutationGeneration;
		let sessions: IAgentSessionMetadata[];
		try {
			sessions = await this._connection.listSessions();
		} catch {
			// If notifications mutated the list while we were fetching, the
			// in-memory state is more up-to-date than our failed fetch.
			if (startGeneration !== this._mutationGeneration) {
				return;
			}
			if (this._entries.size === 0) {
				return;
			}
			this._entries.clear();
			this._onDidChangeSessions.fire({ removed: previousEntries.map(entry => this._toRemoval(entry)) });
			return;
		}

		// If notifications mutated the list between the request and response,
		// our snapshot is stale. Discard it and re-fetch instead of overwriting
		// the just-updated entries.
		if (startGeneration !== this._mutationGeneration) {
			return this._doRefresh(token);
		}

		const nextEntries: IAgentHostSessionListEntry[] = [];
		for (const session of sessions) {
			if (!this._isWorkingDirectoryInWorkspace(session.workingDirectory)) {
				continue;
			}
			const entry = this._makeEntryFromMetadata(session);
			if (entry) {
				nextEntries.push(entry);
			}
		}

		this._entries.clear();
		for (const entry of nextEntries) {
			const key = this._key(entry.provider, entry.rawId);
			this._entries.set(key, entry);
			// A locally-created session that now appears in the backend list is no
			// longer pending.
			this._pendingNewSessions.delete(key);
		}
		this._cacheValid = true;

		// Fire the full current entry set (each controller projects only its own
		// provider) plus any sessions that dropped out. Consumers apply this
		// incrementally and re-sort, so a precise per-item diff is unnecessary.
		const nextKeys = new Set(nextEntries.map(entry => this._key(entry.provider, entry.rawId)));
		const removed = previousEntries
			.filter(entry => !nextKeys.has(this._key(entry.provider, entry.rawId)))
			.map(entry => this._toRemoval(entry));
		if (nextEntries.length === 0 && removed.length === 0) {
			return;
		}

		this._onDidChangeSessions.fire({
			...(nextEntries.length > 0 ? { addedOrUpdated: nextEntries } : undefined),
			...(removed.length > 0 ? { removed } : undefined),
		});
	}

	private _onNotification(notification: INotification): void {
		if (notification.type === 'root/sessionAdded') {
			if (!this._isWorkingDirectoryInWorkspace(notification.summary.workingDirectory)) {
				return;
			}
			const entry = this._makeEntryFromSummary(notification.summary);
			if (!entry) {
				return;
			}
			this._mutationGeneration++;
			const key = this._key(entry.provider, entry.rawId);
			this._entries.set(key, entry);
			// The backend has now announced this session, so it is no longer a
			// locally-pending new session.
			this._pendingNewSessions.delete(key);
			this._onDidChangeSessions.fire({ addedOrUpdated: [entry] });
		} else if (notification.type === 'root/sessionRemoved') {
			const provider = AgentSession.provider(notification.session);
			if (!provider) {
				return;
			}
			this.removeSession(provider, AgentSession.id(notification.session));
		} else if (notification.type === 'root/sessionSummaryChanged') {
			const provider = AgentSession.provider(notification.session);
			if (!provider) {
				return;
			}
			const rawId = AgentSession.id(notification.session);
			const key = this._key(provider, rawId);
			const cached = this._entries.get(key);
			if (!cached) {
				return;
			}

			const updatedSummary = { ...cached.summary, ...notification.changes };
			if (!this._isWorkingDirectoryInWorkspace(updatedSummary.workingDirectory)) {
				this.removeSession(provider, rawId);
				return;
			}

			const updated = { provider, rawId, summary: updatedSummary };
			this._mutationGeneration++;
			this._entries.set(key, updated);
			this._onDidChangeSessions.fire({ addedOrUpdated: [updated] });
		}
	}

	private _makeEntryFromMetadata(session: IAgentSessionMetadata): IAgentHostSessionListEntry | undefined {
		const provider = AgentSession.provider(session.session);
		if (!provider) {
			return undefined;
		}

		const rawId = AgentSession.id(session.session);
		let status = session.status ?? SessionStatus.Idle;
		if (session.isRead) {
			status |= SessionStatus.IsRead;
		}
		if (session.isArchived) {
			status |= SessionStatus.IsArchived;
		}

		return {
			provider,
			rawId,
			summary: {
				resource: session.session.toString(),
				provider,
				title: session.summary ?? `Session ${rawId.substring(0, 8)}`,
				status,
				activity: session.activity,
				createdAt: new Date(session.startTime).toISOString(),
				modifiedAt: new Date(session.modifiedTime).toISOString(),
				changes: session.changes,
				workingDirectory: session.workingDirectory?.toString(),
			},
		};
	}

	private _makeEntryFromSummary(summary: SessionSummary): IAgentHostSessionListEntry | undefined {
		const provider = summary.provider || AgentSession.provider(summary.resource);
		if (!provider) {
			return undefined;
		}
		return {
			provider,
			rawId: AgentSession.id(summary.resource),
			summary,
		};
	}

	/**
	 * Returns `true` if a session with the given working directory belongs
	 * to the current VS Code workspace. When the window has no workspace
	 * folders open (e.g. the Agents window, or an empty VS Code window),
	 * filtering is disabled and every session is considered in-scope.
	 *
	 * Sessions without a working directory are excluded when a workspace
	 * is open since they cannot be attributed to any folder.
	 */
	private _isWorkingDirectoryInWorkspace(workingDirectory: URI | string | undefined): boolean {
		const folders = this._workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return true;
		}
		if (!workingDirectory) {
			return false;
		}
		const workingDirectoryUri = typeof workingDirectory === 'string' ? URI.parse(workingDirectory) : workingDirectory;
		return folders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectoryUri, folder.uri));
	}

	private _toRemoval(entry: IAgentHostSessionListEntry): IAgentHostSessionListRemoval {
		return {
			provider: entry.provider,
			rawId: entry.rawId,
			session: AgentSession.uri(entry.provider, entry.rawId),
		};
	}

	private _key(provider: string, rawId: string): string {
		return `${provider}://${rawId}`;
	}
}
