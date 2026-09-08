/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostClientConnectionKind } from './agentHostTelemetry.js';
import { AhpJsonlLogger, getAhpLogByteLength } from './ahpJsonlLogger.js';
import { type IEstablishedTransport, ReconnectingTransport } from './reconnectingTransport.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from './state/sessionProtocol.js';
import type { IProtocolTransport } from './state/sessionTransport.js';
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from './transportConstants.js';

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
 * Handle for a relay channel established by a {@link ReconnectingRelayTransport}.
 */
export interface IRelayConnectionHandle {
	/** Identifier of the freshly established relay channel. */
	readonly connectionId: string;
	/** Tear down this relay channel. Invoked when the transport is disposed. */
	close?(): Promise<void>;
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

	private _malformedFrames = 0;
	private _closeFired = false;

	constructor(
		protected _connectionId: string | undefined,
		private readonly _channel: IRelayChannel,
		private readonly _ahpLogger: AhpJsonlLogger | undefined,
		protected readonly _logService: ILogService,
		protected readonly _logPrefix: string,
		readonly clientConnectionKind: AgentHostClientConnectionKind,
	) {
		super();
		if (this._ahpLogger) {
			this._register(this._ahpLogger);
		}

		this._register(this._channel.onDidRelayMessage((msg: IRelayMessage) => {
			if (this._connectionId !== undefined && msg.connectionId === this._connectionId) {
				let parsed: ProtocolMessage;
				try {
					parsed = JSON.parse(msg.data) as ProtocolMessage;
				} catch (err) {
					this._malformedFrames++;
					if (this._malformedFrames <= MALFORMED_FRAMES_LOG_CAP) {
						const preview = msg.data.length > 80 ? msg.data.slice(0, 80) + '…' : msg.data;
						this._logService.warn(
							`${this._logPrefix} Malformed frame #${this._malformedFrames} (len=${msg.data.length}): ${preview}`,
							err instanceof Error ? err.message : String(err)
						);
					}
					if (this._malformedFrames > MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD && !this._closeFired) {
						this._logService.warn(`${this._logPrefix} Malformed frame threshold exceeded; closing relay.`);
						this._fireClose();
					}
					return;
				}
				this._ahpLogger?.log(parsed, 's2c', getAhpLogByteLength(msg.data));
				this._onMessage.fire(parsed);
			}
		}));

		this._register(this._channel.onDidRelayClose((closedId: string) => {
			if (this._connectionId !== undefined && closedId === this._connectionId) {
				this._logService.info(`${this._logPrefix} onDidRelayClose`);
				this._fireClose();
			}
		}));
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcResponse | JsonRpcRequest): void {
		const connectionId = this._connectionId;
		if (connectionId === undefined) {
			// No channel adopted yet (or already released). Dropping silently
			// would strand the sender, so make it visible in the log.
			this._logService.warn(`${this._logPrefix} send before the relay channel was established; dropping message`);
			return;
		}

		const text = JSON.stringify(message);
		this._ahpLogger?.log(message, 'c2s', getAhpLogByteLength(text));
		this._channel.relaySend(connectionId, text).catch((err) => {
			this._logService.error(`${this._logPrefix} relaySend failed`, err);
		});
	}

	private _fireClose(): void {
		if (!this._closeFired) {
			this._closeFired = true;
			this._onClose.fire();
		}
	}
}

/**
 * A relay transport that establishes and owns its shared-process relay channel on connect.
 */
export class ReconnectingRelayTransport extends ReconnectingTransport {

	constructor(
		establish: () => Promise<IRelayConnectionHandle>,
		channel: IRelayChannel,
		createAhpLogger: () => AhpJsonlLogger | undefined,
		logService: ILogService,
		logPrefix: string,
		clientConnectionKind: AgentHostClientConnectionKind,
	) {
		super(
			async (): Promise<IEstablishedTransport> => {
				const connectionHandle = await establish();
				// Create the logger here rather than up front: the inner transport
				// is what owns and disposes it, so a logger built before `establish`
				// resolves would be leaked on every failed attempt.
				return {
					transport: new RelayTransport(connectionHandle.connectionId, channel, createAhpLogger(), logService, logPrefix, clientConnectionKind),
					close: connectionHandle.close,
				};
			},
			logService,
			logPrefix,
			clientConnectionKind,
			'send before the relay channel was established; dropping message',
		);
	}
}
