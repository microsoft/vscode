/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import * as nls from '../../../../../nls.js';
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { isTunnelHosted, ITunnelAgentHostService, TUNNEL_ADDRESS_PREFIX, TUNNEL_MIN_PROTOCOL_VERSION, type ITunnelInfo } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IRemoteTunnelService, TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../workbench/services/authentication/common/authentication.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { logTunnelConnectAttempt, logTunnelConnectResolved, logTunnelDiscoveryResult, TunnelDiscoveryTrigger } from '../../../../common/sessionsTelemetry.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { watchForIncompatibleNotifications } from './remoteHostOptions.js';

/** Minimum interval between silent status checks (5 minutes). */
const STATUS_CHECK_INTERVAL = 5 * 60 * 1000;

export class TunnelAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.tunnelAgentHostContribution';

	private readonly _providerStores = this._register(new DisposableMap<string /* address */, DisposableStore>());
	private readonly _providerInstances = new Map<string, RemoteAgentHostSessionsProvider>();
	private readonly _pendingConnects = new Map<string, Promise<void>>();
	private _lastStatusCheck = 0;
	private readonly _hostedTunnelSuppressions = new Set<string>();
	private _remoteTunnelStatus: TunnelStatus = { type: 'uninitialized' };
	private _hasReceivedRemoteTunnelStatus = false;
	/**
	 * `false` until the first {@link _silentStatusCheck} resolves. Until then
	 * we keep newly-created providers in the `Connecting` state so the picker
	 * doesn't briefly show every cached tunnel as "Offline" on startup.
	 */
	private _initialStatusChecked = false;

	private readonly _wiredAddresses = new Set<string>();

	constructor(
		@ITunnelAgentHostService private readonly _tunnelService: ITunnelAgentHostService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IHostService private readonly _hostService: IHostService,
		@IRemoteTunnelService private readonly _remoteTunnelService: IRemoteTunnelService,
		@IAgentHostFilterService agentHostFilterService: IAgentHostFilterService,
	) {
		super();

		this._syncHostedTunnelSuppression();
		// Create providers for cached tunnels
		this._reconcileProviders();

		// Plug our silent status check into the shared host picker UX so
		// the user-triggered "Re-discover hosts" action runs the same
		// discovery routine.
		this._register(agentHostFilterService.registerDiscoveryHandler(() => this._silentStatusCheck()));

		// Update connection statuses when connections change
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._updateConnectionStatuses();
			this._wireConnections();
		}));

		// Reconcile providers when the tunnel cache changes
		this._register(this._tunnelService.onDidChangeTunnels(() => {
			this._syncHostedTunnelSuppression();
			this._reconcileProviders();
		}));

		this._register(this._remoteTunnelService.onDidChangeTunnelStatus(status => {
			this._hasReceivedRemoteTunnelStatus = true;
			this._remoteTunnelStatus = status;
			this._syncHostedTunnelSuppression();
			void this._silentStatusCheck();
		}));
		void this._loadRemoteTunnelStatus();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._reconcileProviders();
			}
		}));

		// Re-run discovery when a GitHub session becomes available,
		// and tear down tunnel state bound to that provider if its session
		// is removed.
		this._register(this._authenticationService.onDidChangeSessions(e => {
			if (e.providerId !== 'github') {
				return;
			}
			this._handleSessionsChange(e);
		}));

		this._register(this._hostService.onDidChangeFocus(focused => {
			if (focused) {
				void this._silentStatusCheck();
				this._requestServiceReconnects();
			}
		}));

		// Silently check status of cached tunnels on startup. Routed
		// through the filter service's `rediscover` so the host pill
		// pulses while the initial automatic discovery is in flight,
		// then switches to a static label once we know what hosts exist.
		agentHostFilterService.rediscover();
	}

	/**
	 * Called by the workspace picker when it opens. Silently re-checks
	 * tunnel statuses if more than 5 minutes have elapsed since the last check.
	 */
	async checkTunnelStatuses(): Promise<void> {
		if (Date.now() - this._lastStatusCheck < STATUS_CHECK_INTERVAL) {
			return;
		}
		await this._silentStatusCheck();
	}

	// -- Provider management --

	private _reconcileProviders(): void {
		const enabled = this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
		const cached = enabled ? this._getProviderTunnels() : [];
		const desiredAddresses = new Set(cached.map(t => `${TUNNEL_ADDRESS_PREFIX}${t.tunnelId}`));

		// Remove providers no longer cached
		for (const [address] of this._providerStores) {
			if (!desiredAddresses.has(address)) {
				this._providerStores.deleteAndDispose(address);
				this._providerInstances.delete(address);
			}
		}

		// Add providers for cached tunnels
		for (const tunnel of cached) {
			const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
			if (!this._providerStores.has(address)) {
				this._createProvider(address, tunnel.name);
			}
		}
	}

	private _getProviderTunnels() {
		return this._tunnelService.getCachedTunnels().filter(tunnel => !this._tunnelService.isTunnelDismissed(tunnel.tunnelId));
	}

	private _isHostedTunnel(tunnel: Pick<ITunnelInfo, 'tunnelId' | 'name'>): boolean {
		return isTunnelHosted(this._remoteTunnelStatus.type === 'connected' ? this._remoteTunnelStatus.info : undefined, tunnel);
	}

	private async _loadRemoteTunnelStatus(): Promise<void> {
		const status = await this._remoteTunnelService.getTunnelStatus();
		if (!this._hasReceivedRemoteTunnelStatus) {
			this._remoteTunnelStatus = status;
		}
		this._syncHostedTunnelSuppression();
	}

	private _syncHostedTunnelSuppression(): void {
		const hostedTunnelIds = new Set<string>();
		for (const tunnel of this._tunnelService.getCachedTunnels()) {
			if (!this._isHostedTunnel(tunnel)) {
				continue;
			}
			hostedTunnelIds.add(tunnel.tunnelId);
			if (!this._tunnelService.isAutoConnectSuppressed(tunnel.tunnelId)) {
				this._hostedTunnelSuppressions.add(tunnel.tunnelId);
				this._tunnelService.suppressAutoConnect(tunnel.tunnelId);
			}
			const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
			if (this._remoteAgentHostService.connections.some(connection => connection.address === address && RemoteAgentHostConnectionStatus.isConnected(connection.status))) {
				void this._tunnelService.disconnect(address);
			}
		}
		for (const tunnelId of this._hostedTunnelSuppressions) {
			if (!hostedTunnelIds.has(tunnelId)) {
				this._hostedTunnelSuppressions.delete(tunnelId);
				this._tunnelService.clearAutoConnectSuppression(tunnelId);
			}
		}
	}

	private _createProvider(address: string, name: string): void {
		const store = new DisposableStore();
		const provider = this._instantiateProvider(address, name);
		// Surface as "Connecting" until the first silent status check determines
		// the real state; otherwise the picker
		// flashes "Offline" for every cached tunnel on startup.
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
		store.add(provider);
		store.add(this._sessionsProvidersService.registerProvider(provider));
		store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
		this._providerInstances.set(address, provider);
		store.add(toDisposable(() => {
			this._providerInstances.delete(address);
			this._wiredAddresses.delete(address);
		}));
		this._providerStores.set(address, store);
	}

	protected _instantiateProvider(address: string, name: string): RemoteAgentHostSessionsProvider {
		return this._instantiationService.createInstance(
			RemoteAgentHostSessionsProvider, {
			address,
			name,
			connectOnDemand: () => this._connectTunnel(address, { userInitiated: true }),
			disconnectOnDemand: () => this._disconnectTunnel(address),
		},
		);
	}

	// -- Connection status --

	private _updateConnectionStatuses(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (connectionInfo) {
				// Service has an entry — its status is authoritative
				// (including incompatible from the WebSocket connect
				// failure path, and connecting/reconnecting/connected from a
				// fresh reconnect after an upgrade).
				provider.setConnectionStatus(connectionInfo.status);
				continue;
			}
			// The service retains incompatible connections for upgrade support.
			if (RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
				continue;
			}
			if (this._pendingConnects.has(address)) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
			} else if (!this._initialStatusChecked) {
				// Keep the initial "Connecting" state so the picker doesn't
				// flash "Offline" before the first silent status check runs.
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
			} else {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
			}
		}
	}

	/**
	 * Wire live connections to their providers so session operations work, and
	 * drop a provider's connection once its transport is gone.
	 */
	private _wireConnections(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (connectionInfo && RemoteAgentHostConnectionStatus.isConnected(connectionInfo.status)) {
				const connection = this._remoteAgentHostService.getConnection(address);
				if (connection) {
					provider.setConnection(connection, connectionInfo.defaultDirectory);
					this._wiredAddresses.add(address);
				}
			} else if (this._wiredAddresses.has(address)
				&& !RemoteAgentHostConnectionStatus.isConnecting(connectionInfo?.status)
				&& !RemoteAgentHostConnectionStatus.isReconnecting(connectionInfo?.status)) {
				// Keep the provider live while a replacement transport is connecting or reconnecting.
				this._wiredAddresses.delete(address);
				provider.clearConnection();
			}
		}
	}

	// -- On-demand connection --

	/**
	 * Establish a relay connection to a cached tunnel. Called on demand
	 * when the user invokes the browse action on an online-but-not-connected tunnel.
	 */
	private _connectTunnel(address: string, options: { readonly userInitiated: boolean }): Promise<void> {
		const existing = this._pendingConnects.get(address);
		if (existing) {
			return existing;
		}

		const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
		if (options.userInitiated) {
			this._tunnelService.clearTunnelDismissal(tunnelId);
		}
		const cached = this._tunnelService.getCachedTunnels().find(t => t.tunnelId === tunnelId);
		const attemptStart = Date.now();
		const promise = (async () => {
			let handle: { close(): void } | undefined;
			const timer = options.userInitiated && cached ? setTimeout(() => {
				handle = this._notificationService.notify({
					severity: Severity.Info,
					message: nls.localize('tunnelConnecting', "Connecting to tunnel '{0}'...", cached.name),
					progress: { infinite: true },
				});
			}, 1000) : undefined;

			try {
				if (!cached || this._isHostedTunnel(cached)) {
					return;
				}
				const tunnelInfo: ITunnelInfo = {
					tunnelId: cached.tunnelId,
					clusterId: cached.clusterId,
					name: cached.name,
					tags: [],
					// Legacy cache fallback, not a real capability claim.
					protocolVersion: cached.protocolVersion ?? TUNNEL_MIN_PROTOCOL_VERSION,
					hostConnectionCount: 0,
				};
				await this._tunnelService.connect(tunnelInfo, cached.authProvider, { userInitiated: options.userInitiated });
				logTunnelConnectAttempt(this._telemetryService, { isReconnect: false, attempt: 1, durationMs: Date.now() - attemptStart, success: true });
				logTunnelConnectResolved(this._telemetryService, { isReconnect: false, totalAttempts: 1, totalDurationMs: Date.now() - attemptStart, success: true });
			} catch (err) {
				this._logService.warn(`[TunnelAgentHost] Connect to ${cached?.name ?? address} failed:`, err);
				logTunnelConnectAttempt(this._telemetryService, { isReconnect: false, attempt: 1, durationMs: Date.now() - attemptStart, success: false, errorCategory: 'other' });
				logTunnelConnectResolved(this._telemetryService, { isReconnect: false, totalAttempts: 1, totalDurationMs: Date.now() - attemptStart, success: false });
				throw err;
			} finally {
				if (timer !== undefined) {
					clearTimeout(timer);
				}
				handle?.close();
				this._pendingConnects.delete(address);
				this._updateConnectionStatuses();
			}
		})();

		this._pendingConnects.set(address, promise);
		return promise;
	}

	/**
	 * Dismiss a tunnel from the remote-host picker and tear down its active relay.
	 */
	private async _disconnectTunnel(address: string): Promise<void> {
		const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
		this._tunnelService.dismissTunnel(tunnelId);
		this._tunnelService.removeCachedTunnel(tunnelId);
		await this._tunnelService.disconnect(address);
	}

	private _requestServiceReconnects(): void {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostAutoConnectSettingId)) {
			return;
		}
		for (const tunnel of this._tunnelService.getCachedTunnels()) {
			if (this._isHostedTunnel(tunnel) || this._tunnelService.isAutoConnectSuppressed(tunnel.tunnelId)) {
				continue;
			}
			const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
			const status = this._remoteAgentHostService.connections.find(connection => connection.address === address)?.status;
			if (RemoteAgentHostConnectionStatus.isConnected(status)
				|| RemoteAgentHostConnectionStatus.isConnecting(status)
				|| RemoteAgentHostConnectionStatus.isReconnecting(status)
				|| RemoteAgentHostConnectionStatus.isIncompatible(status)) {
				continue;
			}
			this._remoteAgentHostService.reconnect(address, false);
		}
	}

	private _handleSessionsChange(e: { providerId: string; label: string; event: AuthenticationSessionsChangeEvent }): void {
		if ((e.event.removed?.length ?? 0) > 0) {
			for (const tunnel of this._tunnelService.getCachedTunnels()) {
				if (tunnel.authProvider === e.providerId) {
					void this._tunnelService.disconnect(`${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`);
				}
			}
		}
		if ((e.event.added?.length ?? 0) > 0) {
			void this._silentStatusCheck('sessionChange');
		}
	}

	// -- Silent status check --

	private async _silentStatusCheck(trigger?: TunnelDiscoveryTrigger): Promise<void> {
		const resolvedTrigger: TunnelDiscoveryTrigger = trigger ?? (this._initialStatusChecked ? 'rediscover' : 'startup');
		const hostsEnabled = this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
		const autoConnectEnabled = this._configurationService.getValue<boolean>(RemoteAgentHostAutoConnectSettingId);
		if (!hostsEnabled) {
			this._initialStatusChecked = true;
			this._updateConnectionStatuses();
			logTunnelDiscoveryResult(this._telemetryService, {
				trigger: resolvedTrigger,
				totalFound: 0,
				withActiveHost: 0,
				cachedBefore: this._tunnelService.getCachedTunnels().length,
				autoConnectEnabled,
				hostsEnabled,
				success: true,
			});
			return;
		}

		this._lastStatusCheck = Date.now();
		const cachedBefore = this._tunnelService.getCachedTunnels().length;

		// Fetch tunnel list silently to check online status
		let onlineTunnels: ITunnelInfo[] | undefined;
		try {
			onlineTunnels = await this._tunnelService.listTunnels({ silent: true });
		} catch {
			// No cached token or network error — leave statuses as-is
			this._initialStatusChecked = true;
			this._updateConnectionStatuses();
			logTunnelDiscoveryResult(this._telemetryService, {
				trigger: resolvedTrigger,
				totalFound: 0,
				withActiveHost: 0,
				cachedBefore,
				autoConnectEnabled,
				hostsEnabled,
				success: false,
			});
			return;
		}

		const cached = this._tunnelService.getCachedTunnels();
		if (onlineTunnels) {
			const onlineIds = new Set(onlineTunnels.map(t => t.tunnelId));
			// Remove cached tunnels that no longer exist on the account
			for (const tunnel of cached) {
				if (!onlineIds.has(tunnel.tunnelId)) {
					this._tunnelService.removeCachedTunnel(tunnel.tunnelId);
				}
			}

			// Auto-cache every discovered tunnel that isn't cached yet so
			// it appears in the picker on first discovery (e.g. fresh web
			// session), including tunnels whose host process is currently
			// offline — those render grayed-out via the status-update loop
			// below. Pass 'github' as authProvider so _handleSessionsChange
			// can match these tunnels for teardown on session removal.
			const cachedIds = new Set(cached.map(t => t.tunnelId));
			for (const tunnel of onlineTunnels) {
				if (!cachedIds.has(tunnel.tunnelId) && !this._tunnelService.isTunnelDismissed(tunnel.tunnelId)) {
					this._tunnelService.cacheTunnel(tunnel, 'github');
				}
			}

			// Update online/offline status based on hostConnectionCount for
			// tunnels that do not currently have a service-owned connection.
			const onlineTunnelMap = new Map(onlineTunnels.map(t => [t.tunnelId, t]));
			for (const [address, provider] of this._providerInstances) {
				// Skip tunnels that already have an active relay connection
				// A reconnecting protocol client is already restoring this relay.
				const hasConnection = this._remoteAgentHostService.connections.some(
					c => c.address === address && (RemoteAgentHostConnectionStatus.isConnected(c.status) || RemoteAgentHostConnectionStatus.isReconnecting(c.status))
				);
				if (hasConnection) {
					continue;
				}

				const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
				const info = onlineTunnelMap.get(tunnelId);
				if (info && info.hostConnectionCount > 0) {
					provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connected);

				} else {
					provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
					// Host is not online — drop any cached sessions we were
					// showing for it so the UI doesn't list stale entries.
					provider.unpublishCachedSessions();
				}
			}

		}

		this._initialStatusChecked = true;
		this._updateConnectionStatuses();

		const totalFound = onlineTunnels?.length ?? 0;
		const withActiveHost = onlineTunnels?.filter(t => t.hostConnectionCount > 0).length ?? 0;
		this._logService.info(
			`[TunnelAgentHost] Silent status check (${resolvedTrigger}): totalFound=${totalFound}, withActiveHost=${withActiveHost}, cachedBefore=${cachedBefore}, autoConnect=${autoConnectEnabled}`
		);
		logTunnelDiscoveryResult(this._telemetryService, {
			trigger: resolvedTrigger,
			totalFound,
			withActiveHost,
			cachedBefore,
			autoConnectEnabled,
			hostsEnabled,
			success: true,
		});
	}
}

registerWorkbenchContribution2(TunnelAgentHostContribution.ID, TunnelAgentHostContribution, WorkbenchPhase.AfterRestored);
