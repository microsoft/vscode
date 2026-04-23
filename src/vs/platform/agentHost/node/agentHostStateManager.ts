/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { ActionType, NotificationType, ActionEnvelope, ActionOrigin, INotification, SessionAction, RootAction, StateAction, isRootAction, isSessionAction, type TerminalAction } from '../common/state/sessionActions.js';
import type { IStateSnapshot } from '../common/state/sessionProtocol.js';
import { rootReducer, sessionReducer } from '../common/state/sessionReducers.js';
import { createRootState, createSessionState, SessionLifecycle, type RootState, type SessionState, type SessionSummary, type Turn, type URI, ROOT_STATE_URI } from '../common/state/sessionState.js';

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
	 */
	createSession(summary: SessionSummary): SessionState {
		const key = summary.resource;
		if (this._sessionStates.has(key)) {
			this._logService.warn(`[AgentHostStateManager] Session already exists: ${key}`);
			return this._sessionStates.get(key)!;
		}

		const state = createSessionState(summary);
		this._sessionStates.set(key, state);

		this._logService.trace(`[AgentHostStateManager] Created session: ${key}`);

		this._lastNotifiedSummaries.set(key, summary);
		this._onDidEmitNotification.fire({
			type: NotificationType.SessionAdded,
			summary,
		});

		return state;
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
	 * Removes a session from in-memory state without emitting a notification.
	 * Use {@link deleteSession} when the session is being permanently deleted
	 * and clients need to be notified.
	 */
	removeSession(session: URI): void {
		const state = this._sessionStates.get(session);
		if (!state) {
			return;
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
	 */
	deleteSession(session: URI): void {
		this.removeSession(session);
		this._onDidEmitNotification.fire({
			type: NotificationType.SessionRemoved,
			session,
		});
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
	dispatchClientAction(action: SessionAction | TerminalAction, origin: ActionOrigin): unknown {
		return this._applyAndEmit(action, origin);
	}

	// ---- Internal -----------------------------------------------------------

	private _applyAndEmit(action: StateAction, origin: ActionOrigin | undefined): unknown {
		let resultingState: unknown = undefined;
		// Apply to state
		if (isRootAction(action)) {
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
			const state = this._sessionStates.get(session);
			const lastNotified = this._lastNotifiedSummaries.get(session);
			if (!state || !lastNotified || state.summary === lastNotified) {
				continue;
			}

			const current = state.summary;
			const changes: Partial<SessionSummary> = {};
			if (current.title !== lastNotified.title) { changes.title = current.title; }
			if (current.status !== lastNotified.status) { changes.status = current.status; }
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
		this._dirtySummaries.clear();
	}
}
