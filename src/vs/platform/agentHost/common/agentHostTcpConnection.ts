/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { vEnum, vObj, vOptionalProp, vString } from '../../../base/common/validation.js';
import { AgentHostChannelSubscription, type IAgentHostChannelPolicy } from './agentHostChannel.js';
import { AgentHostChannelScheduler, validateChannelLimits } from './agentHostChannelDelivery.js';
import { AgentHostChannelError, AgentHostChannelErrorCode } from './agentHostChannelTelemetry.js';
import type { ChannelFlowControl, ChannelReceiveLimits } from './state/protocol/common/state.js';
import type { JsonRpcNotification } from './state/sessionProtocol.js';
import type { IProtocolTransport } from './state/sessionTransport.js';

export const agentHostTcpMaxConnections = 256;
export const agentHostTcpReceiveLimits: Readonly<ChannelReceiveLimits> = {
	windowBytes: 256 * 1024,
	maximumFrameBytes: 16 * 1024,
};

const agentHostTcpChannelPolicy: IAgentHostChannelPolicy = {
	resetMethod: 'tcp/reset',
	maximumBufferedBytes: agentHostTcpReceiveLimits.windowBytes + agentHostTcpReceiveLimits.maximumFrameBytes + 64 * 1024,
	// TCP data messages are small chunks, so a larger message is a protocol error.
	maximumReceivedMessageBytes: {
		host: agentHostTcpReceiveLimits.windowBytes + agentHostTcpReceiveLimits.maximumFrameBytes + 64 * 1024,
		client: agentHostTcpReceiveLimits.windowBytes + agentHostTcpReceiveLimits.maximumFrameBytes + 64 * 1024,
	},
	validateSnapshot(snapshot) {
		if (Object.keys(snapshot.state).length) {
			throw new AgentHostChannelError(AgentHostChannelErrorCode.InvalidSnapshot, 'Invalid TCP snapshot');
		}
	},
};

/** Reserves opening/live sockets and application writes across their owning transport or host. */
export class AgentHostTcpBudget {
	private _connections = 0;
	private _pendingWriteBytes = 0;

	constructor(private readonly _maximumConnections = agentHostTcpMaxConnections, private readonly _parent?: AgentHostTcpBudget) { }

	reserveConnection(): IDisposable {
		if (this._connections >= this._maximumConnections) {
			throw new AgentHostChannelError(AgentHostChannelErrorCode.BacklogLimitExceeded, `TCP connection capacity exceeded (${this._maximumConnections} opening or live connections)`);
		}
		this._connections++;
		return toDisposable(() => this._connections--);
	}

	reserveWrite(bytes: number): IDisposable {
		const maximumBytes = this._maximumConnections * 64 * 1024;
		if (this._pendingWriteBytes + bytes > maximumBytes) {
			throw new AgentHostChannelError(AgentHostChannelErrorCode.BacklogLimitExceeded, `TCP aggregate write capacity exceeded (${maximumBytes} bytes)`);
		}
		const parentReservation = this._parent?.reserveWrite(bytes);
		this._pendingWriteBytes += bytes;
		return toDisposable(() => {
			this._pendingWriteBytes -= bytes;
			parentReservation?.dispose();
		});
	}
}

export interface IAgentHostTcpConnection extends IDisposable {
	readonly resource: string;
	read(): Promise<VSBuffer | undefined>;
	write(data: VSBuffer): Promise<void>;
	drain(): Promise<void>;
	end(): Promise<void>;
	close(): void;
}

/** A bounded pull stream. No queued bytes or writes survive transport loss. */
export class AgentHostTcpConnection extends Disposable implements IAgentHostTcpConnection {
	private readonly _subscription: AgentHostChannelSubscription;
	private readonly _ready: Promise<void>;
	private readonly _incoming: { data: VSBuffer | undefined; consumed: DeferredPromise<void> }[] = [];
	private _reader: DeferredPromise<VSBuffer | undefined> | undefined;
	private _writes: Promise<void> = Promise.resolve();
	private _pendingBytes = 0;
	private _pendingWrites = 0;
	private _ended = false;
	private _sentEnd = false;
	private _receivedEnd = false;
	private _error: Error | undefined;
	private _chunkBytes: number;

