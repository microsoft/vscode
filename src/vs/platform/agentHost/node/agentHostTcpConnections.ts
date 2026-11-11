/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createConnection, Socket } from 'net';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { negotiateChannelFlowControl } from '../common/agentHostChannel.js';
import { AgentHostChannelError } from '../common/agentHostChannelTelemetry.js';
import type { AgentHostConnectionChannels } from './agentHostConnectionChannels.js';
import { AgentHostTcpBudget, AgentHostTcpConnection, agentHostTcpMaxConnections, agentHostTcpReceiveLimits } from '../common/agentHostTcpConnection.js';
import type { CreateTcpConnectionParams } from '../common/state/protocol/channels-tcp/commands.js';
import type { SubscribeParams, SubscribeResult } from '../common/state/protocol/common/commands.js';
import type { ChannelFlowControl } from '../common/state/protocol/common/state.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import type { IProtocolTransport } from '../common/state/sessionTransport.js';

interface ITcpSocket {
	readonly socket: Socket;
	readonly reservation: IDisposable;
	lease: ReturnType<typeof setTimeout>;
	stream?: AgentHostTcpConnection;
	registration?: IDisposable;
	active: boolean;
	draining: boolean;
}

/** Destination sockets owned by one transport, outside action replay and session state. */
export class AgentHostTcpConnections extends Disposable {
	private readonly _connections = new Map<string, ITcpSocket>();
	private readonly _writeBudget: AgentHostTcpBudget;

	constructor(
		private readonly _transport: IProtocolTransport,
		private readonly _budget: AgentHostTcpBudget,
		private readonly _channels: AgentHostConnectionChannels,
		private readonly _getSequence: () => number,
		private readonly _logError: (error: Error) => void,
		private readonly _reportFailure: (channel: string, error: Error) => void,
	) {
		super();
		this._writeBudget = new AgentHostTcpBudget(agentHostTcpMaxConnections, _budget);
	}

