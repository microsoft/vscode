/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { AGENT_HOST_VOICE_MAX_MESSAGE_BYTES, IAgentHostVoiceCloseEvent, isAgentHostVoiceMessageWithinLimit } from '../common/agentHostVoiceRelay.js';
import type * as wsTypes from 'ws';

export interface IAgentHostVoiceWebSocket {
	readonly readyState: number;
	onOpen(listener: () => void): IDisposable;
	onMessage(listener: (data: wsTypes.RawData) => void): IDisposable;
	onClose(listener: (code: number, reason: Buffer) => void): IDisposable;
	onError(listener: (error: Error) => void): IDisposable;
	send(data: string): void;
	close(code?: number, reason?: string): void;
}

export type VoiceWebSocketFactory = (url: string) => Promise<IAgentHostVoiceWebSocket>;

async function createVoiceWebSocket(url: string): Promise<IAgentHostVoiceWebSocket> {
	const ws = await import('ws');
	const socket = new ws.WebSocket(url, { maxPayload: AGENT_HOST_VOICE_MAX_MESSAGE_BYTES });
	return {
		get readyState() { return socket.readyState; },
		onOpen: listener => {
			socket.on('open', listener);
			return toDisposable(() => socket.off('open', listener));
		},
		onMessage: listener => {
			socket.on('message', listener);
			return toDisposable(() => socket.off('message', listener));
		},
		onClose: listener => {
			socket.on('close', listener);
			return toDisposable(() => socket.off('close', listener));
		},
		onError: listener => {
			socket.on('error', listener);
			return toDisposable(() => socket.off('error', listener));
		},
		send: data => socket.send(data),
		close: (code, reason) => socket.close(code, reason),
	};
}

/**
 * Owns one host-side connection to the Voice backend. The caller is
 * responsible for forwarding the emitted payloads over its AHS transport.
 */
export class AgentHostVoiceRelay extends Disposable {

	private readonly _onDidReceiveMessage = this._register(new Emitter<string>());
	readonly onDidReceiveMessage: Event<string> = this._onDidReceiveMessage.event;

	private readonly _onDidClose = this._register(new Emitter<IAgentHostVoiceCloseEvent>());
	readonly onDidClose: Event<IAgentHostVoiceCloseEvent> = this._onDidClose.event;

	private readonly _socketListeners = this._register(new DisposableStore());
	private _socket: IAgentHostVoiceWebSocket | undefined;
	private _generation = 0;
	private _isDisposed = false;
	private _pendingConnectReject: ((error: Error) => void) | undefined;

	constructor(
		private readonly _backendUrl: string,
		private readonly _webSocketFactory: VoiceWebSocketFactory = createVoiceWebSocket,
	) {
		super();
	}

	async connect(authToken?: string): Promise<void> {
		const generation = ++this._generation;
		this._pendingConnectReject?.(new CancellationError());
		this._pendingConnectReject = undefined;
		this._closeSocket('Voice connection replaced');

		const url = new URL(this._backendUrl);
		if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
			throw new Error(`Unsupported Voice backend protocol: ${url.protocol}`);
		}
		if (authToken) {
			url.searchParams.set('token', authToken);
		}

		const socket = await this._webSocketFactory(url.toString());
		if (this._isDisposed || generation !== this._generation) {
			if (socket.readyState < 2) {
				socket.close(1000, 'Voice connection cancelled');
			}
			throw new CancellationError();
		}
		this._socket = socket;

		await new Promise<void>((resolve, reject) => {
			let settled = false;
			this._pendingConnectReject = error => {
				if (!settled) {
					settled = true;
					reject(error);
				}
			};
			const onOpen = () => {
				if (this._isDisposed || generation !== this._generation || this._socket !== socket) {
					this._pendingConnectReject?.(new CancellationError());
					if (socket.readyState < 2) {
						socket.close(1000, 'Voice connection cancelled');
					}
					return;
				}
				settled = true;
				this._pendingConnectReject = undefined;
				resolve();
			};
			const onMessage = (data: wsTypes.RawData) => {
				if (rawDataByteLength(data) > AGENT_HOST_VOICE_MAX_MESSAGE_BYTES) {
					if (socket.readyState < 2) {
						socket.close(1009, 'Voice backend message exceeds the 8 MiB payload limit');
					}
					return;
				}
				const message = rawDataToString(data);
				this._onDidReceiveMessage.fire(message);
			};
			const onClose = (code: number, reason: Buffer) => {
				if (this._socket === socket) {
					this._socket = undefined;
					this._socketListeners.clear();
				}
				const closeEvent = { code, reason: reason.toString() };
				if (!settled) {
					settled = true;
					this._pendingConnectReject = undefined;
					reject(new Error(`Voice backend closed during connection: ${code} ${closeEvent.reason}`));
				}
				this._onDidClose.fire(closeEvent);
			};
			const onError = (error: Error) => {
				if (!settled) {
					settled = true;
					this._pendingConnectReject = undefined;
					reject(error);
				}
			};

			this._socketListeners.add(socket.onOpen(onOpen));
			this._socketListeners.add(socket.onMessage(onMessage));
			this._socketListeners.add(socket.onClose(onClose));
			this._socketListeners.add(socket.onError(onError));
		});
	}

	send(message: string): void {
		if (!isAgentHostVoiceMessageWithinLimit(message)) {
			throw new Error('Voice message exceeds the relay size limit.');
		}
		if (!this._socket || this._socket.readyState !== 1) {
			return;
		}
		this._socket.send(message);
	}

	disconnect(): void {
		this._generation++;
		this._pendingConnectReject?.(new CancellationError());
		this._pendingConnectReject = undefined;
		this._closeSocket('Voice client disconnected');
	}

	private _closeSocket(reason: string): void {
		const socket = this._socket;
		this._socket = undefined;
		this._socketListeners.clear();
		if (socket && socket.readyState < 2) {
			socket.close(1000, reason);
		}
	}

	override dispose(): void {
		this._isDisposed = true;
		this.disconnect();
		super.dispose();
	}
}

function rawDataByteLength(data: wsTypes.RawData): number {
	if (Array.isArray(data)) {
		let byteLength = 0;
		for (const buffer of data) {
			byteLength += buffer.byteLength;
			if (byteLength > AGENT_HOST_VOICE_MAX_MESSAGE_BYTES) {
				break;
			}
		}
		return byteLength;
	}
	return data.byteLength;
}

function rawDataToString(data: wsTypes.RawData): string {
	if (Array.isArray(data)) {
		return Buffer.concat(data).toString();
	}
	if (data instanceof ArrayBuffer) {
		return Buffer.from(new Uint8Array(data)).toString();
	}
	return data.toString();
}
