/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentConnection } from './agentService.js';

/** Configuration key for the list of remote agent host addresses. */
export const RemoteAgentHostsSettingId = 'chat.remoteAgentHosts';

/** An entry in the {@link RemoteAgentHostsSettingId} setting. */
export interface IRemoteAgentHostEntry {
	readonly address: string;
	readonly name: string;
	readonly connectionToken?: string;
}

export const IRemoteAgentHostService = createDecorator<IRemoteAgentHostService>('remoteAgentHostService');

/** Payload for {@link IRemoteAgentHostService.onDidChangeConnectionState}. */
export interface IConnectionStateChange {
	readonly address: string;
	readonly connected: boolean;
}

/**
 * Manages connections to one or more remote agent host processes over
 * WebSocket. Each connection is identified by its address string and
 * exposed as an {@link IAgentConnection}, the same interface used for
 * the local agent host.
 */
export interface IRemoteAgentHostService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when configured connections are added or removed
	 * (e.g. the settings list changes).
	 */
	readonly onDidChangeConnections: Event<void>;

	/**
	 * Fires when a specific connection transitions between
	 * connected and disconnected states.
	 */
	readonly onDidChangeConnectionState: Event<IConnectionStateChange>;

	/**
	 * All configured remote addresses with metadata.
	 * Includes both connected and disconnected entries.
	 */
	readonly connections: readonly IRemoteAgentHostConnectionInfo[];

	/**
	 * Get a per-connection {@link IAgentConnection} for subscribing to
	 * state, dispatching actions, creating sessions, etc.
	 *
	 * Returns `undefined` if no active connection exists for the address.
	 */
	getConnection(address: string): IAgentConnection | undefined;

	/**
	 * Ensure an active connection to the given address, reconnecting
	 * on demand if the connection was previously lost.
	 *
	 * This method is silent - it does not show progress UI. Callers that
	 * want progress indicators for user-initiated actions should wrap
	 * this call with their own progress notifications.
	 *
	 * @throws if the connection cannot be established.
	 */
	ensureConnected(address: string, token?: CancellationToken): Promise<IAgentConnection>;
}

/** Metadata about a single remote connection. */
export interface IRemoteAgentHostConnectionInfo {
	readonly address: string;
	readonly name: string;
	/** Whether the WebSocket connection is currently active. */
	readonly connected: boolean;
	readonly clientId?: string;
	readonly defaultDirectory?: string;
}

export class NullRemoteAgentHostService implements IRemoteAgentHostService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeConnections = Event.None;
	readonly onDidChangeConnectionState = Event.None;
	readonly connections: readonly IRemoteAgentHostConnectionInfo[] = [];
	getConnection(): IAgentConnection | undefined { return undefined; }
	async ensureConnected(): Promise<IAgentConnection> { throw new Error('No remote agent host connections available'); }
}
