/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableMap, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { type IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { hasExhaustedReconnectAttempts, type IRemoteAgentHostReconnectPolicy } from '../../../../../platform/agentHost/common/reconnectPolicy.js';
import { PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import { type IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { type IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { type ILogService } from '../../../../../platform/log/common/log.js';
import { type INotificationService } from '../../../../../platform/notification/common/notification.js';
import { type ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution } from './entryDrivenProviderContribution.js';

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
	/** Whether automatic triggers must not resume this state. */
	requiresUserInitiatedResume = false;

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
		this.requiresUserInitiatedResume = false;
	}

	resumeAutomatically(): boolean {
		if (!this.paused || this.requiresUserInitiatedResume) {
			return false;
		}
		this.resetForResume();
		return true;
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
	/** Policy controlling automatic reconnect attempts. */
	readonly reconnectPolicy: IRemoteAgentHostReconnectPolicy;
	/** Whether the given error should pause (rather than retry) auto-reconnect. */
	readonly shouldPause: (err: unknown) => boolean;
	/** Whether the pause must be resumed by an explicit user action. */
	readonly requiresUserInitiatedResume?: (err: unknown) => boolean;
	/** Describes why a reconnect was paused for logging. */
	readonly getPauseReason?: (err: unknown) => string;
	/**
	 * Optional pre-flight gate. Return `{ skip: true }` to bail WITHOUT
	 * incrementing the attempt counter (so a long-unavailable host can't burn
	 * the retry budget).
	 */
	readonly preCheck?: (userInitiated: boolean) => Promise<{ readonly skip: boolean; readonly reason?: string } | undefined>;
	/** Perform the actual (re)connect. */
	readonly doConnect: () => Promise<void>;
	/** Schedule the next retry after a non-terminal failure. Omit for on-demand-only reconnects. */
	readonly schedule?: (state: ManagedReconnectState) => void;
}

/**
 * Shared base for contributions that own in-renderer relay remote agent hosts
 * (WSL and SSH). Encapsulates the sessions-provider
 * registry and the managed auto-reconnect state machine so concrete
 * contributions only implement their type-specific discovery/connect logic.
 */
export abstract class ManagedReconnectAgentHostContribution extends EntryDrivenProviderContribution {

	/** Per-key auto-reconnect state (timer + attempts + paused). */
	protected readonly _reconnectStates = this._register(new DisposableMap<string, ManagedReconnectState>());

	/**
	 * In-flight reconnect attempts keyed by reconnect-state key. Stored so
	 * concurrent on-demand callers join the existing attempt rather than
	 * racing it.
	 */
	protected readonly _pendingReconnects = new Map<string, Promise<void>>();

	constructor(
		remoteAgentHostService: IRemoteAgentHostService,
		configurationService: IConfigurationService,
		protected readonly _logService: ILogService,
		instantiationService: IInstantiationService,
		sessionsProvidersService: ISessionsProvidersService,
		notificationService: INotificationService,
	) {
		super(remoteAgentHostService, configurationService, instantiationService, sessionsProvidersService, notificationService);
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
			if (state.resumeAutomatically()) {
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
	 * `connecting`/`reconnecting`/`disconnected`/`incompatible` provider status, cached-session
	 * unpublishing on failure, pause-on-cancel, and pause-after-max-attempts.
	 * Type-specific behaviour is provided via {@link IManagedReconnectAttemptOptions}.
	 */
	protected async _attemptManagedReconnect(opts: IManagedReconnectAttemptOptions): Promise<void> {
		// Wrap the body so we can store our own promise in `_pendingReconnects`
		// for concurrent on-demand callers to join.
		const runPromise = (async () => {
			const live = this._remoteAgentHostService.connections.find(connection => connection.address === opts.address);
			if (!opts.userInitiated && RemoteAgentHostConnectionStatus.isConnecting(live?.status)) {
				return;
			}
			if (!opts.userInitiated && RemoteAgentHostConnectionStatus.isReconnecting(live?.status)) {
				// The protocol client is preserving its state while it reconnects; don't replace it.
				this._reconnectStates.get(opts.key)?.cancelTimer();
				return;
			}
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
					this._logService.info(`[RemoteAgentHost] Pausing ${opts.kind} auto-reconnect for ${opts.key} after ${opts.getPauseReason?.(err) ?? 'user cancellation'}`);
					provider?.unpublishCachedSessions();
					const liveState = this._getOrCreateReconnectState(opts.key);
					liveState.paused = true;
					liveState.pausedAt = Date.now();
					liveState.requiresUserInitiatedResume = opts.requiresUserInitiatedResume?.(err) ?? false;
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
				if (hasExhaustedReconnectAttempts(opts.reconnectPolicy, liveState.attempts)) {
					this._logService.info(`[RemoteAgentHost] Pausing ${opts.kind} auto-reconnect for ${opts.key} after ${liveState.attempts} consecutive failures`);
					liveState.paused = true;
					liveState.pausedAt = Date.now();
					return;
				}
				if (opts.userInitiated) {
					return;
				}
				opts.schedule?.(liveState);
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
