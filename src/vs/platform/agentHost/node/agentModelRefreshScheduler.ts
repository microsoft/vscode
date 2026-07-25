/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IObservable, autorun } from '../../../base/common/observable.js';
import { ILogService } from '../../log/common/log.js';
import { IAgent } from '../common/agentService.js';

/**
 * How often every provider re-enumerates its model catalog.
 *
 * Model refreshes are otherwise edge-triggered — authentication, transport
 * flips, client restarts — so without a periodic tick a model added on the
 * service side stays invisible until the GitHub token happens to rotate, which
 * on a long-lived window can be hours or never.
 */
export const MODEL_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Ticks {@link IAgent.refreshModels} across every registered provider on a
 * fixed interval.
 *
 * Lives in the host rather than the client because model freshness is provider
 * truth: only the provider knows its backend, holds the credential, and owns
 * the stale-write and backoff policy. Keeping the timer here also means one
 * tick per provider regardless of how many windows are connected, and requires
 * no AHP surface — the existing `models` observable already fans a change out
 * through `RootAgentsChanged` to every client.
 *
 * A tick is cheap when nothing changed: providers short-circuit without a
 * credential, and `AgentSideEffects` compares the published `AgentInfo[]`
 * before dispatching, so an unchanged catalog produces no protocol traffic.
 */
export class AgentModelRefreshScheduler extends Disposable {

	private readonly _timer = this._register(new IntervalTimer());
	private _agents: readonly IAgent[] = [];
	private _isTimerRunning = false;

	constructor(
		agents: IObservable<readonly IAgent[]>,
		/**
		 * Tick cadence, normally {@link MODEL_REFRESH_INTERVAL_MS}. Passed in
		 * rather than read from an overridable field because the timer is armed
		 * from this constructor, which runs before a subclass could install its
		 * own value.
		 */
		intervalMs: number,
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
				this._timer.cancelAndSet(() => this._refreshAll(this._agents), intervalMs);
				this._isTimerRunning = true;
			}
		}));
	}

	private _refreshAll(agents: readonly IAgent[]): void {
		for (const agent of agents) {
			if (!agent.refreshModels) {
				continue;
			}
			const provider = agent.getDescriptor().provider;
			this._logService.trace(`[AgentHost] Periodic model refresh for ${provider}`);
			// `refreshModels` is contractually non-rejecting, but a provider bug
			// must not take down the tick for the providers after it.
			agent.refreshModels().catch(err => this._logService.error(err, `[AgentHost] Periodic model refresh failed for ${provider}`));
		}
	}
}
