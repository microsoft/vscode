/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Service implementation that manages WebSocket connections to remote agent
// host processes. Reads addresses from the `chat.remoteAgentHosts` setting
// and maintains connections, reconnecting as the setting changes.

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
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

/** Tracks a single remote connection through its lifecycle. */
interface IConnectionEntry {
	readonly store: DisposableStore;
	readonly client: RemoteAgentHostProtocolClient;
	connected: boolean;
}

export class RemoteAgentHostService extends Disposable implements IRemoteAgentHostService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections = this._onDidChangeConnections.event;

	private readonly _entries = new Map<string, IConnectionEntry>();
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
		for (const [address, entry] of this._entries) {
			if (entry.connected) {
				result.push({
					address,
					name: this._names.get(address) ?? address,
					clientId: entry.client.clientId,
					defaultDirectory: entry.client.defaultDirectory,
				});
			}
		}
		return result;
	}

	getConnection(address: string): IAgentConnection | undefined {
		const entry = this._entries.get(address);
		return entry?.connected ? entry.client : undefined;
	}

	private _removeConnection(address: string): void {
		const entry = this._entries.get(address);
		if (entry) {
			this._entries.delete(address);
			entry.store.dispose();
			this._onDidChangeConnections.fire();
		}
	}

	private _reconcileConnections(): void {
		const entries: IRemoteAgentHostEntry[] = this._configurationService.getValue<IRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId) ?? [];
		const desired = new Set(entries.map(e => e.address));

		this._logService.info(`[RemoteAgentHost] Reconciling: desired=[${[...desired].join(', ')}], current=[${[...this._entries.keys()].map(a => `${a}(${this._entries.get(a)!.connected ? 'connected' : 'pending'})`).join(', ')}]`);

		// Update name map and detect name changes for existing connections
		let namesChanged = false;
		const oldNames = new Map(this._names);
		this._names.clear();
		for (const entry of entries) {
			this._names.set(entry.address, entry.name);
			if (this._entries.has(entry.address) && oldNames.get(entry.address) !== entry.name) {
				namesChanged = true;
			}
		}

		// Remove connections no longer in the setting
		for (const address of [...this._entries.keys()]) {
			if (!desired.has(address)) {
				this._logService.info(`[RemoteAgentHost] Disconnecting from ${address}`);
				this._removeConnection(address);
			}
		}

		// Add new connections
		for (const entry of entries) {
			if (!this._entries.has(entry.address)) {
				this._connectTo(entry.address, entry.connectionToken);
			}
		}

		// If only names changed (no add/remove), notify so the UI updates
		if (namesChanged) {
			this._onDidChangeConnections.fire();
		}
	}

	private _connectTo(address: string, connectionToken?: string): void {
		const store = new DisposableStore();
		const client = store.add(this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address, connectionToken));
		const entry: IConnectionEntry = { store, client, connected: false };
		this._entries.set(address, entry);

		// Guard removal against stale callbacks: only remove if the
		// current entry for this address is still the one we created.
		const guardedRemove = () => {
			if (this._entries.get(address) === entry) {
				this._removeConnection(address);
			}
		};

		store.add(client.onDidClose(() => {
			this._logService.warn(`[RemoteAgentHost] Connection closed: ${address}`);
			guardedRemove();
		}));

		this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
		client.connect().then(() => {
			if (store.isDisposed) {
				return; // removed before connect resolved
			}
			this._logService.info(`[RemoteAgentHost] Connected to ${address}`);
			entry.connected = true;
			this._onDidChangeConnections.fire();
		}).catch(err => {
			this._logService.error(`[RemoteAgentHost] Failed to connect to ${address}`, err);
			guardedRemove();
		});
	}

	override dispose(): void {
		for (const entry of this._entries.values()) {
			entry.store.dispose();
		}
		this._entries.clear();
		super.dispose();
	}
}