	async create(params: CreateTcpConnectionParams): Promise<null> {
		if (!params || typeof params.channel !== 'string' || !/^ahp-tcp:[^\s?#]+$/.test(params.channel) || params.channel.length > 256
			|| typeof params.host !== 'string' || !params.host.length || params.host.length > 253 || /[\s/?#@]/.test(params.host)
			|| !Number.isInteger(params.port) || params.port < 1 || params.port > 65535) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid TCP connection target');
		}
		if (this._connections.has(params.channel)) {
			throw new ProtocolError(AhpErrorCodes.AlreadyExists, 'TCP channel already exists');
		}
		if (this._store.isDisposed || this._connections.size >= agentHostTcpMaxConnections) {
			throw new ProtocolError(AhpErrorCodes.TcpConnectionOpenFailed, 'TCP transport is closed or at connection capacity');
		}
		let reservation: IDisposable;
		try {
			reservation = this._budget.reserveConnection();
		} catch (error) {
			this._logError(error instanceof Error ? error : new Error(String(error)));
			throw new ProtocolError(AhpErrorCodes.TcpConnectionOpenFailed, 'TCP host connection capacity exceeded');
		}
		let socket: Socket;
		try {
			socket = createConnection({ host: params.host, port: params.port, allowHalfOpen: true });
		} catch (error) {
			reservation.dispose();
			this._logError(error instanceof Error ? error : new Error(String(error)));
			throw new ProtocolError(AhpErrorCodes.TcpConnectionOpenFailed, 'Unable to open TCP destination');
		}
		socket.pause();
		const entry: ITcpSocket = {
			socket, reservation, active: false, draining: false,
			lease: setTimeout(() => this._remove(params.channel, entry, new Error('TCP creation or subscription timed out')), 30_000),
		};
		this._connections.set(params.channel, entry);
		entry.registration = this._channels.register(params.channel, {
			start: flowControl => this._start(params.channel, entry, flowControl),
			accept: message => {
				if (message.method !== 'unsubscribe') {
					this._remove(params.channel, entry, new Error('TCP data before subscription'));
				} else if (entry.stream?.ended && entry.active && !entry.draining) {
					this._startGracefulDrain(params.channel, entry);
				} else if (!entry.draining) {
					this._remove(params.channel, entry);
				}
			},
			dispose: () => this._remove(params.channel, entry),
		});
		socket.on('error', error => {
			if (this._connections.get(params.channel) === entry) {
				this._logError(error);
				this._remove(params.channel, entry, error);
			}
		});
		socket.on('close', () => {
			if (!socket.readableEnded || !socket.writableFinished) {
				this._remove(params.channel, entry, new Error('TCP destination closed'));
			}
		});
		try {
			await new Promise<void>((resolve, reject) => {
				const onConnect = () => { cleanup(); resolve(); };
				const onClose = () => { cleanup(); reject(new Error('TCP connection closed while opening')); };
				const onError = (error: Error) => { cleanup(); reject(error); };
				const cleanup = () => {
					socket.off('connect', onConnect);
					socket.off('close', onClose);
					socket.off('error', onError);
				};
				socket.once('connect', onConnect);
				socket.once('close', onClose);
				socket.once('error', onError);
			});
			if (this._connections.get(params.channel) !== entry) {
				throw new Error('TCP connection closed while opening');
			}
		} catch {
			this._remove(params.channel, entry);
			throw new ProtocolError(AhpErrorCodes.TcpConnectionOpenFailed, 'Unable to open TCP destination');
		}
		return null;
	}

	subscribe(params: SubscribeParams): SubscribeResult {
		const entry = this._connections.get(params.channel);
		if (!entry || entry.socket.destroyed || entry.draining) {
			throw new ProtocolError(AhpErrorCodes.NotFound, 'TCP channel not found on this transport');
		}
		let flowControl: ChannelFlowControl | undefined;
		try {
			flowControl = negotiateChannelFlowControl(params.channel, params.flowControl!.receive, agentHostTcpReceiveLimits);
		} catch {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'TCP requires valid windowed delivery limits');
		}
		if (!flowControl) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Unsupported TCP receive limits');
		}
		if (!entry.stream) {
			try {
				entry.stream = new AgentHostTcpConnection(params.channel, flowControl, true, this._transport, this._channels.scheduler,
					(error, notifyPeer) => {
						if (this._connections.get(params.channel) === entry) {
							if (notifyPeer) {
								this._reportFailure(params.channel, error);
							}
							this._remove(params.channel, entry);
						}
					}, this._writeBudget);
			} catch {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Unsupported TCP receive limits');
			}
		}
		// Client-to-host limits remain unchanged, including while a re-subscribe response is in flight.
		return { flowControl };
	}

	private _start(channel: string, entry: ITcpSocket, flowControl: ChannelFlowControl): void {
		if (this._connections.get(channel) !== entry || !entry.stream) {
			return;
		}
		const stream = entry.stream;
		stream.setPeerReceiveLimits(flowControl.clientReceive);
		const snapshot = stream.sendSnapshot(this._getSequence());
		if (entry.active) {
			void snapshot.catch(error => this._remove(channel, entry, error));
			return;
		}
		entry.active = true;
		clearTimeout(entry.lease);
		const readSocket = async () => {
			await snapshot;
			// The default async iterator destroys the writable half at readable EOF.
			for await (const chunk of entry.socket.iterator({ destroyOnReturn: false })) {
				await stream.write(VSBuffer.wrap(chunk));
			}
			await stream.end();
			this._startGracefulDrain(channel, entry);
			await stream.drain();
		};
		const writeSocket = async () => {
			for (; ;) {
				const data = await stream.read();
				if (!data) {
					this._startGracefulDrain(channel, entry);
					await new Promise<void>((resolve, reject) => {
						const onClose = () => { cleanup(); reject(new Error('TCP destination closed before finish')); };
						const cleanup = () => entry.socket.off('close', onClose);
						entry.socket.once('close', onClose);
						entry.socket.end(() => { cleanup(); resolve(); });
					});
					return;
				}
				await new Promise<void>((resolve, reject) => entry.socket.write(data.buffer, error => error ? reject(error) : resolve()));
			}
		};
		void Promise.all([readSocket(), writeSocket()]).then(() => {
			stream.flushCredit();
			this._remove(channel, entry, undefined, 'graceful');
		}).catch(error => {
			if (this._connections.get(channel) === entry) {
				if (error instanceof AgentHostChannelError) {
					this._reportFailure(channel, error);
				} else {
					this._logError(error);
				}
				this._remove(channel, entry, error);
			}
		});
	}

	private _startGracefulDrain(channel: string, entry: ITcpSocket): void {
		if (this._connections.get(channel) === entry && entry.stream?.ended && !entry.draining) {
			entry.draining = true;
			entry.lease = setTimeout(() => this._remove(channel, entry, new Error('TCP graceful drain timed out')), 30_000);
		}
	}

	private _remove(channel: string, entry: ITcpSocket, error?: Error, mode: 'abort' | 'graceful' = 'abort'): void {
		// Channel URIs can be reused before the old socket's callbacks finish.
		if (this._connections.get(channel) !== entry) {
			return;
		}
		this._connections.delete(channel);
		entry.registration?.dispose();
		entry.reservation.dispose();
		clearTimeout(entry.lease);
		entry.stream?.fail(error ?? new Error('TCP connection closed'), !!error);
		entry.stream?.dispose();
		if (mode === 'abort' && !entry.socket.destroyed && !entry.socket.connecting) {
			entry.socket.resetAndDestroy();
		} else {
			entry.socket.destroy();
		}
	}

	override dispose(): void {
		for (const [channel, entry] of this._connections) {
			this._remove(channel, entry);
		}
		super.dispose();
	}
}
