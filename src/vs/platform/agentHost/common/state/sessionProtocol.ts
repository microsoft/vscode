/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol messages for the sessions process client-server communication.
// See protocol.md -> Client-server protocol for the full design.
//
// These types define the wire format for handshake, URI-based subscription,
// commands, notifications, and reconnection. They are transport-agnostic —
// the actual transport (MessagePort, WebSocket, stdio) is plugged in separately.

import { URI } from '../../../../base/common/uri.js';
import type { IActionEnvelope, INotification, ISessionAction, IStateAction } from './sessionActions.js';
import type { IRootState, ISessionState, ISessionSummary } from './sessionState.js';

// ---- Client → Server messages -----------------------------------------------

export interface IClientHello {
	readonly type: 'clientHello';
	readonly protocolVersion: number;
	readonly clientId: string;
	/** Subscribe to these URIs as part of the handshake (saves a round-trip). */
	readonly initialSubscriptions?: readonly URI[];
}

export interface IClientReconnect {
	readonly type: 'clientReconnect';
	readonly clientId: string;
	readonly lastSeenServerSeq: number;
	/** URIs the client was subscribed to before disconnection. */
	readonly subscriptions: readonly URI[];
}

export interface ISubscribe {
	readonly type: 'subscribe';
	/** URI to subscribe to (e.g. `agenthost:root` or `copilot:/<uuid>`). */
	readonly resource: URI;
}

export interface IUnsubscribe {
	readonly type: 'unsubscribe';
	readonly resource: URI;
}

/**
 * A client-dispatched action. The server applies it to state and
 * reacts with side effects (e.g., starting agent processing).
 * Used for write-ahead actions like turnStarted, turnCancelled,
 * permissionResolved.
 */
export interface IClientAction {
	readonly type: 'action';
	readonly clientSeq: number;
	readonly action: ISessionAction;
}

/**
 * A command from the client requesting an imperative operation
 * that doesn't map directly to a single state action.
 */
export interface IClientCommand {
	readonly type: 'command';
	readonly command: ISessionCommand;
}

export type IClientMessage =
	| IClientHello
	| IClientReconnect
	| ISubscribe
	| IUnsubscribe
	| IClientAction
	| IClientCommand;

// ---- Commands (embedded in IClientCommand) ----------------------------------

export interface ICreateSessionCommand {
	readonly type: 'createSession';
	/** URI the client has chosen for this session (client picks the ID). */
	readonly session: URI;
	readonly provider?: string;
	readonly model?: string;
	readonly workingDirectory?: string;
}

export interface IDisposeSessionCommand {
	readonly type: 'disposeSession';
	readonly session: URI;
}

export interface IFetchContentCommand {
	readonly type: 'fetchContent';
	readonly uri: URI;
}

export interface IFetchTurnsCommand {
	readonly type: 'fetchTurns';
	readonly session: URI;
	readonly startTurn: number;
	readonly count: number;
}

export interface IListSessionsCommand {
	readonly type: 'listSessions';
}

export type ISessionCommand =
	| ICreateSessionCommand
	| IDisposeSessionCommand
	| IFetchContentCommand
	| IFetchTurnsCommand
	| IListSessionsCommand;

// ---- Server → Client messages -----------------------------------------------

export interface IServerHello {
	readonly type: 'serverHello';
	readonly protocolVersion: number;
	readonly serverSeq: number;
	/** Snapshots for each URI in the client's `initialSubscriptions`. */
	readonly snapshots: readonly IStateSnapshot[];
}

/**
 * Response to a subscribe request. Contains the state snapshot and
 * the server sequence at snapshot time. The client processes subsequent
 * actions with serverSeq > fromSeq.
 */
export interface IStateSnapshot {
	readonly type: 'stateSnapshot';
	readonly resource: URI;
	readonly state: IRootState | ISessionState;
	readonly fromSeq: number;
}

/**
 * A state-changing action broadcast to subscribed clients.
 */
export interface IActionMessage {
	readonly type: 'action';
	readonly envelope: IActionEnvelope<IStateAction>;
}

/**
 * An ephemeral notification broadcast to all connected clients.
 * Not stored in state, not replayed on reconnect.
 */
export interface INotificationMessage {
	readonly type: 'notification';
	readonly notification: INotification;
}

/**
 * Response to a fetchContent command.
 */
export interface IContentResponse {
	readonly type: 'contentResponse';
	readonly uri: URI;
	readonly data: string; // base64-encoded for binary safety over JSON
	readonly mimeType?: string;
}

/**
 * Response to a fetchTurns command.
 */
export interface ITurnsResponse {
	readonly type: 'turnsResponse';
	readonly session: URI;
	readonly startTurn: number;
	readonly turns: ISessionState['turns'];
	readonly totalTurns: number;
}

/**
 * Response to a listSessions command.
 */
export interface IListSessionsResponse {
	readonly type: 'listSessionsResponse';
	readonly sessions: readonly ISessionSummary[];
}

/**
 * Sent on reconnection. Contains fresh snapshots for all previously
 * subscribed URIs. Notifications are NOT replayed — the client should
 * re-fetch the session list.
 */
export interface IReconnectResponse {
	readonly type: 'reconnectResponse';
	readonly serverSeq: number;
	readonly snapshots: readonly IStateSnapshot[];
}

export type IServerMessage =
	| IServerHello
	| IStateSnapshot
	| IActionMessage
	| INotificationMessage
	| IContentResponse
	| ITurnsResponse
	| IListSessionsResponse
	| IReconnectResponse;
