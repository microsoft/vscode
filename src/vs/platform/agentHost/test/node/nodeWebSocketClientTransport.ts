/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { connectionTokenQueryName } from '../../../../base/common/network.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentHostClientConnectionKind, AgentHostTransportKind } from '../../common/agentHostTelemetry.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcParseErrorResponse, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IClientTransport } from '../../common/state/sessionTransport.js';
import type * as wsTypes from 'ws';

/**
 * Node WebSocket transport for an outbound AHP client.
 */
export class NodeWebSocketClientTransport extends Disposable implements IClientTransport {
	readonly clientConnectionKind = AgentHostClientConnectionKind.DirectWebSocket;
	readonly transportKind = AgentHostTransportKind.WebSocket;

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private readonly _socketListeners = this._register(new MutableDisposable<DisposableStore>());
	private _socket: wsTypes.WebSocket | undefined;
	private _connectPromise: Promise<void> | undefined;
	private _closeFired = false;

	static async createFactory(address: string, connectionToken: string | undefined, logService: ILogService): Promise<() => NodeWebSocketClientTransport> {
		const { WebSocket } = await import('ws');
		return () => new NodeWebSocketClientTransport(address, connectionToken, logService, WebSocket);
	}

	private constructor(
		private readonly _address: string,
		private readonly _connectionToken: string | undefined,
		private readonly _logService: ILogService,
		private readonly _WebSocket: typeof wsTypes.WebSocket,
	) {
		super();
	}

	connect(): Promise<void> {
		if (this._store.isDisposed) {
			return Promise.reject(new Error('Node WebSocket transport is disposed.'));
		}
		return this._connectPromise ??= this._connect();
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcParseErrorResponse | JsonRpcResponse | JsonRpcRequest): void {
		const socket = this._socket;
		if (!socket || socket.readyState !== this._WebSocket.OPEN) {
			this._logService.warn(`[NodeWebSocketClientTransport] Cannot send because ${this._address} is not open.`);
			this._fireClose();
			return;
		}
		socket.send(JSON.stringify(message), error => {
			if (error) {
				this._logService.warn(`[NodeWebSocketClientTransport] Failed to send to ${this._address}.`, error);
				this._fireClose();
				socket.close();
			}
		});
	}

	private _connect(): Promise<void> {
		const socket = new this._WebSocket(this._url());
		this._socket = socket;
		return new Promise<void>((resolve, reject) => {
			const onOpen = () => {
				cleanup();
				this._listen(socket);
				resolve();
			};
			const onError = (error: Error) => {
				cleanup();
				this._logService.warn(`[NodeWebSocketClientTransport] Failed to connect to ${this._address}.`, error);
				this._fireClose();
				reject(error);
			};
			const onClose = () => {
				cleanup();
				this._fireClose();
				reject(new Error(`WebSocket closed before connecting to ${this._address}.`));
			};
			const cleanup = () => {
				socket.off('open', onOpen);
				socket.off('error', onError);
				socket.off('close', onClose);
			};
			socket.on('open', onOpen);
			socket.on('error', onError);
			socket.on('close', onClose);
		});
	}

	private _listen(socket: wsTypes.WebSocket): void {
		const listeners = new DisposableStore();
		const onMessage = (data: wsTypes.RawData, isBinary: boolean) => {
			if (isBinary) {
				this._logService.warn(`[NodeWebSocketClientTransport] Received a binary AHP frame from ${this._address}.`);
				socket.close(1003, 'binary-frame');
				this._fireClose();
				return;
			}
			try {
				this._onMessage.fire(JSON.parse(data.toString()) as ProtocolMessage);
			} catch (error) {
				this._logService.warn(`[NodeWebSocketClientTransport] Received invalid AHP JSON from ${this._address}.`, error);
				socket.close(1003, 'invalid-json');
				this._fireClose();
			}
		};
		const onClose = () => this._fireClose();
		const onError = (error: Error) => {
			this._logService.warn(`[NodeWebSocketClientTransport] Connection to ${this._address} failed.`, error);
			this._fireClose();
		};
		socket.on('message', onMessage);
		socket.on('close', onClose);
		socket.on('error', onError);
		listeners.add(toDisposable(() => {
			socket.off('message', onMessage);
			socket.off('close', onClose);
			socket.off('error', onError);
		}));
		this._socketListeners.value = listeners;
	}

	private _url(): string {
		const value = this._address.startsWith('ws://') || this._address.startsWith('wss://')
			? this._address
			: `ws://${this._address}`;
		const url = new URL(value);
		if (this._connectionToken) {
			url.searchParams.set(connectionTokenQueryName, this._connectionToken);
		}
		return url.toString();
	}

	private _fireClose(): void {
		if (this._closeFired) {
			return;
		}
		this._closeFired = true;
		this._onClose.fire();
	}

	override dispose(): void {
		this._socketListeners.clear();
		this._socket?.close();
		this._fireClose();
		super.dispose();
	}
}
