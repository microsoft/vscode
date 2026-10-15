/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { vBoolean, vEnum, vNumber, vObj, vOptionalProp, vString, vUndefined } from '../../../base/common/validation.js';
import type { ChannelFlowControl, ChannelReceiveLimits } from './state/protocol/common/state.js';
import { countsAgainstWindow } from './state/protocol/window-exempt.generated.js';
import type { JsonRpcNotification } from './state/sessionProtocol.js';
import { getProtocolMessageSize, type IProtocolTransport } from './state/sessionTransport.js';

const receiveLimitsValidator = vObj({ windowBytes: vNumber(), maximumFrameBytes: vNumber() });
const notificationValidator = vObj({
	jsonrpc: vEnum('2.0'), method: vString(), id: vOptionalProp(vUndefined()),
	params: vObj({ channel: vString() }),
});
const channelSendBurstBytes = 256 * 1024;
const transportDrainPollInterval = 25;
const maximumQueueLength = 1024;
const maximumControlBytes = 16 * 1024;

export function validateChannelLimits(limits: ChannelReceiveLimits): void {
	if (![limits.windowBytes, limits.maximumFrameBytes].every(value => Number.isSafeInteger(value) && value > 0)
		|| limits.maximumFrameBytes < 1024) {
		throw new Error('Invalid channel receive limits');
	}
}

export function readChannelFlowControl(value: unknown): ChannelFlowControl {
	const result = vObj({ clientReceive: receiveLimitsValidator, hostReceive: receiveLimitsValidator }).validateOrThrow(value);
	validateChannelLimits(result.clientReceive);
	validateChannelLimits(result.hostReceive);
	return result;
}

/** Routes windowed subscriptions and fairly schedules bounded transport bursts. */
export class AgentHostChannelScheduler extends Disposable {
	private readonly _channels = new Map<string, AgentHostChannelDelivery>();
	private _timer: ReturnType<typeof setTimeout> | undefined;
	private _scheduled = false;
	private _burstBytes = 0;
	private _cursor = 0;

	constructor(private readonly _transport: IProtocolTransport) { super(); }

	add(channel: AgentHostChannelDelivery): void {
		if (this._store.isDisposed || this._channels.has(channel.channel)) {
			throw new Error('Channel scheduler is disposed or channel is already registered');
		}
		this._channels.set(channel.channel, channel);
	}

	remove(channel: AgentHostChannelDelivery): void {
		if (this._channels.get(channel.channel) === channel) {
			this._channels.delete(channel.channel);
		}
	}

	acceptMessage(message: JsonRpcNotification): boolean {
		const params = vObj({ channel: vString() }).validate(message.params);
		const channel = params.error ? undefined : this._channels.get(params.content.channel);
		if (!channel) {
			return false;
		}
		try {
			channel.accept(message, getProtocolMessageSize(message));
		} catch (error) {
			channel.fail(error instanceof Error ? error : new Error(String(error)));
		}
		return true;
	}

	schedule(delay?: number): void {
		if (this._scheduled || this._store.isDisposed) {
			return;
		}
		this._scheduled = true;
		const send = () => {
			this._scheduled = false;
			this._timer = undefined;
			if (this._store.isDisposed) {
				return;
			}
			const channels = [...this._channels.values()];
			const start = this._cursor;
			for (let i = 0; i < channels.length; i++) {
				const index = (start + i) % channels.length;
				if (!channels[index].canSend) {
					continue;
				}
				if ((this._transport.bufferedAmount ?? 0) >= channelSendBurstBytes) {
					this._cursor = index;
					this.schedule(transportDrainPollInterval);
					return;
				}
				if (this._burstBytes + channels[index].maximumFrameBytes > channelSendBurstBytes) {
					this._cursor = index;
					this.schedule(0);
					return;
				}
				this._burstBytes += channels[index].sendFrame();
				this._cursor = index + 1;
				if (this._burstBytes >= channelSendBurstBytes) {
					break;
				}
			}
			if (channels.some(channel => channel.canSend)) {
				this.schedule();
			}
		};
		// Promise-based producers can refill within a burst without paying a browser timer clamp per frame.
		if (delay !== undefined || this._burstBytes >= channelSendBurstBytes) {
			this._timer = setTimeout(() => {
				this._burstBytes = 0;
				send();
			}, delay ?? 0);
		} else {
			queueMicrotask(send);
		}
	}

	override dispose(): void {
		clearTimeout(this._timer);
		for (const channel of [...this._channels.values()]) {
			channel.fail(new Error('Agent host transport closed'));
		}
		super.dispose();
	}
}

interface IOutgoingMessage {
	readonly message: JsonRpcNotification;
	readonly text: string;
	readonly sent: DeferredPromise<number>;
	offset: number;
}

interface IReleaseBoundary {
	readonly end: number;
	released: boolean;
}

