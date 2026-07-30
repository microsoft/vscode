/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { localize } from '../../../../../nls.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import {
	ITunnelAgentHostService,
	TUNNEL_AGENT_HOST_CHANNEL,
	TunnelAgentHostsSettingId,
	type ICachedTunnel,
	type ITunnelAgentHostMainService,
	type ITunnelConnectResult,
	type ITunnelGatewayEndpoint,
	type ITunnelGatewayInventory,
	type ITunnelGatewaySelection,
	type ITunnelInfo,
} from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { AhpJsonlLogger } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { RemoteAgentHostProtocolClient } from '../../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { TunnelRelayTransport } from '../../../../../platform/agentHost/electron-browser/tunnelRelayTransport.js';

const LOG_PREFIX = '[TunnelAgentHost]';

/** Storage key for recently used tunnel cache. */
const CACHED_TUNNELS_KEY = 'tunnelAgentHost.recentTunnels';
/** Storage key for tunnels the user explicitly disconnected. */
const AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY = 'tunnelAgentHost.autoConnectSuppressedTunnels';

interface ITunnelGatewayPickItem extends IQuickPickItem {
	readonly selection: ITunnelGatewaySelection;
}

function gatewayEndpointLabel(endpoint: ITunnelGatewayEndpoint): string {
	return endpoint.type === 'editor'
		? localize('gatewayEndpointEditor', "Editor (PID {0})", endpoint.pid)
		: localize('gatewayEndpointStandalone', "Standalone Agent Host (PID {0})", endpoint.pid);
}

function gatewayEndpointDescription(endpoint: ITunnelGatewayEndpoint): string {
	const parts: string[] = [];
	if (endpoint.quality) {
		parts.push(endpoint.quality);
	}
	if (endpoint.tunnelName) {
		parts.push(endpoint.tunnelName);
	}
	parts.push(endpoint.endpointLabel);
	return parts.join(' · ');
}

/**
 * Build the quick pick items for every live endpoint in a gateway inventory,
 * plus a trailing item to spawn a brand new dedicated standalone instance.
 * Exported so the picker's exact content can be unit tested without driving
 * a real {@link IQuickInputService}.
 */
export function buildGatewayPickItems(inventory: ITunnelGatewayInventory): ITunnelGatewayPickItem[] {
	const items: ITunnelGatewayPickItem[] = inventory.endpoints.map(endpoint => ({
		label: gatewayEndpointLabel(endpoint),
		description: gatewayEndpointDescription(endpoint),
		selection: { instanceId: endpoint.instanceId },
	}));
	items.push({
		label: localize('gatewayNewDedicated', "Start New Dedicated Agent Host"),
		selection: { newDedicated: true },
	});
	return items;
}

/**
 * Deterministic selection used when an inventory has no `editor` entries to
 * disambiguate interactively: reuse the first live standalone instance if
 * one exists, otherwise request a new dedicated one.
 */
export function autoGatewaySelection(inventory: ITunnelGatewayInventory): ITunnelGatewaySelection {
	const standalone = inventory.endpoints.find(endpoint => endpoint.type === 'standalone');
	return standalone ? { instanceId: standalone.instanceId } : { newDedicated: true };
}

/**
 * Resolve which agent host endpoint to select for a protocol-v6 gateway
 * session: deterministically auto-selected when there is nothing to
 * disambiguate (no `editor` entries) or the connection is not user-initiated,
 * or via a standard, accessible {@link IQuickInputService.pick} otherwise.
 * Returns `undefined` if the user cancels the picker.
 *
 * Background/auto-connect (`userInitiated: false`) must never prompt and
 * must never choose an `editor` endpoint, so it always falls back to
 * {@link autoGatewaySelection} regardless of what the inventory contains.
 */
export async function pickGatewaySelection(
	quickInputService: IQuickInputService,
	inventory: ITunnelGatewayInventory,
	options?: { readonly userInitiated?: boolean },
): Promise<ITunnelGatewaySelection | undefined> {
	const userInitiated = options?.userInitiated ?? true;
	const hasEditorEntry = inventory.endpoints.some(endpoint => endpoint.type === 'editor');
	if (!userInitiated || !hasEditorEntry) {
		return autoGatewaySelection(inventory);
	}

	const picked = await quickInputService.pick(buildGatewayPickItems(inventory), {
		title: localize('gatewayPickTitle', "Select Agent Host"),
		placeHolder: localize('gatewayPickPlaceholder', "Choose an agent host to connect to, or start a new one"),
	});
	return picked?.selection;
}

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
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
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

		this._logService.info(`${LOG_PREFIX} Connecting to tunnel '${tunnel.name}' (${tunnel.tunnelId})`);

		// Protocol-v6 tunnels expose a registry-based endpoint selection
		// gateway: prepare it first and let the user (or a deterministic
		// auto-selection) pick a target before completing the connection.
		// Protocol-v5 tunnels have no gateway — `prepareSelection` returns
		// `undefined` and we fall back to the legacy direct-connect path
		// with no picker.
		const session = await this._mainService.prepareSelection(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
		let result: ITunnelConnectResult;
		if (session) {
			const selection = await pickGatewaySelection(this._quickInputService, session.inventory, { userInitiated: options?.userInitiated });
			if (!selection) {
				this._logService.info(`${LOG_PREFIX} Agent host selection cancelled for tunnel '${tunnel.name}'`);
				await this._mainService.cancelSelection(session.selectionId);
				return;
			}
			result = await this._mainService.completeSelection(session.selectionId, selection);
		} else {
			result = await this._mainService.connect(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
		}
		this._logService.info(`${LOG_PREFIX} Tunnel relay connected, connectionId=${result.connectionId}`);

		// Build relay transport + protocol client. If construction itself
		// fails (rare — would mean the AHP logger or transport ctor threw)
		// tear the just-opened main-side relay down before propagating.
		let protocolClient: RemoteAgentHostProtocolClient;
		try {
			const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
			const logger = ahpLoggingEnabled ? this._instantiationService.createInstance(
				AhpJsonlLogger,
				{ logsHome: this._environmentService.logsHome, connectionId: result.connectionId, transport: 'tunnel' },
			) : undefined;
			const transport = new TunnelRelayTransport(result.connectionId, this._mainService, logger);
			protocolClient = this._instantiationService.createInstance(
				RemoteAgentHostProtocolClient, result.address, transport, undefined, undefined, agentsWindowAgentHostClientInfo,
			);
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
			this._mainService.disconnect(result.connectionId).catch(() => { /* best effort */ });
			throw err;
		}

		// Keep an incompatible handshake from tearing down the relay: the
		// protocol client must remain registered with IRemoteAgentHostService
		// so `triggerServerUpgrade` can locate it and send `_vscodeUpgrade`
		// over the still-open transport.
		let status: RemoteAgentHostConnectionStatus = RemoteAgentHostConnectionStatus.connected;
		let connectError: unknown;
		try {
			await protocolClient.connect();
			this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${result.address}`);
		} catch (err) {
			const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
			if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
				this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
				protocolClient.dispose();
				this._mainService.disconnect(result.connectionId).catch(() => { /* best effort */ });
				throw err;
			}
			this._logService.warn(`${LOG_PREFIX} Incompatible with ${result.address}: ${incompatible.message}`);
			status = incompatible;
			connectError = err;
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
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} addManagedConnection failed`, err);
			protocolClient.dispose();
			this._mainService.disconnect(result.connectionId).catch(() => { /* best effort */ });
			throw err;
		}

		if (connectError) {
			throw connectError;
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
		this.clearAutoConnectSuppression(tunnel.tunnelId);
		this._storeCachedTunnels(filtered);
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