	constructor(
		readonly resource: string,
		flowControl: ChannelFlowControl,
		private readonly _isHost: boolean,
		transport: IProtocolTransport,
		private readonly _scheduler: AgentHostChannelScheduler,
		private readonly _onClose: (error: Error, notifyPeer: boolean) => void,
		private readonly _budget: AgentHostTcpBudget,
	) {
		super();
		try {
			const sendLimits = this._getSendLimits(_isHost ? flowControl.clientReceive : flowControl.hostReceive);
			this._chunkBytes = this._getChunkBytes(sendLimits);
			const clampedFlowControl = _isHost
				? { clientReceive: sendLimits, hostReceive: flowControl.hostReceive }
				: { clientReceive: flowControl.clientReceive, hostReceive: sendLimits };
			this._subscription = this._register(new AgentHostChannelSubscription(
				resource, clampedFlowControl, _isHost, transport, _scheduler, agentHostTcpChannelPolicy,
				message => this._accept(message), (error, notifiedPeer) => this._failed(error, notifiedPeer),
			));
		} catch (error) {
			super.dispose();
			throw error;
		}
		this._ready = _isHost ? Promise.resolve() : this._subscription.nextSnapshot().then(() => { });
		// An early failure is also reported by every public stream operation.
		void this._ready.catch(() => { });
	}

	get ready(): Promise<void> { return this._ready; }
	get ended(): boolean { return this._sentEnd && this._receivedEnd; }

	private _getSendLimits(limits: ChannelReceiveLimits): ChannelReceiveLimits {
		validateChannelLimits(limits);
		return {
			windowBytes: Math.min(limits.windowBytes, agentHostTcpReceiveLimits.windowBytes),
			maximumFrameBytes: Math.min(limits.maximumFrameBytes, agentHostTcpReceiveLimits.maximumFrameBytes),
		};
	}

	private _getChunkBytes(limits: ChannelReceiveLimits): number {
		const envelope = JSON.stringify({ jsonrpc: '2.0', method: 'tcp/data', params: { channel: this.resource, data: '' } });
		const bytes = Math.min(16 * 1024, Math.floor((limits.maximumFrameBytes / 2 - envelope.length) / 4) * 3);
		if (bytes < 1) {
			throw new AgentHostChannelError(AgentHostChannelErrorCode.ReceiveLimitExceeded, 'TCP receive limits cannot fit a data message');
		}
		return bytes;
	}

	/** Host-side updates leave the socket, queues, half-close state, and counters intact. */
	setPeerReceiveLimits(limits: ChannelReceiveLimits): void {
		const sendLimits = this._getSendLimits(limits);
		const chunkBytes = this._getChunkBytes(sendLimits);
		this._subscription.setPeerReceiveLimits(sendLimits);
		this._chunkBytes = chunkBytes;
	}

	sendSnapshot(fromSeq: number): Promise<void> {
		return this._subscription.sendSnapshot({ resource: this.resource, state: {}, fromSeq });
	}

	private _accept(message: JsonRpcNotification): void | Promise<void> {
		if (message.method === 'tcp/reset') {
			this.fail(new AgentHostChannelError(AgentHostChannelErrorCode.Closed, 'Peer reset TCP connection'), false);
			if (!this._isHost) {
				this._scheduler.sendControl({ jsonrpc: '2.0', method: 'unsubscribe', params: { channel: this.resource } });
			}
			return;
		}
		if (this._receivedEnd) {
			throw new AgentHostChannelError(AgentHostChannelErrorCode.InvalidMessage, 'TCP data outside the active receive direction');
		}
		const result = vObj({
			method: vEnum('tcp/data', 'tcp/eof'),
			params: vObj({ data: vOptionalProp(vString()) }),
		}).validate(message);
		if (result.error) {
			throw new AgentHostChannelError(AgentHostChannelErrorCode.InvalidMessage, result.error.message);
		}
		const value = result.content;
		let data: VSBuffer | undefined;
		if (value.method === 'tcp/data') {
			const encoded = value.params.data;
			if (!encoded?.length || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
				throw new AgentHostChannelError(AgentHostChannelErrorCode.InvalidMessage, 'Invalid TCP base64 data');
			}
			data = decodeBase64(encoded);
			if (encodeBase64(data) !== encoded) {
				throw new AgentHostChannelError(AgentHostChannelErrorCode.InvalidMessage, 'Noncanonical TCP base64 data');
			}
		} else {
			this._receivedEnd = true;
		}
		if (this._reader) {
			const reader = this._reader;
			this._reader = undefined;
			reader.complete(data);
			if (!data) {
				// Synchronous acceptance releases EOF before this microtask.
				queueMicrotask(() => this.flushCredit());
			}
		} else {
			const consumed = new DeferredPromise<void>();
			this._incoming.push({ data, consumed });
			return consumed.p;
		}
	}

