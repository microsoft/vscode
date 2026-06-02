/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IAutomation } from '../../common/automations/automation.js';
import { IAutomationService } from '../../common/automations/automationService.js';
import { AutomationLeaderElection, IAutomationLeaderElection } from './automationLeaderElection.js';
import { IAutomationRunner, PlaceholderAutomationRunner } from './automationRunner.js';

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

export interface IAutomationSchedulerCoreOptions {
	readonly tickIntervalMs?: number;
	readonly now?: () => Date;
	readonly runner?: IAutomationRunner;
	readonly leaderElection?: IAutomationLeaderElection;
	/** If true, the periodic timer is not started; useful for tests. */
	readonly disableAutoTick?: boolean;
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
	private readonly _runner: IAutomationRunner;

	private readonly _tickIntervalMs: number;
	private readonly _now: () => Date;

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
		storageService: IStorageService,
		private readonly logService: ILogService,
		options: IAutomationSchedulerCoreOptions = {},
	) {
		super();

		this._tickIntervalMs = options.tickIntervalMs ?? DEFAULT_SCHEDULER_TICK_MS;
		this._now = options.now ?? (() => new Date());

		this._leader = options.leaderElection ?? this._register(new AutomationLeaderElection(storageService, logService));
		this._runner = options.runner ?? new PlaceholderAutomationRunner(automationService, logService);

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
			// runOnce never throws; failures are recorded on the run row.
			await this._runner.runOnce(automation, trigger, leaderWindowId, this._runCts.token);
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
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super();
		this._register(new AutomationSchedulerCore(automationService, storageService, logService));
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