/** Connection-local delivery; the channel adapter owns snapshots, recovery, and error controls. */
export class AgentHostChannelDelivery extends Disposable {
	private readonly _outgoing: IOutgoingMessage[] = [];
	private readonly _received: IReleaseBoundary[] = [];
	private readonly _drains = new Set<{ end: number; deferred: DeferredPromise<void> }>();
	private _queuedBytes = 0;
	private _retainedBytes = 0;
	private _sentBytes = 0;
	private _peerConsumed = 0;
	private _receivedBytes = 0;
	private _consumedBytes = 0;
	private _creditedBytes = 0;
	private _fragments = '';
	private _error: Error | undefined;
	private _creditTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		readonly channel: string,
		private _sendLimits: ChannelReceiveLimits,
		private readonly _receiveLimits: ChannelReceiveLimits,
		private readonly _transport: IProtocolTransport,
		private readonly _scheduler: AgentHostChannelScheduler,
		private readonly _accept: (message: JsonRpcNotification, release: () => void) => void,
		private readonly _onError: (error: Error) => void,
		private readonly _maximumBufferedBytes = 4 * 1024 * 1024,
	) {
		super();
		try {
			validateChannelLimits(_sendLimits);
			validateChannelLimits(_receiveLimits);
			_scheduler.add(this);
		} catch (error) {
			super.dispose();
			throw error;
		}
	}

	get maximumFrameBytes(): number { return Math.min(this._sendLimits.maximumFrameBytes, channelSendBurstBytes); }

	setSendLimits(limits: ChannelReceiveLimits): void {
		validateChannelLimits(limits);
		this._sendLimits = limits;
		this._scheduler.schedule();
	}

	send(message: JsonRpcNotification): Promise<number> {
		if (this._error) {
			return Promise.reject(this._error);
		}
		const text = JSON.stringify(message);
		const bytes = text.length * 2;
		if (notificationValidator.validateOrThrow(message).params.channel !== this.channel
			|| message.method === 'channel/frame' || !countsAgainstWindow(message.method)) {
			return Promise.reject(new Error('Expected a data notification for this channel'));
		}
		if (this._outgoing.length >= maximumQueueLength || this._queuedBytes + bytes > this._maximumBufferedBytes) {
			return Promise.reject(new Error('Channel send queue capacity exceeded'));
		}
		const sent = new DeferredPromise<number>();
		this._queuedBytes += bytes;
		this._outgoing.push({ message, text, sent, offset: 0 });
		this._scheduler.schedule();
		return sent.p;
	}

	get canSend(): boolean {
		return !this._error && this._outgoing.length > 0 && this._sentBytes - this._peerConsumed < this._sendLimits.windowBytes;
	}

	sendFrame(): number {
		if (!this.canSend) {
			return 0;
		}
		const next = this._outgoing[0];
		try {
			let message = next.message;
			let end = next.text.length;
			if (next.offset || next.text.length * 2 > this.maximumFrameBytes) {
				const envelope = { jsonrpc: '2.0' as const, method: 'channel/frame', params: { channel: this.channel, data: '', final: false } };
				let budget = this.maximumFrameBytes / 2 - JSON.stringify(envelope).length;
				end = next.offset;
				while (end < next.text.length) {
					const code = next.text.charCodeAt(end);
					const pair = code >= 0xd800 && code <= 0xdbff && next.text.charCodeAt(end + 1) >= 0xdc00 && next.text.charCodeAt(end + 1) <= 0xdfff;
					const units = pair ? 2 : 1;
					const cost = pair ? 2 : code < 32 || (code >= 0xd800 && code <= 0xdfff) ? 6 : code === 34 || code === 92 ? 2 : 1;
					if (cost > budget) {
						break;
					}
					budget -= cost;
					end += units;
				}
				if (end === next.offset) {
					throw new Error('Frame limit cannot fit the channel envelope');
				}
				envelope.params.data = next.text.slice(next.offset, end);
				envelope.params.final = end === next.text.length;
				message = envelope;
			}
			const bytes = JSON.stringify(message).length * 2;
			if (!Number.isSafeInteger(this._sentBytes + bytes)) {
				throw new Error('Channel byte counter exhausted');
			}
			this._sentBytes += bytes;
			const sentBytes = this._sentBytes;
			next.offset = end;
			this._transport.send(message);
			if (this._error) {
				throw this._error;
			}
			if (end === next.text.length) {
				this._outgoing.shift();
				this._queuedBytes -= next.text.length * 2;
				next.sent.complete(sentBytes);
			}
			return bytes;
		} catch (error) {
			if (!next.sent.isSettled) {
				next.sent.error(error);
			}
			this.fail(error instanceof Error ? error : new Error(String(error)));
			return 0;
		}
	}

	accept(message: JsonRpcNotification, bytes: number): void {
		if (this._error) {
			return;
		}
		try {
			let notification = notificationValidator.validateOrThrow(message);
			if (notification.params.channel !== this.channel || !Number.isSafeInteger(bytes) || bytes <= 0) {
				throw new Error('Invalid channel notification');
			}
			if (!countsAgainstWindow(message.method)) {
				if (bytes > maximumControlBytes) {
					throw new Error('Channel control size exceeded');
				}
				if (message.method === 'channel/credit') {
					this.acceptCredit(vObj({ consumedBytes: vNumber() }).validateOrThrow(message.params).consumedBytes);
				} else {
					this._accept(message, () => { });
				}
				return;
			}
			if (bytes > this._receiveLimits.maximumFrameBytes
				|| this._receivedBytes - this._creditedBytes >= this._receiveLimits.windowBytes
				|| !Number.isSafeInteger(this._receivedBytes + bytes)) {
				throw new Error('Channel receive limit exceeded');
			}
			this._receivedBytes += bytes;
			// Uncredited wire bytes bound receipt count; a fixed count would reject valid small messages.
			const boundary: IReleaseBoundary = { end: this._receivedBytes, released: false };
			this._received.push(boundary);
			let retainedBytes = bytes;
			if (message.method === 'channel/frame') {
				const fragment = vObj({ data: vString(), final: vOptionalProp(vBoolean()) }).validateOrThrow(message.params);
				if (!fragment.data.length || this._retainedBytes + (this._fragments.length + fragment.data.length) * 2 > this._maximumBufferedBytes) {
					throw new Error('Channel reassembly capacity exceeded');
				}
				const previous = this._fragments.charCodeAt(this._fragments.length - 1);
				const first = fragment.data.charCodeAt(0);
				if (previous >= 0xd800 && previous <= 0xdbff && first >= 0xdc00 && first <= 0xdfff) {
					throw new Error('Channel fragment split a surrogate pair');
				}
				this._fragments += fragment.data;
				if (!fragment.final) {
					this._release(boundary);
					return;
				}
				retainedBytes = this._fragments.length * 2;
				const parsed: JsonRpcNotification = JSON.parse(this._fragments);
				notification = notificationValidator.validateOrThrow(parsed);
				message = parsed;
				this._fragments = '';
				if (notification.params.channel !== this.channel || message.method === 'channel/frame' || !countsAgainstWindow(message.method)) {
					throw new Error('Invalid fragmented channel notification');
				}
			} else if (this._fragments) {
				throw new Error('Data interleaved with an incomplete channel message');
			}
			if (this._retainedBytes + retainedBytes > this._maximumBufferedBytes) {
				throw new Error('Channel consumer capacity exceeded');
			}
			this._retainedBytes += retainedBytes;
			this._accept(message, () => {
				if (!boundary.released && !this._error) {
					this._retainedBytes -= retainedBytes;
					this._release(boundary);
				}
			});
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
		}
	}

	acceptCredit(consumedBytes: number): void {
		if (!Number.isSafeInteger(consumedBytes) || consumedBytes < 0 || consumedBytes > this._sentBytes) {
			this.fail(new Error('Invalid channel credit'));
			return;
		}
		if (consumedBytes <= this._peerConsumed || this._error) {
			return;
		}
		this._peerConsumed = consumedBytes;
		for (const waiter of this._drains) {
			if (waiter.end <= consumedBytes) {
				waiter.deferred.complete();
				this._drains.delete(waiter);
			}
		}
		this._scheduler.schedule();
	}

	async drain(): Promise<void> {
		const last = this._outgoing.at(-1);
		const end = last ? await last.sent.p : this._sentBytes;
		if (this._error) {
			throw this._error;
		}
		if (this._peerConsumed >= end) {
			return;
		}
		if (this._drains.size >= maximumQueueLength) {
			throw new Error('Too many channel drain waiters');
		}
		const deferred = new DeferredPromise<void>();
		this._drains.add({ end, deferred });
		await deferred.p;
	}

	private _release(boundary: IReleaseBoundary): void {
		boundary.released = true;
		while (this._received[0]?.released) {
			this._consumedBytes = this._received.shift()!.end;
		}
		if (this._creditTimer === undefined) {
			this._creditTimer = setTimeout(() => {
				this._creditTimer = undefined;
				try {
					this.flushCredit();
				} catch (error) {
					this.fail(error instanceof Error ? error : new Error(String(error)));
				}
			}, 0);
		}
	}

	flushCredit(): void {
		clearTimeout(this._creditTimer);
		this._creditTimer = undefined;
		if (!this._error && this._consumedBytes > this._creditedBytes) {
			this._creditedBytes = this._consumedBytes;
			this._transport.send({ jsonrpc: '2.0', method: 'channel/credit', params: { channel: this.channel, consumedBytes: this._consumedBytes } });
		}
	}

	fail(error: Error): void {
		if (this._error) {
			return;
		}
		this._error = error;
		clearTimeout(this._creditTimer);
		this._scheduler.remove(this);
		for (const next of this._outgoing.splice(0)) {
			next.sent.error(error);
		}
		for (const waiter of this._drains) {
			waiter.deferred.error(error);
		}
		this._drains.clear();
		this._received.length = 0;
		this._fragments = '';
		try {
			this._onError(error);
		} finally {
			super.dispose();
		}
	}

	override dispose(): void {
		this.fail(new Error('Channel disposed'));
		super.dispose();
	}
}
