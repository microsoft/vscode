/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentHostChannelSubscription, agentHostStateChannelPolicy } from '../common/agentHostChannel.js';
import { AgentHostChannelScheduler } from '../common/agentHostChannelDelivery.js';
import { reportAgentHostChannelFailure } from '../common/agentHostChannelTelemetry.js';
import { AgentHostTcpBudget } from '../common/agentHostTcpConnection.js';
import type { ChannelFlowControl } from '../common/state/protocol/common/state.js';
import type { IStateSnapshot, JsonRpcNotification, JsonRpcResponse } from '../common/state/sessionProtocol.js';
import type { IProtocolTransport } from '../common/state/sessionTransport.js';
import { AgentHostTcpConnections } from './agentHostTcpConnections.js';

export interface IAgentHostServedChannel extends IDisposable {
	start(flowControl: ChannelFlowControl): void;
	accept(message: JsonRpcNotification): void;
	send?(message: JsonRpcNotification): void;
}

class StateChannel extends Disposable implements IAgentHostServedChannel {
	private readonly _subscription = this._register(new MutableDisposable<AgentHostChannelSubscription>());

	constructor(
		private readonly _channel: string,
		public getSnapshot: () => IStateSnapshot,
		private readonly _transport: IProtocolTransport,
		private readonly _scheduler: AgentHostChannelScheduler,
		readonly accept: (message: JsonRpcNotification) => void,
		private readonly _reportFailure: (error: Error) => void,
	) { super(); }

	start(flowControl: ChannelFlowControl): void {
		try {
			const snapshot = this.getSnapshot();
			if (this._subscription.value) {
				this._subscription.value.setPeerReceiveLimits(flowControl.clientReceive);
			} else {
				this._subscription.value = new AgentHostChannelSubscription(this._channel, flowControl, true,
					this._transport, this._scheduler, agentHostStateChannelPolicy, message => {
						try {
							this.accept(message);
						} catch (error) {
							onUnexpectedError(error);
						}
					}, (error, notifiedPeer) => {
						if (notifiedPeer) {
							this._reportFailure(error);
						}
					});
			}
			this._subscription.value.sendSnapshot(snapshot);
		} catch (error) {
			this._reportFailure(error instanceof Error ? error : new Error(String(error)));
			this._transport.dispose();
		}
	}

	send(message: JsonRpcNotification): void {
		this._subscription.value?.send(message);
	}
}

/** Owns all served channels and their scheduler for exactly one transport. */
export class AgentHostConnectionChannels extends Disposable {
	private readonly _channels = this._register(new DisposableMap<string, IAgentHostServedChannel>());
	readonly scheduler: AgentHostChannelScheduler;
	readonly tcp: AgentHostTcpConnections;

	constructor(
		private readonly _transport: IProtocolTransport,
		budget: AgentHostTcpBudget,
		getSequence: () => number,
		private readonly _logService: ILogService,
		private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this.scheduler = this._register(new AgentHostChannelScheduler(_transport, error => reportAgentHostChannelFailure(_logService, _telemetryService, 'host', undefined, error, true)));
		this.tcp = this._register(new AgentHostTcpConnections(_transport, budget, this, getSequence,
			error => _logService.error('[AgentHostTcp]', error),
			(channel, error) => reportAgentHostChannelFailure(_logService, _telemetryService, 'host', channel, error, false)));
	}

	register(channel: string, served: IAgentHostServedChannel): IDisposable {
		this.scheduler.clearControls(channel);
		this._channels.set(channel, served);
		return toDisposable(() => {
			if (this._channels.get(channel) === served) {
				this._channels.deleteAndLeak(channel);
			}
		});
	}

	serveState(channel: string, getSnapshot: () => IStateSnapshot, accept: (message: JsonRpcNotification) => void): void {
		const existing = this._channels.get(channel);
		if (existing instanceof StateChannel) {
			existing.getSnapshot = getSnapshot;
		} else {
			this._channels.set(channel, new StateChannel(channel, getSnapshot, this._transport, this.scheduler, accept,
				error => reportAgentHostChannelFailure(this._logService, this._telemetryService, 'host', channel, error, true)));
		}
	}

	getStateSnapshot(channel: string): IStateSnapshot | undefined {
		const served = this._channels.get(channel);
		return served instanceof StateChannel ? served.getSnapshot() : undefined;
	}

	has(channel: string): boolean { return this._channels.has(channel); }

	remove(channel: string): void { this._channels.deleteAndDispose(channel); }

	clear(): void { this._channels.clearAndDisposeAll(); }

	/** Sending and starting together prevents snapshots from preceding their response. */
	respond(response: JsonRpcResponse, windows: Iterable<{ channel: string; flowControl?: ChannelFlowControl }> = []): void {
		this._transport.send(response);
		for (const { channel, flowControl } of windows) {
			if (this._store.isDisposed) {
				return;
			}
			if (flowControl) {
				this._channels.get(channel)?.start(flowControl);
			} else {
				this.remove(channel);
			}
		}
	}

	acceptMessage(message: JsonRpcNotification): boolean {
		if (!this.scheduler.checkControl(message)) {
			return true;
		}
		if (message.method !== 'unsubscribe' && this.scheduler.acceptMessage(message, true)) {
			return true;
		}
		const channel = (message.params as { channel?: string } | undefined)?.channel;
		const served = typeof channel === 'string' ? this._channels.get(channel) : undefined;
		if (served) {
			served.accept(message);
			return true;
		}
		if (typeof channel === 'string' && channel.startsWith('ahp-tcp:')) {
			if (message.method !== 'unsubscribe' && message.method !== 'tcp/reset') {
				this._logService.warn('[AgentHostTcp] Notification for an unavailable TCP channel');
			}
			return true;
		}
		return false;
	}

	send(message: JsonRpcNotification): void {
		const channel = (message.params as { channel?: string } | undefined)?.channel;
		const served = typeof channel === 'string' ? this._channels.get(channel) : undefined;
		if (served) {
			served.send?.(message);
		} else {
			this._transport.send(message);
		}
	}
}
