/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { vEnum, vNumber, vObj, vObjAny, vOptionalProp, vString } from '../../../base/common/validation.js';
import { AgentHostChannelDelivery, AgentHostChannelScheduler, validateChannelLimits } from './agentHostChannelDelivery.js';
import type { ChannelFlowControl, ChannelReceiveLimits } from './state/protocol/common/state.js';
import type { JsonRpcNotification } from './state/sessionProtocol.js';
import type { IProtocolTransport } from './state/sessionTransport.js';

export const agentHostTcpMaxConnections = 256;
export const agentHostTcpReceiveLimits: Readonly<ChannelReceiveLimits> = {
	windowBytes: 256 * 1024,
	maximumFrameBytes: 16 * 1024,
};

/** Reserves opening/live sockets across their owning transport or host. */
export class AgentHostTcpBudget {
	private _connections = 0;

	constructor(private readonly _maximumConnections = agentHostTcpMaxConnections) { }

	reserveConnection(): IDisposable {
		if (this._connections >= this._maximumConnections) {
			throw new Error(`TCP connection capacity exceeded (${this._maximumConnections} opening or live connections)`);
		}
		this._connections++;
		return toDisposable(() => this._connections--);
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
	private readonly _delivery: AgentHostChannelDelivery;
	private readonly _ready = new DeferredPromise<void>();
	private readonly _incoming: { data: VSBuffer | undefined; release: () => void }[] = [];
	private _reader: DeferredPromise<VSBuffer | undefined> | undefined;
	private _writePending: DeferredPromise<void> | undefined;
	private _end: Promise<void> | undefined;
	private _sentEnd = false;
	private _receivedEnd = false;
	private _error: Error | undefined;
	private _notifyFailure = true;
	private _chunkBytes: number;

	constructor(
		readonly resource: string,
		flowControl: ChannelFlowControl,
		private readonly _isHost: boolean,
		transport: IProtocolTransport,
		private readonly _scheduler: AgentHostChannelScheduler,
		private readonly _onClose: (error: Error, notifyPeer: boolean) => void,
	) {
		super();
		try {
			const sendLimits = this._getSendLimits(_isHost ? flowControl.clientReceive : flowControl.hostReceive);
			this._chunkBytes = this._getChunkBytes(sendLimits);
			const receiveLimits = _isHost ? flowControl.hostReceive : flowControl.clientReceive;
			this._delivery = this._register(new AgentHostChannelDelivery(
				resource, sendLimits, receiveLimits, transport, _scheduler,
				(message, release) => this._accept(message, release), error => this._failed(error),
				receiveLimits.windowBytes + receiveLimits.maximumFrameBytes + 64 * 1024,
			));
		} catch (error) {
			super.dispose();
			throw error;
		}
		// An early failure is also reported by every public stream operation.
		void this._ready.p.catch(() => { });
		if (_isHost) {
			this._ready.complete();
		}
	}

	get ready(): Promise<void> { return this._ready.p; }
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
			throw new Error('TCP receive limits cannot fit a data message');
		}
		return bytes;
	}

	/** Host-side updates leave the socket, queues, half-close state, and counters intact. */
	setPeerReceiveLimits(limits: ChannelReceiveLimits): void {
		const sendLimits = this._getSendLimits(limits);
		const chunkBytes = this._getChunkBytes(sendLimits);
		this._delivery.setSendLimits(sendLimits);
		this._chunkBytes = chunkBytes;
	}

	sendSnapshot(fromSeq: number): Promise<void> {
		return this._delivery.send({
			jsonrpc: '2.0', method: 'channel/snapshot', params: {
				channel: this.resource, snapshot: { resource: this.resource, state: {}, fromSeq },
			}
		}).then(() => { });
	}

	private _accept(message: JsonRpcNotification, release: () => void): void {
		if (message.method === 'tcp/reset') {
			this.fail(new Error('Peer reset TCP connection'), false);
			if (!this._isHost) {
				this._scheduler.sendControl({ jsonrpc: '2.0', method: 'unsubscribe', params: { channel: this.resource } });
			}
			return;
		}
		if (message.method === 'channel/snapshot' && !this._isHost) {
			const { snapshot } = vObj({ snapshot: vObj({ resource: vString(), state: vObjAny(), fromSeq: vNumber() }) }).validateOrThrow(message.params);
			if (snapshot.resource !== this.resource || !snapshot.state || Array.isArray(snapshot.state) || Object.keys(snapshot.state).length
				|| !Number.isSafeInteger(snapshot.fromSeq) || snapshot.fromSeq < 0) {
				throw new Error('Invalid TCP snapshot');
			}
			release();
			if (!this._ready.isSettled) {
				this._ready.complete();
			}
			return;
		}
		if (!this._ready.isSettled || this._receivedEnd) {
			throw new Error('TCP data outside the active receive direction');
		}
		const value = vObj({
			method: vEnum('tcp/data', 'tcp/eof'),
			params: vObj({ data: vOptionalProp(vString()) }),
		}).validateOrThrow(message);
		let data: VSBuffer | undefined;
		if (value.method === 'tcp/data') {
			const encoded = value.params.data;
			if (!encoded?.length || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
				throw new Error('Invalid TCP base64 data');
			}
			data = decodeBase64(encoded);
			if (encodeBase64(data) !== encoded) {
				throw new Error('Noncanonical TCP base64 data');
			}
		} else {
			this._receivedEnd = true;
		}
		if (this._reader) {
			const reader = this._reader;
			this._reader = undefined;
			release();
			reader.complete(data);
		} else {
			this._incoming.push({ data, release });
		}
	}

	read(): Promise<VSBuffer | undefined> {
		if (this._error) {
			return Promise.reject(this._error);
		}
		const next = this._incoming.shift();
		if (next) {
			next.release();
			return Promise.resolve(next.data);
		}
		if (this._receivedEnd) {
			return Promise.resolve(undefined);
		}
		if (this._reader) {
			return Promise.reject(new Error('TCP stream already has a pending read'));
		}
		this._reader = new DeferredPromise<VSBuffer | undefined>();
		return this._reader.p;
	}

	async write(data: VSBuffer): Promise<void> {
		if (this._end || this._error) {
			throw this._error ?? new Error('TCP stream has ended');
		}
		if (this._writePending) {
			throw new Error('TCP stream already has a pending write');
		}
		const completed = this._writePending = new DeferredPromise<void>();
		try {
			for (let offset = 0; offset < data.byteLength;) {
				const end = Math.min(offset + this._chunkBytes, data.byteLength);
				await this._delivery.send({
					jsonrpc: '2.0', method: 'tcp/data', params: {
						channel: this.resource, data: encodeBase64(data.slice(offset, end)),
					}
				});
				offset = end;
			}
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
			throw error;
		} finally {
			this._writePending = undefined;
			completed.complete();
		}
	}

	async drain(): Promise<void> {
		await (this._end ?? this._writePending?.p);
		await this._delivery.drain();
	}

	end(): Promise<void> {
		return this._end ??= this._sendEnd();
	}

	private async _sendEnd(): Promise<void> {
		try {
			await this._writePending?.p;
			await this._delivery.send({ jsonrpc: '2.0', method: 'tcp/eof', params: { channel: this.resource } });
			this._sentEnd = true;
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	flushCredit(): void { this._delivery.flushCredit(); }

	fail(error: Error, notify = true): void {
		if (!this._error) {
			this._notifyFailure = notify;
			this._delivery.fail(error);
		}
	}

	private _failed(error: Error): void {
		this._error = error;
		this._incoming.length = 0;
		this._reader?.error(error);
		this._reader = undefined;
		if (!this._ready.isSettled) {
			this._ready.error(error);
		}
		try {
			if (this._notifyFailure) {
				this._scheduler.sendControl({ jsonrpc: '2.0', method: 'tcp/reset', params: { channel: this.resource } });
				if (!this._isHost) {
					this._scheduler.sendControl({ jsonrpc: '2.0', method: 'unsubscribe', params: { channel: this.resource } });
				}
			}
		} finally {
			try {
				this._onClose(error, this._notifyFailure);
			} finally {
				super.dispose();
			}
		}
	}

	close(): void { this.dispose(); }

	override dispose(): void {
		if (!this._error) {
			const graceful = this.ended && this._incoming.length === 0;
			if (graceful) {
				this._delivery.flushCredit();
			}
			this.fail(new Error('TCP stream closed'), !graceful);
			if (!this._isHost && graceful) {
				this._scheduler.sendControl({ jsonrpc: '2.0', method: 'unsubscribe', params: { channel: this.resource } });
			}
		}
		super.dispose();
	}
}
