/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import { VSBuffer } from 'vs/base/common/buffer';
import { ISocket, PersistentProtocol } from 'vs/base/parts/ipc/common/ipc.net';
import { NodeSocket, WebSocketNodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { ConsoleLogger, LogLevel } from 'vs/platform/log/common/log';
import { AuthRequest, ConnectionTypeRequest, HandshakeMessage } from 'vs/platform/remote/common/remoteAgentConnection';
import { ServerSocket, ServerWebSocket } from 'vs/platform/remote/common/serverWebSocket';
import * as strings from 'vs/base/common/strings';
export interface ServerProtocolOptions {
	/** The token is how we identify and connect to existing sessions. */
	readonly reconnectionToken: string;
	/** Specifies that the client is trying to reconnect. */
	readonly reconnection: boolean;
	/** If true assume this is not a web socket (always false for code-server). */
	readonly skipWebSocketFrames: boolean;
	/** Whether to support compression (web socket only). */
	readonly permessageDeflate?: boolean;
	/**
	 * Seed zlib with these bytes (web socket only). If parts of inflating was
	 * done in a different zlib instance we need to pass all those bytes into zlib
	 * otherwise the inflate might hit an inflated portion referencing a distance
	 * too far back.
	 */
	readonly inflateBytes?: VSBuffer;
}

export const createSocketWrapper = (netSocket: net.Socket, { skipWebSocketFrames, permessageDeflate, inflateBytes }: ServerProtocolOptions) => {
	const nodeSocket = new NodeSocket(netSocket);
	if (skipWebSocketFrames) {
		return nodeSocket;
	}

	return new WebSocketNodeSocket(
		nodeSocket,
		permessageDeflate || false,
		inflateBytes || null,
		// Always record inflate bytes if using permessage-deflate.
		permessageDeflate || false,
	);
};

export class Protocol extends PersistentProtocol {
	private readonly logger = new ConsoleLogger(LogLevel.Info);

	public getUnderlyingSocket(): net.Socket {
		const socket = this.getSocket();
		return socket instanceof NodeSocket
			? socket.socket
			: (socket as WebSocketNodeSocket).socket.socket;
	}

	/**
	 * Perform a handshake to get a connection request.
	 */
	public handshake(): Promise<ConnectionTypeRequest> {
		this.logger.info('Initiating handshake...');

		return new Promise((resolve, reject) => {
			const cleanup = () => {
				handler.dispose();
				onClose.dispose();
				clearTimeout(timeout);
			};

			const onClose = this.onSocketClose(() => {
				cleanup();
				this.logger.error('Handshake failed');
				reject(new Error('Protocol socket closed unexpectedly'));
			});

			const timeout = setTimeout(() => {
				cleanup();
				this.logger.error('Handshake timed out');
				reject(new Error('Protocol handshake timed out'));
			}, 20000); // Matches the client timeout.

			this.onMessage(rawMessage => {
				const message = rawMessage.toString();
				this.logger.info('Got message', message);
			});

			const handler = this.onControlMessage((rawMessage) => {
				try {
					const raw = rawMessage.toString();
					this.logger.info('Got message', raw);
					const message: HandshakeMessage = JSON.parse(raw);
					switch (message.type) {
						case 'auth':
							return this.authenticate(message);
						case 'connectionType':
							cleanup();
							this.logger.info('Handshake completed');
							return resolve(message);
						default:
							throw new Error('Unrecognized message type');
					}
				} catch (error) {
					cleanup();
					reject(error);
				}
			});

			// Kick off the handshake in case we missed the client's opening shot.
			// TODO: Investigate why that message seems to get lost.
			this.authenticate();
		});
	}

	/**
	 * TODO: This ignores the authentication process entirely for now.
	 */
	private authenticate(_?: AuthRequest): void {
		this.logger.info('Authenticating');
		this.sendMessage({ type: 'sign', data: '' });
	}

	/**
	 * TODO: implement.
	 */
	public tunnel(): void {
		throw new Error('Tunnel is not implemented yet');
	}

	/**
	 * Send a handshake message. In the case of the extension host it should just
	 * send a debug port.
	 */
	public sendMessage(message: HandshakeMessage | { debugPort?: number | null }): void {
		this.sendControl(VSBuffer.fromString(JSON.stringify(message)));
	}

	/**
	 * Disconnect and dispose everything including the underlying socket.
	 */
	public destroy(reason?: string): void {
		try {
			if (reason) {
				this.sendMessage({ type: 'error', reason });
			}
			// If still connected try notifying the client.
			this.sendDisconnect();
		} catch (error) {
			// I think the write might fail if already disconnected.
			this.logger.warn(error.message || error);
		}
		this.dispose(); // This disposes timers and socket event handlers.
		this.getSocket().dispose(); // This will destroy() the socket.
	}

	/**
	 * Get inflateBytes from the current socket.
	 */
	public get inflateBytes(): Uint8Array | undefined {
		const socket = this.getSocket();
		return socket instanceof WebSocketNodeSocket
			? socket.recordedInflateBytes.buffer
			: undefined;
	}
}
