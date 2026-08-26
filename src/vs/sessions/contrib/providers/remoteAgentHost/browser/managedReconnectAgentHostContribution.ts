/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IAgentHostConnectProgress } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { watchForIncompatibleNotifications } from './remoteHostOptions.js';

/**
 * Per-host auto-reconnect state for a managed (in-renderer relay) remote
 * agent host. Owned by a {@link DisposableMap} on the contribution, which
 * disposes the entry — and therefore the pending timer — when the host is no
 * longer present or the contribution itself is disposed.
 */
export class ManagedReconnectState extends Disposable {
	private readonly _timer = this._register(new MutableDisposable());

	/** Consecutive failed reconnect attempts. */
	attempts = 0;
	/** True after we've given up auto-reconnecting until something resumes us. */
	paused = false;
	/** Wall-clock timestamp when {@link paused} was last set to true. */
	pausedAt = 0;

	get hasPendingTimer(): boolean {
		return !!this._timer.value;
	}

	scheduleRetry(delayMs: number, handler: () => void): void {
		this._timer.value = disposableTimeout(() => {
			// Drop the disposable now that the timer has fired so
			// `hasPendingTimer` reflects reality even if `handler` returns
			// early without scheduling a follow-up attempt.
			this._timer.value = undefined;
			handler();
		}, delayMs);
	}

	cancelTimer(): void {
		this._timer.clear();
	}

	resetForResume(): void {
		this.attempts = 0;
		this.paused = false;
		this._timer.clear();
	}
}

/** Options controlling a single managed-reconnect attempt. */
export interface IManagedReconnectAttemptOptions {
	/** Human-readable connection kind for logging (e.g. `SSH`, `WSL`). */
	readonly kind: string;
	/** Reconnect-state key (e.g. `sshConfigHost`, `distro`). */
	readonly key: string;
	/** Display address used to look up the provider and live connection. */
	readonly address: string;
	/** Whether the attempt was triggered by an explicit user action. */
	readonly userInitiated: boolean;
	/** Consecutive failures before pausing auto-reconnect. */
	readonly maxAttempts: number;
	/** Whether the given error should pause (rather than retry) auto-reconnect. */
	readonly shouldPause: (err: unknown) => boolean;
	/**
	 * Optional pre-flight gate. Return `{ skip: true }` to bail WITHOUT
	 * incrementing the attempt counter (so a long-unavailable host can't burn
	 * the retry budget).
	 */
	readonly preCheck?: (userInitiated: boolean) => Promise<{ readonly skip: boolean; readonly reason?: string } | undefined>;
	/** Perform the actual (re)connect. */
	readonly doConnect: () => Promise<void>;
	/** Schedule the next retry after a non-terminal failure. */
	readonly schedule: (state: ManagedReconnectState) => void;
}

/**
 * Shared base for contributions that own in-renderer relay remote agent hosts
 * (WSL, and conceptually SSH/tunnels). Encapsulates the sessions-provider
 * registry and the managed auto-reconnect state machine so concrete
 * contributions only implement their type-specific discovery/connect logic.
 */
export abstract class ManagedReconnectAgentHostContribution extends Disposable {

	/** Per-address sessions provider stores. */
	protected readonly _providerStores = this._register(new DisposableMap<string, DisposableStore>());
	protected readonly _providerInstances = new Map<string, RemoteAgentHostSessionsProvider>();

	/** Per-key auto-reconnect state (timer + attempts + paused). */
	protected readonly _reconnectStates = this._register(new DisposableMap<string, ManagedReconnectState>());

	/**
	 * In-flight reconnect attempts keyed by reconnect-state key. Stored so
	 * concurrent on-demand callers join the existing attempt rather than
	 * racing it.
	 */
	protected readonly _pendingReconnects = new Map<string, Promise<void>>();

	constructor(
		protected readonly _remoteAgentHostService: IRemoteAgentHostService,
		protected readonly _configurationService: IConfigurationService,
		protected readonly _logService: ILogService,
		protected readonly _instantiationService: IInstantiationService,
		protected readonly _sessionsProvidersService: ISessionsProvidersService,
		protected readonly _notificationService: INotificationService,
	) {
		super();
	}

	protected get _enabled(): boolean {
		return this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
	}

	// -- Provider registry --

	protected _createProvider(address: string, name: string, options: {
		readonly connectOnDemand?: () => Promise<void>;
		readonly disconnectOnDemand?: () => Promise<void>;
		readonly onDidReportConnectProgress?: Event<IAgentHostConnectProgress>;
		readonly initialStatus?: RemoteAgentHostConnectionStatus;
	}): RemoteAgentHostSessionsProvider {
		const store = new DisposableStore();
		const provider = this._instantiationService.createInstance(
			RemoteAgentHostSessionsProvider, {
			address,
			name,
			connectOnDemand: options.connectOnDemand,
			disconnectOnDemand: options.disconnectOnDemand,
			onDidReportConnectProgress: options.onDidReportConnectProgress,
		});
		if (options.initialStatus !== undefined) {
			provider.setConnectionStatus(options.initialStatus);
		}
		store.add(provider);
		store.add(this._sessionsProvidersService.registerProvider(provider));
		store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
		this._providerInstances.set(address, provider);
		store.add(toDisposable(() => this._providerInstances.delete(address)));
		this._providerStores.set(address, store);
		return provider;
	}

