/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { type IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, getEntryAddress, getEntryTypeConfig } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
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
 * How often to look for cached distros that have started since the last check.
 *
 * A stopped distro fails to connect terminally, so no retry stays armed for it.
 * WSL raises no event when a distro boots, and the user may well start one
 * outside VS Code, so this poll is the only way a cached host recovers without
 * a manual action or a reload.
 */
const WSL_RUNNING_POLL_MS = 5 * 60 * 1000;

/**
 * Manages session providers for WSL-backed remote agent hosts. The remote
 * agent host service owns automatic dialing and retry of cached distros.
 */
export class WSLAgentHostContribution extends ManagedReconnectAgentHostContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.wslAgentHostContribution';

	protected readonly _entryType = RemoteAgentHostEntryType.WSL;

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

		this._register(new IntervalTimer()).cancelAndSet(() => this._reconnectNewlyRunningDistros(), WSL_RUNNING_POLL_MS);

		this._reconcile();
	}

	/**
	 * Ask the service to redial cached distros that are running but not
	 * connected. Discovery is this contribution's job; the dial itself stays
	 * with the service, which owns every connection's lifecycle.
	 */
	private async _reconnectNewlyRunningDistros(): Promise<void> {
		if (!this._enabled) {
			return;
		}
		const entries = this._getProviderEntries();
		if (entries.length === 0) {
			return;
		}
		const running = new Set(await this._wslService.listRunningDistros().catch(() => []));
		for (const entry of entries) {
			if (entry.connection.type !== RemoteAgentHostEntryType.WSL || !running.has(entry.connection.distro)) {
				continue;
			}
			const address = getEntryAddress(entry);
			if (this._remoteAgentHostService.connections.some(connection => connection.address === address)) {
				continue;
			}
			this._logService.info(`[RemoteAgentHost] WSL distro '${entry.connection.distro}' is running again; reconnecting`);
			this._remoteAgentHostService.reconnect(address, false);
		}
	}

	protected override _getProviderEntries(): readonly IRemoteAgentHostEntry[] {
		if (!this._enabled) {
			return [];
		}
		return this._wslService.getCachedDistros().map<IRemoteAgentHostEntry>(({ distro, name }) => ({
			name,
			connection: {
				type: RemoteAgentHostEntryType.WSL,
				address: `${WSL_ADDRESS_PREFIX}${distro}`,
				distro,
			},
		}));
	}

	protected override _getProviderOptions(entry: IRemoteAgentHostEntry) {
		if (entry.connection.type !== RemoteAgentHostEntryType.WSL) {
			return {};
		}
		const { distro, address } = entry.connection;
		return {
			connectOnDemand: () => this._connectWSLOnDemand(distro, entry.name, address),
			disconnectOnDemand: () => this._disconnectWSLOnDemand(distro, address),
			onDidReportConnectProgress: this._wslService.onDidReportConnectProgress,
		};
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
		// Drop the cached distro before tearing the connection down: the cached
		// entry is what makes this address desired, so removing the connection
		// first would let reconciliation re-dial it right back.
		await this._wslService.disconnect(distro);
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
		this._reconcile();
	}
}

registerWorkbenchContribution2(WSLAgentHostContribution.ID, WSLAgentHostContribution, WorkbenchPhase.AfterRestored);
