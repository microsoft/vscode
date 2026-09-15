/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Service implementation that manages remote agent host connections from
// entries supplied by registered connection factories.

import { Emitter } from '../../../base/common/event.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { autorun, derived, IObservable, observableValue } from '../../../base/common/observable.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILabelService } from '../../label/common/label.js';
import { ILogService } from '../../log/common/log.js';
import { observableConfigValue } from '../../observable/common/platformObservableUtils.js';
import { hasKey } from '../../../base/common/types.js';

import { AgentHostAhpJsonlLoggingSettingId, type IAgentConnection } from '../common/agentService.js';
import {
	IRemoteAgentHostService,
	RemoteAgentHostConnectionStatus,
	RemoteAgentHostAutoConnectSettingId,
	RemoteAgentHostsEnabledSettingId,
	RemoteAgentHostsSettingId,
	WEBSOCKET_ENTRY_TYPE_CONFIG,
	getEntryTypeConfig,
	isLegacySshRawEntry,
	isRawRemoteAgentHostEntry,
	type IRemoteAgentHostConnectionFactory,
	type IRemoteAgentHostConnectionInfo,
	type IRemoteAgentHostConnectOptions,
	type IRemoteAgentHostCreatedConnection,
	type IRemoteAgentHostEntry,
	type IRawRemoteAgentHostEntry,
	type IRemoteAgentHostProtocolClient,
	RemoteAgentHostEntryType,
} from '../common/remoteAgentHostService.js';
import { computeReconnectDelay, hasExhaustedReconnectAttempts } from '../common/reconnectPolicy.js';
import { AgentHostTransportFailureReason, NonReconnectableTransportError } from '../common/state/sessionTransport.js';
import { AgentHostProtocolClient, InitialAuthenticationError } from './agentHostProtocolClient.js';
import { WebSocketClientTransport } from './webSocketClientTransport.js';
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME, agentHostAuthority, normalizeRemoteAgentHostAddress } from '../common/agentHostUri.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';
import { type IVscodeUpgradeResult } from '../common/state/protocolUpgrade.js';
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from '../common/agentHostClientInfo.js';

/** Tracks a single remote connection through its lifecycle. */
interface IConnectionEntry {
	readonly store: DisposableStore;
	client?: IRemoteAgentHostProtocolClient;
	/**
	 * Optional teardown for the shared-process tunnel that this entry's
	 * transport is using (SSH or dev-tunnels). Tracked separately from
	 * {@link store} because on reconnect the new entry takes ownership of
	 * the same underlying connectionId — running the old teardown would
	 * disconnect the freshly-established tunnel as a side effect.
	 */
	readonly transportDisposable?: IDisposable;
	/** Whether a replacement connection assumes transport teardown ownership. */
	readonly reconnectTransfersTransportOwnership: boolean;
	connected: boolean;
	/** Current connection status for UI display. */
	status: RemoteAgentHostConnectionStatus;
}

function disposeEntry(entry: IConnectionEntry): void {
	entry.store.dispose();
	entry.transportDisposable?.dispose();
}

/**
 * Whether a failed connection attempt must not be retried automatically.
 *
 * A transport that declared itself non-reconnectable, and anything the user
 * cancelled or refused, are decisions rather than transient faults. Retrying
 * them re-prompts the person who just declined — the SSH host-key flow surfaces
 * both, as a cancellation and as a denial converted by its factory.
 */
function isTerminalConnectError(err: unknown): boolean {
	return err instanceof NonReconnectableTransportError || isCancellationError(err);
}

/** Builds WebSocket-backed protocol clients without performing their handshake. */
class WebSocketConnectionFactory extends Disposable implements IRemoteAgentHostConnectionFactory {
	readonly kind = RemoteAgentHostEntryType.WebSocket;
	readonly entries: IObservable<readonly IRemoteAgentHostEntry[]>;
	private readonly _rawEntries: IObservable<readonly IRawRemoteAgentHostEntry[]>;

