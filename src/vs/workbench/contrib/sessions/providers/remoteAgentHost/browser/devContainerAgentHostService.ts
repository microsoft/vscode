/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { raceCancellationError, raceTimeout, SequencerByKey } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { basename, getComparisonKey } from '../../../../../../base/common/resources.js';
import { StringSHA1 } from '../../../../../../base/common/hash.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent, observableValue, runOnChange, waitForState } from '../../../../../../base/common/observable.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { findDevContainerSample } from '../../../../../../platform/agentHost/common/devContainerSamples.js';
import { findDevContainerEnvironment, parseDevContainerEnvironmentWorkspaceFolder } from '../../../../../../platform/agentHost/common/devContainerEnvironments.js';
import { localize } from '../../../../../../nls.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { AgentHostProtocolClient } from '../../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { getEntryAddress, getEntryTypeConfig, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, type IRemoteAgentHostConnectOptions, type IRemoteAgentHostConnectionFactory, type IRemoteAgentHostCreatedConnection } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerDiscoveryEnabledSettingId, ICreatedDevContainerEnvironment, IDevContainerAgentHostConnection, IDevContainerAgentHostConnectionOptions, IDevContainerAgentHostConnector, IDevContainerAgentHostService, IDevContainerAgentHostTarget, IDevContainerEnvironment, IDevContainerFolderContainer, isDevContainerDiscoveryEnabled, LocalDevContainerEnvironmentHost } from '../../../common/devContainerAgentHostService.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { resolveRemoteAgentHostEntryAuthority } from '../../../browser/openInVSCodeUtils.js';
import { devContainerSourcePath, getDevContainerSourceEntry, resolveDevContainerSourceConnection } from './devContainerSource.js';
import { DevContainerEnvironments } from './devContainerEnvironments.js';
import { DevContainerFolderDiscovery, IDiscoveredDevContainerFolder } from './devContainerFolderDiscovery.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';

const DEV_CONTAINER_AGENT_HOSTS_STORAGE_KEY = 'devContainerAgentHost.connections';
const CONNECTOR_REGISTRATION_TIMEOUT_MS = 30_000;

interface IStoredDevContainerAgentHost {
	readonly workspaceUri: string;
	readonly name: string;
	readonly sandboxEnabled?: boolean;
}

function isStoredDevContainerAgentHost(value: unknown): value is IStoredDevContainerAgentHost {
	return typeof value === 'object'
		&& value !== null
		&& typeof Reflect.get(value, 'workspaceUri') === 'string'
		&& typeof Reflect.get(value, 'name') === 'string'
		&& (Reflect.get(value, 'sandboxEnabled') === undefined || typeof Reflect.get(value, 'sandboxEnabled') === 'boolean');
}

interface IActiveDevContainerAgentHost {
	readonly address: string;
	readonly provider: RemoteAgentHostSessionsProvider;
	readonly target: Omit<IDevContainerAgentHostTarget, 'release'>;
	readonly connector: IDevContainerAgentHostConnector;
	readonly workspaceUri: URI;
	state: 'running' | 'stopping' | 'stopped' | 'removing' | 'removed' | 'connecting';
	references: number;
	sandboxEnabled: boolean | undefined;
	sandboxSupported: boolean | undefined;
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
	readonly sandboxEnabled: boolean | undefined;
	sandboxSupported: boolean | undefined;
	/** Whether a connection made without user action, rebuilding this one, may only connect to a running container. */
	readonly requireRunning: boolean;
}

function devContainerAddress(workspaceUri: URI): string {
	const sha = new StringSHA1();
	sha.update(getComparisonKey(workspaceUri));
	return `devcontainer:${sha.digest()}`;
}

