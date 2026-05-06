/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { ILogService } from '../../log/common/log.js';
import { ActionType, NotificationType, ActionEnvelope, ActionOrigin, INotification, IRootConfigChangedAction, SessionAction, RootAction, StateAction, TerminalAction, isRootAction, isSessionAction } from '../common/state/sessionActions.js';
import type { IStateSnapshot } from '../common/state/sessionProtocol.js';
import { rootReducer, sessionReducer } from '../common/state/sessionReducers.js';
import { createRootState, createSessionState, SessionLifecycle, type RootState, type SessionMeta, type SessionState, type SessionSummary, type Turn, type URI, ROOT_STATE_URI } from '../common/state/sessionState.js';
import { IPermissionsValue, platformRootSchema } from '../common/agentHostSchema.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';

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

	/** Tracks which session URI each active turn belongs to, keyed by turnId. */
	private readonly _activeTurnToSession = new Map<string, string>();

	/** Last summary sent to clients (via sessionAdded or sessionSummaryChanged). */
	private readonly _lastNotifiedSummaries = new Map<string, SessionSummary>();

	/** Sessions whose summary changed since the last flush. */
	private readonly _dirtySummaries = new Set<string>();
	private readonly _summaryNotifyScheduler = this._register(new RunOnceScheduler(() => this._flushSummaryNotifications(), 100));

	private readonly _onDidEmitEnvelope = this._register(new Emitter<ActionEnvelope>());
	readonly onDidEmitEnvelope: Event<ActionEnvelope> = this._onDidEmitEnvelope.event;

	private readonly _onDidEmitNotification = this._register(new Emitter<INotification>());
	readonly onDidEmitNotification: Event<INotification> = this._onDidEmitNotification.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
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
				}),
			},
		};
	}
	private readonly _log = (msg: string) => this._logService.warn(`[AgentHostStateManager] ${msg}`);

	get hasActiveSessions(): boolean {
		return this._activeTurnToSession.size > 0;
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
		if (resource === ROOT_STATE_URI) {
			return {
				resource,
				state: this._rootState,
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
				type: NotificationType.SessionAdded,
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
			type: NotificationType.SessionAdded,
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

		// Clean up active turn tracking
		if (state.activeTurn) {
			this._activeTurnToSession.delete(state.activeTurn.id);
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
		this.removeSession(session);
		if (wasAnnounced) {
			this._onDidEmitNotification.fire({
				type: NotificationType.SessionRemoved,
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
		this.dispatchServerAction({ type: ActionType.SessionMetaChanged, session, _meta: meta });
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
	 */
	dispatchServerAction(action: StateAction): void {
		this._applyAndEmit(action, undefined);
	}

	/**
	 * Dispatch a client-originated action (write-ahead from a renderer).
	 * The action is applied to state and emitted with the client's origin
	 * so the originating client can reconcile.
	 */
	dispatchClientAction(action: SessionAction | TerminalAction | IRootConfigChangedAction, origin: ActionOrigin): unknown {
		return this._applyAndEmit(action, origin);
	}

	// ---- Internal -----------------------------------------------------------

	private _applyAndEmit(action: StateAction, origin: ActionOrigin | undefined): unknown {
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
			const key = sessionAction.session;
			const state = this._sessionStates.get(key);
			if (state) {
				const newState = sessionReducer(state, sessionAction, this._log);
				this._sessionStates.set(key, newState);

				// Detect summary changes for notification
				if (state.summary !== newState.summary) {
					this._dirtySummaries.add(key);
					this._summaryNotifyScheduler.schedule();
				}

				// Track active turn for turn lifecycle
				if (sessionAction.type === ActionType.SessionTurnStarted) {
					this._activeTurnToSession.set(sessionAction.turnId, key);
					this.dispatchServerAction({ type: ActionType.RootActiveSessionsChanged, activeSessions: this._activeTurnToSession.size });
				} else if (
					sessionAction.type === ActionType.SessionTurnComplete ||
					sessionAction.type === ActionType.SessionTurnCancelled ||
					sessionAction.type === ActionType.SessionError
				) {
					this._activeTurnToSession.delete(sessionAction.turnId);
					this.dispatchServerAction({ type: ActionType.RootActiveSessionsChanged, activeSessions: this._activeTurnToSession.size });
				}

				resultingState = newState;
			} else {
				this._logService.warn(`[AgentHostStateManager] Action for unknown session: ${key}, type=${action.type}`);
			}
		}

		// Emit envelope
		const envelope: ActionEnvelope = {
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
		if (current.diffs !== lastNotified.diffs) { changes.diffs = current.diffs; }

		this._lastNotifiedSummaries.set(session, current);

		if (Object.keys(changes).length > 0) {
			this._onDidEmitNotification.fire({
				type: NotificationType.SessionSummaryChanged,
				session,
				changes,
			});
		}
	}
}
