/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, Sequencer } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { supportsAgentHostDevContainerEnvironments } from '../../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { agentHostUri } from '../../../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { devContainerEnvironmentUri, isDevContainerEnvironmentId, localDevContainerEnvironmentUri } from '../../../../../../platform/agentHost/common/devContainerEnvironments.js';
import { getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { resolveRemoteAgentHostEntryAuthority } from '../../../browser/openInVSCodeUtils.js';
import { areDevContainerEnvironmentsEnabled, canUseDevContainerEnvironments, DevContainerAgentHostEnabledSettingId, DevContainerEnvironmentsEnabledSettingId, ICreatedDevContainerEnvironment, IDevContainerAgentHostConnection, IDevContainerAgentHostConnector, IDevContainerEnvironment, LocalDevContainerEnvironmentHost } from '../../../common/devContainerAgentHostService.js';
import { getDevContainerSourceEntry, resolveDevContainerSourceConnection } from './devContainerSource.js';
import type { IRemoteAgentHostSessionsProviderConfig, RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';

const DEV_CONTAINER_ENVIRONMENTS_STORAGE_KEY = 'devContainerAgentHost.environments';

interface IStoredDevContainerEnvironment {
	readonly id: string;
	readonly sourceAddress: string;
	readonly name: string;
}

function isStoredDevContainerEnvironment(value: unknown): value is IStoredDevContainerEnvironment {
	return typeof value === 'object'
		&& value !== null
		&& typeof Reflect.get(value, 'id') === 'string'
		&& isDevContainerEnvironmentId(Reflect.get(value, 'id'))
		&& typeof Reflect.get(value, 'sourceAddress') === 'string'
		&& !!Reflect.get(value, 'sourceAddress')
		&& typeof Reflect.get(value, 'name') === 'string';
}

function isEnvironmentHostEntry(entry: IRemoteAgentHostEntry): boolean {
	return entry.connection.type === RemoteAgentHostEntryType.SSH || entry.connection.type === RemoteAgentHostEntryType.Tunnel || entry.connection.type === RemoteAgentHostEntryType.WSL;
}

function isLocal(stored: IStoredDevContainerEnvironment): boolean {
	return stored.sourceAddress === LocalDevContainerEnvironmentHost;
}

/** Shared pieces of the Dev Container service that owns the single Dev Container connection factory. */
export interface IDevContainerEnvironmentsHost {
	currentConnector(): IDevContainerAgentHostConnector | undefined;
	waitForConnector(token: CancellationToken): Promise<IDevContainerAgentHostConnector>;
	stageConnection(connector: IDevContainerAgentHostConnector, workspaceUri: URI, connection: IDevContainerAgentHostConnection, hostAuthority?: string): void;
	unstageConnection(address: string): void;
	createProvider(config: IRemoteAgentHostSessionsProviderConfig): RemoteAgentHostSessionsProvider;
	getAddress(workspaceUri: URI): string;
}

interface IEnvironmentState {
	readonly stored: IStoredDevContainerEnvironment;
	readonly uri: URI;
	readonly address: string;
	readonly provider: RemoteAgentHostSessionsProvider;
	readonly store: DisposableStore;
	/** Serializes connecting and disconnecting, which follow the source host of an environment on a remote host. */
	readonly operations: Sequencer;
	/** Source host connection that an environment on a remote host last followed. */
	sourceConnection: IAgentConnection | undefined;
	pending: { readonly promise: Promise<void>; readonly tokenSource: CancellationTokenSource } | undefined;
	staged: boolean;
	/** Set while the container is being removed, which may connect the source host, so the environment is not recreated. */
	deleting: boolean;
	/** The container's workspace folder, which takes precedence over the Agent Host's home directory. */
	defaultDirectory: string | undefined;
}

/**
 * Dev Container environments: standalone containers created from an image on this computer or on SSH, Tunnel, and WSL hosts.
 * Each is a persistent remote Sessions provider. One on a remote host connects and disconnects with its source host.
 * One on this computer connects on first use, such as when it is selected or one of its sessions is opened, so starting
 * the application does not start its containers.
 */
export class DevContainerEnvironments extends Disposable {
	private readonly _states = new Map<string, IEnvironmentState>();
	private readonly _environments = observableValue<readonly IDevContainerEnvironment[]>(this, []);
	readonly environments: IObservable<readonly IDevContainerEnvironment[]> = this._environments;
	private readonly _environmentHosts = observableValue<ReadonlySet<string>>(this, new Set());
	readonly environmentHosts: IObservable<ReadonlySet<string>> = this._environmentHosts;
	private readonly _dockerChecks = new Map<string, { readonly connection: IAgentConnection; available: boolean | undefined }>();
	private _localDockerCheck: { readonly connector: IDevContainerAgentHostConnector; available: boolean | undefined } | undefined;

	constructor(
		private readonly _host: IDevContainerEnvironmentsHost,
		private readonly _remoteAgentHostService: IRemoteAgentHostService,
		private readonly _sessionsProvidersService: ISessionsProvidersService,
		private readonly _storageService: IStorageService,
		private readonly _configurationService: IConfigurationService,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcile()));
		this._register(this._remoteAgentHostService.onDidChangeConfiguredEntries(() => this._reconcile()));
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, DEV_CONTAINER_ENVIRONMENTS_STORAGE_KEY, this._store)(() => this._restore()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(DevContainerEnvironmentsEnabledSettingId) || e.affectsConfiguration(DevContainerAgentHostEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId) || e.affectsConfiguration('chat.disableAIFeatures')) {
				this._restore();
			}
		}));
		this._restore();
	}

	/** Re-evaluates host availability, e.g. after the connector registration changed. */
	update(): void {
		this._reconcile();
	}

	async create(sourceAddress: string, onWillConnect?: (environment: IDevContainerEnvironment) => void): Promise<ICreatedDevContainerEnvironment> {
		if (!areDevContainerEnvironmentsEnabled(this._configurationService)) {
			throw new Error(localize('devContainerEnvironment.disabled', "Dev Container environments are not enabled."));
		}
		if (!this._environmentHosts.get().has(sourceAddress)) {
			throw new Error(localize('devContainerEnvironment.hostUnavailable', "Dev Container environments are not available on this host. Connect to it and make sure Docker is installed."));
		}
		const stored: IStoredDevContainerEnvironment = { id: generateUuid(), sourceAddress, name: this._nextName() };
		// The current host connection is followed explicitly below rather than automatically.
		const state = this._createState(stored, isLocal(stored) ? undefined : this._remoteAgentHostService.getConnection(sourceAddress));
		this._writeStored([...this._readStored(), stored]);
		this._publish();
		try {
			onWillConnect?.(this._toEnvironment(state));
			await this._connect(state.address, true);
		} catch (error) {
			// Removing the container would connect a host that was disconnected meanwhile, and with it its other environments.
			// The environment is kept instead, so it starts with its host or can be deleted.
			if (isLocal(stored) || this._remoteAgentHostService.getConnection(sourceAddress)) {
				await this.delete(state.address).catch(cleanupError => this._logService.warn('[DevContainerEnvironments] Failed to remove an environment that could not be created', cleanupError));
			}
			throw error;
		}
		return {
			...this._toEnvironment(state),
			workspaceUri: state.defaultDirectory ? agentHostUri(agentHostAuthority(state.address), state.defaultDirectory) : undefined,
		};
	}

	async delete(address: string): Promise<void> {
		const state = this._states.get(address);
		if (!state || state.deleting) {
			throw new Error(localize('devContainerEnvironment.unavailable', "This Dev Container is no longer available."));
		}
		state.deleting = true;
		try {
			await this._disconnect(state);
			// A host that is no longer configured cannot be reached to remove its container.
			if (isLocal(state.stored) || getDevContainerSourceEntry(state.uri, this._remoteAgentHostService)) {
				const connector = this._host.currentConnector() ?? await this._host.waitForConnector(CancellationToken.None);
				if (!connector.removeContainer || !await connector.removeContainer(state.uri)) {
					throw new Error(localize('devContainerEnvironment.removeFailed', "The Dev Container '{0}' could not be removed.", state.provider.label));
				}
			}
		} catch (error) {
			state.deleting = false;
			throw error;
		}
		this._writeStored(this._readStored().filter(environment => environment.id !== state.stored.id));
		this._remoteAgentHostService.setDisplayName(address, undefined);
		this._disposeState(state);
		this._publish();
	}

	private _nextName(): string {
		const names = new Set([...this._states.values()].map(state => state.provider.label));
		const name = localize('devContainerEnvironment.name', "Dev Container");
		if (!names.has(name)) {
			return name;
		}
		for (let index = 2; ; index++) {
			const numbered = localize('devContainerEnvironment.numberedName', "Dev Container {0}", index);
			if (!names.has(numbered)) {
				return numbered;
			}
		}
	}

	private _restore(): void {
		const stored = areDevContainerEnvironmentsEnabled(this._configurationService) ? this._readStored() : [];
		const addresses = new Set<string>();
		for (const environment of stored) {
			const state = [...this._states.values()].find(state => state.stored.id === environment.id) ?? this._createState(environment, undefined);
			addresses.add(state.address);
		}
		for (const [address, state] of this._states) {
			if (!addresses.has(address)) {
				void this._disconnect(state).catch(error => this._logService.warn('[DevContainerEnvironments] Failed to disconnect a removed environment', error));
				this._disposeState(state);
			}
		}
		this._publish();
		this._reconcile();
	}

	private _createState(stored: IStoredDevContainerEnvironment, sourceConnection: IAgentConnection | undefined): IEnvironmentState {
		const uri = isLocal(stored) ? localDevContainerEnvironmentUri(stored.id) : devContainerEnvironmentUri(agentHostAuthority(stored.sourceAddress), stored.id);
		const address = this._host.getAddress(uri);
		const store = new DisposableStore();
		const provider = store.add(this._host.createProvider({
			address,
			name: stored.name,
			devContainerEnvironmentHost: stored.sourceAddress,
			canRemove: false,
			connectOnDemand: () => this._connect(address, true),
			disconnectOnDemand: async () => {
				const state = this._states.get(address);
				if (state) {
					await this._disconnect(state);
				}
			},
			showConnectionLog: async () => {
				const connector = this._host.currentConnector() ?? await this._host.waitForConnector(CancellationToken.None);
				await connector.showLog(uri);
			},
		}));
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
		store.add(this._sessionsProvidersService.registerProvider(provider));
		const state: IEnvironmentState = { stored, uri, address, provider, store, operations: new Sequencer(), sourceConnection, pending: undefined, staged: false, deleting: false, defaultDirectory: undefined };
		this._states.set(address, state);
		return state;
	}

	private _disposeState(state: IEnvironmentState): void {
		if (this._states.get(state.address) === state) {
			this._states.delete(state.address);
		}
		state.pending?.tokenSource.cancel();
		state.pending = undefined;
		state.store.dispose();
	}

	private _isCurrent(state: IEnvironmentState): boolean {
		return this._states.get(state.address) === state;
	}

	private _connect(address: string, userInitiated: boolean): Promise<void> {
		const state = this._states.get(address);
		if (!state || state.deleting) {
			return Promise.reject(new Error(localize('devContainerEnvironment.unavailable', "This Dev Container is no longer available.")));
		}
		if (state.pending) {
			return state.pending.promise;
		}
		if (state.staged && this._isConnectedOrReconnecting(address)) {
			return Promise.resolve();
		}
		const tokenSource = new CancellationTokenSource();
		state.provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
		const promise = state.operations.queue(() => this._doConnect(state, userInitiated, tokenSource.token)).finally(() => {
			if (state.pending?.promise === promise) {
				state.pending = undefined;
			}
			tokenSource.dispose();
			if (!this._store.isDisposed && this._isCurrent(state)) {
				this._reconcile();
			}
		});
		state.pending = { promise, tokenSource };
		return promise;
	}

	private async _doConnect(state: IEnvironmentState, userInitiated: boolean, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (userInitiated && !isLocal(state.stored)) {
			// Connecting the host also connects its environments.
			await resolveDevContainerSourceConnection(state.uri, this._remoteAgentHostService, this._sessionsProvidersService, token);
		}
		const connector = this._host.currentConnector() ?? await this._host.waitForConnector(token);
		if (!userInitiated && !await raceCancellationError(connector.isAvailable(state.uri), token)) {
			return;
		}
		await this._removeConnection(state);
		const connection = await connector.createConnection(state.uri, state.address, token, { resume: true });
		if (token.isCancellationRequested || !this._isCurrent(state)) {
			connection.transportDisposable?.dispose();
			throw new CancellationError();
		}
		const sourceEntry = getDevContainerSourceEntry(state.uri, this._remoteAgentHostService);
		this._host.stageConnection(connector, state.uri, connection, sourceEntry && resolveRemoteAgentHostEntryAuthority(sourceEntry));
		state.staged = true;
		state.defaultDirectory = connection.defaultDirectory;
		try {
			this._remoteAgentHostService.reconnect(state.address, true);
			const connectionInfo = await raceCancellationError(this._remoteAgentHostService.waitForConnection(state.address), token);
			const agentConnection = this._remoteAgentHostService.getConnection(connectionInfo.address);
			if (!agentConnection) {
				throw new Error(localize('devContainerEnvironment.connectionUnavailable', "The Dev Container connection was not available after connecting."));
			}
			state.provider.setConnection(agentConnection, state.defaultDirectory ?? connectionInfo.defaultDirectory);
			state.provider.setConnectionStatus(connectionInfo.status);
		} catch (error) {
			await this._removeConnection(state);
			throw error;
		}
	}

	private _disconnect(state: IEnvironmentState): Promise<void> {
		state.pending?.tokenSource.cancel();
		state.pending = undefined;
		return state.operations.queue(() => this._removeConnection(state));
	}

	private async _removeConnection(state: IEnvironmentState): Promise<void> {
		if (state.staged) {
			state.staged = false;
			this._host.unstageConnection(state.address);
			await this._remoteAgentHostService.removeRemoteAgentHost(state.address);
		}
		if (this._isCurrent(state)) {
			state.provider.clearConnection();
			state.provider.setConnectionStatus(state.pending ? RemoteAgentHostConnectionStatus.connecting : RemoteAgentHostConnectionStatus.disconnected);
		}
	}

	private _isConnectedOrReconnecting(address: string): boolean {
		return this._remoteAgentHostService.connections.some(connection => connection.address === address
			&& (RemoteAgentHostConnectionStatus.isConnected(connection.status) || RemoteAgentHostConnectionStatus.isReconnecting(connection.status)));
	}

	private _reconcile(): void {
		for (const state of this._states.values()) {
			const sourceConnection = isLocal(state.stored) ? undefined : this._remoteAgentHostService.getConnection(state.stored.sourceAddress);
			if (!isLocal(state.stored) && sourceConnection !== state.sourceConnection) {
				state.sourceConnection = sourceConnection;
				if (sourceConnection && !state.deleting) {
					void this._connect(state.address, false).catch(error => this._logService.warn(`[DevContainerEnvironments] Failed to connect ${state.provider.label}`, error));
				} else {
					void this._disconnect(state).catch(error => this._logService.warn(`[DevContainerEnvironments] Failed to disconnect ${state.provider.label}`, error));
				}
			}
			if (state.pending) {
				continue;
			}
			if (!state.staged) {
				state.provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
				continue;
			}
			const connectionInfo = this._remoteAgentHostService.connections.find(connection => connection.address === state.address);
			state.provider.setConnectionStatus(connectionInfo?.status ?? RemoteAgentHostConnectionStatus.disconnected);
			const connection = connectionInfo && RemoteAgentHostConnectionStatus.isConnected(connectionInfo.status) ? this._remoteAgentHostService.getConnection(state.address) : undefined;
			if (connection) {
				state.provider.setConnection(connection, state.defaultDirectory ?? connectionInfo?.defaultDirectory);
			} else if (!connectionInfo || !RemoteAgentHostConnectionStatus.isConnecting(connectionInfo.status) && !RemoteAgentHostConnectionStatus.isReconnecting(connectionInfo.status)) {
				// A permanently closed relay leaves a disconnected entry whose client is disposed; clearing it lets first use connect again.
				state.provider.clearConnection();
			}
		}
		this._updateEnvironmentHosts();
	}

	private _updateEnvironmentHosts(): void {
		const hosts = new Set<string>();
		const connector = this._host.currentConnector();
		if (canUseDevContainerEnvironments(this._configurationService) && connector) {
			if (this._localDockerCheck?.connector !== connector) {
				const current = { connector, available: undefined as boolean | undefined };
				this._localDockerCheck = current;
				(connector.isLocalDockerAvailable?.() ?? Promise.resolve(false)).then(available => current.available = available, error => {
					current.available = false;
					this._logService.warn('[DevContainerEnvironments] Failed to check Docker availability on this computer', error);
				}).finally(() => {
					if (!this._store.isDisposed && this._localDockerCheck === current) {
						this._updateEnvironmentHosts();
					}
				});
			}
			if (this._localDockerCheck.available) {
				hosts.add(LocalDevContainerEnvironmentHost);
			}
			const configured = new Set<string>();
			for (const entry of this._remoteAgentHostService.configuredEntries) {
				if (!isEnvironmentHostEntry(entry)) {
					continue;
				}
				const address = getEntryAddress(entry);
				configured.add(address);
				const connection = this._remoteAgentHostService.getConnection(address);
				const devContainerService = connection?.devContainerService;
				if (!connection || !devContainerService || !supportsAgentHostDevContainerEnvironments(connection.initializeResult.get())) {
					this._dockerChecks.delete(address);
					continue;
				}
				let check = this._dockerChecks.get(address);
				if (check?.connection !== connection) {
					const current = { connection, available: undefined as boolean | undefined };
					this._dockerChecks.set(address, current);
					check = current;
					devContainerService.isDockerAvailable().then(available => current.available = available, error => {
						current.available = false;
						this._logService.warn(`[DevContainerEnvironments] Failed to check Docker availability on ${address}`, error);
					}).finally(() => {
						if (!this._store.isDisposed && this._dockerChecks.get(address) === current) {
							this._updateEnvironmentHosts();
						}
					});
				}
				if (check.available) {
					hosts.add(address);
				}
			}
			// Checks of hosts that are no longer configured would retain their closed connections.
			for (const address of [...this._dockerChecks.keys()]) {
				if (!configured.has(address)) {
					this._dockerChecks.delete(address);
				}
			}
		} else {
			this._dockerChecks.clear();
			this._localDockerCheck = undefined;
		}
		const previous = this._environmentHosts.get();
		if (previous.size !== hosts.size || [...hosts].some(host => !previous.has(host))) {
			this._environmentHosts.set(hosts, undefined);
		}
	}

	private _toEnvironment(state: IEnvironmentState): IDevContainerEnvironment {
		return { address: state.address, sourceAddress: state.stored.sourceAddress, providerId: state.provider.id };
	}

	private _publish(): void {
		this._environments.set([...this._states.values()].map(state => this._toEnvironment(state)), undefined);
	}

	private _readStored(): IStoredDevContainerEnvironment[] {
		const raw = this._storageService.get(DEV_CONTAINER_ENVIRONMENTS_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return [];
		}
		try {
			const stored: unknown = JSON.parse(raw);
			return Array.isArray(stored) ? stored.filter(isStoredDevContainerEnvironment).map(({ id, sourceAddress, name }) => ({ id, sourceAddress, name })) : [];
		} catch {
			return [];
		}
	}

	private _writeStored(environments: readonly IStoredDevContainerEnvironment[]): void {
		if (environments.length === 0) {
			this._storageService.remove(DEV_CONTAINER_ENVIRONMENTS_STORAGE_KEY, StorageScope.APPLICATION);
		} else {
			this._storageService.store(DEV_CONTAINER_ENVIRONMENTS_STORAGE_KEY, JSON.stringify(environments), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}

	override dispose(): void {
		for (const state of [...this._states.values()]) {
			this._disposeState(state);
		}
		super.dispose();
	}
}
