/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../../base/common/errors.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, getEntryTypeConfig } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IWSLRemoteAgentHostService, WSL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ManagedReconnectAgentHostContribution } from './managedReconnectAgentHostContribution.js';

export function shouldPauseWSLReconnectAfterFailure(err: unknown): boolean {
	return isCancellationError(err);
}

/**
 * Manages session providers for WSL-backed remote agent hosts. The remote
 * agent host service owns automatic dialing and retry of cached distros.
 */
export class WSLAgentHostContribution extends ManagedReconnectAgentHostContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.wslAgentHostContribution';

	constructor(
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IWSLRemoteAgentHostService private readonly _wslService: IWSLRemoteAgentHostService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@INotificationService notificationService: INotificationService,
	) {
		super(remoteAgentHostService, configurationService, logService, instantiationService, sessionsProvidersService, notificationService);

		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._resumeReconnects('WSL');
			this._reconcile();
		}));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._resumeReconnects('WSL');
				this._reconcile();
			}
		}));

		this._reconcile();
	}

	private _reconcile(): void {
		this._reconcileProviders();
		this._wireConnections();
		this._updateConnectionStatuses();
	}

	private _reconcileProviders(): void {
		const entries = this._enabled ? this._getCachedWSLEntries() : [];
		const desiredAddresses = new Set(entries.map(entry => entry.address));

		for (const [address] of this._providerStores) {
			if (!desiredAddresses.has(address)) {
				this._providerStores.deleteAndDispose(address);
			}
		}

		for (const entry of entries) {
			const existing = this._providerInstances.get(entry.address);
			if (existing && existing.label !== (entry.name || entry.address)) {
				this._providerStores.deleteAndDispose(entry.address);
			}
			if (!this._providerStores.has(entry.address)) {
				this._createProvider(entry.address, entry.name, {
					connectOnDemand: () => this._connectWSLOnDemand(entry.distro, entry.name, entry.address),
					disconnectOnDemand: () => this._disconnectWSLOnDemand(entry.distro, entry.address),
					onDidReportConnectProgress: this._wslService.onDidReportConnectProgress,
				});
			}
		}
	}

	private _wireConnections(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(
				connection => connection.address === address && RemoteAgentHostConnectionStatus.isConnected(connection.status)
			);
			if (connectionInfo) {
				const connection = this._remoteAgentHostService.getConnection(address);
				if (connection) {
					provider.setConnection(connection, connectionInfo.defaultDirectory);
				}
			}
		}
	}

	private _updateConnectionStatuses(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(connection => connection.address === address);
			if (connectionInfo) {
				provider.setConnectionStatus(connectionInfo.status);
			} else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
			}
		}
	}

	private _getCachedWSLEntries(): readonly { distro: string; name: string; address: string }[] {
		return this._wslService.getCachedDistros().map(({ distro, name }) => ({
			distro,
			name,
			address: `${WSL_ADDRESS_PREFIX}${distro}`,
		}));
	}

	private async _connectWSLOnDemand(distro: string, name: string, address: string): Promise<void> {
		while (true) {
			const inFlight = this._pendingReconnects.get(distro);
			if (!inFlight) {
				break;
			}
			await inFlight.catch(() => undefined);
			const live = this._remoteAgentHostService.connections.find(connection => connection.address === address);
			if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
				return;
			}
		}
		this._reconnectStates.get(distro)?.resetForResume();
		await this._attemptWSLReconnect(distro, name, address, true);
	}

	private async _attemptWSLReconnect(distro: string, name: string, address: string, userInitiated: boolean): Promise<void> {
		await this._attemptManagedReconnect({
			kind: 'WSL',
			key: distro,
			address,
			userInitiated,
			reconnectPolicy: getEntryTypeConfig(RemoteAgentHostEntryType.WSL).reconnect,
			shouldPause: shouldPauseWSLReconnectAfterFailure,
			doConnect: () => this._wslService.reconnect(distro, name, userInitiated).then(() => undefined),
		});
	}

	private async _disconnectWSLOnDemand(distro: string, address: string): Promise<void> {
		this._reconnectStates.deleteAndDispose(distro);
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
		await this._wslService.disconnect(distro);
		this._reconcile();
	}
}

registerWorkbenchContribution2(WSLAgentHostContribution.ID, WSLAgentHostContribution, WorkbenchPhase.AfterRestored);