async function createDevContainerConnection(connector: IDevContainerAgentHostConnector, workspaceUri: URI, address: string, token: CancellationToken, options: IDevContainerAgentHostConnectionOptions): Promise<IDevContainerAgentHostConnection> {
	const key = getComparisonKey(workspaceUri);
	let inspectedSupport: boolean | undefined;
	const listener = connector.onDidChangeSandboxSupport?.(event => {
		if (getComparisonKey(event.workspaceUri) === key) {
			inspectedSupport = event.supported;
		}
	});
	try {
		const connection = await connector.createConnection(workspaceUri, address, token, options);
		return inspectedSupport !== undefined ? { ...connection, sandboxSupported: inspectedSupport } : connection;
	} finally {
		listener?.dispose();
	}
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

	stageConnection(connector: IDevContainerAgentHostConnector, workspaceUri: URI, connection: IDevContainerAgentHostConnection, hostAuthority?: string, sandboxEnabled?: boolean, requireRunning = false): IRemoteAgentHostEntry {
		const environment = findDevContainerEnvironment(workspaceUri);
		// The environment's workspace folder names its volume and the folder in it.
		const volume = environment && connection.defaultDirectory ? parseDevContainerEnvironmentWorkspaceFolder(connection.defaultDirectory) : undefined;
		const entry: IRemoteAgentHostEntry = {
			name: connection.name,
			connection: {
				type: RemoteAgentHostEntryType.DevContainer,
				address: connection.address,
				...(connection.repository ? { repository: connection.repository }
					: environment ? { environmentId: environment.environmentId, ...(volume ? { volume } : {}), ...(connection.volumeOnLocalDockerEngine ? { volumeOnLocalDockerEngine: true } : {}) }
						: { hostPath: connection.hostWorkspaceFolder ?? devContainerSourcePath(workspaceUri) }),
				...(hostAuthority ? { hostAuthority } : {}),
			},
		};
		this._stagedConnections.set(connection.address, { entry, connector, workspaceUri, initialConnection: connection, sandboxEnabled, sandboxSupported: connection.sandboxSupported, requireRunning });
		this._updateEntries();
		return entry;
	}

	unstageConnection(address: string): void {
		const staged = this._stagedConnections.get(address);
		this._stagedConnections.delete(address);
		staged?.initialConnection?.transportDisposable?.dispose();
		this._updateEntries();
	}

	getSandboxSupported(address: string): boolean | undefined {
		return this._stagedConnections.get(address)?.sandboxSupported;
	}

	setSandboxSupported(workspaceUri: URI, supported: boolean | undefined): void {
		const key = getComparisonKey(workspaceUri);
		for (const staged of this._stagedConnections.values()) {
			if (getComparisonKey(staged.workspaceUri) === key) {
				staged.sandboxSupported = supported;
			}
		}
	}

	async createConnection(entry: IRemoteAgentHostEntry, options: IRemoteAgentHostConnectOptions): Promise<IRemoteAgentHostCreatedConnection> {
		if (entry.connection.type !== RemoteAgentHostEntryType.DevContainer) {
			throw new Error(`Dev Container factory cannot create a ${entry.connection.type} connection.`);
		}
		const staged = this._stagedConnections.get(entry.connection.address);
		if (!staged) {
			throw new Error(`No Dev Container connection is staged for ${entry.connection.address}.`);
		}

		// A rebuilt connection of a Dev Container environment keeps the environment's name.
		const connection = staged.initialConnection ?? await createDevContainerConnection(
			staged.connector,
			staged.workspaceUri,
			entry.connection.address,
			CancellationToken.None,
			{
				resume: options.userInitiated,
				...(entry.connection.environmentId !== undefined ? { name: staged.entry.name } : {}),
				...(staged.sandboxEnabled !== undefined ? { sandboxEnabled: staged.sandboxEnabled } : {}),
				...(staged.requireRunning && !options.userInitiated ? { requireRunning: true } : {}),
			},
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
				{ clientInfo: agentsWindowAgentHostClientInfo, reconnectPolicy: getEntryTypeConfig(RemoteAgentHostEntryType.DevContainer).reconnect, clientCertificates: connection.clientCertificates, clientProxy: connection.clientProxy },
			);
			staged.initialConnection = undefined;
			staged.sandboxSupported = connection.sandboxSupported;
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

function devContainerWorkspaceLabel(workspaceUri: URI, hostLabel: string): string {
	return `${basename(workspaceUri)} [${hostLabel}]`;
}

function isEqualFolderContainer(a: IDevContainerFolderContainer, b: IDevContainerFolderContainer): boolean {
	return a.address === b.address && a.providerId === b.providerId && a.sourceAddress === b.sourceAddress && a.running === b.running
		&& getComparisonKey(a.workspaceUri) === getComparisonKey(b.workspaceUri);
}

/** Registers Dev Container Agent Hosts as persistent remote Sessions providers. */
export class DevContainerAgentHostService extends Disposable implements IDevContainerAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _providerStores = this._register(new DisposableMap<string>());
	private readonly _providers = new Map<string, RemoteAgentHostSessionsProvider>();
	private readonly _activeConnections = new Map<string, IActiveDevContainerAgentHost>();
	private readonly _knownSandboxSupport = new Map<string, boolean>();
	private readonly _pendingConnections = new Map<string, IPendingDevContainerAgentHost>();
	private readonly _storedConnections = new Map<string, IStoredDevContainerAgentHost>();
	private readonly _connectionFactory: DevContainerConnectionFactory;
	private readonly _lifecycleOperations = new SequencerByKey<string>();
	private readonly _lifecycleTokenSource = this._register(new CancellationTokenSource());
	private readonly _onDidRegisterConnector = this._register(new Emitter<IDevContainerAgentHostConnector>());
	private readonly _onDidChangeAvailability = this._register(new Emitter<void>());
	readonly onDidChangeAvailability = this._onDidChangeAvailability.event;
	private _connector: IDevContainerAgentHostConnector | undefined;
	private readonly _environments: DevContainerEnvironments;
	readonly environments: IObservable<readonly IDevContainerEnvironment[]>;
	readonly environmentHosts: IObservable<ReadonlySet<string>>;
	private readonly _folderDiscovery: DevContainerFolderDiscovery;
	private readonly _folderContainers = observableValue<readonly IDevContainerFolderContainer[]>(this, []);
	readonly folderContainers: IObservable<readonly IDevContainerFolderContainer[]> = this._folderContainers;
	/** Folders with a running container, whose providers stay registered while it runs so that they are listed. */
	private readonly _runningFolders = new Map<string, IDiscoveredDevContainerFolder>();
	/**
	 * Running folder containers, with the address of their host, that are not connected without user action again until
	 * a listing of that host shows they stopped: this window disconnected from them, or connecting to them without user
	 * action failed.
	 */
	private readonly _skippedFolders = new Map<string, string>();
	/** Folders whose running container this window is connecting to without user action. */
	private readonly _autoConnectingFolders = new Set<string>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._connectionFactory = this._register(new DevContainerConnectionFactory(this._instantiationService));
		this._register(this._remoteAgentHostService.registerConnectionFactory(this._connectionFactory));
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcileConnections()));
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._onDidChangeAvailability.fire()));
		this._register(this._sessionsProvidersService.onDidChangeProviders(() => this._initializeProviders()));
		this._folderDiscovery = this._register(new DevContainerFolderDiscovery(() => this._connector, this._remoteAgentHostService, this._configurationService, this._logService));
		this._restoreProviders();
		this._initializeProviders();
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, DEV_CONTAINER_AGENT_HOSTS_STORAGE_KEY, this._store)(() => this._restoreProviders()));
		this._environments = this._register(new DevContainerEnvironments({
			currentConnector: () => this._connector,
			waitForConnector: token => this._waitForConnector(token),
			stageConnection: (connector, workspaceUri, connection, hostAuthority) => { this._connectionFactory.stageConnection(connector, workspaceUri, connection, hostAuthority); },
			unstageConnection: address => this._connectionFactory.unstageConnection(address),
			createProvider: config => this._createProvider(config),
			getAddress: devContainerAddress,
		}, this._remoteAgentHostService, this._sessionsProvidersService, this._storageService, this._configurationService, this._logService));
		this.environments = this._environments.environments;
		this.environmentHosts = this._environments.environmentHosts;
		this._register(this._folderDiscovery.onDidChange(() => this._onDidDiscoverFolders()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if ([DevContainerDiscoveryEnabledSettingId, DevContainerAgentHostEnabledSettingId, RemoteAgentHostsEnabledSettingId, 'chat.disableAIFeatures'].some(key => e.affectsConfiguration(key))) {
				this._updateFolderContainers();
			}
		}));
	}

	private _initializeProviders(): void {
		for (const provider of this._sessionsProvidersService.getProviders()) {
			if (provider instanceof RemoteAgentHostSessionsProvider) {
				provider.initializeDevContainerSupport(this, this._sessionsProvidersService, this._workspaceTrustRequestService);
			}
		}
	}

	registerConnector(connector: IDevContainerAgentHostConnector): IDisposable {
		if (this._connector) {
			throw new Error(localize('devContainerAgentHost.connectorAlreadyRegistered', "A Dev Container Agent Host connector is already registered."));
		}
		this._connector = connector;
		const sandboxSupportListener = connector.onDidChangeSandboxSupport?.(event => this._setSandboxSupported(event.workspaceUri, event.supported));
		this._onDidRegisterConnector.fire(connector);
		this._onDidChangeAvailability.fire();
		this._environments.update();
		void this._folderDiscovery.refresh();
		return combinedDisposable(sandboxSupportListener ?? Disposable.None, toDisposable(() => {
			if (this._connector === connector) {
				this._connector = undefined;
				this._onDidChangeAvailability.fire();
				this._environments.update();
			}
		}));
	}

	createEnvironment(sourceAddress: string, options?: { readonly onWillConnect?: (environment: IDevContainerEnvironment) => void }): Promise<ICreatedDevContainerEnvironment> {
		return this._environments.create(sourceAddress, options?.onWillConnect);
	}

	deleteEnvironment(address: string): Promise<void> {
		return this._environments.delete(address);
	}

	refreshFolderContainers(): Promise<void> {
		return this._folderDiscovery.refresh();
	}

	/** Keeps the providers of running folder containers registered and connects them without user action. */
	private _onDidDiscoverFolders(): void {
		const running = new Map<string, IDiscoveredDevContainerFolder>();
		for (const [key, folder] of this._folderDiscovery.folders) {
			if (folder.running) {
				running.set(key, folder);
			}
		}
		// A failed listing or a disconnected host doesn't show that a container stopped.
		const listedHosts = this._folderDiscovery.listedHosts;
		for (const [key, sourceAddress] of this._skippedFolders) {
			if (!running.has(key) && listedHosts.has(sourceAddress)) {
				this._skippedFolders.delete(key);
			}
		}
		for (const key of [...this._runningFolders.keys()]) {
			if (!running.has(key)) {
				this._runningFolders.delete(key);
				if (!this._isProviderInUse(key)) {
					this._removeProvider(key);
				}
			}
		}
		for (const [key, folder] of running) {
			this._runningFolders.set(key, folder);
			this._ensureProvider(folder.workspaceUri, this.getWorkspaceLabel(folder.workspaceUri));
			void this._connectRunningFolder(key, folder.workspaceUri);
		}
		this._updateFolderContainers();
	}

	/** Whether a folder's provider is stored, connecting, or has a connection that is referenced, has sessions, or whose container still runs. */
	private _isProviderInUse(key: string): boolean {
		const active = this._activeConnections.get(key);
		return this._storedConnections.has(key) || this._pendingConnections.has(key)
			|| !!active && (active.references > 0 || (active.state !== 'stopped' && active.state !== 'removed') || active.provider.getSessions().length > 0);
	}

	private _skipFolder(key: string, workspaceUri: URI): void {
		this._skippedFolders.set(key, this._runningFolders.get(key)?.sourceAddress ?? this._getSourceAddress(workspaceUri));
	}

	/** The address of the host that runs a folder's Dev Container, or {@link LocalDevContainerEnvironmentHost}. */
	private _getSourceAddress(workspaceUri: URI): string {
		if (workspaceUri.scheme === Schemas.file) {
			return LocalDevContainerEnvironmentHost;
		}
		const sourceEntry = getDevContainerSourceEntry(workspaceUri, this._remoteAgentHostService);
		return sourceEntry ? getEntryAddress(sourceEntry) : workspaceUri.authority;
	}

	private async _connectRunningFolder(key: string, workspaceUri: URI): Promise<void> {
		// Reconnecting a stopped connection is queued as a lifecycle operation, not a pending connection, so this also tracks its own.
		const shouldConnect = () => !this._store.isDisposed && isDevContainerDiscoveryEnabled(this._configurationService) && this._runningFolders.has(key) && !this._skippedFolders.has(key) && !this._pendingConnections.has(key)
			&& !this._isConnectedOrReconnecting(this._activeConnections.get(key)?.address ?? devContainerAddress(workspaceUri));
		if (this._autoConnectingFolders.has(key) || !shouldConnect()) {
			return;
		}
		this._autoConnectingFolders.add(key);
		try {
			// Unlike Connect, which asks for trust, connecting without user action requires the folder to be trusted already.
			const { trusted } = await this._workspaceTrustManagementService.getUriTrustInfo(workspaceUri);
			if (!trusted || !shouldConnect()) {
				return;
			}
			await this._ensureConnection(workspaceUri, this._lifecycleTokenSource.token, undefined, true);
		} catch (error) {
			// Even if a failed listing meanwhile left its running state unknown.
			if (!isCancellationError(error)) {
				this._skipFolder(key, workspaceUri);
				this._logService.info(`[DevContainerAgentHost] Did not connect to the running Dev Container of ${basename(workspaceUri)}`, error);
			}
		} finally {
			this._autoConnectingFolders.delete(key);
		}
	}

	/** Lists the containers of folders that run or whose providers have sessions, see {@link IDevContainerAgentHostService.folderContainers}. */
	private _updateFolderContainers(): void {
		const containers: IDevContainerFolderContainer[] = [];
		if (isDevContainerDiscoveryEnabled(this._configurationService)) {
			const folders = this._folderDiscovery.folders;
			const listedHosts = this._folderDiscovery.listedHosts;
			const workspaces = new Map([...this._runningFolders].map(([key, folder]) => [key, folder.workspaceUri]));
			for (const [key, stored] of this._storedConnections) {
				const workspaceUri = URI.parse(stored.workspaceUri);
				if (!findDevContainerSample(workspaceUri)) {
					workspaces.set(key, workspaceUri);
				}
			}
			for (const [key, workspaceUri] of workspaces) {
				const provider = this._providers.get(key);
				// One that doesn't run stays listed only while its provider has sessions.
				if (!provider || !this._runningFolders.has(key) && provider.getSessions().length === 0) {
					continue;
				}
				const sourceAddress = this._getSourceAddress(workspaceUri);
				containers.push({
					address: devContainerAddress(workspaceUri),
					providerId: provider.id,
					workspaceUri,
					sourceAddress,
					running: folders.get(key)?.running ?? (listedHosts.has(sourceAddress) ? false : undefined),
				});
			}
		}
		const previous = this._folderContainers.get();
		if (previous.length !== containers.length || containers.some((container, index) => !isEqualFolderContainer(container, previous[index]))) {
			this._folderContainers.set(containers, undefined);
		}
	}

	isAvailable(workspaceUri: URI): Promise<boolean> {
		return this._connector?.isAvailable(workspaceUri) ?? Promise.resolve(false);
	}

	getSandboxSupported(workspaceUri: URI): boolean | undefined {
		return this._knownSandboxSupport.get(getComparisonKey(workspaceUri));
	}

	getWorkspaceLabel(workspaceUri: URI): string {
		return devContainerWorkspaceLabel(workspaceUri, this._getWorkspaceHostLabel(workspaceUri));
	}

	private _setSandboxSupported(workspaceUri: URI, supported: boolean | undefined): void {
		const key = getComparisonKey(workspaceUri);
		const previous = this._knownSandboxSupport.get(key);
		if (supported === undefined) {
			this._knownSandboxSupport.delete(key);
		} else {
			this._knownSandboxSupport.set(key, supported);
		}
		this._connectionFactory.setSandboxSupported(workspaceUri, supported);
		const active = this._activeConnections.get(key);
		if (active) {
			active.sandboxSupported = supported;
		}
		this._providers.get(key)?.setDevContainerSandboxSupported(supported);
		if (previous !== supported) {
			this._onDidChangeAvailability.fire();
		}
	}

	async connect(workspaceUri: URI, token: CancellationToken, options?: { readonly sandboxEnabled?: boolean; readonly requireRunning?: boolean }): Promise<IDevContainerAgentHostTarget> {
		const key = getComparisonKey(workspaceUri);
		const active = this._activeConnections.get(key);
		const target = active && this._acquireConnection(key, active);
		try {
			const connected = await this._ensureConnection(workspaceUri, token, options?.sandboxEnabled, options?.requireRunning);
			return target ?? this._acquireConnection(key, connected);
		} catch (error) {
			await target?.release();
			throw error;
		}
	}

	async showLog(workspaceUri: URI): Promise<void> {
		const connector = this._connector ?? await this._waitForConnector(CancellationToken.None);
		await connector.showLog(workspaceUri);
	}

	private _ensureConnection(workspaceUri: URI, token: CancellationToken, sandboxEnabled?: boolean, requireRunning?: boolean): Promise<IActiveDevContainerAgentHost> {
		const key = getComparisonKey(workspaceUri);
		sandboxEnabled ??= this._storedConnections.get(key)?.sandboxEnabled;
		const active = this._activeConnections.get(key);
		if (active) {
			if (active.state === 'running' && this._isConnectedOrReconnecting(active.address)) {
				return this._waitForReconnection(active, token);
			}
			return raceCancellationError(this._ensureActiveConnection(key, active, sandboxEnabled, requireRunning), token).then(() => active);
		}
		const pending = this._pendingConnections.get(key);
		if (pending) {
			return raceCancellationError(pending.promise, token);
		}

		this._providers.get(key)?.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
		const tokenSource = new CancellationTokenSource(token);
		const promise = this._connectWhenReady(workspaceUri, key, tokenSource.token, sandboxEnabled, requireRunning);
		const pendingConnection = { promise, tokenSource };
		this._pendingConnections.set(key, pendingConnection);
		void promise.then(
			() => this._completePendingConnection(key, pendingConnection),
			() => this._completePendingConnection(key, pendingConnection),
		);
		return promise;
	}

	private async _waitForReconnection(active: IActiveDevContainerAgentHost, token: CancellationToken): Promise<IActiveDevContainerAgentHost> {
		const { connection, canceled } = await waitForState(
			observableFromEvent(this, Event.any(this._remoteAgentHostService.onDidChangeConnections, listener => token.onCancellationRequested(listener)), () => ({
				connection: this._remoteAgentHostService.connections.find(connection => connection.address === active.address),
				canceled: token.isCancellationRequested,
			})),
			({ connection, canceled }) => canceled || !connection || (!RemoteAgentHostConnectionStatus.isReconnecting(connection.status) && !RemoteAgentHostConnectionStatus.isConnecting(connection.status)),
		);
		if (canceled) {
			throw new CancellationError();
		}
		if (!connection || !RemoteAgentHostConnectionStatus.isConnected(connection.status)) {
			throw new Error(localize('devContainerAgentHost.reconnectionFailed', "The Dev Container Agent Host disconnected while reconnecting."));
		}
		return active;
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

	private async _connectWhenReady(
		workspaceUri: URI,
		key: string,
		token: CancellationToken,
		sandboxEnabled?: boolean,
		requireRunning?: boolean,
	): Promise<IActiveDevContainerAgentHost> {
		const connector = this._connector ?? await this._waitForConnector(token);
		return this._connect(connector, workspaceUri, key, token, sandboxEnabled, requireRunning);
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

	private async _connect(connector: IDevContainerAgentHostConnector, workspaceUri: URI, key: string, token: CancellationToken, sandboxEnabled?: boolean, requireRunning = false): Promise<IActiveDevContainerAgentHost> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const connected = await createDevContainerConnection(connector, workspaceUri, devContainerAddress(workspaceUri), token, { resume: true, ...(sandboxEnabled !== undefined ? { sandboxEnabled } : {}), ...(requireRunning ? { requireRunning } : {}) });
		if (token.isCancellationRequested) {
			connected.transportDisposable?.dispose();
			throw new CancellationError();
		}

		let stagedAddress: string | undefined;
		try {
			const provider = this._ensureProvider(workspaceUri, connected.name, connected.address);
			this._setSandboxSupported(workspaceUri, connected.sandboxSupported);

			const sourceEntry = getDevContainerSourceEntry(workspaceUri, this._remoteAgentHostService);
			const entry = this._connectionFactory.stageConnection(connector, workspaceUri, connected, sourceEntry && resolveRemoteAgentHostEntryAuthority(sourceEntry), sandboxEnabled, requireRunning);
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
				this._storeConnection(workspaceUri, connected.name, sandboxEnabled);
			}

			const target = { providerId: provider.id, workspaceUri: connected.workspaceUri };
			const active: IActiveDevContainerAgentHost = { address, provider, target, connector, workspaceUri, state: 'running', references: 0, sandboxEnabled, sandboxSupported: this.getSandboxSupported(workspaceUri) };
			this._activeConnections.set(key, active);
			this._onDidChangeAvailability.fire();
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
					if (active.connector.stopContainer) {
						return;
					}
					await this._disconnectActiveConnection(key, active);
					if (active.provider.getSessions().length === 0) {
						this._removeStoredConnection(key);
						this._removeProvider(key);
					}
				}
			},
		};
	}

	/** Names the container, and the source host for a remote source, in place of the container provider's label in its workspace labels. */
	private _workspaceHostLabel(workspaceUri: URI): IObservable<string> {
		return observableFromEvent(this, Event.any<unknown>(this._remoteAgentHostService.onDidChangeConfiguredEntries, this._remoteAgentHostService.onDidChangeDisplayName), () => this._getWorkspaceHostLabel(workspaceUri));
	}

	private _getWorkspaceHostLabel(workspaceUri: URI): string {
		const entry = getDevContainerSourceEntry(workspaceUri, this._remoteAgentHostService);
		if (!entry) {
			return localize('devContainerAgentHost.workspaceHost', "Dev Container");
		}
		const address = getEntryAddress(entry);
		const host = this._remoteAgentHostService.getDisplayNameOverride(address) ?? (entry.name || address);
		return localize('devContainerAgentHost.workspaceHostOnSource', "Dev Container on {0}", host);
	}

	private _ensureProvider(workspaceUri: URI, name: string, address = devContainerAddress(workspaceUri)): RemoteAgentHostSessionsProvider {
		const key = getComparisonKey(workspaceUri);
		const existing = this._providers.get(key);
		if (existing) {
			return existing;
		}

		const store = new DisposableStore();
		const connectOnDemand = async () => {
			this._skippedFolders.delete(key);
			// Running containers are listed before this window had a session in their folder, so it may not trust the folder yet.
			if (this._runningFolders.has(key) && !this._storedConnections.has(key) && !await this._workspaceTrustRequestService.requestResourcesTrust({
				uri: workspaceUri,
				message: localize('devContainerAgentHost.trustFolder', "An agent session will be able to read files, run commands, and make changes in this folder."),
			})) {
				throw new CancellationError();
			}
			await this._ensureConnection(workspaceUri, CancellationToken.None);
		};
		// Names the container like its workspaces, so groupings that show the environment, not the workspace, still say Dev Container.
		const workspaceHostLabel = this._workspaceHostLabel(workspaceUri);
		const providerLabel = (hostLabel: string) => devContainerWorkspaceLabel(workspaceUri, hostLabel);
		const provider = store.add(this._createProvider({
			address,
			name: providerLabel(workspaceHostLabel.get()),
			devContainerSourceWorkspaceUri: workspaceUri,
			// eslint-disable-next-line local/code-agent-host-uri-mapping -- keys the Dev Container worktree scope by the source host filesystem URI before connecting
			devContainerWorktreeScope: findDevContainerSample(workspaceUri) ? undefined : getComparisonKey(fromAgentHostUri(workspaceUri)),
			resolveDevContainerWorktreeConnection: workspaceUri.scheme === AGENT_HOST_SCHEME
				? () => resolveDevContainerSourceConnection(workspaceUri, this._remoteAgentHostService, this._sessionsProvidersService, CancellationToken.None)
				: undefined,
			workspaceHostLabel,
			devContainerLifecycle: {
				connect: connectOnDemand,
				stop: () => this._stopContainer(key),
				remove: () => this._removeContainer(key),
			},
			connectOnDemand,
			disconnectOnDemand: () => this.disconnect(workspaceUri),
			showConnectionLog: () => this.showLog(workspaceUri),
		}));
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
		store.add(runOnChange(workspaceHostLabel, hostLabel => provider.setLabel(providerLabel(hostLabel))));
		store.add(this._sessionsProvidersService.registerProvider(provider));
		store.add(provider.onDidChangeSessions(event => {
			if (event.added.length > 0) {
				// Keeps the name a connection stored, rather than the one a listed container's provider was created with.
				this._storeConnection(workspaceUri, this._storedConnections.get(key)?.name ?? name);
			}
			if (event.added.length > 0 || event.removed.length > 0) {
				this._updateFolderContainers();
			}
		}));
		store.add(toDisposable(() => {
			this._providers.delete(key);
			this._activeConnections.delete(key);
			this._onDidChangeAvailability.fire();
			this._updateFolderContainers();
		}));
		this._providers.set(key, provider);
		this._providerStores.set(key, store);
		this._updateFolderContainers();
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
		// Even while the container's state is unknown, for example after a failed listing.
		this._skipFolder(key, workspaceUri);
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

	private _stopContainer(key: string): Promise<boolean> {
		return this._lifecycleOperations.queue(key, async () => {
			const active = this._activeConnections.get(key);
			if (!active || active.state === 'stopped' || active.state === 'removed') {
				return true;
			}
			if (!active.connector.stopContainer) {
				return false;
			}
			active.state = 'stopping';
			try {
				const stopped = await active.connector.stopContainer(active.workspaceUri);
				if (!stopped) {
					active.state = 'running';
					return false;
				}
				await this._disconnectActiveTransport(active);
				active.state = 'stopped';
				this._didStopFolderContainer(key);
				if (active.references === 0 && active.provider.getSessions().length === 0) {
					this._removeStoredConnection(key);
					this._removeProvider(key);
				}
				return stopped;
			} catch (error) {
				await this._connectActive(active);
				throw error;
			}
		});
	}

	/**
	 * A folder's container that this window stopped or removed no longer runs: its provider isn't kept for listing it, and
	 * its row is listed again rather than as running until the next refresh.
	 */
	private _didStopFolderContainer(key: string): void {
		this._runningFolders.delete(key);
		if (isDevContainerDiscoveryEnabled(this._configurationService)) {
			void this._folderDiscovery.refresh();
		}
	}

	private _removeContainer(key: string): Promise<boolean> {
		return this._lifecycleOperations.queue(key, async () => {
			const active = this._activeConnections.get(key);
			if (!active || active.state === 'removed') {
				return true;
			}
			if (!active.connector.removeContainer) {
				return false;
			}
			active.state = 'removing';
			try {
				const removed = await active.connector.removeContainer(active.workspaceUri);
				if (!removed) {
					active.state = 'running';
					return false;
				}
				await this._disconnectActiveTransport(active);
				active.state = 'removed';
				this._didStopFolderContainer(key);
				active.sandboxSupported = undefined;
				this._knownSandboxSupport.delete(key);
				active.provider.setDevContainerSandboxSupported(undefined);
				this._onDidChangeAvailability.fire();
				return removed;
			} catch (error) {
				await this._connectActive(active);
				throw error;
			}
		});
	}

	private _ensureActiveConnection(key: string, active: IActiveDevContainerAgentHost, sandboxEnabled?: boolean, requireRunning?: boolean): Promise<void> {
		return this._lifecycleOperations.queue(key, async () => {
			if (this._isConnectedOrReconnecting(active.address)) {
				active.state = 'running';
				return;
			}
			await this._connectActive(active, active.state === 'removed' ? sandboxEnabled : undefined, requireRunning);
		});
	}

	private async _connectActive(active: IActiveDevContainerAgentHost, sandboxEnabled?: boolean, requireRunning = false): Promise<void> {
		const previousState = active.state;
		const requestedSandboxEnabled = sandboxEnabled ?? active.sandboxEnabled;
		// Disconnecting doesn't wait for this, so a connection that completes afterwards is dropped.
		const isCurrent = () => this._activeConnections.get(getComparisonKey(active.workspaceUri)) === active;
		active.state = 'connecting';
		try {
			const connected = await createDevContainerConnection(active.connector, active.workspaceUri, active.address, this._lifecycleTokenSource.token, { resume: true, ...(requestedSandboxEnabled !== undefined ? { sandboxEnabled: requestedSandboxEnabled } : {}), ...(requireRunning ? { requireRunning } : {}) });
			if (!isCurrent()) {
				connected.transportDisposable?.dispose();
				throw new CancellationError();
			}
			this._setSandboxSupported(active.workspaceUri, connected.sandboxSupported);
			const sourceEntry = getDevContainerSourceEntry(active.workspaceUri, this._remoteAgentHostService);
			this._connectionFactory.stageConnection(active.connector, active.workspaceUri, connected, sourceEntry && resolveRemoteAgentHostEntryAuthority(sourceEntry), requestedSandboxEnabled, requireRunning);
			this._remoteAgentHostService.reconnect(active.address, true);
			const connectionInfo = await this._remoteAgentHostService.waitForConnection(active.address);
			if (!isCurrent()) {
				throw new CancellationError();
			}
			const connection = this._remoteAgentHostService.getConnection(connectionInfo.address);
			if (!connection) {
				throw new Error(localize('devContainerAgentHost.connectionUnavailable', "Dev Container Agent Host connection was not available after connecting."));
			}
			active.provider.setConnection(connection, connected.defaultDirectory ?? connectionInfo.defaultDirectory);
			active.provider.setConnectionStatus(connectionInfo.status);
			active.sandboxEnabled = requestedSandboxEnabled;
			if (this._storedConnections.has(getComparisonKey(active.workspaceUri)) || active.provider.getSessions().length > 0) {
				this._storeConnection(active.workspaceUri, connected.name, requestedSandboxEnabled);
			}
			active.state = 'running';
			this._onDidChangeAvailability.fire();
		} catch (error) {
			// After disconnecting, the address may already have a replacement connection, which this must not tear down.
			if (isCurrent()) {
				this._connectionFactory.unstageConnection(active.address);
				await this._remoteAgentHostService.removeRemoteAgentHost(active.address);
			}
			active.state = previousState;
			throw error;
		}
	}

	private async _disconnectActiveTransport(active: IActiveDevContainerAgentHost): Promise<void> {
		this._connectionFactory.unstageConnection(active.address);
		active.provider.clearConnection();
		active.provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
		await this._remoteAgentHostService.removeRemoteAgentHost(active.address);
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
				if (active.state !== 'running') {
					active.provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
					continue;
				}
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
				const sandboxSupported = this._connectionFactory.getSandboxSupported(active.address);
				if (sandboxSupported !== active.sandboxSupported) {
					this._setSandboxSupported(active.workspaceUri, sandboxSupported);
				}
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
		this._updateFolderContainers();
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
				if ((uri.scheme !== Schemas.file && (uri.scheme !== AGENT_HOST_SCHEME || !uri.authority) && !findDevContainerSample(uri)) || candidate.name.length === 0) {
					continue;
				}
				result.set(getComparisonKey(uri), {
					workspaceUri: uri.toString(),
					name: candidate.name,
					...(candidate.sandboxEnabled !== undefined ? { sandboxEnabled: candidate.sandboxEnabled } : {}),
				});
			}
		} catch {
			return result;
		}
		return result;
	}

	private _storeConnection(workspaceUri: URI, name: string, sandboxEnabled?: boolean): void {
		const key = getComparisonKey(workspaceUri);
		const existing = this._storedConnections.get(key);
		const requestedSandboxEnabled = sandboxEnabled ?? this._activeConnections.get(key)?.sandboxEnabled ?? existing?.sandboxEnabled;
		const stored = { workspaceUri: workspaceUri.toString(), name, ...(requestedSandboxEnabled !== undefined ? { sandboxEnabled: requestedSandboxEnabled } : {}) };
		if (existing?.workspaceUri === stored.workspaceUri && existing.name === stored.name && existing.sandboxEnabled === stored.sandboxEnabled) {
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
		this._updateFolderContainers();
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
		// A running container stays listed, and keeps its provider, until it stops.
		if (!this._runningFolders.has(key)) {
			this._providerStores.deleteAndDispose(key);
		}
	}

	override dispose(): void {
		this._lifecycleTokenSource.cancel();
		for (const pending of this._pendingConnections.values()) {
			pending.tokenSource.cancel();
			pending.tokenSource.dispose();
		}
		this._pendingConnections.clear();
		super.dispose();
	}
}
