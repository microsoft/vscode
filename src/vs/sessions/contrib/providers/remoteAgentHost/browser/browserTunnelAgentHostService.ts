/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { IRemoteAgentHostLocationPreferenceService } from '../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ReconnectingTransport, type IEstablishedTransport } from '../../../../../platform/agentHost/common/reconnectingTransport.js';
import { PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import type { AhpServerNotification, JsonRpcResponse, ProtocolMessage } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { NonReconnectableTransportError, type IProtocolTransport } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import {
	TunnelAgentHostConnector,
	parseTunnelInfo,
	type ITunnelRelayClient,
	type ITunnelRelayClientFactory,
	type ITunnelRelayClientSession,
	type ITunnelSocketFactory,
} from '../../../../../platform/agentHost/common/tunnelAgentHostConnector.js';
import {
	isTunnelGatewaySelectionRejectedError,
	isTunnelNotFoundError,
	TUNNEL_ADDRESS_PREFIX,
	TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION,
	TUNNEL_LAUNCHER_LABEL,
	TUNNEL_MIN_PROTOCOL_VERSION,
	type ICachedTunnel,
	type ITunnelConnectResult,
	type ITunnelGatewaySelection,
	type ITunnelGatewaySelectionSession,
	type ITunnelInfo,
	ITunnelAgentHostService,
	type TunnelAutoConnectMode,
} from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import type { ITunnelDuplexStream, ITunnelMessageSocket } from '../../../../../platform/agentHost/common/tunnelMessageSocket.js';
import { connectWebSocketOverDuplex } from '../../../../../platform/agentHost/common/webSocketOverDuplex.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { resolveGatewaySelection, selectGatewayFallbackAfterRejection } from '../../../../../platform/agentHost/common/tunnelGatewaySelection.js';
import { type IDevTunnelsWeb, type IDevTunnelsWebManagementClient, type IDevTunnelsWebRelayClient, type IDevTunnelsWebTunnel, loadDevTunnelsWeb } from './devTunnelsWebLoader.js';
import { TunnelAgentHostStorage } from './tunnelAgentHostStorage.js';
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from '../../../../../platform/agentHost/common/transportConstants.js';

const LOG_PREFIX = '[BrowserTunnelAgentHost]';

/** Creates relay clients directly from the lazily-loaded Dev Tunnels browser SDK. */
export class BrowserTunnelRelayClientFactory implements ITunnelRelayClientFactory {
	constructor(
		private readonly _loadDevTunnelsWeb: () => Promise<IDevTunnelsWeb>,
	) {
	}

	async getTunnel(tunnelId: string, clusterId: string, authProvider: 'github' | 'microsoft', token: string): Promise<ITunnelRelayClientSession | undefined> {
		const devTunnels = await this._loadDevTunnelsWeb();
		const managementClient = createManagementClient(devTunnels, token, authProvider);
		const tunnel = await managementClient.getTunnel({ tunnelId, clusterId }, {
			includePorts: true,
			tokenScopes: ['connect'],
		});
		if (!tunnel) {
			return undefined;
		}

		return {
			tunnel,
			createRelayClient: async () => {
				const relayClient = new devTunnels.TunnelRelayTunnelClient(managementClient);
				relayClient.acceptLocalConnectionsForForwardedPorts = false;
				if (tunnel.endpoints) {
					relayClient.endpoints = tunnel.endpoints;
				}
				return new BrowserTunnelRelayClient(relayClient, tunnel);
			},
		};
	}
}

class BrowserTunnelRelayClient implements ITunnelRelayClient {
	constructor(
		private readonly _relayClient: IDevTunnelsWebRelayClient,
		private readonly _tunnel: IDevTunnelsWebTunnel,
	) {
	}

	connect(): Promise<void> {
		return this._relayClient.connect(this._tunnel);
	}

	waitForForwardedPort(port: number): Promise<void> {
		return this._relayClient.waitForForwardedPort(port);
	}

	async connectToForwardedPort(port: number): Promise<ITunnelDuplexStream> {
		return await this._relayClient.connectToForwardedPort(port);
	}

	dispose(): void {
		this._relayClient.dispose();
	}
}

/** Opens framed WebSockets directly over browser tunnel relay streams. */
export class BrowserTunnelSocketFactory implements ITunnelSocketFactory {
	async open(stream: ITunnelDuplexStream, path: string): Promise<ITunnelMessageSocket> {
		return await connectWebSocketOverDuplex(stream, { path });
	}
}

/** Browser service view of the transport-agnostic tunnel connector. */
export interface ITunnelAgentHostConnector {
	readonly onDidRelayMessage: Event<{ readonly connectionId: string; readonly data: string }>;
	readonly onDidRelayClose: Event<string>;
	connect(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<ITunnelConnectResult>;
	prepareSelection(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string): Promise<ITunnelGatewaySelectionSession | undefined>;
	completeSelection(selectionId: string, selection: ITunnelGatewaySelection): Promise<ITunnelConnectResult>;
	cancelSelection(selectionId: string): Promise<void>;
	relaySend(connectionId: string, message: string): Promise<void>;
	disconnect(connectionId: string): Promise<void>;
}

/** Construction options for injecting browser tunnel transports. */
export interface IBrowserTunnelAgentHostServiceOptions {
	readonly connector?: ITunnelAgentHostConnector;
	readonly loadDevTunnelsWeb?: () => Promise<IDevTunnelsWeb>;
	readonly resolveGatewaySelection?: typeof resolveGatewaySelection;
}

/**
 * Connects browser Agents windows to Dev Tunnels without an embedder proxy.
 */
export class BrowserTunnelAgentHostService extends Disposable implements ITunnelAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _storage: TunnelAgentHostStorage;
	readonly onDidChangeTunnels: Event<void>;

	private readonly _connector: ITunnelAgentHostConnector;
	private readonly _resolveGatewaySelection: typeof resolveGatewaySelection;
	private readonly _loadDevTunnelsWeb: () => Promise<IDevTunnelsWeb>;
	private _lastAuthProvider: 'github' | 'microsoft' | undefined;

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IProductService private readonly _productService: IProductService,
		@IStorageService private readonly _storageService: IStorageService,
		@IRemoteAgentHostLocationPreferenceService private readonly _locationPreferenceService: IRemoteAgentHostLocationPreferenceService,
		@IDialogService private readonly _dialogService: IDialogService,
		options: IBrowserTunnelAgentHostServiceOptions = {},
	) {
		super();
		this._storage = this._register(new TunnelAgentHostStorage(this._storageService));
		this.onDidChangeTunnels = this._storage.onDidChangeTunnels;
		const load = options.loadDevTunnelsWeb ?? loadDevTunnelsWeb;
		this._loadDevTunnelsWeb = load;
		this._connector = options.connector ?? this._register(new TunnelAgentHostConnector(
			new BrowserTunnelRelayClientFactory(load),
			new BrowserTunnelSocketFactory(),
			this._logService,
		));
		this._resolveGatewaySelection = options.resolveGatewaySelection ?? resolveGatewaySelection;
	}

	async listTunnels(options?: { silent?: boolean }): Promise<ITunnelInfo[]> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			return [];
		}

		const auth = await this._getToken(options?.silent ?? false);
		if (!auth) {
			return [];
		}

		try {
			const managementClient = createManagementClient(await this._loadDevTunnelsWeb(), auth.token, auth.provider);
			const tunnels = await managementClient.listTunnels(undefined, undefined, {
				labels: [TUNNEL_LAUNCHER_LABEL],
				requireAllLabels: true,
				includePorts: true,
				tokenScopes: ['connect'],
			});
			const results = filterBrowserTunnelInfos(tunnels);
			this._logService.info(`${LOG_PREFIX} Found ${results.length} tunnel(s) with agent host support`);
			return results;
		} catch (error) {
			this._logService.error(`${LOG_PREFIX} Failed to enumerate tunnels`, error);
			return [];
		}
	}

	getAutoConnectMode(tunnel: ITunnelInfo): TunnelAutoConnectMode {
		return tunnel.protocolVersion >= TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION
			&& this._locationPreferenceService.getPreference(`${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`) === undefined
			? 'prompt'
			: 'background';
	}

	async connect(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft', options?: { readonly userInitiated?: boolean }): Promise<void> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const auth = authProvider
			? await this._getTokenForProvider(authProvider, false)
			: await this._getToken(false);
		if (!auth) {
			throw new Error('No authentication available');
		}

		const result = await connectThroughTunnelGateway(
			this._connector,
			this._resolveGatewaySelection,
			this._locationPreferenceService,
			this._dialogService,
			this._productService.nameShort,
			auth,
			tunnel,
			options?.userInitiated ?? true,
		);
		if (!result) {
			return;
		}
		let useSeedConnection = true;
		const establish = async (): Promise<IEstablishedTransport> => {
			if (useSeedConnection) {
				useSeedConnection = false;
				// The initial relay is already owned by the transport established for this managed connection.
				return { transport: new BrowserTunnelConnectionTransport(result.connectionId, this._connector, this._logService) };
			}

			const authForReconnect = await this._getTokenForProvider(auth.provider, true);
			if (!authForReconnect) {
				throw new NonReconnectableTransportError('No cached authentication available to reconnect the tunnel.');
			}

			try {
				const reconnected = await connectThroughTunnelGateway(
					this._connector,
					this._resolveGatewaySelection,
					this._locationPreferenceService,
					this._dialogService,
					this._productService.nameShort,
					authForReconnect,
					tunnel,
					false,
				);
				if (!reconnected) {
					throw new NonReconnectableTransportError('Tunnel agent host selection requires user interaction.');
				}
				try {
					return {
						transport: new BrowserTunnelConnectionTransport(reconnected.connectionId, this._connector, this._logService),
						close: () => this._connector.disconnect(reconnected.connectionId),
					};
				} catch (error) {
					await this._connector.disconnect(reconnected.connectionId);
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
		const protocolClient = this._instantiationService.createInstance(
			AgentHostProtocolClient, result.address, transportFactory, { clientInfo: agentsWindowAgentHostClientInfo },
		);

		let status: RemoteAgentHostConnectionStatus = RemoteAgentHostConnectionStatus.connected;
		let connectError: unknown;
		try {
			await protocolClient.connect();
			this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${result.address}`);
		} catch (error) {
			const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(error, [PROTOCOL_VERSION]);
			if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
				protocolClient.dispose();
				throw error;
			}
			status = incompatible;
			connectError = error;
			this._logService.warn(`${LOG_PREFIX} Incompatible with ${result.address}: ${incompatible.message}`);
		}

		this.cacheTunnel(tunnel, auth.provider);
		try {
			await this._remoteAgentHostService.addManagedConnection({
				name: result.name,
				connectionToken: result.connectionToken,
				connection: {
					type: RemoteAgentHostEntryType.Tunnel,
					tunnelId: tunnel.tunnelId,
					clusterId: tunnel.clusterId,
					label: tunnel.name,
					authProvider: auth.provider,
				},
			}, protocolClient, undefined, status);
		} catch (error) {
			protocolClient.dispose();
			throw error;
		}

		if (connectError) {
			throw connectError;
		}
	}

	readonly canDeleteTunnels = true;

	async deleteTunnel(tunnel: ITunnelInfo): Promise<void> {
		const auth = await this._getToken(false);
		if (!auth) {
			throw new Error('No authentication available');
		}
		const managementClient = createManagementClient(await this._loadDevTunnelsWeb(), auth.token, auth.provider);
		await managementClient.deleteTunnel(tunnel);
		this.removeCachedTunnel(tunnel.tunnelId);
	}

	async disconnect(address: string): Promise<void> {
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
		this._storage.notifyTunnelsChanged();
	}

	async getAuthProvider(options?: { silent?: boolean }): Promise<'github' | 'microsoft' | undefined> {
		return (await this._getToken(options?.silent ?? true))?.provider;
	}

	getCachedTunnels(): ICachedTunnel[] {
		return this._storage.getCachedTunnels();
	}

	cacheTunnel(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft'): void {
		this._storage.cacheTunnel({
			tunnelId: tunnel.tunnelId,
			clusterId: tunnel.clusterId,
			name: tunnel.name,
			authProvider,
		});
	}

	removeCachedTunnel(tunnelId: string): void {
		this._storage.removeCachedTunnel(tunnelId);
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

	private async _getToken(silent: boolean): Promise<{ readonly token: string; readonly provider: 'github' | 'microsoft' } | undefined> {
		if (this._lastAuthProvider) {
			const token = await this._getTokenForProvider(this._lastAuthProvider, silent);
			if (token) {
				return token;
			}
		}

		for (const provider of ['github', 'microsoft'] as const) {
			if (provider === this._lastAuthProvider) {
				continue;
			}
			const token = await this._getTokenForProvider(provider, true);
			if (token) {
				return token;
			}
		}
		return undefined;
	}

	private async _getTokenForProvider(provider: 'github' | 'microsoft', silent: boolean): Promise<{ readonly token: string; readonly provider: 'github' | 'microsoft' } | undefined> {
		const scopes = this._productService.tunnelApplicationConfig?.authenticationProviders?.[provider]?.scopes ?? [];
		if (scopes.length === 0) {
			this._logService.debug(`${LOG_PREFIX} No ${provider} tunnel authentication scopes are configured.`);
			return undefined;
		}

		try {
			let sessions = await this._authenticationService.getSessions(provider, scopes, {}, true);
			if (sessions.length === 0) {
				const requestedScopes = new Set(scopes);
				const allSessions = await this._authenticationService.getSessions(provider, undefined, {}, true);
				let bestSession: typeof allSessions[number] | undefined;
				let bestExtraScopes = Infinity;
				for (const candidate of allSessions) {
					const candidateScopes = new Set(candidate.scopes);
					if (![...requestedScopes].every(scope => candidateScopes.has(scope))) {
						continue;
					}
					const extraScopes = candidateScopes.size - requestedScopes.size;
					if (extraScopes < bestExtraScopes) {
						bestSession = candidate;
						bestExtraScopes = extraScopes;
					}
				}
				if (bestSession) {
					sessions = [bestSession];
				}
			}
			if (sessions.length === 0 && !silent) {
				sessions = [await this._authenticationService.createSession(provider, scopes, { activateImmediate: true })];
			}
			const token = sessions[0]?.accessToken;
			if (token) {
				this._lastAuthProvider = provider;
				return { token, provider };
			}
		} catch (error) {
			this._logService.debug(`${LOG_PREFIX} Failed to get ${provider} token: ${error}`);
		}
		return undefined;
	}
}

/** Connects through the versioned gateway when a tunnel advertises one. */
export async function connectThroughTunnelGateway(
	connector: ITunnelAgentHostConnector,
	resolveSelection: typeof resolveGatewaySelection,
	locationPreferenceService: IRemoteAgentHostLocationPreferenceService,
	dialogService: IDialogService,
	productName: string,
	auth: { readonly token: string; readonly provider: 'github' | 'microsoft' },
	tunnel: ITunnelInfo,
	userInitiated: boolean,
): Promise<ITunnelConnectResult | undefined> {
	const session = await connector.prepareSelection(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
	if (!session) {
		return await connector.connect(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
	}

	let selection: ITunnelGatewaySelection | undefined;
	try {
		selection = await resolveSelection(locationPreferenceService, dialogService, {
			hostKey: `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`,
			hostLabel: tunnel.name,
			productName,
			inventory: session.inventory,
			userInitiated,
		});
	} catch (error) {
		await connector.cancelSelection(session.selectionId);
		throw error;
	}
	if (!selection) {
		await connector.cancelSelection(session.selectionId);
		return undefined;
	}

	try {
		return await connector.completeSelection(session.selectionId, selection);
	} catch (error) {
		if (!isTunnelGatewaySelectionRejectedError(error)) {
			throw error;
		}
		const retry = await connector.prepareSelection(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
		if (!retry) {
			throw error;
		}
		const fallback = selectGatewayFallbackAfterRejection(selection, retry.inventory);
		if (!fallback) {
			await connector.cancelSelection(retry.selectionId);
			throw error;
		}
		return await connector.completeSelection(retry.selectionId, fallback);
	}
}

/** Maps Dev Tunnels SDK descriptors to supported agent-host tunnels. */
export function filterBrowserTunnelInfos(
	tunnels: readonly IDevTunnelsWebTunnel[],
): ITunnelInfo[] {
	return tunnels
		.map(tunnel => parseTunnelInfo(tunnel))
		.filter((tunnel): tunnel is ITunnelInfo => !!tunnel && tunnel.protocolVersion >= TUNNEL_MIN_PROTOCOL_VERSION);
}

class BrowserTunnelConnectionTransport extends Disposable implements IProtocolTransport {
	readonly clientConnectionKind = AgentHostClientConnectionKind.DevTunnel;

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;
	private _malformedFrames = 0;

	constructor(
		private readonly _connectionId: string,
		private readonly _connector: ITunnelAgentHostConnector,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(this._connector.onDidRelayMessage(message => {
			if (message.connectionId === this._connectionId) {
				try {
					this._onMessage.fire(JSON.parse(message.data) as ProtocolMessage);
				} catch (error) {
					this._malformedFrames++;
					if (this._malformedFrames <= MALFORMED_FRAMES_LOG_CAP) {
						const preview = message.data.length > 80 ? `${message.data.slice(0, 80)}…` : message.data;
						this._logService.warn(`${LOG_PREFIX} Malformed relay frame #${this._malformedFrames} (len=${message.data.length}): ${preview}`, error);
					}
					if (this._malformedFrames > MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD) {
						void this._connector.disconnect(this._connectionId);
					}
				}
			}
		}));
		this._register(this._connector.onDidRelayClose(connectionId => {
			if (connectionId === this._connectionId) {
				this._onClose.fire();
			}
		}));
	}

	send(message: ProtocolMessage | AhpServerNotification | JsonRpcResponse): void {
		void this._connector.relaySend(this._connectionId, JSON.stringify(message));
	}

	override dispose(): void {
		void this._connector.disconnect(this._connectionId);
		super.dispose();
	}
}

function createManagementClient(
	devTunnels: IDevTunnelsWeb,
	token: string,
	authProvider: 'github' | 'microsoft',
): IDevTunnelsWebManagementClient {
	const authorization = authProvider === 'github' ? `github ${token}` : `Bearer ${token}`;
	return new devTunnels.TunnelManagementHttpClient(
		'vscode-sessions',
		devTunnels.ManagementApiVersions.Version20230927preview,
		async () => authorization,
	);
}
