/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Transport abstraction for the sessions process protocol.
// See protocol.md -> Client-server protocol for the full design.
//
// The transport is pluggable — the same protocol runs over MessagePort
// (ProxyChannel), WebSocket, or stdio. This module defines the contract;
// concrete implementations live in platform-specific folders.

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import type { IProtocolMessage, IAhpServerNotification, IJsonRpcNotification, IJsonRpcResponse, IJsonRpcRequest } from './sessionProtocol.js';

/**
 * A bidirectional transport for protocol messages. Implementations handle
 * serialization, framing, and connection management.
 */
export interface IProtocolTransport extends IDisposable {
	/** Fires when a message is received from the remote end. */
	readonly onMessage: Event<IProtocolMessage>;

	/** Fires when the transport connection closes. */
	readonly onClose: Event<void>;

	/**
	 * Send a message to the remote end.
	 *
	 * Accepts:
	 * - `IProtocolMessage` — fully-typed client↔server messages.
	 * - `IAhpServerNotification` — server→client notifications.
	 * - `IJsonRpcResponse` — dynamically-constructed success/error responses.
	 */
	send(message: IProtocolMessage | IAhpServerNotification | IJsonRpcNotification | IJsonRpcResponse | IJsonRpcRequest): void;
}

/**
 * A client-side transport that requires an explicit connection step
 * before messages can be exchanged.
 */
export interface IClientTransport extends IProtocolTransport {
	/** Establish the underlying connection (e.g. open a WebSocket). */
	connect(): Promise<void>;
}

/** Type guard for transports that require an explicit connection step. */
export function isClientTransport(transport: IProtocolTransport): transport is IClientTransport {
	return typeof (transport as IClientTransport).connect === 'function';
}

/**
 * Server-side transport that accepts multiple client connections.
 * Each connected client gets its own {@link IProtocolTransport}.
 */
export interface IProtocolServer extends IDisposable {
	/** Fires when a new client connects. */
	readonly onConnection: Event<IProtocolTransport>;

	/** The port or address the server is listening on. */
	readonly address: string | undefined;
}
