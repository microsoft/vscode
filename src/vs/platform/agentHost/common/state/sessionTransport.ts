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
import type { AgentHostClientConnectionKind, AgentHostTransportKind } from '../agentHostTelemetry.js';
import type { ProtocolMessage, AhpServerNotification, JsonRpcNotification, JsonRpcParseErrorResponse, JsonRpcResponse, JsonRpcRequest } from './sessionProtocol.js';

/** Machine-readable reasons a transport cannot be reconnected. */
export const enum AgentHostTransportFailureReason {
	Unknown = 'unknown',
	HostNotRunning = 'hostNotRunning',
}

/** Signals that reconnecting the transport cannot recover the connection. */
export class NonReconnectableTransportError extends Error {
	constructor(message: string, readonly reason: AgentHostTransportFailureReason = AgentHostTransportFailureReason.Unknown) {
		super(message);
	}
}

/**
 * A bidirectional transport for protocol messages. Implementations handle
 * serialization, framing, and connection management.
 */
export interface IProtocolTransport extends IDisposable {
	/** Physical transport accepted by the agent host. */
	readonly transportKind?: AgentHostTransportKind;

	/** Route used by a VS Code client to reach the agent host. */
	readonly clientConnectionKind?: AgentHostClientConnectionKind;

	/** Fires when a message is received from the remote end. */
	readonly onMessage: Event<ProtocolMessage>;

	/** Fires when the transport connection closes. */
	readonly onClose: Event<void>;

	/**
	 * Send a message to the remote end.
	 *
	 * Accepts:
	 * - `ProtocolMessage` — fully-typed client↔server messages.
	 * - `AhpServerNotification` — server→client notifications.
	 * - `JsonRpcResponse` — dynamically-constructed success/error responses.
	 */
	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcParseErrorResponse | JsonRpcResponse | JsonRpcRequest): void;
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
