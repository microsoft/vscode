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
import { ActionType, type IIsArchivedChangedAction, type IIsReadChangedAction, type INotification, type SessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { readSessionEhcliAdoptable, readSessionMultiRootMetadata, SessionStatus, type SessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspaceContextService, type IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';

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
	/**
	 * Whether {@link summary}'s status came from the host. `listSessions()`
	 * metadata carries no status for a cold session that has never been marked
	 * read or archived, and `SessionSummary.status` is required — so the status
	 * is synthesized and the session-scoped flags on it mean nothing.
	 */
	readonly statusKnown: boolean;
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
		this._setSessionFlag(provider, rawId, SessionStatus.IsArchived, archived, {
			type: ActionType.SessionIsArchivedChanged,
			isArchived: archived,
		});
	}

	setSessionRead(provider: string, rawId: string, isRead: boolean): void {
		this._setSessionFlag(provider, rawId, SessionStatus.IsRead, isRead, {
			type: ActionType.SessionIsReadChanged,
			isRead,
		});
	}

	/**
	 * Optimistically flips a session-scoped status flag and dispatches the owning
	 * action, so the host can fan the change out to other connected clients. An
	 * uncached session still dispatches; the summary notification seeds the entry.
	 */
	private _setSessionFlag(provider: string, rawId: string, flag: SessionStatus, set: boolean, action: IIsArchivedChangedAction | IIsReadChangedAction): void {
		const session = AgentSession.uri(provider, rawId);
		const key = this._key(provider, rawId);
		const cached = this._entries.get(key);
		let updated: IAgentHostSessionListEntry | undefined;
		if (cached) {
			const status = set ? cached.summary.status | flag : cached.summary.status & ~flag;
			if (status === cached.summary.status && cached.statusKnown) {
				return;
			}
			// The flag is now meaningful whatever the host had said before: this
			// dispatch is what establishes it.
			updated = { ...cached, statusKnown: true, summary: { ...cached.summary, status } };
		}

		this._mutationGeneration++;
		this._connection.dispatch(session.toString(), action);
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
		this._removeSessionFromList(provider, rawId);
	}

	private _removeSessionFromList(provider: string, rawId: string): void {
		const key = this._key(provider, rawId);
		// An announced or deleted session is no longer pending, even when no visible entry exists.
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
			const entry = this._makeEntryFromMetadata(session);
			if (entry) {
				if (this._isSessionInWorkspace(entry)) {
					nextEntries.push(entry);
				}
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
			const entry = this._makeEntryFromSummary(notification.summary);
			if (!entry) {
				return;
			}
			const key = this._key(entry.provider, entry.rawId);
			if (!this._isSessionInWorkspace(entry)) {
				return;
			}
			this._mutationGeneration++;
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

			const updated: IAgentHostSessionListEntry = {
				provider,
				rawId,
				statusKnown: cached.statusKnown || notification.changes.status !== undefined,
				summary: { ...cached.summary, ...notification.changes },
			};
			if (!this._isSessionInWorkspace(updated)) {
				this._mutationGeneration++;
				this._removeSessionFromList(provider, rawId);
				return;
			}

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

		return {
			provider,
			rawId,
			statusKnown: session.status !== undefined,
			summary: {
				resource: session.session.toString(),
				provider,
				title: session.summary ?? `Session ${rawId.substring(0, 8)}`,
				status: session.status ?? SessionStatus.Idle,
				activity: session.activity,
				createdAt: new Date(session.startTime).toISOString(),
				modifiedAt: new Date(session.modifiedTime).toISOString(),
				changes: session.changes,
				workingDirectories: session.workingDirectories?.map(d => d.toString()),
				// The repository root a worktree-isolated session belongs to; the
				// workspace filter matches on it because the worktree itself lives
				// outside the repository folder.
				...(session.project ? { project: { uri: session.project.uri.toString(), displayName: session.project.displayName } } : {}),
				// Carry `_meta` so the adoptable-legacy marker survives into the list
				// item; consumers use it to avoid passively restoring (and thereby
				// migrating) an un-adopted legacy Copilot CLI session.
				...(session._meta !== undefined ? { _meta: session._meta } : {}),
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
			statusKnown: true,
			summary,
		};
	}

	/** Uses workspace-file provenance for multi-root workspaces and path containment otherwise. */
	private _isSessionInWorkspace(entry: IAgentHostSessionListEntry): boolean {
		const workingDirectories = this._containmentCandidates(entry.summary);
		const workspace = this._workspaceContextService.getWorkspace();
		const folders = workspace.folders;
		const configuration = workspace.configuration;
		const multiRoot = readSessionMultiRootMetadata(entry.summary._meta);
		if (multiRoot) {
			// A multi-root window matches strictly by workspace-file identity so two
			// different `.code-workspace` files that share a folder don't cross over.
			if (URI.isUri(configuration)) {
				return extUriBiasedIgnorePathCase.isEqual(URI.parse(multiRoot.workspaceFile), configuration);
			}
			// An empty window shows every session; a single-folder (or other
			// non-multi-root) window falls back to working-directory containment.
			return folders.length === 0 || this._matchesAnyFolder(workingDirectories, folders);
		}
		if (folders.length === 0) {
			return true;
		}
		return this._matchesAnyFolder(workingDirectories, folders);
	}

	private _matchesAnyFolder(workingDirectories: readonly URI[], folders: readonly IWorkspaceFolder[]): boolean {
		return workingDirectories.some(directory =>
			folders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(directory, folder.uri))
		);
	}

	/**
	 * The directories a session may be matched against a workspace folder by: its
	 * working directories plus - for legacy Copilot CLI sessions only - its
	 * server-owned project (repository) root. Those legacy sessions run out of a
	 * `copilot-worktrees/` directory outside the repository, so working
	 * directories alone would hide them from a window opened on that repository.
	 */
	private _containmentCandidates(summary: SessionSummary): readonly URI[] {
		const candidates = summary.workingDirectories?.map(directory => URI.parse(directory)) ?? [];
		if (summary.project?.uri && readSessionEhcliAdoptable(summary._meta)) {
			candidates.push(URI.parse(summary.project.uri));
		}
		return candidates;
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
