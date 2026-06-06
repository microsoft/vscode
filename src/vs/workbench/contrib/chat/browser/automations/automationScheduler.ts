/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer, raceTimeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IAutomation } from '../../common/automations/automation.js';
import { IAutomationRunner } from '../../common/automations/automationRunner.js';
import { IAutomationService } from '../../common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_AUTOMATIONS_RUN_TIMEOUT_MINUTES_SETTING, DEFAULT_AUTOMATIONS_RUN_TIMEOUT_MINUTES } from '../../common/automations/automationsEnabled.js';
import { AutomationLeaderElection, IAutomationLeaderElection } from './automationLeaderElection.js';

/**
 * Default cadence at which the scheduler scans for due automations.
 * Matches the github-app reference implementation; high enough to keep
 * CPU/storage chatter low, low enough that a "daily 9:00" automation
 * fires within a minute of its target time.
 */
export const DEFAULT_SCHEDULER_TICK_MS = 60_000;

/**
 * Marker stored on `runs[]` rows that we replace with `failed` on
 * leader startup. Documented constant so tests can assert it.
 */
export const CRASH_RECOVERY_REASON = 'Interrupted by app shutdown';

/**
 * Marker stored on a `runs[]` row that gets cancelled because the
 * scheduler's per-run timeout fired.
 */
export const RUN_TIMEOUT_REASON_PREFIX = 'Timed out after';

export interface IAutomationSchedulerCoreOptions {
	readonly tickIntervalMs?: number;
	readonly now?: () => Date;
	readonly leaderElection?: IAutomationLeaderElection;
	/** If true, the periodic timer is not started; useful for tests. */
	readonly disableAutoTick?: boolean;
	/**
	 * Predicate that gates dispatch. When it returns `false`, the
	 * scheduler skips its tick body entirely — no crash recovery, no
	 * catch-up, no dispatch. Used to wire the
	 * `chat.automations.enabled` setting; defaults to always-on so
	 * tests don't have to think about it.
	 */
	readonly isFeatureEnabled?: () => boolean;
	/**
	 * Per-run timeout in milliseconds. Returned by a callback so tests
	 * (and the workbench wiring) can read the setting live. A return
	 * value of `0` or negative disables the timeout. Default is 30
	 * minutes.
	 */
	readonly getRunTimeoutMs?: () => number;
}

/**
 * The actual scheduler logic. Takes plain (non-DI) arguments so tests
 * can construct it directly with fakes. The DI-friendly workbench
 * contribution {@link AutomationScheduler} wraps this class.
 *
 * Lifecycle:
 *   1. Builds an {@link AutomationLeaderElection} (unless one is
 *      injected by tests). Only the window that wins the election
 *      does any work; the others sit idle until they take over.
 *   2. When this window becomes leader, runs a one-time crash recovery
 *      pass (fail any leftover `pending`/`running` rows) and a
 *      catch-up tick (`trigger: 'catch_up'`).
 *   3. Every {@link DEFAULT_SCHEDULER_TICK_MS} ms thereafter, scans
 *      `IAutomationService.automations` for rows whose `enabled` is
 *      true and `nextRunAt <= now`, advances each row's `nextRunAt`,
 *      and dispatches to {@link IAutomationRunner}.
 */
export class AutomationSchedulerCore extends Disposable {

	private readonly _leader: IAutomationLeaderElection;

	private readonly _tickIntervalMs: number;
	private readonly _now: () => Date;
	private readonly _isFeatureEnabled: () => boolean;
	private readonly _getRunTimeoutMs: () => number;

	private readonly _timer = this._register(new IntervalTimer());
	private readonly _runCts = this._register(new CancellationTokenSource());

	/**
	 * Tracks whether we've already done the once-per-leadership startup
	 * work (crash recovery + catch-up). Reset to `false` if we ever
	 * lose leadership, so a future take-over re-runs the catch-up.
	 */
	private _didStartupForCurrentLeadership = false;

