/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { localize } from '../../../nls.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent } from '../../../base/common/observable.js';
import { ILogService } from '../../log/common/log.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ISharedProcessService } from '../../ipc/electron-browser/services.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, getEntryAddress, type IRemoteAgentHostConnectOptions, type IRemoteAgentHostConnectionFactory, type IRemoteAgentHostCreatedConnection, type IRemoteAgentHostEntry } from '../common/remoteAgentHostService.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { AhpJsonlLogger } from '../common/ahpJsonlLogger.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../common/agentService.js';
import { AgentHostClientConnectionKind } from '../common/agentHostTelemetry.js';
import { ReconnectingRelayTransport } from '../common/relayTransport.js';
import { AgentHostTransportFailureReason, NonReconnectableTransportError } from '../common/state/sessionTransport.js';
import { AgentHostProtocolClient } from '../browser/agentHostProtocolClient.js';
import { agentsWindowAgentHostClientInfo } from '../common/agentHostClientInfo.js';
import {
	IWSLRemoteAgentHostService,
	WSL_REMOTE_AGENT_HOST_CHANNEL,
	type IWSLAgentHostConfig,
	type IWSLAgentHostConnection,
	type IWSLCachedDistro,
	type IWSLConnectProgress,
	type IWSLConnectResult,
	type IWSLDistro,
	type IWSLRemoteAgentHostMainService,
	WSL_ADDRESS_PREFIX,
} from '../common/wslRemoteAgentHost.js';

export const IWSLRelayClientFactory = createDecorator<IWSLRelayClientFactory>('wslRelayClientFactory');

export interface IWSLRelayClientFactory {
	readonly _serviceBrand: undefined;
	createClient(mainService: IWSLRemoteAgentHostMainService, connectionId: string, address: string, connection: IWSLConnectResult, remoteAgentHostCommand: string | undefined): AgentHostProtocolClient;
}

export class WSLRelayClientFactory implements IWSLRelayClientFactory {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) { }

	createClient(mainService: IWSLRemoteAgentHostMainService, connectionId: string, address: string, connection: IWSLConnectResult, remoteAgentHostCommand: string | undefined): AgentHostProtocolClient {
		const config: IWSLAgentHostConfig = {
			distro: connection.distro,
			name: connection.name,
			remoteAgentHostCommand,
		};
		let seedConnection = true;
		const establish = async () => {
			// WSL disconnect is distro-scoped, so handles own no teardown; reconnect supersedes stale channels.
			if (seedConnection) {
				// The caller owns teardown of the channel established before the protocol client was created.
				seedConnection = false;
				return { connectionId };
			}

			try {
				const runningDistros = await mainService.listRunningDistros().catch((): string[] => []);
				if (!runningDistros.includes(config.distro)) {
					throw new NonReconnectableTransportError(`WSL distro '${config.distro}' is not running.`, AgentHostTransportFailureReason.HostNotRunning);
				}
				const result = await mainService.reconnect(config.distro, config.name, config.remoteAgentHostCommand, false);
				return {
					connectionId: result.connectionId,
				};
			} catch (error) {
				const [isWSLAvailable, distros] = await Promise.all([
					mainService.isWSLAvailable().catch(() => true),
					mainService.listDistros().catch(() => []),
				]);
				if (!isWSLAvailable || (distros.length > 0 && !distros.some(distro => distro.name === config.distro))) {
					throw new NonReconnectableTransportError(error instanceof Error ? error.message : String(error));
				}
				throw error;
			}
		};
		const transportFactory = () => {
			const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
			const createLogger = () => ahpLoggingEnabled ? this._instantiationService.createInstance(
				AhpJsonlLogger,
				{ logsHome: this._environmentService.logsHome, connectionId, transport: 'wsl' },
			) : undefined;
			return this._instantiationService.createInstance(
				ReconnectingRelayTransport,
				establish,
				mainService,
				createLogger,
				this._logService,
				'[WSLRelayTransport]',
				AgentHostClientConnectionKind.WSL,
			);
		};
		return this._instantiationService.createInstance(AgentHostProtocolClient, address, transportFactory, { clientInfo: agentsWindowAgentHostClientInfo });
	}
}

/**
 * Storage key for the list of WSL distros the user has connected to. Lives
 * at application scope so it is shared across windows, mirroring the tunnel
 * service's cached-tunnels list.
 */
