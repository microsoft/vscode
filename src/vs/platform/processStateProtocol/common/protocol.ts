/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

/**
 * Process State Protocol (PSP) — wire types and constants.
 *
 * PSP is a tiny JSON-RPC-shaped protocol that lets a long-running CLI publish a live "watch
 * document" (status, logs, diagnostics, ...) to a local hub. The hub is hosted in the editor's
 * main process; the renderer subscribes via IPC.
 *
 * This module is environment-agnostic and runs in renderers, the main process, and node-only
 * publisher libraries.
 *
 * NOTE: The protocol is in active prototyping — there is no stability guarantee yet.
 */

/** Environment variable that carries the hub endpoint address (named-pipe path or UDS path). */
export const ENV_VAR_ENDPOINT = 'PROCESS_STATE_PROTOCOL_ENDPOINT';

/** Environment variable that carries the per-publisher attribution token. */
export const ENV_VAR_TOKEN = 'PROCESS_STATE_PROTOCOL_TOKEN';

/** URI scheme used to surface live PSP documents in the editor. */
export const PSP_URI_SCHEME = 'psp';

/** Current wire protocol version. */
export const PROTOCOL_VERSION = 0;

/** IPC channel name for the main-process PSP service. */
export const PSP_MAIN_CHANNEL_NAME = 'processStateProtocol';

/**
 * Live state document published by a CLI. The shape is open — publishers add whatever fields
 * they need (build summaries, diagnostics, ...); only `status` is required.
 */
export interface IWatchDoc {
	readonly status: string;
	readonly [key: string]: unknown;
}

export const initialWatchDoc: IWatchDoc = { status: 'idle' };

/**
 * Serialisable snapshot of a connected session. Crossed over IPC; for renderer-side consumers
 * with an observable doc see the workbench-side {@link IPspSession}.
 */
export interface IPspSessionSnapshot {
	readonly id: string;
	readonly token: string;
	readonly client?: { readonly name?: string; readonly version?: string };
	readonly doc: IWatchDoc;
}

// --- Main-process service decorator -------------------------------------------------------------

export const IProcessStateProtocolMainService = createDecorator<IProcessStateProtocolMainService>('processStateProtocolMainService');

/**
 * Main-process owner of the PSP hub. Exposed to renderers over IPC.
 */
export interface IProcessStateProtocolMainService {
	readonly _serviceBrand: undefined;

	/** Endpoint the hub is listening on. Resolved once the underlying socket is bound. */
	getEndpoint(): Promise<string>;

	/**
	 * Registers a token tied to a context (typically: a renderer-allocated terminal). Until
	 * revoked, a publisher presenting this token during `initialize` becomes the session for
	 * that context.
	 */
	claimToken(token: string): Promise<void>;

	/** Releases a token. Any active session bound to it is dropped. */
	revokeToken(token: string): Promise<void>;

	/**
	 * Fires the full active-session snapshot whenever a session is added, removed, or updated.
	 */
	readonly onDidChangeSessions: Event<readonly IPspSessionSnapshot[]>;
}

// --- Wire methods (publisher → hub) -------------------------------------------------------------

export const enum PspMethod {
	Initialize = 'initialize',
	SessionUpdate = 'session/update',
	SessionClose = 'session/close',
}

/** First message after the socket opens. Authenticates the publisher and announces itself. */
export interface IInitializeParams {
	readonly token: string;
	readonly protocolVersion: number;
	readonly client?: { readonly name?: string; readonly version?: string };
}

export interface IInitializeResult {
	readonly protocolVersion: number;
	readonly sessionId: string;
}

/** Notification: replace the entire watch document. */
export interface ISessionUpdateParams {
	readonly doc: IWatchDoc;
}

/** Notification: publisher is leaving. */
export interface ISessionCloseParams {
	readonly exitCode?: number;
}

// --- Newline-delimited JSON-RPC framing ---------------------------------------------------------
//
// Prototype framing: one JSON-RPC 2.0 message per line, UTF-8, terminated by '\n'. JSON.stringify
// never emits raw newlines, so this is unambiguous as long as both sides use it.

export interface IJsonRpcRequest {
	readonly jsonrpc: '2.0';
	readonly id: number | string;
	readonly method: string;
	readonly params?: unknown;
}

export interface IJsonRpcNotification {
	readonly jsonrpc: '2.0';
	readonly method: string;
	readonly params?: unknown;
}

export interface IJsonRpcResponse {
	readonly jsonrpc: '2.0';
	readonly id: number | string;
	readonly result?: unknown;
	readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

export type JsonRpcMessage = IJsonRpcRequest | IJsonRpcNotification | IJsonRpcResponse;

export function encodeMessage(msg: JsonRpcMessage): string {
	return JSON.stringify(msg) + '\n';
}

/**
 * Splits a buffer of received text into complete JSON-RPC messages. Returns the parsed messages
 * and the remaining (unterminated) tail to keep buffering.
 */
export function decodeMessages(buffer: string): { readonly messages: JsonRpcMessage[]; readonly tail: string } {
	const messages: JsonRpcMessage[] = [];
	let start = 0;
	while (true) {
		const nl = buffer.indexOf('\n', start);
		if (nl === -1) {
			break;
		}
		const line = buffer.slice(start, nl).trim();
		start = nl + 1;
		if (line.length === 0) {
			continue;
		}
		messages.push(JSON.parse(line) as JsonRpcMessage);
	}
	return { messages, tail: buffer.slice(start) };
}

