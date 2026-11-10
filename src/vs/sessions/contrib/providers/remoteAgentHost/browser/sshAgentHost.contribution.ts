/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { type IRemoteAgentHostEntry, IRemoteAgentHostService, type IRemoteAgentHostSSHConnection, getEntryAddress, getEntryTypeConfig, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { computeSSHConnectionKey, isSSHHostKeyDeniedError, ISSHRemoteAgentHostService, SSHAuthMethod } from '../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { categorizeSSHConnectError, logSSHConnectAttempt } from '../../../../common/sessionsTelemetry.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ManagedReconnectAgentHostContribution } from './managedReconnectAgentHostContribution.js';

const SSH_RECONNECT_PERIODIC_INTERVAL_MS = 60_000;

/** Returns whether an SSH reconnect failure requires pausing retries. */
export function shouldPauseSSHReconnectAfterFailure(err: unknown): boolean {
	return isCancellationError(err) || isSSHHostKeyDeniedError(err);
}

/** Returns the SSH service's stable key for a configured connection. */
export function sshConnectionKey(connection: IRemoteAgentHostSSHConnection): string {
	return connection.sshConfigHost
		? `ssh:${connection.sshConfigHost}`
		: `${connection.user ?? connection.hostName}@${connection.hostName}:${connection.port ?? 22}`;
}

/**
 * Disconnect an SSH-backed remote agent host at the user's request.
 *
 * Order matters. `sshService.disconnect` is what drops the persisted SSH
 * entry, and that entry is what makes the address "desired" during
 * reconciliation. Tearing the connection down first fires
 * `onDidChangeConnections` while the entry is still stored, so reconciliation
 * sees a desired-but-disconnected host and immediately re-dials it — the host
 * reappears moments after the user removed it. Dropping the entry first makes
 * the address undesired, so the teardown's own reconcile is a no-op.
 */
export async function disconnectSSHEntry(
	connection: IRemoteAgentHostSSHConnection,
	remoteAgentHostService: Pick<IRemoteAgentHostService, 'removeRemoteAgentHost'>,
	sshService: Pick<ISSHRemoteAgentHostService, 'disconnect'>,
): Promise<void> {
	await sshService.disconnect(sshConnectionKey(connection));
	await remoteAgentHostService.removeRemoteAgentHost(connection.address);
}

export class SSHAgentHostContribution extends ManagedReconnectAgentHostContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.sshAgentHostContribution';

	protected readonly _entryType = RemoteAgentHostEntryType.SSH;

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

		this._register(this._remoteAgentHostService.onDidChangeConfiguredEntries(() => this._reconcile()));
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcile()));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._reconcile();
			}
		}));

		// The connection service owns retries; the periodic sweep only reconciles providers.
		this._register(new IntervalTimer()).cancelAndSet(() => this._reconcile(), SSH_RECONNECT_PERIODIC_INTERVAL_MS);

		this._reconcile();
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
			await pending.catch(() => undefined);
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
			getPauseReason: err => isSSHHostKeyDeniedError(err) ? 'host key denial' : 'user cancellation',
			doConnect: async () => {
				try {
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
		await disconnectSSHEntry(connection, this._remoteAgentHostService, this._sshService);
	}
}

registerWorkbenchContribution2(SSHAgentHostContribution.ID, SSHAgentHostContribution, WorkbenchPhase.AfterRestored);