	// -- Managed auto-reconnect --

	protected _getOrCreateReconnectState(key: string): ManagedReconnectState {
		let state = this._reconnectStates.get(key);
		if (!state) {
			state = new ManagedReconnectState();
			this._reconnectStates.set(key, state);
		}
		return state;
	}

	/**
	 * Resume auto-reconnect for any paused entries. Called when a fresh
	 * trigger (config change, new connection event) gives paused hosts another
	 * chance. Returns the number of entries resumed.
	 */
	protected _resumeReconnects(logKind: string): number {
		let resumed = 0;
		for (const [, state] of this._reconnectStates) {
			if (state.paused) {
				state.resetForResume();
				resumed++;
			}
		}
		if (resumed > 0) {
			this._logService.info(`[RemoteAgentHost] Resuming ${logKind} auto-reconnect for ${resumed} paused host(s)`);
		}
		return resumed;
	}

	/**
	 * Shared retry-loop body for managed-reconnect entries. Handles
	 * `connecting`/`disconnected`/`incompatible` provider status, cached-session
	 * unpublishing on failure, pause-on-cancel, and pause-after-max-attempts.
	 * Type-specific behaviour is provided via {@link IManagedReconnectAttemptOptions}.
	 */
	protected async _attemptManagedReconnect(opts: IManagedReconnectAttemptOptions): Promise<void> {
		// Wrap the body so we can store our own promise in `_pendingReconnects`
		// for concurrent on-demand callers to join.
		const runPromise = (async () => {
			const state = this._getOrCreateReconnectState(opts.key);
			const attempt = state.attempts;
			const provider = this._providerInstances.get(opts.address);
			if (opts.userInitiated) {
				provider?.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
			}
			this._logService.info(`[RemoteAgentHost] Re-establishing ${opts.kind} connection for ${opts.key} (attempt ${attempt + 1})`);
			try {
				if (opts.preCheck) {
					const result = await opts.preCheck(opts.userInitiated);
					if (result?.skip) {
						if (result.reason) {
							this._logService.info(`[RemoteAgentHost] ${opts.kind} reconnect for ${opts.key}: ${result.reason}; skipping`);
						}
						return;
					}
				}
				await opts.doConnect();
				this._reconnectStates.deleteAndDispose(opts.key);
				this._logService.info(`[RemoteAgentHost] ${opts.kind} connection re-established for ${opts.key}`);
			} catch (err) {
				if (!this._enabled) {
					this._reconnectStates.deleteAndDispose(opts.key);
					return;
				}
				if (opts.userInitiated) {
					provider?.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
				}
				if (opts.shouldPause(err)) {
					this._logService.info(`[RemoteAgentHost] Pausing ${opts.kind} auto-reconnect for ${opts.key} after user cancellation`);
					provider?.unpublishCachedSessions();
					const liveState = this._getOrCreateReconnectState(opts.key);
					liveState.paused = true;
					liveState.pausedAt = Date.now();
					return;
				}
				this._logService.error(`[RemoteAgentHost] ${opts.kind} reconnect failed for ${opts.key}`, err);
				// Surface protocol-version mismatches on the provider so the
				// workspace picker can show the host's message. Other errors
				// stay as the existing disconnected state.
				const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
				if (incompatible) {
					provider?.setConnectionStatus(incompatible);
					// Don't keep retrying on incompatible — user needs to
					// upgrade/downgrade. Drop retry state instead of pausing.
					this._reconnectStates.deleteAndDispose(opts.key);
					return;
				}
				// Host is unreachable — unpublish any cached sessions we were
				// showing so the UI doesn't list stale entries for a host we
				// cannot currently reach.
				provider?.unpublishCachedSessions();
				// State may have been cleared (e.g. host removed) while the
				// reconnect was in flight — re-resolve to be safe.
				const liveState = this._getOrCreateReconnectState(opts.key);
				liveState.attempts = attempt + 1;
				if (liveState.attempts >= opts.maxAttempts) {
					this._logService.info(`[RemoteAgentHost] Pausing ${opts.kind} auto-reconnect for ${opts.key} after ${liveState.attempts} consecutive failures`);
					liveState.paused = true;
					liveState.pausedAt = Date.now();
					return;
				}
				if (opts.userInitiated) {
					return;
				}
				opts.schedule(liveState);
			}
		})();
		this._pendingReconnects.set(opts.key, runPromise);
		try {
			await runPromise;
		} finally {
			this._pendingReconnects.delete(opts.key);
		}
	}
}
