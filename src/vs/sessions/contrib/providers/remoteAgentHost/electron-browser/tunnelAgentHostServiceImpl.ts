/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../base/common/types.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { localize } from '../../../../../nls.js';
import { IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IRemoteAgentHostLocationPreferenceService } from '../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import {
	isTunnelGatewaySelectionRejectedError,
	isTunnelNotFoundError,
	ITunnelAgentHostService,
	TUNNEL_ADDRESS_PREFIX,
	TUNNEL_AGENT_HOST_CHANNEL,
	TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION,
	TunnelAgentHostsSettingId,
	type ICachedTunnel,
	type ITunnelAgentHostMainService,
	type ITunnelConnectResult,
	type ITunnelGatewayInventory,
	type ITunnelGatewaySelection,
	type ITunnelGatewaySelectionSession,
	type ITunnelInfo,
	type TunnelAutoConnectMode,
} from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { AhpJsonlLogger } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import {
	resolveGatewaySelection,
	selectGatewayFallbackAfterRejection,
	TunnelFailoverTracker,
} from '../../../../../platform/agentHost/common/tunnelGatewaySelection.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { ReconnectingRelayTransport, type IRelayConnectionHandle } from '../../../../../platform/agentHost/common/relayTransport.js';
import { NonReconnectableTransportError } from '../../../../../platform/agentHost/common/state/sessionTransport.js';

export {
	type IGatewaySelectionRequest,
	resolveGatewaySelection,
	selectDedicatedGatewayFallback,
	selectEditorGatewayEndpoint,
	selectGatewayFallbackAfterRejection,
	shouldNotifyTunnelFailover,
	TunnelFailoverTracker,
} from '../../../../../platform/agentHost/common/tunnelGatewaySelection.js';

const LOG_PREFIX = '[TunnelAgentHost]';

/** Storage key for recently used tunnel cache. */
const CACHED_TUNNELS_KEY = 'tunnelAgentHost.recentTunnels';
/** Storage key for tunnels the user explicitly disconnected. */
const AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY = 'tunnelAgentHost.autoConnectSuppressedTunnels';

/** Whether `selection` picked a live `editor` endpoint out of `inventory`. */
function isEditorGatewaySelection(selection: ITunnelGatewaySelection, inventory: ITunnelGatewayInventory): boolean {
	return hasKey(selection, { instanceId: true })
		&& inventory.endpoints.some(endpoint => endpoint.instanceId === selection.instanceId && endpoint.type === 'editor');
}

/**
 * Whether the tunnel-failover tracker/notification step should run at all
 * for a completed `connect()` attempt. Must be `false` whenever the
 * attempt is ultimately a failure — including a registered-for-upgrade
 * incompatible handshake (`connectError` set) — even though
 * `addManagedConnection` already succeeded and the endpoint is registered.
 * A failed reconnect must never update {@link TunnelFailoverTracker} or
 * notify: the tracker would otherwise record an endpoint the caller never
 * actually got a working connection to, and a subsequent real reconnect
 * could then silently skip a notification it should have shown (or vice
 * versa). Exported so this ordering guard can be unit tested without
 * constructing the full service.
 */
