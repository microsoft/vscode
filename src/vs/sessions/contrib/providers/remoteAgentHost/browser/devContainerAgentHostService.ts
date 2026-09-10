/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { raceCancellationError, raceTimeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { getEntryAddress, getEntryTypeConfig, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, type IRemoteAgentHostConnectOptions, type IRemoteAgentHostConnectionFactory, type IRemoteAgentHostCreatedConnection } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IDevContainerAgentHostConnection, IDevContainerAgentHostConnector, IDevContainerAgentHostService, IDevContainerAgentHostTarget } from '../../../../common/devContainerAgentHostService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';

const DEV_CONTAINER_AGENT_HOSTS_STORAGE_KEY = 'devContainerAgentHost.connections';
const CONNECTOR_REGISTRATION_TIMEOUT_MS = 30_000;

interface IStoredDevContainerAgentHost {
	readonly workspaceUri: string;
	readonly name: string;
}

function isStoredDevContainerAgentHost(value: unknown): value is IStoredDevContainerAgentHost {
	return typeof value === 'object'
		&& value !== null
		&& typeof Reflect.get(value, 'workspaceUri') === 'string'
		&& typeof Reflect.get(value, 'name') === 'string';
}

interface IActiveDevContainerAgentHost {
	readonly address: string;
	readonly provider: RemoteAgentHostSessionsProvider;
	readonly target: Omit<IDevContainerAgentHostTarget, 'release'>;
	references: number;
}

interface IPendingDevContainerAgentHost {
	readonly promise: Promise<IActiveDevContainerAgentHost>;
	readonly tokenSource: CancellationTokenSource;
}

interface IStagedDevContainerConnection {
	readonly entry: IRemoteAgentHostEntry;
	readonly connector: IDevContainerAgentHostConnector;
	readonly workspaceUri: URI;
	initialConnection: IDevContainerAgentHostConnection | undefined;
}

function devContainerAddress(workspaceUri: URI): string {
	const sha = new StringSHA1();
	sha.update(getComparisonKey(workspaceUri));
	return `devcontainer:${sha.digest()}`;
}

/** Builds Dev Container protocol clients from a staged workspace transport. */
class DevContainerConnectionFactory extends Disposable implements IRemoteAgentHostConnectionFactory {
	readonly kind = RemoteAgentHostEntryType.DevContainer;
	readonly entries: IObservable<readonly IRemoteAgentHostEntry[]>;

	private readonly _stagedConnections = new Map<string, IStagedDevContainerConnection>();
	private readonly _entries = observableValue<readonly IRemoteAgentHostEntry[]>(this, []);

	constructor(
		private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this.entries = this._entries;
		// Staging is cleared only by an explicit `unstageConnection`, never by
		// observing the connection disappear. The service withdraws an entry
		// before arming a retry, so treating that as removal would delete the
		// staged connector the retry needs and leave `_scheduleReconnect` with
		// nothing configured — silently turning every scheduled retry into one
		// single attempt.
	}

	stageConnection(connector: IDevContainerAgentHostConnector, workspaceUri: URI, connection: IDevContainerAgentHostConnection): IRemoteAgentHostEntry {
		const entry: IRemoteAgentHostEntry = {
			name: connection.name,
			connection: {
				type: RemoteAgentHostEntryType.DevContainer,
				address: connection.address,
				hostPath: workspaceUri.fsPath,
			},
		};
		this._stagedConnections.set(connection.address, { entry, connector, workspaceUri, initialConnection: connection });
		this._updateEntries();
		return entry;
	}

	unstageConnection(address: string): void {
		const staged = this._stagedConnections.get(address);
		this._stagedConnections.delete(address);
		staged?.initialConnection?.transportDisposable?.dispose();
		this._updateEntries();
	}

