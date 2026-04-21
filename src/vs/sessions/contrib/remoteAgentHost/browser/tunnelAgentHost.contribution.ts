/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { mainWindow } from '../../../../base/browser/window.js';
import * as nls from '../../../../nls.js';
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ITunnelAgentHostService, TUNNEL_ADDRESS_PREFIX, type ITunnelInfo } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { logTunnelConnectAttempt, logTunnelConnectResolved, TunnelConnectErrorCategory, TunnelConnectFailureReason } from '../../../common/sessionsTelemetry.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';

/** Minimum interval between silent status checks (5 minutes). */
const STATUS_CHECK_INTERVAL = 5 * 60 * 1000;

/** Initial auto-reconnect delay after an unexpected tunnel disconnect. */
const RECONNECT_INITIAL_DELAY = 1000;
/** Maximum auto-reconnect backoff delay. */
const RECONNECT_MAX_DELAY = 30_000;
/**
 * Consecutive failures before pausing auto-reconnect. We resume immediately
 * on a network-online event or when the tab becomes visible, so this is
 * mostly a guard against a permanently dead tunnel.
 */
const RECONNECT_MAX_ATTEMPTS = 10;

export class TunnelAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.tunnelAgentHostContribution';

	private readonly _providerStores = this._register(new DisposableMap<string /* address */, DisposableStore>());
	private readonly _providerInstances = new Map<string, RemoteAgentHostSessionsProvider>();
	private readonly _pendingConnects = new Map<string, Promise<void>>();
	private _lastStatusCheck = 0;
	/**
	 * `false` until the first {@link _silentStatusCheck} resolves. Until then
	 * we keep newly-created providers in the `Connecting` state so the picker
	 * doesn't briefly show every cached tunnel as "Offline" on startup.
	 */
	private _initialStatusChecked = false;

	/** Previous connection status per address — used to detect Connected→Disconnected transitions. */
	private readonly _previousStatuses = new Map<string, RemoteAgentHostConnectionStatus>();
	/** Pending auto-reconnect timer per address. */
	private readonly _reconnectTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	/** Consecutive failed auto-reconnect attempts per address. */
	private readonly _reconnectAttempts = new Map<string, number>();
	/** Addresses whose auto-reconnect loop has paused after too many failures. */
	private readonly _reconnectPaused = new Set<string>();
	/** Timestamp of the last wake-triggered resume, to rate-limit rapid tab toggles. */
	private _lastResumeAt = 0;

	/**
	 * Per-address connect sessions for telemetry. A session starts at the
	 * first attempt of a connect cycle (initial or reconnect) and ends on
	 * terminal resolution (connected, host-offline, max-attempts).
	 */
	private readonly _connectSessions = new Map<string, { startedAt: number; attempts: number; isReconnect: boolean }>();

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
	) {
		super();

		// Create providers for cached tunnels
		this._reconcileProviders();

		// Update connection statuses when connections change
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._handleConnectionChanges();
			this._updateConnectionStatuses();
			this._wireConnections();
		}));

		// Reconcile providers when the tunnel cache changes
		this._register(this._tunnelService.onDidChangeTunnels(() => {
			this._reconcileProviders();
			// Stop any reconnect loops for tunnels that no longer exist
			this._pruneReconnectState();
		}));

		// Re-run discovery when a GitHub session becomes available
		// (e.g. after the walkthrough completes sign-in).
		this._register(this._authenticationService.onDidChangeSessions(e => {
			if (e.providerId === 'github') {
				this._logService.info('[TunnelAgentHost] GitHub sessions changed, retrying discovery...');
				this._silentStatusCheck();
			}
		}));

		// Wake-triggered retry: when the browser regains connectivity or
		// the tab becomes visible again, immediately attempt to reconnect
		// any disconnected tunnels. This covers laptop-sleep / Wi-Fi-drop
		// scenarios where we may have paused the reconnect loop.
		if (isWeb) {
			const onWake = () => this._resumeReconnects('wake');
			mainWindow.addEventListener('online', onWake);
			this._register(toDisposable(() => mainWindow.removeEventListener('online', onWake)));

			const onVisibilityChange = () => {
				if (mainWindow.document.visibilityState === 'visible') {
					this._resumeReconnects('visible');
				}
			};
			mainWindow.document.addEventListener('visibilitychange', onVisibilityChange);
			this._register(toDisposable(() => mainWindow.document.removeEventListener('visibilitychange', onVisibilityChange)));
		}

		// Cancel any pending reconnect timers on disposal.
		this._register(toDisposable(() => {
			for (const timer of this._reconnectTimeouts.values()) {
				clearTimeout(timer);
			}
			this._reconnectTimeouts.clear();
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
			connectOnDemand: () => this._connectTunnel(address, { userInitiated: true }),
		},
		);
		// Surface as "Connecting" until the first silent status check or an
		// auto-connect attempt determines the real state; otherwise the picker
		// flashes "Offline" for every cached tunnel on startup.
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.Connecting);
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
			} else if (!this._initialStatusChecked) {
				// Keep the initial "Connecting" state so the picker doesn't
				// flash "Offline" before the first silent status check runs.
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
	private _connectTunnel(address: string, options: { readonly userInitiated: boolean }): Promise<void> {
		const existing = this._pendingConnects.get(address);
		if (existing) {
			return existing;
		}

		const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
		const cached = this._tunnelService.getCachedTunnels().find(t => t.tunnelId === tunnelId);
		if (!cached) {
			return Promise.resolve();
		}

		// A new attempt is starting — cancel any scheduled reconnect timer;
		// success/failure of this attempt will drive the next decision.
		this._cancelReconnect(address);

		const { attemptNumber, attemptStart, session, isReconnect } = this._beginConnectAttempt(address);

		const promise = (async () => {
			// Show a progress notification after a short delay so quick
			// connects don't flash a notification. Only show for user-initiated
			// connects; background auto-connects and reconnects stay silent.
			let handle: { close(): void } | undefined;
			const timer = options.userInitiated ? setTimeout(() => {
				handle = this._notificationService.notify({
					severity: Severity.Info,
					message: nls.localize('tunnelConnecting', "Connecting to tunnel '{0}'...", cached.name),
					progress: { infinite: true },
				});
			}, 1000) : undefined;

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
				this._finishConnectAttempt(address, { success: true, attemptNumber, attemptStart, session, isReconnect });
			} catch (err) {
				this._logService.warn(`[TunnelAgentHost] Connect to ${cached.name} failed:`, err);
				this._finishConnectAttempt(address, { success: false, attemptNumber, attemptStart, session, isReconnect, error: err });
				// Clear the pending-connect entry BEFORE deciding what to do
				// next; otherwise `_scheduleReconnect`'s in-flight guard
				// (`_pendingConnects.has(address)`) would silently bail and
				// we'd never re-arm the timer, leaving the tunnel stuck.
				this._pendingConnects.delete(address);

				const hostOnline = await this._probeHostOnline(cached.tunnelId);
				if (hostOnline === false) {
					this._pauseReconnect(address, 'hostOffline');
				} else {
					this._logService.info(`[TunnelAgentHost] Scheduling reconnect for ${address}`);
					this._scheduleReconnect(address);
				}
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

		// Swallow the promise rejection here so unhandled rejection noise
		// doesn't bubble up for the background reconnect path; callers that
		// await `_connectTunnel` directly will still see it via their own `await`.
		promise.catch(() => { /* handled via _scheduleReconnect */ });

		this._pendingConnects.set(address, promise);
		return promise;
	}

	/**
	 * Detect tunnel connections that transitioned from Connected to
	 * Disconnected and schedule an auto-reconnect.
	 *
	 * Important: we only trigger on a Connected → Disconnected transition
	 * where the connection entry is still present. If the entry has been
	 * removed from the service (e.g. the user clicked "Remove Remote"),
	 * we do NOT schedule a reconnect — that would override their intent.
	 */
	private _handleConnectionChanges(): void {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			return;
		}

		const cachedAddresses = new Set(
			this._tunnelService.getCachedTunnels().map(t => `${TUNNEL_ADDRESS_PREFIX}${t.tunnelId}`)
		);
		const currentStatuses = new Map<string, RemoteAgentHostConnectionStatus>();
		for (const conn of this._remoteAgentHostService.connections) {
			currentStatuses.set(conn.address, conn.status);
		}

		for (const address of cachedAddresses) {
			const previous = this._previousStatuses.get(address);
			const current = currentStatuses.get(address);

			// Only schedule a reconnect on an explicit Connected→Disconnected
			// transition. If the address is absent from the connection list,
			// the user (or another code path) removed it — honour that.
			const wasConnected = previous === RemoteAgentHostConnectionStatus.Connected;
			const isExplicitlyDisconnected = current === RemoteAgentHostConnectionStatus.Disconnected;

			if (wasConnected && isExplicitlyDisconnected && !this._pendingConnects.has(address)) {
				this._logService.info(`[TunnelAgentHost] Connection lost for ${address}, scheduling reconnect`);
				if (!this._connectSessions.has(address)) {
					this._connectSessions.set(address, { startedAt: Date.now(), attempts: 0, isReconnect: true });
				}
				this._scheduleReconnect(address, /*immediate*/ true);
			}

			// Only track previous status while the entry is present so a
			// future re-registration starts from a clean slate. If the
			// entry disappeared (e.g. user-initiated removal), also cancel
			// any already-scheduled reconnect and clear its backoff state
			// so the removal is honoured even if a timer was already armed.
			if (current !== undefined) {
				this._previousStatuses.set(address, current);
			} else {
				this._previousStatuses.delete(address);
				this._resetReconnectState(address);
			}
		}

		// Drop previous-status entries for addresses no longer cached.
		for (const address of [...this._previousStatuses.keys()]) {
			if (!cachedAddresses.has(address)) {
				this._previousStatuses.delete(address);
			}
		}
	}

	private _scheduleReconnect(address: string, immediate = false): void {
		// Respect enablement and tunnel-still-cached.
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			return;
		}
		const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
		const cached = this._tunnelService.getCachedTunnels().find(t => t.tunnelId === tunnelId);
		if (!cached) {
			return;
		}

		// Already connected or a connect is in flight — nothing to do.
		if (this._pendingConnects.has(address)) {
			return;
		}
		const live = this._remoteAgentHostService.connections.find(c => c.address === address);
		if (live && live.status === RemoteAgentHostConnectionStatus.Connected) {
			this._clearReconnectBackoff(address);
			return;
		}

		// Cancel any existing timer — we're rescheduling.
		this._cancelReconnect(address);

		const attempt = this._reconnectAttempts.get(address) ?? 0;

		if (attempt >= RECONNECT_MAX_ATTEMPTS) {
			this._pauseReconnect(address, 'maxAttemptsReached');
			return;
		}

		const delay = immediate
			? 0
			: Math.min(RECONNECT_INITIAL_DELAY * Math.pow(2, attempt), RECONNECT_MAX_DELAY);

		this._logService.info(
			`[TunnelAgentHost] Scheduling reconnect for ${address} in ${delay}ms (attempt ${attempt + 1}/${RECONNECT_MAX_ATTEMPTS})`
		);

		const timer = setTimeout(() => {
			this._reconnectTimeouts.delete(address);

			// A manual (or other) connect may have started or completed while
			// we were waiting. Re-check before counting this as a new attempt,
			// otherwise `_connectTunnel` would just return the in-flight promise
			// and we'd inflate the backoff counter without really trying again.
			if (this._pendingConnects.has(address)) {
				return;
			}
			const live = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (live && live.status === RemoteAgentHostConnectionStatus.Connected) {
				this._clearReconnectBackoff(address);
				return;
			}

			this._reconnectAttempts.set(address, attempt + 1);
			this._connectTunnel(address, { userInitiated: false }).catch(() => { /* _connectTunnel already re-schedules on failure */ });
		}, delay);
		this._reconnectTimeouts.set(address, timer);
	}

	/**
	 * Best-effort probe of whether the host backing `tunnelId` is online
	 * (has any host connections). Returns `undefined` if we couldn't
	 * determine — caller should treat as "retry normally" in that case.
	 */
	private async _probeHostOnline(tunnelId: string): Promise<boolean | undefined> {
		try {
			const tunnels = await this._tunnelService.listTunnels({ silent: true });
			if (!tunnels) {
				return undefined;
			}
			const info = tunnels.find(t => t.tunnelId === tunnelId);
			if (!info) {
				return false;
			}
			return info.hostConnectionCount > 0;
		} catch {
			return undefined;
		}
	}

	private _cancelReconnect(address: string): void {
		const timer = this._reconnectTimeouts.get(address);
		if (timer !== undefined) {
			clearTimeout(timer);
			this._reconnectTimeouts.delete(address);
		}
	}

	/** Clear retry-backoff and pause state for an address. */
	private _clearReconnectBackoff(address: string): void {
		this._reconnectAttempts.delete(address);
		this._reconnectPaused.delete(address);
	}

	/** Drop all reconnect + telemetry state for an address (e.g. on removal). */
	private _resetReconnectState(address: string): void {
		this._cancelReconnect(address);
		this._clearReconnectBackoff(address);
		this._connectSessions.delete(address);
	}

	/**
	 * Stop auto-reconnecting for an address until a wake/online/visibility
	 * event resumes us, and close out any active telemetry session.
	 */
	private _pauseReconnect(address: string, reason: TunnelConnectFailureReason): void {
		this._cancelReconnect(address);
		this._reconnectAttempts.delete(address);
		this._reconnectPaused.add(address);
		this._logService.info(
			`[TunnelAgentHost] Pausing auto-reconnect for ${address} (${reason}); ` +
			`will resume on network-online, tab-visible, or next status check.`
		);
		const session = this._connectSessions.get(address);
		if (session) {
			logTunnelConnectResolved(this._telemetryService, {
				isReconnect: session.isReconnect,
				totalAttempts: session.attempts,
				totalDurationMs: Date.now() - session.startedAt,
				success: false,
				failureReason: reason,
			});
			this._connectSessions.delete(address);
		}
	}

	/**
	 * Begin (or continue) a connect telemetry session for `address` and
	 * return the bookkeeping needed to later finish the attempt. A session
	 * already exists if `_handleConnectionChanges` marked this as a
	 * reconnect cycle; otherwise this starts a fresh initial-connect session.
	 */
	private _beginConnectAttempt(address: string): { session: { startedAt: number; attempts: number; isReconnect: boolean }; attemptNumber: number; attemptStart: number; isReconnect: boolean } {
		let session = this._connectSessions.get(address);
		if (!session) {
			session = { startedAt: Date.now(), attempts: 0, isReconnect: false };
			this._connectSessions.set(address, session);
		}
		session.attempts++;
		return { session, attemptNumber: session.attempts, attemptStart: Date.now(), isReconnect: session.isReconnect };
	}

	/**
	 * Finalize the telemetry for a single connect attempt. On success, also
	 * clears backoff state and closes the session; on failure, only the
	 * per-attempt event is emitted (the caller decides whether to retry).
	 */
	private _finishConnectAttempt(address: string, args: {
		success: boolean;
		attemptNumber: number;
		attemptStart: number;
		session: { startedAt: number; attempts: number; isReconnect: boolean };
		isReconnect: boolean;
		error?: unknown;
	}): void {
		const { success, attemptNumber, attemptStart, session, isReconnect, error } = args;
		const durationMs = Date.now() - attemptStart;
		if (success) {
			this._clearReconnectBackoff(address);
			logTunnelConnectAttempt(this._telemetryService, { isReconnect, attempt: attemptNumber, durationMs, success: true });
			logTunnelConnectResolved(this._telemetryService, { isReconnect, totalAttempts: attemptNumber, totalDurationMs: Date.now() - session.startedAt, success: true });
			this._connectSessions.delete(address);
		} else {
			logTunnelConnectAttempt(this._telemetryService, { isReconnect, attempt: attemptNumber, durationMs, success: false, errorCategory: this._categorizeError(error) });
		}
	}

	private _categorizeError(err: unknown): TunnelConnectErrorCategory {
		const message = err instanceof Error ? err.message : String(err);
		if (/WebSocket relay connection failed/i.test(message)) {
			return 'relayConnectionFailed';
		}
		if (/authenticat|token|unauthor/i.test(message)) {
			return 'auth';
		}
		if (/network|fetch|offline/i.test(message)) {
			return 'network';
		}
		return 'other';
	}

	/**
	 * Invoked on `online` / `visibilitychange→visible`. Kicks off an
	 * immediate attempt for any disconnected cached tunnel.
	 *
	 * Rate-limited: at most one resume per RESUME_RATE_LIMIT_MS so that
	 * rapid tab toggling can't hammer a permanently broken endpoint with
	 * an unbounded number of attempt bursts. Resumes the normal backoff
	 * sequence (by clearing the pause flag) rather than zeroing the
	 * attempt counter.
	 */
	private _resumeReconnects(trigger: 'wake' | 'visible'): void {
		if (!this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)) {
			return;
		}

		const RESUME_RATE_LIMIT_MS = 10_000;
		const now = Date.now();
		if (now - this._lastResumeAt < RESUME_RATE_LIMIT_MS) {
			return;
		}
		this._lastResumeAt = now;

		const cached = this._tunnelService.getCachedTunnels();
		for (const tunnel of cached) {
			const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
			if (this._pendingConnects.has(address)) {
				continue;
			}
			const live = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (live && live.status === RemoteAgentHostConnectionStatus.Connected) {
				continue;
			}

			this._logService.info(`[TunnelAgentHost] Resuming reconnect for ${address} (trigger: ${trigger})`);
			// If we were paused (exhausted the backoff budget), give a fresh
			// budget since the wake event is itself evidence the environment
			// has changed. Otherwise keep the current attempt counter so an
			// in-progress backoff isn't short-circuited.
			if (this._reconnectPaused.has(address)) {
				this._clearReconnectBackoff(address);
			}
			this._scheduleReconnect(address, /*immediate*/ true);
		}
	}

	/** Drop reconnect state for addresses whose tunnel is no longer cached. */
	private _pruneReconnectState(): void {
		const cachedAddresses = new Set(
			this._tunnelService.getCachedTunnels().map(t => `${TUNNEL_ADDRESS_PREFIX}${t.tunnelId}`)
		);
		const tracked = new Set<string>([
			...this._reconnectTimeouts.keys(),
			...this._reconnectAttempts.keys(),
			...this._reconnectPaused,
			...this._connectSessions.keys(),
		]);
		for (const address of tracked) {
			if (!cachedAddresses.has(address)) {
				this._resetReconnectState(address);
			}
		}
	}

	// -- Silent status check --

	private async _silentStatusCheck(): Promise<void> {
		const enabled = this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
		if (!enabled) {
			this._initialStatusChecked = true;
			this._updateConnectionStatuses();
			return;
		}

		this._lastStatusCheck = Date.now();

		// Fetch tunnel list silently to check online status
		let onlineTunnels: ITunnelInfo[] | undefined;
		try {
			onlineTunnels = await this._tunnelService.listTunnels({ silent: true });
		} catch {
			// No cached token or network error — leave statuses as-is
			this._initialStatusChecked = true;
			this._updateConnectionStatuses();
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

			// Auto-cache online tunnels that aren't cached yet so they
			// appear in the UI on first discovery (e.g. fresh web session).
			const cachedIds = new Set(cached.map(t => t.tunnelId));
			for (const tunnel of onlineTunnels) {
				if (!cachedIds.has(tunnel.tunnelId) && tunnel.hostConnectionCount > 0) {
					this._tunnelService.cacheTunnel(tunnel);
				}
			}

			// Update online/offline status based on hostConnectionCount.
			// For tunnels, Connected means "host is online" (clickable to connect),
			// Disconnected means "host is offline". Actual relay connection
			// establishment happens when the user clicks the tunnel (or via
			// auto-connect below when enabled).
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
					// Host is not online — drop any cached sessions we were
					// showing for it so the UI doesn't list stale entries.
					provider.unpublishCachedSessions();
				}
			}

			// Auto-connect online tunnels that aren't connected yet when the
			// user has opted into auto-connect (default on). This mirrors the
			// web embedder behaviour where no workspace picker is available
			// to trigger manual connection.
			const autoConnect = this._configurationService.getValue<boolean>(RemoteAgentHostAutoConnectSettingId);
			if (autoConnect) {
				for (const tunnel of onlineTunnels) {
					if (tunnel.hostConnectionCount > 0) {
						const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
						const alreadyConnected = this._remoteAgentHostService.connections.some(
							c => c.address === address && c.status === RemoteAgentHostConnectionStatus.Connected
						);
						if (!alreadyConnected) {
							this._connectTunnel(address, { userInitiated: false });
						}
					}
				}
			}
		}

		this._initialStatusChecked = true;
		this._updateConnectionStatuses();
	}
}

registerWorkbenchContribution2(TunnelAgentHostContribution.ID, TunnelAgentHostContribution, WorkbenchPhase.AfterRestored);
