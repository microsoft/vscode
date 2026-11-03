/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { vNumber, vObj, vObjAny, vString } from '../../../base/common/validation.js';
import { AgentHostChannelDelivery, AgentHostChannelScheduler, readChannelFlowControl, validateChannelLimits } from './agentHostChannelDelivery.js';
import { AgentHostChannelError, AgentHostChannelErrorCode } from './agentHostChannelTelemetry.js';
import { countsAgainstWindow } from './state/protocol/window-exempt.generated.js';
import { ActionType, type ActionEnvelope } from './state/sessionActions.js';
import type { ChannelFlowControl, ChannelReceiveLimits } from './state/protocol/common/state.js';
import type { IStateSnapshot, JsonRpcNotification } from './state/sessionProtocol.js';
import type { IProtocolTransport } from './state/sessionTransport.js';

/** Behavior of one kind of channel under windowed delivery. */
export interface IAgentHostChannelPolicy {
	/**
	 * Bounds queued outgoing data, and incoming data that is reassembling or
	 * not yet released, in addition to the one message being sent or received.
	 */
	readonly maximumBufferedBytes: number;
	/** Bounds one complete message received by each side. Omit a side for no limit. */
	readonly maximumReceivedMessageBytes?: { readonly host?: number; readonly client?: number };
	/**
	 * Control notification, such as `tcp/reset`, that tells the peer this
	 * subscription failed. Without one, a failure closes the transport and the
	 * peer recovers the channel when it reconnects.
	 */
	readonly resetMethod?: string;
	/** Merges two adjacent, unsent data notifications into one with the same effect, if possible. */
	coalesce?(previous: JsonRpcNotification, next: JsonRpcNotification): JsonRpcNotification | undefined;
	/** Throws if a received snapshot's state is invalid for this kind of channel. */
	validateSnapshot?(snapshot: IStateSnapshot): void;
}

/** Limits for windowed state channels: the client's offer and the host's maximum. */
export const agentHostStateReceiveLimits: Readonly<ChannelReceiveLimits> = {
	windowBytes: 1024 * 1024,
	maximumFrameBytes: 16 * 1024 * 1024,
};

/**
 * Host: accepts a client's receive offer, lowered to `maximum`. Returns
 * `undefined` when a `channel/frame` for `channel` cannot fit the accepted
 * frame limit, in which case the host must decline windowed delivery. Throws
 * if the offer is invalid.
 */
export function negotiateChannelFlowControl(channel: string, offer: ChannelReceiveLimits, maximum: ChannelReceiveLimits): ChannelFlowControl | undefined {
	validateChannelLimits(offer);
	const clientReceive = {
		windowBytes: Math.min(offer.windowBytes, maximum.windowBytes),
		maximumFrameBytes: Math.min(offer.maximumFrameBytes, maximum.maximumFrameBytes),
	};
	// The smallest useful fragment carries one character, which may need a six-character escape.
	const frame = { jsonrpc: '2.0', method: 'channel/frame', params: { channel, data: '\u0000', final: false } };
	return JSON.stringify(frame).length * 2 > clientReceive.maximumFrameBytes ? undefined : { clientReceive, hostReceive: { ...maximum } };
}

/** Client: reads the limits a host accepted, which must not exceed the client's offer. */
export function readAcceptedChannelFlowControl(value: unknown, offer: ChannelReceiveLimits): ChannelFlowControl {
	const flowControl = readChannelFlowControl(value);
	if (flowControl.clientReceive.windowBytes > offer.windowBytes || flowControl.clientReceive.maximumFrameBytes > offer.maximumFrameBytes) {
		throw new AgentHostChannelError(AgentHostChannelErrorCode.InvalidMessage, 'Host increased the offered receive limits');
	}
	return flowControl;
}

