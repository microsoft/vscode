/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-exports protocol command, error, and message types, adds JSON-RPC 2.0 type
// guards and VS Code-specific extras (ISetAuthTokenParams, ProtocolError class).

import type { IActionEnvelope, INotification } from './sessionActions.js';

// ---- Re-exports from protocol -----------------------------------------------

export { JsonRpcErrorCodes, AhpErrorCodes } from './protocol/errors.js';
export type { AhpErrorCode, JsonRpcErrorCode } from './protocol/errors.js';

export type {
	IInitializeParams,
	IInitializeResult,
	IReconnectParams,
	IReconnectReplayResult,
	IReconnectSnapshotResult,
	IReconnectResult,
	ISubscribeParams,
	ISubscribeResult,
	ICreateSessionParams,
	IDisposeSessionParams,
	IListSessionsParams,
	IListSessionsResult,
	IFetchContentParams,
	IFetchContentResult,
	IFetchTurnsParams,
	IFetchTurnsResult,
	IUnsubscribeParams,
	IDispatchActionParams,
	IBrowseDirectoryParams,
	IBrowseDirectoryEntry,
	IBrowseDirectoryResult,
} from './protocol/commands.js';

export { ReconnectResultType, ContentEncoding } from './protocol/commands.js';

export type { ISnapshot as IStateSnapshot } from './protocol/state.js';

// ---- Re-exports from protocol messages --------------------------------------

export type {
	IJsonRpcRequest,
	IJsonRpcSuccessResponse,
	IJsonRpcErrorResponse,
	IJsonRpcResponse,
	IJsonRpcNotification,
	ICommandMap,
	IClientNotificationMap,
	IServerNotificationMap,
	INotificationMap,
	IAhpRequest,
	IAhpSuccessResponse,
	IAhpResponse,
	IAhpNotification,
	IAhpClientNotification,
	IAhpServerNotification,
} from './protocol/messages.js';

import type { IJsonRpcNotification as _IJsonRpcNotification, IAhpRequest as _IAhpRequest } from './protocol/messages.js';

/** @deprecated Use IJsonRpcNotification from messages.js instead. */
export type IProtocolNotification = _IJsonRpcNotification;

/** @deprecated Use IAhpRequest from messages.js instead. */
export type IProtocolRequest = _IAhpRequest;

// ---- Loose message union (used by transport layer) --------------------------

/**
 * A loosely-typed protocol message as it comes off the wire after JSON.parse.
 * Requests and notifications have `method`; responses have `id` + `result`/`error`.
 * Use {@link protocolReviver} to produce fully typed {@link AhpIncomingMessage}.
 */
export interface IProtocolMessage {
	readonly jsonrpc: '2.0';
	readonly id?: number;
	readonly method?: string;
	readonly params?: unknown;
	readonly result?: unknown;
	readonly error?: { code: number; message: string; data?: unknown };
}

// ---- Type guards -----------------------------------------------------------

export function isJsonRpcRequest(msg: IProtocolMessage): msg is IProtocolMessage & { readonly id: number; readonly method: string } {
	return typeof msg.method === 'string' && typeof msg.id === 'number';
}

export function isJsonRpcNotification(msg: IProtocolMessage): msg is IProtocolMessage & { readonly method: string } {
	return typeof msg.method === 'string' && msg.id === undefined;
}

export function isJsonRpcResponse(msg: IProtocolMessage): msg is IProtocolMessage & { readonly id: number } {
	return typeof msg.id === 'number' && msg.method === undefined;
}

// ---- JSON-RPC error codes (convenience constants) ---------------------------

export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INTERNAL_ERROR = -32603;

// ---- AHP application error codes (convenience constants) --------------------

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

// ---- VS Code-specific commands (not yet in the protocol) --------------------

/** Pushes a GitHub auth token to the agent host for the Copilot SDK. */
export interface ISetAuthTokenParams {
	readonly token: string;
}

// ---- Server → Client: Notification params -----------------------------------

export interface IActionBroadcastParams {
	readonly envelope: IActionEnvelope;
}

export interface INotificationBroadcastParams {
	readonly notification: INotification;
}
