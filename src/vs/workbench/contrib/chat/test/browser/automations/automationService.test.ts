/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { AutomationService } from '../../../browser/automations/automationService.js';
import { IAutomationSchedule } from '../../../common/automations/automation.js';

function dailySchedule(hour = 9, minute = 0): IAutomationSchedule {
	return { interval: 'daily', scheduleHour: hour, scheduleMinute: minute, scheduleDay: 0 };
}

suite('AutomationService', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(storage?: InMemoryStorageService): { service: AutomationService; storage: InMemoryStorageService } {
		const sharedStorage = teardown.add(storage ?? new InMemoryStorageService());
		const service = teardown.add(new AutomationService(sharedStorage, new NullLogService()));
		return { service, storage: sharedStorage };
	}

	test('starts with an empty ledger when nothing is persisted', () => {
		const { service } = createService();
		assert.deepStrictEqual(service.automations.get(), []);
		assert.deepStrictEqual(service.runs.get(), []);
	});

	test('createAutomation appends an entry and computes nextRunAt for non-manual schedules', async () => {
		const { service } = createService();
		const a = await service.createAutomation({
			name: 'Daily review',
			prompt: 'Summarize what changed',
			schedule: dailySchedule(),
		});
		assert.strictEqual(service.automations.get().length, 1);
		assert.strictEqual(service.automations.get()[0].id, a.id);
		assert.ok(a.nextRunAt, 'daily schedule should produce a nextRunAt');
		assert.strictEqual(a.enabled, true);
	});

	test('createAutomation with manual schedule leaves nextRunAt undefined', async () => {
		const { service } = createService();
		const a = await service.createAutomation({
			name: 'Manual',
			prompt: 'p',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
		});
		assert.strictEqual(a.nextRunAt, undefined);
	});

	test('updateAutomation recomputes nextRunAt when the schedule changes', async () => {
		const { service } = createService();
		const a = await service.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: dailySchedule(9, 0),
		});
		const before = a.nextRunAt;
		const b = await service.updateAutomation(a.id, { schedule: dailySchedule(10, 30) });
		assert.notStrictEqual(b.nextRunAt, before);
	});

	test('updateAutomation keeps nextRunAt when only the name changes', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule() });
		const b = await service.updateAutomation(a.id, { name: 'B' });
		assert.strictEqual(b.nextRunAt, a.nextRunAt);
		assert.strictEqual(b.name, 'B');
	});

	test('updateAutomation can clear optional fields by passing null', async () => {
		const { service } = createService();
		const a = await service.createAutomation({
			name: 'A', prompt: 'p', schedule: dailySchedule(),
			folderUri: URI.parse('file:///workspace'),
			modelId: 'gpt-4',
		});
		const b = await service.updateAutomation(a.id, { folderUri: null, modelId: null });
		assert.strictEqual(b.folderUri, undefined);
		assert.strictEqual(b.modelId, undefined);
	});

	test('deleteAutomation removes the entry but leaves runs alone', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule() });
		await service.recordRunStart(a.id, 'manual', 1);
		await service.deleteAutomation(a.id);
		assert.deepStrictEqual(service.automations.get(), []);
		assert.strictEqual(service.runs.get().length, 1);
	});

	test('recordRunStart inserts a pending run; updateRun applies a patch', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule() });
		const run = await service.recordRunStart(a.id, 'schedule', 42);
		assert.strictEqual(run.status, 'pending');
		assert.strictEqual(run.leaderWindowId, 42);
		const updated = await service.updateRun(run.id, { status: 'completed', sessionId: 'sess-1', completedAt: new Date().toISOString() });
		assert.strictEqual(updated?.status, 'completed');
		assert.strictEqual(updated?.sessionId, 'sess-1');
	});

	test('getActiveRunFor returns the first pending or running run for an automation', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule() });
		assert.strictEqual(service.getActiveRunFor(a.id), undefined);
		const run = await service.recordRunStart(a.id, 'schedule', 1);
		assert.strictEqual(service.getActiveRunFor(a.id)?.id, run.id);
		await service.updateRun(run.id, { status: 'completed' });
		assert.strictEqual(service.getActiveRunFor(a.id), undefined);
	});

	test('markStaleRunsFailed moves pending and running rows to failed', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule() });
		const r1 = await service.recordRunStart(a.id, 'schedule', 1);
		const r2 = await service.recordRunStart(a.id, 'schedule', 1);
		await service.updateRun(r1.id, { status: 'running' });
		await service.markStaleRunsFailed('Interrupted');
		const all = service.runs.get();
		assert.deepStrictEqual(all.find(r => r.id === r1.id)?.status, 'failed');
		assert.deepStrictEqual(all.find(r => r.id === r2.id)?.status, 'failed');
		assert.strictEqual(all.find(r => r.id === r1.id)?.errorMessage, 'Interrupted');
	});

	test('runsFor filters to a single automation', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule() });
		const b = await service.createAutomation({ name: 'B', prompt: 'p', schedule: dailySchedule() });
		await service.recordRunStart(a.id, 'schedule', 1);
		await service.recordRunStart(b.id, 'schedule', 1);
		await service.recordRunStart(a.id, 'manual', 1);
		assert.strictEqual(service.runsFor(a.id).get().length, 2);
		assert.strictEqual(service.runsFor(b.id).get().length, 1);
	});

	test('persists across service restarts via shared storage', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const firstService = teardown.add(new AutomationService(sharedStorage, new NullLogService()));
		const a = await firstService.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule() });
		await firstService.recordRunStart(a.id, 'manual', 7);
		firstService.dispose();

		const secondService = teardown.add(new AutomationService(sharedStorage, new NullLogService()));
		assert.strictEqual(secondService.automations.get().length, 1);
		assert.strictEqual(secondService.automations.get()[0].id, a.id);
		assert.strictEqual(secondService.runs.get().length, 1);
	});

	test('two services on the same storage stay in sync via onDidChangeValue', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const windowA = teardown.add(new AutomationService(sharedStorage, new NullLogService()));
		const windowB = teardown.add(new AutomationService(sharedStorage, new NullLogService()));

		assert.deepStrictEqual(windowB.automations.get(), []);
		const created = await windowA.createAutomation({ name: 'X', prompt: 'p', schedule: dailySchedule() });

		// In-memory storage fires onDidChangeValue synchronously, so windowB
		// should already see the new automation.
		assert.strictEqual(windowB.automations.get().length, 1);
		assert.strictEqual(windowB.automations.get()[0].id, created.id);
	});

	test('reading a ledger with a future schema version leaves observables empty without throwing', () => {
		const storage = teardown.add(new InMemoryStorageService());
		// StorageScope.APPLICATION is -1
		storage.store('chat.automations.ledger', JSON.stringify({ schemaVersion: 999, automations: [], runs: [] }), -1, 1);
		const service = teardown.add(new AutomationService(storage, new NullLogService()));
		assert.deepStrictEqual(service.automations.get(), []);
		assert.deepStrictEqual(service.runs.get(), []);
	});

	test('reading a corrupt ledger leaves observables empty without throwing', () => {
		const storage = teardown.add(new InMemoryStorageService());
		storage.store('chat.automations.ledger', 'not json', -1, 1);
		const service = teardown.add(new AutomationService(storage, new NullLogService()));
		assert.deepStrictEqual(service.automations.get(), []);
	});

	test('round-trips a folderUri through persistence', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const firstService = teardown.add(new AutomationService(sharedStorage, new NullLogService()));
		const uri = URI.parse('file:///workspace/project');
		await firstService.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: uri });

		const secondService = teardown.add(new AutomationService(sharedStorage, new NullLogService()));
		const reloaded = secondService.automations.get()[0];
		assert.strictEqual(reloaded.folderUri?.toString(), uri.toString());
	});

	test('disposal does not interfere with later in-store reads', () => {
		// Just verifies the no-leaked-disposables invariant indirectly: create
		// a service and let teardown clean it up. Failure surfaces as a
		// leaked-disposable assertion at suite teardown.
		const store = new DisposableStore();
		const storage = store.add(new InMemoryStorageService());
		const service = store.add(new AutomationService(storage, new NullLogService()));
		assert.deepStrictEqual(service.automations.get(), []);
		store.dispose();
	});
});