	constructor(
		private readonly _instantiationService: IInstantiationService,
		private readonly _configurationService: IConfigurationService,
		private readonly _environmentService: IEnvironmentService,
		private readonly _clientInfo: () => typeof editorWindowAgentHostClientInfo,
	) {
		super();
		this._rawEntries = observableConfigValue<readonly IRawRemoteAgentHostEntry[]>(
			RemoteAgentHostsSettingId,
			[],
			this._configurationService,
		);
		this.entries = derived(this, reader => this._rawEntries.read(reader)
			.filter(isRawRemoteAgentHostEntry)
			.filter(entry => !isLegacySshRawEntry(entry))
			.map(entry => WEBSOCKET_ENTRY_TYPE_CONFIG.fromRaw(entry))
		);
	}

	createConnection(entry: IRemoteAgentHostEntry, _options: IRemoteAgentHostConnectOptions): Promise<IRemoteAgentHostCreatedConnection> {
		if (entry.connection.type !== RemoteAgentHostEntryType.WebSocket) {
			throw new Error(`WebSocket factory cannot create a ${entry.connection.type} connection.`);
		}

		const address = entry.connection.address;
		const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
		// The protocol client creates a transport for every soft-reconnect attempt.
		const transportFactory = () => this._instantiationService.createInstance(
			WebSocketClientTransport,
			address,
			entry.connectionToken,
			ahpLoggingEnabled
				? { logsHome: this._environmentService.logsHome, connectionId: address, transport: 'websocket' }
				: undefined,
		);
		const connection = this._instantiationService.createInstance(AgentHostProtocolClient, address, transportFactory, { clientInfo: this._clientInfo() });
		return Promise.resolve({ connection });
	}

}

