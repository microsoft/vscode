/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/arrays.js';
import { SequencerByKey } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap, IDisposable, IReference, ReferenceCollection, toDisposable } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { FileChangesEvent, IFileService } from '../../files/common/files.js';
import { GIT_IGNORE_FILE_NAME, readGitIgnoreWatcherExcludes } from '../../files/common/watcherGitIgnore.js';
import { buildUncommittedChangesetUri, changesetSession, parseChangesetUri } from '../common/changesetUri.js';
import { isAhpChatChannel, parseSubagentSessionUri } from '../common/state/sessionState.js';
import { DEFAULT_AGENT_HOST_WATCH_EXCLUDES, IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { resolveSessionRepositories } from './agentHostSessionRepositories.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { getEffectiveWorkingDirectories, getEffectiveWorkingDirectory } from './agentConfigurationService.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { resolveBranchChangesetScopeForSource } from './agentHostBranchChangesetScope.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';

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

/** A repository root's shared monitor acquisition. */
interface IRootWatch extends IDisposable {
	readonly repositoryRoot: URI;
	readonly gitIgnoreResource: URI;
	/** Excludes derived from the root `.gitignore` when the watcher was acquired. */
	readonly gitIgnoreExcludes: readonly string[];
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
 *
 * Root watchers exist only to refresh session Git state, so they also exclude
 * the paths ignored by the root's `.gitignore` (build output such as `target/`
 * would otherwise add watches for every file it churns). The `.gitignore` is
 * read before each acquisition, and the watcher is re-acquired when a change
 * to it alters the derived excludes.
 */
export class ChangesetFileMonitorCoordinator extends Disposable {

	/** Per-subscription references into the per-session watch-interest collection. */
	private readonly _watchInterestReferences = this._register(new DisposableMap<string, IReference<string>>());
	private readonly _watchOwners = new Map<string, string>();
	private readonly _watchSources = new Map<string, string>();
	/** Containing session of each watch, recorded when tracking starts. */
	private readonly _watchSessions = new Map<string, string>();
	private readonly _watchInterestCollection = new WatchInterestReferenceCollection(
		sessionStr => this._attachWatcherIfPossible(sessionStr),
		sessionStr => this._destroyWatchInterest(sessionStr),
	);
	/** Sessions waiting for materialization before a root watcher can attach. */
	private readonly _pendingWatchInterest = new Set<string>();
	/** Session URI string to a stable signature of the working-directory set that produced the current root attachments. */
	private readonly _sessionWorkingDirectories = new Map<string, string>();
	/** Session URI string to the set of repository-root URI strings it is watching. */
	private readonly _sessionRoots = new Map<string, Set<string>>();
	/** Repository-root URI string to sessions currently fanned out from that root. */
	private readonly _rootSessions = new Map<string, Set<string>>();
	/** Repository-root URI string to the shared monitor acquisition. */
	private readonly _rootWatches = this._register(new DisposableMap<string, IRootWatch>());
	/** Repository-root URI string to the pending `.gitignore` read that (re)acquires its watcher; disposing it cancels the read. */
	private readonly _rootWatchUpdates = this._register(new DisposableMap<string>());
	/** Repository-root URI string to the canonical repository root URI. */
	private readonly _rootUris = new Map<string, URI>();
	/** Active session URI string to repository-root URI strings. */
	private readonly _activeSessionRoots = new Map<string, Set<string>>();
	/** Repository-root URI string to sessions currently active against that root. */
	private readonly _rootActiveSessions = new Map<string, Set<string>>();
	/** Active sessions whose repository root cannot yet be resolved. */
	private readonly _unresolvedActiveSessions = new Set<string>();
	private readonly _watchAttachmentSequencer = new SequencerByKey<string>();
	private readonly _activeTurnSequencer = new SequencerByKey<string>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostFileMonitorService private readonly _fileMonitorService: IAgentHostFileMonitorService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._register(this._fileService.onDidFilesChange(event => this._onDidFilesChange(event)));
	}

	trackSessionChanges(subscriptionKey: string, sessionStr: string, sourceStr: string = sessionStr): void {
		if (!this._watchInterestReferences.has(subscriptionKey)) {
			this._watchOwners.set(subscriptionKey, sessionStr);
			this._watchSources.set(sessionStr, sourceStr);
			this._recordWatchSession(subscriptionKey, sourceStr);
			this._watchInterestReferences.set(subscriptionKey, this._watchInterestCollection.acquire(sessionStr));
		}
	}

	untrackSessionChanges(subscriptionKey: string): void {
		const owner = this._watchOwners.get(subscriptionKey);
		this._watchOwners.delete(subscriptionKey);
		this._watchSessions.delete(subscriptionKey);
		this._watchInterestReferences.deleteAndDispose(subscriptionKey);
		if (owner && ![...this._watchOwners.values()].includes(owner)) {
			this._watchSources.delete(owner);
		}
	}

	onSessionRestored(sessionStr: string): void {
		// Cold chat-owned watches learn their session once the chat is registered.
		for (const [subscription, owner] of this._watchOwners) {
			if (!this._watchSessions.has(subscription)) {
				this._recordWatchSession(subscription, this._watchSources.get(owner) ?? owner);
			}
		}
		this._retryWatchAttachment(sessionStr);
	}

	private _recordWatchSession(subscriptionKey: string, sourceStr: string): void {
		const parsed = parseChangesetUri(subscriptionKey);
		const session = isAhpChatChannel(sourceStr)
			? this._chatOwnership.getChatOwner(sourceStr)
			: (parsed && changesetSession(parsed, chat => this._chatOwnership.getChatOwner(chat))) ?? sourceStr;
		if (session !== undefined) {
			this._watchSessions.set(subscriptionKey, session);
		}
	}

	onSessionMaterialized(sessionStr: string): void {
		this._retryWatchAttachment(sessionStr);
	}

	/**
	 * Re-attach a session's root watchers when its effective working-directory
	 * set changes (a folder added or removed, e.g. in the Editor Window). The
	 * signature guard in `_attachWatcherIfPossible` makes an unchanged set a
	 * no-op, so this is cheap; an active (mid-turn) session is instead re-attached
	 * by the turn lifecycle on turn end.
	 */
	onSessionWorkingDirectoriesChanged(sessionStr: string): void {
		this._retryWatchAttachment(sessionStr);
	}

	onSessionDisposed(sessionStr: string): void {
		this.untrackSessionChanges(buildUncommittedChangesetUri(sessionStr));
		for (const [subscription, owner] of [...this._watchOwners]) {
			const source = this._watchSources.get(owner) ?? owner;
			if (source === sessionStr || this._watchSessions.get(subscription) === sessionStr) {
				this.untrackSessionChanges(subscription);
			}
		}
		this._removeActiveSession(sessionStr);
		this._destroyWatchInterest(sessionStr);
	}

	onSessionTurnActiveChanged(sessionStr: string, active: boolean): void {
		const watchOwners = new Set([
			sessionStr,
			resolveBranchChangesetScopeForSource(this._stateManager, sessionStr).ownerUri,
		]);
		for (const [owner, source] of this._watchSources) {
			if (source === sessionStr) {
				watchOwners.add(owner);
			}
		}
		for (const owner of watchOwners) {
			this._activeTurnSequencer.queue(owner, async () => {
				if (active) {
					await this._markSessionActive(owner);
				} else {
					this._markSessionInactive(owner);
				}
			});
		}
	}

	private _destroyWatchInterest(sessionStr: string): void {
		this._pendingWatchInterest.delete(sessionStr);
		this._releaseSessionRoots(sessionStr);
	}

	private _retryWatchAttachment(sessionStr: string): void {
		if (this._shouldAttachSession(sessionStr) || this._pendingWatchInterest.has(sessionStr)) {
			this._attachWatcherIfPossible(sessionStr);
		}
	}

	private _hasWatchInterest(sessionStr: string): boolean {
		return [...this._watchOwners.values()].includes(sessionStr);
	}

	private _attachWatcherIfPossible(sessionStr: string): void {
		this._watchAttachmentSequencer.queue(sessionStr, async () => {
			if (!this._shouldAttachSession(sessionStr)) {
				return;
			}
			const source = this._watchSources.get(sessionStr) ?? sessionStr;
			const workingDirectories = getEffectiveWorkingDirectories(this._stateManager, source);
			if (!workingDirectories || workingDirectories.length === 0) {
				this._pendingWatchInterest.add(sessionStr);
				this._releaseSessionRoots(sessionStr);
				return;
			}
			const workingDirectoryUris: URI[] = [];
			for (const workingDirectory of workingDirectories) {
				try {
					workingDirectoryUris.push(URI.parse(workingDirectory));
				} catch (err) {
					this._logService.warn(`[ChangesetFileMonitorCoordinator] Failed to parse working directory URI for ${sessionStr}: ${workingDirectory}`, err);
				}
			}
			if (workingDirectoryUris.length === 0) {
				this._pendingWatchInterest.add(sessionStr);
				this._releaseSessionRoots(sessionStr);
				return;
			}
			const signature = this._workingDirectoriesSignature(workingDirectories);
			if (this._sessionRoots.has(sessionStr) && this._sessionWorkingDirectories.get(sessionStr) === signature) {
				this._pendingWatchInterest.delete(sessionStr);
				return;
			}
			const { gitRepositories } = await resolveSessionRepositories(workingDirectoryUris, this._gitService);
			if (!this._shouldAttachSession(sessionStr)) {
				return;
			}
			if (gitRepositories.length === 0) {
				this._pendingWatchInterest.delete(sessionStr);
				this._releaseSessionRoots(sessionStr);
				return;
			}
			this._pendingWatchInterest.delete(sessionStr);
			this._attachSessionToRoots(sessionStr, gitRepositories, signature);
		});
	}

	private _attachSessionToRoots(sessionStr: string, repositoryRoots: readonly URI[], signature: string): void {
		const desiredRoots = new Map<string, URI>();
		for (const repositoryRoot of repositoryRoots) {
			desiredRoots.set(repositoryRoot.toString(), repositoryRoot);
		}

		// Detach from roots this session no longer resolves to (runs on each re-attach). An idle
		// subscribed session re-attaches as soon as its working-directory set changes (via
		// `onSessionWorkingDirectoriesChanged`); an active session re-attaches at turn end.
		const current = this._sessionRoots.get(sessionStr);
		if (current) {
			for (const rootStr of [...current]) {
				if (!desiredRoots.has(rootStr)) {
					current.delete(rootStr);
					this._detachRootSession(sessionStr, rootStr);
				}
			}
		}

		let sessionRoots = this._sessionRoots.get(sessionStr);
		if (!sessionRoots) {
			sessionRoots = new Set<string>();
			this._sessionRoots.set(sessionStr, sessionRoots);
		}
		for (const [rootStr, repositoryRoot] of desiredRoots) {
			let sessions = this._rootSessions.get(rootStr);
			if (!sessions) {
				sessions = new Set<string>();
				this._rootSessions.set(rootStr, sessions);
				this._rootUris.set(rootStr, repositoryRoot);
			}
			sessions.add(sessionStr);
			sessionRoots.add(rootStr);
			this._ensureRootWatcher(rootStr, repositoryRoot);
		}
		// A root watcher whose acquisition fails later clears this signature
		// (see `_onRootWatchFailed`), so the root is retried on the next re-attach.
		this._sessionWorkingDirectories.set(sessionStr, signature);
	}

	private _releaseSessionRoots(sessionStr: string): void {
		this._sessionWorkingDirectories.delete(sessionStr);
		const rootStrs = this._sessionRoots.get(sessionStr);
		if (!rootStrs) {
			return;
		}
		this._sessionRoots.delete(sessionStr);
		for (const rootStr of rootStrs) {
			this._detachRootSession(sessionStr, rootStr);
		}
	}

	/**
	 * Removes a session from one repository root's fan-out set, disposing the
	 * shared root watcher once the last referencing session drops it.
	 */
	private _detachRootSession(sessionStr: string, rootStr: string): void {
		const sessions = this._rootSessions.get(rootStr);
		if (!sessions) {
			return;
		}
		sessions.delete(sessionStr);
		if (sessions.size === 0) {
			this._rootSessions.delete(rootStr);
			this._rootUris.delete(rootStr);
			this._releaseRootWatcher(rootStr);
		}
	}

	private _workingDirectoriesSignature(workingDirectories: readonly string[]): string {
		return workingDirectories.join('\u0000');
	}

	private _onRootChanged(rootStr: string): void {
		if (this._isRootActive(rootStr)) {
			return;
		}
		const sessions = this._rootSessions.get(rootStr);
		if (!sessions || sessions.size === 0) {
			return;
		}
		const sessionsToRefresh = [...sessions].filter(session => {
			const source = this._watchSources.get(session) ?? session;
			return this._hasWatchInterest(session)
				&& !!this._sessionRoots.get(session)?.has(rootStr)
				&& !this._activeSessionRoots.has(session)
				&& !this._unresolvedActiveSessions.has(session)
				&& !!this._stateManager.getSessionState(source);
		});
		if (sessionsToRefresh.length === 0) {
			return;
		}

		for (const session of sessionsToRefresh) {
			// Always refresh from the PRIMARY working directory, never the changed root: branch/PR is a
			// primary-repo concept, while the downstream summary recompute re-diffs EVERY repo — so a
			// secondary change still reflects without mis-attributing its branch/PR. Throttled downstream.
			const source = this._watchSources.get(session) ?? session;
			const primaryWorkingDirectory = getEffectiveWorkingDirectory(this._stateManager, source);
			if (!primaryWorkingDirectory) {
				continue;
			}
			let primaryWorkingDirectoryUri: URI;
			try {
				primaryWorkingDirectoryUri = URI.parse(primaryWorkingDirectory);
			} catch (err) {
				this._logService.warn(`[ChangesetFileMonitorCoordinator] Failed to parse primary working directory URI for ${session}: ${primaryWorkingDirectory}`, err);
				continue;
			}
			void this._gitStateService.refreshSessionGitState(source, primaryWorkingDirectoryUri);
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

	/**
	 * Ensures a shared watcher exists, or is being acquired, for a root that has
	 * attached sessions and no active turn. The watcher is acquired once the
	 * root's `.gitignore` has been read.
	 */
	private _ensureRootWatcher(rootStr: string, repositoryRoot: URI): void {
		if (this._isRootActive(rootStr) || this._rootWatches.has(rootStr) || this._rootWatchUpdates.has(rootStr)) {
			return;
		}
		const sessions = this._rootSessions.get(rootStr);
		if (!sessions || sessions.size === 0) {
			return;
		}
		this._updateRootWatcher(rootStr, repositoryRoot);
	}

	/**
	 * Reads the root's `.gitignore` and acquires a watcher that excludes its
	 * ignored paths, replacing the current watcher only if they changed. A newer
	 * update, a turn suspending the root, or the root's last session detaching
	 * cancels the pending read, so it never acquires a stale watcher.
	 */
	private _updateRootWatcher(rootStr: string, repositoryRoot: URI): void {
		const cancellation = new CancellationTokenSource();
		this._rootWatchUpdates.set(rootStr, toDisposable(() => cancellation.dispose(true)));
		void this._doUpdateRootWatcher(rootStr, repositoryRoot, cancellation.token);
	}

	private async _doUpdateRootWatcher(rootStr: string, repositoryRoot: URI, token: CancellationToken): Promise<void> {
		const gitIgnoreExcludes = await readGitIgnoreWatcherExcludes(this._fileService, repositoryRoot);
		if (token.isCancellationRequested) {
			return;
		}
		this._rootWatchUpdates.deleteAndDispose(rootStr);
		const current = this._rootWatches.get(rootStr);
		if (current && equals(current.gitIgnoreExcludes, gitIgnoreExcludes)) {
			return;
		}
		const acquisition = this._fileMonitorService.acquire(repositoryRoot, () => this._onRootChanged(rootStr), {
			excludes: [...DEFAULT_AGENT_HOST_WATCH_EXCLUDES, ...gitIgnoreExcludes],
			debounceMs: 750,
		});
		if (!acquisition) {
			if (!current) {
				this._onRootWatchFailed(rootStr);
			}
			return;
		}
		// Replacing the entry disposes the current watcher only after the new one
		// is acquired, so the root never goes unwatched.
		this._rootWatches.set(rootStr, {
			repositoryRoot,
			gitIgnoreResource: joinPath(repositoryRoot, GIT_IGNORE_FILE_NAME),
			gitIgnoreExcludes,
			dispose: () => acquisition.dispose(),
		});
		if (current) {
			// The replaced watcher drops its pending debounce, which holds the `.gitignore` change itself.
			this._onRootChanged(rootStr);
		}
	}

	/**
	 * Marks the root's sessions for a retry on their next re-attach, which then
	 * re-resolves their roots instead of short-circuiting on the cached signature.
	 */
	private _onRootWatchFailed(rootStr: string): void {
		for (const session of this._rootSessions.get(rootStr) ?? []) {
			this._pendingWatchInterest.add(session);
			this._sessionWorkingDirectories.delete(session);
		}
	}

	private _onDidFilesChange(event: FileChangesEvent): void {
		for (const [rootStr, watch] of this._rootWatches) {
			if (event.contains(watch.gitIgnoreResource)) {
				this._updateRootWatcher(rootStr, watch.repositoryRoot);
			}
		}
	}

	/** Disposes a root's watcher and cancels its pending acquisition. */
	private _releaseRootWatcher(rootStr: string): void {
		this._rootWatchUpdates.deleteAndDispose(rootStr);
		this._rootWatches.deleteAndDispose(rootStr);
	}

	private async _markSessionActive(sessionStr: string): Promise<void> {
		this._removeActiveSession(sessionStr);
		this._pendingWatchInterest.delete(sessionStr);
		const repositoryRoots = await this._resolveActivityRepositoryRoots(sessionStr);
		if (repositoryRoots.length === 0) {
			this._unresolvedActiveSessions.add(sessionStr);
			this._releaseSessionRoots(sessionStr);
			return;
		}
		const rootStrs = new Set<string>();
		for (const repositoryRoot of repositoryRoots) {
			const rootStr = repositoryRoot.toString();
			rootStrs.add(rootStr);
			let activeSessions = this._rootActiveSessions.get(rootStr);
			if (!activeSessions) {
				activeSessions = new Set<string>();
				this._rootActiveSessions.set(rootStr, activeSessions);
			}
			activeSessions.add(sessionStr);
			this._rootUris.set(rootStr, repositoryRoot);
			this._releaseRootWatcher(rootStr);
		}
		this._activeSessionRoots.set(sessionStr, rootStrs);
		this._releaseSessionRoots(sessionStr);
	}

	private _markSessionInactive(sessionStr: string): void {
		const rootStrs = this._removeActiveSession(sessionStr);
		for (const rootStr of rootStrs) {
			const repositoryRoot = this._rootUris.get(rootStr);
			if (repositoryRoot) {
				this._ensureRootWatcher(rootStr, repositoryRoot);
			}
		}
		if (this._hasWatchInterest(sessionStr) || this._pendingWatchInterest.has(sessionStr)) {
			this._attachWatcherIfPossible(sessionStr);
		}
	}

	private _removeActiveSession(sessionStr: string): ReadonlySet<string> {
		this._unresolvedActiveSessions.delete(sessionStr);
		const rootStrs = this._activeSessionRoots.get(sessionStr);
		if (!rootStrs) {
			return new Set();
		}
		this._activeSessionRoots.delete(sessionStr);
		for (const rootStr of rootStrs) {
			const activeSessions = this._rootActiveSessions.get(rootStr);
			if (activeSessions) {
				activeSessions.delete(sessionStr);
				if (activeSessions.size === 0) {
					this._rootActiveSessions.delete(rootStr);
				}
			}
		}
		return rootStrs;
	}

	private async _resolveActivityRepositoryRoots(sessionStr: string): Promise<readonly URI[]> {
		const source = this._watchSources.get(sessionStr) ?? sessionStr;
		let workingDirectories = getEffectiveWorkingDirectories(this._stateManager, source);
		if (!workingDirectories?.length) {
			const parsedSubagent = parseSubagentSessionUri(source);
			workingDirectories = parsedSubagent
				? getEffectiveWorkingDirectories(this._stateManager, parsedSubagent.parentSession.toString())
				: undefined;
		}
		if (!workingDirectories?.length) {
			return [];
		}
		const workingDirectoryUris: URI[] = [];
		for (const workingDirectory of workingDirectories) {
			try {
				workingDirectoryUris.push(URI.parse(workingDirectory));
			} catch (err) {
				this._logService.warn(`[ChangesetFileMonitorCoordinator] Failed to parse active working directory URI for ${sessionStr}: ${workingDirectory}`, err);
			}
		}
		return (await resolveSessionRepositories(workingDirectoryUris, this._gitService)).gitRepositories;
	}
}
