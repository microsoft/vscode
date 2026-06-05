/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { AhpJsonlLogger, getAhpLogByteLength } from './ahpJsonlLogger.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from './state/sessionProtocol.js';
import type { IProtocolTransport } from './state/sessionTransport.js';

/**
 * A message relayed from a remote agent host through a tunnel managed
 * by the shared process. The shared process acts as a WebSocket proxy,
 * forwarding JSON messages bidirectionally via IPC.
 */
export interface IRelayMessage {
	readonly connectionId: string;
	readonly data: string;
}

/**
 * Minimal IPC surface needed by {@link RelayTransport} to pump frames
 * between the renderer and a shared-process-owned tunnel. Structural —
 * any main-service interface exposing these members satisfies it.
 */
export interface IRelayChannel {
	readonly onDidRelayMessage: Event<IRelayMessage>;
	readonly onDidRelayClose: Event<string /* connectionId */>;
	relaySend(connectionId: string, message: string): Promise<void>;
}

/**
 * A protocol transport that relays messages through a shared-process
 * tunnel via IPC, instead of using a direct WebSocket connection.
 *
 * The shared process manages the actual underlying transport (WebSocket
 * over SSH, WSL stdio, etc.) and forwards messages bidirectionally
 * through this IPC channel.
 */
export class RelayTransport extends Disposable implements IProtocolTransport {

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	constructor(
		private readonly _connectionId: string,
		private readonly _channel: IRelayChannel,
		private readonly _ahpLogger: AhpJsonlLogger | undefined,
		private readonly _logService: ILogService,
		private readonly _logPrefix: string,
	) {
		super();
		if (this._ahpLogger) {
			this._register(this._ahpLogger);
		}

		this._register(this._channel.onDidRelayMessage((msg: IRelayMessage) => {
			if (msg.connectionId === this._connectionId) {
				try {
					const parsed = JSON.parse(msg.data) as ProtocolMessage;
					this._ahpLogger?.log(parsed, 's2c', getAhpLogByteLength(msg.data));
					this._onMessage.fire(parsed);
				} catch {
					// Malformed message — drop
				}
			}
		}));

		this._register(this._channel.onDidRelayClose((closedId: string) => {
			if (closedId === this._connectionId) {
				this._logService.info(`${this._logPrefix} onDidRelayClose`);
				this._onClose.fire();
			}
		}));
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcResponse | JsonRpcRequest): void {
		const text = JSON.stringify(message);
		this._ahpLogger?.log(message, 'c2s', getAhpLogByteLength(text));
		this._channel.relaySend(this._connectionId, text).catch((err) => {
			this._logService.error(`${this._logPrefix} relaySend failed`, err);
		});
	}
}