	/** Promise chain for in-flight runs, awaited by tests. */
	private _pendingRuns: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly automationService: IAutomationService,
		private readonly runner: IAutomationRunner,
		storageService: IStorageService,
		private readonly logService: ILogService,
		options: IAutomationSchedulerCoreOptions = {},
	) {
		super();

		this._tickIntervalMs = options.tickIntervalMs ?? DEFAULT_SCHEDULER_TICK_MS;
		this._now = options.now ?? (() => new Date());
		this._isFeatureEnabled = options.isFeatureEnabled ?? (() => true);
		this._getRunTimeoutMs = options.getRunTimeoutMs ?? (() => DEFAULT_AUTOMATIONS_RUN_TIMEOUT_MINUTES * 60_000);

		this._leader = options.leaderElection ?? this._register(new AutomationLeaderElection(storageService, logService));

		// React to leadership transitions. When we *become* leader, do
		// the startup work and an immediate tick; when we lose it, arm
		// the catch-up flag so a future take-over re-runs recovery.
		this._register(autorun(reader => {
			const isLeader = this._leader.isLeader.read(reader);
			if (!isLeader) {
				this._didStartupForCurrentLeadership = false;
				return;
			}
			this.kickoffPendingRuns(() => this.tickOnce(true));
		}));

		if (!options.disableAutoTick) {
			this._timer.cancelAndSet(() => {
				this.kickoffPendingRuns(() => this.tickOnce(false));
			}, this._tickIntervalMs);
		}
	}

	/** Test-only: run a single tick synchronously and await it. */
	async tickForTesting(): Promise<void> {
		this.kickoffPendingRuns(() => this.tickOnce(false));
		await this._pendingRuns;
	}

	/** Test-only: await the chain of in-flight runs. */
	async waitForPendingRuns(): Promise<void> {
		await this._pendingRuns;
	}

	private kickoffPendingRuns(task: () => Promise<void>): void {
		this._pendingRuns = this._pendingRuns.then(task).catch(err => {
			this.logService.error('[AutomationScheduler] tick failed', err);
		});
	}

	private async tickOnce(isLeadershipTransition: boolean): Promise<void> {
		if (!this._leader.isLeader.get()) {
			return;
		}

		// Skip all dispatch work when the feature is disabled via the
		// `chat.automations.enabled` setting. We intentionally do NOT
		// reset `_didStartupForCurrentLeadership` here: that flag is
		// scoped to actual leadership transitions (handled in the
		// `autorun` block above), not to user-driven feature toggles.
		// Resetting it here would cause the next post-re-enable tick to
		// call `markStaleRunsFailed`, which would incorrectly fail any
		// in-progress runs that were active across the toggle.
		if (!this._isFeatureEnabled()) {
			return;
		}

		// On the very first tick after winning the election, recover
		// any orphan run rows and do a catch-up pass on all due
		// automations regardless of how far behind they are.
		if (!this._didStartupForCurrentLeadership) {
			this._didStartupForCurrentLeadership = true;
			await this.automationService.markStaleRunsFailed(CRASH_RECOVERY_REASON);
			await this.dispatchDue('catch_up');
			// If this kickoff was triggered purely by becoming leader
			// we're done; the periodic timer will keep ticking.
			if (isLeadershipTransition) {
				return;
			}
		}

		await this.dispatchDue('schedule');
	}

	private async dispatchDue(trigger: 'schedule' | 'catch_up'): Promise<void> {
		const now = this._now();
		const due = this.automationService.automations.get().filter(a => isDue(a, now));
		if (due.length === 0) {
			return;
		}

		const leaderWindowId = hashStringToInt(this._leader.instanceId);
		for (const automation of due) {
			// Advance the schedule first so a subsequent tick (or a
			// concurrent leader race) does not pick the same row up.
			await this.automationService.advanceNextRunAt(automation.id, now);
			await this.runOneWithTimeout(automation, trigger, leaderWindowId);
		}
	}

	/**
	 * Runs a single automation with a per-run timeout so a hung run
	 * can't permanently block the dispatch chain. If the timeout
	 * fires, we cancel the per-run token (signalling the runner to
	 * stop) and best-effort mark the run row as failed so the UI
	 * reflects the timeout. We always resolve — `runOnce` is
	 * documented to never throw — so the surrounding `for` loop
	 * always advances.
	 */
	private async runOneWithTimeout(automation: IAutomation, trigger: 'schedule' | 'catch_up', leaderWindowId: number): Promise<void> {
		const timeoutMs = this._getRunTimeoutMs();
		const perRunCts = new CancellationTokenSource(this._runCts.token);
		try {
			if (timeoutMs <= 0) {
				await this.runner.runOnce(automation, trigger, leaderWindowId, perRunCts.token);
				return;
			}

			let timedOut = false;
			await raceTimeout(
				this.runner.runOnce(automation, trigger, leaderWindowId, perRunCts.token),
				timeoutMs,
				() => {
					timedOut = true;
					this.logService.warn(`[AutomationScheduler] runOnce for automation ${automation.id} timed out after ${timeoutMs}ms; cancelling.`);
					perRunCts.cancel();
				},
			);

			if (!timedOut) {
				return;
			}

			// Best-effort: mark the currently-active run row as failed
			// so the UI doesn't show a stuck "running" indicator. If
			// the runner never started a row (or already finished one
			// after our cancel signalled), there's nothing to update.
			try {
				const active = this.automationService.getActiveRunFor(automation.id);
				if (active) {
					await this.automationService.updateRun(active.id, {
						status: 'failed',
						errorMessage: `${RUN_TIMEOUT_REASON_PREFIX} ${Math.round(timeoutMs / 60_000)} minute(s).`,
						completedAt: this._now().toISOString(),
					});
				}
			} catch (err) {
				this.logService.warn('[AutomationScheduler] failed to mark timed-out run as failed', err);
			}
		} finally {
			perRunCts.dispose();
		}
	}

	override dispose(): void {
		this._runCts.cancel();
		super.dispose();
	}
}

/**
 * DI-only workbench contribution that owns a single
 * {@link AutomationSchedulerCore} for the lifetime of the workbench.
 * Tests construct {@link AutomationSchedulerCore} directly with fakes.
 */
export class AutomationScheduler extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.automationScheduler';

	constructor(
		@IAutomationService automationService: IAutomationService,
		@IAutomationRunner runner: IAutomationRunner,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this._register(new AutomationSchedulerCore(automationService, runner, storageService, logService, {
			isFeatureEnabled: () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true,
			getRunTimeoutMs: () => {
				const minutes = configurationService.getValue<number>(CHAT_AUTOMATIONS_RUN_TIMEOUT_MINUTES_SETTING);
				const sane = typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 1
					? minutes
					: DEFAULT_AUTOMATIONS_RUN_TIMEOUT_MINUTES;
				return sane * 60_000;
			},
		}));
	}
}

function isDue(automation: IAutomation, now: Date): boolean {
	if (!automation.enabled || !automation.nextRunAt) {
		return false;
	}
	const next = Date.parse(automation.nextRunAt);
	if (Number.isNaN(next)) {
		return false;
	}
	return next <= now.getTime();
}

/**
 * Stable 32-bit hash so we can stamp a numeric `leaderWindowId` onto
 * each run row from the (string) instance id. Not used for security,
 * only for human-readable diagnostics.
 */
function hashStringToInt(str: string): number {
	let h = 0;
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) - h) + str.charCodeAt(i);
		h |= 0;
	}
	return Math.abs(h);
}