	async createConnection(entry: IRemoteAgentHostEntry, _options: IRemoteAgentHostConnectOptions): Promise<IRemoteAgentHostCreatedConnection> {
		if (entry.connection.type !== RemoteAgentHostEntryType.DevContainer) {
			throw new Error(`Dev Container factory cannot create a ${entry.connection.type} connection.`);
		}
		const staged = this._stagedConnections.get(entry.connection.address);
		if (!staged) {
			throw new Error(`No Dev Container connection is staged for ${entry.connection.address}.`);
		}

		const connection = staged.initialConnection ?? await staged.connector.createConnection(
			staged.workspaceUri,
			entry.connection.address,
			CancellationToken.None,
		);
		try {
			const authority = agentHostAuthority(entry.connection.address);
			if (connection.workspaceUri.scheme !== AGENT_HOST_SCHEME || connection.workspaceUri.authority !== authority) {
				throw new Error(localize('devContainerAgentHost.invalidWorkspaceUri', "Dev Container workspace URI must use the '{0}' scheme and '{1}' authority.", AGENT_HOST_SCHEME, authority));
			}

			const client = this._instantiationService.createInstance(
				AgentHostProtocolClient,
				entry.connection.address,
				connection.transportFactory,
				{ clientInfo: agentsWindowAgentHostClientInfo, reconnectPolicy: getEntryTypeConfig(RemoteAgentHostEntryType.DevContainer).reconnect },
			);
			staged.initialConnection = undefined;
			return {
				connection: client,
				transportDisposable: connection.transportDisposable,
			};
		} catch (error) {
			if (staged.initialConnection === connection) {
				staged.initialConnection = undefined;
			}
			connection.transportDisposable?.dispose();
			throw error;
		}
	}

	private _updateEntries(): void {
		this._entries.set([...this._stagedConnections.values()].map(connection => connection.entry), undefined);
	}
}

