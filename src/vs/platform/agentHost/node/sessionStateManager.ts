/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IActionEnvelope, IActionOrigin, INotification, ISessionAction, IRootAction, IStateAction, isRootAction, isSessionAction } from '../common/state/sessionActions.js';
import { IStateSnapshot } from '../common/state/sessionProtocol.js';
import { rootReducer, sessionReducer } from '../common/state/sessionReducers.js';
import { createRootState, createSessionState, IRootState, ISessionState, ISessionSummary, ROOT_STATE_URI } from '../common/state/sessionState.js';

/**
 * Server-side state manager for the sessions process protocol.
 *
 * Maintains the authoritative state tree (root + per-session), applies actions
 * through pure reducers, assigns monotonic sequence numbers, and emits
 * {@link IActionEnvelope}s for subscribed clients.
 */
export class SessionStateManager extends Disposable {

	private _serverSeq = 0;

	private _rootState: IRootState;
	private readonly _sessionStates = new Map<string, ISessionState>();

	/** Tracks which session URI each active turn belongs to, keyed by turnId. */
	private readonly _activeTurnToSession = new Map<string, string>();

	private readonly _onDidEmitEnvelope = this._register(new Emitter<IActionEnvelope>());
	readonly onDidEmitEnvelope: Event<IActionEnvelope> = this._onDidEmitEnvelope.event;

	private readonly _onDidEmitNotification = this._register(new Emitter<INotification>());
	readonly onDidEmitNotification: Event<INotification> = this._onDidEmitNotification.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._rootState = createRootState();
	}

	// ---- State accessors ----------------------------------------------------

	get rootState(): IRootState {
		return this._rootState;
	}

	getSessionState(session: URI): ISessionState | undefined {
		return this._sessionStates.get(session.toString());
	}

	get serverSeq(): number {
		return this._serverSeq;
	}

	// ---- Snapshots ----------------------------------------------------------

	/**
	 * Returns a state snapshot for a given resource URI.
	 * The `fromSeq` in the snapshot is the current serverSeq at snapshot time;
	 * the client should process subsequent envelopes with serverSeq > fromSeq.
	 */
	getSnapshot(resource: URI): IStateSnapshot | undefined {
		const key = resource.toString();

		if (key === ROOT_STATE_URI.toString()) {
			return {
				resource,
				state: this._rootState,
				fromSeq: this._serverSeq,
			};
		}

		const sessionState = this._sessionStates.get(key);
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
	createSession(summary: ISessionSummary): ISessionState {
		const key = summary.resource.toString();
		if (this._sessionStates.has(key)) {
			this._logService.warn(`[SessionStateManager] Session already exists: ${key}`);
			return this._sessionStates.get(key)!;
		}

		const state = createSessionState(summary);
		this._sessionStates.set(key, state);

		this._logService.trace(`[SessionStateManager] Created session: ${key}`);

		this._onDidEmitNotification.fire({
			type: 'notify/sessionAdded',
			summary,
		});

		return state;
	}

	/**
	 * Removes a session from state and emits a sessionRemoved notification.
	 */
	removeSession(session: URI): void {
		const key = session.toString();
		const state = this._sessionStates.get(key);
		if (!state) {
			return;
		}

		// Clean up active turn tracking
		if (state.activeTurn) {
			this._activeTurnToSession.delete(state.activeTurn.id);
		}

		this._sessionStates.delete(key);
		this._logService.trace(`[SessionStateManager] Removed session: ${key}`);

		this._onDidEmitNotification.fire({
			type: 'notify/sessionRemoved',
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
		const state = this._sessionStates.get(session.toString());
		return state?.activeTurn?.id;
	}

	// ---- Action dispatch ----------------------------------------------------

	/**
	 * Dispatch a server-originated action (from the agent backend).
	 * The action is applied to state via the reducer and emitted as an
	 * envelope with no origin (server-produced).
	 */
	dispatchServerAction(action: IStateAction): void {
		this._applyAndEmit(action, undefined);
	}

	/**
	 * Dispatch a client-originated action (write-ahead from a renderer).
	 * The action is applied to state and emitted with the client's origin
	 * so the originating client can reconcile.
	 */
	dispatchClientAction(action: ISessionAction, origin: IActionOrigin): unknown {
		return this._applyAndEmit(action, origin);
	}

	// ---- Internal -----------------------------------------------------------

	private _applyAndEmit(action: IStateAction, origin: IActionOrigin | undefined): unknown {
		let resultingState: unknown = undefined;
		// Apply to state
		if (isRootAction(action)) {
			this._rootState = rootReducer(this._rootState, action as IRootAction);
			resultingState = this._rootState;
		}

		if (isSessionAction(action)) {
			const sessionAction = action as ISessionAction;
			const key = sessionAction.session.toString();
			const state = this._sessionStates.get(key);
			if (state) {
				const newState = sessionReducer(state, sessionAction);
				this._sessionStates.set(key, newState);

				// Track active turn for turn lifecycle
				if (sessionAction.type === 'session/turnStarted') {
					this._activeTurnToSession.set(sessionAction.turnId, key);
				} else if (
					sessionAction.type === 'session/turnComplete' ||
					sessionAction.type === 'session/turnCancelled' ||
					sessionAction.type === 'session/error'
				) {
					this._activeTurnToSession.delete(sessionAction.turnId);
				}

				resultingState = newState;
			} else {
				this._logService.warn(`[SessionStateManager] Action for unknown session: ${key}, type=${action.type}`);
			}
		}

		// Emit envelope
		const envelope: IActionEnvelope = {
			action,
			serverSeq: ++this._serverSeq,
			origin,
		};

		this._logService.trace(`[SessionStateManager] Emitting envelope: seq=${envelope.serverSeq}, type=${action.type}${origin ? `, origin=${origin.clientId}:${origin.clientSeq}` : ''}`);
		this._onDidEmitEnvelope.fire(envelope);

		return resultingState;
	}
}
