/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { ReconnectingTransport, type IEstablishedTransport } from '../../../../../platform/agentHost/common/reconnectingTransport.js';
import { NonReconnectableTransportError, type IProtocolTransport } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import { RemoteAgentHostEntryType, IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId, getEntryAddress, type IRemoteAgentHostConnectOptions, type IRemoteAgentHostConnectionFactory, type IRemoteAgentHostCreatedConnection, type IRemoteAgentHostEntry } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { ProtocolMessage, AhpServerNotification, JsonRpcResponse } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from '../../../../../platform/agentHost/common/transportConstants.js';
import {
	ITunnelAgentHostService,
	TUNNEL_ADDRESS_PREFIX,
	TUNNEL_MIN_PROTOCOL_VERSION,
	TunnelTags,
	isTunnelNotFoundError,
	type ICachedTunnel,
	type ITunnelInfo,
	type TunnelAutoConnectMode,
} from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import type { IDiscoveredTunnel, ITunnelConnection, ITunnelDiscoveryProvider } from '../../../../../workbench/browser/web.api.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/browser/environmentService.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { TunnelAgentHostStorage } from './tunnelAgentHostStorage.js';

const LOG_PREFIX = '[WebTunnelAgentHost]';

class WebTunnelConnectionFactory extends Disposable implements IRemoteAgentHostConnectionFactory {
	readonly kind = RemoteAgentHostEntryType.Tunnel;
	readonly entries: IObservable<readonly IRemoteAgentHostEntry[]>;

	private readonly _onDidStageTunnel = this._register(new Emitter<void>());
	private readonly _stagedAuthProviders = new Map<string, 'github' | 'microsoft' | undefined>();
	/**
	 * Initiation mode for a staged tunnel, consumed by the first
	 * {@link createConnection} for that address. Staging publishes the entry
	 * synchronously, so the service's reconciliation can begin dialing before
	 * the caller's explicit `reconnect` runs, and that dial would otherwise be
	 * reported as background. The embedder's discovery provider owns
	 * interaction today, so this only keeps the three tunnel factories
	 * behaving identically.
	 */
	private readonly _stagedUserInitiated = new Map<string, boolean>();
	private readonly _onDidStageTunnelSignal = observableSignalFromEvent(this, this._onDidStageTunnel.event);

	constructor(
		private readonly _storage: TunnelAgentHostStorage,
		private readonly _createConnection: (entry: IRemoteAgentHostEntry, options: IRemoteAgentHostConnectOptions) => Promise<IRemoteAgentHostCreatedConnection>,
	) {
		super();
		this.entries = derived(this, reader => {
			this._onDidStageTunnelSignal.read(reader);
			const autoConnectSuppressedTunnels = this._storage.autoConnectSuppressedTunnels.read(reader);
			return this._storage.cachedTunnels.read(reader)
				.filter(tunnel => !autoConnectSuppressedTunnels.includes(tunnel.tunnelId))
				.map(tunnel => this._entryForTunnel(tunnel, tunnel.authProvider));
		});
	}

	stageTunnel(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft', userInitiated = true): IRemoteAgentHostEntry {
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
		this._stagedAuthProviders.set(address, authProvider);
		this._stagedUserInitiated.set(address, userInitiated);
		this._storage.cacheTunnel({ tunnelId: tunnel.tunnelId, clusterId: tunnel.clusterId, name: tunnel.name, protocolVersion: tunnel.protocolVersion, authProvider });
		this._onDidStageTunnel.fire();
		return this._entryForTunnel(tunnel, authProvider);
	}

	unstageTunnel(address: string): void {
		this._stagedUserInitiated.delete(address);
		if (this._stagedAuthProviders.delete(address)) {
			this._onDidStageTunnel.fire();
		}
	}

