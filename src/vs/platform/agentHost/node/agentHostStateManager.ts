/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { ILogService } from '../../log/common/log.js';
import { TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { ActionType, ActionEnvelope, ActionOrigin, INotification, IRootConfigChangedAction, SessionAction, RootAction, StateAction, TerminalAction, ChangesetAction, isRootAction, isSessionAction, isChangesetAction } from '../common/state/sessionActions.js';
import type { IStateSnapshot } from '../common/state/sessionProtocol.js';
import { rootReducer, sessionReducer, changesetReducer } from '../common/state/sessionReducers.js';
import { createRootState, createSessionState, isAhpRootChannel, SessionLifecycle, withHostBuildInfo, type ChangesetState, type ChangesetSummary, type IHostBuildInfo, type RootState, type SessionMeta, type SessionState, type SessionSummary, type Turn, type URI, ROOT_STATE_URI, ChangesetStatus } from '../common/state/sessionState.js';
import { AgentHostTelemetryLevelConfigKey, IPermissionsValue, platformRootSchema, telemetryLevelToAgentHostConfigValue } from '../common/agentHostSchema.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { AgentHostChangesetStateCache, type IAgentHostChangesetStateRetentionOptions } from './agentHostChangesetStateCache.js';

export interface IAgentHostStateManagerOptions {
	readonly changesetStateRetention?: IAgentHostChangesetStateRetentionOptions;
	/**
	 * Build information about the program hosting the agent host. When
	 * provided, it is published on {@link RootState._meta} so clients can see
	 * which build is hosting them.
	 */
	readonly hostBuildInfo?: IHostBuildInfo;
}

/**
 * Field-level equality for two changeset catalogue arrays. Used by
 * {@link AgentHostStateManager.setSessionChangesets} to skip a redundant
 * dispatch when the catalogue has not changed in any user-visible way.
 */
function changesetCataloguesEqual(a: readonly ChangesetSummary[] | undefined, b: readonly ChangesetSummary[] | undefined): boolean {
	if (a === b) { return true; }
	if (!a || !b) { return false; }
	if (a.length !== b.length) { return false; }
	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		const y = b[i];
		if (x.label !== y.label
			|| x.uriTemplate !== y.uriTemplate
			|| x.description !== y.description
			|| x.additions !== y.additions
			|| x.deletions !== y.deletions
			|| x.files !== y.files) {
			return false;
		}
	}
	return true;
}

/**
 * Server-side state manager for the sessions process protocol.
 *
 * Maintains the authoritative state tree (root + per-session), applies actions
 * through pure reducers, assigns monotonic sequence numbers, and emits
 * {@link ActionEnvelope}s for subscribed clients.
 */
export class AgentHostStateManager extends Disposable {

	private _serverSeq = 0;

	private _rootState: RootState;
	private readonly _sessionStates = new Map<string, SessionState>();

	/** Expanded changeset states, separated from protocol sequencing so cache policy stays local. */
	private readonly _changesets: AgentHostChangesetStateCache;

	/**
	 * Sessions whose authoritative state has an active turn. Derived from
	 * `state.activeTurn` (the source of truth maintained by the session
	 * reducer) — never from raw action turn-ids — so that mismatched or
	 * out-of-order turn lifecycle actions can't desync the count from
	 * reality. Drives `RootActiveSessionsChanged` and `hasActiveSessions`,
	 * which together gate `--enable-remote-auto-shutdown`.
	 */
	private readonly _sessionsWithActiveTurn = new Set<string>();

	/** Last summary sent to clients (via sessionAdded or sessionSummaryChanged). */
	private readonly _lastNotifiedSummaries = new Map<string, SessionSummary>();

	/** Sessions whose summary changed since the last flush. */
	private readonly _dirtySummaries = new Set<string>();
	private readonly _summaryNotifyScheduler = this._register(new RunOnceScheduler(() => this._flushSummaryNotifications(), 100));

