/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { isRootAction, isSessionAction } from '../common/state/sessionActions.js';
import { rootReducer, sessionReducer } from '../common/state/sessionReducers.js';
import { createRootState, createSessionState, ROOT_STATE_URI } from '../common/state/sessionState.js';
/**
 * Server-side state manager for the sessions process protocol.
 *
 * Maintains the authoritative state tree (root + per-session), applies actions
 * through pure reducers, assigns monotonic sequence numbers, and emits
 * {@link IActionEnvelope}s for subscribed clients.
 */
let SessionStateManager = class SessionStateManager extends Disposable {
    constructor(_logService) {
        super();
        this._logService = _logService;
        this._serverSeq = 0;
        this._sessionStates = new Map();
        /** Tracks which session URI each active turn belongs to, keyed by turnId. */
        this._activeTurnToSession = new Map();
        this._onDidEmitEnvelope = this._register(new Emitter());
        this.onDidEmitEnvelope = this._onDidEmitEnvelope.event;
        this._onDidEmitNotification = this._register(new Emitter());
        this.onDidEmitNotification = this._onDidEmitNotification.event;
        this._log = (msg) => this._logService.warn(`[SessionStateManager] ${msg}`);
        this._rootState = createRootState();
    }
    get hasActiveSessions() {
        return this._activeTurnToSession.size > 0;
    }
    // ---- State accessors ----------------------------------------------------
    get rootState() {
        return this._rootState;
    }
    getSessionState(session) {
        return this._sessionStates.get(session);
    }
    get serverSeq() {
        return this._serverSeq;
    }
    // ---- Snapshots ----------------------------------------------------------
    /**
     * Returns a state snapshot for a given resource URI.
     * The `fromSeq` in the snapshot is the current serverSeq at snapshot time;
     * the client should process subsequent envelopes with serverSeq > fromSeq.
     */
    getSnapshot(resource) {
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
    createSession(summary) {
        const key = summary.resource;
        if (this._sessionStates.has(key)) {
            this._logService.warn(`[SessionStateManager] Session already exists: ${key}`);
            return this._sessionStates.get(key);
        }
        const state = createSessionState(summary);
        this._sessionStates.set(key, state);
        this._logService.trace(`[SessionStateManager] Created session: ${key}`);
        this._onDidEmitNotification.fire({
            type: "notify/sessionAdded" /* NotificationType.SessionAdded */,
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
    restoreSession(summary, turns) {
        const key = summary.resource;
        if (this._sessionStates.has(key)) {
            this._logService.warn(`[SessionStateManager] Session already exists (restore): ${key}`);
            return this._sessionStates.get(key);
        }
        const state = {
            ...createSessionState(summary),
            lifecycle: "ready" /* SessionLifecycle.Ready */,
            turns,
        };
        this._sessionStates.set(key, state);
        this._logService.trace(`[SessionStateManager] Restored session: ${key} (${turns.length} turns)`);
        return state;
    }
    /**
     * Removes a session from in-memory state without emitting a notification.
     * Use {@link deleteSession} when the session is being permanently deleted
     * and clients need to be notified.
     */
    removeSession(session) {
        const state = this._sessionStates.get(session);
        if (!state) {
            return;
        }
        // Clean up active turn tracking
        if (state.activeTurn) {
            this._activeTurnToSession.delete(state.activeTurn.id);
        }
        this._sessionStates.delete(session);
        this._logService.trace(`[SessionStateManager] Removed session: ${session}`);
    }
    /**
     * Permanently deletes a session from state and emits a
     * {@link NotificationType.SessionRemoved} notification so that clients
     * know the session is no longer accessible.
     */
    deleteSession(session) {
        this.removeSession(session);
        this._onDidEmitNotification.fire({
            type: "notify/sessionRemoved" /* NotificationType.SessionRemoved */,
            session,
        });
    }
    // ---- Turn tracking ------------------------------------------------------
    /**
     * Registers a mapping from turnId to session URI so that incoming
     * provider events (which carry only session URI) can be associated
     * with the correct active turn.
     */
    getActiveTurnId(session) {
        const state = this._sessionStates.get(session);
        return state?.activeTurn?.id;
    }
    // ---- Action dispatch ----------------------------------------------------
    /**
     * Dispatch a server-originated action (from the agent backend).
     * The action is applied to state via the reducer and emitted as an
     * envelope with no origin (server-produced).
     */
    dispatchServerAction(action) {
        this._applyAndEmit(action, undefined);
    }
    /**
     * Dispatch a client-originated action (write-ahead from a renderer).
     * The action is applied to state and emitted with the client's origin
     * so the originating client can reconcile.
     */
    dispatchClientAction(action, origin) {
        return this._applyAndEmit(action, origin);
    }
    // ---- Internal -----------------------------------------------------------
    _applyAndEmit(action, origin) {
        let resultingState = undefined;
        // Apply to state
        if (isRootAction(action)) {
            this._rootState = rootReducer(this._rootState, action, this._log);
            resultingState = this._rootState;
        }
        if (isSessionAction(action)) {
            const sessionAction = action;
            const key = sessionAction.session;
            const state = this._sessionStates.get(key);
            if (state) {
                const newState = sessionReducer(state, sessionAction, this._log);
                this._sessionStates.set(key, newState);
                // Track active turn for turn lifecycle
                if (sessionAction.type === "session/turnStarted" /* ActionType.SessionTurnStarted */) {
                    this._activeTurnToSession.set(sessionAction.turnId, key);
                    this.dispatchServerAction({ type: "root/activeSessionsChanged" /* ActionType.RootActiveSessionsChanged */, activeSessions: this._activeTurnToSession.size });
                }
                else if (sessionAction.type === "session/turnComplete" /* ActionType.SessionTurnComplete */ ||
                    sessionAction.type === "session/turnCancelled" /* ActionType.SessionTurnCancelled */ ||
                    sessionAction.type === "session/error" /* ActionType.SessionError */) {
                    this._activeTurnToSession.delete(sessionAction.turnId);
                    this.dispatchServerAction({ type: "root/activeSessionsChanged" /* ActionType.RootActiveSessionsChanged */, activeSessions: this._activeTurnToSession.size });
                }
                resultingState = newState;
            }
            else {
                this._logService.warn(`[SessionStateManager] Action for unknown session: ${key}, type=${action.type}`);
            }
        }
        // Emit envelope
        const envelope = {
            action,
            serverSeq: ++this._serverSeq,
            origin,
        };
        this._logService.trace(`[SessionStateManager] Emitting envelope: seq=${envelope.serverSeq}, type=${action.type}${origin ? `, origin=${origin.clientId}:${origin.clientSeq}` : ''}`);
        this._onDidEmitEnvelope.fire(envelope);
        return resultingState;
    }
};
SessionStateManager = __decorate([
    __param(0, ILogService)
], SessionStateManager);
export { SessionStateManager };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvblN0YXRlTWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3Nlc3Npb25TdGF0ZU1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUEwSCxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFMU0sT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsZUFBZSxFQUFFLGtCQUFrQixFQUFxRyxjQUFjLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUV6TTs7Ozs7O0dBTUc7QUFDSSxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFvQixTQUFRLFVBQVU7SUFnQmxELFlBQ2MsV0FBeUM7UUFFdEQsS0FBSyxFQUFFLENBQUM7UUFGc0IsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFmL0MsZUFBVSxHQUFHLENBQUMsQ0FBQztRQUdOLG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQXlCLENBQUM7UUFFbkUsNkVBQTZFO1FBQzVELHlCQUFvQixHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO1FBRWpELHVCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQW1CLENBQUMsQ0FBQztRQUM1RSxzQkFBaUIsR0FBMkIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztRQUVsRSwyQkFBc0IsR0FBRyxJQUFJLENBQUMsU0FB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