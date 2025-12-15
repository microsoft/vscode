/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Duplex } from 'stream';

/**
 * Creates a pair of in-memory transports that are connected to each other.
 * Messages sent on one transport are received on the other transport.
 * This uses actual Node.js streams to simulate real stdio behavior.
 *
 * @returns A tuple of [serverTransport, clientTransport] where the server
 * and client can communicate with each other through these transports.
 */
export function createInMemoryTransportPair(): [InMemoryTransport, InMemoryTransport] {
	// Create two duplex streams that are connected to each other
	const serverStream = new Duplex({ objectMode: true, allowHalfOpen: false });
	const clientStream = new Duplex({ objectMode: true, allowHalfOpen: false });

	// Cross-connect the streams: server writes go to client reads and vice versa
	// Server stream implementation
	serverStream._write = (chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
		// When server writes, client should receive it
		clientStream.push(chunk);
		callback();
	};

	serverStream._read = () => {
		// Signal that we're ready to read - no action needed for cross-connected streams
	};

	// Client stream implementation
	clientStream._write = (chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
		// When client writes, server should receive it
		serverStream.push(chunk);
		callback();
	};

	clientStream._read = () => {
		// Signal that we're ready to read - no action needed for cross-connected streams
	};

	// Handle stream ending properly
	serverStream.on('end', () => {
		if (!clientStream.destroyed) {
			clientStream.push(null);
		}
	});

	clientStream.on('end', () => {
		if (!serverStream.destroyed) {
			serverStream.push(null);
		}
	});

	const serverTransport = new InMemoryTransport(serverStream);
	const clientTransport = new InMemoryTransport(clientStream);

	return [serverTransport, clientTransport];
}

/**
 * An in-memory transport implementation that allows two MCP endpoints to communicate
 * using Node.js streams, similar to how StdioTransport works. This provides more
 * realistic behavior than direct message passing.
 */
export class InMemoryTransport implements Transport {
	private _stream: Duplex;
	private _started = false;
	private _closed = false;
	private _sessionId: string;

	// Transport callbacks
	public onclose?: () => void;
	public onerror?: (error: Error) => void;
	public onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;

	constructor(stream: Duplex) {
		this._stream = stream;
		this._sessionId = `memory-${Math.random().toString(36).substring(2, 15)}`;

		// Set up stream event handlers
		this._stream.on('data', (data: any) => {
			if (this._started && !this._closed) {
				try {
					// Expect data to be a JSON-RPC message object
					const message = typeof data === 'string' ? JSON.parse(data) : data;
					const extra: MessageExtraInfo | undefined = undefined;
					this.onmessage?.(message, extra);
				} catch (error) {
					this.onerror?.(error instanceof Error ? error : new Error(String(error)));
				}
			}
		});

		this._stream.on('error', (error: Error) => {
			this.onerror?.(error);
		});

		this._stream.on('end', () => {
			this._closed = true;
			this.onclose?.();
		});

		this._stream.on('close', () => {
			this._closed = true;
			this.onclose?.();
		});
	}

	/**
	 * Starts the transport. This must be called before sending or receiving messages.
	 */
	async start(): Promise<void> {
		if (this._started) {
			return;
		}

		if (this._closed) {
			throw new Error('Cannot start a closed transport');
		}

		this._started = true;
	}

	/**
	 * Sends a JSON-RPC message through the stream.
	 */
	async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
		if (!this._started) {
			throw new Error('Transport not started');
		}

		if (this._closed) {
			throw new Error('Transport is closed');
		}

		// Write the message to the stream - similar to how StdioTransport works
		return new Promise<void>((resolve, reject) => {
			this._stream.write(message, (error) => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	/**
	 * Closes the transport and the underlying stream.
	 */
	async close(): Promise<void> {
		if (this._closed) {
			return;
		}

		this._closed = true;

		// End the stream, which will trigger the 'end' event on the peer
		return new Promise<void>((resolve) => {
			this._stream.end(() => {
				resolve();
			});
		});
	}

	/**
	 * Gets the session ID for this transport connection.
	 */
	get sessionId(): string {
		return this._sessionId;
	}

	/**
	 * Sets the protocol version (optional implementation).
	 */
	setProtocolVersion?(version: string): void {
		// No-op for in-memory transport
	}

	/**
	 * Checks if the transport is currently connected and started.
	 */
	get isConnected(): boolean {
		return this._started && !this._closed && !this._stream.destroyed;
	}

	/**
	 * Checks if the transport has been closed.
	 */
	get isClosed(): boolean {
		return this._closed || this._stream.destroyed;
	}
}
