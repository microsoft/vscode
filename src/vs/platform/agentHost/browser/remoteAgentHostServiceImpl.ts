/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Service implementation that manages WebSocket connections to remote agent
// host processes. Reads WebSocket addresses from the `chat.remoteAgentHosts`
// setting and SSH connection details from storage, then maintains connections.

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { ConfigurationTarget, IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILabelService } from '../../label/common/label.js';
import { ILogService } from '../../log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { hasKey } from '../../../base/common/types.js';

import { AgentHostAhpJsonlLoggingSettingId, type IAgentConnection } from '../common/agentService.js';
import {
	IRemoteAgentHostService,
	RemoteAgentHostConnectionStatus,
	RemoteAgentHostsEnabledSettingId,
	RemoteAgentHostsSettingId,
	SSH_ENTRY_TYPE_CONFIG,
	WEBSOCKET_ENTRY_TYPE_CONFIG,
	getEntryTypeConfig,
	parseLegacyRawEntry,
	type IRawRemoteAgentHostEntry,
	type IRemoteAgentHostConnectionInfo,
	type IRemoteAgentHostEntry,
} from '../common/remoteAgentHostService.js';
import { AgentHostProtocolClient, AgentHostClientState } from './agentHostProtocolClient.js';
import { WebSocketClientTransport } from './webSocketClientTransport.js';
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME, agentHostAuthority, normalizeRemoteAgentHostAddress } from '../common/agentHostUri.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';
import { type IVscodeUpgradeResult } from '../common/state/protocolUpgrade.js';
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from '../common/agentHostClientInfo.js';

const SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY = 'remoteAgentHost.sshConnections';

/** Tracks a single remote connection through its lifecycle. */
interface IConnectionEntry {
	readonly store: DisposableStore;
	readonly client: AgentHostProtocolClient;
	/**
	 * Optional teardown for the shared-process tunnel that this entry's
	 * transport is using (SSH or dev-tunnels). Tracked separately from
	 * {@link store} because on reconnect the new entry takes ownership of
	 * the same underlying connectionId — running the old teardown would
	 * disconnect the freshly-established tunnel as a side effect.
	 */
	readonly transportDisposable?: IDisposable;
	connected: boolean;
	/** Current connection status for UI display. */
	status: RemoteAgentHostConnectionStatus;
}

function disposeEntry(entry: IConnectionEntry): void {
	entry.store.dispose();
	entry.transportDisposable?.dispose();
}

function isRawRemoteAgentHostEntry(value: unknown): value is IRawRemoteAgentHostEntry {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Partial<Record<keyof IRawRemoteAgentHostEntry, unknown>>;
	return typeof candidate.address === 'string'
		&& typeof candidate.name === 'string'
		&& (candidate.connectionToken === undefined || typeof candidate.connectionToken === 'string')
		&& (candidate.sshConfigHost === undefined || typeof candidate.sshConfigHost === 'string')
		&& (candidate.sshHostName === undefined || typeof candidate.sshHostName === 'string')
		&& (candidate.sshUser === undefined || typeof candidate.sshUser === 'string')
		&& (candidate.sshPort === undefined || typeof candidate.sshPort === 'number');
}

function isLegacySshRawEntry(entry: IRawRemoteAgentHostEntry): boolean {
	return entry.sshConfigHost !== undefined
		|| entry.sshHostName !== undefined
		|| entry.sshUser !== undefined
		|| entry.sshPort !== undefined;
}

export class RemoteAgentHostService extends Disposable implements IRemoteAgentHostService {
	private static readonly ConnectionWaitTimeout = 10000;
	/** Initial reconnect delay in milliseconds. */
	private static readonly ReconnectInitialDelay = 1000;
	/** Maximum reconnect delay in milliseconds. */
	private static readonly ReconnectMaxDelay = 30000;
	/**
	 * How long to wait for a server-upgrade trigger to be acknowledged.
	 * The CLI awaits the binary download synchronously before responding,
	 * so this needs to accommodate first-time downloads on slow networks.
	 */
	private static readonly UpgradeRequestTimeout = 5 * 60 * 1000;

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections = this._onDidChangeConnections.event;

