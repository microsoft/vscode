/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IWSLRemoteAgentHostService, WSL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ManagedReconnectAgentHostContribution, ManagedReconnectState } from './managedReconnectAgentHostContribution.js';

/** Initial auto-reconnect delay after a failed WSL reconnect attempt. */
const WSL_RECONNECT_INITIAL_DELAY = 1000;
/** Maximum auto-reconnect backoff delay for WSL. */
const WSL_RECONNECT_MAX_DELAY = 30_000;
/** Consecutive WSL reconnect failures before pausing auto-reconnect. */
const WSL_RECONNECT_MAX_ATTEMPTS = 10;
/** After this much wall-clock time, a paused auto-reconnect is auto-resumed. */
const WSL_RECONNECT_PAUSE_AUTO_RESUME_MS = 5 * 60 * 1000;
/**
 * Background poll for `wsl --list --running` so a user-initiated WSL boot can
 * be detected and a cached distro reconnected without waiting for an unrelated
 * event.
 */
const WSL_RUNNING_POLL_MS = 5 * 60 * 1000;

export function shouldPauseWSLReconnectAfterFailure(err: unknown): boolean {
	return isCancellationError(err);
}

/**
 * Manages sessions providers and auto-reconnect for WSL-backed remote agent
 * hosts. Mirrors {@link TunnelAgentHostContribution}: providers are sourced
 * from the WSL service's in-memory cache ({@link IWSLRemoteAgentHostService.getCachedDistros})
 * rather than from persisted settings, and live connections are wired back to
 * their providers as connection events arrive.
 *
 * The per-connection agent registration (chat sessions, language models) is
 * handled by {@link RemoteAgentHostContribution} reacting to
 * `onDidChangeConnections` — exactly as it does for tunnels.
 */