	private readonly _onDidEmitEnvelope = this._register(new Emitter<ActionEnvelope>());
	readonly onDidEmitEnvelope: Event<ActionEnvelope> = this._onDidEmitEnvelope.event;

	private readonly _onDidEmitNotification = this._register(new Emitter<INotification>());
	readonly onDidEmitNotification: Event<INotification> = this._onDidEmitNotification.event;
	private readonly _onDidChangeSessionActiveTurn = this._register(new Emitter<{ session: string; active: boolean }>());
	readonly onDidChangeSessionActiveTurn: Event<{ session: string; active: boolean }> = this._onDidChangeSessionActiveTurn.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
		options: IAgentHostStateManagerOptions = {},
	) {
		super();
		this._changesets = new AgentHostChangesetStateCache(options.changesetStateRetention);
		this._rootState = createRootState();
		// Seed the host-level configuration schema + default values so that
		// RootConfigChanged actions can merge into it, and clients see the
		// schema immediately upon subscribing to `agenthost:/root`. See
		// `platformRootSchema` for the set of platform-owned properties.
		this._rootState = {
			...this._rootState,
			config: {
				schema: platformRootSchema.toProtocol(),
				values: platformRootSchema.validateOrDefault({}, {
					[SessionConfigKey.Permissions]: { allow: [], deny: [] } satisfies IPermissionsValue,
					[AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.USAGE),
				}),
			},
			_meta: withHostBuildInfo(this._rootState._meta, options.hostBuildInfo),
		};
	}
	private readonly _log = (msg: string) => this._logService.warn(`[AgentHostStateManager] ${msg}`);

	get hasActiveSessions(): boolean {
		return this._sessionsWithActiveTurn.size > 0;
	}

	// ---- State accessors ----------------------------------------------------

	get rootState(): RootState {
		return this._rootState;
	}

	getSessionState(session: URI): SessionState | undefined {
		return this._sessionStates.get(session);
	}

	get serverSeq(): number {
		return this._serverSeq;
	}

	getSessionUris(): string[] {
		return [...this._sessionStates.keys()];
	}

	getAnnouncedSessionSummaries(): SessionSummary[] {
		return [...this._lastNotifiedSummaries.values()];
	}

	/**
	 * Returns all session URIs whose keys start with the given prefix.
	 * Used to discover subagent sessions for a given parent.
	 */
	getSessionUrisWithPrefix(prefix: string): string[] {
		const result: string[] = [];
		for (const key of this._sessionStates.keys()) {
			if (key.startsWith(prefix)) {
				result.push(key);
			}
		}
		return result;
	}

	// ---- Snapshots ----------------------------------------------------------

	/**
	 * Returns a state snapshot for a given resource URI.
	 * The `fromSeq` in the snapshot is the current serverSeq at snapshot time;
	 * the client should process subsequent envelopes with serverSeq > fromSeq.
	 */
	getSnapshot(resource: URI): IStateSnapshot | undefined {
		if (isAhpRootChannel(resource)) {
			return {
				resource: ROOT_STATE_URI,
				state: this._rootState,
				fromSeq: this._serverSeq,
			};
		}

		// Changeset URIs are nested under their session URI; check them
		// before falling back to the session map so a session whose URI
		// happens to share a prefix with a changeset never collides.
		const changesetState = this._changesets.get(resource);
		if (changesetState) {
			return {
				resource,
				state: changesetState,
				fromSeq: this._serverSeq,
			};
		}

		const sessionState = this._sessionStates.get(resource);
		if (!sessionState) {
			return undefined;
		}

		return {
			resource,
			state: sessionState,
			fromSeq: this._serverSeq,
		};
	}

	/** Read-only accessor for callers that only need to inspect a changeset (not subscribe). */
	getChangesetState(changeset: URI): ChangesetState | undefined {
		return this._changesets.get(changeset);
	}

	/** Reconsiders changeset state retention after subscribers or computes release their pins. */
	onChangesetLivenessChanged(): void {
		this._changesets.trimEvictableEntries();
	}

	// ---- Session lifecycle --------------------------------------------------

	/**
	 * Creates a new session in state with `lifecycle: 'creating'`.
	 * Returns the initial session state.
	 *
	 * By default a {@link NotificationType.SessionAdded} notification is
	 * emitted so clients see the new session immediately. Pass
	 * `options.emitNotification: false` to defer the notification — a typical
	 * use is for **provisional** sessions that exist on the server but should
	 * not appear in client session lists until they have been persisted by
	 * the agent (e.g. on the first message that materializes an SDK session
	 * and writes its on-disk metadata). Call {@link markSessionPersisted}
	 * afterwards to fire the deferred notification.
	 */
	createSession(summary: SessionSummary, options?: { readonly emitNotification?: boolean }): SessionState {
		const key = summary.resource;
		if (this._sessionStates.has(key)) {
			this._logService.warn(`[AgentHostStateManager] Session already exists: ${key}`);
			return this._sessionStates.get(key)!;
		}

		const state = createSessionState(summary);
		this._sessionStates.set(key, state);

		this._logService.trace(`[AgentHostStateManager] Created session: ${key}`);

		if (options?.emitNotification !== false) {
			// Recording the summary in `_lastNotifiedSummaries` is what makes
			// `_flushSummaryNotifications` later emit incremental updates and
			// what makes `markSessionPersisted` a no-op. Provisional sessions
			// intentionally skip both until they are persisted.
			this._lastNotifiedSummaries.set(key, summary);
			this._onDidEmitNotification.fire({
				type: 'root/sessionAdded',
				channel: ROOT_STATE_URI,
				summary,
			});
		}

		return state;
	}

	/**
	 * Fire a {@link NotificationType.SessionAdded} notification for a session
	 * whose creation was deferred via `createSession({ emitNotification: false })`.
	 *
	 * Atomically writes the supplied summary into `state.summary` so
	 * subscribers reading state directly stay consistent with what was
	 * announced. No-ops for sessions that were already announced
	 * (idempotent).
	 */
	markSessionPersisted(session: URI, summary: SessionSummary): void {
		const key = session.toString();
		const state = this._sessionStates.get(key);
		if (!state) {
			this._logService.warn(`[AgentHostStateManager] markSessionPersisted: unknown session ${key}`);
			return;
		}
		// `_lastNotifiedSummaries` is set whenever a session has been announced
		// to clients (either through `createSession` or here); using it as the
		// idempotency check keeps us from firing `SessionAdded` twice for a
		// session whose creation was not deferred.
		if (this._lastNotifiedSummaries.has(key)) {
			return;
		}
		// Update the in-memory summary so subscribers calling
		// `getSessionState` see the same fields the notification carries.
		// We don't need to schedule a `SessionSummaryChanged` flush because
		// the upcoming `SessionAdded` notification carries the complete
		// summary already.
		state.summary = summary;
		this._lastNotifiedSummaries.set(key, summary);
		this._onDidEmitNotification.fire({
			type: 'root/sessionAdded',
			channel: ROOT_STATE_URI,
			summary,
		});
	}

	/**
	 * Restores a session from a previous server lifetime into the state manager
	 * with pre-populated turns. The session is created in `ready` lifecycle
	 * state since it already exists on the backend.
	 *
	 * Unlike {@link createSession}, this does NOT emit a `sessionAdded`
	 * notification because the session is already known to clients via
	 * `listSessions`.
	 */
	restoreSession(summary: SessionSummary, turns: Turn[]): SessionState {
		const key = summary.resource;
		if (this._sessionStates.has(key)) {
			this._logService.warn(`[AgentHostStateManager] Session already exists (restore): ${key}`);
			return this._sessionStates.get(key)!;
		}

		const state: SessionState = {
			...createSessionState(summary),
			lifecycle: SessionLifecycle.Ready,
			turns,
		};
		this._sessionStates.set(key, state);
		this._lastNotifiedSummaries.set(key, summary);

		this._logService.trace(`[AgentHostStateManager] Restored session: ${key} (${turns.length} turns)`);

		return state;
	}

	/**
	 * Removes a session from in-memory state without emitting a
	 * {@link NotificationType.SessionRemoved} notification.
	 * Use {@link deleteSession} when the session is being permanently deleted
	 * and clients need to be notified of its removal.
	 *
	 * Any pending summary change is flushed synchronously before the session is
	 * torn down, so clients receive the final status (e.g. Idle after a turn
	 * completes) even when the session is evicted before the scheduler fires.
	 * A {@link NotificationType.SessionSummaryChanged} notification may therefore
	 * be emitted as a side-effect of this call.
	 *
	 * Per-session changesets are intentionally NOT torn down here: this method
	 * is also used as an idle-eviction (LRU) hook (see
	 * `AgentService._maybeEvictIdleSession`) and the session list view keeps a
	 * changeset subscription open per visible row to render the diff chip.
	 * Tearing down on eviction would clear the chip on the list while the row
	 * is still on screen. Permanent-delete paths (`deleteSession`,
	 * `removeSubagentSessions`) call `disposeSessionChangesets` explicitly
	 * before invoking `removeSession`.
	 */
	removeSession(session: URI): void {
		const state = this._sessionStates.get(session);
		if (!state) {
			return;
		}

		// Flush any pending summary notification before tearing down state so
		// that the final status (e.g. Idle) reaches clients even if the session
		// is evicted within the scheduler's debounce window.
		if (this._dirtySummaries.has(session)) {
			this._flushSummaryNotificationFor(session);
		}

		// Clean up active turn tracking. We must dispatch
		// `RootActiveSessionsChanged` if the count actually changes so that
		// downstream consumers (e.g. the server lifetime tracker driving
		// `--enable-remote-auto-shutdown`) release their hold on the process.
		// Without this, evicting a session that still has an active turn
		// silently strands the active-sessions count above zero forever.
		if (this._sessionsWithActiveTurn.delete(session)) {
			this._onDidChangeSessionActiveTurn.fire({ session, active: false });
			this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
		}

		this._sessionStates.delete(session);
		this._lastNotifiedSummaries.delete(session);
		this._dirtySummaries.delete(session);
		this._logService.trace(`[AgentHostStateManager] Removed session: ${session}`);
	}

	/**
	 * Permanently deletes a session from state and emits a
	 * {@link NotificationType.SessionRemoved} notification so that clients
	 * know the session is no longer accessible.
	 *
	 * Sessions whose creation was deferred via
	 * `createSession({ emitNotification: false })` and never persisted via
	 * {@link markSessionPersisted} are removed silently — no client knows
	 * about them, so a `SessionRemoved` would be noise (or worse, would
	 * cause clients to drop a session URI they had eagerly subscribed to).
	 */
	deleteSession(session: URI): void {
		const wasAnnounced = this._lastNotifiedSummaries.has(session);
		// Drop any pending summary diff: the forthcoming SessionRemoved notification
		// supersedes it and we don't want to emit spurious SessionSummaryChanged
		// events just before the session disappears from the client's view.
		this._dirtySummaries.delete(session);
		// Tear down per-session changesets first so subscribers see the
		// final `changeset/cleared` envelope before the session itself goes
		// away. The envelopes flow through the same emitter as everything
		// else, so callers observing `onDidEmitEnvelope` get a deterministic
		// order: changeset/cleared (per changeset) → session removal.
		this.disposeSessionChangesets(session);
		this.removeSession(session);
		if (wasAnnounced) {
			this._onDidEmitNotification.fire({
				type: 'root/sessionRemoved',
				channel: ROOT_STATE_URI,
				session,
			});
		}
	}

	// ---- Session meta -------------------------------------------------------

	/**
	 * Replaces `state._meta` on a session by dispatching a
	 * {@link ActionType.SessionMetaChanged} action so the change flows
	 * through the action envelope (and thus to all live subscribers).
	 *
	 * The full `_meta` object is replaced (not merged) so callers stay in
	 * control of the convention for their own keys; use the `withSessionXxx`
	 * helpers in `sessionState.ts` to combine slots.
	 */
	setSessionMeta(session: URI, meta: SessionMeta | undefined): void {
		this.dispatchServerAction(session, { type: ActionType.SessionMetaChanged, _meta: meta });
	}

	// ---- Changeset registry -------------------------------------------------

	/**
	 * Registers a server-side changeset so that subscribers can attach to its
	 * URI. The changeset is created with the supplied initial status (default
	 * {@link ChangesetStatus.Computing}); subsequent file/operation/status
	 * mutations flow through {@link dispatchChangesetAction} on the
	 * canonical `<sessionUri>/changeset/<changesetId>` URI.
	 *
	 * Idempotent: a second call with the same URI is a no-op so producers
	 * can safely re-register on session resume without double-creating
	 * state.
	 *
	 * Callers construct `changesetUri` via {@link buildSessionChangesetUri}
	 * for the session-wide entry, or {@link buildChangesetUri} for any
	 * other catalogue entry.
	 *
	 * Returns the supplied changeset URI for caller convenience.
	 */
	registerChangeset(changesetUri: URI, initialStatus: ChangesetStatus = ChangesetStatus.Computing): URI {
		this._changesets.register(changesetUri, initialStatus);
		return changesetUri;
	}

	/**
	 * Replaces the catalogue entries on `summary.changesets` for `session`
	 * by dispatching a {@link ActionType.SessionChangesetsChanged} action.
	 * The change is applied through the session reducer so subscribers see
	 * the mutation in the standard action stream alongside the regular
	 * `notify/sessionSummaryChanged` notification — the catalogue is not
	 * its own subscribable resource.
	 *
	 * Producers call this after each compute pass to keep the lightweight
	 * chip-row counts (`additions`, `deletions`, `files`) in sync without
	 * forcing every observer to subscribe to the full changeset.
	 */
	setSessionChangesets(session: URI, changesets: readonly ChangesetSummary[] | undefined): void {
		const state = this._sessionStates.get(session);
		if (!state) {
			this._logService.warn(`[AgentHostStateManager] setSessionChangesets: unknown session ${session}`);
			return;
		}
		// Skip dispatch when the catalogue is field-equal to the existing
		// one. The reducer would otherwise allocate a new summary on every
		// call, dirtying `_dirtySummaries` and broadcasting a redundant
		// envelope. Producers call this after every compute pass, so
		// duplicate calls are common.
		if (changesetCataloguesEqual(state.summary.changesets, changesets)) {
			return;
		}
		// Take a defensive copy so callers can't mutate the catalogue array
		// after dispatch; the reducer otherwise stores the reference as-is.
		const next: ChangesetSummary[] | undefined = changesets ? [...changesets] : undefined;
		this.dispatchServerAction(session, {
			type: ActionType.SessionChangesetsChanged,
			changesets: next,
		});
	}

	/**
	 * Tear down a changeset. Dispatches {@link ActionType.ChangesetCleared}
	 * so subscribers see an empty file list, then deletes the local state
	 * so a fresh `getChangesetState` returns `undefined` and forces the
	 * producer to re-create the changeset on next subscribe.
	 *
	 * Per the spec, the server SHOULD also unsubscribe its clients after
	 * dispatching this action; for VS Code-internal clients that happens
	 * via the `notify/sessionRemoved` notification, which the workbench-side
	 * provider correlates to release any held subscriptions.
	 *
	 * Safe to call for a URI that was never registered: producers typically
	 * iterate over a candidate set on session disposal and emit dispose
	 * actions defensively.
	 */
	disposeChangeset(changeset: URI): void {
		if (!this._changesets.has(changeset)) {
			return;
		}
		this.dispatchServerAction(changeset, {
			type: ActionType.ChangesetCleared,
		});
		this._changesets.delete(changeset);
	}

	/**
	 * Disposes every changeset whose URI is nested under `session` (i.e.
	 * matches `<session>/changeset/...`). Used to cascade cleanup when a
	 * session itself is removed.
	 */
	disposeSessionChangesets(session: URI): void {
		// Collect first because `disposeChangeset` mutates the underlying
		// map via its envelope handler.
		const toDispose: URI[] = [];
		for (const uri of this._changesets.keys()) {
			const parsed = parseChangesetUri(uri);
			if (parsed && parsed.sessionUri === session) {
				toDispose.push(uri);
			}
		}
		for (const uri of toDispose) {
			this.disposeChangeset(uri);
		}
	}

	// ---- Turn tracking ------------------------------------------------------

	/**
	 * Registers a mapping from turnId to session URI so that incoming
	 * provider events (which carry only session URI) can be associated
	 * with the correct active turn.
	 */
	getActiveTurnId(session: URI): string | undefined {
		const state = this._sessionStates.get(session);
		return state?.activeTurn?.id;
	}

	// ---- Action dispatch ----------------------------------------------------

	/**
	 * Dispatch a server-originated action (from the agent backend).
	 * The action is applied to state via the reducer and emitted as an
	 * envelope with no origin (server-produced).
	 *
	 * `channel` identifies the channel the action targets — `ROOT_STATE_URI`
	 * for root actions, a session URI for session actions, a terminal URI
	 * for terminal actions, an expanded changeset URI for changeset actions.
	 */
	dispatchServerAction(channel: URI, action: StateAction): void {
		this._applyAndEmit(channel, action, undefined);
	}

	/**
	 * Dispatch a client-originated action (write-ahead from a renderer).
	 * The action is applied to state and emitted with the client's origin
	 * so the originating client can reconcile.
	 */
	dispatchClientAction(channel: URI, action: SessionAction | TerminalAction | IRootConfigChangedAction, origin: ActionOrigin): unknown {
		return this._applyAndEmit(channel, action, origin);
	}

	// ---- Internal -----------------------------------------------------------

	private _applyAndEmit(channel: URI, action: StateAction, origin: ActionOrigin | undefined): unknown {
		let resultingState: unknown = undefined;
		// Apply to state
		if (isRootAction(action)) {
			// `RootConfigChanged` can be a true no-op: the reducer merges/replaces
			// values even when the patch matches the current state, and re-emitting
			// it would cause clients observing rootState.onDidChange to react and
			// potentially re-dispatch in a loop. Check the action's own patch
			// against current values before running the reducer so we avoid
			// allocating a new state object at all.
			if (action.type === ActionType.RootConfigChanged && this._rootState.config) {
				const current = this._rootState.config.values;
				const patch = action.config;
				const isNoOp = action.replace
					? equals(current, patch)
					: equals({ ...current, ...patch }, current);
				if (isNoOp) {
					return this._rootState;
				}
			}
			this._rootState = rootReducer(this._rootState, action as RootAction, this._log);
			resultingState = this._rootState;
		}

		if (isSessionAction(action)) {
			const sessionAction = action as SessionAction;
			const key = channel;
			const state = this._sessionStates.get(key);
			if (state) {
				const newState = sessionReducer(state, sessionAction, this._log);
				this._sessionStates.set(key, newState);

				// Detect summary changes for notification
				if (state.summary !== newState.summary) {
					this._dirtySummaries.add(key);
					this._summaryNotifyScheduler.schedule();
				}

				// Track active turn transitions off the reducer's view of state,
				// not off the raw action's turn-ids. The reducer's `endTurn`
				// no-ops on a stale turn-id and `SessionTurnStarted` overwrites
				// a still-running turn, so deriving the count from `activeTurn`
				// is the only way to keep `RootActiveSessionsChanged` in sync
				// with reality.
				const hadActive = !!state.activeTurn;
				const hasActive = !!newState.activeTurn;
				if (hadActive !== hasActive) {
					if (hasActive) {
						this._sessionsWithActiveTurn.add(key);
					} else {
						this._sessionsWithActiveTurn.delete(key);
					}
					this._onDidChangeSessionActiveTurn.fire({ session: key, active: hasActive });
					this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
				}

				resultingState = newState;
			} else {
				this._logService.warn(`[AgentHostStateManager] Action for unknown session: ${key}, type=${action.type}`);
			}
		}

		if (isChangesetAction(action)) {
			const changesetAction = action as ChangesetAction;
			const key = channel;
			const state = this._changesets.get(key);
			if (!state) {
				// Unknown changeset: log and bail before envelope creation.
				// Routing the action to subscribers (Issue 1) makes
				// orphan envelopes client-visible, so we must drop them
				// here rather than letting them advance `_serverSeq`.
				this._logService.warn(`[AgentHostStateManager] Action for unknown changeset: ${key}, type=${action.type}`);
				return undefined;
			}
			const newState = changesetReducer(state, changesetAction, this._log);
			if (newState !== state) {
				this._changesets.set(key, newState);
			}
			resultingState = newState;
		}

		// Emit envelope
		const envelope: ActionEnvelope = {
			channel,
			action,
			serverSeq: ++this._serverSeq,
			origin,
		};

		this._logService.trace(`[AgentHostStateManager] Emitting envelope: seq=${envelope.serverSeq}, type=${action.type}${origin ? `, origin=${origin.clientId}:${origin.clientSeq}` : ''}`);
		this._onDidEmitEnvelope.fire(envelope);

		return resultingState;
	}

	private _flushSummaryNotifications(): void {
		for (const session of this._dirtySummaries) {
			this._flushSummaryNotificationFor(session);
		}
		this._dirtySummaries.clear();
	}

	/**
	 * Emits a {@link NotificationType.SessionSummaryChanged} notification for
	 * `session` if its current summary differs from the last one sent to
	 * clients, then advances `_lastNotifiedSummaries` to the current summary.
	 *
	 * Does NOT remove `session` from `_dirtySummaries` — callers are
	 * responsible for that bookkeeping.
	 */
	private _flushSummaryNotificationFor(session: string): void {
		const state = this._sessionStates.get(session);
		const lastNotified = this._lastNotifiedSummaries.get(session);
		if (!state || !lastNotified || state.summary === lastNotified) {
			return;
		}

		const current = state.summary;
		const changes: Partial<SessionSummary> = {};
		if (current.title !== lastNotified.title) { changes.title = current.title; }
		if (current.status !== lastNotified.status) { changes.status = current.status; }
		if (current.activity !== lastNotified.activity) { changes.activity = current.activity; }
		if (current.modifiedAt !== lastNotified.modifiedAt) { changes.modifiedAt = current.modifiedAt; }
		if (current.project !== lastNotified.project) { changes.project = current.project; }
		if (current.model !== lastNotified.model) { changes.model = current.model; }
		if (current.workingDirectory !== lastNotified.workingDirectory) { changes.workingDirectory = current.workingDirectory; }
		if (current.changesets !== lastNotified.changesets) { changes.changesets = current.changesets; }

		this._lastNotifiedSummaries.set(session, current);

		if (Object.keys(changes).length > 0) {
			this._onDidEmitNotification.fire({
				type: 'root/sessionSummaryChanged',
				channel: ROOT_STATE_URI,
				session,
				changes,
			});
		}
	}
}