export const agentHostStateChannelPolicy: IAgentHostChannelPolicy = {
	// A snapshot can be arbitrarily large, so only the backlog behind it is bounded.
	maximumBufferedBytes: 128 * 1024 * 1024,
	// Client messages, such as `dispatchAction`, are small. This matches the 100 MB message limit that the
	// host's WebSocket server applies to ordinary delivery, at two bytes for each UTF-16 code unit.
	maximumReceivedMessageBytes: { host: 200 * 1024 * 1024 },
	coalesce(previous, next) {
		if (previous.method !== 'action' || next.method !== 'action') {
			return undefined;
		}
		const a = previous.params as ActionEnvelope;
		const b = next.params as ActionEnvelope;
		// Echoes and rejections carry per-action meaning that must reach the peer.
		if (a.origin || b.origin || a.rejectionReason !== undefined || b.rejectionReason !== undefined) {
			return undefined;
		}
		if (a.action.type === ActionType.TerminalData && b.action.type === ActionType.TerminalData) {
			return { ...next, params: { ...b, action: { ...b.action, data: a.action.data + b.action.data } } };
		}
		if (a.action.type === ActionType.ChatDelta && b.action.type === ActionType.ChatDelta
			&& a.action.turnId === b.action.turnId && a.action.partId === b.action.partId && equals(a.action._meta, b.action._meta)) {
			return { ...next, params: { ...b, action: { ...b.action, content: a.action.content + b.action.content } } };
		}
		return undefined;
	},
};

const snapshotParamsValidator = vObj({ snapshot: vObj({ resource: vString(), state: vObjAny(), fromSeq: vNumber() }) });

/**
 * One peer's windowed subscription to a channel on one transport. Owns the
 * window, queues, reassembly, and snapshots in both directions.
 *
 * Disposing it ends delivery quietly. {@link fail} ends it and, unless the
 * peer already knows, notifies the peer as the channel's policy describes.
 */
export class AgentHostChannelSubscription extends Disposable {
	private readonly _delivery: AgentHostChannelDelivery;
	private readonly _snapshots = new Set<DeferredPromise<IStateSnapshot>>();
	private _hasSnapshot = false;
	private _closed = false;
	private _notifyPeer = true;

	/**
	 * @param accept Receives each complete inbound data or control message
	 * other than `channel/snapshot`. Data is released to the peer when `accept`
	 * returns, or when its promise settles.
	 * @param onClose Called once when the subscription fails, but not when it
	 * is disposed. `notifiedPeer` is whether {@link fail} notified the peer.
	 */
	constructor(
		readonly channel: string,
		flowControl: ChannelFlowControl,
		private readonly _isHost: boolean,
		private readonly _transport: IProtocolTransport,
		private readonly _scheduler: AgentHostChannelScheduler,
		private readonly _policy: IAgentHostChannelPolicy,
		private readonly _accept: (message: JsonRpcNotification) => void | Promise<void>,
		private readonly _onClose: (error: Error, notifiedPeer: boolean) => void,
	) {
		super();
		try {
			this._delivery = this._register(new AgentHostChannelDelivery(
				channel,
				_isHost ? flowControl.clientReceive : flowControl.hostReceive,
				_isHost ? flowControl.hostReceive : flowControl.clientReceive,
				_transport,
				_scheduler,
				(message, release) => this._receive(message, release),
				error => this._failed(error),
				_policy.maximumBufferedBytes,
				_isHost ? _policy.maximumReceivedMessageBytes?.host : _policy.maximumReceivedMessageBytes?.client,
			));
		} catch (error) {
			super.dispose();
			throw error;
		}
	}

	/**
	 * Queues a data notification, coalescing it into the last unsent one when
	 * the policy allows. Resolves once it is sent; a failure also fails the
	 * subscription, so callers may ignore the result.
	 */
	send(message: JsonRpcNotification): Promise<void> {
		const coalesce = this._policy.coalesce;
		let queued: Promise<number>;
		try {
			queued = this._delivery.send(message, coalesce && (previous => coalesce(previous, message)));
		} catch (error) {
			queued = Promise.reject(error);
		}
		const sent = queued.then(() => { }, error => {
			this.fail(error);
			throw error;
		});
		sent.catch(() => { });
		return sent;
	}

	/** Host: sends the channel's state as a `channel/snapshot` data message. */
	sendSnapshot(snapshot: IStateSnapshot): Promise<void> {
		return this.send({ jsonrpc: '2.0', method: 'channel/snapshot', params: { channel: this.channel, snapshot: { ...snapshot, resource: this.channel } } });
	}

