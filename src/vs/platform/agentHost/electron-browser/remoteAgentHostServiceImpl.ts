/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Service implementation that manages WebSocket connections to remote agent
// host processes. Reads addresses from the `chat.remoteAgentHosts` setting
// and maintains connections. When a connection drops the entry is preserved
// in a disconnected state; callers trigger reconnection on demand via
// `ensureConnected()`.

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

import type { IAgentConnection } from '../common/agentService.js';
import type { IReconnectResult } from '../common/state/protocol/commands.js';
import {
	IRemoteAgentHostService,
	RemoteAgentHostsSettingId,
	type IConnectionStateChange,
	type IRemoteAgentHostConnectionInfo,
	type IRemoteAgentHostEntry,
} from '../common/remoteAgentHostService.js';
import { RemoteAgentHostProtocolClient } from './remoteAgentHostProtocolClient.js';

/**
 * Tracks a single remote connection through its lifecycle.
 * The entry persists across disconnect/reconnect cycles.
 */
interface IConnectionEntry {
	/** Disposables scoped to the current WebSocket connection. Disposed on disconnect. */
	connectionStore: DisposableStore;
	/** The active protocol client, or `undefined` when disconnected. */
	client: RemoteAgentHostProtocolClient | undefined;
	/** Whether the WebSocket is currently open. */
	connected: boolean;
	/** Connection token from settings for reconnection. */
	connectionToken?: string;
	// ---- Reconnection metadata (captured on disconnect) ----
	/** Client ID to reuse across reconnects. */
	savedClientId: string | undefined;
	/** Last server sequence number for replay on reconnect. */
	savedServerSeq: number;
	/** Default directory from the last connection. */
	savedDefaultDirectory: string | undefined;
}

