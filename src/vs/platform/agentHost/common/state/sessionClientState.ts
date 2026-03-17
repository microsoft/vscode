/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Client-side state manager for the sessions process protocol.
// See protocol.md -> Write-ahead reconciliation for the full design.
//
// Manages confirmed state (last server-acknowledged), pending actions queue
// (optimistically applied), and reconciliation when the server echoes back
// or sends concurrent actions from other sources.
//
// This operates on two kinds of subscribable state:
//   - Root state (agents + their models) — server-only mutations, no write-ahead.
//   - Session state — mixed: some actions client-sendable (write-ahead),
//     others server-only.

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IActionEnvelope, INotification, ISessionAction, isRootAction, isSessionAction, IStateAction } from './sessionActions.js';
import { rootReducer, sessionReducer } from './sessionReducers.js';
import { IRootState, ISessionState, ROOT_STATE_URI } from './sessionState.js';

// ---- Pending action tracking ------------------------------------------------

interface IPendingAction {
	readonly clientSeq: number;
	readonly action: IStateAction;
}

// ---- Client state manager ---------------------------------------------------

/**
 * Manages the client's local view of the state tree with write-ahead
 * reconciliation. The client can optimistically apply its own session
 * actions and reconcile when the server echoes them back (possibly
 * interleaved with actions from other clients or the server).
 *
 * Usage:
 * 1. Call `handleSnapshot(resource, state, fromSeq)` for each snapshot
 *    from the handshake or a subscribe response.
 * 2. Call `applyOptimistic(action)` when the user does something
 *    (returns a clientSeq for the command).
 * 3. Call `receiveEnvelope(envelope)` for each action from the server.
 * 4. Call `receiveNotification(notification)` for each notification.
 * 5. Read `rootState` / `getSessionState(uri)` for the current view.
 */
export class SessionClientState extends Disposable {

	private readonly _clientId: string;
	private _nextClientSeq = 1;
	private _lastSeenServerSeq = 0;

	// Confirmed state — reflects only what the server has acknowledged
	private _confirmedRootState: IRootState | undefined;
	private readonly _confirmedSessionStates = new Map<string, ISessionState>();

	// Pending session actions (root actions are server-only, never pending)
	private readonly _pendingActions: IPendingAction[] = [];

	// Cached optimistic state — recomputed when confirmed or pending changes
	private _optimisticRootState: IRootState | undefined;
	private readonly _optimisticSessionStates = new Map<string, ISessionState>();

	private readonly _onDidChangeRootState = this._register(new Emitter<IRootState>());
	readonly onDidChangeRootState: Event<IRootState> = this._onDidChangeRootState.event;

	private readonly _onDidChangeSessionState = this._register(new Emitter<{ session: URI; state: ISessionState }>());
	readonly onDidChangeSessionState: Event<{ session: URI; state: ISessionState }> = this._onDidChangeSessionState.event;

	private readonly _onDidReceiveNotification = this._register(new Emitter<INotification>());
	readonly onDidReceiveNotification: Event<INotification> = this._onDidReceiveNotification.event;

	constructor(clientId: string) {
		super();
		this._clientId = clientId;
	}

	get clientId(): string {
		return this._clientId;
	}

	get lastSeenServerSeq(): number {
		return this._lastSeenServerSeq;
	}

	/** Current root state, or undefined if not yet subscribed. */
	get rootState(): IRootState | undefined {
		return this._optimisticRootState;
	}

	/** Current optimistic session state, or undefined if not subscribed. */
	getSessionState(session: URI): ISessionState | undefined {
		return this._optimisticSessionStates.get(session.toString());
	}

	/** URIs of sessions the client is currently subscribed to. */
	get subscribedSessions(): readonly URI[] {
		return [...this._confirmedSessionStates.keys()].map(k => URI.parse(k));
	}

	// ---- Snapshot handling ---------------------------------------------------

	/**
	 * Apply a state snapshot received from the server (from handshake,
	 * subscribe response, or reconnection).
	 */
	handleSnapshot(resource: URI, state: IRootState | ISessionState, fromSeq: number): void {
		this._lastSeenServerSeq = Math.max(this._lastSeenServerSeq, fromSeq);

		if (resource.toString() === ROOT_STATE_URI.toString()) {
			const rootState = state as IRootState;
			this._confirmedRootState = rootState;
			this._optimisticRootState = rootState;
			this._onDidChangeRootState.fire(rootState);
		} else {
			const key = resource.toString();
			const sessionState = state as ISessionState;
			this._confirmedSessionStates.set(key, sessionState);
			this._optimisticSessionStates.set(key, sessionState);
			// Re-apply any pending session actions for this session
			this._recomputeOptimisticSession(resource);
			this._onDidChangeSessionState.fire({
				session: resource,
				state: this._optimisticSessionStates.get(key)!,
			});
		}
	}