const CACHED_WSL_DISTROS_KEY = 'agentHost.wsl.cachedDistros';

function readCachedWSLDistros(storageService: IStorageService): readonly IWSLCachedDistro[] {
	const raw = storageService.get(CACHED_WSL_DISTROS_KEY, StorageScope.APPLICATION);
	if (!raw) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter((item): item is IWSLCachedDistro =>
			!!item && typeof item.distro === 'string' && typeof item.name === 'string');
	} catch {
		return [];
	}
}

function storeCachedWSLDistros(storageService: IStorageService, distros: readonly IWSLCachedDistro[]): void {
	if (distros.length === 0) {
		storageService.remove(CACHED_WSL_DISTROS_KEY, StorageScope.APPLICATION);
	} else {
		storageService.store(CACHED_WSL_DISTROS_KEY, JSON.stringify(distros), StorageScope.APPLICATION, StorageTarget.USER);
	}
}

/** Creates WSL relay clients for {@link WSLRemoteAgentHostService}. */
class WSLConnectionFactory extends Disposable implements IRemoteAgentHostConnectionFactory {
	readonly kind = RemoteAgentHostEntryType.WSL;
	readonly entries: IObservable<readonly IRemoteAgentHostEntry[]>;

	private readonly _stagedConfigurations = new Map<string, { readonly config: IWSLAgentHostConfig; readonly isInitialConnection: boolean }>();

	constructor(
		private readonly _storageService: IStorageService,
		private readonly _mainService: IWSLRemoteAgentHostMainService,
		private readonly _remoteAgentHostService: IRemoteAgentHostService,
		private readonly _relayClientFactory: IWSLRelayClientFactory,
		private readonly _connections: Map<string, WSLAgentHostConnectionHandle>,
		private readonly _onDidChangeConnections: () => void,
		private readonly _onDidReportConnectProgress: (progress: IWSLConnectProgress) => void,
		private readonly _getRemoteAgentHostCommand: () => string | undefined,
		private readonly _createTransportDisposable: (connectionId: string, distro: string, handle: WSLAgentHostConnectionHandle) => IDisposable,
		private readonly _logService: ILogService,
	) {
		super();
		this.entries = observableFromEvent(
			this,
			this._storageService.onDidChangeValue(StorageScope.APPLICATION, CACHED_WSL_DISTROS_KEY, this._store),
			() => this._getEntries(),
		);
	}

	stageConfiguration(config: IWSLAgentHostConfig): IRemoteAgentHostEntry {
		const entry = this._createEntry(config.distro, config.name);
		this._stagedConfigurations.set(getEntryAddress(entry), { config, isInitialConnection: true });
		this._storeEntry(entry);
		return entry;
	}

	stageEntry(distro: string, name: string, userInitiated = true): IRemoteAgentHostEntry {
		const entry = this._createEntry(distro, name);
		this._stagedConfigurations.set(getEntryAddress(entry), {
			config: { distro, name, remoteAgentHostCommand: this._getRemoteAgentHostCommand(), userInitiated },
			isInitialConnection: false,
		});
		this._storeEntry(entry);
		return entry;
	}

	async createConnection(entry: IRemoteAgentHostEntry, options: IRemoteAgentHostConnectOptions): Promise<IRemoteAgentHostCreatedConnection> {
		if (entry.connection.type !== RemoteAgentHostEntryType.WSL) {
			throw new Error(`WSL factory cannot create a ${entry.connection.type} connection.`);
		}

		const address = getEntryAddress(entry);
		let stagedConnection = this._stagedConfigurations.get(address);
		this._stagedConfigurations.delete(address);
		let config = stagedConnection?.config ?? {
			distro: entry.connection.distro,
			name: entry.name,
			remoteAgentHostCommand: this._getRemoteAgentHostCommand(),
		};
		let userInitiated = config.userInitiated ?? options.userInitiated;
		if (!userInitiated) {
			try {
				await this._ensureDistroIsRunning(config.distro);
			} catch (err) {
				const userStagedConnection = this._stagedConfigurations.get(address);
				if (!userStagedConnection) {
					throw err;
				}
				this._stagedConfigurations.delete(address);
				stagedConnection = userStagedConnection;
				config = stagedConnection.config;
				userInitiated = config.userInitiated ?? options.userInitiated;
			}
			// A user action may have arrived while the background precondition ran.
			const userStagedConnection = this._stagedConfigurations.get(address);
			if (userStagedConnection) {
				this._stagedConfigurations.delete(address);
				stagedConnection = userStagedConnection;
				config = stagedConnection.config;
				userInitiated = config.userInitiated ?? options.userInitiated;
			}
		}

		const result = stagedConnection?.isInitialConnection
			? await this._mainService.connect({ ...config, userInitiated })
			: await this._mainService.reconnect(config.distro, config.name, config.remoteAgentHostCommand, userInitiated);
		this._logService.trace(`[WSLRemoteAgentHost] WSL relay established, connectionId=${result.connectionId}`);
		return this._setupConnection(result, config.remoteAgentHostCommand);
	}

