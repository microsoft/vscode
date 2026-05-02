/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { RemoteAgentHostProtocolClient } from '../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js';
import { RemoteAgentHostEntryType, IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { IProtocolTransport } from '../../../../platform/agentHost/common/state/sessionTransport.js';
import type { ProtocolMessage, AhpServerNotification, JsonRpcResponse } from '../../../../platform/agentHost/common/state/sessionProtocol.js';
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from '../../../../platform/agentHost/common/transportConstants.js';
import {
	ITunnelAgentHostService,
	TUNNEL_ADDRESS_PREFIX,
	TUNNEL_MIN_PROTOCOL_VERSION,
	TunnelTags,
	type ICachedTunnel,
	type ITunnelInfo,
} from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import type { IDiscoveredTunnel, ITunnelConnection, ITunnelDiscoveryProvider } from '../../../../workbench/browser/web.api.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../workbench/services/environment/browser/environmentService.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';

const LOG_PREFIX = '[WebTunnelAgentHost]';

/** Storage key for recently used tunnel cache. */
const CACHED_TUNNELS_KEY = 'tunnelAgentHost.recentTunnels';
/** Storage key for tunnels the user explicitly disconnected. */
const AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY = 'tunnelAgentHost.autoConnectSuppressedTunnels';

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

	private readonly _onDidChangeTunnels = this._register(new Emitter<void>());
	readonly onDidChangeTunnels: Event<void> = this._onDidChangeTunnels.event;

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

			for (const tunnel of discovered) {
				const info = this._toTunnelInfo(tunnel);
				if (info && info.protocolVersion >= TUNNEL_MIN_PROTOCOL_VERSION) {
					results.push(info);
				}
			}

			this._logService.info(`${LOG_PREFIX} Found ${results.length} tunnel(s) with agent host support`);
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

	// Connection (via embedder)

	async connect(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft'): Promise<void> {
		if (!this._discoveryProvider) {
			throw new Error('No tunnelDiscoveryProvider available');
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
			RemoteAgentHostProtocolClient, address, transport,
		);

		try {
			await protocolClient.connect();
			this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${address}`);

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
			}, protocolClient);

			this._onDidChangeTunnels.fire();
		} catch (err) {
			protocolClient.dispose();
			this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
			throw err;
		}
	}

	async disconnect(address: string): Promise<void> {
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
		this._onDidChangeTunnels.fire();
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
		const raw = this._storageService.get(CACHED_TUNNELS_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return [];
		}
		try {
			return JSON.parse(raw);
		} catch {
			return [];
		}
	}

	cacheTunnel(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft'): void {
		const cached = this.getCachedTunnels();
		const filtered = cached.filter(t => t.tunnelId !== tunnel.tunnelId);
		filtered.unshift({
			tunnelId: tunnel.tunnelId,
			clusterId: tunnel.clusterId,
			name: tunnel.name,
			authProvider,
		});
		this.clearAutoConnectSuppression(tunnel.tunnelId);
		this._storeCachedTunnels(filtered.slice(0, 20));
		this._onDidChangeTunnels.fire();
	}

	removeCachedTunnel(tunnelId: string): void {
		const cached = this.getCachedTunnels();
		this._storeCachedTunnels(cached.filter(t => t.tunnelId !== tunnelId));
		this.clearAutoConnectSuppression(tunnelId);
		this._onDidChangeTunnels.fire();
	}

	isAutoConnectSuppressed(tunnelId: string): boolean {
		return this._getAutoConnectSuppressedTunnels().has(tunnelId);
	}

	suppressAutoConnect(tunnelId: string): void {
		const suppressed = this._getAutoConnectSuppressedTunnels();
		suppressed.add(tunnelId);
		this._storeAutoConnectSuppressedTunnels(suppressed);
	}

	clearAutoConnectSuppression(tunnelId: string): void {
		const suppressed = this._getAutoConnectSuppressedTunnels();
		if (!suppressed.delete(tunnelId)) {
			return;
		}
		this._storeAutoConnectSuppressedTunnels(suppressed);
	}

	private _storeCachedTunnels(tunnels: ICachedTunnel[]): void {
		if (tunnels.length === 0) {
			this._storageService.remove(CACHED_TUNNELS_KEY, StorageScope.APPLICATION);
		} else {
			this._storageService.store(CACHED_TUNNELS_KEY, JSON.stringify(tunnels), StorageScope.APPLICATION, StorageTarget.USER);
		}
	}

	private _getAutoConnectSuppressedTunnels(): Set<string> {
		const raw = this._storageService.get(AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return new Set();
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			if (!Array.isArray(parsed)) {
				return new Set();
			}
			return new Set(parsed.filter(item => typeof item === 'string'));
		} catch {
			return new Set();
		}
	}

	private _storeAutoConnectSuppressedTunnels(tunnelIds: Set<string>): void {
		if (tunnelIds.size === 0) {
			this._storageService.remove(AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY, StorageScope.APPLICATION);
		} else {
			this._storageService.store(AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY, JSON.stringify([...tunnelIds]), StorageScope.APPLICATION, StorageTarget.USER);
		}
	}
}

/**
 * Adapts an {@link ITunnelConnection} (embedder-provided) into an
 * {@link IProtocolTransport} for {@link RemoteAgentHostProtocolClient}.
 *
 * The connection is already established by the time this adapter is created,
 * so there is no `connect()` method — the protocol client skips that step.
 */
class TunnelConnectionTransport extends Disposable implements IProtocolTransport {
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

/**
 * Derive a connection token from a tunnel ID using the same convention
 * as the VS Code CLI and the desktop shared-process service.
 */
async function deriveConnectionToken(tunnelId: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(tunnelId);
	const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
	const hashArray = new Uint8Array(hashBuffer);

	// Base64url encode (matches Node's createHash('sha256').digest('base64url'))
	let result = btoa(String.fromCharCode(...hashArray))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

	if (result.startsWith('-')) {
		result = 'a' + result;
	}
	return result;
}
