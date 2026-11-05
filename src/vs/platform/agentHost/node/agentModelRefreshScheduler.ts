/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../base/common/async.js';
import type { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IObservable, autorun } from '../../../base/common/observable.js';
import { ILogService } from '../../log/common/log.js';
import { IAgent } from '../common/agent.js';

/**
 * Upper bound on model-catalog staleness for a provider that is actively being
 * used.
 *
 * Model refreshes are otherwise edge-triggered — authentication, transport
 * flips, client restarts — so without a periodic tick a model added on the
 * service side stays invisible until the GitHub token happens to rotate, which
 * on a long-lived window can be hours or never.
 */
export const MODEL_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Re-enumerates each provider's model catalog, bounded by
 * {@link MODEL_REFRESH_INTERVAL_MS} but gated on that provider actually being
 * used.
 *
 * Lives in the host rather than the client because model freshness is provider
 * truth: only the provider knows its backend, holds the credential, and owns
 * the stale-write and backoff policy. Keeping the timer here also means one
 * tick per provider regardless of how many windows are connected, and requires
 * no AHP surface — the existing `models` observable already fans a change out
 * through `RootAgentsChanged` to every client.
 *
 * ### Why this is gated on turn activity
 *
 * Each refresh is a real network request (`models.list` through the Copilot CLI
 * for `copilotcli`, `GET /models` via `CopilotApiService` for the others). An
 * unconditional timer issues those for the lifetime of the host process — which
 * outlives any individual window — even when nobody is using the agent, and
 * multiplies by the number of registered providers. Connection count is too
 * coarse to help: a connected window can sit idle for hours.
 *
 * So a tick only refreshes providers that have started a turn since their last
 * refresh, and a provider whose catalog is already stale when a turn arrives is
 * refreshed immediately rather than waiting up to a full interval. The result
 * mirrors the pull-with-TTL behavior of the extension's `ModelMetadataFetcher`:
 * the interval is an upper bound on staleness for a provider in use, and a
 * fully idle host makes no model requests at all.
 *
 * A tick is cheap when nothing changed: providers short-circuit without a
 * credential, and `AgentSideEffects` compares the published `AgentInfo[]`
 * before dispatching, so an unchanged catalog produces no protocol traffic.
 */
export class AgentModelRefreshScheduler extends Disposable {

	private readonly _timer = this._register(new IntervalTimer());
	private _agents: readonly IAgent[] = [];
	private _isTimerRunning = false;

	/**
	 * Providers that have started a turn since their last refresh. A provider is
	 * removed as soon as a refresh is issued for it, so a provider that goes
	 * quiet stops being refreshed after one final catch-up tick.
	 */
	private readonly _activeSinceLastRefresh = new Set<string>();
	/** Last refresh attempt per provider, used to decide whether a turn should refresh immediately. */
	private readonly _lastRefreshAt = new Map<string, number>();

	constructor(
		agents: IObservable<readonly IAgent[]>,
		/**
		 * Fires with a provider id when that provider starts a turn — i.e. when
		 * the host is about to make an LLM request on its behalf.
		 */
		onDidStartTurn: Event<string>,
		/**
		 * Tick cadence, normally {@link MODEL_REFRESH_INTERVAL_MS}. Passed in
		 * rather than read from an overridable field because the timer is armed
		 * from this constructor, which runs before a subclass could install its
		 * own value.
		 */
		private readonly _intervalMs: number,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// Start ticking once there is at least one provider, and stop again if
		// they all go away. Provider changes update the snapshot read by each
		// tick without re-arming the timer: dynamically registering Codex must
		// not postpone the next refresh for providers that were already present.
		this._register(autorun(reader => {
			this._agents = agents.read(reader);
			if (this._agents.length === 0) {
				this._timer.cancel();
				this._isTimerRunning = false;
				return;
			}
			if (!this._isTimerRunning) {
				this._timer.cancelAndSet(() => this._refreshActive(this._agents), this._intervalMs);
				this._isTimerRunning = true;
			}
		}));

		this._register(onDidStartTurn(provider => this._handleTurnStarted(provider)));
	}

	/**
	 * Records usage so the next tick refreshes this provider, and refreshes
	 * straight away when the catalog is already older than the interval. Without
	 * the immediate path, the first turn after a long idle period would run
	 * against an arbitrarily stale catalog until the next tick came around.
	 */
	private _handleTurnStarted(provider: string): void {
		const lastRefreshAt = this._lastRefreshAt.get(provider);
		if (lastRefreshAt !== undefined && Date.now() - lastRefreshAt < this._intervalMs) {
			this._activeSinceLastRefresh.add(provider);
			return;
		}
		const agent = this._agents.find(a => a.getDescriptor().provider === provider);
		if (!agent) {
			return;
		}
		this._activeSinceLastRefresh.delete(provider);
		this._refresh(agent, 'stale catalog on turn start');
	}

	private _refreshActive(agents: readonly IAgent[]): void {
		for (const agent of agents) {
			const provider = agent.getDescriptor().provider;
			if (!this._activeSinceLastRefresh.delete(provider)) {
				// Unused since the last refresh — its catalog has no consumer to
				// go stale for, and refreshing would be a network request made
				// purely because the process happens to still be running.
				continue;
			}
			this._refresh(agent, 'periodic');
		}
	}

	private _refresh(agent: IAgent, reason: string): void {
		if (!agent.refreshModels) {
			return;
		}
		const provider = agent.getDescriptor().provider;
		// Recorded before the request settles so a slow or failing refresh can't
		// let every subsequent turn trigger another one; providers own their own
		// retry/backoff policy.
		this._lastRefreshAt.set(provider, Date.now());
		this._logService.trace(`[AgentHost] Model refresh for ${provider} (${reason})`);
		// `refreshModels` is contractually non-rejecting, but a provider bug
		// must not take down the tick for the providers after it.
		agent.refreshModels().catch(err => this._logService.error(err, `[AgentHost] Model refresh failed for ${provider}`));
	}
}
