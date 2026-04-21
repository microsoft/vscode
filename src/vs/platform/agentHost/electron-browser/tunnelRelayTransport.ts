/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { IAhpServerNotification, IJsonRpcResponse, IProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IProtocolTransport } from '../common/state/sessionTransport.js';
import type { ITunnelAgentHostMainService, ITunnelRelayMessage } from '../common/tunnelAgentHost.js';
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from '../common/transportConstants.js';

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

	private _malformedFrames = 0;

	constructor(
		private readonly _connectionId: string,
		private readonly _tunnelService: ITunnelAgentHostMainService,
	) {
		super();

		// Listen for relay messages from the shared process
		this._register(this._tunnelService.onDidRelayMessage((msg: ITunnelRelayMessage) => {
			if (msg.connectionId !== this._connectionId) {
				return;
			}
			let parsed: IProtocolMessage;
			try {
				parsed = JSON.parse(msg.data) as IProtocolMessage;
			} catch (err) {
				this._malformedFrames++;
				if (this._malformedFrames <= MALFORMED_FRAMES_LOG_CAP) {
					const preview = msg.data.length > 80 ? msg.data.slice(0, 80) + '…' : msg.data;
					console.warn(
						`[TunnelRelayTransport] Malformed frame #${this._malformedFrames} (len=${msg.data.length}): ${preview}`,
						err instanceof Error ? err.message : String(err)
					);
				}
				if (this._malformedFrames > MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD) {
					console.warn('[TunnelRelayTransport] Malformed frame threshold exceeded; closing relay.');
					this._tunnelService.disconnect(this._connectionId).catch(() => { /* best effort */ });
				}
				return;
			}
			this._onMessage.fire(parsed);
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
