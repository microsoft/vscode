/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Service implementation that manages WebSocket connections to remote agent
// host processes. Reads addresses from the `chat.remoteAgentHosts` setting
// and maintains connections, reconnecting as the setting changes.

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

import type { IAgentConnection } from '../common/agentService.js';
import {
	IRemoteAgentHostService,
	RemoteAgentHostsSettingId,
	type IRemoteAgentHostConnectionInfo,
	type IRemoteAgentHostEntry,
} from '../common/remoteAgentHostService.js';
import { RemoteAgentHostProtocolClient } from './remoteAgentHostProtocolClient.js';

export class RemoteAgentHostService extends Disposable implements IRemoteAgentHostService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections = this._onDidChangeConnections.event;

	/** Per-address disposable stores that own the client + its event listeners. */
	private readonly _connections = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _clients = new Map<string, RemoteAgentHostProtocolClient>();
	private readonly _names = new Map<string, string>();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// React to setting changes
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsSettingId)) {
				this._reconcileConnections();
			}
		}));

		// Initial connection
		this._reconcileConnections();
	}

	get connections(): readonly IRemoteAgentHostConnectionInfo[] {
		const result: IRemoteAgentHostConnectionInfo[] = [];
		for (const [address, client] of this._clients) {
			result.push({ address, name: this._names.get(address) ?? address, clientId: client.clientId });
		}
		return result;
	}

	getConnection(address: string): IAgentConnection | undefined {
		return this._clients.get(address);
	}

	private _removeConnection(address: string): void {
		this._clients.delete(address);
		this._connections.deleteAndDispose(address);
		this._onDidChangeConnections.fire();
	}

	private _reconcileConnections(): void {
		const entries: IRemoteAgentHostEntry[] = this._configurationService.getValue<IRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId) ?? [];
		const desired = new Set(entries.map(e => e.address));

		// Update name map
		this._names.clear();
		for (const entry of entries) {
			this._names.set(entry.address, entry.name);
		}

		// Remove connections no longer in the setting
		for (const address of this._clients.keys()) {
			if (!desired.has(address)) {
				this._logService.info(`[RemoteAgentHost] Disconnecting from ${address}`);
				this._removeConnection(address);
			}
		}

		// Add new connections
		for (const entry of entries) {
			if (!this._clients.has(entry.address)) {
				this._connectTo(entry.address);
			}
		}
	}

	private _connectTo(address: string): void {
		const store = new DisposableStore();
		const client = store.add(this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address));
		this._clients.set(address, client);
		this._connections.set(address, store);

		store.add(client.onDidClose(() => {
			this._logService.warn(`[RemoteAgentHost] Connection closed: ${address}`);
			this._removeConnection(address);
		}));

		this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
		client.connect().then(() => {
			this._logService.info(`[RemoteAgentHost] Connected to ${address}`);
			this._onDidChangeConnections.fire();
		}).catch(err => {
			this._logService.error(`[RemoteAgentHost] Failed to connect to ${address}`, err);
			this._removeConnection(address);
		});
	}
}