	createConnection(entry: IRemoteAgentHostEntry, options: IRemoteAgentHostConnectOptions): Promise<IRemoteAgentHostCreatedConnection> {
		if (entry.connection.type !== RemoteAgentHostEntryType.Tunnel) {
			throw new Error(`Tunnel factory cannot create a ${entry.connection.type} connection.`);
		}
		const address = getEntryAddress(entry);
		const stagedUserInitiated = this._stagedUserInitiated.get(address);
		// Consume it: only the connect this staging was for is user-initiated,
		// and a later automatic reconnect must not prompt.
		this._stagedUserInitiated.delete(address);
		const connectOptions = stagedUserInitiated === undefined
			? options
			: { ...options, userInitiated: stagedUserInitiated };
		return this._createConnection(entry, connectOptions);
	}

	private _entryForTunnel(tunnel: Pick<ITunnelInfo, 'tunnelId' | 'clusterId' | 'name'>, authProvider?: 'github' | 'microsoft'): IRemoteAgentHostEntry {
		return {
			name: tunnel.name,
			connection: {
				type: RemoteAgentHostEntryType.Tunnel,
				tunnelId: tunnel.tunnelId,
				clusterId: tunnel.clusterId,
				label: tunnel.name,
				authProvider,
			},
		};
	}
}

/**
 * Web (browser) implementation of {@link ITunnelAgentHostService}.
 *
 * Delegates to the embedder's {@link ITunnelDiscoveryProvider} (provided via
 * `IWorkbenchConstructionOptions.tunnelDiscoveryProvider`) for:
 * - **Discovery**: listing available agent host tunnels
 * - **Relay address**: obtaining the WebSocket proxy URL for connecting
 *
 * This decouples VS Code core from any specific embedder (vscode.dev,
 * github.dev, etc.). The embedder handles the actual Dev Tunnels API
 * calls and relay proxying.
 */