	private _createEntry(distro: string, name: string): IRemoteAgentHostEntry {
		return {
			name,
			connection: {
				type: RemoteAgentHostEntryType.WSL,
				address: `${WSL_ADDRESS_PREFIX}${distro}`,
				distro,
			},
		};
	}

	private _storeEntry(entry: IRemoteAgentHostEntry): void {
		if (entry.connection.type !== RemoteAgentHostEntryType.WSL) {
			return;
		}
		// Bind the narrowed connection before the closure: TypeScript does not
		// carry the discriminant narrowing into the filter callback below.
		const connection = entry.connection;
		const cached = readCachedWSLDistros(this._storageService).filter(distro => distro.distro !== connection.distro);
		storeCachedWSLDistros(this._storageService, [{ distro: connection.distro, name: entry.name }, ...cached]);
	}

	private _getEntries(): readonly IRemoteAgentHostEntry[] {
		return readCachedWSLDistros(this._storageService).map(({ distro, name }) => ({
			name,
			connection: {
				type: RemoteAgentHostEntryType.WSL,
				address: `${WSL_ADDRESS_PREFIX}${distro}`,
				distro,
			},
		}));
	}

	private async _ensureDistroIsRunning(distro: string): Promise<void> {
		const runningDistros = await this._mainService.listRunningDistros();
		if (!runningDistros.includes(distro)) {
			throw new NonReconnectableTransportError(`WSL distro '${distro}' is not running.`, AgentHostTransportFailureReason.HostNotRunning);
		}
	}

	private _setupConnection(result: IWSLConnectResult, remoteAgentHostCommand: string | undefined): IRemoteAgentHostCreatedConnection {
		const existing = this._connections.get(result.connectionId);
		if (existing) {
			if (this._remoteAgentHostService.getConnection(result.address)) {
				this._logService.trace(`[WSLRemoteAgentHost] Returning existing connection handle for ${result.address}, connectionId=${result.connectionId}`);
				return this._createConnection(result, remoteAgentHostCommand, existing);
			}
			this._logService.info(`[WSLRemoteAgentHost] Replacing stale connection handle for ${result.address}, connectionId=${result.connectionId}`);
			this._connections.delete(result.connectionId);
			existing.fireClose();
			existing.dispose();
			this._onDidChangeConnections();
		}

		const handle = new WSLAgentHostConnectionHandle(
			result.distro,
			result.address,
			result.name,
			() => this._mainService.disconnect(result.distro),
		);
		try {
			this._connections.set(result.connectionId, handle);
			this._onDidChangeConnections();
			return this._createConnection(result, remoteAgentHostCommand, handle);
		} catch (err) {
			if (this._connections.get(result.connectionId) === handle) {
				this._connections.delete(result.connectionId);
				this._onDidChangeConnections();
			}
			handle.dispose();
			this._mainService.disconnect(result.distro).catch(() => { /* best effort */ });
			throw err;
		}
	}

	private _createConnection(result: IWSLConnectResult, remoteAgentHostCommand: string | undefined, handle: WSLAgentHostConnectionHandle): IRemoteAgentHostCreatedConnection {
		this._onDidReportConnectProgress({
			connectionKey: result.address,
			message: localize('wslProgressHandshake', "Establishing connection to {0}...", result.name),
		});
		const completionObserver = this._observeSuccessfulConnection(result);
		const transportDisposable = this._createTransportDisposable(result.connectionId, result.distro, handle);
		try {
			return {
				connection: this._relayClientFactory.createClient(this._mainService, result.connectionId, result.address, result, remoteAgentHostCommand),
				transportDisposable: toDisposable(() => {
					completionObserver.dispose();
					transportDisposable.dispose();
				}),
				reconnectTransfersTransportOwnership: true,
			};
		} catch (err) {
			completionObserver.dispose();
			transportDisposable.dispose();
			throw err;
		}
	}

