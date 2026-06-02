/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { PlaceholderAutomationRunner } from '../../../browser/automations/automationRunner.js';
import { AutomationService } from '../../../browser/automations/automationService.js';
import { IAutomationSchedule } from '../../../common/automations/automation.js';

function hourly(): IAutomationSchedule {
	return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}

suite('PlaceholderAutomationRunner', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const service = teardown.add(new AutomationService(storage, log));
		const runner = new PlaceholderAutomationRunner(service, log);
		runner.setRunDurationForTesting(0);
		return { service, runner };
	}

	test('runs a single automation to completion and records the run', async () => {
		const { service, runner } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly() });
		await runner.runOnce(a, 'schedule', 42);

		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].automationId, a.id);
		assert.strictEqual(runs[0].status, 'completed');
		assert.strictEqual(runs[0].trigger, 'schedule');
		assert.strictEqual(runs[0].leaderWindowId, 42);
		assert.ok(runs[0].completedAt);
	});

	test('skips when another active run exists for the same automation', async () => {
		const { service, runner } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly() });
		await service.recordRunStart(a.id, 'manual', 1);
		await runner.runOnce(a, 'schedule', 42);

		// Only the pre-existing pending row should be in the ledger.
		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'pending');
	});

	test('does not throw if the automation is deleted mid-run', async () => {
		const { service, runner } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly() });
		await service.deleteAutomation(a.id);
		await runner.runOnce(a, 'manual', 1);
		// The run starts but recordRunStart should throw "Automation not found";
		// runner catches it and produces no run rows.
		assert.deepStrictEqual(service.runs.get(), []);
	});
});