	/**
	 * Unsubscribe from a resource, dropping its local state.
	 */
	unsubscribe(resource: URI): void {
		const key = resource.toString();
		if (key === ROOT_STATE_URI.toString()) {
			this._confirmedRootState = undefined;
			this._optimisticRootState = undefined;
		} else {
			this._confirmedSessionStates.delete(key);
			this._optimisticSessionStates.delete(key);
			// Remove pending actions for this session
			for (let i = this._pendingActions.length - 1; i >= 0; i--) {
				const action = this._pendingActions[i].action;
				if (isSessionAction(action) && action.session.toString() === key) {
					this._pendingActions.splice(i, 1);
				}
			}
		}
	}

	// ---- Write-ahead --------------------------------------------------------

	/**
	 * Optimistically apply a session action locally. Returns the clientSeq
	 * that should be sent to the server with the corresponding command so
	 * the server can echo it back for reconciliation.
	 *
	 * Only session actions can be write-ahead (root actions are server-only).
	 */
	applyOptimistic(action: ISessionAction): number {
		const clientSeq = this._nextClientSeq++;
		this._pendingActions.push({ clientSeq, action });
		this._applySessionToOptimistic(action);
		return clientSeq;
	}

	// ---- Receiving server messages ------------------------------------------

	/**
	 * Process an action envelope received from the server.
	 * This is the core reconciliation algorithm.
	 */
	receiveEnvelope(envelope: IActionEnvelope): void {
		this._lastSeenServerSeq = Math.max(this._lastSeenServerSeq, envelope.serverSeq);

		const origin = envelope.origin;
		const isOwnAction = origin !== undefined && origin.clientId === this._clientId;

		if (isOwnAction) {
			const headIdx = this._pendingActions.findIndex(p => p.clientSeq === origin.clientSeq);

			if (headIdx !== -1) {
				if (envelope.rejected) {
					this._pendingActions.splice(headIdx, 1);
				} else {
					this._applyToConfirmed(envelope.action);
					this._pendingActions.splice(headIdx, 1);
				}
			} else {
				this._applyToConfirmed(envelope.action);
			}
		} else {
			this._applyToConfirmed(envelope.action);
		}

		// Recompute optimistic state from confirmed + remaining pending
		this._recomputeOptimistic(envelope.action);
	}

	/**
	 * Process an ephemeral notification from the server.
	 * Not stored in state — just forwarded to listeners.
	 */
	receiveNotification(notification: INotification): void {
		this._onDidReceiveNotification.fire(notification);
	}

	// ---- Internal state management ------------------------------------------

	private _applyToConfirmed(action: IStateAction): void {
		if (isRootAction(action) && this._confirmedRootState) {
			this._confirmedRootState = rootReducer(this._confirmedRootState, action);
		}
		if (isSessionAction(action)) {
			const key = action.session.toString();
			const state = this._confirmedSessionStates.get(key);
			if (state) {
				this._confirmedSessionStates.set(key, sessionReducer(state, action));
			}
		}
	}

	private _applySessionToOptimistic(action: ISessionAction): void {
		const key = action.session.toString();
		const state = this._optimisticSessionStates.get(key);
		if (state) {
			const newState = sessionReducer(state, action);
			this._optimisticSessionStates.set(key, newState);
			this._onDidChangeSessionState.fire({ session: action.session, state: newState });
		}
	}

	/**
	 * After applying a server action to confirmed state, recompute optimistic
	 * state by replaying pending actions on top of confirmed.
	 */
	private _recomputeOptimistic(triggerAction: IStateAction): void {
		// Root state: no pending actions (server-only), so optimistic = confirmed
		if (isRootAction(triggerAction) && this._confirmedRootState) {
			this._optimisticRootState = this._confirmedRootState;
			this._onDidChangeRootState.fire(this._confirmedRootState);
		}

		// Session states: recompute only affected sessions
		if (isSessionAction(triggerAction)) {
			this._recomputeOptimisticSession(triggerAction.session);
		}

		// Also recompute any sessions that have pending actions
		const affectedKeys = new Set<string>();
		for (const pending of this._pendingActions) {
			if (isSessionAction(pending.action)) {
				affectedKeys.add(pending.action.session.toString());
			}
		}
		for (const key of affectedKeys) {
			const uri = URI.parse(key);
			this._recomputeOptimisticSession(uri);
		}
	}

	private _recomputeOptimisticSession(session: URI): void {
		const key = session.toString();
		const confirmed = this._confirmedSessionStates.get(key);
		if (!confirmed) {
			return;
		}

		let state = confirmed;
		for (const pending of this._pendingActions) {
			if (isSessionAction(pending.action) && pending.action.session.toString() === key) {
				state = sessionReducer(state, pending.action);
			}
		}

		this._optimisticSessionStates.set(key, state);
		this._onDidChangeSessionState.fire({ session, state });
	}
}
