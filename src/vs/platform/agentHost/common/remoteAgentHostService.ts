/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

/**
 * Manages connections to one or more remote agent host processes over
 * WebSocket. Each connection is identified by its address string and
 * exposed as an {@link IAgentConnection}, the same interface used for
 * the local agent host.
 */
export interface IRemoteAgentHostService {
	readonly _serviceBrand: undefined;

	/** Fires when a remote connection is established or lost. */
	readonly onDidChangeConnections: Event<void>;

	/** Currently connected remote addresses with metadata. */
	readonly connections: readonly IRemoteAgentHostConnectionInfo[];

	/**
	 * Get a per-connection {@link IAgentConnection} for subscribing to
	 * state, dispatching actions, creating sessions, etc.
	 *
	 * Returns `undefined` if no active connection exists for the address.
	 */
	getConnection(address: string): IAgentConnection | undefined;
}

/** Metadata about a single remote connection. */
export interface IRemoteAgentHostConnectionInfo {
	readonly address: string;
	readonly name: string;
	readonly clientId: string;
	readonly defaultDirectory?: string;
}

export class NullRemoteAgentHostService implements IRemoteAgentHostService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeConnections = Event.None;
	readonly connections: readonly IRemoteAgentHostConnectionInfo[] = [];
	getConnection(): IAgentConnection | undefined { return undefined; }
}
