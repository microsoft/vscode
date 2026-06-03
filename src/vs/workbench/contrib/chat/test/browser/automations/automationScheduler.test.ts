/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAutomationLeaderElection } from '../../../browser/automations/automationLeaderElection.js';
import { IAutomationRunner } from '../../../common/automations/automationRunner.js';
import { AutomationSchedulerCore, CRASH_RECOVERY_REASON } from '../../../browser/automations/automationScheduler.js';
import { AutomationService } from '../../../browser/automations/automationService.js';
import { AutomationRunTrigger, IAutomation, IAutomationSchedule } from '../../../common/automations/automation.js';

const FOLDER = URI.parse('file:///workspace');

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

	async runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		_leaderWindowId: number,
		_token?: CancellationToken,
	): Promise<void> {
		this.runs.push({ automationId: automation.id, trigger });
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
		const service = teardown.add(new AutomationService(storage, log));
		const runner = new RecordingRunner();
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
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });
		// nextRunAt is T0+1h; advance the clock past it so the row is due.
		setNow(T_PAST_DUE);
		leader.set(true);
		await core.waitForPendingRuns();

		assert.strictEqual(runner.runs.length, 1);
		assert.strictEqual(runner.runs[0].automationId, a.id);
		assert.strictEqual(runner.runs[0].trigger, 'catch_up');
	});

	test('subsequent scheduled ticks use trigger=schedule', async () => {
		const { core, runner, service, leader, setNow } = setup();
		setNow(T0);
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });
		setNow(T_PAST_DUE);
		leader.set(true);
		await core.waitForPendingRuns();
		assert.strictEqual(runner.runs.length, 1, 'first run should be catch-up');

		// Advance well past the freshly-computed next slot and tick again.
		setNow(T_TOMORROW);
		await core.tickForTesting();

		assert.strictEqual(runner.runs.length, 2);
		assert.strictEqual(runner.runs[1].trigger, 'schedule');
	});

	test('disabled automations are not dispatched', async () => {
		const { core, runner, service, leader, setNow } = setup();
		setNow(T0);
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });
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
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });
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

	test('does nothing while not leader', async () => {
		const { core, runner, service, leader, setNow } = setup();
		setNow(T0);
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });
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
		const firstService = teardown.add(new AutomationService(storage, log));
		firstService.setClockForTesting(() => T0);
		const a = await firstService.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });
		const run = await firstService.recordRunStart(a.id, 'manual', 1);
		firstService.dispose();

		const service = teardown.add(new AutomationService(storage, log));
		service.setClockForTesting(() => T0);
		const runner = new RecordingRunner();
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
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });
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
});