export function shouldTrackTunnelConnection(connectError: unknown): boolean {
	return !connectError;
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

	/** See {@link TunnelFailoverTracker}. */
	private readonly _failoverTracker = new TunnelFailoverTracker();

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
		@IRemoteAgentHostLocationPreferenceService private readonly _locationPreferenceService: IRemoteAgentHostLocationPreferenceService,
		@IDialogService private readonly _dialogService: IDialogService,
		@INotificationService private readonly _notificationService: INotificationService,
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

		this._logService.info(`${LOG_PREFIX} Connecting to tunnel '${tunnel.name}' (${tunnel.tunnelId})`);

		// Protocol-v6 tunnels expose a registry-based endpoint selection
		// gateway: prepare it first and resolve a target by the user's saved
		// location preference before completing the connection. Protocol-v5
		// tunnels have no gateway — `prepareSelection` returns `undefined`
		// and we fall back to the legacy direct-connect path with no prompt.
		const session = await this._mainService.prepareSelection(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
		let result: ITunnelConnectResult;
		let editorFallback = false;
		if (session) {
			const selection = await resolveGatewaySelection(this._locationPreferenceService, this._dialogService, {
				hostKey: `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`,
				hostLabel: tunnel.name,
				productName: this._productService.nameShort,
				inventory: session.inventory,
				userInitiated: options?.userInitiated ?? true,
			});
			if (!selection) {
				this._logService.info(options?.userInitiated === false
					? `${LOG_PREFIX} Deferring tunnel '${tunnel.name}' until the user chooses an agent host location`
					: `${LOG_PREFIX} Agent host selection cancelled for tunnel '${tunnel.name}'`);
				await this._mainService.cancelSelection(session.selectionId);
				return;
			}
			const completed = await this._completeSelectionWithFallback(auth, tunnel, session, selection);
			result = completed.result;
			editorFallback = completed.editorFallback;
		} else {
			result = await this._mainService.connect(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
		}
		this._logService.info(`${LOG_PREFIX} Tunnel relay connected, connectionId=${result.connectionId}`);

		// Build relay transport + protocol client. If construction itself
		// fails (rare — would mean the AHP logger or transport ctor threw)
		// tear the just-opened main-side relay down before propagating.
		let protocolClient: AgentHostProtocolClient;
		try {
			const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
			let useSeedConnection = true;
			const establish = async (): Promise<IRelayConnectionHandle> => {
				if (useSeedConnection) {
					useSeedConnection = false;
					// The initial relay belongs to the managed connection's transport disposable.
					return { connectionId: result.connectionId };
				}
				return this._establishBackgroundRelay(tunnel, auth.provider);
			};
			const transportFactory = () => new ReconnectingRelayTransport(
				establish,
				this._mainService,
				() => ahpLoggingEnabled ? this._instantiationService.createInstance(
					AhpJsonlLogger,
					{ logsHome: this._environmentService.logsHome, connectionId: result.connectionId, transport: 'tunnel' },
				) : undefined,
				this._logService,
				LOG_PREFIX,
				AgentHostClientConnectionKind.DevTunnel,
			);
			protocolClient = this._instantiationService.createInstance(
				AgentHostProtocolClient, result.address, transportFactory, { clientInfo: agentsWindowAgentHostClientInfo },
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

		const transportDisposable = toDisposable(() => {
			this._mainService.disconnect(result.connectionId).catch(() => { /* best effort */ });
		});
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
			}, protocolClient, transportDisposable, status);
		} catch (err) {
			this._logService.error(`${LOG_PREFIX} addManagedConnection failed`, err);
			protocolClient.dispose();
			transportDisposable.dispose();
			throw err;
		}

		if (!shouldTrackTunnelConnection(connectError)) {
			throw connectError;
		}

		this._notifyIfTunnelFailover(result, options, editorFallback);
	}

	private async _establishBackgroundRelay(tunnel: ITunnelInfo, authProvider: 'github' | 'microsoft'): Promise<IRelayConnectionHandle> {
		// Resolve a current cached token per attempt; reconnects must never prompt.
		const auth = await this._getTokenForProvider(authProvider, true);
		if (!auth) {
			throw new NonReconnectableTransportError('No cached authentication available to reconnect the tunnel.');
		}

		try {
			const session = await this._mainService.prepareSelection(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
			let result: ITunnelConnectResult;
			if (session) {
				const selection = await resolveGatewaySelection(this._locationPreferenceService, this._dialogService, {
					hostKey: `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`,
					hostLabel: tunnel.name,
					productName: this._productService.nameShort,
					inventory: session.inventory,
					userInitiated: false,
				});
				if (!selection) {
					await this._mainService.cancelSelection(session.selectionId);
					throw new NonReconnectableTransportError('Tunnel agent host selection requires user interaction.');
				}
				result = (await this._completeSelectionWithFallback(auth, tunnel, session, selection)).result;
			} else {
				result = await this._mainService.connect(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
			}

			const connectionId = result.connectionId;
			return {
				connectionId,
				close: () => this._mainService.disconnect(connectionId),
			};
		} catch (err) {
			if (isTunnelNotFoundError(err)) {
				throw new NonReconnectableTransportError(err.message);
			}
			throw err;
		}
	}

	/**
	 * Send `selection` over the prepared gateway session and, if the gateway
	 * *rejects* it, transparently retry once using a fresh inventory.
	 *
	 * A rejection (see {@link isTunnelGatewaySelectionRejectedError}) is the
	 * one failure that proves the tunnel itself is healthy: the CLI answered,
	 * it simply could not hand us the endpoint we asked for because that
	 * agent host is no longer alive. Its registry entry can outlive it (the
	 * entry is only pruned once the owning PID dies, which a crashed or
	 * detached editor agent host may not do promptly), so the inventory keeps
	 * advertising it and every reconnect would otherwise pick it again and
	 * fail — the connection stays down for the whole backoff window instead
	 * of failing over. Undelegated tunnels can fail over to a dedicated host
	 * within the same attempt; delegated tunnels retry only their bound editor
	 * host, which prevents creating an orphaned dedicated host.
	 *
	 * Every other failure means the tunnel is unreachable, and is rethrown so
	 * the caller keeps retrying the same destination and selection unchanged.
	 * The stored location preference is never mutated by a fallback, so the
	 * editor host is preferred again as soon as it is back.
	 */
	private async _completeSelectionWithFallback(
		auth: { readonly token: string; readonly provider: 'github' | 'microsoft' },
		tunnel: ITunnelInfo,
		session: ITunnelGatewaySelectionSession,
		selection: ITunnelGatewaySelection,
	): Promise<{ readonly result: ITunnelConnectResult; readonly editorFallback: boolean }> {
		try {
			return { result: await this._mainService.completeSelection(session.selectionId, selection), editorFallback: false };
		} catch (err) {
			if (!isTunnelGatewaySelectionRejectedError(err)) {
				throw err;
			}
			const wasEditor = isEditorGatewaySelection(selection, session.inventory);
			this._logService.warn(`${LOG_PREFIX} Gateway rejected the selected agent host for tunnel '${tunnel.name}', retrying an allowed agent host: ${err instanceof Error ? err.message : String(err)}`);

			// The rejected attempt consumed the gateway socket, so a fresh
			// session is needed — which also yields a fresh inventory to pick
			// the fallback from.
			const retry = await this._mainService.prepareSelection(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
			if (!retry) {
				throw err;
			}
			const fallback = selectGatewayFallbackAfterRejection(selection, retry.inventory);
			if (!fallback) {
				await this._mainService.cancelSelection(retry.selectionId);
				throw err;
			}
			const result = await this._mainService.completeSelection(retry.selectionId, fallback);
			return { result, editorFallback: wasEditor && result.selected.serverType === 'standalone' };
		}
	}

	/**
	 * After a successful {@link addManagedConnection} registration, compare
	 * the newly selected endpoint's server type against the last one
	 * successfully registered for this tunnel's stable address and, if this
	 * was a silent editor → standalone failover, show a single informational
	 * notification. Delegates the retention + decision to
	 * {@link TunnelFailoverTracker}, which always records this connection
	 * for future comparisons regardless of whether a notification was shown.
	 *
	 * `editorFallback` reports that {@link _completeSelectionWithFallback}
	 * already performed the substitution within this very attempt, which
	 * notifies on its own — see {@link shouldNotifyTunnelFailover}.
	 */
	private _notifyIfTunnelFailover(result: ITunnelConnectResult, options: { readonly userInitiated?: boolean } | undefined, editorFallback: boolean): void {
		const userInitiated = options?.userInitiated ?? true;
		const shouldNotify = this._failoverTracker.recordAndShouldNotify(result.address, result.selected.serverType, userInitiated, editorFallback);
		if (shouldNotify) {
			this._notificationService.notify({
				severity: Severity.Info,
				// The in-attempt fallback can happen on a first connect too,
				// where nothing was interrupted and nothing was reconnected.
				message: editorFallback
					? localize(
						'tunnelAgentHostRejectedEditorNotification',
						"The editor agent host is no longer running. Connected to a dedicated agent host instead.",
					)
					: localize(
						'tunnelAgentHostFailoverNotification',
						"The editor agent host exited. Reconnected to a dedicated agent host. In-progress work may have been interrupted.",
					),
			});
		}
	}

	readonly canDeleteTunnels = true;

	async deleteTunnel(tunnel: ITunnelInfo): Promise<void> {
		const auth = await this._getToken(false);
		if (!auth) {
			throw new Error('No authentication available');
		}

		this._logService.info(`${LOG_PREFIX} Deleting tunnel '${tunnel.name}' (${tunnel.tunnelId})`);
		await this._mainService.deleteTunnel(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
		this.removeCachedTunnel(tunnel.tunnelId);
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
