/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// IPC channel transport for the agent host protocol. Wraps an `IChannel`
// (typically obtained via `IRemoteAgentConnection.getChannel('agentHost')`)
// to satisfy the same `IClientTransport` interface as `WebSocketClientTransport`,
// so the existing `RemoteAgentHostProtocolClient` can be reused unchanged.
//
// The server-side counterpart (`AgentHostChannel`) opens an AHP WebSocket
// upstream to the local agent host process and pipes raw JSON frames over
// the IPC channel.

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { IChannel } from '../../../base/parts/ipc/common/ipc.js';
import type { AhpServerNotification, JsonRpcResponse, ProtocolMessage } from '../common/state/sessionProtocol.js';
import type { IClientTransport } from '../common/state/sessionTransport.js';
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from '../common/transportConstants.js';

/**
 * Wraps an {@link IChannel} as an {@link IClientTransport} for the agent
 * host protocol. Frames are passed as JSON strings to avoid the IPC layer's
 * URI revival (URIs in AHP are string-typed on the wire).
 *
 * Wire shape:
 * - `listen('frame')` → emits each upstream JSON frame as a string.
 * - `listen('close')` → fires when the upstream connection closes.
 * - `call('connect')` → opens the upstream connection; resolves when ready.
 * - `call('send', frame)` → forwards a JSON frame upstream.
 */
export class AgentHostIpcChannelTransport extends Disposable implements IClientTransport {

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private _isOpen = false;
	private _closeFired = false;
	private _malformedFrames = 0;

	constructor(private readonly _channel: IChannel) {
		super();
	}

	get isOpen(): boolean {
		return this._isOpen && !this._closeFired;
	}

	async connect(): Promise<void> {
		if (this._store.isDisposed) {
			throw new Error('Transport is disposed');
		}
		// Subscribe before connecting so we don't miss any frames the upstream
		// host emits between open and our listener attaching.
		this._register(this._channel.listen<string>('frame')(text => this._handleFrame(text)));
		this._register(this._channel.listen<void>('close')(() => this._fireClose()));
		await this._channel.call('connect');
		this._isOpen = true;
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcResponse): void {
		if (!this._isOpen || this._closeFired) {
			// Surface the failure via the close event; callers observe that.
			this._fireClose();
			return;
		}
		// Fire-and-forget. The channel call resolves asynchronously; failures
		// are surfaced via the close event from the server side.
		this._channel.call('send', JSON.stringify(message)).catch(() => this._fireClose());
	}

	override dispose(): void {
		if (this._isOpen && !this._closeFired) {
			// Best-effort close — ignore any rejection since we're tearing down.
			this._channel.call('close').catch(() => { });
		}
		this._fireClose();
		super.dispose();
	}

	private _handleFrame(text: string): void {
		let message: ProtocolMessage;
		try {
			message = JSON.parse(text) as ProtocolMessage;
		} catch (err) {
			this._malformedFrames++;
			if (this._malformedFrames <= MALFORMED_FRAMES_LOG_CAP) {
				const preview = text.length > 80 ? text.slice(0, 80) + '…' : text;
				console.warn(
					`[AgentHostIpcChannelTransport] Malformed frame #${this._malformedFrames} (len=${text.length}): ${preview}`,
					err instanceof Error ? err.message : String(err)
				);
			}
			if (this._malformedFrames > MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD) {
				console.warn('[AgentHostIpcChannelTransport] Malformed frame threshold exceeded; closing transport.');
				this._fireClose();
			}
			return;
		}
		this._onMessage.fire(message);
	}

	private _fireClose(): void {
		if (this._closeFired) {
			return;
		}
		this._closeFired = true;
		this._isOpen = false;
		this._onClose.fire();
	}
}
