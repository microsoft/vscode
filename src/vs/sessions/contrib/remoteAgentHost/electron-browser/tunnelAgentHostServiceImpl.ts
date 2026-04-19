/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import {
	ITunnelAgentHostService,
	TUNNEL_AGENT_HOST_CHANNEL,
	TunnelAgentHostsSettingId,
	type ICachedTunnel,
	type ITunnelAgentHostMainService,
	type ITunnelInfo,
} from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { RemoteAgentHostProtocolClient } from '../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js';
import { TunnelRelayTransport } from '../../../../platform/agentHost/electron-browser/tunnelRelayTransport.js';

const LOG_PREFIX = '[TunnelAgentHost]';

/** Storage key for recently used tunnel cache. */
const CACHED_TUNNELS_KEY = 'tunnelAgentHost.recentTunnels';

/**
 * Renderer-side implementation of {@link ITunnelAgentHostService} that
 * delegates tunnel SDK operations to the shared process via IPC, then
 * registers connections with the renderer-local {@link IRemoteAgentHostService}.
 */
export class TunnelAgentHostService extends Disposable implements ITunnelAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _mainService: ITunnelAgentHostMainService;

	private readonly _onDidChangeTunnels = this._register(new Emitter<void>());
	readonly onDidChangeTunnels: Event<void> = this._onDidChangeTunnels.event;

	/** Tracks which auth provider was last used successfully. */
	private _lastAuthProvider: 'github' | 'microsoft' | undefined;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IProductService private readonly _productService: IProductService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._mainService = ProxyChannel.toService<ITunnelAgentHostMainService>(
			sharedProcessService.getChannel(TUNNEL_AGENT_HOST_CHANNEL),
		);
	}

	async listTunnels(options?: { silent?: boolean }): Promise<ITunnelInfo[]> {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			return [];
		}

		const silent = options?.silent ?? false;
		const auth = await this._getToken(silent);
		if (!auth) {
			if (silent) {
				this._logService.debug(`${LOG_PREFIX} No cached token available for silent tunnel enumeration`);
			} else {
				this._logService.warn(`${LOG_PREFIX} No auth token available for tunnel enumeration`);
			}
			return [];
		}

		const additionalNames = this._configurationService.getValue<string[]>(TunnelAgentHostsSettingId) ?? [];
		return this._mainService.listTunnels(auth.token, auth.provider, additionalNames.length > 0 ? additionalNames : undefined);
	}

	async connect(tunnel: ITunnelInfo, authProvider?: 'github' | 'microsoft'): Promise<void> {
		const auth = authProvider
			? await this._getTokenForProvider(authProvider, false)
			: await this._getToken(false);
		if (!auth) {
			throw new Error('No authentication available');
		}

		this._logService.info(`${LOG_PREFIX} Connecting to tunnel '${tunnel.name}' (${tunnel.tunnelId})`);
		const result = await this._mainService.connect(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
		this._logService.info(`${LOG_PREFIX} Tunnel relay connected, connectionId=${result.connectionId}`);

		// Create relay transport + protocol client, then register with RemoteAgentHostService
		try {
			const transport = new TunnelRelayTransport(result.connectionId, this._mainService);
			const protocolClient = this._instantiationService.createInstance(
				RemoteAgentHostProtocolClient, result.address, transport,
			);

			await protocolClient.connect();
			this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${result.address}`);

			await this._remoteAgentHostService.addSSHConnection({
				name: result.name,
				connectionToken: result.connectionToken,
				connection: {
					type: RemoteAgentHostEntryType.Tunnel,
					tunnelId: tunnel.tunnelId,
					clusterId: tunnel.clusterId,
					label: tunnel.name,
					authProvider: auth.provider,
				},
			}, protocolClient);

			this._onDidChangeTunnels.fire();
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
			this._mainService.disconnect(result.connectionId).catch(() => { /* best effort */ });
			throw err;
		}
	}

	async disconnect(address: string): Promise<void> {
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
		this._onDidChangeTunnels.fire();
	}

	/**
	 * Get an auth token, trying cached sessions first (silent),
	 * then prompting interactively if `silent` is false.
	 */
	private async _getToken(silent: boolean): Promise<{ token: string; provider: 'github' | 'microsoft' } | undefined> {
		// Try the last known provider first
		if (this._lastAuthProvider) {
			const result = await this._getTokenForProvider(this._lastAuthProvider, silent);
			if (result) {
				return result;
			}
		}

		// Try both providers silently
		for (const provider of ['github', 'microsoft'] as const) {
			if (provider === this._lastAuthProvider) {
				continue; // Already tried above
			}
			const result = await this._getTokenForProvider(provider, true);
			if (result) {
				return result;
			}
		}

		// If not silent, we would need the caller to prompt for provider selection.
		// Return undefined — the caller (promptToConnectViaTunnel) handles the interactive flow.
		return undefined;
	}

	/**
	 * Get a token for a specific auth provider.
	 * @param provider The auth provider to use.
	 * @param silent If true, only try cached sessions. If false, prompt the user.
	 */
	private _getScopesForProvider(provider: 'github' | 'microsoft'): string[] {
		const config = this._productService.tunnelApplicationConfig?.authenticationProviders;
		return config?.[provider]?.scopes ?? [];
	}

	private async _getTokenForProvider(
		provider: 'github' | 'microsoft',
		silent: boolean,
	): Promise<{ token: string; provider: 'github' | 'microsoft' } | undefined> {
		const providerId = provider;
		const scopes = this._getScopesForProvider(provider);
		if (scopes.length === 0) {
			return undefined;
		}

		try {
			// Try exact scope match first
			let sessions = await this._authenticationService.getSessions(providerId, scopes, {}, true);

			// Fall back: find any session whose scopes are a superset
			if (sessions.length === 0) {
				const allSessions = await this._authenticationService.getSessions(providerId, undefined, {}, true);
				const requestedSet = new Set(scopes);
				let bestSession: typeof allSessions[number] | undefined;
				let bestExtra = Infinity;
				for (const session of allSessions) {
					const sessionScopes = new Set(session.scopes);
					let isSuperset = true;
					for (const scope of requestedSet) {
						if (!sessionScopes.has(scope)) {
							isSuperset = false;
							break;
						}
					}
					if (isSuperset) {
						const extra = sessionScopes.size - requestedSet.size;
						if (extra < bestExtra) {
							bestExtra = extra;
							bestSession = session;
						}
					}
				}
				if (bestSession) {
					sessions = [bestSession];
				}
			}

			// Interactive fallback: create a new session
			if (sessions.length === 0 && !silent) {
				const session = await this._authenticationService.createSession(providerId, scopes, { activateImmediate: true });
				sessions = [session];
			}

			if (sessions.length > 0) {
				const token = sessions[0].accessToken;
				if (token) {
					this._lastAuthProvider = provider;
					return { token, provider };
				}
			}
		} catch (err) {
			this._logService.debug(`${LOG_PREFIX} Failed to get ${provider} token: ${err}`);
		}
		return undefined;
	}

	async getAuthProvider(options?: { silent?: boolean }): Promise<'github' | 'microsoft' | undefined> {
		const result = await this._getToken(options?.silent ?? true);
		return result?.provider;
	}

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
		this._storeCachedTunnels(filtered.slice(0, 20));
		this._onDidChangeTunnels.fire();
	}

	removeCachedTunnel(tunnelId: string): void {
		const cached = this.getCachedTunnels();
		this._storeCachedTunnels(cached.filter(t => t.tunnelId !== tunnelId));
		this._onDidChangeTunnels.fire();
	}

	private _storeCachedTunnels(tunnels: ICachedTunnel[]): void {
		if (tunnels.length === 0) {
			this._storageService.remove(CACHED_TUNNELS_KEY, StorageScope.APPLICATION);
		} else {
			this._storageService.store(CACHED_TUNNELS_KEY, JSON.stringify(tunnels), StorageScope.APPLICATION, StorageTarget.USER);
		}
	}
}
