/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ITunnelAgentHostService, TUNNEL_ADDRESS_PREFIX, type ITunnelInfo } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';

/** Minimum interval between silent status checks (5 minutes). */
const STATUS_CHECK_INTERVAL = 5 * 60 * 1000;

export class TunnelAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.tunnelAgentHostContribution';

	private readonly _providerStores = this._register(new DisposableMap<string /* address */, DisposableStore>());
	private readonly _providerInstances = new Map<string, RemoteAgentHostSessionsProvider>();
	private readonly _pendingConnects = new Map<string, Promise<void>>();
	private _lastStatusCheck = 0;

	constructor(
		@ITunnelAgentHostService private readonly _tunnelService: ITunnelAgentHostService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();

		// Create providers for cached tunnels
		this._reconcileProviders();

		// Update connection statuses when connections change
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._updateConnectionStatuses();
			this._wireConnections();
		}));

		// Reconcile providers when the tunnel cache changes
		this._register(this._tunnelService.onDidChangeTunnels(() => {
			this._reconcileProviders();
		}));

		// Silently check status of cached tunnels on startup
		this._silentStatusCheck();
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
		const cached = enabled ? this._tunnelService.getCachedTunnels() : [];
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

	private _createProvider(address: string, name: string): void {
		const store = new DisposableStore();
		const provider = this._instantiationService.createInstance(
			RemoteAgentHostSessionsProvider, {
			address,
			name,
			connectOnDemand: () => this._connectTunnel(address),
		},
		);
		store.add(provider);
		store.add(this._sessionsProvidersService.registerProvider(provider));
		this._providerInstances.set(address, provider);
		store.add(toDisposable(() => this._providerInstances.delete(address)));
		this._providerStores.set(address, store);
	}

	// -- Connection status --

	private _updateConnectionStatuses(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (connectionInfo) {
				provider.setConnectionStatus(connectionInfo.status);
			} else if (this._pendingConnects.has(address)) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.Connecting);
			} else {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.Disconnected);
			}
		}
	}

	/**
	 * Wire live connections to their providers so session operations work.
	 */
	private _wireConnections(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(
				c => c.address === address && c.status === RemoteAgentHostConnectionStatus.Connected
			);
			if (connectionInfo) {
				const connection = this._remoteAgentHostService.getConnection(address);
				if (connection) {
					provider.setConnection(connection, connectionInfo.defaultDirectory);
				}
			}
		}
	}

	// -- On-demand connection --

	/**
	 * Establish a relay connection to a cached tunnel. Called on demand
	 * when the user invokes the browse action on an online-but-not-connected tunnel.
	 */
	private _connectTunnel(address: string): Promise<void> {
		const existing = this._pendingConnects.get(address);
		if (existing) {
			return existing;
		}

		const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
		const cached = this._tunnelService.getCachedTunnels().find(t => t.tunnelId === tunnelId);
		if (!cached) {
			return Promise.resolve();
		}

		const promise = (async () => {
			// Show a progress notification after a short delay so quick
			// connects don't flash a notification.
			let handle: { close(): void } | undefined;
			const timer = setTimeout(() => {
				handle = this._notificationService.notify({
					severity: Severity.Info,
					message: nls.localize('tunnelConnecting', "Connecting to tunnel '{0}'...", cached.name),
					progress: { infinite: true },
				});
			}, 1000);

			this._updateConnectionStatuses();
			try {
				const tunnelInfo: ITunnelInfo = {
					tunnelId: cached.tunnelId,
					clusterId: cached.clusterId,
					name: cached.name,
					tags: [],
					protocolVersion: 5,
					hostConnectionCount: 0,
				};
				await this._tunnelService.connect(tunnelInfo, cached.authProvider);
			} finally {
				clearTimeout(timer);
				handle?.close();
				this._pendingConnects.delete(address);
				this._updateConnectionStatuses();
			}
		})();

		this._pendingConnects.set(address, promise);
		return promise;
	}

	// -- Silent status check --

	private async _silentStatusCheck(): Promise<void> {
		const enabled = this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
		if (!enabled) {
			return;
		}

		this._lastStatusCheck = Date.now();

		// Fetch tunnel list silently to check online status
		let onlineTunnels: ITunnelInfo[] | undefined;
		try {
			onlineTunnels = await this._tunnelService.listTunnels({ silent: true });
		} catch {
			// No cached token or network error — leave statuses as-is
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

			// Update online/offline status based on hostConnectionCount.
			// For tunnels, Connected means "host is online" (clickable to connect),
			// Disconnected means "host is offline". Actual relay connection
			// establishment happens when the user clicks the tunnel.
			const onlineTunnelMap = new Map(onlineTunnels.map(t => [t.tunnelId, t]));
			for (const [address, provider] of this._providerInstances) {
				// Skip tunnels that already have an active relay connection
				const hasConnection = this._remoteAgentHostService.connections.some(
					c => c.address === address && c.status === RemoteAgentHostConnectionStatus.Connected
				);
				if (hasConnection) {
					continue;
				}

				const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
				const info = onlineTunnelMap.get(tunnelId);
				if (info && info.hostConnectionCount > 0) {
					provider.setConnectionStatus(RemoteAgentHostConnectionStatus.Connected);
				} else {
					provider.setConnectionStatus(RemoteAgentHostConnectionStatus.Disconnected);
				}
			}
		}
	}
}

registerWorkbenchContribution2(TunnelAgentHostContribution.ID, TunnelAgentHostContribution, WorkbenchPhase.AfterRestored);