export class RemoteAgentHostService extends Disposable implements IRemoteAgentHostService {
	private static readonly ConnectionWaitTimeout = 10000;
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
	private readonly _connectionFactories = new Map<RemoteAgentHostEntryType, IRemoteAgentHostConnectionFactory>();
	private readonly _connectionFactoriesObservable = observableValue(this, [] as readonly IRemoteAgentHostConnectionFactory[]);
	private readonly _remoteAgentHostsEnabled: IObservable<boolean>;
	private readonly _remoteAgentHostsAutoConnect: IObservable<boolean>;
	private readonly _configuredEntries = derived(this, reader => {
		let entries: IRemoteAgentHostEntry[] = [];
		for (const factory of this._connectionFactoriesObservable.read(reader)) {
			for (const entry of factory.entries.read(reader)) {
				entries = this._upsertEntry(entries, entry);
			}
		}
		return entries;
	});
	/** In-flight connection attempts, keyed by normalized address. */
	private readonly _pendingConnects = new Map<string, Promise<void>>();
	private readonly _names = new Map<string, string>();
	private readonly _tokens = new Map<string, string | undefined>();
	private readonly _pendingConnectionWaits = new Map<string, DeferredPromise<IRemoteAgentHostConnectionInfo>>();
	/** Errors from reconnects that could not start a dial. */
	private readonly _failedReconnects = new Map<string, Error>();
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
	) {
		super();

		this._remoteAgentHostsEnabled = observableConfigValue(RemoteAgentHostsEnabledSettingId, true, this._configurationService);
		this._remoteAgentHostsAutoConnect = observableConfigValue(RemoteAgentHostAutoConnectSettingId, true, this._configurationService);

		// The service creates these built-in factories, so it owns their
		// lifetime too; `registerConnectionFactory` only manages registry
		// membership so externally-supplied factories stay owned by their producer.
		this._register(this.registerConnectionFactory(this._register(new WebSocketConnectionFactory(
			this._instantiationService,
			this._configurationService,
			this._environmentService,
			() => this.clientInfo,
		))));
		this._register(autorun(reader => {
			this._configuredEntries.read(reader);
			this._remoteAgentHostsEnabled.read(reader);
			this._remoteAgentHostsAutoConnect.read(reader);
			this._reconcileConnections();
		}));

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
				clientId: entry.client?.clientId,
				defaultDirectory: entry.client?.defaultDirectory,
				status: entry.status,
			});
		}
		return result;
	}

	get configuredEntries(): readonly IRemoteAgentHostEntry[] {
		return this._configuredEntries.get().map(entry => this._normalizeEntry(entry));
	}

	registerConnectionFactory(factory: IRemoteAgentHostConnectionFactory): IDisposable {
		if (this._connectionFactories.has(factory.kind)) {
			throw new Error(`A remote agent host connection factory is already registered for ${factory.kind}.`);
		}

		this._connectionFactories.set(factory.kind, factory);
		this._connectionFactoriesObservable.set([...this._connectionFactories.values()], undefined);
		return toDisposable(() => {
			if (this._connectionFactories.get(factory.kind) === factory) {
				this._connectionFactories.delete(factory.kind);
				this._connectionFactoriesObservable.set([...this._connectionFactories.values()], undefined);
			}
		});
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
		return this.configuredEntries.find(
			entry => this._entryAddress(entry) === normalized
		);
	}

	async triggerServerUpgrade(address: string, method: string): Promise<IVscodeUpgradeResult> {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const client = this._entries.get(normalized)?.client;
		if (!client) {
			throw new Error(`No usable remote agent host client found for ${address}.`);
		}
		// The protocol client may be in any state: it might have completed
		// the handshake (Connected) or it might be sitting on an
		// `incompatible` failure with the transport still open. Either way
		// we send the upgrade request as a raw JSON-RPC call using the
		// method name the host advertised in its `_meta` payload; the
		// server handler allows it pre-`initialize`.
		const result = await raceTimeout(
			client.triggerVscodeUpgrade(method),
			RemoteAgentHostService.UpgradeRequestTimeout,
		);
		if (result === undefined) {
			throw new Error(`Server upgrade request timed out after ${RemoteAgentHostService.UpgradeRequestTimeout}ms.`);
		}
		return result;
	}

	reconnect(address: string, userInitiated = true): void {
		if (this._store.isDisposed) {
			return;
		}
		const normalized = normalizeRemoteAgentHostAddress(address);
		// A dial already in flight is itself a fresh attempt, so neither a
		// retry nor a user request gains anything by tearing it down and
		// starting a second one — that is what produced concurrent remote
		// bootstraps. Join it instead. A user-initiated request still restores
		// the retry budget, so pressing reconnect while a slow bootstrap runs
		// is not silently useless if that bootstrap ultimately fails.
		if (this._pendingConnects.has(normalized)) {
			if (userInitiated) {
				this._failedReconnects.delete(normalized);
				this._cancelReconnect(normalized);
				this._reconnectAttempts.delete(normalized);
			}
			return;
		}
		this._failedReconnects.delete(normalized);

		const configuredEntry = this._configuredEntries.get().find(
			entry => this._entryAddress(entry) === normalized
		);
		if (!configuredEntry) {
			this._failedReconnects.set(normalized, new Error(`No remote agent host entry is staged for ${normalized}.`));
			return;
		}
		if (!this._connectionFactories.has(configuredEntry.connection.type)) {
			this._failedReconnects.set(normalized, new Error(`No connection factory is registered for ${configuredEntry.connection.type}.`));
			return;
		}

		const entryToReconnect = {
			...configuredEntry,
			connectionToken: this._tokens.get(normalized) ?? configuredEntry.connectionToken,
		};

		// Cancel any pending reconnect
		this._cancelReconnect(normalized);
		if (userInitiated) {
			// An automatic retry must not resurrect its own exhausted attempt budget.
			this._reconnectAttempts.delete(normalized);
		}

		// Tear down existing connection if present
		const entry = this._entries.get(normalized);
		if (entry) {
			this._entries.delete(normalized);
			entry.store.dispose();
			if (!entry.reconnectTransfersTransportOwnership) {
				entry.transportDisposable?.dispose();
			}
			this._onDidChangeConnections.fire();
		}

		// Start fresh connection attempt
		void this._connectTo(entryToReconnect, { userInitiated });
	}

	/**
	 * Skips a protocol client's pending backoff, or starts a fresh user-initiated dial.
	 */
	reconnectNow(address: string): void {
		const normalized = normalizeRemoteAgentHostAddress(address);
		if (this._entries.get(normalized)?.client?.reconnectNow()) {
			return;
		}
		this.reconnect(normalized, true);
	}

	async waitForConnection(address: string): Promise<IRemoteAgentHostConnectionInfo> {
		if (this._store.isDisposed) {
			throw new Error('Remote agent host service is disposed.');
		}
		if (!this._remoteAgentHostsEnabled.get()) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const normalizedAddress = normalizeRemoteAgentHostAddress(address);
		const existingConnection = this._getConnectionInfo(normalizedAddress);
		if (existingConnection) {
			return existingConnection;
		}
		const reconnectFailure = this._failedReconnects.get(normalizedAddress);
		if (reconnectFailure) {
			throw reconnectFailure;
		}

		const wait = this._getOrCreateConnectionWait(normalizedAddress);

		// Follow an in-flight dial rather than a wall clock. Establishment cost
		// varies by kind — an SSH host may install the remote CLI first, taking
		// far longer than a WebSocket dial — and a timeout here would report
		// failure while that attempt keeps running and later succeeds. The
		// timeout only guards the case where nothing is in flight to follow.
		const pendingConnect = this._pendingConnects.get(normalizedAddress);
		if (pendingConnect) {
			await pendingConnect;
			const connected = this._getConnectionInfo(normalizedAddress);
			if (connected) {
				return connected;
			}
			// The dial finished without producing a usable connection: surface
			// the reason it recorded rather than waiting out the timeout.
			return wait.p;
		}

		const connection = await raceTimeout(wait.p, RemoteAgentHostService.ConnectionWaitTimeout, () => {
			this._pendingConnectionWaits.delete(normalizedAddress);
		});
		if (!connection) {
			throw new Error(`Timed out connecting to ${normalizedAddress}`);
		}

		return connection;
	}

	async removeRemoteAgentHost(address: string): Promise<void> {
		const normalized = normalizeRemoteAgentHostAddress(address);
		// Eagerly clear in-memory state so the UI updates immediately
		// (the config change listener will reconcile, but this is instant).
		this._names.delete(normalized);
		this._tokens.delete(normalized);
		this._failedReconnects.delete(normalized);
		this._clearHostLabelFormatter(normalized);
		this._cancelReconnect(normalized);
		this._reconnectAttempts.delete(normalized);
		this._removeConnection(normalized);
	}

	private _removeConnection(address: string): void {
		const entry = this._entries.get(address);
		if (entry) {
			this._entries.delete(address);
			disposeEntry(entry);
			this._rejectPendingConnectionWait(address, new Error(`Connection closed: ${address}`));
			this._onDidChangeConnections.fire();
		}
	}

	notifyConnectionClosed(address: string): void {
		const normalized = normalizeRemoteAgentHostAddress(address);
		const entry = this._entries.get(normalized);
		if (entry?.client) {
			this._logService.info(`[RemoteAgentHost] notifyConnectionClosed: notifying protocol client for ${normalized}`);
			entry.client.notifyTransportClosed();
		} else {
			this._logService.info(`[RemoteAgentHost] notifyConnectionClosed: no active client found for ${normalized}`);
		}
	}

	private _reconcileConnections(): void {
		// Disposing a factory invalidates its `entries` observable, which can
		// re-enter this autorun while the service is tearing down. Reconciling
		// then would re-register state the dispose path has already cleared.
		if (this._store.isDisposed) {
			return;
		}

		if (!this._remoteAgentHostsEnabled.get()) {
			// Disconnect all when disabled
			for (const address of [...this._entries.keys()]) {
				this._cancelReconnect(address);
				this._removeConnection(address);
			}
			this._names.clear();
			this._tokens.clear();
			this._reconnectAttempts.clear();
			// Drop label formatters for entries no longer represented by an active connection.
			for (const address of [...this._labelFormatters.keys()]) {
				this._clearHostLabelFormatter(address);
			}
			return;
		}

		const configuredEntries = this._configuredEntries.get();
		const entriesWithAddress = configuredEntries.map(entry => ({ entry, address: this._entryAddress(entry) }));
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
			this._updateHostLabelFormatter(address, entry.name);
			if (this._entries.has(address) && oldNames.get(address) !== entry.name) {
				namesChanged = true;
			}
		}

		// Drop formatters for addresses that are no longer configured.
		for (const address of [...this._labelFormatters.keys()]) {
			if (!desired.has(address)) {
				this._clearHostLabelFormatter(address);
			}
		}

		// Remove connections no longer exposed by a factory.
		for (const address of [...this._entries.keys()]) {
			if (!desired.has(address)) {
				this._logService.info(`[RemoteAgentHost] Disconnecting from ${address}`);
				this._cancelReconnect(address);
				this._reconnectAttempts.delete(address);
				this._removeConnection(address);
			}
		}

		// Add entry-driven connection kinds.
		for (const { entry, address } of entriesWithAddress) {
			// This gate becomes redundant once every entry type has a registered factory.
			if (!this._entries.has(address) && !this._pendingConnects.has(address) && this._shouldAutoConnect(entry)) {
				void this._connectTo(entry, { userInitiated: false });
			}
		}

		// If only names changed (no add/remove), notify so the UI updates
		if (namesChanged) {
			this._onDidChangeConnections.fire();
		}
	}

	private _connectTo(entryToConnect: IRemoteAgentHostEntry, options: IRemoteAgentHostConnectOptions): Promise<void> {
		if (this._store.isDisposed) {
			return Promise.resolve();
		}
		const entryToCreate = this._normalizeEntry(entryToConnect);
		const address = this._entryAddress(entryToCreate);
		const existingPendingConnect = this._pendingConnects.get(address);
		if (existingPendingConnect) {
			return existingPendingConnect;
		}

		const pendingConnect = new DeferredPromise<void>();
		this._pendingConnects.set(address, pendingConnect.p);
		void (async () => {
			try {
				await this._createAndConnect(entryToCreate, address, options);
			} catch (err) {
				this._logService.error(`[RemoteAgentHost] Unexpected error connecting to ${address}`, err);
			} finally {
				if (this._pendingConnects.get(address) === pendingConnect.p) {
					this._pendingConnects.delete(address);
				}
				void pendingConnect.complete();
			}
		})();
		return pendingConnect.p;
	}

	private async _createAndConnect(entryToCreate: IRemoteAgentHostEntry, address: string, options: IRemoteAgentHostConnectOptions): Promise<void> {
		if (this._store.isDisposed || !this._remoteAgentHostsEnabled.get()) {
			return;
		}

		const factory = this._connectionFactories.get(entryToCreate.connection.type);
		if (!factory) {
			const error = new Error(`No connection factory is registered for ${entryToCreate.connection.type}.`);
			this._logService.error(`[RemoteAgentHost] ${error.message} at ${address}`);
			this._failedReconnects.set(address, error);
			this._rejectPendingConnectionWait(address, error);
			return;
		}

		// Dispose any existing entry for this address before creating a new one
		// to avoid leaking disposables on reconnect.
		const existingEntry = this._entries.get(address);
		if (existingEntry) {
			this._entries.delete(address);
			disposeEntry(existingEntry);
		}

		let createdConnection: IRemoteAgentHostCreatedConnection;
		try {
			createdConnection = await factory.createConnection(entryToCreate, options);
		} catch (err) {
			this._logService.error(`[RemoteAgentHost] Failed to create a connection to ${address}. Verify address and connectionToken`, err);
			// A factory can fail before any client exists — a stopped WSL distro is
			// rejected by its precondition check, never reaching the handshake below.
			// Retain the entry so its status remains visible to consumers.
			const disconnectReason = err instanceof NonReconnectableTransportError ? err.reason : AgentHostTransportFailureReason.Unknown;
			this._entries.set(address, {
				store: new DisposableStore(),
				connected: false,
				status: RemoteAgentHostConnectionStatus.disconnectedBecause(disconnectReason),
				reconnectTransfersTransportOwnership: false,
			});
			this._rejectPendingConnectionWait(address, err);
			// Clear the in-flight marker before notifying. A consumer may dial again
			// from this notification — an automatic start does — and `reconnect`
			// joins a pending dial rather than racing it. Leaving the marker set
			// would join *this* dial, which has already failed, so the new request
			// would never connect and its `waitForConnection` would never settle.
			// `_connectTo` clears by identity, so a fresh dial started here survives.
			this._pendingConnects.delete(address);
			// Nothing else reports this failure: no entry was created, so consumers
			// only learn the address became unavailable from this notification.
			this._onDidChangeConnections.fire();
			if (!isTerminalConnectError(err) && !this._store.isDisposed && this._remoteAgentHostsEnabled.get()) {
				this._scheduleReconnect(address, entryToCreate.connectionToken);
			}
			return;
		}

		if (
			this._store.isDisposed
			|| !this._remoteAgentHostsEnabled.get()
			|| !this._configuredEntries.get().some(entry => this._entryAddress(entry) === address)
			|| this._entries.has(address)
		) {
			createdConnection.connection.dispose();
			createdConnection.transportDisposable?.dispose();
			this._rejectPendingConnectionWait(address, new Error(`Connection attempt for ${address} was discarded because it is no longer active.`));
			return;
		}

		const store = new DisposableStore();
		const client = store.add(createdConnection.connection);
		const entry: IConnectionEntry = {
			store,
			client,
			transportDisposable: createdConnection.transportDisposable,
			reconnectTransfersTransportOwnership: createdConnection.reconnectTransfersTransportOwnership ?? false,
			connected: false,
			status: RemoteAgentHostConnectionStatus.connecting,
		};
		this._entries.set(address, entry);

		// Guard against stale callbacks: only act if the
		// current entry for this address is still the one we created.
		const isCurrentEntry = () => this._entries.get(address) === entry;

		store.add(client.onDidClose(reason => {
			if (!isCurrentEntry()) {
				return;
			}
			this._logService.warn(`[RemoteAgentHost] Connection closed: ${address}`);
			entry.connected = false;
			entry.status = RemoteAgentHostConnectionStatus.disconnectedBecause(reason ?? AgentHostTransportFailureReason.Unknown);
			entry.client = undefined;
			disposeEntry(entry);
			this._onDidChangeConnections.fire();
			// Schedule reconnect if the address is still configured. This is
			// the "fatal" path — the protocol client already gave up its own
			// soft-reconnect attempts (or it was never enabled), so we rebuild
			// from scratch.
			this._scheduleReconnect(address, entryToCreate.connectionToken);
		}));

		// Surface self-healing transport drops separately so outer reconnect
		// loops do not replace the protocol client while it restores itself.
		store.add(client.onDidScheduleReconnect(() => {
			// The client stays `reconnecting` across backoff rounds, so only this
			// event reports that the deadline moved.
			if (!isCurrentEntry() || entry.status.kind !== 'reconnecting') {
				return;
			}
			entry.status = RemoteAgentHostConnectionStatus.reconnectingUntil(client.nextReconnectAt);
			this._onDidChangeConnections.fire();
		}));
		store.add(client.onDidChangeConnectionState(state => {
			if (!isCurrentEntry()) {
				return;
			}
			switch (state) {
				case 'reconnecting':
					entry.connected = false;
					entry.status = RemoteAgentHostConnectionStatus.reconnectingUntil(client.nextReconnectAt);
					this._onDidChangeConnections.fire();
					break;
				case 'connected':
					entry.connected = true;
					entry.status = RemoteAgentHostConnectionStatus.connected;
					// A soft reconnect that restores the transport settles any
					// wait started before the drop, which would otherwise sit
					// until its timeout even though the host is reachable again.
					this._reconnectAttempts.delete(address);
					this._resolvePendingConnectionWait(address);
					this._onDidChangeConnections.fire();
					break;
				case 'connecting':
				case 'closed':
					break;
				case 'incompatible':
					entry.connected = false;
					entry.status = RemoteAgentHostConnectionStatus.incompatible('Authentication failed during connection initialization.', [PROTOCOL_VERSION]);
					this._reconnectAttempts.delete(address);
					this._onDidChangeConnections.fire();
					break;
			}
		}));

		try {
			this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
			this._onDidChangeConnections.fire();
			await client.connect();
			if (store.isDisposed || !isCurrentEntry()) {
				if (!store.isDisposed) {
					disposeEntry(entry);
				}
				return; // removed before connect resolved
			}
			this._logService.info(`[RemoteAgentHost] Connected to ${address}`);
			entry.connected = true;
			entry.status = RemoteAgentHostConnectionStatus.connected;
			this._reconnectAttempts.delete(address);
			this._resolvePendingConnectionWait(address);
			this._onDidChangeConnections.fire();
		} catch (err) {
			if (!isCurrentEntry()) {
				if (!store.isDisposed) {
					disposeEntry(entry);
				}
				return;
			}

			// Protocol version mismatch is a deterministic, user-visible
			// failure: the host explicitly told us it cannot speak our
			// version. Surface it as `incompatible` (so the workspace picker
			// can show the message) and keep the entry around — futile
			// reconnect attempts would just spin until the user upgrades
			// either side, so leave recovery to the manual `Reconnect`
			// action in the picker.
			const incompatible = err instanceof InitialAuthenticationError
				? RemoteAgentHostConnectionStatus.incompatible(err.message, [PROTOCOL_VERSION])
				: RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
			if (incompatible) {
				this._logService.warn(`[RemoteAgentHost] Incompatible with ${address}: ${incompatible.kind === 'incompatible' ? incompatible.message : ''}`);
				entry.status = incompatible;
				this._reconnectAttempts.delete(address);
				this._rejectPendingConnectionWait(address, err);
				this._onDidChangeConnections.fire();
				return;
			}

			this._logService.error(`[RemoteAgentHost] Failed to connect to ${address}. Verify address and connectionToken`, err);

			// A transport that dropped mid-handshake leaves the protocol client
			// in `reconnecting` with its own retry already scheduled, and only
			// then rejects this promise. Tearing the entry down here would
			// cancel that retry and lose the client's replay state, so let it
			// restore itself instead of rebuilding from scratch.
			if (RemoteAgentHostConnectionStatus.isReconnecting(entry.status)) {
				this._logService.info(`[RemoteAgentHost] Handshake with ${address} was interrupted; the protocol client is restoring the connection`);
				return;
			}

			const disconnectReason = err instanceof NonReconnectableTransportError ? err.reason : AgentHostTransportFailureReason.Unknown;
			entry.status = RemoteAgentHostConnectionStatus.disconnectedBecause(disconnectReason);
			entry.client = undefined;
			// Clean up the failed client while retaining its entry and status.
			disposeEntry(entry);
			this._rejectPendingConnectionWait(address, err);
			this._onDidChangeConnections.fire();
			// Schedule reconnect if the address is still configured
			this._scheduleReconnect(address, entryToCreate.connectionToken);
		}
	}

	/**
	 * Schedule a reconnect attempt with exponential backoff.
	 * Only reconnects if the address remains exposed by a configuration or factory.
	 */
	private _scheduleReconnect(address: string, connectionToken?: string): void {
		// Don't reconnect if the address is no longer exposed.
		const configuredEntry = this._configuredEntries.get().find(entry => this._entryAddress(entry) === address);
		if (!configuredEntry) {
			this._logService.info(`[RemoteAgentHost] Not reconnecting to ${address}: no longer configured`);
			return;
		}

		const reconnectPolicy = getEntryTypeConfig(configuredEntry.connection.type).reconnect;
		if (!reconnectPolicy.autoRestore) {
			this._logService.info(`[RemoteAgentHost] Not reconnecting to ${address}: automatic restore is disabled`);
			return;
		}
		if (getEntryTypeConfig(configuredEntry.connection.type).dialedFromEntries && !this._shouldAutoConnect(configuredEntry)) {
			this._logService.info(`[RemoteAgentHost] Not reconnecting to ${address}: automatic connection is disabled`);
			return;
		}

		// Check the recorded count before adding this attempt, so a policy of
		// `maxAttempts: n` actually performs n attempts rather than n - 1.
		const previousAttempts = this._reconnectAttempts.get(address) ?? 0;
		if (hasExhaustedReconnectAttempts(reconnectPolicy, previousAttempts)) {
			this._logService.warn(`[RemoteAgentHost] Stopped reconnecting to ${address}: reached attempt limit (${previousAttempts})`);
			return;
		}

		const attempt = previousAttempts + 1;
		this._reconnectAttempts.set(address, attempt);

		const delay = computeReconnectDelay(reconnectPolicy, attempt);

		this._logService.info(`[RemoteAgentHost] Scheduling reconnect to ${address} in ${delay}ms (attempt ${attempt})`);

		this._cancelReconnect(address);
		const timeout = setTimeout(() => {
			this._reconnectTimeouts.delete(address);
			const currentEntry = this._configuredEntries.get().find(entry => this._entryAddress(entry) === address);
			if (currentEntry && (!getEntryTypeConfig(currentEntry.connection.type).dialedFromEntries || this._shouldAutoConnect(currentEntry))) {
				void this._connectTo({
					...currentEntry,
					connectionToken: connectionToken ?? this._tokens.get(address) ?? currentEntry.connectionToken,
				}, { userInitiated: false });
			}
		}, delay);
		this._reconnectTimeouts.set(address, timeout);
	}

	private _shouldAutoConnect(entry: IRemoteAgentHostEntry): boolean {
		const config = getEntryTypeConfig(entry.connection.type);
		return config.dialedFromEntries
			&& (!config.autoConnectGated || this._remoteAgentHostsAutoConnect.get());
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

	private _upsertEntry(entries: readonly IRemoteAgentHostEntry[], entry: IRemoteAgentHostEntry): IRemoteAgentHostEntry[] {
		const address = this._entryAddress(entry);
		const existingIndex = entries.findIndex(candidate => this._entryAddress(candidate) === address);
		return existingIndex === -1
			? [...entries, entry]
			: entries.map((candidate, index) => index === existingIndex ? entry : candidate);
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
		// Always-attached handler so a rejection with no awaiter (e.g. the
		// service being disposed while a background dial is in flight) is not
		// reported as an unhandled rejection. Real consumers await `wait.p`
		// and handle their own failures.
		wait.p.then(undefined, () => { /* swallow — each real consumer handles its own await */ });
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
		this._pendingConnects.clear();
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
	) {
		super(configurationService, instantiationService, logService, labelService, environmentService);
	}
}
