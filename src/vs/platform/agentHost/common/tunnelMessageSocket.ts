/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';

/** A minimal bidirectional text-message socket over a tunnel byte stream. */
export interface ITunnelMessageSocket extends IDisposable {
	/** Send a text message. */
	send(data: string): void;
	/** Fires for each complete text message received. */
	readonly onDidReceiveMessage: Event<string>;
	/** Fires once when the socket closes, for any reason. */
	readonly onDidClose: Event<ITunnelSocketCloseEvent>;
	/** Initiate a clean close. */
	close(): void;
}

/** Describes why a tunnel message socket closed. */
export interface ITunnelSocketCloseEvent {
	readonly code?: number;
	readonly reason?: string;
	readonly error?: Error;
}

/** The subset of a tunnel relay duplex stream used to perform an HTTP upgrade. */
export interface ITunnelDuplexStream {
	readonly remoteAddress?: string;
	on(event: 'data', listener: (chunk: Uint8Array) => void): void;
	on(event: 'error', listener: (err: Error) => void): void;
	on(event: 'close', listener: (hadError?: boolean) => void): void;
	on(event: 'end' | 'drain' | 'pause' | 'resume', listener: () => void): void;
	removeListener(event: 'data', listener: (chunk: Uint8Array) => void): void;
	removeListener(event: 'error', listener: (err: Error) => void): void;
	removeListener(event: 'close', listener: (hadError?: boolean) => void): void;
	removeListener(event: 'end' | 'drain' | 'pause' | 'resume', listener: () => void): void;
	removeAllListeners(event: 'error'): void;
	write(chunk: Uint8Array | string): boolean;
	end(): void;
	destroy(): void;
	pause(): void;
	resume(): void;
}

/** A socket-shaped view that supplies TCP methods expected by the framing implementation. */
export interface IWebSocketDuplexStream extends ITunnelDuplexStream {
	write(chunk: Uint8Array | string, callback?: (error?: Error) => void): boolean;
	setNoDelay(enable: boolean): void;
	setTimeout(timeout: number): void;
	setKeepAlive(enable: boolean, initialDelay?: number): void;
}

/** Configuration consumed by the bundled `WebSocketConnection` framing implementation. */
export interface IWebSocketConnectionConfig {
	readonly maxReceivedFrameSize: number;
	readonly maxReceivedMessageSize: number;
	readonly fragmentOutgoingMessages: boolean;
	readonly fragmentationThreshold: number;
	readonly webSocketVersion: 13;
	readonly assembleFragments: boolean;
	readonly disableNagleAlgorithm: boolean;
	readonly closeTimeout: number;
}

/** A message emitted by the bundled `WebSocketConnection` framing implementation. */
export type WebSocketConnectionMessage = { readonly type: 'utf8'; readonly utf8Data: string } | { readonly type: 'binary'; readonly binaryData: Uint8Array };

/** The event-emitter surface used by the WebSocket-over-duplex adapter. */
export interface IWebSocketConnection {
	_addSocketEventListeners(): void;
	handleSocketData(data: Uint8Array): void;
	on(event: 'message', listener: (message: WebSocketConnectionMessage) => void): void;
	on(event: 'close', listener: (code: number, reason: string) => void): void;
	on(event: 'error', listener: (error: Error) => void): void;
	removeListener(event: 'message', listener: (message: WebSocketConnectionMessage) => void): void;
	removeListener(event: 'close', listener: (code: number, reason: string) => void): void;
	removeListener(event: 'error', listener: (error: Error) => void): void;
	send(data: string): void;
	close(): void;
}

/** Constructs the bundled `WebSocketConnection` framing implementation. */
export interface WebSocketConnectionCtor {
	new(stream: IWebSocketDuplexStream, extensions: [], protocol: string | null, maskOutgoingPackets: boolean, config: IWebSocketConnectionConfig): IWebSocketConnection;
}
