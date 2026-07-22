/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAutomationLeaderElection } from '../../browser/automationLeaderElection.js';
import { IAutomationRunner, IAutomationRunOperation } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { AutomationSchedulerCore, CRASH_RECOVERY_REASON, RUN_TIMEOUT_REASON_PREFIX } from '../../browser/automationScheduler.js';
import { AutomationService } from '../../browser/automationService.js';
import { AutomationRunTrigger, AutomationTarget, IAutomation, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';

const FOLDER = URI.parse('file:///workspace');
const TARGET: AutomationTarget = { kind: 'workspace', folderUri: FOLDER, isolation: { kind: 'default' } };

class FakeLeaderElection implements IAutomationLeaderElection {
	private readonly _isLeader: ISettableObservable<boolean>;
	readonly isLeader: IObservable<boolean>;
	readonly instanceId = 'fake-leader-window';

	constructor(initial = true) {
		this._isLeader = observableValue<boolean>(this, initial);
		this.isLeader = this._isLeader;
	}

	set(value: boolean): void {
		this._isLeader.set(value, undefined);
	}

	evaluateForTesting(): void { /* no-op */ }
	dispose(): void { /* no-op */ }
}

interface RecordedRun {
	readonly automationId: string;
	readonly trigger: AutomationRunTrigger;
}

class RecordingRunner implements IAutomationRunner {
	declare readonly _serviceBrand: undefined;

	readonly runs: RecordedRun[] = [];

	constructor(private readonly service: AutomationService) { }

	runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		_token?: CancellationToken,
	): IAutomationRunOperation {
		this.runs.push({ automationId: automation.id, trigger });
		const operation = (async () => {
			const run = await this.service.recordRunStart(automation.id, trigger, leaderWindowId);
			await this.service.updateRun(run.id, { status: 'completed' });
		})();
		return {
			whenDispatched: operation,
			whenCompleted: operation,
		};
	}
}

class SkippingRunner implements IAutomationRunner {
	declare readonly _serviceBrand: undefined;

	readonly runs: RecordedRun[] = [];

	runOnce(automation: IAutomation, trigger: AutomationRunTrigger): IAutomationRunOperation {
		this.runs.push({ automationId: automation.id, trigger });
		return {
			whenDispatched: Promise.resolve(),
			whenCompleted: Promise.resolve(),
		};
	}
}

function hourly(): IAutomationSchedule {
	return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}

const T0 = new Date('2025-06-01T00:00:00Z');
const T_PAST_DUE = new Date('2025-06-01T02:00:00Z');
const T_TOMORROW = new Date('2025-06-02T04:00:00Z');

