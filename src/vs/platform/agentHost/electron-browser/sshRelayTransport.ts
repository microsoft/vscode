/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { AhpJsonlLogger, getAhpLogByteLength } from '../common/ahpJsonlLogger.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IProtocolTransport } from '../common/state/sessionTransport.js';
import type { ISSHRelayMessage, ISSHRemoteAgentHostMainService } from '../common/sshRemoteAgentHost.js';

/**
 * A protocol transport that relays messages through the shared process
 * SSH tunnel via IPC, instead of using a direct WebSocket connection.
 *
 * The shared process manages the actual WebSocket-over-SSH connection
 * and forwards messages bidirectionally through this IPC channel.
 */
export class SSHRelayTransport extends Disposable implements IProtocolTransport {

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	constructor(
		private readonly _connectionId: string,
		private readonly _sshService: ISSHRemoteAgentHostMainService,
		private readonly _ahpLogger?: AhpJsonlLogger,
	) {
		super();
		if (this._ahpLogger) {
			this._register(this._ahpLogger);
		}

		// Listen for relay messages from the shared process
		this._register(this._sshService.onDidRelayMessage((msg: ISSHRelayMessage) => {
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

		// Listen for relay close
		this._register(this._sshService.onDidRelayClose((closedId: string) => {
			if (closedId === this._connectionId) {
				this._onClose.fire();
			}
		}));
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcResponse | JsonRpcRequest): void {
		const text = JSON.stringify(message);
		this._ahpLogger?.log(message, 'c2s', getAhpLogByteLength(text));
		this._sshService.relaySend(this._connectionId, text).catch(() => {
			// Send failed — connection probably closed
		});
	}
}