	private readonly _entries = new Map<string, IConnectionEntry>();
	private readonly _names = new Map<string, string>();
	private readonly _tokens = new Map<string, string | undefined>();
	/**
	 * Stores the original {@link IRemoteAgentHostEntry} for connections
	 * registered via {@link addManagedConnection}. This is needed because
	 * tunnel entries are not persisted to settings and therefore don't
	 * appear in {@link configuredEntries}.
	 */
	private readonly _registeredEntries = new Map<string, IRemoteAgentHostEntry>();
	private readonly _pendingConnectionWaits = new Map<string, DeferredPromise<IRemoteAgentHostConnectionInfo>>();
	/** Pending reconnect timeouts, keyed by normalized address. */
	private readonly _reconnectTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	/** Current reconnect attempt count per address for exponential backoff. */
	private readonly _reconnectAttempts = new Map<string, number>();
	/**
	 * Per-address {@link ILabelService} formatter handles for the
	 * {@link AGENT_HOST_SCHEME}. The formatter advertises the entry's
	 * human-readable name as the host label so any UI looking up the host
	 * label for an agent host URI gets the friendly name.
	 */
	private readonly _labelFormatters = new Map<string, IDisposable>();

	protected get clientInfo() {
		return editorWindowAgentHostClientInfo;
	}

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@ILabelService private readonly _labelService: ILabelService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		// React to setting changes
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._reconcileConnections();
			}
		}));
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, this._store)(() => {
			this._reconcileConnections();
			this._onDidChangeConnections.fire();
		}));

		this._migrateSSHEntriesFromSetting();

		// Initial connection
		this._reconcileConnections();
	}

	private _entryAddress(entry: IRemoteAgentHostEntry): string {
		const config = getEntryTypeConfig(entry.connection.type);
		const address = config.address(entry.connection);
		return config.normalizedAddress ? normalizeRemoteAgentHostAddress(address) : address;
	}

	private _normalizeEntry(entry: IRemoteAgentHostEntry): IRemoteAgentHostEntry {
		const config = getEntryTypeConfig(entry.connection.type);
		// `hasKey` narrows the connection union for the spread below;
		// `normalizedAddress` is the actual policy (only tunnels opt out).
		if (!config.normalizedAddress || !hasKey(entry.connection, { address: true })) {
			return entry;
		}
		return { ...entry, connection: { ...entry.connection, address: normalizeRemoteAgentHostAddress(entry.connection.address) } };
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
		return this._getConfiguredEntries().map(entry => this._normalizeEntry(entry));
	}

	getConnection(address: string): IAgentConnection | undefined {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const entry = this._entries.get(normalized);
		return entry?.connected ? entry.client : undefined;
	}

	getConnectionByAuthority(authority: string): IAgentConnection | undefined {
		for (const [address, entry] of this._entries) {
			if (entry.connected && agentHostAuthority(address) === authority) {
				return entry.client;
			}
		}
		return undefined;
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
			entry => this._entryAddress(entry) === normalized
		);
	}

	async triggerServerUpgrade(address: string, method: string): Promise<IVscodeUpgradeResult> {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const entry = this._entries.get(normalized);
		if (!entry) {
			throw new Error(`No remote agent host entry found for ${address}.`);
		}
		// The protocol client may be in any state: it might have completed
		// the handshake (Connected) or it might be sitting on an
		// `incompatible` failure with the transport still open. Either way
		// we send the upgrade request as a raw JSON-RPC call using the
		// method name the host advertised in its `_meta` payload; the
		// server handler allows it pre-`initialize`.
		const result = await raceTimeout(
			entry.client.triggerVscodeUpgrade(method),
			RemoteAgentHostService.UpgradeRequestTimeout,
		);
		if (result === undefined) {
			throw new Error(`Server upgrade request timed out after ${RemoteAgentHostService.UpgradeRequestTimeout}ms.`);
		}
		return result;
	}

	reconnect(address: string): void {
		const normalized = normalizeRemoteAgentHostAddress(address);

		// SSH/tunnel entries are reconnected by their respective services
		const configuredEntry = this._getConfiguredEntries().find(
			entry => this._entryAddress(entry) === normalized
		);
		if (configuredEntry && !getEntryTypeConfig(configuredEntry.connection.type).selfConnecting) {
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

		const entry = this._normalizeEntry(input);
		const address = this._entryAddress(entry);
		const existingConnection = this._getConnectionInfo(address);
		const config = getEntryTypeConfig(entry.connection.type);
		if (config.store !== 'runtime') {
			await this._storeConfiguredEntries(this._upsertEntry(this._getConfiguredEntries(true), entry));
		}

		if (existingConnection) {
			return {
				...existingConnection,
				name: entry.name,
			};
		}

		if (!config.selfConnecting) {
			return {
				address,
				name: entry.name,
				clientId: '',
				status: RemoteAgentHostConnectionStatus.disconnected,
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

	async addManagedConnection(entry: IRemoteAgentHostEntry, connection: IAgentConnection, transportDisposable?: IDisposable, status = RemoteAgentHostConnectionStatus.connected): Promise<IRemoteAgentHostConnectionInfo> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const address = this._entryAddress(entry);

		// Dispose any existing entry for this address to avoid leaking
		// old protocol clients and relay transports on reconnect.
		//
		// CRITICAL: we deliberately do NOT run the existing entry's
		// transportDisposable. On a reconnect to the same address, the
		// shared-process tunnel keyed by connectionId is already owned by
		// the new connection we just established. Running the old teardown
		// would call _mainService.disconnect(connectionId) and immediately
		// kill the brand-new tunnel.
		const existingEntry = this._entries.get(address);
		if (existingEntry) {
			this._entries.delete(address);
			existingEntry.store.dispose();
		}

		const store = new DisposableStore();

		// Create a connection entry wrapping the pre-connected client
		const protocolClient = connection as AgentHostProtocolClient;
		store.add(protocolClient);
		const connEntry: IConnectionEntry = { store, client: protocolClient, transportDisposable, connected: RemoteAgentHostConnectionStatus.isConnected(status), status };
		this._entries.set(address, connEntry);
		this._names.set(address, entry.name);
		this._registeredEntries.set(address, entry);
		this._updateHostLabelFormatter(address, entry.name);
		if (entry.connectionToken) {
			this._tokens.set(address, entry.connectionToken);
		}

		store.add(protocolClient.onDidClose(() => {
			if (this._entries.get(address) === connEntry) {
				connEntry.connected = false;
				connEntry.status = RemoteAgentHostConnectionStatus.disconnected;
				this._onDidChangeConnections.fire();
			}
		}));

		const config = getEntryTypeConfig(entry.connection.type);
		if (config.store !== 'runtime') {
			await this._storeConfiguredEntries(this._upsertEntry(this._getConfiguredEntries(true), entry));
		}

		this._onDidChangeConnections.fire();

		return {
			address,
			name: entry.name,
			clientId: protocolClient.clientId,
			defaultDirectory: protocolClient.defaultDirectory,
			status,
		};
	}

	async removeRemoteAgentHost(address: string): Promise<void> {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const entry = this._registeredEntries.get(normalized) ?? this._getConfiguredEntries().find(entry => this._entryAddress(entry) === normalized);
		if (entry) {
			const config = getEntryTypeConfig(entry.connection.type);
			if (config.store !== 'runtime') {
				const entries = this._getConfiguredEntries(true).filter(entry => this._entryAddress(entry) !== normalized);
				await this._storeConfiguredEntries(entries);
			}
		}

		// Eagerly clear in-memory state so the UI updates immediately
		// (the config change listener will reconcile, but this is instant).
		this._names.delete(normalized);
		this._tokens.delete(normalized);
		this._registeredEntries.delete(normalized);
		this._clearHostLabelFormatter(normalized);
		this._cancelReconnect(normalized);
		this._reconnectAttempts.delete(normalized);
		this._removeConnection(normalized);
	}

	private _removeConnection(address: string): void {
		const entry = this._entries.get(address);
		if (entry) {
			this._entries.delete(address);
			this._registeredEntries.delete(address);
			disposeEntry(entry);
			this._rejectPendingConnectionWait(address, new Error(`Connection closed: ${address}`));
			this._onDidChangeConnections.fire();
		}
	}

	notifyConnectionClosed(address: string): void {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const entry = this._entries.get(normalized);
		if (entry) {
			this._logService.info(`[RemoteAgentHost] notifyConnectionClosed: notifying protocol client for ${normalized}`);
			entry.client.notifyTransportClosed();
		} else {
			this._logService.info(`[RemoteAgentHost] notifyConnectionClosed: no entry found for ${normalized} (already removed?)`);
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
			// Drop label formatters for entries no longer represented by an
			// active connection or a dynamically registered entry. Connections
			// added via {@link addManagedConnection} (e.g. tunnels) live outside
			// the configured-entries set and must keep their formatter.
			for (const address of [...this._labelFormatters.keys()]) {
				if (!this._registeredEntries.has(address)) {
					this._clearHostLabelFormatter(address);
				}
			}
			return;
		}

		const configuredEntries = this._getConfiguredEntries();
		const entriesWithAddress = configuredEntries.map(entry => ({ entry, address: this._entryAddress(entry) }));
		const desired = new Set(entriesWithAddress.map(e => e.address));

		this._logService.info(`[RemoteAgentHost] Reconciling: desired=[${[...desired].join(', ')}], current=[${[...this._entries.keys()].map(a => `${a}(${this._entries.get(a)!.connected ? 'connected' : 'pending'})`).join(', ')}]`);

		// Update name map and detect name changes for existing connections
		let namesChanged = false;
		const oldNames = new Map(this._names);
		this._names.clear();
		this._tokens.clear();
		// Runtime-registered connections are not part of the persisted set, so
		// seed their metadata first; without this a live tunnel/WSL/cloud
		// connection survives reconcile but reports its address as its name,
		// which downstream provider reconciliation treats as a rename.
		for (const [address, entry] of this._registeredEntries) {
			this._names.set(address, entry.name);
			this._tokens.set(address, entry.connectionToken);
		}
		for (const { entry, address } of entriesWithAddress) {
			this._names.set(address, entry.name);
			this._tokens.set(address, entry.connectionToken);
			this._updateHostLabelFormatter(address, entry.name);
			if (this._entries.has(address) && oldNames.get(address) !== entry.name) {
				namesChanged = true;
			}
		}

		// Drop formatters for addresses that are no longer configured and
		// not dynamically registered.
		for (const address of [...this._labelFormatters.keys()]) {
			if (!desired.has(address) && !this._registeredEntries.has(address)) {
				this._clearHostLabelFormatter(address);
			}
		}

		// Remove connections no longer in the setting
		for (const address of [...this._entries.keys()]) {
			if (!desired.has(address) && !this._registeredEntries.has(address)) {
				this._logService.info(`[RemoteAgentHost] Disconnecting from ${address}`);
				this._cancelReconnect(address);
				this._reconnectAttempts.delete(address);
				this._removeConnection(address);
			}
		}

		// Add entries that this service owns.
		for (const { entry, address } of entriesWithAddress) {
			if (!this._entries.has(address) && getEntryTypeConfig(entry.connection.type).selfConnecting) {
				this._connectTo(address, entry.connectionToken);
			}
		}

		// If only names changed (no add/remove), notify so the UI updates
		if (namesChanged) {
			this._onDidChangeConnections.fire();
		}
	}

	private _connectTo(address: string, connectionToken?: string): void {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			return;
		}

		// Dispose any existing entry for this address before creating a new one
		// to avoid leaking disposables on reconnect.
		const existingEntry = this._entries.get(address);
		if (existingEntry) {
			this._entries.delete(address);
			existingEntry.store.dispose();
		}

		const store = new DisposableStore();
		const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
		// Factory so the protocol client can replace the underlying transport
		// across transient drops and use the `reconnect` RPC to resume — see
		// {@link AgentHostProtocolClient}. The store owns only the client;
		// individual transports are owned by the client itself.
		const transportFactory = () => this._instantiationService.createInstance(
			WebSocketClientTransport,
			address,
			connectionToken,
			ahpLoggingEnabled
				? { logsHome: this._environmentService.logsHome, connectionId: address, transport: 'websocket' }
				: undefined,
		);
		const client = store.add(this._instantiationService.createInstance(AgentHostProtocolClient, address, transportFactory, undefined, undefined, this.clientInfo));
		const entry: IConnectionEntry = { store, client, connected: false, status: RemoteAgentHostConnectionStatus.connecting };
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
			entry.status = RemoteAgentHostConnectionStatus.disconnected;
			this._onDidChangeConnections.fire();
			// Schedule reconnect if the address is still configured. This is
			// the "fatal" path — the protocol client already gave up its own
			// soft-reconnect attempts (or it was never enabled), so we rebuild
			// from scratch.
			this._scheduleReconnect(address, connectionToken);
		}));

		// Reflect transient transport drops as `connecting` status (rather
		// than `disconnected`) so the UI doesn't flicker session lists into
		// an empty state during a soft reconnect.
		store.add(client.onDidChangeConnectionState(state => {
			if (!isCurrentEntry()) {
				return;
			}
			switch (state) {
				case AgentHostClientState.Reconnecting:
					entry.connected = false;
					entry.status = RemoteAgentHostConnectionStatus.connecting;
					this._onDidChangeConnections.fire();
					break;
				case AgentHostClientState.Connected:
					entry.connected = true;
					entry.status = RemoteAgentHostConnectionStatus.connected;
					this._onDidChangeConnections.fire();
					break;
				case AgentHostClientState.Connecting:
				case AgentHostClientState.Incompatible:
				case AgentHostClientState.Closed:
					break;
			}
		}));

		this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
		this._onDidChangeConnections.fire();
		client.connect().then(() => {
			if (store.isDisposed) {
				return; // removed before connect resolved
			}
			this._logService.info(`[RemoteAgentHost] Connected to ${address}`);
			entry.connected = true;
			entry.status = RemoteAgentHostConnectionStatus.connected;
			this._reconnectAttempts.delete(address);
			this._resolvePendingConnectionWait(address);
			this._onDidChangeConnections.fire();
		}).catch((err: unknown) => {
			if (!isCurrentEntry()) {
				return;
			}

			// Protocol version mismatch is a deterministic, user-visible
			// failure: the host explicitly told us it cannot speak our
			// version. Surface it as `incompatible` (so the workspace picker
			// can show the message) and keep the entry around — futile
			// reconnect attempts would just spin until the user upgrades
			// either side, so leave recovery to the manual `Reconnect`
			// action in the picker.
			const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
			if (incompatible) {
				this._logService.warn(`[RemoteAgentHost] Incompatible with ${address}: ${incompatible.kind === 'incompatible' ? incompatible.message : ''}`);
				entry.status = incompatible;
				this._reconnectAttempts.delete(address);
				this._rejectPendingConnectionWait(address, err);
				this._onDidChangeConnections.fire();
				return;
			}

			this._logService.error(`[RemoteAgentHost] Failed to connect to ${address}. Verify address and connectionToken`, err);
			entry.status = RemoteAgentHostConnectionStatus.disconnected;
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
		if (!this._getConfiguredEntries().some(entry => this._entryAddress(entry) === address)) {
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
			if (this._getConfiguredEntries().some(entry => this._entryAddress(entry) === address)) {
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

	private _getConnectionInfo(address: string): IRemoteAgentHostConnectionInfo | undefined {
		return this.connections.find(connection => connection.address === address && RemoteAgentHostConnectionStatus.isConnected(connection.status));
	}

	private _getConfiguredEntries(targetSettings = false): IRemoteAgentHostEntry[] {
		let entries = this._getSettings(targetSettings).entries
			.filter(isRawRemoteAgentHostEntry)
			.filter(entry => !isLegacySshRawEntry(entry))
			.map(entry => WEBSOCKET_ENTRY_TYPE_CONFIG.fromRaw(entry));
		for (const entry of this._getStoredSSHEntries()) {
			entries = this._upsertEntry(entries, entry);
		}
		return entries;
	}

	private _upsertEntry(entries: readonly IRemoteAgentHostEntry[], entry: IRemoteAgentHostEntry): IRemoteAgentHostEntry[] {
		const address = this._entryAddress(entry);
		const existingIndex = entries.findIndex(candidate => this._entryAddress(candidate) === address);
		return existingIndex === -1
			? [...entries, entry]
			: entries.map((candidate, index) => index === existingIndex ? entry : candidate);
	}

	private _getSettings(targetOnly = false): { readonly target: ConfigurationTarget; readonly entries: readonly IRawRemoteAgentHostEntry[] } {
		const inspected = this._configurationService.inspect<IRawRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId);
		const target = inspected.userLocalValue !== undefined
			? ConfigurationTarget.USER_LOCAL
			: inspected.userRemoteValue !== undefined
				? ConfigurationTarget.USER_REMOTE
				: ConfigurationTarget.USER;
		return {
			target,
			entries: !targetOnly
				? this._configurationService.getValue<IRawRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId) ?? []
				: target === ConfigurationTarget.USER_LOCAL
					? inspected.userLocalValue ?? []
					: target === ConfigurationTarget.USER_REMOTE
						? inspected.userRemoteValue ?? []
						: inspected.userValue ?? [],
		};
	}

	/**
	 * Writes both durable projections of `entries`, which must be the full
	 * merged set. Entries are keyed globally by normalized address, so a
	 * replacement can move an address between stores; writing only the
	 * destination would leave the source row behind for
	 * {@link _getConfiguredEntries} to resurrect. Each store is left
	 * untouched when its projection is unchanged.
	 */
	private async _storeConfiguredEntries(entries: readonly IRemoteAgentHostEntry[]): Promise<void> {
		const settingsRaw: IRawRemoteAgentHostEntry[] = [];
		const storageRaw: IRawRemoteAgentHostEntry[] = [];
		for (const entry of entries) {
			const config = getEntryTypeConfig(entry.connection.type);
			if (config.store === 'runtime') {
				continue;
			}
			(config.store === 'storage' ? storageRaw : settingsRaw).push(config.toRaw(entry, entry.connection));
		}

		this._storeStoredSSHEntries(storageRaw);

		const settings = this._getSettings(true);
		if (JSON.stringify(settings.entries) !== JSON.stringify(settingsRaw)) {
			await this._configurationService.updateValue(RemoteAgentHostsSettingId, settingsRaw, settings.target);
		}
	}

	private _getStoredSSHEntries(): IRemoteAgentHostEntry[] {
		const raw = this._storageService.get(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return [];
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed)
				? parsed.filter(isRawRemoteAgentHostEntry).filter(isLegacySshRawEntry).map(entry => SSH_ENTRY_TYPE_CONFIG.fromRaw(entry))
				: [];
		} catch {
			return [];
		}
	}

	private _storeStoredSSHEntries(entries: readonly IRawRemoteAgentHostEntry[]): void {
		const raw = JSON.stringify(entries);
		const stored = this._storageService.get(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
		if (stored === raw) {
			return;
		}
		if (entries.length === 0) {
			if (stored !== undefined) {
				this._storageService.remove(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
			}
			return;
		}
		this._storageService.store(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.USER);
	}

	private _migrateSSHEntriesFromSetting(): void {
		const settings = this._getSettings(true);
		const legacyEntries = settings.entries
			.filter(isRawRemoteAgentHostEntry)
			.map(parseLegacyRawEntry);
		const sshEntries = legacyEntries.filter(entry => getEntryTypeConfig(entry.connection.type).store === 'storage');
		if (sshEntries.length === 0) {
			return;
		}

		let migratedEntries = this._getStoredSSHEntries();
		for (const entry of sshEntries) {
			migratedEntries = this._upsertEntry(migratedEntries, entry);
		}
		const settingsEntries = legacyEntries.filter(entry => getEntryTypeConfig(entry.connection.type).store === 'settings');
		// One write of the whole merged set: SSH entries land in storage and
		// are dropped from settings in the same pass.
		this._storeConfiguredEntries([...migratedEntries, ...settingsEntries]).catch(err => {
			this._logService.error('[RemoteAgentHost] Failed to migrate SSH connection details from settings to storage', err);
		});
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

	/**
	 * Register (or re-register) the {@link AGENT_HOST_SCHEME} label formatter
	 * for the given address so that {@link ILabelService.getHostLabel} resolves
	 * to the entry's human-readable name. Called when an entry is added or its
	 * name changes.
	 */
	private _updateHostLabelFormatter(address: string, name: string): void {
		this._clearHostLabelFormatter(address);
		const handle = this._labelService.registerFormatter({
			scheme: AGENT_HOST_SCHEME,
			authority: agentHostAuthority(address),
			priority: true,
			formatting: {
				...AGENT_HOST_LABEL_FORMATTER.formatting,
				workspaceSuffix: name,
			},
		});
		this._labelFormatters.set(address, handle);
	}

	private _clearHostLabelFormatter(address: string): void {
		const existing = this._labelFormatters.get(address);
		if (existing) {
			existing.dispose();
			this._labelFormatters.delete(address);
		}
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
			disposeEntry(entry);
		}
		this._entries.clear();
		for (const handle of this._labelFormatters.values()) {
			handle.dispose();
		}
		this._labelFormatters.clear();
		super.dispose();
	}
}

export class AgentsWindowRemoteAgentHostService extends RemoteAgentHostService {

	protected override get clientInfo() {
		return agentsWindowAgentHostClientInfo;
	}

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@ILabelService labelService: ILabelService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IStorageService storageService: IStorageService,
	) {
		super(configurationService, instantiationService, logService, labelService, environmentService, storageService);
	}
}