suite('AutomationSchedulerCore', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const service = teardown.add(new AutomationService(storage, log, NullTelemetryService));
		const runner = new RecordingRunner(service);
		// Start as non-leader so individual tests can seed automations
		// before triggering the leader's catch-up pass.
		const leader = new FakeLeaderElection(false);

		let now = T0;
		service.setClockForTesting(() => now);
		const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
			leaderElection: leader,
			disableAutoTick: true,
			now: () => now,
		}));

		return {
			service, runner, leader, core,
			setNow: (d: Date) => { now = d; },
		};
	}

	test('does not run anything if there are no automations', async () => {
		const { core, runner, leader } = setup();
		leader.set(true);
		await core.waitForPendingRuns();
		await core.tickForTesting();
		assert.deepStrictEqual(runner.runs, []);
	});

	test('on becoming leader, runs catch-up for due automations exactly once', async () => {
		const { core, runner, service, leader, setNow } = setup();
		setNow(T0);
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		// nextRunAt is T0+1h; advance the clock past it so the row is due.
		setNow(T_PAST_DUE);
		leader.set(true);
		await core.waitForPendingRuns();

		assert.strictEqual(runner.runs.length, 1);
		assert.strictEqual(runner.runs[0].automationId, a.id);
		assert.strictEqual(runner.runs[0].trigger, 'catch_up');
	});

	test('delayed scheduled ticks use trigger=schedule', async () => {
		const { core, runner, service, leader, setNow } = setup();
		setNow(T0);
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		setNow(T_PAST_DUE);
		leader.set(true);
		await core.waitForPendingRuns();
		assert.strictEqual(runner.runs.length, 1, 'first run should be catch-up');

		setNow(T_TOMORROW);
		await core.tickForTesting();

		assert.strictEqual(runner.runs.length, 2);
		assert.strictEqual(runner.runs[1].trigger, 'schedule');
	});

	test('disabled automations are not dispatched', async () => {
		const { core, runner, service, leader, setNow } = setup();
		setNow(T0);
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		await service.updateAutomation(a.id, { enabled: false });
		setNow(T_PAST_DUE);
		leader.set(true);
		await core.waitForPendingRuns();
		await core.tickForTesting();
		assert.deepStrictEqual(runner.runs, []);
	});

	test('advances nextRunAt so the same automation is not picked up again on the next tick', async () => {
		const { core, runner, service, leader, setNow } = setup();
		setNow(T0);
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		setNow(T_PAST_DUE);
		leader.set(true);
		await core.waitForPendingRuns();
		assert.strictEqual(runner.runs.length, 1);

		// Tick again immediately - nextRunAt was advanced, so the
		// automation is no longer due at the same `now`.
		await core.tickForTesting();
		assert.strictEqual(runner.runs.length, 1);

		const updated = service.getAutomation(a.id);
		assert.ok(updated?.nextRunAt);
		const next = Date.parse(updated!.nextRunAt!);
		assert.ok(next > T_PAST_DUE.getTime(), 'nextRunAt should be after the tick that just fired');
	});

	test('does not report a run until the runner records its claim', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const service = teardown.add(new AutomationService(storage, log, NullTelemetryService));
		service.setClockForTesting(() => T0);
		const automation = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		const leader = new FakeLeaderElection(false);
		const runner = new SkippingRunner();
		const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
			leaderElection: leader,
			disableAutoTick: true,
			now: () => T_PAST_DUE,
		}));

		leader.set(true);
		await core.waitForPendingRuns();

		assert.deepStrictEqual({
			dispatches: runner.runs.length,
			lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
			nextRunAt: service.getAutomation(automation.id)?.nextRunAt,
			runCount: service.runs.get().length,
		}, {
			dispatches: 1,
			lastRunAt: undefined,
			nextRunAt: automation.nextRunAt,
			runCount: 0,
		});
	});

	test('retries a still-due automation when target availability changes', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const service = teardown.add(new AutomationService(storage, log, NullTelemetryService));
		service.setClockForTesting(() => T0);
		const automation = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		const runner = new SkippingRunner();
		const leader = new FakeLeaderElection(false);
		const onDidChangeTargetAvailability = teardown.add(new Emitter<void>());
		const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
			leaderElection: leader,
			disableAutoTick: true,
			now: () => T_PAST_DUE,
			onDidChangeTargetAvailability: onDidChangeTargetAvailability.event,
		}));

		leader.set(true);
		await core.waitForPendingRuns();
		onDidChangeTargetAvailability.fire();
		await core.waitForPendingRuns();

		assert.deepStrictEqual({
			dispatches: runner.runs,
			lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
			nextRunAt: service.getAutomation(automation.id)?.nextRunAt,
		}, {
			dispatches: [
				{ automationId: automation.id, trigger: 'catch_up' },
				{ automationId: automation.id, trigger: 'schedule' },
			],
			lastRunAt: undefined,
			nextRunAt: automation.nextRunAt,
		});
	});

	test('does nothing while not leader', async () => {
		const { core, runner, service, leader, setNow } = setup();
		setNow(T0);
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		setNow(T_PAST_DUE);
		await core.waitForPendingRuns();
		await core.tickForTesting();
		assert.strictEqual(runner.runs.length, 0);

		leader.set(true);
		await core.waitForPendingRuns();
		assert.strictEqual(runner.runs.length, 1);
		assert.strictEqual(runner.runs[0].trigger, 'catch_up');
	});

	test('on becoming leader, fails any leftover pending/running runs as crash recovery', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const firstService = teardown.add(new AutomationService(storage, log, NullTelemetryService));
		firstService.setClockForTesting(() => T0);
		const a = await firstService.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		const run = await firstService.recordRunStart(a.id, 'manual', 1);
		firstService.dispose();

		const service = teardown.add(new AutomationService(storage, log, NullTelemetryService));
		service.setClockForTesting(() => T0);
		const runner = new RecordingRunner(service);
		const leader = new FakeLeaderElection(true);
		const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
			leaderElection: leader,
			disableAutoTick: true,
			now: () => T0,
		}));
		await core.waitForPendingRuns();

		const recovered = service.runs.get().find(r => r.id === run.id);
		assert.strictEqual(recovered?.status, 'failed');
		assert.strictEqual(recovered?.errorMessage, CRASH_RECOVERY_REASON);
	});

	test('losing then regaining leadership re-runs catch-up', async () => {
		const { core, runner, service, leader, setNow } = setup();
		setNow(T0);
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		setNow(T_PAST_DUE);
		leader.set(true);
		await core.waitForPendingRuns();
		assert.strictEqual(runner.runs[0].trigger, 'catch_up');

		// Lose leadership.
		leader.set(false);
		await core.waitForPendingRuns();

		// Make the row due again.
		setNow(T_TOMORROW);

		// Regain it - we should see another catch-up.
		leader.set(true);
		await core.waitForPendingRuns();
		assert.strictEqual(runner.runs.length, 2);
		assert.strictEqual(runner.runs[1].trigger, 'catch_up');
	});

	test('toggling the feature setting off then on does not crash-recover in-progress runs', async () => {
		// Reproduce the bug where disabling the feature reset the
		// per-leadership startup flag, causing a subsequent re-enable
		// tick to call markStaleRunsFailed and incorrectly fail any
		// runs that were active across the toggle.
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const service = teardown.add(new AutomationService(storage, log, NullTelemetryService));
		service.setClockForTesting(() => T0);
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		const inFlight = await service.recordRunStart(a.id, 'schedule', 1);

		const runner = new RecordingRunner(service);
		const leader = new FakeLeaderElection(true);
		let enabled = true;
		const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
			leaderElection: leader,
			disableAutoTick: true,
			now: () => T0,
			isFeatureEnabled: () => enabled,
		}));
		// First tick (as leader, feature ON) does startup recovery,
		// which by design fails the in-flight row. Tests below only
		// care that the *next* enable→disable→enable cycle does not
		// repeat that recovery.
		await core.waitForPendingRuns();
		// Reset the row back to running so we can observe whether the
		// toggle re-triggers recovery. Note: updateRun's patch
		// semantics treat undefined fields as "no change", so we
		// cannot clear errorMessage from here; assert only on status.
		await service.updateRun(inFlight.id, { status: 'running' });

		enabled = false;
		await core.tickForTesting();
		enabled = true;
		await core.tickForTesting();

		// The in-flight run must still be running. The feature toggle
		// must NOT have re-triggered crash recovery.
		const after = service.runs.get().find(r => r.id === inFlight.id);
		assert.strictEqual(after?.status, 'running', 'feature-toggle off/on must not fail in-flight runs');
	});

	test('runOneWithTimeout: a hung run is cancelled, marked failed, and the next due automation still fires', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const service = teardown.add(new AutomationService(storage, log, NullTelemetryService));

		let now = T0;
		service.setClockForTesting(() => now);
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: TARGET });
		const b = await service.createAutomation({ name: 'B', prompt: 'q', schedule: hourly(), target: TARGET });

		// The first run hangs until cancellation and tries to record `Cancelled`,
		// matching the real runner's timeout behavior.
		let hungAutomationId: string | undefined;
		class HangingRunner implements IAutomationRunner {
			declare readonly _serviceBrand: undefined;
			readonly hung = new DeferredPromise<void>();
			calls = 0;
			cancelObserved = false;
			runOnce(automation: IAutomation, trigger: AutomationRunTrigger, leaderWindowId: number, token?: CancellationToken): IAutomationRunOperation {
				this.calls++;
				const whenCompleted = this._run(automation, trigger, leaderWindowId, token);
				return {
					whenDispatched: Promise.resolve(),
					whenCompleted,
				};
			}

			private async _run(automation: IAutomation, trigger: AutomationRunTrigger, leaderWindowId: number, token?: CancellationToken): Promise<void> {
				if (this.calls === 1) {
					hungAutomationId = automation.id;
					await service.recordRunStart(automation.id, trigger, leaderWindowId);
					const listener = token?.onCancellationRequested(() => {
						this.cancelObserved = true;
						const active = service.getActiveRunFor(automation.id);
						if (active) {
							void service.updateRun(active.id, {
								status: 'failed',
								errorMessage: 'Cancelled',
							});
						}
						this.hung.complete();
					});
					try {
						await this.hung.p;
					} finally {
						listener?.dispose();
					}
					return;
				}
				await service.recordRunStart(automation.id, trigger, leaderWindowId);
			}
		}
		const runner = new HangingRunner();
		const leader = new FakeLeaderElection(false);

		// Use a very short timeout so the test finishes quickly.
		const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
			leaderElection: leader,
			disableAutoTick: true,
			now: () => now,
			getRunTimeoutMs: () => 50,
		}));

		now = T_PAST_DUE;
		leader.set(true);
		await core.waitForPendingRuns();

		// Both A and B should have been dispatched (the second was
		// not blocked by the first's hang). The hung automation's run
		// row must be failed with the timeout reason; the runner must
		// have observed cancellation.
		assert.strictEqual(runner.calls, 2, 'both A and B should have been dispatched');
		assert.strictEqual(runner.cancelObserved, true, 'runner should observe cancellation on timeout');
		assert.ok(hungAutomationId, 'runner should have recorded a hung automation id');
		const otherId = hungAutomationId === a.id ? b.id : a.id;
		const hungRun = service.runs.get().find(r => r.automationId === hungAutomationId);
		assert.strictEqual(hungRun?.status, 'failed');
		assert.ok(hungRun?.errorMessage?.startsWith(RUN_TIMEOUT_REASON_PREFIX), `expected timeout marker, got: ${hungRun?.errorMessage}`);
		// The non-hung automation's row should NOT have been touched
		// by the timeout path.
		const otherRun = service.runs.get().find(r => r.automationId === otherId);
		assert.notStrictEqual(otherRun?.status, 'failed');
	});
});
