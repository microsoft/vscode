/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AutomationService } from '../../browser/automationService.js';
import { AutomationTarget, AutomationWorkspaceIsolation, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { createAutomationService } from './automationTestUtils.js';

const FOLDER = URI.parse('file:///workspace');

function workspaceTarget(folderUri = FOLDER, isolation: AutomationWorkspaceIsolation = { kind: 'default' }): AutomationTarget {
	return { kind: 'workspace', folderUri, isolation };
}

function dailySchedule(hour = 9, minute = 0): IAutomationSchedule {
	return { interval: 'daily', scheduleHour: hour, scheduleMinute: minute, scheduleDay: 0 };
}

suite('AutomationService', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(storage?: InMemoryStorageService): { service: AutomationService; storage: InMemoryStorageService } {
		const sharedStorage = teardown.add(storage ?? new InMemoryStorageService());
		const service = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
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
			target: workspaceTarget(),
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
			target: workspaceTarget(),
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
				target: { kind: 'workspace', folderUri: undefined, isolation: { kind: 'default' } } as unknown as AutomationTarget,
			}),
			/folderUri/,
		);
	});

	test('creates a workspace-less automation only with an explicit quick-chat target', async () => {
		const { service } = createService();
		await assert.rejects(
			() => service.createAutomation({
				name: 'Missing target',
				prompt: 'p',
				schedule: dailySchedule(),
				target: { kind: 'quickChat', providerId: undefined, sessionTypeId: undefined } as unknown as AutomationTarget,
			}),
			/providerId and sessionTypeId/,
		);

		const automation = await service.createAutomation({
			name: 'Workspace-less',
			prompt: 'p',
			schedule: dailySchedule(),
			target: {
				kind: 'quickChat',
				providerId: 'local-agent-host',
				sessionTypeId: 'copilotcli',
				folderUri: FOLDER,
				isolation: { kind: 'worktree', branch: 'stale' },
			} as unknown as AutomationTarget,
		});

		assert.deepStrictEqual(automation.target, {
			kind: 'quickChat',
			providerId: 'local-agent-host',
			sessionTypeId: 'copilotcli',
		});
	});

	test('rejects malformed worktree targets without a branch', async () => {
		const { service } = createService();
		await assert.rejects(
			() => service.createAutomation({
				name: 'Worktree',
				prompt: 'p',
				schedule: dailySchedule(),
				target: workspaceTarget(FOLDER, { kind: 'worktree', branch: '' }),
			}),
			/requires a branch/,
		);
	});

	test('updateAutomation recomputes nextRunAt when the schedule changes', async () => {
		const { service } = createService();
		const a = await service.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: dailySchedule(9, 0),
			target: workspaceTarget(),
		});
		const before = a.nextRunAt;
		const b = await service.updateAutomation(a.id, { schedule: dailySchedule(10, 30) });
		assert.notStrictEqual(b.nextRunAt, before);
	});

	test('updateAutomation keeps nextRunAt when only the name changes', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		const b = await service.updateAutomation(a.id, { name: 'B' });
		assert.strictEqual(b.nextRunAt, a.nextRunAt);
		assert.strictEqual(b.name, 'B');
	});

	test('updateAutomation can clear modelId/mode/permissionLevel by passing null but keeps folderUri', async () => {
		const { service } = createService();
		const a = await service.createAutomation({
			name: 'A', prompt: 'p', schedule: dailySchedule(),
			target: workspaceTarget(),
			modelId: 'gpt-4',
			mode: 'agent',
			permissionLevel: 'autopilot',
		});
		const b = await service.updateAutomation(a.id, { modelId: null, mode: null, permissionLevel: null });
		assert.strictEqual(b.modelId, undefined);
		assert.strictEqual(b.mode, undefined);
		assert.strictEqual(b.permissionLevel, undefined);
		assert.strictEqual(b.target.kind === 'workspace' ? b.target.folderUri.toString() : undefined, FOLDER.toString());
	});

	test('updateAutomation switches folder when a new folderUri is provided', async () => {
		const { service } = createService();
		const other = URI.parse('file:///other');
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		const b = await service.updateAutomation(a.id, { target: workspaceTarget(other) });
		assert.strictEqual(b.target.kind === 'workspace' ? b.target.folderUri.toString() : undefined, other.toString());
	});

	test('updateAutomation rejects incomplete workspace-less targets', async () => {
		const { service } = createService();
		const automation = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });

		await assert.rejects(
			() => service.updateAutomation(automation.id, {
				target: { kind: 'quickChat', providerId: undefined, sessionTypeId: undefined } as unknown as AutomationTarget,
			}),
			/providerId and sessionTypeId/,
		);
	});

	test('deleteAutomation removes the entry and orphan runs are dropped on reload', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const a = await firstService.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		await firstService.recordRunStart(a.id, 'manual', 1);
		assert.strictEqual(firstService.runs.get().length, 1);
		await firstService.deleteAutomation(a.id);
		// Deleting commits a new ledger, which triggers a reload that
		// drops the now-orphaned run so the ledger does not grow forever.
		assert.deepStrictEqual(firstService.automations.get(), []);
		assert.strictEqual(firstService.runs.get().length, 0);
		firstService.dispose();

		const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		assert.deepStrictEqual(secondService.automations.get(), []);
		assert.strictEqual(secondService.runs.get().length, 0);
	});

	test('recordRunStart inserts a pending run; updateRun applies a patch', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
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
			target: workspaceTarget(),
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
			target: workspaceTarget(),
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
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		assert.strictEqual(service.getActiveRunFor(a.id), undefined);
		const run = await service.recordRunStart(a.id, 'schedule', 1);
		assert.strictEqual(service.getActiveRunFor(a.id)?.id, run.id);
		await service.updateRun(run.id, { status: 'completed' });
		assert.strictEqual(service.getActiveRunFor(a.id), undefined);
	});

	test('markStaleRunsFailed moves pending and running rows to failed', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
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
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		const b = await service.createAutomation({ name: 'B', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		await service.recordRunStart(a.id, 'schedule', 1);
		await service.recordRunStart(b.id, 'schedule', 1);
		await service.recordRunStart(a.id, 'manual', 1);
		assert.strictEqual(service.runsFor(a.id).get().length, 2);
		assert.strictEqual(service.runsFor(b.id).get().length, 1);
	});

	test('recordRunStart caps retained runs per automation', async () => {
		const { service } = createService();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		const b = await service.createAutomation({ name: 'B', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
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
		const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const a = await firstService.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		await firstService.recordRunStart(a.id, 'manual', 7);
		firstService.dispose();

		const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		assert.strictEqual(secondService.automations.get().length, 1);
		assert.strictEqual(secondService.automations.get()[0].id, a.id);
		assert.strictEqual(secondService.runs.get().length, 1);
	});

	test('round-trips and clears Worktree branch configuration', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const created = await firstService.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: dailySchedule(),
			target: workspaceTarget(FOLDER, { kind: 'worktree', branch: 'feature/saved' }),
		});
		firstService.dispose();

		const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const restored = secondService.getAutomation(created.id);
		const updated = await secondService.updateAutomation(created.id, { target: workspaceTarget(FOLDER, { kind: 'folder' }) });

		assert.deepStrictEqual({
			restoredTarget: restored?.target,
			updatedTarget: updated.target,
		}, {
			restoredTarget: workspaceTarget(FOLDER, { kind: 'worktree', branch: 'feature/saved' }),
			updatedTarget: workspaceTarget(FOLDER, { kind: 'folder' }),
		});
	});

	test('round-trips target changes without carrying repository configuration into quick-chat mode', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const created = await firstService.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: dailySchedule(),
			target: workspaceTarget(FOLDER, { kind: 'worktree', branch: 'feature/saved' }),
		});
		const quickChat = await firstService.updateAutomation(created.id, {
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		});
		firstService.dispose();

		const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const restored = secondService.getAutomation(created.id);
		const workspace = await secondService.updateAutomation(created.id, {
			target: workspaceTarget(FOLDER, { kind: 'worktree', branch: 'main' }),
		});

		assert.deepStrictEqual({
			quickChat: quickChat.target,
			restored: restored?.target,
			workspace: workspace.target,
		}, {
			quickChat: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			restored: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			workspace: workspaceTarget(FOLDER, { kind: 'worktree', branch: 'main' }),
		});
	});

	test('two services on the same storage stay in sync via onDidChangeValue', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));

		assert.deepStrictEqual(windowB.automations.get(), []);
		const created = await windowA.createAutomation({ name: 'X', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });

		// In-memory storage fires onDidChangeValue synchronously, so windowB
		// should already see the new automation.
		assert.strictEqual(windowB.automations.get().length, 1);
		assert.strictEqual(windowB.automations.get()[0].id, created.id);
	});

	test('mutations preserve unrelated application storage values', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		storage.store('unrelated', 'sentinel', StorageScope.APPLICATION, StorageTarget.MACHINE);
		const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));

		const automation = await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		await service.updateAutomation(automation.id, { name: 'Updated' });
		await service.recordRunStart(automation.id, 'manual', 1);
		await service.deleteAutomation(automation.id);

		assert.strictEqual(storage.get('unrelated', StorageScope.APPLICATION), 'sentinel');
	});

	test('guarded update rejects a concurrent editable change', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const reviewed = await windowA.createAutomation({ name: 'Original', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });

		await windowB.updateAutomation(reviewed.id, { prompt: 'concurrent edit' });
		const result = await windowA.updateAutomationIfUnchanged(reviewed.id, { name: 'Reviewed edit' }, reviewed);

		assert.deepStrictEqual(result.kind === 'conflict' ? {
			kind: result.kind,
			currentName: result.current?.name,
			currentPrompt: result.current?.prompt,
		} : result, {
			kind: 'conflict',
			currentName: 'Original',
			currentPrompt: 'concurrent edit',
		});
	});

	test('guarded update tolerates concurrent runtime metadata changes', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		windowA.setClockForTesting(() => new Date('2025-06-01T00:00:00Z'));
		const reviewed = await windowA.createAutomation({ name: 'Original', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });

		windowB.setClockForTesting(() => new Date('2025-06-01T10:00:00Z'));
		const run = await windowB.recordRunStart(reviewed.id, 'schedule', 2);
		const runtimeState = windowB.getAutomation(reviewed.id);
		const result = await windowA.updateAutomationIfUnchanged(reviewed.id, { name: 'Reviewed edit' }, reviewed);

		assert.deepStrictEqual(result.kind === 'updated' ? {
			kind: result.kind,
			name: result.automation.name,
			lastRunAt: result.automation.lastRunAt,
			nextRunAt: result.automation.nextRunAt,
			runIds: windowA.runs.get().map(candidate => candidate.id),
		} : result, {
			kind: 'updated',
			name: 'Reviewed edit',
			lastRunAt: runtimeState?.lastRunAt,
			nextRunAt: runtimeState?.nextRunAt,
			runIds: [run.id],
		});
	});

	test('concurrent create, edit, run, and delete mutations converge without lost updates', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const edited = await windowA.createAutomation({ name: 'Edit me', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		const deleted = await windowA.createAutomation({ name: 'Delete me', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });

		const [, run, , created] = await Promise.all([
			windowA.updateAutomation(edited.id, { name: 'Edited' }),
			windowB.recordRunStart(edited.id, 'schedule', 2),
			windowA.deleteAutomation(deleted.id),
			windowB.createAutomation({ name: 'Created', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() }),
		]);

		assert.deepStrictEqual({
			automations: windowA.automations.get()
				.map(automation => ({ id: automation.id, name: automation.name }))
				.sort((a, b) => a.name.localeCompare(b.name)),
			runs: windowA.runs.get().map(candidate => ({ id: candidate.id, automationId: candidate.automationId })),
		}, {
			automations: [
				{ id: created.id, name: 'Created' },
				{ id: edited.id, name: 'Edited' },
			],
			runs: [{ id: run.id, automationId: edited.id }],
		});
	});

	test('reading a ledger with a future schema version freezes observables and refuses to write', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const futureLedger = JSON.stringify({ schemaVersion: 999, revision: 7, automations: [], runs: [] });
		// StorageScope.APPLICATION is -1
		storage.store('chat.automations.ledger', futureLedger, -1, 1);
		const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));

		// Observables remain empty (no prior in-memory state to preserve)
		// but the service is now in read-only mode.
		assert.deepStrictEqual(service.automations.get(), []);
		assert.deepStrictEqual(service.runs.get(), []);

		// A subsequent mutation must be rejected (read-only mode) and must not
		// destroy the on-disk newer ledger.
		await assert.rejects(
			() => service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() }),
			/newer version/,
		);

		// In-memory state is also unchanged because the mutation was rejected
		// before any commit.
		assert.deepStrictEqual(service.automations.get(), []);

		assert.strictEqual(storage.get('chat.automations.ledger', -1), futureLedger);
	});

	test('refreshFromStorage preserves in-memory state when storage flips to an unsupported schema', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
		await service.createAutomation({ name: 'Local', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		assert.strictEqual(service.automations.get().length, 1);

		storage.store('chat.automations.ledger', JSON.stringify({ schemaVersion: 999, revision: 99, automations: [], runs: [] }), -1, 1);

		// The onDidChangeValue refresh must NOT clear our observables to
		// empty. We keep displaying what we last knew about.
		assert.strictEqual(service.automations.get().length, 1);
	});

	test('persist bumps the revision counter on every write', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		const rev1 = JSON.parse(storage.get('chat.automations.ledger', -1)!).revision;
		await service.createAutomation({ name: 'B', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		const rev2 = JSON.parse(storage.get('chat.automations.ledger', -1)!).revision;
		assert.strictEqual(typeof rev1, 'number');
		assert.ok(rev2 > rev1, `expected ${rev2} > ${rev1}`);
	});

	test('persist absorbs a higher on-disk revision (concurrent-write detection)', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		const baseline = JSON.parse(storage.get('chat.automations.ledger', -1)!);
		// Simulate another window having advanced the revision behind our
		// back. The service must not write a stale-or-equal revision.
		storage.store('chat.automations.ledger', JSON.stringify({ ...baseline, revision: 5000 }), -1, 1);
		await service.createAutomation({ name: 'B', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget() });
		const after = JSON.parse(storage.get('chat.automations.ledger', -1)!);
		assert.ok(after.revision > 5000, `expected revision > 5000, got ${after.revision}`);
	});

	test('reading a corrupt ledger leaves observables empty without throwing', () => {
		const storage = teardown.add(new InMemoryStorageService());
		storage.store('chat.automations.ledger', 'not json', -1, 1);
		const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
		assert.deepStrictEqual(service.automations.get(), []);
	});

	test('drops a malformed schema v3 row without discarding valid rows', () => {
		const storage = teardown.add(new InMemoryStorageService());
		storage.store('chat.automations.ledger', JSON.stringify({
			schemaVersion: 3,
			automations: [
				{
					id: 'keep',
					name: 'Valid',
					prompt: 'p',
					schedule: dailySchedule(),
					target: { kind: 'workspace', folderUri: FOLDER.toJSON(), isolation: { kind: 'default' } },
					enabled: true,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				},
				null,
			],
			runs: [
				{ id: 'r-keep', automationId: 'keep', status: 'completed', trigger: 'manual', startedAt: '2024-01-01T00:00:00Z', leaderWindowId: 1 },
			],
		}), -1, 1);

		const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
		assert.deepStrictEqual({
			automationIds: service.automations.get().map(automation => automation.id),
			runIds: service.runs.get().map(run => run.id),
		}, {
			automationIds: ['keep'],
			runIds: ['r-keep'],
		});
	});

	test('migrates valid schema v1 records to v3 while dropping malformed targets', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const ledger = {
			schemaVersion: 1,
			automations: [
				{ id: 'orphan', name: 'Old', prompt: 'p', schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, enabled: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
				{ id: 'orphan-quick', name: 'Old Quick', prompt: 'p', schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, isQuickChat: true, enabled: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
				{ id: 'keep', name: 'Valid', prompt: 'p', schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, folderUri: FOLDER.toJSON(), enabled: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
				{ id: 'quick', name: 'Quick', prompt: 'p', schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, isQuickChat: true, providerId: 'local-agent-host', sessionTypeId: 'copilotcli', enabled: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
			],
			runs: [
				{ id: 'r-orphan', automationId: 'orphan', status: 'completed', trigger: 'manual', startedAt: '2024-01-01T00:00:00Z', leaderWindowId: 1 },
				{ id: 'r-orphan-quick', automationId: 'orphan-quick', status: 'completed', trigger: 'manual', startedAt: '2024-01-01T00:00:00Z', leaderWindowId: 1 },
				{ id: 'r-keep', automationId: 'keep', status: 'completed', trigger: 'manual', startedAt: '2024-01-01T00:00:00Z', leaderWindowId: 1 },
				{ id: 'r-quick', automationId: 'quick', status: 'completed', trigger: 'manual', startedAt: '2024-01-01T00:00:00Z', leaderWindowId: 1 },
			],
		};
		storage.store('chat.automations.ledger', JSON.stringify(ledger), -1, 1);
		const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
		assert.deepStrictEqual({
			automations: service.automations.get().map(automation => ({ id: automation.id, targetKind: automation.target.kind })),
			runs: service.runs.get().map(run => run.id),
		}, {
			automations: [
				{ id: 'keep', targetKind: 'workspace' },
				{ id: 'quick', targetKind: 'quickChat' },
			],
			runs: ['r-keep', 'r-quick'],
		});

		await service.updateAutomation('keep', { name: 'Updated' });
		const migrated = JSON.parse(storage.get('chat.automations.ledger', -1)!);
		assert.deepStrictEqual({
			schemaVersion: migrated.schemaVersion,
			automationIds: migrated.automations.map((automation: { id: string }) => automation.id),
			runIds: migrated.runs.map((run: { id: string }) => run.id),
		}, {
			schemaVersion: 3,
			automationIds: ['keep', 'quick'],
			runIds: ['r-keep', 'r-quick'],
		});
	});

	test('migrates schema v2 flat targets to schema v3 target unions', async () => {
		const storage = teardown.add(new InMemoryStorageService());
		const common = {
			prompt: 'p',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 },
			enabled: true,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		};
		storage.store('chat.automations.ledger', JSON.stringify({
			schemaVersion: 2,
			automations: [
				{ ...common, id: 'workspace', name: 'Workspace', folderUri: FOLDER.toJSON(), isolationMode: 'worktree', branch: 'feature/saved' },
				{ ...common, id: 'legacy-worktree', name: 'Legacy Worktree', folderUri: FOLDER.toJSON(), isolationMode: 'worktree' },
				{ ...common, id: 'quick', name: 'Quick', isQuickChat: true, providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			],
			runs: [],
		}), -1, 1);

		const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
		assert.deepStrictEqual(service.automations.get().map(automation => automation.target), [
			workspaceTarget(FOLDER, { kind: 'worktree', branch: 'feature/saved' }),
			workspaceTarget(FOLDER, { kind: 'default' }),
			{ kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		]);

		await service.updateAutomation('workspace', { name: 'Updated' });
		const migrated = JSON.parse(storage.get('chat.automations.ledger', -1)!);
		assert.strictEqual(migrated.schemaVersion, 3);
	});

	test('round-trips a folderUri through persistence', async () => {
		const sharedStorage = teardown.add(new InMemoryStorageService());
		const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const uri = URI.parse('file:///workspace/project');
		await firstService.createAutomation({ name: 'A', prompt: 'p', schedule: dailySchedule(), target: workspaceTarget(uri) });

		const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
		const reloaded = secondService.automations.get()[0];
		assert.deepStrictEqual(reloaded.target, workspaceTarget(uri));
	});

	test('disposal does not interfere with later in-store reads', () => {
		// Just verifies the no-leaked-disposables invariant indirectly: create
		// a service and let teardown clean it up. Failure surfaces as a
		// leaked-disposable assertion at suite teardown.
		const store = new DisposableStore();
		const storage = store.add(new InMemoryStorageService());
		const service = store.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
		assert.deepStrictEqual(service.automations.get(), []);
		store.dispose();
	});
});