export class RemoteAgentHostService extends Disposable implements IRemoteAgentHostService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections = this._onDidChangeConnections.event;

	private readonly _onDidChangeConnectionState = this._register(new Emitter<IConnectionStateChange>());
	readonly onDidChangeConnectionState = this._onDidChangeConnectionState.event;

	private readonly _entries = new Map<string, IConnectionEntry>();
	private readonly _names = new Map<string, string>();
	/** Coalesces concurrent ensureConnected calls for the same address. */
	private readonly _pendingReconnects = new Map<string, Promise<IAgentConnection>>();

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
			result.push({
				address,
				name: this._names.get(address) ?? address,
				connected: entry.connected,
				clientId: entry.client?.clientId ?? entry.savedClientId,
				defaultDirectory: entry.client?.defaultDirectory ?? entry.savedDefaultDirectory,
			});
		}
		return result;
	}

	getConnection(address: string): IAgentConnection | undefined {
		const entry = this._entries.get(address);
		return entry?.connected ? entry.client : undefined;
	}

	async ensureConnected(address: string, token?: CancellationToken): Promise<IAgentConnection> {
		const entry = this._entries.get(address);
		if (!entry) {
			throw new Error(`No configured connection for address: ${address}`);
		}
		if (entry.connected && entry.client) {
			return entry.client;
		}

		// Coalesce concurrent reconnect attempts for the same address
		const pending = this._pendingReconnects.get(address);
		if (pending) {
			return pending;
		}

		const reconnectPromise = this._reconnect(address, entry, token).finally(() => {
			this._pendingReconnects.delete(address);
		});
		this._pendingReconnects.set(address, reconnectPromise);
		return reconnectPromise;
	}

	private _removeEntry(address: string): void {
		const entry = this._entries.get(address);
		if (entry) {
			entry.connectionStore.dispose();
			entry.client = undefined;
			entry.connected = false;
			this._entries.delete(address);
			this._pendingReconnects.delete(address);
			this._onDidChangeConnections.fire();
		}
	}

	private _disconnectEntry(address: string, entry: IConnectionEntry): void {
		if (!entry.connected && !entry.client) {
			return; // already disconnected
		}

		// Capture reconnection metadata before disposing the client
		if (entry.client) {
			entry.savedClientId = entry.client.clientId;
			entry.savedServerSeq = entry.client.serverSeq;
			entry.savedDefaultDirectory = entry.client.defaultDirectory;
		}

		entry.connectionStore.dispose();
		entry.connectionStore = new DisposableStore();
		entry.client = undefined;
		entry.connected = false;

		this._onDidChangeConnectionState.fire({ address, connected: false });
	}

	private _reconcileConnections(): void {
		const entries: IRemoteAgentHostEntry[] = this._configurationService.getValue<IRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId) ?? [];
		const desired = new Set(entries.map(e => e.address));

		this._logService.info(`[RemoteAgentHost] Reconciling: desired=[${[...desired].join(', ')}], current=[${[...this._entries.keys()].map(a => `${a}(${this._entries.get(a)!.connected ? 'connected' : 'disconnected'})`).join(', ')}]`);

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

		// Remove entries no longer in the setting
		for (const address of [...this._entries.keys()]) {
			if (!desired.has(address)) {
				this._logService.info(`[RemoteAgentHost] Removing ${address}`);
				this._removeEntry(address);
			}
		}

		// Add new entries and initiate connection
		for (const entry of entries) {
			const existing = this._entries.get(entry.address);
			if (!existing) {
				this._connectTo(entry.address, entry.connectionToken);
			} else {
				// Update stored connection token in case it changed
				existing.connectionToken = entry.connectionToken;
			}
		}

		// If only names changed (no add/remove), notify so the UI updates
		if (namesChanged) {
			this._onDidChangeConnections.fire();
		}
	}

	private _connectTo(address: string, connectionToken?: string): void {
		const connectionStore = new DisposableStore();
		const client = connectionStore.add(this._instantiationService.createInstance(
			RemoteAgentHostProtocolClient, address, connectionToken, /* clientId */ undefined));

		const entry: IConnectionEntry = {
			connectionStore,
			client,
			connected: false,
			connectionToken,
			savedClientId: undefined,
			savedServerSeq: 0,
			savedDefaultDirectory: undefined,
		};
		this._entries.set(address, entry);
		// Notify immediately so the contribution layer can set up UI
		// registrations even before the async connect completes.
		this._onDidChangeConnections.fire();

		// Guard against stale callbacks
		const guardedDisconnect = () => {
			if (this._entries.get(address) === entry && entry.client === client) {
				this._logService.warn(`[RemoteAgentHost] Connection closed: ${address}`);
				this._disconnectEntry(address, entry);
			}
		};

		connectionStore.add(client.onDidClose(() => guardedDisconnect()));

		this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
		// Register the initial connect as a pending attempt so that
		// ensureConnected() joins it rather than spawning a second client.
		const connectPromise = client.connect().then<IAgentConnection>(() => {
			if (connectionStore.isDisposed || entry.client !== client) {
				throw new Error('Connection superseded');
			}
			this._logService.info(`[RemoteAgentHost] Connected to ${address}`);
			entry.connected = true;
			this._onDidChangeConnectionState.fire({ address, connected: true });
			return client;
		}).catch(err => {
			this._logService.error(`[RemoteAgentHost] Failed to connect to ${address}`, err);
			// Only mutate the entry if this client is still the active one.
			// A concurrent ensureConnected may have already replaced it.
			if (this._entries.get(address) === entry && entry.client === client) {
				connectionStore.dispose();
				entry.client = undefined;
				entry.connected = false;
				this._onDidChangeConnectionState.fire({ address, connected: false });
			}
			throw err;
		}).finally(() => {
			this._pendingReconnects.delete(address);
		});
		// Prevent unhandled rejection when nobody joins via ensureConnected
		connectPromise.catch(() => { });
		this._pendingReconnects.set(address, connectPromise);
	}

	private async _reconnect(address: string, entry: IConnectionEntry, token?: CancellationToken): Promise<IAgentConnection> {
		const connectionStore = new DisposableStore();
		const client = connectionStore.add(this._instantiationService.createInstance(
			RemoteAgentHostProtocolClient, address, entry.connectionToken,
			entry.savedClientId));

		// Guard against stale callbacks
		const guardedDisconnect = () => {
			if (this._entries.get(address) === entry && entry.client === client) {
				this._logService.warn(`[RemoteAgentHost] Connection closed: ${address}`);
				this._disconnectEntry(address, entry);
			}
		};

		connectionStore.add(client.onDidClose(() => guardedDisconnect()));

		let reconnectResult: IReconnectResult | undefined;
		try {
			if (entry.savedClientId) {
				this._logService.info(`[RemoteAgentHost] Reconnecting to ${address} (clientId=${entry.savedClientId}, serverSeq=${entry.savedServerSeq})`);
				reconnectResult = await client.reconnect(entry.savedServerSeq, [], token);
			} else {
				this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
				await client.connect(token);
			}
		} catch (err) {
			connectionStore.dispose();
			this._logService.error(`[RemoteAgentHost] Failed to reconnect to ${address}`, err);
			throw err;
		}

		// If the entry was removed while the reconnect was in-flight (e.g. the
		// user removed the address from settings), discard the new connection.
		if (this._entries.get(address) !== entry) {
			connectionStore.dispose();
			throw new Error(`Address ${address} was removed during reconnect`);
		}

		// Dispose the old connection store and swap in the new one
		entry.connectionStore.dispose();
		entry.connectionStore = connectionStore;
		entry.client = client;
		entry.connected = true;

		this._logService.info(`[RemoteAgentHost] Reconnected to ${address}`);
		// Fire state change synchronously so contribution wires consumers
		// before replay actions are emitted below.
		this._onDidChangeConnectionState.fire({ address, connected: true });

		// Now that consumers are wired, emit any replayed actions
		if (reconnectResult) {
			client.emitReplayActions(reconnectResult);
		}

		return client;
	}

	override dispose(): void {
		for (const entry of this._entries.values()) {
			entry.connectionStore.dispose();
		}
		this._entries.clear();
		super.dispose();
	}
}