export class WebTunnelAgentHostService extends Disposable implements ITunnelAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _storage: TunnelAgentHostStorage;
	private readonly _connectionFactory: WebTunnelConnectionFactory;
	readonly onDidChangeTunnels: Event<void>;

	private readonly _discoveryProvider: ITunnelDiscoveryProvider | undefined;

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._storage = this._register(new TunnelAgentHostStorage(this._storageService));
		this.onDidChangeTunnels = this._storage.onDidChangeTunnels;
		this._discoveryProvider = environmentService.options?.tunnelDiscoveryProvider;
		this._connectionFactory = this._register(new WebTunnelConnectionFactory(
			this._storage,
			(entry, options) => this._createConnection(entry, options),
		));
		this._register(this._remoteAgentHostService.registerConnectionFactory(this._connectionFactory));
		if (!this._discoveryProvider) {
			this._logService.debug(`${LOG_PREFIX} No tunnelDiscoveryProvider — tunnel discovery disabled`);
		}
	}

	// Discovery

	async listTunnels(options?: { silent?: boolean }): Promise<ITunnelInfo[]> {
		if (!this._discoveryProvider) {
			return [];
		}

		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			return [];
		}

		try {
			// The embedder acquires tokens internally via its own auth flow
			const discovered = await this._discoveryProvider.listTunnels();
			const results: ITunnelInfo[] = [];
			let droppedByProtocolVersion = 0;
			let withoutIds = 0;

			for (const tunnel of discovered) {
				const info = this._toTunnelInfo(tunnel);
				if (!info) {
					withoutIds++;
					continue;
				}
				if (info.protocolVersion < TUNNEL_MIN_PROTOCOL_VERSION) {
					droppedByProtocolVersion++;
					this._logService.debug(
						`${LOG_PREFIX} Dropping tunnel ${info.tunnelId} (protocolVersion=${info.protocolVersion} < ${TUNNEL_MIN_PROTOCOL_VERSION})`
					);
					continue;
				}
				results.push(info);
			}

			const withActiveHost = results.filter(t => t.hostConnectionCount > 0).length;
			this._logService.info(
				`${LOG_PREFIX} Discovery complete: total=${discovered.length}, accepted=${results.length}, withActiveHost=${withActiveHost}, droppedByProtocolVersion=${droppedByProtocolVersion}, droppedMissingIds=${withoutIds}`
			);
			return results;
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Failed to list tunnels`, err);
			return [];
		}
	}

	private _toTunnelInfo(tunnel: IDiscoveredTunnel): ITunnelInfo | undefined {
		if (!tunnel.tunnelId || !tunnel.clusterId) {
			return undefined;
		}

		const tags = new TunnelTags(tunnel.tags);

		return {
			tunnelId: tunnel.tunnelId,
			clusterId: tunnel.clusterId,
			name: tags.name || tunnel.name || tunnel.tunnelId,
			tags: tunnel.tags as string[],
			protocolVersion: tags.protocolVersion,
			hostConnectionCount: tunnel.hostConnectionCount,
		};
	}

	getAutoConnectMode(): TunnelAutoConnectMode {
		return 'background';
	}

	// Connection (via embedder)

	async connect(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft', options?: { readonly userInitiated?: boolean }): Promise<void> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const entry = this._connectionFactory.stageTunnel(tunnel, authProvider, options?.userInitiated ?? true);
		const address = getEntryAddress(entry);
		this._remoteAgentHostService.reconnect(address, options?.userInitiated ?? true);
		await this._remoteAgentHostService.waitForConnection(address);
	}

	private async _createConnection(entry: IRemoteAgentHostEntry, _options: IRemoteAgentHostConnectOptions): Promise<IRemoteAgentHostCreatedConnection> {
		if (entry.connection.type !== RemoteAgentHostEntryType.Tunnel) {
			throw new Error(`Tunnel factory cannot create a ${entry.connection.type} connection.`);
		}
		const discoveryProvider = this._discoveryProvider;
		if (!discoveryProvider) {
			throw new NonReconnectableTransportError('No tunnel discovery provider is available to connect.');
		}

		const { tunnelId, clusterId } = entry.connection;
		const address = getEntryAddress(entry);
		this._logService.info(`${LOG_PREFIX} Connecting to tunnel '${entry.name}' (${tunnelId})`);
		let connection: ITunnelConnection;
		try {
			connection = await discoveryProvider.connect(tunnelId, clusterId);
		} catch (error) {
			if (isTunnelNotFoundError(error)) {
				throw new NonReconnectableTransportError(error.message);
			}
			throw error;
		}

		let useSeedConnection = true;
		const establish = async (): Promise<IEstablishedTransport> => {
			if (useSeedConnection) {
				useSeedConnection = false;
				return { transport: new TunnelConnectionTransport(connection, this._logService) };
			}

			const reconnectProvider = this._discoveryProvider;
			if (!reconnectProvider) {
				throw new NonReconnectableTransportError('No tunnel discovery provider is available to reconnect.');
			}

			try {
				const reconnected = await reconnectProvider.connect(tunnelId, clusterId);
				try {
					return {
						transport: new TunnelConnectionTransport(reconnected, this._logService),
						close: async () => reconnected.close(),
					};
				} catch (error) {
					reconnected.close();
					throw error;
				}
			} catch (error) {
				if (isTunnelNotFoundError(error)) {
					throw new NonReconnectableTransportError(error.message);
				}
				throw error;
			}
		};
		const transportFactory = () => new ReconnectingTransport(
			establish,
			this._logService,
			LOG_PREFIX,
			AgentHostClientConnectionKind.DevTunnel,
		);
		return {
			connection: this._instantiationService.createInstance(
				AgentHostProtocolClient, address, transportFactory, { clientInfo: agentsWindowAgentHostClientInfo },
			),
		};
	}

	get canDeleteTunnels(): boolean {
		return !!this._discoveryProvider?.deleteTunnel;
	}

	async deleteTunnel(tunnel: ITunnelInfo): Promise<void> {
		const provider = this._discoveryProvider;
		if (!provider?.deleteTunnel) {
			throw new Error('Deleting dev tunnels is not supported by the tunnel discovery provider.');
		}

		await provider.deleteTunnel(tunnel.tunnelId, tunnel.clusterId);
		this.removeCachedTunnel(tunnel.tunnelId);
	}

	async disconnect(address: string): Promise<void> {
		this._connectionFactory.unstageTunnel(address);
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
	}

	// Auth

	async getAuthProvider(options?: { silent?: boolean }): Promise<'github' | 'microsoft' | undefined> {
		for (const provider of ['github', 'microsoft'] as const) {
			const sessions = await this._authenticationService.getSessions(provider, undefined, {}, true);
			if (sessions.length > 0) {
				return provider;
			}
		}
		return undefined;
	}

	// Tunnel cache

	getCachedTunnels(): ICachedTunnel[] {
		return this._storage.getCachedTunnels();
	}

	cacheTunnel(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft'): void {
		this._storage.cacheTunnel({
			tunnelId: tunnel.tunnelId,
			clusterId: tunnel.clusterId,
			name: tunnel.name,
			protocolVersion: tunnel.protocolVersion,
			authProvider,
		});
	}

	removeCachedTunnel(tunnelId: string): void {
		this._connectionFactory.unstageTunnel(`${TUNNEL_ADDRESS_PREFIX}${tunnelId}`);
		this._storage.removeCachedTunnel(tunnelId);
	}

	isTunnelDismissed(tunnelId: string): boolean {
		return this._storage.isTunnelDismissed(tunnelId);
	}

	dismissTunnel(tunnelId: string): void {
		this._storage.dismissTunnel(tunnelId);
	}

	clearTunnelDismissal(tunnelId: string): void {
		this._storage.clearTunnelDismissal(tunnelId);
	}

	isAutoConnectSuppressed(tunnelId: string): boolean {
		return this._storage.isAutoConnectSuppressed(tunnelId);
	}

	suppressAutoConnect(tunnelId: string): void {
		this._storage.suppressAutoConnect(tunnelId);
	}

	clearAutoConnectSuppression(tunnelId: string): void {
		this._storage.clearAutoConnectSuppression(tunnelId);
	}
}

/**
 * Adapts an {@link ITunnelConnection} (embedder-provided) into an
 * {@link IProtocolTransport} for {@link AgentHostProtocolClient}.
 *
 * The connection is already established by the time this adapter is created,
 * so there is no `connect()` method — the protocol client skips that step.
 */
class TunnelConnectionTransport extends Disposable implements IProtocolTransport {
	readonly clientConnectionKind = AgentHostClientConnectionKind.DevTunnel;

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	private _malformedFrames = 0;

	constructor(
		private readonly _connection: ITunnelConnection,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(_connection.onMessage((data: string) => {
			let message: ProtocolMessage;
			try {
				message = JSON.parse(data) as ProtocolMessage;
			} catch (err) {
				this._malformedFrames++;
				if (this._malformedFrames <= MALFORMED_FRAMES_LOG_CAP) {
					const preview = data.length > 80 ? data.slice(0, 80) + '…' : data;
					this._logService.warn(
						`[TunnelConnectionTransport] Malformed frame #${this._malformedFrames} (len=${data.length}): ${preview}`,
						err instanceof Error ? err.message : String(err)
					);
				}
				if (this._malformedFrames > MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD) {
					this._logService.warn(
						'[TunnelConnectionTransport] Malformed frame threshold exceeded; forcing tunnel close.'
					);
					this._connection.close();
				}
				return;
			}
			this._onMessage.fire(message);
		}));
		this._register(_connection.onClose(() => {
			this._onClose.fire();
		}));
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcResponse): void {
		this._connection.send(JSON.stringify(message));
	}

	override dispose(): void {
		this._connection.close();
		super.dispose();
	}
}