	private _observeSuccessfulConnection(result: IWSLConnectResult): IDisposable {
		const listener = this._remoteAgentHostService.onDidChangeConnections(() => {
			const status = this._remoteAgentHostService.connections.find(connection => connection.address === result.address)?.status;
			if (RemoteAgentHostConnectionStatus.isConnected(status)) {
				listener?.dispose();
				this._onDidReportConnectProgress({
					connectionKey: result.address,
					message: localize('wslProgressFinalizing', "Provisioning agent host in {0}...", result.name),
				});
			} else if (!status || RemoteAgentHostConnectionStatus.isIncompatible(status)) {
				listener?.dispose();
			}
		});
		return listener;
	}
}

/**
 * Renderer-side implementation of {@link IWSLRemoteAgentHostService} that
 * delegates the actual WSL work to the main process via IPC, then registers
 * a WSL connection factory with the renderer-local {@link IRemoteAgentHostService}.
 */
export class WSLRemoteAgentHostService extends Disposable implements IWSLRemoteAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _mainService: IWSLRemoteAgentHostMainService;
	private readonly _connectionFactory: WSLConnectionFactory;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections: Event<void> = this._onDidChangeConnections.event;

	private readonly _onDidReportLocalConnectProgress = this._register(new Emitter<IWSLConnectProgress>());
	readonly onDidReportConnectProgress: Event<IWSLConnectProgress>;

	private readonly _connections = new Map<string, WSLAgentHostConnectionHandle>();

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWSLRelayClientFactory private readonly _relayClientFactory: IWSLRelayClientFactory,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._mainService = ProxyChannel.toService<IWSLRemoteAgentHostMainService>(
			sharedProcessService.getChannel(WSL_REMOTE_AGENT_HOST_CHANNEL),
		);

		this.onDidReportConnectProgress = Event.any(this._mainService.onDidReportConnectProgress, this._onDidReportLocalConnectProgress.event);
		this._connectionFactory = this._register(new WSLConnectionFactory(
			this._storageService,
			this._mainService,
			this._remoteAgentHostService,
			this._relayClientFactory,
			this._connections,
			() => this._onDidChangeConnections.fire(),
			progress => this._onDidReportLocalConnectProgress.fire(progress),
			() => this._getRemoteAgentHostCommand(),
			(connectionId, distro, handle) => this._createTransportDisposable(connectionId, distro, handle),
			this._logService,
		));
		this._register(this._remoteAgentHostService.registerConnectionFactory(this._connectionFactory));

		this._register(this._mainService.onDidCloseConnection(connectionId => {
			this._logService.info(`[WSLRemoteAgentHost] onDidCloseConnection: connectionId=${connectionId}`);
			const handle = this._connections.get(connectionId);
			if (handle) {
				this._connections.delete(connectionId);
				handle.fireClose();
				handle.dispose();
				this._onDidChangeConnections.fire();

				// Defense-in-depth: also signal the protocol client directly.
				// ReconnectingRelayTransport normally observes `onDidRelayClose`
				// (fired from the same shared-process code path as this
				// event) and calls back into the client. If that IPC
				// delivery is missed for any reason, the renderer-side
				// client would stay in `Connected` until its liveness
				// watchdog fires — which can take hours when the renderer
				// is backgrounded and Chromium throttles `setTimeout`.
				this._remoteAgentHostService.notifyConnectionClosed(handle.localAddress);
			}
		}));
	}

	get connections(): readonly IWSLAgentHostConnection[] {
		return [...this._connections.values()];
	}

	async isWSLAvailable(): Promise<boolean> {
		return this._mainService.isWSLAvailable();
	}

	async listDistros(): Promise<IWSLDistro[]> {
		const distros = await this._mainService.listDistros();
		this._evictMissingCachedDistros(distros);
		return distros;
	}

	async listRunningDistros(): Promise<string[]> {
		return this._mainService.listRunningDistros();
	}

	async connect(config: IWSLAgentHostConfig): Promise<IWSLAgentHostConnection> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const entry = this._connectionFactory.stageConfiguration(this._augmentConfig({ ...config, userInitiated: config.userInitiated ?? true }));
		const address = getEntryAddress(entry);
		this._logService.info(`[WSLRemoteAgentHost] Connecting to distro ${config.distro}`);
		this._remoteAgentHostService.reconnect(address, true);
		await this._remoteAgentHostService.waitForConnection(address);
		return this._getConnectionHandle(address);
	}

	async disconnect(distro: string): Promise<void> {
		this._removeCachedDistro(distro);
		await this._mainService.disconnect(distro);
	}

	async reconnect(distro: string, name: string, userInitiated = true): Promise<IWSLAgentHostConnection> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const entry = this._connectionFactory.stageEntry(distro, name, userInitiated);
		const address = getEntryAddress(entry);
		this._logService.info(`[WSLRemoteAgentHost] Reconnecting to distro ${distro}`);
		this._remoteAgentHostService.reconnect(address, userInitiated);
		await this._remoteAgentHostService.waitForConnection(address);
		return this._getConnectionHandle(address);
	}

	getCachedDistros(): readonly IWSLCachedDistro[] {
		return readCachedWSLDistros(this._storageService);
	}

	private _removeCachedDistro(distro: string): void {
		const cached = this.getCachedDistros();
		const filtered = cached.filter(d => d.distro !== distro);
		if (filtered.length !== cached.length) {
			storeCachedWSLDistros(this._storageService, filtered);
		}
	}

	/**
	 * Drop cached distros that no longer exist (e.g. uninstalled). We only
	 * prune when we actually observed some distros, so a transient probe
	 * failure (which surfaces as an empty list) never wipes the cache.
	 */
	private _evictMissingCachedDistros(distros: readonly IWSLDistro[]): void {
		if (distros.length === 0) {
			return;
		}
		const existing = new Set(distros.map(d => d.name));
		const cached = this.getCachedDistros();
		const filtered = cached.filter(d => existing.has(d.distro));
		if (filtered.length !== cached.length) {
			storeCachedWSLDistros(this._storageService, filtered);
		}
	}

	private _getConnectionHandle(address: string): WSLAgentHostConnectionHandle {
		const handle = [...this._connections.values()].find(candidate => candidate.localAddress === address);
		if (!handle) {
			throw new Error(`WSL connection handle not found for ${address}.`);
		}
		return handle;
	}

	/**
	 * Disposable owned by {@link IRemoteAgentHostService} for the lifetime of
	 * the entry. When the entry is removed (either by the user or by config
	 * reconciliation), this tears down the renderer-side handle and the
	 * shared-process WSL relay together so neither is leaked.
	 */
	private _createTransportDisposable(connectionId: string, distro: string, handle: WSLAgentHostConnectionHandle): IDisposable {
		return toDisposable(() => {
			if (this._connections.get(connectionId) === handle) {
				this._connections.delete(connectionId);
				this._onDidChangeConnections.fire();
			}
			handle.fireClose();
			handle.dispose();
			this._mainService.disconnect(distro).catch(() => { /* best effort */ });
		});
	}

	private _augmentConfig(config: IWSLAgentHostConfig): IWSLAgentHostConfig {
		const commandOverride = this._getRemoteAgentHostCommand();
		if (commandOverride) {
			return { ...config, remoteAgentHostCommand: commandOverride };
		}
		return config;
	}

	private _getRemoteAgentHostCommand(): string | undefined {
		return this._configurationService.getValue<string>('chat.wslRemoteAgentHostCommand') || undefined;
	}
}

/**
 * Lightweight renderer-side handle that represents a WSL-relayed
 * connection managed by the main process.
 */
class WSLAgentHostConnectionHandle extends Disposable implements IWSLAgentHostConnection {
	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private _closedByMain = false;

	constructor(
		readonly distro: string,
		readonly localAddress: string,
		readonly name: string,
		disconnectFn: () => Promise<void>,
	) {
		super();

		this._register(toDisposable(() => {
			if (!this._closedByMain) {
				disconnectFn().catch(() => { /* best effort */ });
			}
		}));
	}

	/** Called by the service when the main process signals connection closure. */
	fireClose(): void {
		this._closedByMain = true;
		this._onDidClose.fire();
	}
}
