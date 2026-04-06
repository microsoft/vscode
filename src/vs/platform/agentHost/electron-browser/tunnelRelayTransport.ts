/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { IAhpServerNotification, IJsonRpcResponse, IProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IProtocolTransport } from '../common/state/sessionTransport.js';
import type { ITunnelAgentHostMainService, ITunnelRelayMessage } from '../common/tunnelAgentHost.js';

/**
 * A protocol transport that relays messages through the shared process
 * tunnel relay via IPC, instead of using a direct WebSocket connection.
 *
 * The shared process manages the actual dev tunnel relay connection
 * and forwards messages bidirectionally through this IPC channel.
 */
export class TunnelRelayTransport extends Disposable implements IProtocolTransport {

	private readonly _onMessage = this._register(new Emitter<IProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	constructor(
		private readonly _connectionId: string,
		private readonly _tunnelService: ITunnelAgentHostMainService,
	) {
		super();

		// Listen for relay messages from the shared process
		this._register(this._tunnelService.onDidRelayMessage((msg: ITunnelRelayMessage) => {
			if (msg.connectionId === this._connectionId) {
				try {
					const parsed = JSON.parse(msg.data) as IProtocolMessage;
					this._onMessage.fire(parsed);
				} catch {
					// Malformed message — drop
				}
			}
		}));

		// Listen for relay close
		this._register(this._tunnelService.onDidRelayClose((closedId: string) => {
			if (closedId === this._connectionId) {
				this._onClose.fire();
			}
		}));
	}

	override dispose(): void {
		// Tear down the shared-process relay connection
		this._tunnelService.disconnect(this._connectionId).catch(() => { /* best effort */ });
		super.dispose();
	}

	send(message: IProtocolMessage | IAhpServerNotification | IJsonRpcResponse): void {
		this._tunnelService.relaySend(this._connectionId, JSON.stringify(message)).catch(() => {
			// Send failed — connection probably closed
		});
	}
}
