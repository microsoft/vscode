/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { vBoolean, vEnum, vNumber, vObj, vOptionalProp, vString, vUndefined } from '../../../base/common/validation.js';
import type { ChannelFlowControl, ChannelReceiveLimits } from './state/protocol/common/state.js';
import { countsAgainstWindow, WINDOW_EXEMPT_METHODS } from './state/protocol/window-exempt.generated.js';
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
const maximumControlQueueBytes = 64 * 1024;
const controlMessagesPerSecond = 4096;
const controlBytesPerSecond = 1024 * 1024;
/**
 * Controls are sent at a fraction of the peer's receive budget. The peer
 * measures arrival, and a congested transport or busy peer can deliver up to a
 * second of paced controls at once.
 */
const controlSendFraction = 0.5;
/** Release smaller than this share of the receive window is credited after {@link creditDelay}. */
const creditWindowFraction = 0.25;
const creditDelay = 10;

class ControlBudget {
	private _messages: number;
	private _bytes: number;
	private _updatedAt = Date.now();

	constructor(private readonly _messagesPerSecond: number, private readonly _bytesPerSecond: number) {
		this._messages = _messagesPerSecond;
		this._bytes = _bytesPerSecond;
	}

	take(bytes: number): boolean {
		const now = Date.now();
		const elapsed = Math.max(0, now - this._updatedAt) / 1000;
		this._updatedAt = Math.max(now, this._updatedAt);
		this._messages = Math.min(this._messagesPerSecond, this._messages + elapsed * this._messagesPerSecond);
		this._bytes = Math.min(this._bytesPerSecond, this._bytes + elapsed * this._bytesPerSecond);
		if (this._messages < 1 || this._bytes < bytes) {
			return false;
		}
		this._messages--;
		this._bytes -= bytes;
		return true;
	}
}

