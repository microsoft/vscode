/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IAgentSessionMetadata } from '../common/agentService.js';
import { buildBranchChangesetUri, ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { ChangesetFileMonitorCoordinator } from './agentHostChangesetFileMonitorCoordinator.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostChangesetService, META_CHANGESET_BRANCH, META_CHANGESET_SESSION, META_LEGACY_DIFFS } from '../common/agentHostChangesetService.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { isAhpChatChannel } from '../common/state/sessionState.js';

/**
 * Raw metadata blob values for the session DB, batch-read by the caller.
 * Keys are the changeset-specific metadata keys ({@link META_CHANGESET_BRANCH}
 * etc.); values are the raw `string | undefined` payloads as returned by
 * `ISessionDatabase.getMetadataObject`.
 */
export type IChangesetSessionMetadata = Record<string, string | undefined>;

/**
 * Coordinator that encapsulates all `AgentService`-side orchestration of
 * the changeset feature. Sits between `AgentService` (which owns session
 * lifecycle / subscription refcounting / batched DB reads) and
 * {@link IAgentHostChangesetService} (which owns compute / publish /
 * persist primitives).
 *
 * Owns only URI routing and forwards lifecycle signals. Subscription state is
 * recorded in the shared changeset subscription service. All computation,
 * working-directory gating, and the deferred-refresh state machine live in
 * {@link IAgentHostChangesetService}.
 *
 * No per-session controllers — the cross-cutting concerns (listSessions
 * overlay, subscribe URI routing) inherently span sessions, so a single
 * coordinator with internal maps is simpler than per-session RAII.
 */
export class AgentHostChangesetCoordinator extends Disposable {
	private readonly _changesetFileMonitor: ChangesetFileMonitorCoordinator;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChangesetOperationService private readonly _changesetOperationService: IAgentHostChangesetOperationService,
		@IAgentHostChangesetService private readonly _changesets: IAgentHostChangesetService,
		@IAgentHostChangesetSubscriptionService private readonly _changesetSubscriptions: IAgentHostChangesetSubscriptionService,
		@IAgentHostGitStateService gitStateService: IAgentHostGitStateService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._changesetFileMonitor = this._register(instantiationService.createInstance(ChangesetFileMonitorCoordinator));
		this._register(gitStateService.onDidRefreshSessionGitState(sessionStr => this.onDidRunSessionGitStateRefresh(sessionStr)));
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
		this._changesets.refreshChangesetCatalog(sessionStr);
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
		this._changesets.refreshChangesetCatalog(sessionStr);
		this._changesets.registerStaticChangesets(sessionStr);
		this._changesets.restorePersistedStaticChangesets(sessionStr, {
			branchRaw: metadata[META_CHANGESET_BRANCH],
			sessionRaw: metadata[META_CHANGESET_SESSION],
			legacyRaw: metadata[META_LEGACY_DIFFS],
		});
		// `addSubscriber`'s 0→1 trigger may have fired before the session
		// state existed; now that `summary.workingDirectory` is populated,
		// drain the deferred refresh.
		this._changesets.onWorkingDirectoryAvailable(sessionStr);
		this._changesetFileMonitor.onSessionRestored(sessionStr);
	}

	/**
	 * Called when a provisional session is materialized (working directory
	 * becomes known). Drains any static changeset refresh that was deferred
	 * because the working directory was not yet known.
	 */
	onSessionMaterialized(sessionStr: string): void {
		this._changesets.refreshChangesetCatalog(sessionStr);
		this._changesets.onWorkingDirectoryAvailable(sessionStr);

		this._changesetFileMonitor.onSessionMaterialized(sessionStr);
	}

	/**
	 * Called when a session is disposed. Forgets any pending refresh
	 * queued for that session.
	 */
	onSessionDisposed(sessionStr: string): void {
		this._changesets.onSessionDisposed(sessionStr);
		this._changesetFileMonitor.onSessionDisposed(sessionStr);

		this._changesetSubscriptions.clearSessionSubscriptions(sessionStr);
	}

	onSessionTurnActiveChanged(sessionStr: string, active: boolean): void {
		this._changesetFileMonitor.onSessionTurnActiveChanged(sessionStr, active);

		// Advertised operations are disabled while a turn is active so the
		// working tree / branch state can't be mutated mid-request; recompute
		// them whenever the active-turn state flips.
		this._changesetOperationService.updateOperations(sessionStr);
	}

	// ---- Subscription hooks -------------------------------------------------

	/**
	 * Called on every `addSubscriber` 0→1 transition. When `resource` is a
	 * static changeset URI, triggers the first git-diff refresh (the
	 * changeset service self-defers it when the working directory is not yet
	 * known).
	 *
	 * Both {@link AgentService.subscribe} and the handshake fast-path
	 * (`ProtocolServerHandler.initialSubscriptions`) call into
	 * `addSubscriber`, so this single hook covers both paths.
	 */
	onFirstSubscriber(resource: URI): void {
		const resourceStr = resource.toString();
		const parsed = parseChangesetUri(resourceStr);

		if (!parsed && !isAhpChatChannel(resourceStr) && this._stateManager.getSessionState(resourceStr)) {
			// For the session URI, we add a subscription for the branch
			// changeset since this is the changeset that is being used to
			// track the changes that are being used to calculate the diff
			// statistics for the session changes.
			this._addSubscription(resourceStr, buildBranchChangesetUri(resourceStr));
			this._changesets.refreshBranchChangeset(resourceStr);
			this._changesetFileMonitor.trackSessionChanges(resourceStr, resourceStr);

			return;
		}

		if (parsed?.kind === ChangesetKind.Branch) {
			this._addSubscription(parsed.sessionUri, resourceStr);
			this._changesets.refreshBranchChangeset(parsed.sessionUri);
			this._changesetFileMonitor.trackSessionChanges(resourceStr, parsed.sessionUri);
			return;
		}

		if (parsed?.kind === ChangesetKind.Uncommitted) {
			this._addSubscription(parsed.sessionUri, resourceStr);
			void this._changesets.computeUncommittedChangeset(parsed.sessionUri);
			this._changesetFileMonitor.trackSessionChanges(resourceStr, parsed.sessionUri);
			return;
		}

		if (parsed?.kind === ChangesetKind.Session) {
			this._addSubscription(parsed.sessionUri, resourceStr);
			this._changesets.refreshSessionChangeset(parsed.sessionUri);
			this._changesetFileMonitor.trackSessionChanges(resourceStr, parsed.sessionUri);
			return;
		}

		if (parsed?.kind === ChangesetKind.Turn && parsed.turnId !== undefined) {
			// Track the new subscriber so the service's per-turn recompute
			// gating starts including this turn. The initial snapshot is
			// already produced by `tryHandleSubscribe → computeTurnChangeset`;
			// subsequent deltas flow from `onToolCallEditsApplied` /
			// `onTurnComplete` once we've added this turn id here.
			this._addSubscription(parsed.sessionUri, resourceStr);
			return;
		}
	}

	/**
	 * Called when a resource's last subscriber drops. Removes the
	 * changeset from the session's subscription set so a later
	 * materialization / git-state recompute (driven by
	 * {@link IAgentHostChangesetService.recomputeSubscribedChangesets})
	 * naturally skips it — no explicit cancellation needed.
	 */
	onLastSubscriber(resource: URI): void {
		const resourceStr = resource.toString();
		const parsed = parseChangesetUri(resourceStr);
		if (parsed?.kind === ChangesetKind.Branch) {
			this._removeSubscription(parsed.sessionUri, resourceStr);
			this._changesetFileMonitor.untrackSessionChanges(resourceStr);
			return;
		}
		if (parsed?.kind === ChangesetKind.Uncommitted) {
			this._removeSubscription(parsed.sessionUri, resourceStr);
			this._changesetFileMonitor.untrackSessionChanges(resourceStr);
			return;
		}
		if (parsed?.kind === ChangesetKind.Session) {
			this._removeSubscription(parsed.sessionUri, resourceStr);
			this._changesetFileMonitor.untrackSessionChanges(resourceStr);
			return;
		}
		if (parsed?.kind === ChangesetKind.Turn && parsed.turnId !== undefined) {
			this._removeSubscription(parsed.sessionUri, resourceStr);
			return;
		}
		if (!parsed) {
			this._removeSubscription(resourceStr, resourceStr);
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

	private _addSubscription(sessionStr: string, changesetStr: string) {
		this._changesetSubscriptions.addSubscription(sessionStr, changesetStr);
	}

	private _removeSubscription(sessionStr: string, changesetStr: string) {
		this._changesetSubscriptions.removeSubscription(sessionStr, changesetStr);
	}

	// ---- listSessions overlay ----------------------------------------------

	/**
	 * Returns the session-DB metadata keys to merge into a batched read
	 * for `sessionStr`, OR `undefined` when live state already answers
	 * the aggregate-counts question. Delegates to the changeset service,
	 * which owns the live-vs-persisted decision.
	 */
	getListMetadataKeys(sessionStr: string): Record<string, true> | undefined {
		return this._changesets.getListMetadataKeys(sessionStr);
	}

	/**
	 * Decorates a single listSessions entry with the `changes` aggregate
	 * (additions / deletions / files for the session-wide changeset). The
	 * aggregate computation lives in the changeset service; the coordinator
	 * only projects the result onto the entry.
	 */
	decorateListEntry(entry: IAgentSessionMetadata, metadata: IChangesetSessionMetadata): IAgentSessionMetadata {
		const changes = this._changesets.computeListEntryChanges(entry.session.toString(), metadata);
		return changes ? { ...entry, changes } : entry;
	}

	// ---- Git state  events -------------------------------------------------

	/**
	 * Called when a session's Git state is refreshed.
	 */
	private onDidRunSessionGitStateRefresh(sessionStr: string): void {
		// Refresh the list of changesets for the session.
		this._changesets.refreshChangesetCatalog(sessionStr);

		// Git state has been refreshed so we need to recompute every
		// changeset currently subscribed for the session (the service
		// reads the exposed subscription list).
		this._changesets.recomputeSubscribedChangesets(sessionStr);
	}
}
