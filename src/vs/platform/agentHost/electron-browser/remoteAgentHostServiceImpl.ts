/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Service implementation that manages WebSocket connections to remote agent
// host processes. Reads addresses from the `chat.remoteAgentHosts` setting
// and maintains connections, reconnecting as the setting changes.

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { ConfigurationTarget, IConfigurationService } from '../../configuration/common/configuration.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

import type { IAgentConnection } from '../common/agentService.js';
import {
	IRemoteAgentHostService,
	RemoteAgentHostConnectionStatus,
	RemoteAgentHostEntryType,
	RemoteAgentHostsEnabledSettingId,
	RemoteAgentHostsSettingId,
	entryToRawEntry,
	getEntryAddress,
	rawEntryToEntry,
	type IRawRemoteAgentHostEntry,
	type IRemoteAgentHostConnectionInfo,
	type IRemoteAgentHostEntry,
} from '../common/remoteAgentHostService.js';
import { RemoteAgentHostProtocolClient } from './remoteAgentHostProtocolClient.js';
import { WebSocketClientTransport } from './webSocketClientTransport.js';
import { normalizeRemoteAgentHostAddress } from '../common/agentHostUri.js';
import { isDefined } from '../../../base/common/types.js';

/** Tracks a single remote connection through its lifecycle. */
interface IConnectionEntry {
	readonly store: DisposableStore;
	readonly client: RemoteAgentHostProtocolClient;
	connected: boolean;
	/** Current connection status for UI display. */
	status: RemoteAgentHostConnectionStatus;
}

export class RemoteAgentHostService extends Disposable implements IRemoteAgentHostService {
	private static readonly ConnectionWaitTimeout = 10000;
	/** Initial reconnect delay in milliseconds. */
	private static readonly ReconnectInitialDelay = 1000;
	/** Maximum reconnect delay in milliseconds. */
	private static readonly ReconnectMaxDelay = 30000;

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections = this._onDidChangeConnections.event;

