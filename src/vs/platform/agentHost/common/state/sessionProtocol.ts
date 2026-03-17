/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-exports protocol command and error types, adds JSON-RPC 2.0 framing types
// and VS Code-specific extras (ISetAuthTokenParams, ProtocolError class).

import { hasKey } from '../../../../base/common/types.js';
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

// ---- JSON-RPC 2.0 base types -----------------------------------------------

/** A JSON-RPC notification: has `method` but no `id`. */
export interface IJsonRpcNotification {
	readonly jsonrpc: '2.0';
	readonly method: string;
	readonly params?: unknown;
}

/** @deprecated Use IJsonRpcNotification instead. */
export type IProtocolNotification = IJsonRpcNotification;

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
export type IProtocolMessage = IJsonRpcNotification | IProtocolRequest | IJsonRpcResponse;

// ---- Type guards -----------------------------------------------------------

export function isJsonRpcRequest(msg: IProtocolMessage): msg is IProtocolRequest {
	return hasKey(msg, { id: true, method: true });
}

export function isJsonRpcNotification(msg: IProtocolMessage): msg is IJsonRpcNotification {
	return hasKey(msg, { method: true }) && !hasKey(msg, { id: true });
}

export function isJsonRpcResponse(msg: IProtocolMessage): msg is IJsonRpcResponse {
	return hasKey(msg, { id: true }) && !hasKey(msg, { method: true });
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
