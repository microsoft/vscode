/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// WebSocket client transport for connecting to remote agent host processes.
// Uses plain JSON serialization — URIs are string-typed in the protocol.

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { connectionTokenQueryName } from '../../../base/common/network.js';
import type { IAhpServerNotification, IJsonRpcResponse, IProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IClientTransport } from '../common/state/sessionTransport.js';

// ---- Client transport -------------------------------------------------------

/**
 * A WebSocket client transport that connects to a remote agent host server.
 * Uses the native browser WebSocket API (available in Electron renderer).
 * Implements {@link IClientTransport} with JSON serialization and URI revival.
 */
export class WebSocketClientTransport extends Disposable implements IClientTransport {

	private readonly _onMessage = this._register(new Emitter<IProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private readonly _onOpen = this._register(new Emitter<void>());
	readonly onOpen = this._onOpen.event;

	private _ws: WebSocket | undefined;

	get isOpen(): boolean {
		return this._ws?.readyState === WebSocket.OPEN;
	}

	constructor(
		private readonly _address: string,
		private readonly _connectionToken?: string,
	) {
		super();
	}

	/**
	 * Initiate the WebSocket connection. Resolves when the connection
	 * is open, or rejects on error/timeout.
	 */
	connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (this._store.isDisposed) {
				reject(new Error('Transport is disposed'));
				return;
			}

			let url = this._address.startsWith('ws://') || this._address.startsWith('wss://')
				? this._address
				: `ws://${this._address}`;

			if (this._connectionToken) {
				const separator = url.includes('?') ? '&' : '?';
				url += `${separator}${connectionTokenQueryName}=${encodeURIComponent(this._connectionToken)}`;
			}

			const ws = new WebSocket(url);
			this._ws = ws;

			const onOpen = () => {
				cleanup();
				this._onOpen.fire();
				resolve();
			};

			const onError = () => {
				cleanup();
				reject(new Error(`WebSocket connection failed: ${this._address}`));
			};

			const onClose = () => {
				cleanup();
				reject(new Error(`WebSocket closed before connection was established: ${this._address}`));
			};

			const cleanup = () => {
				ws.removeEventListener('open', onOpen);
				ws.removeEventListener('error', onError);
				ws.removeEventListener('close', onClose);
			};

			ws.addEventListener('open', onOpen);
			ws.addEventListener('error', onError);
			ws.addEventListener('close', onClose);

			// Wire up long-lived listeners after connection
			ws.addEventListener('message', (event: MessageEvent) => {
				try {
					const text = typeof event.data === 'string' ? event.data : '';
					const message = JSON.parse(text) as IProtocolMessage;
					this._onMessage.fire(message);
				} catch {
					// Malformed message - drop.
				}
			});

			ws.addEventListener('close', () => {
				this._onClose.fire();
			});

			ws.addEventListener('error', () => {
				// Error always precedes close - closing is handled in the close handler.
				this._onClose.fire();
			});
		});
	}

	send(message: IProtocolMessage | IAhpServerNotification | IJsonRpcResponse): void {
		if (this._ws?.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify(message));
		}
	}

	override dispose(): void {
		this._ws?.close();
		super.dispose();
	}
}