	private readonly _entries = new Map<string, IConnectionEntry>();
	private readonly _names = new Map<string, string>();
	private readonly _tokens = new Map<string, string | undefined>();
	/**
	 * Stores the original {@link IRemoteAgentHostEntry} for connections
	 * registered via {@link addSSHConnection}. This is needed because
	 * tunnel entries are not persisted to settings and therefore don't
	 * appear in {@link configuredEntries}.
	 */
	private readonly _registeredEntries = new Map<string, IRemoteAgentHostEntry>();
	private readonly _pendingConnectionWaits = new Map<string, DeferredPromise<IRemoteAgentHostConnectionInfo>>();
	/** Pending reconnect timeouts, keyed by normalized address. */
	private readonly _reconnectTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	/** Current reconnect attempt count per address for exponential backoff. */
	private readonly _reconnectAttempts = new Map<string, number>();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// React to setting changes
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
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
				clientId: entry.client.clientId,
				defaultDirectory: entry.client.defaultDirectory,
				status: entry.status,
			});
		}
		return result;
	}

	get configuredEntries(): readonly IRemoteAgentHostEntry[] {
		return this._getConfiguredEntries().map(e => {
			if (e.connection.type === RemoteAgentHostEntryType.Tunnel) {
				return e;
			}
			return { ...e, connection: { ...e.connection, address: normalizeRemoteAgentHostAddress(e.connection.address) } };
		});
	}

	getConnection(address: string): IAgentConnection | undefined {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const entry = this._entries.get(normalized);
		return entry?.connected ? entry.client : undefined;
	}

	getEntryByAddress(address: string): IRemoteAgentHostEntry | undefined {
		const normalized = normalizeRemoteAgentHostAddress(address);
		// Check dynamically registered entries first (e.g. tunnel connections
		// that are not persisted to settings).
		const registered = this._registeredEntries.get(normalized);
		if (registered) {
			return registered;
		}
		// Fall back to configured entries from settings.
		return this.configuredEntries.find(
			e => normalizeRemoteAgentHostAddress(getEntryAddress(e)) === normalized
		);
	}

	reconnect(address: string): void {
		const normalized = normalizeRemoteAgentHostAddress(address);

		// SSH/tunnel entries are reconnected by their respective services
		const configuredEntry = this._getConfiguredEntries().find(
			e => normalizeRemoteAgentHostAddress(getEntryAddress(e)) === normalized
		);
		if (configuredEntry && configuredEntry.connection.type !== RemoteAgentHostEntryType.WebSocket) {
			return;
		}

		const token = this._tokens.get(normalized);

		// Cancel any pending reconnect
		this._cancelReconnect(normalized);
		this._reconnectAttempts.delete(normalized);

		// Tear down existing connection if present
		const entry = this._entries.get(normalized);
		if (entry) {
			this._entries.delete(normalized);
			entry.store.dispose();
		}

		// Start fresh connection attempt
		this._connectTo(normalized, token);
	}

	async addRemoteAgentHost(input: IRemoteAgentHostEntry): Promise<IRemoteAgentHostConnectionInfo> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const entry: IRemoteAgentHostEntry = input.connection.type === RemoteAgentHostEntryType.Tunnel
			? input
			: { ...input, connection: { ...input.connection, address: normalizeRemoteAgentHostAddress(input.connection.address) } };
		const address = getEntryAddress(entry);
		const existingConnection = this._getConnectionInfo(address);
		await this._storeConfiguredEntries(this._upsertConfiguredEntry(entry));

		if (existingConnection) {
			return {
				...existingConnection,
				name: entry.name,
			};
		}

		// SSH entries are connected externally — just persist
		// the entry and return a disconnected placeholder. The connection
		// will be established by the SSH contribution.
		if (entry.connection.type === RemoteAgentHostEntryType.SSH) {
			return {
				address,
				name: entry.name,
				clientId: '',
				status: RemoteAgentHostConnectionStatus.Disconnected,
			};
		}

		const connectedConnection = this._getConnectionInfo(address);
		if (connectedConnection) {
			return connectedConnection;
		}

		const wait = this._getOrCreateConnectionWait(address);
		const connection = await raceTimeout(wait.p, RemoteAgentHostService.ConnectionWaitTimeout, () => {
			this._pendingConnectionWaits.delete(address);
		});
		if (!connection) {
			throw new Error(`Timed out connecting to ${address}`);
		}

		return connection;
	}

	async addSSHConnection(entry: IRemoteAgentHostEntry, connection: IAgentConnection): Promise<IRemoteAgentHostConnectionInfo> {
		const address = getEntryAddress(entry);

		// Dispose any existing entry for this address to avoid leaking
		// old protocol clients and relay transports on reconnect.
		const existingEntry = this._entries.get(address);
		if (existingEntry) {
			this._entries.delete(address);
			existingEntry.store.dispose();
		}

		const store = new DisposableStore();

		// Create a connection entry wrapping the pre-connected client
		const protocolClient = connection as RemoteAgentHostProtocolClient;
		store.add(protocolClient);
		const connEntry: IConnectionEntry = { store, client: protocolClient, connected: true, status: RemoteAgentHostConnectionStatus.Connected };
		this._entries.set(address, connEntry);
		this._names.set(address, entry.name);
		this._registeredEntries.set(address, entry);
		if (entry.connectionToken) {
			this._tokens.set(address, entry.connectionToken);
		}

		store.add(protocolClient.onDidClose(() => {
			if (this._entries.get(address) === connEntry) {
				connEntry.connected = false;
				connEntry.status = RemoteAgentHostConnectionStatus.Disconnected;
				this._onDidChangeConnections.fire();
			}
		}));

		// Persist entries — await so that the config is written before
		// onDidChangeConnections fires, ensuring _reconcile creates the provider.
		// Tunnel entries are filtered out by _storeConfiguredEntries automatically.
		await this._storeConfiguredEntries(this._upsertConfiguredEntry(entry));

		this._onDidChangeConnections.fire();

		return {
			address,
			name: entry.name,
			clientId: protocolClient.clientId,
			defaultDirectory: protocolClient.defaultDirectory,
			status: RemoteAgentHostConnectionStatus.Connected,
		};
	}

	async removeRemoteAgentHost(address: string): Promise<void> {
		const normalized = normalizeRemoteAgentHostAddress(address);
		// This setting is only used in the sessions app (user scope), so we
		// don't need to inspect per-scope values like _upsertConfiguredEntry does.
		const entries = this._getConfiguredEntries().filter(
			e => normalizeRemoteAgentHostAddress(getEntryAddress(e)) !== normalized
		);
		await this._storeConfiguredEntries(entries);

		// Eagerly clear in-memory state so the UI updates immediately
		// (the config change listener will reconcile, but this is instant).
		this._names.delete(normalized);
		this._tokens.delete(normalized);
		this._registeredEntries.delete(normalized);
		this._cancelReconnect(normalized);
		this._reconnectAttempts.delete(normalized);
		this._removeConnection(normalized);
	}

	private _removeConnection(address: string): void {
		const entry = this._entries.get(address);
		if (entry) {
			this._entries.delete(address);
			entry.store.dispose();
			this._rejectPendingConnectionWait(address, new Error(`Connection closed: ${address}`));
			this._onDidChangeConnections.fire();
		}
	}

	private _reconcileConnections(): void {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			// Disconnect all when disabled
			for (const address of [...this._entries.keys()]) {
				this._cancelReconnect(address);
				this._removeConnection(address);
			}
			this._names.clear();
			this._tokens.clear();
			this._reconnectAttempts.clear();
			return;
		}

		const rawEntries = (this._configurationService.getValue<IRawRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId) ?? []).map(rawEntryToEntry).filter(isDefined);
		const entriesWithAddress = rawEntries.map(e => ({ entry: e, address: normalizeRemoteAgentHostAddress(getEntryAddress(e)) }));
		const desired = new Set(entriesWithAddress.map(e => e.address));

		this._logService.info(`[RemoteAgentHost] Reconciling: desired=[${[...desired].join(', ')}], current=[${[...this._entries.keys()].map(a => `${a}(${this._entries.get(a)!.connected ? 'connected' : 'pending'})`).join(', ')}]`);

		// Update name map and detect name changes for existing connections
		let namesChanged = false;
		const oldNames = new Map(this._names);
		this._names.clear();
		this._tokens.clear();
		for (const { entry, address } of entriesWithAddress) {
			this._names.set(address, entry.name);
			this._tokens.set(address, entry.connectionToken);
			if (this._entries.has(address) && oldNames.get(address) !== entry.name) {
				namesChanged = true;
			}
		}

		// Remove connections no longer in the setting
		for (const address of [...this._entries.keys()]) {
			if (!desired.has(address)) {
				this._logService.info(`[RemoteAgentHost] Disconnecting from ${address}`);
				this._cancelReconnect(address);
				this._reconnectAttempts.delete(address);
				this._removeConnection(address);
			}
		}

		// Add new connections (skip SSH entries — those are handled by ISSHRemoteAgentHostService,
		// and skip tunnel entries — those are handled by ITunnelAgentHostService)
		for (const { entry, address } of entriesWithAddress) {
			if (!this._entries.has(address) && entry.connection.type === RemoteAgentHostEntryType.WebSocket) {
				this._connectTo(address, entry.connectionToken);
			}
		}

		// If only names changed (no add/remove), notify so the UI updates
		if (namesChanged) {
			this._onDidChangeConnections.fire();
		}
	}

	private _connectTo(address: string, connectionToken?: string): void {
		// Dispose any existing entry for this address before creating a new one
		// to avoid leaking disposables on reconnect.
		const existingEntry = this._entries.get(address);
		if (existingEntry) {
			this._entries.delete(address);
			existingEntry.store.dispose();
		}

		const store = new DisposableStore();
		const transport = store.add(new WebSocketClientTransport(address, connectionToken));
		const client = store.add(this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address, transport));
		const entry: IConnectionEntry = { store, client, connected: false, status: RemoteAgentHostConnectionStatus.Connecting };
		this._entries.set(address, entry);

		// Guard against stale callbacks: only act if the
		// current entry for this address is still the one we created.
		const isCurrentEntry = () => this._entries.get(address) === entry;

		store.add(client.onDidClose(() => {
			if (!isCurrentEntry()) {
				return;
			}
			this._logService.warn(`[RemoteAgentHost] Connection closed: ${address}`);
			entry.connected = false;
			entry.status = RemoteAgentHostConnectionStatus.Disconnected;
			this._onDidChangeConnections.fire();
			// Schedule reconnect if the address is still configured
			this._scheduleReconnect(address, connectionToken);
		}));

		this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
		this._onDidChangeConnections.fire();
		client.connect().then(() => {
			if (store.isDisposed) {
				return; // removed before connect resolved
			}
			this._logService.info(`[RemoteAgentHost] Connected to ${address}`);
			entry.connected = true;
			entry.status = RemoteAgentHostConnectionStatus.Connected;
			this._reconnectAttempts.delete(address);
			this._resolvePendingConnectionWait(address);
			this._onDidChangeConnections.fire();
		}).catch(err => {
			if (!isCurrentEntry()) {
				return;
			}
			this._logService.error(`[RemoteAgentHost] Failed to connect to ${address}. Verify address and connectionToken`, err);
			entry.status = RemoteAgentHostConnectionStatus.Disconnected;
			// Clean up the failed entry
			this._entries.delete(address);
			entry.store.dispose();
			this._rejectPendingConnectionWait(address, err);
			this._onDidChangeConnections.fire();
			// Schedule reconnect if the address is still configured
			this._scheduleReconnect(address, connectionToken);
		});
	}

	/**
	 * Schedule a reconnect attempt with exponential backoff.
	 * Only reconnects if the address is still in the configured entries.
	 */
	private _scheduleReconnect(address: string, connectionToken?: string): void {
		// Don't reconnect if the address was removed from settings
		if (!this._isAddressConfigured(address)) {
			this._logService.info(`[RemoteAgentHost] Not reconnecting to ${address}: no longer configured`);
			return;
		}

		const attempt = (this._reconnectAttempts.get(address) ?? 0) + 1;
		this._reconnectAttempts.set(address, attempt);
		const delay = Math.min(
			RemoteAgentHostService.ReconnectInitialDelay * Math.pow(2, attempt - 1),
			RemoteAgentHostService.ReconnectMaxDelay,
		);

		this._logService.info(`[RemoteAgentHost] Scheduling reconnect to ${address} in ${delay}ms (attempt ${attempt})`);

		this._cancelReconnect(address);
		const timeout = setTimeout(() => {
			this._reconnectTimeouts.delete(address);
			if (this._isAddressConfigured(address)) {
				this._connectTo(address, connectionToken ?? this._tokens.get(address));
			}
		}, delay);
		this._reconnectTimeouts.set(address, timeout);
	}

	/** Cancel a pending reconnect timeout for the given address. */
	private _cancelReconnect(address: string): void {
		const timeout = this._reconnectTimeouts.get(address);
		if (timeout !== undefined) {
			clearTimeout(timeout);
			this._reconnectTimeouts.delete(address);
		}
	}

	/** Check whether the given normalized address is still in the configured entries. */
	private _isAddressConfigured(address: string): boolean {
		const entries = this._getConfiguredEntries();
		return entries.some(e => normalizeRemoteAgentHostAddress(getEntryAddress(e)) === address);
	}

	private _getConnectionInfo(address: string): IRemoteAgentHostConnectionInfo | undefined {
		return this.connections.find(connection => connection.address === address && connection.status === RemoteAgentHostConnectionStatus.Connected);
	}

	private _getConfiguredEntries(): IRemoteAgentHostEntry[] {
		return (this._configurationService.getValue<IRawRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId) ?? []).map(rawEntryToEntry).filter(isDefined);
	}

	private _upsertConfiguredEntry(entry: IRemoteAgentHostEntry): IRemoteAgentHostEntry[] {
		// Read from the same scope we'll write to, so we don't accidentally
		// merge entries from an overriding scope (e.g. workspace) into the
		// user scope and then lose them on the next read.
		const target = this._getConfigurationTarget();
		const inspected = this._configurationService.inspect<IRawRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId);
		let configuredRaw: readonly IRawRemoteAgentHostEntry[];
		switch (target) {
			case ConfigurationTarget.USER_LOCAL:
				configuredRaw = inspected.userLocalValue ?? [];
				break;
			case ConfigurationTarget.USER_REMOTE:
				configuredRaw = inspected.userRemoteValue ?? [];
				break;
			default:
				configuredRaw = inspected.userValue ?? [];
				break;
		}

		const configuredEntries = configuredRaw.map(rawEntryToEntry).filter((e): e is IRemoteAgentHostEntry => e !== undefined);
		const normalizedAddress = normalizeRemoteAgentHostAddress(getEntryAddress(entry));
		const existingIndex = configuredEntries.findIndex(e => normalizeRemoteAgentHostAddress(getEntryAddress(e)) === normalizedAddress);
		if (existingIndex === -1) {
			return [...configuredEntries, entry];
		}

		return configuredEntries.map((e, index) => index === existingIndex ? entry : e);
	}

	private _getConfigurationTarget(): ConfigurationTarget {
		const inspected = this._configurationService.inspect<IRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId);
		if (inspected.userLocalValue !== undefined) {
			return ConfigurationTarget.USER_LOCAL;
		}
		if (inspected.userRemoteValue !== undefined) {
			return ConfigurationTarget.USER_REMOTE;
		}
		if (inspected.userValue !== undefined) {
			return ConfigurationTarget.USER;
		}
		return ConfigurationTarget.USER;
	}

	private async _storeConfiguredEntries(entries: IRemoteAgentHostEntry[]): Promise<void> {
		const raw = entries.map(entryToRawEntry).filter(isDefined);
		await this._configurationService.updateValue(RemoteAgentHostsSettingId, raw, this._getConfigurationTarget());
	}

	private _getOrCreateConnectionWait(address: string): DeferredPromise<IRemoteAgentHostConnectionInfo> {
		let wait = this._pendingConnectionWaits.get(address);
		if (wait) {
			return wait;
		}

		// If the connection is already available (fast connect resolved before
		// the caller called us), return an immediately-completed wait.
		const existingConnection = this._getConnectionInfo(address);
		if (existingConnection) {
			const immediateWait = new DeferredPromise<IRemoteAgentHostConnectionInfo>();
			immediateWait.complete(existingConnection);
			return immediateWait;
		}

		wait = new DeferredPromise<IRemoteAgentHostConnectionInfo>();
		this._pendingConnectionWaits.set(address, wait);
		return wait;
	}

	private _resolvePendingConnectionWait(address: string): void {
		const wait = this._pendingConnectionWaits.get(address);
		const connection = this._getConnectionInfo(address);
		if (!wait || !connection) {
			return;
		}

		this._pendingConnectionWaits.delete(address);
		void wait.complete(connection);
	}

	private _rejectPendingConnectionWait(address: string, err: unknown): void {
		const wait = this._pendingConnectionWaits.get(address);
		if (!wait) {
			return;
		}

		this._pendingConnectionWaits.delete(address);
		void wait.error(err);
	}

	override dispose(): void {
		for (const timeout of this._reconnectTimeouts.values()) {
			clearTimeout(timeout);
		}
		this._reconnectTimeouts.clear();
		this._reconnectAttempts.clear();
		for (const [address, wait] of this._pendingConnectionWaits) {
			void wait.error(new Error(`Remote agent host service disposed before connecting to ${address}`));
		}
		this._pendingConnectionWaits.clear();
		for (const entry of this._entries.values()) {
			entry.store.dispose();
		}
		this._entries.clear();
		super.dispose();
	}
}