	/** Client: resolves with the next `channel/snapshot`, or rejects if the subscription ends first. */
	nextSnapshot(): Promise<IStateSnapshot> {
		const snapshot = new DeferredPromise<IStateSnapshot>();
		if (this._closed) {
			snapshot.error(new CancellationError());
		} else {
			this._snapshots.add(snapshot);
		}
		return snapshot.p;
	}

	/**
	 * Client: the host resumed this subscription after a reconnect without
	 * sending a new snapshot first (`live` or `replay` recovery), so data can
	 * arrive before the next snapshot.
	 */
	resumeWithoutSnapshot(): void {
		this._hasSnapshot = true;
	}

	/** Resolves once the peer has released everything queued so far. */
	drain(): Promise<void> {
		return this._delivery.drain();
	}

	/** Sends any credit that is waiting to be batched. */
	flushCredit(): void {
		this._delivery.flushCredit();
	}

	/** Applies the peer's renegotiated receive limits; counters and queued data are kept. */
	setPeerReceiveLimits(limits: ChannelReceiveLimits): void {
		this._delivery.setSendLimits(limits);
	}

	/**
	 * Ends the subscription with an error. When `notifyPeer` is true, sends the
	 * policy's reset (and, from a client, `unsubscribe`), or closes the
	 * transport. Pass `false` when the peer already knows, such as when it
	 * reset the channel or the transport closed.
	 */
	fail(error: Error, notifyPeer = true): void {
		if (!this._closed) {
			this._notifyPeer = notifyPeer;
			this._delivery.fail(error);
		}
	}

	override dispose(): void {
		if (!this._closed) {
			this._closed = true;
			this._rejectSnapshots(new CancellationError());
		}
		super.dispose();
	}

	private _receive(message: JsonRpcNotification, release: () => void): void {
		if (message.method !== 'channel/snapshot') {
			// A host's first data message on a windowed subscription is its snapshot.
			if (!this._isHost && !this._hasSnapshot && countsAgainstWindow(message.method)) {
				throw new AgentHostChannelError(AgentHostChannelErrorCode.DataBeforeSnapshot, 'Channel data before its snapshot');
			}
			const accepted = this._accept(message);
			if (accepted) {
				void accepted.then(release, release);
			} else {
				release();
			}
			return;
		}
		const result = snapshotParamsValidator.validate(message.params);
		if (result.error) {
			throw new AgentHostChannelError(AgentHostChannelErrorCode.InvalidSnapshot, result.error.message);
		}
		const { snapshot } = result.content;
		if (this._isHost || snapshot.resource !== this.channel || !snapshot.state || Array.isArray(snapshot.state)
			|| !Number.isSafeInteger(snapshot.fromSeq) || snapshot.fromSeq < 0) {
			throw new AgentHostChannelError(AgentHostChannelErrorCode.InvalidSnapshot, 'Invalid channel snapshot');
		}
		try {
			this._policy.validateSnapshot?.(snapshot as IStateSnapshot);
		} catch (error) {
			throw new AgentHostChannelError(AgentHostChannelErrorCode.InvalidSnapshot, error instanceof Error ? error.message : String(error));
		}
		this._hasSnapshot = true;
		release();
		const waiters = [...this._snapshots];
		this._snapshots.clear();
		for (const waiter of waiters) {
			waiter.complete(snapshot as IStateSnapshot);
		}
	}

	private _failed(error: Error): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		this._rejectSnapshots(error);
		try {
			if (this._notifyPeer && this._policy.resetMethod) {
				this._scheduler.sendControl({ jsonrpc: '2.0', method: this._policy.resetMethod, params: { channel: this.channel } });
				if (!this._isHost) {
					this._scheduler.sendControl({ jsonrpc: '2.0', method: 'unsubscribe', params: { channel: this.channel } });
				}
			}
			this._onClose(error, this._notifyPeer);
		} finally {
			this.dispose();
			if (this._notifyPeer && !this._policy.resetMethod) {
				this._transport.dispose();
			}
		}
	}

	private _rejectSnapshots(error: Error): void {
		const waiters = [...this._snapshots];
		this._snapshots.clear();
		for (const waiter of waiters) {
			waiter.error(error);
		}
	}
}
