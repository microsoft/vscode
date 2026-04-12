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
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { isRootAction, isSessionAction } from './sessionActions.js';
import { rootReducer, sessionReducer } from './sessionReducers.js';
import { ROOT_STATE_URI } from './sessionState.js';
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
    constructor(clientId, logService, seqAllocator) {
        super();
        this._lastSeenServerSeq = 0;
        this._confirmedSessionStates = new Map();
        // Pending session actions (root actions are server-only, never pending)
        this._pendingActions = [];
        this._optimisticSessionStates = new Map();
        this._onDidChangeRootState = this._register(new Emitter());
        this.onDidChangeRootState = this._onDidChangeRootState.event;
        this._onDidChangeSessionState = this._register(new Emitter());
        this.onDidChangeSessionState = this._onDidChangeSessionState.event;
        this._onDidReceiveNotification = this._register(new Emitter());
        this.onDidReceiveNotification = this._onDidReceiveNotification.event;
        this._clientId = clientId;
        this._log = msg => logService.warn(`[SessionClientState] ${msg}`);
        this._seqAllocator = seqAllocator;
    }
    get clientId() {
        return this._clientId;
    }
    get lastSeenServerSeq() {
        return this._lastSeenServerSeq;
    }
    /** Current root state, or undefined if not yet subscribed. */
    get rootState() {
        return this._optimisticRootState;
    }
    /** Current optimistic session state, or undefined if not subscribed. */
    getSessionState(session) {
        return this._optimisticSessionStates.get(session);
    }
    /** URIs of sessions the client is currently subscribed to. */
    get subscribedSessions() {
        return [...this._confirmedSessionStates.keys()].map(k => URI.parse(k));
    }
    // ---- Snapshot handling ---------------------------------------------------
    /**
     * Apply a state snapshot received from the server (from handshake,
     * subscribe response, or reconnection).
     */
    handleSnapshot(resource, state, fromSeq) {
        this._lastSeenServerSeq = Math.max(this._lastSeenServerSeq, fromSeq);
        if (resource === ROOT_STATE_URI) {
            const rootState = state;
            this._confirmedRootState = rootState;
            this._optimisticRootState = rootState;
            this._onDidChangeRootState.fire(rootState);
        }
        else {
            const sessionState = state;
            this._confirmedSessionStates.set(resource, sessionState);
            this._optimisticSessionStates.set(resource, sessionState);
            // Re-apply any pending session actions for this session
            this._recomputeOptimisticSession(resource);
            this._onDidChangeSessionState.fire({
                session: resource,
                state: this._optimisticSessionStates.get(resource),
            });
        }
    }
    /**
     * Unsubscribe from a resource, dropping its local state.
     */
    unsubscribe(resource) {
        if (resource === ROOT_STATE_URI) {
            this._confirmedRootState = undefined;
            this._optimisticRootState = undefined;
        }
        else {
            this._confirmedSessionStates.delete(resource);
            this._optimisticSessionStates.delete(resource);
            // Remove pending actions for this session
            for (let i = this._pendingActions.length - 1; i >= 0; i--) {
                const action = this._pendingActions[i].action;
                if (isSessionAction(action) && action.session === resource) {
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
    applyOptimistic(action) {
        const clientSeq = this._seqAllocator();
        this._pendingActions.push({ clientSeq, action });
        this._applySessionToOptimistic(action);
        return clientSeq;
    }
    // ---- Receiving server messages ------------------------------------------
    /**
     * Process an action envelope received from the server.
     * This is the core reconciliation algorithm.
     */
    receiveEnvelope(envelope) {
        this._lastSeenServerSeq = Math.max(this._lastSeenServerSeq, envelope.serverSeq);
        const origin = envelope.origin;
        const isOwnAction = origin !== undefined && origin.clientId === this._clientId;
        if (isOwnAction) {
            const headIdx = this._pendingActions.findIndex(p => p.clientSeq === origin.clientSeq);
            if (headIdx !== -1) {
                if (envelope.rejectionReason) {
                    this._pendingActions.splice(headIdx, 1);
                }
                else {
                    this._applyToConfirmed(envelope.action);
                    this._pendingActions.splice(headIdx, 1);
                }
            }
            else {
                this._applyToConfirmed(envelope.action);
            }
        }
        else {
            this._applyToConfirmed(envelope.action);
        }
        // Recompute optimistic state from confirmed + remaining pending
        this._recomputeOptimistic(envelope.action);
    }
    /**
     * Process an ephemeral notification from the server.
     * Not stored in state — just forwarded to listeners.
     */
    receiveNotification(notification) {
        this._onDidReceiveNotification.fire(notification);
    }
    // ---- Internal state management ------------------------------------------
    _applyToConfirmed(action) {
        if (isRootAction(action) && this._confirmedRootState) {
            this._confirmedRootState = rootReducer(this._confirmedRootState, action, this._log);
        }
        if (isSessionAction(action)) {
            const key = action.session.toString();
            const state = this._confirmedSessionStates.get(key);
            if (state) {
                this._confirmedSessionStates.set(key, sessionReducer(state, action, this._log));
            }
        }
    }
    _applySessionToOptimistic(action) {
        const key = action.session.toString();
        const state = this._optimisticSessionStates.get(key);
        if (state) {
            const newState = sessionReducer(state, action, this._log);
            this._optimisticSessionStates.set(key, newState);
            this._onDidChangeSessionState.fire({ session: action.session, state: newState });
        }
    }
    /**
     * After applying a server action to confirmed state, recompute optimistic
     * state by replaying pending actions on top of confirmed.
     */
    _recomputeOptimistic(triggerAction) {
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
        const affectedKeys = new Set();
        for (const pending of this._pendingActions) {
            if (isSessionAction(pending.action)) {
                affectedKeys.add(pending.action.session.toString());
            }
        }
        for (const key of affectedKeys) {
            this._recomputeOptimisticSession(key);
        }
    }
    _recomputeOptimisticSession(session) {
        const confirmed = this._confirmedSessionStates.get(session);
        if (!confirmed) {
            return;
        }
        let state = confirmed;
        for (const pending of this._pendingActions) {
            if (isSessionAction(pending.action) && pending.action.session === session) {
                state = sessionReducer(state, pending.action, this._log);
            }
        }
        this._optimisticSessionStates.set(session, state);
        this._onDidChangeSessionState.fire({ session, state });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbkNsaWVudFN0YXRlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uQ2xpZW50U3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsK0RBQStEO0FBQy9ELHFFQUFxRTtBQUNyRSxFQUFFO0FBQ0YsNEVBQTRFO0FBQzVFLDJFQUEyRTtBQUMzRSxrREFBa0Q7QUFDbEQsRUFBRTtBQUNGLG9EQUFvRDtBQUNwRCxrRkFBa0Y7QUFDbEYseUVBQXlFO0FBQ3pFLDBCQUEwQjtBQUUxQixPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQWtELFlBQVksRUFBRSxlQUFlLEVBQWdCLE1BQU0scUJBQXFCLENBQUM7QUFDbEksT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNuRSxPQUFPLEVBQTZCLGNBQWMsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBVTlFLGdGQUFnRjtBQUVoRjs7Ozs7Ozs7Ozs7Ozs7R0FjRztBQUNILE1BQU0sT0FBTyxrQkFBbUIsU0FBUSxVQUFVO0lBMkJqRCxZQUFZLFFBQWdCLEVBQUUsVUFBdUIsRUFBRSxZQUEwQjtRQUNoRixLQUFLLEVBQUUsQ0FBQztRQXZCRCx1QkFBa0IsR0FBRyxDQUFDLENBQUM7UUFJZCw0QkFBdUIsR0FBRyxJQUFJLEdBQUcsRUFBeUIsQ0FBQztRQUU1RSx3RUFBd0U7UUFDdkQsb0JBQWUsR0FBcUIsRUFBRSxDQUFDO1FBSXZDLDZCQUF3QixHQUFHLElBQUksR0FBRyxFQUF5QixDQUFD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