	read(): Promise<VSBuffer | undefined> {
		if (this._error) {
			return Promise.reject(this._error);
		}
		const next = this._incoming.shift();
		if (next) {
			next.consumed.complete();
			if (!next.data) {
				// The subscription releases queued EOF when the consumed promise settles.
				queueMicrotask(() => this.flushCredit());
			}
			return Promise.resolve(next.data);
		}
		if (this._receivedEnd) {
			return Promise.resolve(undefined);
		}
		if (this._reader) {
			return Promise.reject(new AgentHostChannelError(AgentHostChannelErrorCode.InvalidMessage, 'TCP stream already has a pending read'));
		}
		this._reader = new DeferredPromise<VSBuffer | undefined>();
		return this._reader.p;
	}

	write(data: VSBuffer): Promise<void> {
		if (this._ended || this._error) {
			return Promise.reject(this._error ?? new AgentHostChannelError(AgentHostChannelErrorCode.Closed, 'TCP stream has ended'));
		}
		if (this._pendingBytes + data.byteLength > 4 * 1024 * 1024 || this._pendingWrites >= 64) {
			return Promise.reject(new AgentHostChannelError(AgentHostChannelErrorCode.BacklogLimitExceeded, 'TCP write queue capacity exceeded'));
		}
		let reservation: IDisposable;
		try {
			reservation = this._register(this._budget.reserveWrite(data.byteLength));
		} catch (error) {
			return Promise.reject(error);
		}
		this._pendingBytes += data.byteLength;
		this._pendingWrites++;
		return this._enqueue(async () => {
			for (let offset = 0; offset < data.byteLength;) {
				const end = Math.min(offset + this._chunkBytes, data.byteLength);
				await this._subscription.send({
					jsonrpc: '2.0', method: 'tcp/data', params: {
						channel: this.resource, data: encodeBase64(data.slice(offset, end)),
					}
				});
				offset = end;
			}
		}).finally(() => {
			this._store.delete(reservation);
			this._pendingBytes -= data.byteLength;
			this._pendingWrites--;
		});
	}

	private _enqueue(operation: () => Promise<void>): Promise<void> {
		const pending = this._writes.then(async () => {
			if (this._error) {
				throw this._error;
			}
			await operation();
		});
		this._writes = pending.catch(error => this.fail(error));
		return pending;
	}

	async drain(): Promise<void> {
		await this._writes;
		await this._subscription.drain();
	}

	end(): Promise<void> {
		if (this._ended) {
			return this._writes.then(() => {
				if (this._error) {
					throw this._error;
				}
			});
		}
		this._ended = true;
		return this._enqueue(async () => {
			await this._subscription.send({ jsonrpc: '2.0', method: 'tcp/eof', params: { channel: this.resource } });
			this._sentEnd = true;
		});
	}

	flushCredit(): void { this._subscription.flushCredit(); }

	fail(error: Error, notify = true): void {
		this._subscription.fail(error, notify);
	}

	private _failed(error: Error, notifiedPeer: boolean): void {
		this._error = error;
		this._incoming.length = 0;
		this._reader?.error(error);
		this._reader = undefined;
		try {
			this._onClose(error, notifiedPeer);
		} finally {
			super.dispose();
		}
	}

	close(): void { this.dispose(); }

	override dispose(): void {
		if (!this._error) {
			const graceful = this.ended && this._incoming.length === 0;
			if (graceful) {
				this._subscription.flushCredit();
			}
			this.fail(new AgentHostChannelError(AgentHostChannelErrorCode.Closed, 'TCP stream closed'), !graceful);
			if (!this._isHost && graceful) {
				this._scheduler.sendControl({ jsonrpc: '2.0', method: 'unsubscribe', params: { channel: this.resource } });
			}
		}
		super.dispose();
	}
}
