/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol messages using JSON-RPC 2.0 framing for the sessions process.
// See protocol.md for the full design.
//
// Client → Server messages are either:
//   - Notifications (fire-and-forget): unsubscribe, dispatchAction
//   - Requests (expect a correlated response): initialize, reconnect, subscribe,
//     createSession, disposeSession, listSessions, fetchTurns, fetchContent
//
// Server → Client messages are either:
//   - Notifications (pushed to clients): action, notification
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

export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INTERNAL_ERROR = -32603;

// ---- AHP application error codes -------------------------------------------

export const AHP_SESSION_NOT_FOUND = -32001;
export const AHP_PROVIDER_NOT_FOUND = -32002;
export const AHP_SESSION_ALREADY_EXISTS = -32003;
export const AHP_TURN_IN_PROGRESS = -32004;
export const AHP_UNSUPPORTED_PROTOCOL_VERSION = -32005;
export const AHP_CONTENT_NOT_FOUND = -32006;

/**
 * Error with a JSON-RPC error code for protocol-level failures.
 */
export class ProtocolError extends Error {
	constructor(readonly code: number, message: string) {
		super(message);
	}
}

// ---- Shared data types ------------------------------------------------------

/** State snapshot returned by subscribe and included in handshake/reconnect. */
export interface IStateSnapshot {
	readonly resource: URI;
	readonly state: IRootState | ISessionState;
	readonly fromSeq: number;
}

// ---- Client → Server: Notification params -----------------------------------

export interface IUnsubscribeParams {
	readonly resource: URI;
}

export interface IDispatchActionParams {
	readonly clientSeq: number;
	readonly action: ISessionAction;
}

// ---- Client → Server: Request params and results ----------------------------

export interface IInitializeParams {
	readonly protocolVersion: number;
	readonly clientId: string;
	readonly initialSubscriptions?: readonly URI[];
}

export interface IInitializeResult {
	readonly protocolVersion: number;
	readonly serverSeq: number;
	readonly snapshots: readonly IStateSnapshot[];
	readonly homeDirectory?: string;
}

export interface IReconnectParams {
	readonly clientId: string;
	readonly lastSeenServerSeq: number;
	readonly subscriptions: readonly URI[];
}

export type IReconnectResult =
	| IReconnectReplayResult
	| IReconnectSnapshotResult;

export interface IReconnectReplayResult {
	readonly type: 'replay';
	readonly actions: readonly IActionEnvelope[];
}

export interface IReconnectSnapshotResult {
	readonly type: 'snapshot';
	readonly snapshots: readonly IStateSnapshot[];
}

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

export interface ISetAuthTokenParams {
	readonly token: string;
}
// Result: void (null)

// listSessions: no params
export interface IListSessionsResult {
	readonly sessions: readonly ISessionSummary[];
}

export interface IFetchTurnsParams {
	readonly session: URI;
	readonly before?: string;
	readonly limit?: number;
}

export interface IFetchTurnsResult {
	readonly turns: ISessionState['turns'];
	readonly hasMore: boolean;
}

export interface IFetchContentParams {
	readonly uri: URI;
}

export interface IFetchContentResult {
	readonly data: string;
	readonly encoding: 'base64' | 'utf-8';
	readonly mimeType?: string;
}

// ---- Filesystem browsing ----------------------------------------------------

export interface IBrowseDirectoryParams {
	readonly path: string;
}

export interface IDirectoryEntry {
	readonly name: string;
	readonly path: string;
	readonly type: 'file' | 'directory';
}

export interface IBrowseDirectoryResult {
	readonly entries: readonly IDirectoryEntry[];
}

// ---- Server → Client: Notification params -----------------------------------

export interface IActionBroadcastParams {
	readonly envelope: IActionEnvelope<IStateAction>;
}

export interface INotificationBroadcastParams {
	readonly notification: INotification;
}