export class WSLAgentHostContribution extends ManagedReconnectAgentHostContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.wslAgentHostContribution';

	/** Distros that were running at the last poll; used to detect newly-running distros. */
	private _lastKnownRunningDistros = new Set<string>();

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

		// Reconcile providers when connections change (added/removed/reconnected).
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			// New/removed connection — paused auto-reconnect may have been
			// caused by a transient outage that's now resolved.
			this._resumeReconnects('WSL');
			this._reconcile();
		}));

		// Reconcile when enablement / auto-connect config changes.
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostAutoConnectSettingId)) {
				this._resumeReconnects('WSL');
				this._reconcile();
			}
		}));

		// Initial setup for cached distros and connected remotes.
		this._reconcile();

		// Periodic backstop: catches user-initiated WSL boots even when no
		// other event fires. Cheap (`wsl --list --running --quiet`) so the
		// 5-minute cadence has no measurable cost.
		this._register(new IntervalTimer()).cancelAndSet(
			() => void this._reconnectWSLEntriesIfRunning(),
			WSL_RUNNING_POLL_MS,
		);
	}

	private _reconcile(): void {
		this._reconcileProviders();
		this._wireConnections();
		this._updateConnectionStatuses();
		void this._reconnectWSLEntriesIfRunning();
	}

	// -- Provider management --

	private _reconcileProviders(): void {
		const entries = this._enabled ? this._getCachedWSLEntries() : [];
		const desiredAddresses = new Set(entries.map(e => e.address));

		// Remove providers whose distro is no longer cached.
		for (const [address] of this._providerStores) {
			if (!desiredAddresses.has(address)) {
				this._providerStores.deleteAndDispose(address);
			}
		}

		// Add or recreate providers for cached distros.
		for (const entry of entries) {
			const existing = this._providerInstances.get(entry.address);
			if (existing && existing.label !== (entry.name || entry.address)) {
				// Name changed — recreate since ISessionsProvider.label is readonly.
				this._providerStores.deleteAndDispose(entry.address);
			}
			if (!this._providerStores.has(entry.address)) {
				this._createProvider(entry.address, entry.name, {
					// WSL: an explicit user click should boot a stopped distro
					// (`wsl.exe -d <distro>` boots it). The "never auto-boot"
					// rule only applies to the periodic auto-reconnect path.
					connectOnDemand: () => this._connectWSLOnDemand(entry.distro, entry.name, entry.address),
					disconnectOnDemand: () => this._disconnectWSLOnDemand(entry.distro, entry.address),
					onDidReportConnectProgress: this._wslService.onDidReportConnectProgress,
				});
			}
		}
	}

	/** Wire live connections to their providers so session operations work. */
	private _wireConnections(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(
				c => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status)
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
			const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (connectionInfo) {
				// Service has an entry for this address — its status is
				// authoritative (including `incompatible` from the WebSocket
				// connect failure path and `connecting` from a fresh reconnect).
				provider.setConnectionStatus(connectionInfo.status);
			} else if (this._pendingReconnects.has(this._distroForAddress(address))) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
			} else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
				// No service entry. Preserve incompatible state set by the
				// reconnect catch; otherwise fall back to disconnected.
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
			}
		}
	}

	private _distroForAddress(address: string): string {
		return address.startsWith(WSL_ADDRESS_PREFIX) ? address.slice(WSL_ADDRESS_PREFIX.length) : address;
	}

	private _getCachedWSLEntries(): readonly { distro: string; name: string; address: string }[] {
		return this._wslService.getCachedDistros().map(({ distro, name }) => ({
			distro,
			name,
			address: `${WSL_ADDRESS_PREFIX}${distro}`,
		}));
	}

	// -- Auto-reconnect --

	/**
	 * Re-establish WSL connections for cached distros that are already
	 * running. Never auto-boots a distro; only acts on user-initiated boots
	 * observed via {@link IWSLRemoteAgentHostService.listRunningDistros}.
	 */
	private async _reconnectWSLEntriesIfRunning(): Promise<void> {
		if (!isWindows) {
			return;
		}
		if (!this._enabled) {
			this._reconnectStates.clearAndDisposeAll();
			return;
		}

		const running = new Set<string>(await this._wslService.listRunningDistros().catch(() => []));
		const newlyRunning: string[] = [];
		for (const distro of running) {
			if (!this._lastKnownRunningDistros.has(distro)) {
				newlyRunning.push(distro);
			}
		}
		this._lastKnownRunningDistros = running;
		if (newlyRunning.length > 0) {
			this._logService.info(`[WSLAgentHost] Newly running WSL distro(s): ${newlyRunning.join(', ')}`);
		}

		const autoConnect = this._configurationService.getValue<boolean>(RemoteAgentHostAutoConnectSettingId);
		const entries = this._getCachedWSLEntries();
		const stillCached = new Set<string>();
		for (const entry of entries) {
			stillCached.add(entry.distro);
			if (!running.has(entry.distro)) {
				continue;
			}
			const hasConnection = this._remoteAgentHostService.connections.some(
				c => c.address === entry.address && RemoteAgentHostConnectionStatus.isConnected(c.status)
			);
			if (hasConnection) {
				this._reconnectStates.deleteAndDispose(entry.distro);
				continue;
			}
			if (this._pendingReconnects.has(entry.distro)) {
				this._logService.trace(`[WSLAgentHost] WSL reconnect for ${entry.distro}: reconnect already in progress, skipping`);
				continue;
			}
			const state = this._reconnectStates.get(entry.distro);
			if (state?.hasPendingTimer) {
				this._logService.trace(`[WSLAgentHost] WSL reconnect for ${entry.distro}: retry timer already scheduled, skipping`);
				continue;
			}
			if (state?.paused) {
				const pausedMs = Date.now() - state.pausedAt;
				if (pausedMs < WSL_RECONNECT_PAUSE_AUTO_RESUME_MS) {
					this._logService.trace(`[WSLAgentHost] WSL reconnect for ${entry.distro}: paused (${Math.round(pausedMs / 1000)}s ago), skipping`);
					continue;
				}
				this._logService.info(`[WSLAgentHost] WSL reconnect for ${entry.distro}: auto-resuming after ${Math.round(pausedMs / 1000)}s pause`);
				state.resetForResume();
			}
			if (!autoConnect) {
				this._logService.trace(`[WSLAgentHost] WSL reconnect for ${entry.distro}: auto-connect disabled, skipping`);
				continue;
			}
			void this._attemptWSLReconnect(entry.distro, entry.name, entry.address);
		}

		// Drop retry state for distros that are no longer cached.
		for (const distro of [...this._reconnectStates.keys()]) {
			if (!stillCached.has(distro)) {
				this._reconnectStates.deleteAndDispose(distro);
			}
		}
	}

	private async _attemptWSLReconnect(distro: string, name: string, address: string, options: { userInitiated?: boolean } = {}): Promise<void> {
		await this._attemptManagedReconnect({
			kind: 'WSL',
			key: distro,
			address,
			userInitiated: !!options.userInitiated,
			maxAttempts: WSL_RECONNECT_MAX_ATTEMPTS,
			shouldPause: shouldPauseWSLReconnectAfterFailure,
			// WSL-specific gate: never auto-boot a stopped distro. The gate is
			// skipped on user-initiated attempts (the user explicitly clicked
			// Reconnect — `wsl.exe -d <distro>` will boot it). When the gate
			// triggers we return WITHOUT incrementing `attempts` so a long stop
			// doesn't burn the retry budget.
			preCheck: async userInitiated => {
				if (userInitiated) {
					return undefined;
				}
				const stillCached = this._wslService.getCachedDistros().some(d => d.distro === distro);
				if (!stillCached) {
					this._reconnectStates.deleteAndDispose(distro);
					return { skip: true };
				}
				const running = new Set<string>(await this._wslService.listRunningDistros().catch(() => []));
				this._lastKnownRunningDistros = running;
				if (!running.has(distro)) {
					return { skip: true, reason: `distro ${distro} not running` };
				}
				return undefined;
			},
			doConnect: () => this._wslService.reconnect(distro, name).then(() => undefined),
			schedule: state => this._scheduleWSLReconnect(distro, name, address, state),
		});
	}

	private _scheduleWSLReconnect(distro: string, name: string, address: string, state: ManagedReconnectState): void {
		const delay = Math.min(WSL_RECONNECT_INITIAL_DELAY * Math.pow(2, state.attempts - 1), WSL_RECONNECT_MAX_DELAY);
		this._logService.info(`[WSLAgentHost] Scheduling WSL reconnect for ${distro} in ${delay}ms (attempt ${state.attempts + 1}/${WSL_RECONNECT_MAX_ATTEMPTS})`);
		state.scheduleRetry(delay, () => {
			if (!this._enabled) {
				this._reconnectStates.deleteAndDispose(distro);
				return;
			}
			if (!this._configurationService.getValue<boolean>(RemoteAgentHostAutoConnectSettingId)) {
				return;
			}
			const live = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
				this._reconnectStates.deleteAndDispose(distro);
				return;
			}
			if (this._pendingReconnects.has(distro)) {
				return;
			}
			void this._attemptWSLReconnect(distro, name, address);
		});
	}

	// -- On-demand connection --

	private async _connectWSLOnDemand(distro: string, name: string, address: string): Promise<void> {
		while (true) {
			const inFlight = this._pendingReconnects.get(distro);
			if (!inFlight) {
				break;
			}
			await inFlight.catch(() => undefined);
			const live = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
				return;
			}
		}
		this._reconnectStates.get(distro)?.resetForResume();
		await this._attemptWSLReconnect(distro, name, address, { userInitiated: true });
	}

	/**
	 * Tear down the active WSL connection for {@link distro} and cancel any
	 * pending auto-reconnect. Removes the cached distro so it won't auto-reconnect.
	 *
	 * Order matters: `removeRemoteAgentHost` MUST run before the WSL service
	 * teardown so the subsequent close event can't trip auto-reconnect.
	 */
	private async _disconnectWSLOnDemand(distro: string, address: string): Promise<void> {
		this._reconnectStates.deleteAndDispose(distro);
		await this._remoteAgentHostService.removeRemoteAgentHost(address);
		await this._wslService.disconnect(distro);
	}
}

registerWorkbenchContribution2(WSLAgentHostContribution.ID, WSLAgentHostContribution, WorkbenchPhase.AfterRestored);
