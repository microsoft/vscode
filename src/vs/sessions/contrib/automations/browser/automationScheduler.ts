/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer, raceTimeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { stringHash } from '../../../../base/common/hash.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IAutomation } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunner } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_AUTOMATIONS_RUN_TIMEOUT_MINUTES_SETTING, DEFAULT_AUTOMATIONS_RUN_TIMEOUT_MINUTES } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AutomationLeaderElection, IAutomationLeaderElection } from './automationLeaderElection.js';

export const DEFAULT_SCHEDULER_TICK_MS = 60_000;

// Stored on stale run rows on leader startup.
export const CRASH_RECOVERY_REASON = localize('automations.crashRecoveryReason', "Interrupted by app shutdown");

export const RUN_TIMEOUT_REASON_PREFIX = 'Timed out after';

export interface IAutomationSchedulerCoreOptions {
	readonly tickIntervalMs?: number;
	readonly now?: () => Date;
	readonly leaderElection?: IAutomationLeaderElection;
	readonly disableAutoTick?: boolean;
	readonly isFeatureEnabled?: () => boolean;
	readonly getRunTimeoutMs?: () => number;
}

export class AutomationSchedulerCore extends Disposable {

	private readonly _leader: IAutomationLeaderElection;

	private readonly _tickIntervalMs: number;
	private readonly _now: () => Date;
	private readonly _isFeatureEnabled: () => boolean;
	private readonly _getRunTimeoutMs: () => number;

	private readonly _timer = this._register(new IntervalTimer());
	private readonly _runCts = this._register(new CancellationTokenSource());

	// Reset on leadership loss so a future take-over re-runs crash recovery.
	private _didStartupForCurrentLeadership = false;

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

	/** Test-only: run a single tick and await it. */
	async tickForTesting(): Promise<void> {
		this.kickoffPendingRuns(() => this.tickOnce(false));
		await this._pendingRuns;
	}

	/** Test-only: await in-flight runs. */
	async waitForPendingRuns(): Promise<void> {
		await this._pendingRuns;
	}

	private kickoffPendingRuns(task: () => Promise<void>): void {
		if (this._store.isDisposed) {
			return;
		}
		// Serialized: only one dispatch at a time. Runs execute sequentially by design.
		this._pendingRuns = this._pendingRuns.then(task).catch(err => {
			this.logService.error('[AutomationScheduler] tick failed', err);
		});
	}

	private async tickOnce(isLeadershipTransition: boolean): Promise<void> {
		if (!this._leader.isLeader.get()) {
			return;
		}

		if (!this._isFeatureEnabled()) {
			return;
		}

		if (!this._didStartupForCurrentLeadership) {
			this._didStartupForCurrentLeadership = true;
			await this.automationService.markStaleRunsFailed(CRASH_RECOVERY_REASON);
			await this.dispatchDue('catch_up');
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

		const leaderWindowId = stringHash(this._leader.instanceId, 0);
		for (const automation of due) {
			try {
				await this.runOneWithTimeout(automation, trigger, leaderWindowId);
			} catch (err) {
				this.logService.error('[AutomationScheduler] dispatch failed for automation', automation.id, err);
			}
		}
	}

	private async runOneWithTimeout(automation: IAutomation, trigger: 'schedule' | 'catch_up', leaderWindowId: number): Promise<void> {
		const timeoutMs = this._getRunTimeoutMs();
		const perRunCts = new CancellationTokenSource(this._runCts.token);
		try {
			if (timeoutMs <= 0) {
				await this.runner.runOnce(automation, trigger, leaderWindowId, perRunCts.token).whenCompleted;
				return;
			}

			let timedOut = false;
			await raceTimeout(
				this.runner.runOnce(automation, trigger, leaderWindowId, perRunCts.token).whenCompleted,
				timeoutMs,
				() => {
					timedOut = true;
					this.logService.warn(`[AutomationScheduler] runOnce for automation ${automation.id} timed out after ${timeoutMs}ms.`);
				},
			);

			if (!timedOut) {
				return;
			}

			// Best-effort: mark the active run row as failed so the UI doesn't show "running" forever.
			try {
				const active = this.automationService.getActiveRunFor(automation.id);
				if (active) {
					await this.automationService.updateRun(active.id, {
						status: 'failed',
						errorMessage: localize('automation.timedOut', "Timed out after {0} minute(s).", Math.round(timeoutMs / 60_000)),
						completedAt: this._now().toISOString(),
					});
				}
			} catch (err) {
				this.logService.warn('[AutomationScheduler] failed to mark timed-out run as failed', err);
			}
			perRunCts.cancel();
		} finally {
			perRunCts.dispose();
		}
	}

	override dispose(): void {
		this._runCts.cancel();
		super.dispose();
	}
}

// DI wrapper. Tests construct AutomationSchedulerCore directly.
export class AutomationScheduler extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.automationScheduler';

	private readonly _core = this._register(new MutableDisposable<AutomationSchedulerCore>());

	constructor(
		@IAutomationService private readonly _automationService: IAutomationService,
		@IAutomationRunner private readonly _runner: IAutomationRunner,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		if (this._isEnabled()) {
			this._createCore();
		}
		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING)) {
				if (this._isEnabled()) {
					this._createCore();
				} else {
					this._core.clear();
				}
			}
		}));
	}

	private _isEnabled(): boolean {
		return this._configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
	}

	private _createCore(): void {
		if (this._core.value) {
			return;
		}
		this._core.value = new AutomationSchedulerCore(this._automationService, this._runner, this._storageService, this._logService, {
			isFeatureEnabled: () => this._isEnabled(),
			getRunTimeoutMs: () => {
				const minutes = this._configurationService.getValue<number>(CHAT_AUTOMATIONS_RUN_TIMEOUT_MINUTES_SETTING);
				const sane = typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 1
					? minutes
					: DEFAULT_AUTOMATIONS_RUN_TIMEOUT_MINUTES;
				return sane * 60_000;
			},
		});
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
