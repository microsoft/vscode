/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { deriveConnectionToken } from '../../../../../platform/agentHost/common/tunnelAgentHostConnector.js';
import { RemoteAgentHostEntryType, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import type { IProtocolTransport } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import type { ProtocolMessage, AhpServerNotification, JsonRpcResponse } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from '../../../../../platform/agentHost/common/transportConstants.js';
import {
	ITunnelAgentHostService,
	TUNNEL_ADDRESS_PREFIX,
	TUNNEL_MIN_PROTOCOL_VERSION,
	TunnelTags,
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

	async connect(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft'): Promise<void> {
		if (!this._discoveryProvider) {
			throw new Error('No tunnelDiscoveryProvider available');
		}
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			throw new Error('Remote agent host connections are not enabled.');
		}

		const { tunnelId, clusterId } = tunnel;
		this._logService.info(`${LOG_PREFIX} Connecting to tunnel '${tunnel.name}' (${tunnelId})`);

		// The embedder handles the full connection including auth
		const connection = await this._discoveryProvider.connect(tunnelId, clusterId);

		// Derive connection token from tunnel ID (same convention as CLI and desktop)
		const connectionToken = await deriveConnectionToken(tunnelId);

		const transport = new TunnelConnectionTransport(connection, this._logService);
		const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
		const protocolClient = this._instantiationService.createInstance(
			AgentHostProtocolClient, address, transport, undefined, undefined, agentsWindowAgentHostClientInfo,
		);

		// Keep an incompatible handshake from tearing down the relay: the
		// protocol client must remain registered with IRemoteAgentHostService
		// so `triggerServerUpgrade` can locate it and send `_vscodeUpgrade`
		// over the still-open transport.
		let status: RemoteAgentHostConnectionStatus = RemoteAgentHostConnectionStatus.connected;
		let connectError: unknown;
		try {
			await protocolClient.connect();
			this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${address}`);
		} catch (err) {
			const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
			if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
				protocolClient.dispose();
				this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
				throw err;
			}
			this._logService.warn(`${LOG_PREFIX} Incompatible with ${address}: ${incompatible.message}`);
			status = incompatible;
			connectError = err;
		}

		// Cache before announcing the live connection so the contribution's
		// `onDidChangeTunnels` handler has created the provider by the time
		// `onDidChangeConnections` fires from `addManagedConnection` and
		// wires the connection. Also fires `onDidChangeTunnels`.
		this.cacheTunnel(tunnel, authProvider);

		try {
			await this._remoteAgentHostService.addManagedConnection({
				name: tunnel.name,
				connectionToken,
				connection: {
					type: RemoteAgentHostEntryType.Tunnel,
					tunnelId,
					clusterId,
					label: tunnel.name,
					authProvider,
				},
			}, protocolClient, undefined, status);
		} catch (err) {
			protocolClient.dispose();
			this._logService.error(`${LOG_PREFIX} addManagedConnection failed`, err);
			throw err;
		}

		if (connectError) {
			throw connectError;
		}
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
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
		this._storage.notifyTunnelsChanged();
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
