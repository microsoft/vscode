/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../base/common/async.js';
import { Disposable, DisposableMap, IReference, ReferenceCollection } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, buildUncommittedChangesetUri } from '../common/changesetUri.js';
import { parseSubagentSessionUri } from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostChangesetService } from './agentHostChangesetService.js';
import { DEFAULT_AGENT_HOST_WATCH_EXCLUDES, IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { IAgentHostGitService } from './agentHostGitService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { ILogService } from '../../log/common/log.js';

class WatchInterestReferenceCollection extends ReferenceCollection<string> {
	constructor(
		private readonly _create: (sessionStr: string) => void,
		private readonly _destroy: (sessionStr: string) => void,
	) {
		super();
	}

	protected createReferencedObject(sessionStr: string): string {
		this._create(sessionStr);
		return sessionStr;
	}

	protected destroyReferencedObject(sessionStr: string): void {
		this._destroy(sessionStr);
	}
}

/**
 * Keeps static changeset catalogue entries fresh while a client is observing a
 * session or one of its static changeset resources.
 *
 * The generic {@link IAgentHostFileMonitorService} owns folder watching and
 * debounce mechanics; this coordinator owns the changeset-specific lifecycle:
 * subscription interest, session materialization, repository-root resolution,
 * root-level watcher sharing, and refresh fanout.
 *
 * We only monitor roots while at least one client is subscribed to a session or
 * static changeset that needs fresh changeset counts. We do not monitor while a
 * session on that root is actively running a turn: agent/tool edits made during
 * the turn are captured by the turn lifecycle, and the static changesets are
 * recomputed once when the turn completes. Watching during the turn would add
 * duplicate file-system noise without improving correctness.
 */
export class ChangesetFileMonitorCoordinator extends Disposable {

	/** Per-subscription references into the per-session watch-interest collection. */
	private readonly _watchInterestReferences = this._register(new DisposableMap<string, IReference<string>>());
	private readonly _watchInterestCollection = new WatchInterestReferenceCollection(
		sessionStr => this._attachWatcherIfPossible(sessionStr),
		sessionStr => this._destroyWatchInterest(sessionStr),
	);
	/** Sessions waiting for materialization before a root watcher can attach. */
	private readonly _pendingWatchInterest = new Set<string>();
	/** Session URI string to the working directory that produced the current root attachment. */
	private readonly _sessionWorkingDirectory = new Map<string, string>();
	/** Session URI string to repository-root URI string. */
	private readonly _sessionRoot = new Map<string, string>();
	/** Repository-root URI string to sessions currently fanned out from that root. */
	private readonly _rootSessions = new Map<string, Set<string>>();
	/** Repository-root URI string to the shared monitor acquisition. */
	private readonly _rootWatchAcquisitions = this._register(new DisposableMap<string>());
	/** Repository-root URI string to the canonical repository root URI. */
	private readonly _rootUris = new Map<string, URI>();
	/** Active session URI string to repository-root URI string. */
	private readonly _activeSessionRoots = new Map<string, string>();
	/** Repository-root URI string to sessions currently active against that root. */
	private readonly _rootActiveSessions = new Map<string, Set<string>>();
	/** Active sessions whose repository root cannot yet be resolved. */
	private readonly _unresolvedActiveSessions = new Set<string>();
	private readonly _watchAttachmentSequencer = new SequencerByKey<string>();
	private readonly _activeTurnSequencer = new SequencerByKey<string>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _changesets: IAgentHostChangesetService,
		private readonly _configurationService: IAgentConfigurationService,
		private readonly _fileMonitorService: IAgentHostFileMonitorService,
		private readonly _gitService: IAgentHostGitService,
		private readonly _logService: ILogService,
	) {
		super();
	}

	trackSessionChanges(subscriptionKey: string, sessionStr: string): void {
		if (!this._watchInterestReferences.has(subscriptionKey)) {
			this._watchInterestReferences.set(subscriptionKey, this._watchInterestCollection.acquire(sessionStr));
		}
	}

	untrackSessionChanges(subscriptionKey: string): void {
		this._watchInterestReferences.deleteAndDispose(subscriptionKey);
	}

	onSessionRestored(sessionStr: string): void {
		this._retryWatchAttachment(sessionStr);
	}

	onSessionMaterialized(sessionStr: string): void {
		this._retryWatchAttachment(sessionStr);
	}

	onSessionDisposed(sessionStr: string): void {
		this.untrackSessionChanges(buildUncommittedChangesetUri(sessionStr));
		this.untrackSessionChanges(buildSessionChangesetUri(sessionStr));
		this.untrackSessionChanges(sessionStr);
		this._removeActiveSession(sessionStr);
		this._destroyWatchInterest(sessionStr);
	}

	onSessionTurnActiveChanged(sessionStr: string, active: boolean): void {
		this._activeTurnSequencer.queue(sessionStr, async () => {
			if (active) {
				await this._markSessionActive(sessionStr);
			} else {
				this._markSessionInactive(sessionStr);
			}
		});
	}

	private _destroyWatchInterest(sessionStr: string): void {
		this._pendingWatchInterest.delete(sessionStr);
		this._releaseSessionRoot(sessionStr);
	}

	private _retryWatchAttachment(sessionStr: string): void {
		if (this._shouldAttachSession(sessionStr) || this._pendingWatchInterest.has(sessionStr)) {
			this._attachWatcherIfPossible(sessionStr);
		}
	}

	private _hasWatchInterest(sessionStr: string): boolean {
		return this._watchInterestReferences.has(sessionStr)
			|| this._watchInterestReferences.has(buildBranchChangesetUri(sessionStr))
			|| this._watchInterestReferences.has(buildUncommittedChangesetUri(sessionStr))
			|| this._watchInterestReferences.has(buildSessionChangesetUri(sessionStr));
	}

	private _attachWatcherIfPossible(sessionStr: string): void {
		this._watchAttachmentSequencer.queue(sessionStr, async () => {
			if (!this._shouldAttachSession(sessionStr)) {
				return;
			}
			const workingDirectory = this._configurationService.getEffectiveWorkingDirectory(sessionStr);
			if (!workingDirectory) {
				this._pendingWatchInterest.add(sessionStr);
				this._releaseSessionRoot(sessionStr);
				return;
			}
			let workingDirectoryUri: URI;
			try {
				workingDirectoryUri = URI.parse(workingDirectory);
			} catch (err) {
				this._logService.warn(`[ChangesetFileMonitorCoordinator] Failed to parse working directory URI for ${sessionStr}: ${workingDirectory}`, err);
				this._pendingWatchInterest.add(sessionStr);
				this._releaseSessionRoot(sessionStr);
				return;
			}
			if (this._sessionRoot.has(sessionStr) && this._sessionWorkingDirectory.get(sessionStr) === workingDirectory) {
				this._pendingWatchInterest.delete(sessionStr);
				return;
			}
			const repositoryRoot = await this._gitService.getRepositoryRoot(workingDirectoryUri);
			if (!this._shouldAttachSession(sessionStr)) {
				return;
			}
			if (!repositoryRoot) {
				this._pendingWatchInterest.delete(sessionStr);
				this._releaseSessionRoot(sessionStr);
				return;
			}
			this._pendingWatchInterest.delete(sessionStr);
			this._attachSessionToRoot(sessionStr, repositoryRoot, workingDirectory);
		});
	}

	private _attachSessionToRoot(sessionStr: string, repositoryRoot: URI, workingDirectory: string): void {
		const rootStr = repositoryRoot.toString();
		if (this._sessionRoot.get(sessionStr) === rootStr) {
			this._sessionWorkingDirectory.set(sessionStr, workingDirectory);
			this._ensureRootWatcher(rootStr, repositoryRoot);
			return;
		}
		this._releaseSessionRoot(sessionStr);
		let sessions = this._rootSessions.get(rootStr);
		if (!sessions) {
			sessions = new Set<string>();
			this._rootSessions.set(rootStr, sessions);
			this._rootUris.set(rootStr, repositoryRoot);
		}
		sessions.add(sessionStr);
		this._sessionRoot.set(sessionStr, rootStr);
		this._sessionWorkingDirectory.set(sessionStr, workingDirectory);
		this._ensureRootWatcher(rootStr, repositoryRoot);
	}

	private _releaseSessionRoot(sessionStr: string): void {
		const rootStr = this._sessionRoot.get(sessionStr);
		if (!rootStr) {
			this._sessionWorkingDirectory.delete(sessionStr);
			return;
		}
		this._sessionRoot.delete(sessionStr);
		this._sessionWorkingDirectory.delete(sessionStr);
		const sessions = this._rootSessions.get(rootStr);
		if (!sessions) {
			return;
		}
		sessions.delete(sessionStr);
		if (sessions.size === 0) {
			this._rootSessions.delete(rootStr);
			this._rootUris.delete(rootStr);
			this._rootWatchAcquisitions.deleteAndDispose(rootStr);
		}
	}

	private _onRootChanged(rootStr: string): void {
		if (this._isRootActive(rootStr)) {
			return;
		}
		const sessions = this._rootSessions.get(rootStr);
		if (!sessions || sessions.size === 0) {
			return;
		}
		const activeSessions = [...sessions].filter(session => {
			return this._hasWatchInterest(session)
				&& this._sessionRoot.get(session) === rootStr
				&& !this._activeSessionRoots.has(session)
				&& !this._unresolvedActiveSessions.has(session)
				&& !!this._stateManager.getSessionState(session);
		});
		if (activeSessions.length === 0) {
			return;
		}
		for (const session of activeSessions) {
			this._changesets.refreshBranchChangeset(session);
			this._changesets.refreshUncommittedChangeset(session);
			this._changesets.refreshSessionChangeset(session);
		}
	}

	private _shouldAttachSession(sessionStr: string): boolean {
		return this._hasWatchInterest(sessionStr)
			&& !this._activeSessionRoots.has(sessionStr)
			&& !this._unresolvedActiveSessions.has(sessionStr);
	}

	private _isRootActive(rootStr: string): boolean {
		return (this._rootActiveSessions.get(rootStr)?.size ?? 0) > 0;
	}

	private _ensureRootWatcher(rootStr: string, repositoryRoot: URI): void {
		if (this._isRootActive(rootStr) || this._rootWatchAcquisitions.has(rootStr)) {
			return;
		}
		const sessions = this._rootSessions.get(rootStr);
		if (!sessions || sessions.size === 0) {
			return;
		}
		const rootWatchAcquisition = this._fileMonitorService.acquire(repositoryRoot, () => this._onRootChanged(rootStr), {
			excludes: DEFAULT_AGENT_HOST_WATCH_EXCLUDES,
			debounceMs: 750,
		});
		if (!rootWatchAcquisition) {
			for (const session of sessions) {
				this._pendingWatchInterest.add(session);
			}
			return;
		}
		this._rootWatchAcquisitions.set(rootStr, rootWatchAcquisition);
	}

	private _suspendRootWatcher(rootStr: string): void {
		this._rootWatchAcquisitions.deleteAndDispose(rootStr);
	}

	private async _markSessionActive(sessionStr: string): Promise<void> {
		this._removeActiveSession(sessionStr);
		this._pendingWatchInterest.delete(sessionStr);
		const repositoryRoot = await this._resolveActivityRepositoryRoot(sessionStr);
		if (!repositoryRoot) {
			this._unresolvedActiveSessions.add(sessionStr);
			this._releaseSessionRoot(sessionStr);
			return;
		}
		const rootStr = repositoryRoot.toString();
		let activeSessions = this._rootActiveSessions.get(rootStr);
		if (!activeSessions) {
			activeSessions = new Set<string>();
			this._rootActiveSessions.set(rootStr, activeSessions);
		}
		activeSessions.add(sessionStr);
		this._activeSessionRoots.set(sessionStr, rootStr);
		this._rootUris.set(rootStr, repositoryRoot);
		this._suspendRootWatcher(rootStr);
		if (this._sessionRoot.get(sessionStr) !== rootStr) {
			this._releaseSessionRoot(sessionStr);
		}
	}

	private _markSessionInactive(sessionStr: string): void {
		const rootStr = this._removeActiveSession(sessionStr);
		if (rootStr) {
			const repositoryRoot = this._rootUris.get(rootStr);
			if (repositoryRoot) {
				this._ensureRootWatcher(rootStr, repositoryRoot);
			}
		}
		if (this._hasWatchInterest(sessionStr) || this._pendingWatchInterest.has(sessionStr)) {
			this._attachWatcherIfPossible(sessionStr);
		}
	}

	private _removeActiveSession(sessionStr: string): string | undefined {
		this._unresolvedActiveSessions.delete(sessionStr);
		const rootStr = this._activeSessionRoots.get(sessionStr);
		if (!rootStr) {
			return undefined;
		}
		this._activeSessionRoots.delete(sessionStr);
		const activeSessions = this._rootActiveSessions.get(rootStr);
		if (activeSessions) {
			activeSessions.delete(sessionStr);
			if (activeSessions.size === 0) {
				this._rootActiveSessions.delete(rootStr);
			}
		}
		return rootStr;
	}

	private async _resolveActivityRepositoryRoot(sessionStr: string): Promise<URI | undefined> {
		const workingDirectory = this._getActivityWorkingDirectory(sessionStr);
		if (!workingDirectory) {
			return undefined;
		}
		let workingDirectoryUri: URI;
		try {
			workingDirectoryUri = URI.parse(workingDirectory);
		} catch (err) {
			this._logService.warn(`[ChangesetFileMonitorCoordinator] Failed to parse active working directory URI for ${sessionStr}: ${workingDirectory}`, err);
			return undefined;
		}
		return this._gitService.getRepositoryRoot(workingDirectoryUri);
	}

	private _getActivityWorkingDirectory(sessionStr: string): string | undefined {
		const workingDirectory = this._configurationService.getEffectiveWorkingDirectory(sessionStr);
		if (workingDirectory) {
			return workingDirectory;
		}
		const parsedSubagent = parseSubagentSessionUri(sessionStr);
		if (!parsedSubagent) {
			return undefined;
		}
		return this._configurationService.getEffectiveWorkingDirectory(parsedSubagent.parentSession.toString());
	}
}
