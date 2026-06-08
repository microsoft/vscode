/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { localize } from '../../../nls.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ISharedProcessService } from '../../ipc/electron-browser/services.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, type IRemoteAgentHostEntry } from '../common/remoteAgentHostService.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { AhpJsonlLogger } from '../common/ahpJsonlLogger.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../common/agentService.js';
import { WSLRelayTransport } from './wslRelayTransport.js';
import { RemoteAgentHostProtocolClient } from '../browser/remoteAgentHostProtocolClient.js';
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
} from '../common/wslRemoteAgentHost.js';

export const IWSLRelayClientFactory = createDecorator<IWSLRelayClientFactory>('wslRelayClientFactory');

export interface IWSLRelayClientFactory {
	readonly _serviceBrand: undefined;
	createClient(mainService: IWSLRemoteAgentHostMainService, connectionId: string, address: string): RemoteAgentHostProtocolClient;
}

export class WSLRelayClientFactory implements IWSLRelayClientFactory {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) { }

	createClient(mainService: IWSLRemoteAgentHostMainService, connectionId: string, address: string): RemoteAgentHostProtocolClient {
		const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
		const logger = ahpLoggingEnabled ? this._instantiationService.createInstance(
			AhpJsonlLogger,
			{ logsHome: this._environmentService.logsHome, connectionId, transport: 'wsl' },
		) : undefined;
		const transport = this._instantiationService.createInstance(WSLRelayTransport, connectionId, mainService, logger);
		return this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address, transport, undefined);
	}
}

/**
 * Storage key for the list of WSL distros the user has connected to. Lives
 * at application scope so it is shared across windows, mirroring the tunnel
 * service's cached-tunnels list.
 */
const CACHED_WSL_DISTROS_KEY = 'agentHost.wsl.cachedDistros';

/**
 * Renderer-side implementation of {@link IWSLRemoteAgentHostService} that
 * delegates the actual WSL work to the main process via IPC, then registers
 * the resulting connection with the renderer-local {@link IRemoteAgentHostService}.
 */
export class WSLRemoteAgentHostService extends Disposable implements IWSLRemoteAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _mainService: IWSLRemoteAgentHostMainService;

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

		this._register(this._mainService.onDidCloseConnection(connectionId => {
			this._logService.info(`[WSLRemoteAgentHost] onDidCloseConnection: connectionId=${connectionId}`);
			const handle = this._connections.get(connectionId);
			if (handle) {
				this._connections.delete(connectionId);
				handle.fireClose();
				handle.dispose();
				this._onDidChangeConnections.fire();

				// Defense-in-depth: also signal the protocol client directly.
				// The WSLRelayTransport normally observes `onDidRelayClose`
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

		const augmentedConfig = this._augmentConfig(config);
		this._logService.info(`[WSLRemoteAgentHost] Connecting to distro ${config.distro}`);
		const result = await this._mainService.connect(augmentedConfig);
		this._logService.trace(`[WSLRemoteAgentHost] WSL relay established, connectionId=${result.connectionId}`);
		return this._setupConnection(result);
	}

	async disconnect(distro: string): Promise<void> {
		this._removeCachedDistro(distro);
		await this._mainService.disconnect(distro);
	}

	async reconnect(distro: string, name: string): Promise<IWSLAgentHostConnection> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const commandOverride = this._getRemoteAgentHostCommand();
		this._logService.info(`[WSLRemoteAgentHost] Reconnecting to distro ${distro}`);
		const result = await this._mainService.reconnect(distro, name, commandOverride);
		return this._setupConnection(result);
	}

	/**
	 * Build the renderer-side handle, do the protocol handshake, and register
	 * with IRemoteAgentHostService. Any failure after the shared-process tunnel
	 * was established tears it back down so we don't leak it.
	 */
	private async _setupConnection(result: IWSLConnectResult): Promise<IWSLAgentHostConnection> {
		const existing = this._connections.get(result.connectionId);
		if (existing) {
			if (this._remoteAgentHostService.getConnection(result.address)) {
				this._logService.trace(`[WSLRemoteAgentHost] Returning existing connection handle for ${result.address}, connectionId=${result.connectionId}`);
				return existing;
			}
			this._logService.info(`[WSLRemoteAgentHost] Replacing stale connection handle for ${result.address}, connectionId=${result.connectionId}`);
			this._connections.delete(result.connectionId);
			existing.fireClose();
			existing.dispose();
			this._onDidChangeConnections.fire();
		}

		let protocolClient: RemoteAgentHostProtocolClient | undefined;
		let handle: WSLAgentHostConnectionHandle | undefined;
		let registeredHandle = false;
		try {
			this._onDidReportLocalConnectProgress.fire({
				connectionKey: result.address,
				message: localize('wslProgressHandshake', "Establishing connection to {0}...", result.name),
			});
			protocolClient = this._relayClientFactory.createClient(this._mainService, result.connectionId, result.address);
			await protocolClient.connect();
			this._logService.trace('[WSLRemoteAgentHost] Protocol handshake completed');

			this._onDidReportLocalConnectProgress.fire({
				connectionKey: result.address,
				message: localize('wslProgressFinalizing', "Provisioning agent host in {0}...", result.name),
			});

			handle = new WSLAgentHostConnectionHandle(
				result.distro,
				result.address,
				result.name,
				() => this._mainService.disconnect(result.distro),
			);

			this._connections.set(result.connectionId, handle);
			registeredHandle = true;
			this._onDidChangeConnections.fire();

			const entry: IRemoteAgentHostEntry = {
				name: result.name,
				connectionToken: result.connectionToken,
				connection: {
					type: RemoteAgentHostEntryType.WSL,
					address: result.address,
					distro: result.distro,
				},
			};

			this._cacheDistro(result.distro, result.name);

			await this._remoteAgentHostService.addManagedConnection(entry, protocolClient, this._createTransportDisposable(result.connectionId, result.distro, handle));

			return handle;
		} catch (err) {
			this._logService.error('[WSLRemoteAgentHost] Connection setup failed', err);
			if (registeredHandle && this._connections.get(result.connectionId) === handle) {
				this._connections.delete(result.connectionId);
				this._onDidChangeConnections.fire();
			}
			handle?.dispose();
			protocolClient?.dispose();
			this._mainService.disconnect(result.distro).catch(() => { /* best effort */ });
			throw err;
		}
	}

	getCachedDistros(): readonly IWSLCachedDistro[] {
		const raw = this._storageService.get(CACHED_WSL_DISTROS_KEY, StorageScope.APPLICATION);
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

	private _cacheDistro(distro: string, name: string): void {
		const cached = this.getCachedDistros().filter(d => d.distro !== distro);
		this._storeCachedDistros([{ distro, name }, ...cached]);
	}

	private _removeCachedDistro(distro: string): void {
		const cached = this.getCachedDistros();
		const filtered = cached.filter(d => d.distro !== distro);
		if (filtered.length !== cached.length) {
			this._storeCachedDistros(filtered);
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
			this._storeCachedDistros(filtered);
		}
	}

	private _storeCachedDistros(distros: readonly IWSLCachedDistro[]): void {
		if (distros.length === 0) {
			this._storageService.remove(CACHED_WSL_DISTROS_KEY, StorageScope.APPLICATION);
		} else {
			this._storageService.store(CACHED_WSL_DISTROS_KEY, JSON.stringify(distros), StorageScope.APPLICATION, StorageTarget.USER);
		}
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
