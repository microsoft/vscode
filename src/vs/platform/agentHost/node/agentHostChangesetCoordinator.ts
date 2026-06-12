/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IAgentSessionMetadata } from '../common/agentService.js';
import {
	buildSessionChangesetUri,
	ChangesetKind,
	parseChangesetUri,
} from '../common/changesetUri.js';
import { ChangesetStatus } from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { ChangesetFileMonitorCoordinator } from './agentHostChangesetFileMonitorCoordinator.js';
import { IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { IAgentHostGitService } from './agentHostGitService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { ILogService } from '../../log/common/log.js';
import {
	computeChangesSummaryFromLiveState,
	computeChangesSummaryFromPersistedDiffs,
	IAgentHostChangesetService,
	META_CHANGES_SUMMARY,
	META_CHANGESET_BRANCH,
	META_CHANGESET_SESSION,
	META_CHANGESET_UNCOMMITTED,
	META_LEGACY_DIFFS,
} from './agentHostChangesetService.js';
import { ChangesSummary } from '../common/state/protocol/state.js';

/**
 * Raw metadata blob values for the session DB, batch-read by the caller.
 * Keys are the changeset-specific metadata keys ({@link META_CHANGESET_UNCOMMITTED}
 * etc.); values are the raw `string | undefined` payloads as returned by
 * `ISessionDatabase.getMetadataObject`.
 */
export type IChangesetSessionMetadata = Record<string, string | undefined>;

/**
 * The set of session-DB metadata keys the coordinator needs in a batched
 * read. {@link AgentService} merges these into its own metadata key set
 * before calling `getMetadataObject` so the DB is hit exactly once per
 * session, then hands the result to {@link ChangesetSessionCoordinator}'s
 * apply methods.
 */
export const CHANGESET_DB_METADATA_KEYS: Record<string, true> = {
	[META_CHANGESET_BRANCH]: true,
	[META_CHANGESET_UNCOMMITTED]: true,
	[META_CHANGESET_SESSION]: true,
	[META_CHANGES_SUMMARY]: true,
	[META_LEGACY_DIFFS]: true,
};

/**
 * Coordinator that encapsulates all `AgentService`-side orchestration of
 * the changeset feature. Sits between `AgentService` (which owns session
 * lifecycle / subscription refcounting / batched DB reads) and
 * {@link IAgentHostChangesetService} (which owns compute / publish /
 * persist primitives).
 *
 * Owns the deferred static-refresh state machine — refreshes that fire
 * before the session's working directory is known are queued and drained
 * from {@link onSessionMaterialized} / {@link onSessionRestored}.
 *
 * No per-session controllers — the cross-cutting concerns (listSessions
 * overlay, subscribe URI routing) inherently span sessions, so a single
 * coordinator with internal maps is simpler than per-session RAII.
 */
export class ChangesetSessionCoordinator extends Disposable {

	/**
	 * Sessions that subscribed to their branch changeset before the
	 * working directory was known (provisional / not-yet-materialized
	 * sessions). Drained by {@link onSessionMaterialized} and
	 * {@link onSessionRestored} once the working directory is set.
	 */
	private readonly _pendingBranchRefreshes = new Set<string>();
	/**
	 * Sessions that subscribed to their uncommitted changeset before the
	 * working directory was known (provisional / not-yet-materialized
	 * sessions). Drained by {@link onSessionMaterialized} and
	 * {@link onSessionRestored} once the working directory is set.
	 */
	private readonly _pendingUncommittedRefreshes = new Set<string>();
	/**
	 * Sessions that subscribed to their session-wide branch changeset before
	 * the working directory was known. Drained alongside uncommitted refreshes
	 * once restore / materialization has populated the session summary.
	 */
	private readonly _pendingSessionRefreshes = new Set<string>();
	/** Sessions that currently have at least one uncommitted changeset subscriber. */
	private readonly _subscribedUncommittedSessions = new Set<string>();

	/**
	 * Per-session set of turn ids that have at least one live subscriber to
	 * `<sessionUri>/changeset/turn/<turnId>`. Drives the per-turn recompute
	 * gating: the changeset service only schedules a per-turn recompute when
	 * this set says someone is watching the turn URI (per-turn URIs have no
	 * catalogue chip aggregates, so recomputing for an unobserved turn is
	 * pure waste).
	 */
	private readonly _subscribedTurns = new Map<string, Set<string>>();
	private readonly _changesetFileMonitor: ChangesetFileMonitorCoordinator;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChangesetService private readonly _changesets: IAgentHostChangesetService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostFileMonitorService fileMonitorService: IAgentHostFileMonitorService,
		@IAgentHostGitService gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._changesetFileMonitor = this._register(new ChangesetFileMonitorCoordinator(this._stateManager, this._changesets, this._configurationService, fileMonitorService, gitService, this._logService));
		this._changesets.setTurnSubscriberProbe((session, turnId) => this.hasTurnSubscribers(session, turnId));
		this._changesets.setUncommittedSubscriberProbe(session => this.hasUncommittedSubscribers(session));
	}

	/**
	 * Returns `true` when at least one client is subscribed to
	 * `<session>/changeset/turn/<turnId>`. Consulted by the changeset
	 * service via the probe installed in the constructor.
	 */
	hasTurnSubscribers(session: string, turnId: string): boolean {
		return this._subscribedTurns.get(session)?.has(turnId) ?? false;
	}

	/**
	 * Returns `true` when at least one client is subscribed to
	 * `<session>/changeset/uncommitted`. Consulted by the changeset service
	 * before triggering uncommitted refresh work.
	 */
	hasUncommittedSubscribers(session: string): boolean {
		return this._subscribedUncommittedSessions.has(session);
	}

	// ---- Lifecycle hooks ----------------------------------------------------

	/**
	 * Called at session create time. Registers the static changeset URIs
	 * on the state manager so client subscriptions resolve to a
	 * `status: computing` snapshot before the first compute pass.
	 *
	 * The catalogue summary (`summary.changesets`) is seeded synchronously
	 * by `_buildInitialSummary` in {@link AgentService} via
	 * {@link buildDefaultChangesetCatalogue}; this method only registers
	 * the backing per-changeset state. Both halves run before
	 * `SessionReady` is dispatched.
	 */
	onSessionCreated(sessionStr: string): void {
		this._changesets.registerStaticChangesets(sessionStr);
	}

	/**
	 * Called at session restore time. Registers the static changeset URIs
	 * and reseeds them from any persisted blobs already read from the DB.
	 * `metadata` must come from the same batched `getMetadataObject` call
	 * `AgentService` already issues for title / read / archive / config
	 * keys.
	 */
	onSessionRestored(sessionStr: string, metadata: IChangesetSessionMetadata): void {
		this._changesets.registerStaticChangesets(sessionStr);
		this._changesets.restorePersistedStaticChangesets(sessionStr, {
			branchRaw: metadata[META_CHANGESET_BRANCH],
			uncommittedRaw: metadata[META_CHANGESET_UNCOMMITTED],
			sessionRaw: metadata[META_CHANGESET_SESSION],
			legacyRaw: metadata[META_LEGACY_DIFFS],
		});
		// `addSubscriber`'s 0→1 trigger may have fired before the session
		// state existed; now that `summary.workingDirectory` is populated,
		// drain the deferred refresh. Idempotent — the per-session
		// sequencer collapses overlapping computes.
		this._drainPendingRefresh(sessionStr);
		this._changesetFileMonitor.onSessionRestored(sessionStr);
	}

	/**
	 * Called when a provisional session is materialized (working directory
	 * becomes known). Drains any static changeset refresh that was deferred
	 * because the working directory was not yet known.
	 */
	onSessionMaterialized(sessionStr: string): void {
		this._drainPendingRefresh(sessionStr);
		this._changesetFileMonitor.onSessionMaterialized(sessionStr);
	}

	/**
	 * Called after `_meta.git` is attached or updated. Git state can provide
	 * the base branch used by Branch Changes and fresh uncommitted counts, so
	 * refresh both static changesets once the session has a working directory.
	 */
	onSessionGitStateChanged(sessionStr: string): void {
		this._logService.debug(`[ChangesetSessionCoordinator] Git state changed for ${sessionStr}; refreshing static changesets. hasWorkingDirectory=${!!this._configurationService.getEffectiveWorkingDirectory(sessionStr)}`);
		this._triggerSessionRefresh(sessionStr);
		this._triggerUncommittedRefresh(sessionStr);
	}

	/**
	 * Called when a session is disposed. Forgets any pending refresh
	 * queued for that session.
	 */
	onSessionDisposed(sessionStr: string): void {
		this._pendingBranchRefreshes.delete(sessionStr);
		this._pendingUncommittedRefreshes.delete(sessionStr);
		this._pendingSessionRefreshes.delete(sessionStr);
		this._subscribedUncommittedSessions.delete(sessionStr);
		this._subscribedTurns.delete(sessionStr);
		this._changesetFileMonitor.onSessionDisposed(sessionStr);
	}

	onSessionTurnActiveChanged(sessionStr: string, active: boolean): void {
		this._changesetFileMonitor.onSessionTurnActiveChanged(sessionStr, active);
	}

	// ---- Subscription hooks -------------------------------------------------

	/**
	 * Called on every `addSubscriber` 0→1 transition. When `resource` is a
	 * static changeset URI, triggers the first git-diff refresh (or queues
	 * it for later if the working directory is not yet known).
	 *
	 * Both {@link AgentService.subscribe} and the handshake fast-path
	 * (`ProtocolServerHandler.initialSubscriptions`) call into
	 * `addSubscriber`, so this single hook covers both paths.
	 */
	onFirstSubscriber(resource: URI): void {
		const resourceStr = resource.toString();
		const parsed = parseChangesetUri(resourceStr);
		if (parsed?.kind === ChangesetKind.Branch) {
			this._triggerBranchRefresh(parsed.sessionUri);
			this._changesetFileMonitor.trackSessionChanges(resourceStr, parsed.sessionUri);
			return;
		}
		if (parsed?.kind === ChangesetKind.Uncommitted) {
			this._subscribedUncommittedSessions.add(parsed.sessionUri);
			this._triggerUncommittedRefresh(parsed.sessionUri);
			this._changesetFileMonitor.trackSessionChanges(resourceStr, parsed.sessionUri);
			return;
		}
		if (parsed?.kind === ChangesetKind.Session) {
			this._triggerSessionRefresh(parsed.sessionUri);
			this._changesetFileMonitor.trackSessionChanges(resourceStr, parsed.sessionUri);
			return;
		}
		if (parsed?.kind === ChangesetKind.Turn && parsed.turnId !== undefined) {
			// Track the new subscriber so the service's per-turn recompute
			// gating starts including this turn. The initial snapshot is
			// already produced by `tryHandleSubscribe → computeTurnChangeset`;
			// subsequent deltas flow from `onToolCallEditsApplied` /
			// `onTurnComplete` once we've added this turn id here.
			let set = this._subscribedTurns.get(parsed.sessionUri);
			if (!set) {
				set = new Set();
				this._subscribedTurns.set(parsed.sessionUri, set);
			}
			set.add(parsed.turnId);
			return;
		}
		if (!parsed && this._stateManager.getSessionState(resourceStr)) {
			// Plain session-URI subscription (Agents Window list / detail
			// observing the session). Refresh both static changesets so
			// the catalogue chip doesn't show a stale value just because
			// no turn has run since process start, no one ever subscribed
			// to the session / branch changeset URIs directly, and the user
			// has been editing files manually in the working tree.
			this._triggerBranchRefresh(resourceStr);
			this._triggerSessionRefresh(resourceStr);
			this._changesetFileMonitor.trackSessionChanges(resourceStr, resourceStr);
		}
	}

	/**
	 * Called when a resource's last subscriber drops. Cleans up any
	 * deferred refresh queued for that session — if no one is subscribed anymore,
	 * there's no point firing it on materialize.
	 */
	onLastSubscriber(resource: URI): void {
		const resourceStr = resource.toString();
		const parsed = parseChangesetUri(resourceStr);
		if (parsed?.kind === ChangesetKind.Branch) {
			this._pendingBranchRefreshes.delete(parsed.sessionUri);
			this._changesetFileMonitor.untrackSessionChanges(resourceStr);
			return;
		}
		if (parsed?.kind === ChangesetKind.Uncommitted) {
			this._pendingUncommittedRefreshes.delete(parsed.sessionUri);
			this._subscribedUncommittedSessions.delete(parsed.sessionUri);
			this._changesetFileMonitor.untrackSessionChanges(resourceStr);
			return;
		}
		if (parsed?.kind === ChangesetKind.Session) {
			this._pendingSessionRefreshes.delete(parsed.sessionUri);
			this._changesetFileMonitor.untrackSessionChanges(resourceStr);
			return;
		}
		if (parsed?.kind === ChangesetKind.Turn && parsed.turnId !== undefined) {
			const set = this._subscribedTurns.get(parsed.sessionUri);
			if (set) {
				set.delete(parsed.turnId);
				if (set.size === 0) {
					this._subscribedTurns.delete(parsed.sessionUri);
				}
			}
		}
		if (!parsed) {
			this._changesetFileMonitor.untrackSessionChanges(resourceStr);
		}
	}

	/**
	 * Restores the parent session when `resource` is a changeset URI and the
	 * parent session is not already live. Non-changeset URIs are ignored.
	 *
	 * This is intentionally narrower than {@link tryHandleSubscribe}: it does
	 * not compute per-turn / compare changesets and does not register static
	 * changesets. It exists for the AgentService subscribe path where
	 * `addSubscriber` may have already created a placeholder changeset snapshot
	 * before the parent session restore had a chance to apply persisted diffs.
	 */
	async restoreSessionIfChangesetSubscription(resource: URI, restoreSession: (session: URI) => Promise<void>): Promise<void> {
		const resourceStr = resource.toString();
		const parsed = parseChangesetUri(resourceStr);
		if (!parsed) {
			return;
		}
		if (parsed.kind === ChangesetKind.Unknown) {
			throw new Error(`Cannot subscribe to unknown changeset resource: ${resourceStr}`);
		}
		if (!this._stateManager.getSessionState(parsed.sessionUri)) {
			await restoreSession(URI.parse(parsed.sessionUri));
		}
	}

	/**
	 * If `resource` is a known changeset URI (uncommitted / session /
	 * turn), seeds its state on the state manager and returns `true`.
	 * Returns `false` for non-changeset URIs so callers fall through to
	 * their default routing (session / subagent / terminal).
	 *
	 * The parent session is restored via the provided `restoreSession`
	 * callback when no live state exists yet — this matches the previous
	 * inline behaviour in `AgentService.subscribe`.
	 *
	 * Throws when the URI matches the changeset shape but the id is not
	 * a well-known kind ({@link ChangesetKind.Unknown}). The unknown-id
	 * rejection MUST fire before any parent-session restore so subscribing
	 * to a bogus child URI cannot materialize the parent as a side effect.
	 */
	async tryHandleSubscribe(resource: URI, restoreSession: (session: URI) => Promise<void>): Promise<boolean> {
		const resourceStr = resource.toString();
		const parsed = parseChangesetUri(resourceStr);
		if (!parsed) {
			return false;
		}
		if (parsed.kind === ChangesetKind.Unknown) {
			throw new Error(`Cannot subscribe to unknown changeset resource: ${resourceStr}`);
		}
		await this.restoreSessionIfChangesetSubscription(resource, restoreSession);
		if (parsed.kind === ChangesetKind.Turn && parsed.turnId) {
			await this._changesets.computeTurnChangeset(parsed.sessionUri, parsed.turnId);
		} else if (parsed.kind === ChangesetKind.Compare && parsed.originalTurnId && parsed.modifiedTurnId) {
			// Compare-turns is computed once on subscribe. Both turns are
			// typically historical so the snapshot doesn't need to track
			// live edits; `onFirstSubscriber` / `onLastSubscriber` do not
			// need to participate.
			await this._changesets.computeCompareTurnsChangeset(parsed.sessionUri, parsed.originalTurnId, parsed.modifiedTurnId);
		} else {
			// Static changesets are seeded by `onSessionRestored` /
			// `onSessionCreated`. Re-register defensively in case the
			// session was created in this process before the coordinator
			// existed. The uncommitted refresh itself is fired from
			// {@link onFirstSubscriber} on the 0→1 path.
			this._changesets.registerStaticChangesets(parsed.sessionUri);
		}
		return true;
	}

	// ---- listSessions overlay ----------------------------------------------

	/**
	 * Returns the session-DB metadata keys to merge into a batched read
	 * for `sessionStr`, OR `undefined` when live state already answers
	 * the aggregate-counts question (so the caller can skip loading the
	 * potentially-large persisted diff blobs).
	 *
	 * Returning `undefined` is the fast path: a live `summary.changes`
	 * (loaded session) or a ready live `changeKind: 'session'` changeset
	 * state (registered but not-yet-restored session) is authoritative.
	 */
	getListMetadataKeys(sessionStr: string): Record<string, true> | undefined {
		const liveSummaryChanges = this._stateManager.getSessionState(sessionStr)?.summary.changes;
		if (liveSummaryChanges) {
			return undefined;
		}
		const liveSession = this._stateManager.getChangesetState(buildSessionChangesetUri(sessionStr));
		if (liveSession?.status === ChangesetStatus.Ready) {
			return undefined;
		}
		return CHANGESET_DB_METADATA_KEYS;
	}

	/**
	 * Decorates a single listSessions entry with the `changes` aggregate
	 * (additions / deletions / files for the session-wide changeset).
	 * `metadata` is the already-batched DB read; if it lacks the
	 * changeset keys (because {@link getListMetadataKeys} returned
	 * `undefined`), this method falls through to synthesising the
	 * aggregate from live state.
	 *
	 * Precedence: live `summary.changes` (already projected onto `entry`
	 * by the caller for loaded sessions) > ready live
	 * `changeKind: 'session'` changeset state > parsed persisted
	 * session-wide diff blob > undefined (no aggregate advertised).
	 * The catalogue itself is uniform across sessions and is not part of
	 * the listSessions overlay — it is seeded on `state.changesets` once
	 * at session creation.
	 */
	decorateListEntry(entry: IAgentSessionMetadata, metadata: IChangesetSessionMetadata): IAgentSessionMetadata {
		const sessionStr = entry.session.toString();

		// Loaded session: the caller has already projected
		// `state.summary.changes` onto the entry. Nothing to
		// overlay.
		if (this._stateManager.getSessionState(sessionStr)) {
			return entry;
		}

		// Check if the metadata contains the changes summary. In the past we
		// used to store the changesets in the session database but we have
		// since moved to a more efficient storage mechanism by only storing
		// the changes summary.
		const changesSummary = metadata[META_CHANGES_SUMMARY];
		if (changesSummary !== undefined) {
			let changes: ChangesSummary | undefined;
			try {
				changes = JSON.parse(changesSummary);
			} catch (error) { }

			return { ...entry, changes };
		}

		// Read live state for an unopened session: synthesise the aggregate
		// from the live `changeKind: 'session'` changeset state. Counts stay
		// in lockstep with the actual changeset state for the session-list
		// chip.
		const liveSession = this._stateManager.getChangesetState(buildSessionChangesetUri(sessionStr));
		const liveChanges = computeChangesSummaryFromLiveState(liveSession);
		if (liveChanges) {
			// Migrate the changes summary to the new storage mechanism.
			this._changesets.persistChangesSummary(sessionStr, liveChanges);
			return { ...entry, changes: liveChanges };
		}

		// No live source — try persisted blobs (if the caller batched them).
		const sessionRaw = metadata[META_CHANGESET_SESSION];
		const legacyRaw = metadata[META_LEGACY_DIFFS];
		if (sessionRaw === undefined && legacyRaw === undefined) {
			return entry;
		}
		const restored = this._changesets.parsePersistedStaticChangesets(sessionStr, { sessionRaw, legacyRaw });

		// `listSessions` must not seed full changeset state for every row;
		// it only parses persisted blobs enough to render the chip aggregate.
		// Once the session is opened via `restoreSession`, the live overlay in
		// `AgentService.listSessions` replaces this parse-only aggregate.
		const persistedChanges = computeChangesSummaryFromPersistedDiffs(restored.session);
		if (persistedChanges) {
			// Migrate the changes summary to the new storage mechanism.
			this._changesets.persistChangesSummary(sessionStr, persistedChanges);
			return { ...entry, changes: persistedChanges };
		}

		return entry;
	}

	// ---- Internal -----------------------------------------------------------

	private _triggerBranchRefresh(sessionStr: string): void {
		const wd = this._configurationService.getEffectiveWorkingDirectory(sessionStr);
		if (!wd) {
			this._pendingBranchRefreshes.add(sessionStr);
			return;
		}
		this._changesets.refreshBranchChangeset(sessionStr);
	}

	/**
	 * Triggers the first uncommitted refresh for `sessionStr`, deferring
	 * it until materialization when the working directory is not yet
	 * known.
	 *
	 * Firing the refresh before the session is materialized would compute
	 * against a missing working directory, the git path would bail, and
	 * the edit-tracker fallback would silently rebrand SDK-tracked edits
	 * as `git status` output. Deferring keeps that whole class of bug
	 * closed.
	 */
	private _triggerUncommittedRefresh(sessionStr: string): void {
		const wd = this._configurationService.getEffectiveWorkingDirectory(sessionStr);
		if (!wd) {
			this._pendingUncommittedRefreshes.add(sessionStr);
			return;
		}
		this._changesets.refreshUncommittedChangeset(sessionStr);
	}

	private _triggerSessionRefresh(sessionStr: string): void {
		const wd = this._configurationService.getEffectiveWorkingDirectory(sessionStr);
		if (!wd) {
			this._pendingSessionRefreshes.add(sessionStr);
			return;
		}
		this._changesets.refreshSessionChangeset(sessionStr);
	}

	private _drainPendingRefresh(sessionStr: string): void {
		if (this._pendingBranchRefreshes.delete(sessionStr)) {
			this._triggerBranchRefresh(sessionStr);
		}
		if (this._pendingUncommittedRefreshes.delete(sessionStr)) {
			this._triggerUncommittedRefresh(sessionStr);
		}
		if (this._pendingSessionRefreshes.delete(sessionStr)) {
			this._triggerSessionRefresh(sessionStr);
		}
	}
}