interface IOutgoingControl {
	readonly message: JsonRpcNotification;
	readonly bytes: number;
	readonly onSend?: () => void;
}

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
	private readonly _controls = new Map<string, IOutgoingControl>();
	private readonly _receiveControlBudget = new ControlBudget(controlMessagesPerSecond, controlBytesPerSecond);
	private readonly _sendControlBudget = new ControlBudget(controlMessagesPerSecond * controlSendFraction, controlBytesPerSecond * controlSendFraction);
	private _controlBytes = 0;
	private _controlTimer: ReturnType<typeof setTimeout> | undefined;
	private _sendingControls = false;
	private _closed = false;
	private _timer: ReturnType<typeof setTimeout> | undefined;
	private _scheduled = false;
	private _burstBytes = 0;
	private _cursor = 0;

	constructor(private readonly _transport: IProtocolTransport, private readonly _onError: (error: Error) => void) { super(); }

	add(channel: AgentHostChannelDelivery): void {
		if (this._store.isDisposed || this._channels.has(channel.channel)) {
			throw new Error('Channel scheduler is disposed or channel is already registered');
		}
		this.clearControls(channel.channel);
		this._channels.set(channel.channel, channel);
	}

	clearControls(channel: string): void {
		// Delayed controls must not reach a new incarnation of the same channel URI.
		for (const method of WINDOW_EXEMPT_METHODS) {
			const key = `${method}:${channel}`;
			const control = this._controls.get(key);
			if (control) {
				this._controlBytes -= control.bytes;
				this._controls.delete(key);
			}
		}
	}

	remove(channel: AgentHostChannelDelivery): void {
		if (this._channels.get(channel.channel) === channel) {
			this._channels.delete(channel.channel);
		}
	}

	/** Ordinary subscriptions retain their existing unsubscribe path. */
	checkControl(message: JsonRpcNotification): boolean {
		if (this._closed) {
			return false;
		}
		if (countsAgainstWindow(message.method)) {
			return true;
		}
		try {
			const { channel } = notificationValidator.validateOrThrow(message).params;
			if (message.method === 'unsubscribe' && !channel.startsWith('ahp-tcp:') && !this._channels.has(channel)) {
				return true;
			}
			const bytes = getProtocolMessageSize(message);
			if (bytes > maximumControlBytes || !this._receiveControlBudget.take(bytes)) {
				throw new Error('Channel control receive budget exceeded');
			}
			return true;
		} catch (error) {
			this._fail(error instanceof Error ? error : new Error(String(error)));
			return false;
		}
	}

	acceptMessage(message: JsonRpcNotification, controlChecked = false): boolean {
		if (!controlChecked && !this.checkControl(message)) {
			return true;
		}
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

	sendControl(message: JsonRpcNotification, onSend?: () => void): void {
		// Teardown can request a reset after the transport's control lane has closed.
		if (this._closed) {
			return;
		}
		try {
			const { channel } = notificationValidator.validateOrThrow(message).params;
			const bytes = JSON.stringify(message).length * 2;
			if (countsAgainstWindow(message.method) || bytes > maximumControlBytes) {
				throw new Error('Invalid or oversized channel control');
			}
			const key = `${message.method}:${channel}`;
			const previous = this._controls.get(key);
			const queuedBytes = this._controlBytes - (previous?.bytes ?? 0) + bytes;
			if ((!previous && this._controls.size >= maximumQueueLength) || queuedBytes > maximumControlQueueBytes) {
				throw new Error('Channel control send queue capacity exceeded');
			}
			this._controls.set(key, { message, bytes, onSend });
			this._controlBytes = queuedBytes;
			this._sendControls();
		} catch (error) {
			this._fail(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private _sendControls(): void {
		if (this._sendingControls || this._closed) {
			return;
		}
		this._sendingControls = true;
		try {
			let burstBytes = 0;
			for (const [key, control] of this._controls) {
				// Reserve bounded transport space for controls even when data fills its budget.
				if (burstBytes + control.bytes > maximumControlQueueBytes
					|| (this._transport.bufferedAmount ?? 0) + control.bytes > channelSendBurstBytes + maximumControlQueueBytes
					|| !this._sendControlBudget.take(control.bytes)) {
					break;
				}
				this._controls.delete(key);
				this._controlBytes -= control.bytes;
				burstBytes += control.bytes;
				control.onSend?.();
				this._transport.send(control.message);
			}
		} catch (error) {
			this._fail(error instanceof Error ? error : new Error(String(error)));
		} finally {
			this._sendingControls = false;
		}
		if (this._controls.size && this._controlTimer === undefined && !this._closed) {
			this._controlTimer = setTimeout(() => {
				this._controlTimer = undefined;
				this._sendControls();
			}, transportDrainPollInterval);
		}
	}

	private _fail(error: Error): void {
		if (this._closed) {
			return;
		}
		try {
			this._onError(error);
		} finally {
			this.dispose();
			this._transport.dispose();
		}
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
		this._closed = true;
		clearTimeout(this._timer);
		clearTimeout(this._controlTimer);
		this._controls.clear();
		this._controlBytes = 0;
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
	private _creditPrompt = false;

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
			const envelope = { jsonrpc: '2.0' as const, method: 'channel/frame', params: { channel: this.channel, data: '', final: false } };
			const envelopeLength = JSON.stringify(envelope).length;
			const remainingCredit = this._sendLimits.windowBytes - (this._sentBytes - this._peerConsumed);
			// Even a one-byte window must fit the envelope and one escaped code point.
			const frameBytes = Math.min(this.maximumFrameBytes, Math.max((envelopeLength + 6) * 2, remainingCredit));
			if (next.offset || next.text.length * 2 > frameBytes) {
				let budget = frameBytes / 2 - envelopeLength;
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
		// A sender using a smaller window can stall mid-message before reaching
		// our batching threshold. Credit fragments promptly; coalesce small complete messages.
		const prompt = this._fragments.length > 0
			|| this._consumedBytes - this._creditedBytes >= this._receiveLimits.windowBytes * creditWindowFraction;
		if (this._creditPrompt || (this._creditTimer !== undefined && !prompt)) {
			return;
		}
		clearTimeout(this._creditTimer);
		this._creditTimer = undefined;
		const flush = () => {
			try {
				this.flushCredit();
			} catch (error) {
				this.fail(error instanceof Error ? error : new Error(String(error)));
			}
		};
		if (prompt) {
			// Avoid browser timer clamping on the credit/data round trip.
			// The shared scheduler still enforces control-rate and transport budgets.
			this._creditPrompt = true;
			queueMicrotask(() => {
				if (this._creditPrompt) {
					flush();
				}
			});
		} else {
			this._creditTimer = setTimeout(flush, creditDelay);
		}
	}

	flushCredit(): void {
		clearTimeout(this._creditTimer);
		this._creditTimer = undefined;
		this._creditPrompt = false;
		if (!this._error && this._consumedBytes > this._creditedBytes) {
			const consumedBytes = this._consumedBytes;
			this._scheduler.sendControl({ jsonrpc: '2.0', method: 'channel/credit', params: { channel: this.channel, consumedBytes } }, () => {
				this._creditedBytes = consumedBytes;
			});
		}
	}

	fail(error: Error): void {
		if (this._error) {
			return;
		}
		this._error = error;
		clearTimeout(this._creditTimer);
		this._creditPrompt = false;
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