/** Registers Dev Container Agent Hosts as persistent remote Sessions providers. */
export class DevContainerAgentHostService extends Disposable implements IDevContainerAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _providerStores = this._register(new DisposableMap<string>());
	private readonly _providers = new Map<string, RemoteAgentHostSessionsProvider>();
	private readonly _activeConnections = new Map<string, IActiveDevContainerAgentHost>();
	private readonly _pendingConnections = new Map<string, IPendingDevContainerAgentHost>();
	private readonly _storedConnections = new Map<string, IStoredDevContainerAgentHost>();
	private readonly _connectionFactory: DevContainerConnectionFactory;
	private readonly _onDidRegisterConnector = this._register(new Emitter<IDevContainerAgentHostConnector>());
	private _connector: IDevContainerAgentHostConnector | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._connectionFactory = this._register(new DevContainerConnectionFactory(this._instantiationService));
		this._register(this._remoteAgentHostService.registerConnectionFactory(this._connectionFactory));
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcileConnections()));
		this._restoreProviders();
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, DEV_CONTAINER_AGENT_HOSTS_STORAGE_KEY, this._store)(() => this._restoreProviders()));
	}

	registerConnector(connector: IDevContainerAgentHostConnector): IDisposable {
		if (this._connector) {
			throw new Error(localize('devContainerAgentHost.connectorAlreadyRegistered', "A Dev Container Agent Host connector is already registered."));
		}
		this._connector = connector;
		this._onDidRegisterConnector.fire(connector);
		return toDisposable(() => {
			if (this._connector === connector) {
				this._connector = undefined;
			}
		});
	}

	isAvailable(workspaceUri: URI): Promise<boolean> {
		return this._connector?.isAvailable(workspaceUri) ?? Promise.resolve(false);
	}

	connect(workspaceUri: URI, token: CancellationToken): Promise<IDevContainerAgentHostTarget> {
		return this._ensureConnection(workspaceUri, token).then(active => this._acquireConnection(getComparisonKey(workspaceUri), active));
	}

	private _ensureConnection(workspaceUri: URI, token: CancellationToken): Promise<IActiveDevContainerAgentHost> {
		const key = getComparisonKey(workspaceUri);
		const active = this._activeConnections.get(key);
		if (active && this._isConnectedOrReconnecting(active.address)) {
			return Promise.resolve(active);
		}
		const pending = this._pendingConnections.get(key);
		if (pending) {
			return raceCancellationError(pending.promise, token);
		}

		this._providers.get(key)?.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
		const tokenSource = new CancellationTokenSource(token);
		const promise = this._replaceConnectionAndConnect(workspaceUri, key, active, tokenSource.token);
		const pendingConnection = { promise, tokenSource };
		this._pendingConnections.set(key, pendingConnection);
		void promise.then(
			() => this._completePendingConnection(key, pendingConnection),
			() => this._completePendingConnection(key, pendingConnection),
		);
		return promise;
	}

	private _completePendingConnection(key: string, pending: IPendingDevContainerAgentHost): void {
		if (this._pendingConnections.get(key) === pending) {
			this._pendingConnections.delete(key);
		}
		if (!this._activeConnections.has(key)) {
			this._providers.get(key)?.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
		}
		pending.tokenSource.dispose();
	}

	private async _replaceConnectionAndConnect(
		workspaceUri: URI,
		key: string,
		active: IActiveDevContainerAgentHost | undefined,
		token: CancellationToken,
	): Promise<IActiveDevContainerAgentHost> {
		const connector = this._connector ?? await this._waitForConnector(token);
		if (active) {
			await this._disconnectActiveConnection(key, active);
		}
		return this._connect(connector, workspaceUri, key, token);
	}

	private async _waitForConnector(token: CancellationToken): Promise<IDevContainerAgentHostConnector> {
		const connectorPromise = Event.toPromise(this._onDidRegisterConnector.event);
		try {
			const connector = await raceCancellationError(
				raceTimeout(connectorPromise, CONNECTOR_REGISTRATION_TIMEOUT_MS),
				token,
			);
			if (!connector) {
				throw new Error(localize('devContainerAgentHost.connectorUnavailable', "No Dev Container Agent Host connector is registered."));
			}
			return connector;
		} finally {
			connectorPromise.cancel();
		}
	}

	private async _connect(connector: IDevContainerAgentHostConnector, workspaceUri: URI, key: string, token: CancellationToken): Promise<IActiveDevContainerAgentHost> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const connected = await connector.createConnection(workspaceUri, devContainerAddress(workspaceUri), token);
		if (token.isCancellationRequested) {
			connected.transportDisposable?.dispose();
			throw new CancellationError();
		}

		let stagedAddress: string | undefined;
		try {
			const provider = this._ensureProvider(workspaceUri, connected.name, connected.address);

			const entry = this._connectionFactory.stageConnection(connector, workspaceUri, connected);
			const address = getEntryAddress(entry);
			stagedAddress = address;
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._remoteAgentHostService.reconnect(address, true);
			const connectionInfo = await raceCancellationError(this._remoteAgentHostService.waitForConnection(address), token);
			const connection = this._remoteAgentHostService.getConnection(connectionInfo.address);
			if (!connection) {
				throw new Error(localize('devContainerAgentHost.connectionUnavailable', "Dev Container Agent Host connection was not available after connecting."));
			}
			provider.setConnection(connection, connected.defaultDirectory ?? connectionInfo.defaultDirectory);
			provider.setConnectionStatus(connectionInfo.status);
			await this._waitForSessionTypes(provider, token);
			if (provider.getSessions().length > 0) {
				this._storeConnection(workspaceUri, connected.name);
			}

			const target = { providerId: provider.id, workspaceUri: connected.workspaceUri };
			const active = { address, provider, target, references: 0 };
			this._activeConnections.set(key, active);
			return active;
		} catch (error) {
			if (stagedAddress !== undefined) {
				// A failed dial now retains a client-less entry, so mere presence no
				// longer means the connection survived — require a live one.
				const connectionStillLive = this._isConnectedOrReconnecting(stagedAddress);
				if (token.isCancellationRequested || !connectionStillLive) {
					this._connectionFactory.unstageConnection(stagedAddress);
					await this._remoteAgentHostService.removeRemoteAgentHost(stagedAddress);
				}
			} else {
				connected.transportDisposable?.dispose();
			}
			if (!this._storedConnections.has(key)) {
				this._removeProvider(key);
			}
			throw error;
		}
	}

	private _acquireConnection(key: string, active: IActiveDevContainerAgentHost): IDevContainerAgentHostTarget {
		active.references++;
		let released = false;
		return {
			...active.target,
			release: async () => {
				if (released) {
					return;
				}
				released = true;
				active.references--;
				if (active.references === 0 && this._activeConnections.get(key) === active) {
					await this._disconnectActiveConnection(key, active);
					if (active.provider.getSessions().length === 0) {
						this._removeStoredConnection(key);
						this._removeProvider(key);
					}
				}
			},
		};
	}

	private _ensureProvider(workspaceUri: URI, name: string, address = devContainerAddress(workspaceUri)): RemoteAgentHostSessionsProvider {
		const key = getComparisonKey(workspaceUri);
		const existing = this._providers.get(key);
		if (existing) {
			return existing;
		}

		const store = new DisposableStore();
		const provider = store.add(this._createProvider({
			address,
			name,
			devContainerWorktreeScope: key,
			omitHostFromWorkspaceLabel: true,
			connectOnDemand: async () => {
				await this._ensureConnection(workspaceUri, CancellationToken.None);
			},
			disconnectOnDemand: () => this.disconnect(workspaceUri),
		}));
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
		store.add(this._sessionsProvidersService.registerProvider(provider));
		store.add(provider.onDidChangeSessions(event => {
			if (event.added.length > 0) {
				this._storeConnection(workspaceUri, name);
			}
		}));
		store.add(toDisposable(() => this._providers.delete(key)));
		this._providers.set(key, provider);
		this._providerStores.set(key, store);
		return provider;
	}

	protected _createProvider(config: ConstructorParameters<typeof RemoteAgentHostSessionsProvider>[0]): RemoteAgentHostSessionsProvider {
		return this._instantiationService.createInstance(RemoteAgentHostSessionsProvider, config);
	}

	protected async _waitForSessionTypes(provider: RemoteAgentHostSessionsProvider, token: CancellationToken): Promise<void> {
		const deadline = Date.now() + 30_000;
		while (provider.sessionTypes.length === 0) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) {
				throw new Error(localize('devContainerAgentHost.agentDiscoveryTimeout', "Timed out waiting for the Dev Container Agent Host to advertise agents."));
			}
			let timedOut = false;
			await raceCancellationError(
				raceTimeout(Event.toPromise(provider.onDidChangeSessionTypes), remaining, () => timedOut = true),
				token,
			);
			if (timedOut) {
				throw new Error(localize('devContainerAgentHost.agentDiscoveryTimeout', "Timed out waiting for the Dev Container Agent Host to advertise agents."));
			}
		}
	}

	async disconnect(workspaceUri: URI): Promise<void> {
		const key = getComparisonKey(workspaceUri);
		const pending = this._pendingConnections.get(key);
		if (pending) {
			pending.tokenSource.cancel();
			await pending.promise.then(
				() => undefined,
				() => undefined,
			);
		}
		const active = this._activeConnections.get(key);
		if (!active) {
			return;
		}
		await this._disconnectActiveConnection(key, active);
		if (active.provider.getSessions().length === 0) {
			this._removeStoredConnection(key);
			this._removeProvider(key);
		}
	}

	private async _disconnectActiveConnection(key: string, active: IActiveDevContainerAgentHost): Promise<void> {
		this._activeConnections.delete(key);
		this._connectionFactory.unstageConnection(active.address);
		await this._remoteAgentHostService.removeRemoteAgentHost(active.address);
		active.provider.clearConnection();
		active.provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
	}

	private _isConnectedOrReconnecting(address: string): boolean {
		return this._remoteAgentHostService.connections.some(connection =>
			connection.address === address
			&& (RemoteAgentHostConnectionStatus.isConnected(connection.status) || RemoteAgentHostConnectionStatus.isReconnecting(connection.status))
		);
	}

	private _reconcileConnections(): void {
		for (const [key, active] of this._activeConnections) {
			const connectionInfo = this._remoteAgentHostService.connections.find(connection => connection.address === active.address);
			if (!connectionInfo) {
				this._activeConnections.delete(key);
				this._connectionFactory.unstageConnection(active.address);
				active.provider.clearConnection();
				active.provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
				if (!this._storedConnections.has(key)) {
					this._removeProvider(key);
				}
				continue;
			}
			active.provider.setConnectionStatus(connectionInfo.status);
			if (RemoteAgentHostConnectionStatus.isConnected(connectionInfo.status)) {
				const connection = this._remoteAgentHostService.getConnection(active.address);
				if (connection) {
					active.provider.setConnection(connection, connectionInfo.defaultDirectory);
				}
			}
		}
	}

	private _restoreProviders(): void {
		const stored = this._readStoredConnections();
		for (const key of this._storedConnections.keys()) {
			if (!stored.has(key)) {
				this._storedConnections.delete(key);
				if (!this._activeConnections.has(key)) {
					this._removeProvider(key);
				}
			}
		}
		for (const [key, connection] of stored) {
			this._storedConnections.set(key, connection);
			const workspaceUri = URI.parse(connection.workspaceUri);
			this._ensureProvider(workspaceUri, connection.name);
		}
	}

	private _readStoredConnections(): Map<string, IStoredDevContainerAgentHost> {
		const result = new Map<string, IStoredDevContainerAgentHost>();
		const raw = this._storageService.get(DEV_CONTAINER_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return result;
		}
		try {
			const stored: unknown = JSON.parse(raw);
			if (!Array.isArray(stored)) {
				return result;
			}
			for (const candidate of stored) {
				if (!isStoredDevContainerAgentHost(candidate)) {
					continue;
				}
				const uri = URI.parse(candidate.workspaceUri);
				if (uri.scheme !== Schemas.file || candidate.name.length === 0) {
					continue;
				}
				result.set(getComparisonKey(uri), { workspaceUri: uri.toString(), name: candidate.name });
			}
		} catch {
			return result;
		}
		return result;
	}

	private _storeConnection(workspaceUri: URI, name: string): void {
		const key = getComparisonKey(workspaceUri);
		const stored = { workspaceUri: workspaceUri.toString(), name };
		const existing = this._storedConnections.get(key);
		if (existing?.workspaceUri === stored.workspaceUri && existing.name === stored.name) {
			return;
		}
		this._storedConnections.set(key, stored);
		this._writeStoredConnections();
	}

	private _removeStoredConnection(key: string): void {
		if (this._storedConnections.delete(key)) {
			this._writeStoredConnections();
		}
	}

	private _writeStoredConnections(): void {
		if (this._storedConnections.size === 0) {
			this._storageService.remove(DEV_CONTAINER_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
			return;
		}
		this._storageService.store(
			DEV_CONTAINER_AGENT_HOSTS_STORAGE_KEY,
			JSON.stringify([...this._storedConnections.values()]),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);
	}

	private _removeProvider(key: string): void {
		this._providerStores.deleteAndDispose(key);
	}

	override dispose(): void {
		for (const pending of this._pendingConnections.values()) {
			pending.tokenSource.cancel();
			pending.tokenSource.dispose();
		}
		this._pendingConnections.clear();
		super.dispose();
	}
}

registerSingleton(IDevContainerAgentHostService, DevContainerAgentHostService, InstantiationType.Delayed);
