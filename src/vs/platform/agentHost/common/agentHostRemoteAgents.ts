/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IObservable } from '../../../base/common/observable.js';
import type { IAgentConnection } from './agentService.js';
import type { IRemoteAgentHostReconnectPolicy } from './reconnectPolicy.js';
import type { IRemoteAgentHostProtocolClient } from './remoteAgentHostService.js';

export const enum AgentHostRemoteTargetStatus {
	Connecting = 'connecting',
	Connected = 'connected',
	Reconnecting = 'reconnecting',
	Unavailable = 'unavailable',
}

export class AgentHostRemoteTargetUnavailableError extends Error {
	constructor(
		readonly connectorId: string,
		readonly targetId: string,
		readonly status: AgentHostRemoteTargetStatus,
	) {
		super(`Remote Agent Host target is unavailable: ${connectorId}/${targetId} (${status})`);
		this.name = 'AgentHostRemoteTargetUnavailableError';
	}
}

export interface IAgentHostRemoteTargetDescriptor {
	/** Connector-owned, account-aware identity used for ownership and deduplication. */
	readonly internalKey: string;
	/** Stable external identity exposed to RemoteAgent consumers. */
	readonly targetId: string;
	readonly label: string;
}

export interface IAgentHostRemoteTargetConnectOptions {
	readonly clientId: string;
	readonly cancellationToken: CancellationToken;
}

export interface IAgentHostRemoteTargetConnector {
	readonly connectorId: string;
	readonly targets: IObservable<readonly IAgentHostRemoteTargetDescriptor[]>;
	/** Outer redial policy after a protocol client reaches its terminal closed state. */
	readonly reconnectPolicy?: IRemoteAgentHostReconnectPolicy;
	/**
	 * Creates a transport-bound client without starting its AHP handshake.
	 * The connectivity service owns the returned client and calls `connect()`.
	 */
	createConnection(target: IAgentHostRemoteTargetDescriptor, options: IAgentHostRemoteTargetConnectOptions): Promise<IRemoteAgentHostProtocolClient>;
}

/**
 * Stable, transport-neutral view of one Agent Host admitted by a connector.
 *
 * Connectivity owns this handle. Consumers observe it but never dispose or
 * reconnect it.
 */
export interface IAgentHostRemoteTargetHandle {
	readonly connectorId: string;
	readonly targetId: string;
	readonly clientId: string;
	readonly label: IObservable<string>;
	readonly status: IObservable<AgentHostRemoteTargetStatus>;
	/**
	 * The initialized AHP connection while the target is usable. It is absent
	 * during initial connection, reconnect, and unavailability.
	 */
	readonly connection: IObservable<IAgentConnection | undefined>;
	readonly onDidDispose: Event<void>;
	requireConnection(): IAgentConnection;
}
