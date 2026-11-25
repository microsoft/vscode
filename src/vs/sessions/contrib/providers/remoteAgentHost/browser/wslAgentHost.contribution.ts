/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer, RunOnceScheduler } from '../../../../../base/common/async.js';
import { isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { localize } from '../../../../../nls.js';
import { type IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, getEntryAddress, getEntryTypeConfig } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IWSLRemoteAgentHostService, WSL_ADDRESS_PREFIX, WslAutoStartSettingId } from '../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { type IAgentHostAutoConnect } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ManagedReconnectAgentHostContribution } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/managedReconnectAgentHostContribution.js';

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

	private readonly _autoConnect: IAgentHostAutoConnect = {
		label: localize('wslAgentHost.autoStart', "Automatically Start WSL When Opening Chats"),
		enabled: observableConfigValue(WslAutoStartSettingId, false, this._configurationService),
		setEnabled: enabled => {
			this._configurationService.updateValue(WslAutoStartSettingId, enabled).catch(onUnexpectedError);
		},
	};

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

		// Factory registration can fire while the lazy WSL service is still constructing.
		const reconcileEntries = this._register(new RunOnceScheduler(() => this._reconcile(), 0));
		this._register(this._remoteAgentHostService.onDidChangeConfiguredEntries(() => reconcileEntries.schedule()));
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
			if (entry.connection.type !== RemoteAgentHostEntryType.WSL || !running.has(entry.connection.distro) || this._wslService.isDisconnected(entry.connection.distro)) {
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

	protected override _reconcile(): void {
		super._reconcile();
		for (const [address, provider] of this._providerInstances) {
			// Without a connection nothing reports its status. Like other disconnected remotes, it lists no sessions until connected again.
			if (address.startsWith(WSL_ADDRESS_PREFIX) && this._wslService.isDisconnected(address.slice(WSL_ADDRESS_PREFIX.length)) && !this._remoteAgentHostService.connections.some(connection => connection.address === address)) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
				provider.unpublishCachedSessions();
			}
		}
	}

	protected override _getProviderOptions(entry: IRemoteAgentHostEntry) {
		if (entry.connection.type !== RemoteAgentHostEntryType.WSL) {
			return {};
		}
		const { distro, address } = entry.connection;
		return {
			connectOnDemand: () => this._connectWSLOnDemand(distro, entry.name, address),
			disconnectOnDemand: () => this._disconnectWSLOnDemand(distro, address),
			removeOnDemand: () => this._removeWSLOnDemand(distro, address),
			onDidReportConnectProgress: this._wslService.onDidReportConnectProgress,
			autoConnect: this._autoConnect,
		};
	}

	private async _connectWSLOnDemand(distro: string, name: string, address: string): Promise<void> {
		while (true) {
			const inFlight = this._pendingReconnects.get(distro);
			if (!inFlight) {
				break;
			}
			this._logService.info(`[WSLAgentHost] connectOnDemand: awaiting in-flight reconnect for ${distro}`);
			await inFlight.catch(() => undefined);
			const live = this._remoteAgentHostService.connections.find(connection => connection.address === address);
			if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
				this._logService.info(`[WSLAgentHost] connectOnDemand: ${distro} connected by in-flight reconnect`);
				return;
			}
		}
		this._logService.info(`[WSLAgentHost] connectOnDemand: starting user-initiated reconnect for ${distro}`);
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
		// Mark the distro disconnected before tearing the connection down: that
		// removes it from the connectable entries, so reconciliation cannot re-dial
		// it, while the cached distro keeps its provider to connect again from.
		await this._wslService.disconnect(distro, { keepEntry: true });
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
		this._reconcile();
	}

	private async _removeWSLOnDemand(distro: string, address: string): Promise<void> {
		this._reconnectStates.deleteAndDispose(distro);
		await this._wslService.disconnect(distro);
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
		this._reconcile();
	}
}

registerWorkbenchContribution2(WSLAgentHostContribution.ID, WSLAgentHostContribution, WorkbenchPhase.AfterRestored);
