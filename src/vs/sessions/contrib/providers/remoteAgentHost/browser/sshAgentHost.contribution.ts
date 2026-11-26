/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { autorun, type IObservable } from '../../../../../base/common/observable.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { type IRemoteAgentHostEntry, IRemoteAgentHostService, type IRemoteAgentHostSSHConnection, getEntryAddress, getEntryTypeConfig, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { computeSSHConnectionKey, isSSHAuthenticationFailedError, isSSHHostKeyDeniedError, ISSHRemoteAgentHostService, SSHAuthMethod } from '../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { categorizeSSHConnectError, logSSHConnectAttempt } from '../../../../../workbench/contrib/sessions/common/sessionsTelemetry.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ManagedReconnectAgentHostContribution } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/managedReconnectAgentHostContribution.js';
import { disconnectSSHEntry, sshConnectionKey } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remoteHostOptions.js';

const SSH_RECONNECT_PERIODIC_INTERVAL_MS = 60_000;

/** Returns whether an SSH reconnect failure requires pausing retries. */
export function shouldPauseSSHReconnectAfterFailure(err: unknown): boolean {
	return isCancellationError(err) || isSSHHostKeyDeniedError(err) || isSSHAuthenticationFailedError(err);
}

export class SSHAgentHostContribution extends ManagedReconnectAgentHostContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.sshAgentHostContribution';

	protected readonly _entryType = RemoteAgentHostEntryType.SSH;

	private readonly _disconnectedEntries: IObservable<readonly IRemoteAgentHostEntry[]>;

	constructor(
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@ISSHRemoteAgentHostService private readonly _sshService: ISSHRemoteAgentHostService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@INotificationService notificationService: INotificationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super(remoteAgentHostService, configurationService, logService, instantiationService, sessionsProvidersService, notificationService);

		// Resolve the lazy SSH service before listening: constructing it registers
		// its connection factory, which fires entry changes that would reconcile
		// against the service while it is still constructing.
		this._disconnectedEntries = this._sshService.disconnectedEntries;

		this._register(this._remoteAgentHostService.onDidChangeConfiguredEntries(() => this._reconcile()));
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcile()));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._reconcile();
			}
		}));

		// The connection service owns retries; the periodic sweep only reconciles providers.
		this._register(new IntervalTimer()).cancelAndSet(() => this._reconcile(), SSH_RECONNECT_PERIODIC_INTERVAL_MS);

		// Disconnecting or connecting a remote again changes which entries are connectable.
		this._register(autorun(reader => {
			this._disconnectedEntries.read(reader);
			this._reconcile();
		}));
	}

	protected override _getProviderEntries(): readonly IRemoteAgentHostEntry[] {
		const entries = super._getProviderEntries();
		if (!this._enabled) {
			return entries;
		}
		// A remote the user disconnected is not dialed, so it has no configured entry; it keeps a provider to connect it from.
		const configured = new Set(entries.map(entry => getEntryAddress(entry)));
		const disconnected = this._disconnectedEntries.get().filter(entry => !configured.has(getEntryAddress(entry)));
		return disconnected.length ? [...entries, ...disconnected] : entries;
	}

	protected override _reconcile(): void {
		super._reconcile();
		const disconnected = new Set(this._disconnectedEntries.get().map(entry => getEntryAddress(entry)));
		for (const [address, provider] of this._providerInstances) {
			// Without a connection nothing reports its status. Like other disconnected remotes, it lists no sessions until connected again.
			if (disconnected.has(address) && !this._remoteAgentHostService.connections.some(connection => connection.address === address)) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
				provider.unpublishCachedSessions();
			}
		}
	}

	protected override _getProviderOptions(entry: IRemoteAgentHostEntry) {
		if (entry.connection.type !== RemoteAgentHostEntryType.SSH) {
			return {};
		}
		const connection = entry.connection;
		const address = getEntryAddress(entry);
		return {
			connectOnDemand: () => this._connectSSHOnDemand(connection, entry.name, address),
			disconnectOnDemand: () => this._disconnectSSHOnDemand(connection),
			removeOnDemand: () => this._removeSSHOnDemand(connection),
			preferenceKey: computeSSHConnectionKey({
				sshConfigHost: connection.sshConfigHost,
				username: connection.user,
				host: connection.hostName,
				port: connection.port,
			}),
		};
	}

	private async _connectSSHOnDemand(connection: IRemoteAgentHostSSHConnection, name: string, address: string): Promise<void> {
		const sshConfigHost = connection.sshConfigHost;
		if (!sshConfigHost) {
			const stopwatch = StopWatch.create(false);
			try {
				await this._sshService.connect({
					host: connection.hostName,
					port: connection.port,
					username: connection.user ?? connection.hostName,
					authMethod: SSHAuthMethod.Agent,
					name,
					userInitiated: true,
				});
				logSSHConnectAttempt(this._telemetryService, {
					operation: 'connect',
					userInitiated: true,
					attempt: 1,
					durationMs: stopwatch.elapsed(),
					success: true,
					willRetry: false,
				});
			} catch (err) {
				logSSHConnectAttempt(this._telemetryService, {
					operation: 'connect',
					userInitiated: true,
					attempt: 1,
					durationMs: stopwatch.elapsed(),
					success: false,
					willRetry: false,
					errorCategory: categorizeSSHConnectError(err),
				});
				throw err;
			}
			return;
		}
		const pending = this._pendingReconnects.get(sshConfigHost);
		if (pending) {
			await pending;
			await this._remoteAgentHostService.waitForConnection(address);
			return;
		}
		this._reconnectStates.get(sshConfigHost)?.resetForResume();
		const stopwatch = StopWatch.create(false);
		await this._attemptManagedReconnect({
			kind: 'SSH',
			key: sshConfigHost,
			address,
			userInitiated: true,
			reconnectPolicy: getEntryTypeConfig(RemoteAgentHostEntryType.SSH).reconnect,
			shouldPause: shouldPauseSSHReconnectAfterFailure,
			requiresUserInitiatedResume: shouldPauseSSHReconnectAfterFailure,
			getPauseReason: err => isSSHHostKeyDeniedError(err) ? 'host key denial' : isSSHAuthenticationFailedError(err) ? 'authentication failure' : 'user cancellation',
			doConnect: async () => {
				try {
					this._sshService.clearDisconnected(address);
					this._remoteAgentHostService.reconnect(address, true);
					await this._remoteAgentHostService.waitForConnection(address);
					logSSHConnectAttempt(this._telemetryService, {
						operation: 'reconnect',
						userInitiated: true,
						attempt: 1,
						durationMs: stopwatch.elapsed(),
						success: true,
						willRetry: false,
					});
				} catch (err) {
					logSSHConnectAttempt(this._telemetryService, {
						operation: 'reconnect',
						userInitiated: true,
						attempt: 1,
						durationMs: stopwatch.elapsed(),
						success: false,
						willRetry: false,
						errorCategory: categorizeSSHConnectError(err),
					});
					throw err;
				}
			},
		});
	}

	private async _disconnectSSHOnDemand(connection: IRemoteAgentHostSSHConnection): Promise<void> {
		if (connection.sshConfigHost) {
			this._reconnectStates.deleteAndDispose(connection.sshConfigHost);
		}
		// Keeping the entry keeps the provider, so open sessions can offer to connect again.
		await this._sshService.disconnect(sshConnectionKey(connection), { keepEntry: true });
		await this._remoteAgentHostService.removeRemoteAgentHost(connection.address);
		this._reconcile();
	}

	private async _removeSSHOnDemand(connection: IRemoteAgentHostSSHConnection): Promise<void> {
		if (connection.sshConfigHost) {
			this._reconnectStates.deleteAndDispose(connection.sshConfigHost);
		}
		await disconnectSSHEntry(connection, this._remoteAgentHostService, this._sshService);
		this._reconcile();
	}
}

registerWorkbenchContribution2(SSHAgentHostContribution.ID, SSHAgentHostContribution, WorkbenchPhase.AfterRestored);
