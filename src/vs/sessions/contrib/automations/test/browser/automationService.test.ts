/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AutomationService } from '../../browser/automationService.js';
import { IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';

const FOLDER = URI.parse('file:///workspace');

function dailySchedule(hour = 9, minute = 0): IAutomationSchedule {
	return { interval: 'daily', scheduleHour: hour, scheduleMinute: minute, scheduleDay: 0 };
}

suite('AutomationService', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(storage?: InMemoryStorageService): { service: AutomationService; storage: InMemoryStorageService } {
		const sharedStorage = teardown.add(storage ?? new InMemoryStorageService());
		const service = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
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
			folderUri: FOLDER,
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
			folderUri: FOLDER,
		});
		assert.strictEqual(a.nextRunAt, undefined);
	});

	test('createAutomation throws when folderUri is missing', async () => {
		const { service } = createService();
		await assert.rejects(
			() => service.createAutomation({
				name: 'X',
				prompt: 'p',
				schedule: dailySchedule(),
				// Cast to bypass type check. Simulates a runtime caller
				// forgetting the required field.
				folderUri: undefined as unknown as URI,
			}),
			/folderUri/,
		);
	});

	test('updateAutomation recomputes nextRunAt when the schedule changes', async () => {
		const { service } = createService();
		const a = await service.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: dailySchedule(9, 0),
			folderUri: FOLDER,
		});
		const before = a.nextRunAt;
		const b = await service.updateAutomation(a.id, { schedule: dailySchedule(10, 30) });
		assert.notStrictEqual(b.nextRunAt, before);
	});

	test('updateAutomation keeps nextRunAt when only the name changes', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		const b = await service.updateAutomation(a.id, { name: 'B' });
		assert.strictEqual(b.nextRunAt, a.nextRunAt);
		assert.strictEqual(b.name, 'B');
	});

	test('updateAutomation can clear modelId/mode/permissionLevel by passing null but keeps folderUri', async () => {
		const { service } = createService();
		const a = await service.createAutomation({
			name: 'A', prompt: 'p', schedule: dailySchedule(),
			folderUri: FOLDER,
			modelId: 'gpt-4',
			mode: 'agent',
			permissionLevel: 'autopilot',
		});
		const b = await service.updateAutomation(a.id, { modelId: null, mode: null, permissionLevel: null });
		assert.strictEqual(b.modelId, undefined);
		assert.strictEqual(b.mode, undefined);
		assert.strictEqual(b.permissionLevel, undefined);
		assert.strictEqual(b.folderUri.toString(), FOLDER.toString());
	});

	test('updateAutomation switches folder when a new folderUri is provided', async () => {
		const { service } = createService();
		const other = URI.parse('file:///other');
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		const b = await service.updateAutomation(a.id, { folderUri: other });
		assert.strictEqual(b.folderUri.toString(), other.toString());
	});

	test('deleteAutomation removes the entry and orphan runs are dropped on reload', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const firstService = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const a = await firstService.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		await firstService.recordRunStart(a.id, 'manual', 1);
		assert.strictEqual(firstService.runs.get().length, 1);
		await firstService.deleteAutomation(a.id);
		// Deleting commits a new ledger, which triggers a reload that
		// drops the now-orphaned run so the ledger does not grow forever.
		assert.deepStrictEqual(firstService.automations.get(), []);
		assert.strictEqual(firstService.runs.get().length, 0);
		firstService.dispose();

		const secondService = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		assert.deepStrictEqual(secondService.automations.get(), []);
		assert.strictEqual(secondService.runs.get().length, 0);
	});

	test('recordRunStart inserts a pending run; updateRun applies a patch', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		const run = await service.recordRunStart(a.id, 'schedule', 42);
		assert.strictEqual(run.status, 'pending');
		assert.strictEqual(run.leaderWindowId, 42);
		const updated = await service.updateRun(run.id, { status: 'completed', sessionResource: 'vscode-chat-session://copilot/sess-1', completedAt: new Date().toISOString() });
		assert.strictEqual(updated?.status, 'completed');
		assert.strictEqual(updated?.sessionResource, 'vscode-chat-session://copilot/sess-1');
	});

	test('recordRunStart updates lastRunAt and advances the next scheduled run', async () => {
		const { service } = createService();
		service.setClockForTesting(() => new Date('2025-06-01T00:00:00Z'));
		const automation = await service.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			folderUri: FOLDER,
		});

		service.setClockForTesting(() => new Date('2025-06-01T10:00:00Z'));
		const run = await service.recordRunStart(automation.id, 'catch_up', 1);

		assert.deepStrictEqual({
			startedAt: run.startedAt,
			lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
			nextRunAt: service.getAutomation(automation.id)?.nextRunAt,
		}, {
			startedAt: '2025-06-01T10:00:00.000Z',
			lastRunAt: '2025-06-01T10:00:00.000Z',
			nextRunAt: '2025-06-01T11:00:00.000Z',
		});
	});

	test('recordRunStart leaves schedule timestamps unchanged for a manual run', async () => {
		const { service } = createService();
		service.setClockForTesting(() => new Date('2025-06-01T00:00:00Z'));
		const automation = await service.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			folderUri: FOLDER,
		});

		service.setClockForTesting(() => new Date('2025-06-01T00:30:00Z'));
		const run = await service.recordRunStart(automation.id, 'manual', 1);

		assert.deepStrictEqual({
			startedAt: run.startedAt,
			lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
			nextRunAt: service.getAutomation(automation.id)?.nextRunAt,
		}, {
			startedAt: '2025-06-01T00:30:00.000Z',
			lastRunAt: undefined,
			nextRunAt: automation.nextRunAt,
		});
	});

	test('getActiveRunFor returns the first pending or running run for an automation', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		assert.strictEqual(service.getActiveRunFor(a.id), undefined);
		const run = await service.recordRunStart(a.id, 'schedule', 1);
		assert.strictEqual(service.getActiveRunFor(a.id)?.id, run.id);
		await service.updateRun(run.id, { status: 'completed' });
		assert.strictEqual(service.getActiveRunFor(a.id), undefined);
	});

	test('markStaleRunsFailed moves pending and running rows to failed', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
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
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		const b = await service.createAutomation({ name: 'B', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		await service.recordRunStart(a.id, 'schedule', 1);
		await service.recordRunStart(b.id, 'schedule', 1);
		await service.recordRunStart(a.id, 'manual', 1);
		assert.strictEqual(service.runsFor(a.id).get().length, 2);
		assert.strictEqual(service.runsFor(b.id).get().length, 1);
	});

	test('recordRunStart caps retained runs per automation', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		const b = await service.createAutomation({ name: 'B', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		// Push 60 runs for a (cap is 50) and 5 for b. Each automation's
		// history should be bounded independently.
		for (let i = 0; i < 60; i++) {
			await service.recordRunStart(a.id, 'manual', 1);
		}
		for (let i = 0; i < 5; i++) {
			await service.recordRunStart(b.id, 'manual', 1);
		}
		assert.strictEqual(service.runsFor(a.id).get().length, 50);
		assert.strictEqual(service.runsFor(b.id).get().length, 5);
	});

	test('persists across service restarts via shared storage', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const firstService = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const a = await firstService.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		await firstService.recordRunStart(a.id, 'manual', 7);
		firstService.dispose();

		const secondService = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		assert.strictEqual(secondService.automations.get().length, 1);
		assert.strictEqual(secondService.automations.get()[0].id, a.id);
		assert.strictEqual(secondService.runs.get().length, 1);
	});

	test('round-trips and clears Worktree branch configuration', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const firstService = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const created = await firstService.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: dailySchedule(),
			folderUri: FOLDER,
			isolationMode: 'worktree',
			branch: 'feature/saved',
		});
		firstService.dispose();

		const secondService = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const restored = secondService.getAutomation(created.id);
		const updated = await secondService.updateAutomation(created.id, { isolationMode: 'workspace', branch: null });

		assert.deepStrictEqual({
			restoredIsolationMode: restored?.isolationMode,
			restoredBranch: restored?.branch,
			updatedIsolationMode: updated.isolationMode,
			updatedBranch: updated.branch,
		}, {
			restoredIsolationMode: 'worktree',
			restoredBranch: 'feature/saved',
			updatedIsolationMode: 'workspace',
			updatedBranch: undefined,
		});
	});

	test('two services on the same storage stay in sync via onDidChangeValue', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const windowA = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const windowB = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));

		assert.deepStrictEqual(windowB.automations.get(), []);
		const created = await windowA.createAutomation({ name: 'X', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });

		// In-memory storage fires onDidChangeValue synchronously, so windowB
		// should already see the new automation.
		assert.strictEqual(windowB.automations.get().length, 1);
		assert.strictEqual(windowB.automations.get()[0].id, created.id);
	});

	test('reading a ledger with a future schema version freezes observables and refuses to write', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const futureLedger = JSON.stringify({ schemaVersion: 999, revision: 7, automations: [], runs: [] });
		// StorageScope.APPLICATION is -1
		storage.store('chat.automations.ledger', futureLedger, -1, 1);
		const service = teardown.add(new AutomationService(storage, new NullLogService(), NullTelemetryService));

		// Observables remain empty (no prior in-memory state to preserve)
		// but the service is now in read-only mode.
		assert.deepStrictEqual(service.automations.get(), []);
		assert.deepStrictEqual(service.runs.get(), []);

		// A subsequent mutation must be rejected (read-only mode) and must not
		// destroy the on-disk newer ledger.
		await assert.rejects(
			() => service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER }),
			/newer version/,
		);

		// In-memory state is also unchanged because the mutation was rejected
		// before any commit.
		assert.deepStrictEqual(service.automations.get(), []);

		assert.strictEqual(storage.get('chat.automations.ledger', -1), futureLedger);
	});

	test('refreshFromStorage preserves in-memory state when storage flips to an unsupported schema', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const service = teardown.add(new AutomationService(storage, new NullLogService(), NullTelemetryService));
		await service.createAutomation({ name: 'Local', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		assert.strictEqual(service.automations.get().length, 1);

		storage.store('chat.automations.ledger', JSON.stringify({ schemaVersion: 999, revision: 99, automations: [], runs: [] }), -1, 1);

		// The onDidChangeValue refresh must NOT clear our observables to
		// empty. We keep displaying what we last knew about.
		assert.strictEqual(service.automations.get().length, 1);
	});

	test('persist bumps the revision counter on every write', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const service = teardown.add(new AutomationService(storage, new NullLogService(), NullTelemetryService));
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		const rev1 = JSON.parse(storage.get('chat.automations.ledger', -1)!).revision;
		await service.createAutomation({ name: 'B', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		const rev2 = JSON.parse(storage.get('chat.automations.ledger', -1)!).revision;
		assert.strictEqual(typeof rev1, 'number');
		assert.ok(rev2 > rev1, `expected ${rev2} > ${rev1}`);
	});

	test('persist absorbs a higher on-disk revision (concurrent-write detection)', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const service = teardown.add(new AutomationService(storage, new NullLogService(), NullTelemetryService));
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		const baseline = JSON.parse(storage.get('chat.automations.ledger', -1)!);
		// Simulate another window having advanced the revision behind our
		// back. The service must not write a stale-or-equal revision.
		storage.store('chat.automations.ledger', JSON.stringify({ ...baseline, revision: 5000 }), -1, 1);
		await service.createAutomation({ name: 'B', prompt: 'p', schedule: dailySchedule(), folderUri: FOLDER });
		const after = JSON.parse(storage.get('chat.automations.ledger', -1)!);
		assert.ok(after.revision > 5000, `expected revision > 5000, got ${after.revision}`);
	});

	test('reading a corrupt ledger leaves observables empty without throwing', () => {
		const storage = teardown.add(new InMemoryStorageService());
		storage.store('chat.automations.ledger', 'not json', -1, 1);
		const service = teardown.add(new AutomationService(storage, new NullLogService(), NullTelemetryService));
		assert.deepStrictEqual(service.automations.get(), []);
	});

	test('persisted automations without folderUri are dropped on load', () => {
		const storage = teardown.add(new InMemoryStorageService());
		const ledger = {
			schemaVersion: 1,
			automations: [
				{ id: 'orphan', name: 'Old', prompt: 'p', schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, enabled: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
				{ id: 'keep', name: 'Valid', prompt: 'p', schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, folderUri: FOLDER.toJSON(), enabled: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
			],
			runs: [
				{ id: 'r-orphan', automationId: 'orphan', status: 'completed', trigger: 'manual', startedAt: '2024-01-01T00:00:00Z', leaderWindowId: 1 },
				{ id: 'r-keep', automationId: 'keep', status: 'completed', trigger: 'manual', startedAt: '2024-01-01T00:00:00Z', leaderWindowId: 1 },
			],
		};
		storage.store('chat.automations.ledger', JSON.stringify(ledger), -1, 1);
		const service = teardown.add(new AutomationService(storage, new NullLogService(), NullTelemetryService));
		assert.strictEqual(service.automations.get().length, 1);
		assert.strictEqual(service.automations.get()[0].id, 'keep');
		assert.strictEqual(service.runs.get().length, 1);
		assert.strictEqual(service.runs.get()[0].id, 'r-keep');
	});

	test('round-trips a folderUri through persistence', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const firstService = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const uri = URI.parse('file:///workspace/project');
		await firstService.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), folderUri: uri });

		const secondService = teardown.add(new AutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const reloaded = secondService.automations.get()[0];
		assert.strictEqual(reloaded.folderUri.toString(), uri.toString());
	});

	test('disposal does not interfere with later in-store reads', () => {
		// Just verifies the no-leaked-disposables invariant indirectly: create
		// a service and let teardown clean it up. Failure surfaces as a
		// leaked-disposable assertion at suite teardown.
		const store = new DisposableStore();
		const storage = store.add(new InMemoryStorageService());
		const service = store.add(new AutomationService(storage, new NullLogService(), NullTelemetryService));
		assert.deepStrictEqual(service.automations.get(), []);
		store.dispose();
	});
});
