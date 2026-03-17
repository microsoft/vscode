/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol messages using JSON-RPC 2.0 framing for the sessions process.
// See protocol.md for the full design.
//
// Client → Server messages are either:
//   - Notifications (fire-and-forget): initialize, reconnect, unsubscribe, dispatchAction
//   - Requests (expect a correlated response): subscribe, createSession, disposeSession,
//     listSessions, fetchTurns, fetchContent
//
// Server → Client messages are either:
//   - Notifications (pushed to clients): serverHello, reconnectResponse, action, notification
//   - Responses (correlated to a client request by id)

import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import type { IActionEnvelope, INotification, ISessionAction, IStateAction } from './sessionActions.js';
import type { IRootState, ISessionState, ISessionSummary } from './sessionState.js';

// ---- JSON-RPC 2.0 base types -----------------------------------------------

/** A JSON-RPC notification: has `method` but no `id`. */
export interface IProtocolNotification {
	readonly jsonrpc: '2.0';
	readonly method: string;
	readonly params?: unknown;
}

/** A JSON-RPC request: has both `method` and `id`. */
export interface IProtocolRequest {
	readonly jsonrpc: '2.0';
	readonly id: number;
	readonly method: string;
	readonly params?: unknown;
}

/** A JSON-RPC success response. */
export interface IJsonRpcSuccessResponse {
	readonly jsonrpc: '2.0';
	readonly id: number;
	readonly result: unknown;
}

/** A JSON-RPC error response. */
export interface IJsonRpcErrorResponse {
	readonly jsonrpc: '2.0';
	readonly id: number;
	readonly error: {
		readonly code: number;
		readonly message: string;
		readonly data?: unknown;
	};
}

export type IJsonRpcResponse = IJsonRpcSuccessResponse | IJsonRpcErrorResponse;

/** Any message that flows over the protocol transport. */
export type IProtocolMessage = IProtocolNotification | IProtocolRequest | IJsonRpcResponse;

// ---- Type guards -----------------------------------------------------------

export function isJsonRpcRequest(msg: IProtocolMessage): msg is IProtocolRequest {
	return hasKey(msg, { id: true, method: true });
}

export function isJsonRpcNotification(msg: IProtocolMessage): msg is IProtocolNotification {
	return hasKey(msg, { method: true }) && !hasKey(msg, { id: true });
}

export function isJsonRpcResponse(msg: IProtocolMessage): msg is IJsonRpcResponse {
	return hasKey(msg, { id: true }) && !hasKey(msg, { method: true });
}

// ---- JSON-RPC error codes ---------------------------------------------------

export const JSON_RPC_INTERNAL_ERROR = -32603;

// ---- Shared data types ------------------------------------------------------

/** State snapshot returned by subscribe and included in handshake/reconnect. */
export interface IStateSnapshot {
	readonly resource: URI;
	readonly state: IRootState | ISessionState;
	readonly fromSeq: number;
}

// ---- Client → Server: Notification params -----------------------------------

export interface IInitializeParams {
	readonly protocolVersion: number;
	readonly clientId: string;
	readonly initialSubscriptions?: readonly URI[];
}

export interface IReconnectParams {
	readonly clientId: string;
	readonly lastSeenServerSeq: number;
	readonly subscriptions: readonly URI[];
}

export interface IUnsubscribeParams {
	readonly resource: URI;
}

export interface IDispatchActionParams {
	readonly clientSeq: number;
	readonly action: ISessionAction;
}

// ---- Client → Server: Request params and results ----------------------------

export interface ISubscribeParams {
	readonly resource: URI;
}
// Result: IStateSnapshot

export interface ICreateSessionParams {
	readonly session: URI;
	readonly provider?: string;
	readonly model?: string;
	readonly workingDirectory?: string;
}
// Result: void (null)

export interface IDisposeSessionParams {
	readonly session: URI;
}
// Result: void (null)

// listSessions: no params
export interface IListSessionsResult {
	readonly sessions: readonly ISessionSummary[];
}

export interface IFetchTurnsParams {
	readonly session: URI;
	readonly startTurn: number;
	readonly count: number;
}

export interface IFetchTurnsResult {
	readonly session: URI;
	readonly startTurn: number;
	readonly turns: ISessionState['turns'];
	readonly totalTurns: number;
}

export interface IFetchContentParams {
	readonly uri: URI;
}

export interface IFetchContentResult {
	readonly uri: URI;
	readonly data: string; // base64-encoded for binary safety
	readonly mimeType?: string;
}

// ---- Server → Client: Notification params -----------------------------------

export interface IServerHelloParams {
	readonly protocolVersion: number;
	readonly serverSeq: number;
	readonly snapshots: readonly IStateSnapshot[];
}

export interface IReconnectResponseParams {
	readonly serverSeq: number;
	readonly snapshots: readonly IStateSnapshot[];
}

export interface IActionBroadcastParams {
	readonly envelope: IActionEnvelope<IStateAction>;
}

export interface INotificationBroadcastParams {
	readonly notification: INotification;
}
