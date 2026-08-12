/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { AutomationDefinition, AutomationExecutionLifetime, AutomationOperation, AutomationRunCauseKind, AutomationRunLifecycle, AutomationRunOperation, AutomationRunState, AutomationRunStatus, AutomationRunSummary, AutomationState, AutomationSummary, MessageKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { CreateAutomationParams, ListAutomationsResult, RunAutomationParams, RunAutomationResult, UpdateAutomationParams } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { InitializeResult } from '../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { AhpErrorCodes } from '../../../../../platform/agentHost/common/state/protocol/common/errors.js';
import { INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ComponentToState, RootState, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ProtocolError } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { AutomationService } from '../../browser/automationService.js';
import { LegacyAutomationMigration } from '../../browser/legacyAutomationMigration.js';
import { AUTOMATION_STORAGE_KEY, ILegacyAutomationMigrationCompareAndSwapResult, ILegacyAutomationMigrationStorageService, LEGACY_AUTOMATION_STORAGE_KEYS, LOCAL_AGENT_HOST_AUTOMATION_STORAGE_KEY } from '../../common/legacyAutomationMigrationStorage.js';

suite('AutomationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const languageModelsService = testLanguageModelsService();

	test('keeps an unsupported legacy target read-only until its agent is advertised', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('cloud', 'copilot-cloud-agent')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const migrationStorage = new RecordingMigrationStorage(storage);
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			migrationStorage,
			new TestConnectionsService(connection),
			languageModelsService,
		));
		await Event.toPromise(connection.onDidListAutomations);

		assert.deepStrictEqual({
			automations: service.automations.get().map(automation => ({
				name: automation.name,
				providerId: automation.target.providerId,
				sessionTypeId: automation.target.sessionTypeId,
				migrationPending: automation.host?.migrationPending,
			})),
			hostCreates: connection.operations,
			ledger: migrationStorage.value,
		}, {
			automations: [{
				name: 'cloud',
				providerId: 'default-copilot',
				sessionTypeId: 'copilot-cloud-agent',
				migrationPending: true,
			}],
			hostCreates: [],
			ledger: raw,
		});

		test('reads schema-v1 and schema-v2 rows for one-time migration', () => {
			const storage = disposables.add(new InMemoryStorageService());
			const migrationStorage = new RecordingMigrationStorage(storage);
			const migration = new LegacyAutomationMigration(migrationStorage, new NullLogService());
			const schema1 = migration.readCached(JSON.stringify({
				schemaVersion: 1,
				automations: [{
					...serializedAutomation('quick', 'copilotcli'),
					target: undefined,
					isQuickChat: true,
					providerId: 'default-copilot',
					sessionTypeId: 'copilotcli',
				}],
				runs: [],
			}));
			const schema2 = migration.readCached(JSON.stringify({
				schemaVersion: 2,
				automations: [{
					...serializedAutomation('workspace', 'copilotcli'),
					target: undefined,
					isQuickChat: false,
					folderUri: URI.file('/workspace').toJSON(),
					providerId: 'default-copilot',
					sessionTypeId: 'copilotcli',
					isolationMode: 'worktree',
					branch: 'main',
				}],
				runs: [],
			}));

			assert.deepStrictEqual({
				quick: schema1.automations[0].target,
				workspace: schema2.automations[0].target,
			}, {
				quick: { kind: 'quickChat', providerId: 'default-copilot', sessionTypeId: 'copilotcli' },
				workspace: {
					kind: 'workspace',
					folderUri: URI.file('/workspace'),
					providerId: 'default-copilot',
					sessionTypeId: 'copilotcli',
					isolation: { kind: 'worktree', branch: 'main' },
				},
			});
		});
	});

	test('migrates a local row without enabling both authorities', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('tests', 'copilotcli', 'agent-host-copilotcliauto')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const operations: string[] = [];
		const migrationStorage = new RecordingMigrationStorage(storage, operations);
		const connection = new TestConnection(['copilotcli'], operations);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			migrationStorage,
			new TestConnectionsService(connection),
			testLanguageModelsService(new Map([['agent-host-copilotcliauto', 'auto']])),
		));
		await waitForState(service.automations, items => items.length === 1 && items[0].host?.migrationPending !== true && items[0].enabled === true);

		assert.deepStrictEqual({
			operations,
			automation: service.automations.get().map(automation => ({
				name: automation.name,
				enabled: automation.enabled,
				providerId: automation.target.providerId,
				sessionTypeId: automation.target.sessionTypeId,
				modelId: automation.modelId,
				migrationPending: automation.host?.migrationPending,
			})),
			legacyAutomations: JSON.parse(migrationStorage.value!).automations,
		}, {
			operations: ['host:create-disabled', 'legacy:disable', 'legacy:remove', 'host:enable'],
			automation: [{
				name: 'tests',
				enabled: true,
				providerId: 'local-agent-host',
				sessionTypeId: 'copilotcli',
				modelId: 'auto',
				migrationPending: undefined,
			}],
			legacyAutomations: [],
		});
	});

	test('migrates definitions already moved to the local provider ledger', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('provider', 'copilotcli')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(LOCAL_AGENT_HOST_AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const operations: string[] = [];
		const connection = new TestConnection(['copilotcli'], operations);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage, operations),
			new TestConnectionsService(connection),
			languageModelsService,
		));

		const automations = await waitForState(service.automations, items => items.length === 1 && items[0].host?.migrationPending !== true);

		assert.deepStrictEqual({
			operations,
			automations: automations.map(automation => ({
				name: automation.name,
				resource: automation.host?.resource,
			})),
			providerLedger: JSON.parse(storage.get(LOCAL_AGENT_HOST_AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).automations,
		}, {
			operations: ['host:create-disabled', 'legacy:disable', 'legacy:remove', 'host:enable'],
			automations: [{
				name: 'provider',
				resource: 'ahp-automation:/vscode-local-agent-host-provider',
			}],
			providerLedger: [],
		});
	});

	test('keeps same-ID definitions from different legacy ledgers distinct', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, serializeLegacyLedger([serializedAutomation('same', 'copilotcli')]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store(LOCAL_AGENT_HOST_AUTOMATION_STORAGE_KEY, serializeLegacyLedger([{
			...serializedAutomation('same', 'copilotcli'),
			prompt: 'Provider-owned prompt',
		}]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			languageModelsService,
		));

		const automations = await waitForState(service.automations, items => items.length === 2 && items.every(automation => automation.host?.migrationPending !== true));

		assert.deepStrictEqual(automations
			.map(automation => ({ prompt: automation.prompt, resource: automation.host?.resource }))
			.sort((a, b) => a.prompt.localeCompare(b.prompt)), [{
				prompt: 'Provider-owned prompt',
				resource: 'ahp-automation:/vscode-local-agent-host-same',
			}, {
				prompt: 'Run tests',
				resource: 'ahp-automation:/vscode-same',
			}]);
	});

	test('does not disable a legacy definition changed after preview', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const migrationStorage = new RecordingMigrationStorage(storage);
		const migration = new LegacyAutomationMigration(migrationStorage, new NullLogService());
		const originalRaw = serializeLegacyLedger([serializedAutomation('changed', 'copilotcli')]);
		storage.store(AUTOMATION_STORAGE_KEY, originalRaw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const expected = (await migration.read()).automations[0];
		const changedRaw = serializeLegacyLedger([{
			...serializedAutomation('changed', 'copilotcli'),
			prompt: 'Changed concurrently',
		}]);
		storage.store(AUTOMATION_STORAGE_KEY, changedRaw, StorageScope.APPLICATION, StorageTarget.MACHINE);

		await assert.rejects(() => migration.disable(expected), /changed while it was being migrated/);

		assert.strictEqual(migrationStorage.value, changedRaw);
	});

	test('does not mistake a concurrent user disable for its own migration write', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const migrationStorage = new RecordingMigrationStorage(storage);
		const migration = new LegacyAutomationMigration(migrationStorage, new NullLogService());
		storage.store(AUTOMATION_STORAGE_KEY, serializeLegacyLedger([serializedAutomation('disabled', 'copilotcli')]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		const expected = (await migration.read()).automations[0];
		const changedRaw = serializeLegacyLedger([{
			...serializedAutomation('disabled', 'copilotcli'),
			enabled: false,
			updatedAt: '2026-01-02T00:00:00.000Z',
		}]);
		storage.store(AUTOMATION_STORAGE_KEY, changedRaw, StorageScope.APPLICATION, StorageTarget.MACHINE);

		await assert.rejects(() => migration.disable(expected), /changed while it was being migrated/);

		assert.strictEqual(migrationStorage.value, changedRaw);
	});

	test('does not enable an imported definition when the source is concurrently deleted', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, serializeLegacyLedger([serializedAutomation('deleted', 'copilotcli')]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		const operations: string[] = [];
		const connection = new TestConnection(['copilotcli'], operations);
		connection.afterCreateAutomation = () => {
			storage.store(AUTOMATION_STORAGE_KEY, serializeLegacyLedger([]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		};
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage, operations),
			new TestConnectionsService(connection),
			languageModelsService,
		));

		const automations = await waitForState(service.automations, items =>
			items.length === 1
			&& items[0].name === 'deleted'
			&& items[0].host?.migrationPending !== true
		);
		const journal = JSON.parse(storage.get('chat.automations.ahpMigration.v1', StorageScope.APPLICATION)!) as { items: { phase: string }[] };
		assert.deepStrictEqual({
			automations: automations.map(automation => ({
				name: automation.name,
				enabled: automation.enabled,
				migrationPending: automation.host?.migrationPending,
			})),
			operations,
			journalPhase: journal.items[0].phase,
		}, {
			automations: [{ name: 'deleted', enabled: false, migrationPending: undefined }],
			operations: ['host:create-disabled'],
			journalPhase: 'aborted',
		});
	});

	test('does not remove the source when the imported host definition is replaced', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('replaced', 'copilotcli')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const operations: string[] = [];
		const connection = new TestConnection(['copilotcli'], operations);
		const migrationStorage = new RecordingMigrationStorage(storage, operations);
		migrationStorage.beforeLegacyCompareAndSwap = () => {
			connection.setAutomationDefinition('ahp-automation:/vscode-replaced', {
				...connection.lastCreateDefinition!,
				title: 'Replaced on host',
			});
		};
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			migrationStorage,
			new TestConnectionsService(connection),
			languageModelsService,
		));

		const automations = await waitForState(service.automations, items => items.some(automation => automation.host?.migrationConflict === true));
		const ledger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!) as { automations: { name: string; enabled: boolean }[] };
		const journal = JSON.parse(storage.get('chat.automations.ahpMigration.v1', StorageScope.APPLICATION)!) as { items: { phase: string }[] };
		assert.deepStrictEqual({
			names: automations.map(automation => automation.name).sort(),
			legacyAutomations: ledger.automations.map(automation => ({ name: automation.name, enabled: automation.enabled })),
			journalPhase: journal.items[0].phase,
			operations,
		}, {
			names: ['Replaced on host', 'replaced'],
			legacyAutomations: [{ name: 'replaced', enabled: false }],
			journalPhase: 'imported',
			operations: ['host:create-disabled', 'legacy:disable'],
		});
	});

	test('captures concurrent run updates before removing the legacy source', async () => {
		const initialRun: IAutomationRun = {
			id: 'initial-run',
			automationId: 'runs',
			status: 'completed',
			trigger: 'manual',
			startedAt: '2026-01-01T00:00:00.000Z',
			completedAt: '2026-01-01T00:01:00.000Z',
		};
		const concurrentRun: IAutomationRun = {
			id: 'concurrent-run',
			automationId: 'runs',
			status: 'completed',
			trigger: 'manual',
			startedAt: '2026-01-02T00:00:00.000Z',
			completedAt: '2026-01-02T00:01:00.000Z',
		};
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, serializeLegacyLedger([serializedAutomation('runs', 'copilotcli')], [initialRun]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		const migrationStorage = new RecordingMigrationStorage(storage);
		migrationStorage.beforeLegacyRemoveCompareAndSwap = () => {
			const current = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!) as {
				schemaVersion: number;
				revision: number;
				automations: ReturnType<typeof serializedAutomation>[];
				runs: IAutomationRun[];
			};
			storage.store(AUTOMATION_STORAGE_KEY, JSON.stringify({
				...current,
				revision: current.revision + 1,
				runs: [...current.runs, concurrentRun],
			}), StorageScope.APPLICATION, StorageTarget.MACHINE);
		};
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			migrationStorage,
			new TestConnectionsService(connection),
			languageModelsService,
		));

		await waitForState(service.automations, items => items.length === 1 && items[0].host?.migrationPending !== true && items[0].enabled);
		const backups = JSON.parse(storage.get('chat.automations.ahpMigration.backup.v1', StorageScope.APPLICATION)!) as Record<string, { runs: IAutomationRun[] }>;
		const ledger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!) as { automations: unknown[] };
		assert.deepStrictEqual({
			backupRunIds: backups.runs.runs.map(run => run.id).sort(),
			legacyAutomations: ledger.automations,
		}, {
			backupRunIds: ['concurrent-run', 'initial-run'],
			legacyAutomations: [],
		});
	});

	test('does not remove local data when the deterministic host resource conflicts', async () => {
		const legacyRun: IAutomationRun = {
			id: 'legacy-run',
			automationId: 'conflict',
			status: 'completed',
			trigger: 'manual',
			startedAt: '2026-01-01T00:00:00.000Z',
			completedAt: '2026-01-01T00:01:00.000Z',
		};
		const raw = serializeLegacyLedger([serializedAutomation('conflict', 'copilotcli')], [legacyRun]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const connection = new TestConnection(['copilotcli']);
		connection.seedAutomation('ahp-automation:/vscode-conflict', false, 'Different host definition');
		const didConflict = Event.toPromise(connection.onDidCreateAutomationConflict);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			languageModelsService,
		));

		await didConflict;
		const automations = await waitForState(service.automations, items => items.some(automation => automation.host?.migrationConflict === true));

		assert.deepStrictEqual({
			automations: automations
				.map(automation => ({
					name: automation.name,
					migrationPending: automation.host?.migrationPending,
					migrationConflict: automation.host?.migrationConflict,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
			uniqueIds: new Set(automations.map(automation => automation.id)).size,
			runMatchesConflict: service.runs.get()[0].automationId === automations.find(automation => automation.host?.migrationConflict)?.id,
			legacyLedger: storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION),
		}, {
			automations: [{
				name: 'conflict',
				migrationPending: true,
				migrationConflict: true,
			}, {
				name: 'Different host definition',
				migrationPending: undefined,
				migrationConflict: undefined,
			}],
			uniqueIds: 2,
			runMatchesConflict: true,
			legacyLedger: raw,
		});
	});

	test('one migration conflict does not block unrelated definitions', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, serializeLegacyLedger([
			serializedAutomation('conflict-first', 'copilotcli'),
			serializedAutomation('migrates-second', 'copilotcli'),
		]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		const connection = new TestConnection(['copilotcli']);
		connection.seedAutomation('ahp-automation:/vscode-conflict-first', false, 'Different host definition');
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			languageModelsService,
		));

		const automations = await waitForState(service.automations, items =>
			items.some(automation => automation.host?.migrationConflict === true)
			&& items.some(automation => automation.name === 'migrates-second' && automation.host?.migrationPending !== true)
		);

		assert.deepStrictEqual({
			names: automations.map(automation => automation.name).sort(),
			remainingLegacyNames: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).automations.map((automation: { name: string }) => automation.name),
		}, {
			names: ['Different host definition', 'conflict-first', 'migrates-second'],
			remainingLegacyNames: ['conflict-first'],
		});
	});

	test('resumes migration after a conflicting host definition is corrected', async () => {
		const modelIdentifier = 'agent-host-copilotcliauto';
		const raw = serializeLegacyLedger([serializedAutomation('retry-conflict', 'copilotcli', modelIdentifier)]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const resource = 'ahp-automation:/vscode-retry-conflict';
		const connection = new TestConnection(['copilotcli']);
		connection.seedAutomation(resource, false, 'Different host definition');
		const models = new Map([[modelIdentifier, 'auto']]);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			testLanguageModelsService(models),
		));
		await waitForState(service.automations, items => items.some(automation => automation.host?.migrationConflict === true));

		const migrated = Event.toPromise(connection.onDidEnableImportedAutomation);
		models.set(modelIdentifier, 'different-model');
		connection.setAutomationDefinition(resource, connection.lastCreateDefinition!);
		connection.setAutomationDefinition(resource, connection.lastCreateDefinition!);
		await migrated;

		const automations = await waitForState(service.automations, items =>
			items.length === 1
			&& items[0].name === 'retry-conflict'
			&& items[0].host?.migrationPending !== true
			&& items[0].enabled
		);
		assert.deepStrictEqual({
			automations: automations.map(automation => ({
				name: automation.name,
				modelId: automation.modelId,
				migrationPending: automation.host?.migrationPending,
			})),
			legacyAutomations: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).automations,
		}, {
			automations: [{ name: 'retry-conflict', modelId: 'auto', migrationPending: undefined }],
			legacyAutomations: [],
		});
	});

	test('recreates a deleted conflicting host definition before source removal', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('delete-conflict', 'copilotcli')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const resource = 'ahp-automation:/vscode-delete-conflict';
		const connection = new TestConnection(['copilotcli']);
		connection.seedAutomation(resource, false, 'Different host definition');
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			languageModelsService,
		));
		await waitForState(service.automations, items => items.some(automation => automation.host?.migrationConflict === true));

		connection.removeAutomation(resource);

		const automations = await waitForState(service.automations, items =>
			items.length === 1
			&& items[0].name === 'delete-conflict'
			&& items[0].host?.migrationPending !== true
			&& items[0].enabled
		);
		const ledger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!) as { automations: unknown[] };
		assert.deepStrictEqual({
			automations: automations.map(automation => automation.name),
			legacyAutomations: ledger.automations,
		}, {
			automations: ['delete-conflict'],
			legacyAutomations: [],
		});
	});

	test('retries a concurrent backup write without losing either window data', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('tests', 'copilotcli')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const migrationStorage = new RecordingMigrationStorage(storage);
		migrationStorage.injectBackupConflict = true;
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			migrationStorage,
			new TestConnectionsService(connection),
			languageModelsService,
		));
		await Event.toPromise(connection.onDidEnableImportedAutomation);
		const backups = JSON.parse(storage.get('chat.automations.ahpMigration.backup.v1', StorageScope.APPLICATION)!) as Record<string, unknown>;

		assert.deepStrictEqual({
			backupIds: Object.keys(backups).sort(),
			automationNames: service.automations.get().map(automation => automation.name),
		}, {
			backupIds: ['other-window', 'tests'],
			automationNames: ['tests'],
		});
	});

	test('drops a pending cache entry completed by another window', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('cloud', 'copilot-cloud-agent')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			languageModelsService,
		));
		await Event.toPromise(connection.onDidListAutomations);
		const resource = 'ahp-automation:/vscode-cloud';
		connection.publishAutomation(resource, true);
		storage.store('chat.automations.ahpMigration.v1', JSON.stringify({
			version: 1,
			batchId: 'other-window',
			items: [{
				automationId: 'cloud',
				authority: AMBIENT_AGENT_HOST_AUTHORITY,
				resource,
				enabled: true,
				phase: 'completed',
			}],
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store(AUTOMATION_STORAGE_KEY, serializeLegacyLedger([]), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const automations = await waitForState(service.automations, items =>
			items.length === 1 && items[0].host?.migrationPending !== true
		);
		assert.deepStrictEqual(automations.map(automation => ({
			name: automation.name,
			migrationPending: automation.host?.migrationPending,
		})), [{ name: 'cloud', migrationPending: undefined }]);
	});

	test('automatically resumes migration when the target agent appears', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('cloud', 'copilot-cloud-agent')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const operations: string[] = [];
		const connection = new TestConnection(['copilotcli'], operations);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage, operations),
			new TestConnectionsService(connection),
			languageModelsService,
		));
		await Event.toPromise(connection.onDidListAutomations);
		connection.setProviders(['copilotcli', 'copilot-cloud-agent']);
		await waitForState(service.automations, items => items.length === 1 && items[0].host?.migrationPending !== true);

		assert.deepStrictEqual({
			operations,
			automation: service.automations.get().map(automation => ({
				name: automation.name,
				migrationPending: automation.host?.migrationPending,
			})),
		}, {
			operations: ['host:create-disabled', 'legacy:disable', 'legacy:remove', 'host:enable'],
			automation: [{ name: 'cloud', migrationPending: undefined }],
		});
	});

	test('resumes after the local row was removed before the host copy was enabled', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const automation = {
			...serializedAutomation('resume', 'copilotcli'),
			target: {
				kind: 'quickChat' as const,
				providerId: 'default-copilot',
				sessionTypeId: 'copilotcli',
			},
		};
		const resource = 'ahp-automation:/vscode-resume';
		storage.store('chat.automations.ahpMigration.v1', JSON.stringify({
			version: 1,
			batchId: 'batch',
			items: [{
				automationId: 'resume',
				authority: AMBIENT_AGENT_HOST_AUTHORITY,
				resource,
				enabled: true,
				phase: 'localDisabled',
			}],
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store('chat.automations.ahpMigration.backup.v1', JSON.stringify({
			resume: { automation, runs: [] },
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);
		const operations: string[] = [];
		const connection = new TestConnection(['copilotcli'], operations);
		connection.seedAutomation(resource, false);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage, operations),
			new TestConnectionsService(connection),
			languageModelsService,
		));

		await waitForState(service.automations, items => items.length === 1 && items[0].host?.migrationPending !== true && items[0].enabled === true);

		assert.deepStrictEqual({
			operations,
			automations: service.automations.get().map(candidate => ({ name: candidate.name, enabled: candidate.enabled })),
		}, {
			operations: ['host:enable'],
			automations: [{ name: 'resume', enabled: true }],
		});
	});

	test('creates new definitions only on AHP', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			testLanguageModelsService(new Map([['agent-host-copilotcliauto', 'auto']])),
		));
		await Event.toPromise(connection.onDidListAutomations);

		const automation = await service.createAutomation({
			name: 'new',
			prompt: 'Run tests',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			modelId: 'agent-host-copilotcliauto',
		});

		assert.deepStrictEqual({
			name: automation.name,
			host: automation.host?.authority,
			modelId: automation.modelId,
			legacyLedger: storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION),
		}, {
			name: 'new',
			host: AMBIENT_AGENT_HOST_AUTHORITY,
			modelId: 'auto',
			legacyLedger: undefined,
		});
	});

	test('repairs workbench model identifiers in existing host definitions', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const connection = new TestConnection(['copilotcli']);
		connection.seedAutomation('ahp-automation:/test', true, 'existing', 'agent-host-copilotcliauto');
		const models = new Map<string, string>();
		const onDidChangeLanguageModels = disposables.add(new Emitter<void>());
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			testLanguageModelsService(models, onDidChangeLanguageModels.event),
		));
		await Event.toPromise(connection.onDidListAutomations);
		models.set('agent-host-copilotcliauto', 'auto');
		onDidChangeLanguageModels.fire();

		const automations = await waitForState(service.automations, items => items[0]?.modelId === 'auto');

		assert.deepStrictEqual(automations.map(automation => ({
			name: automation.name,
			modelId: automation.modelId,
		})), [{
			name: 'existing',
			modelId: 'auto',
		}]);
	});

	test('preserves provider-native BYOK model IDs', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			testLanguageModelsService(new Map([['openrouter/group/model', 'model']])),
		));
		await Event.toPromise(connection.onDidListAutomations);

		const automation = await service.createAutomation({
			name: 'BYOK',
			prompt: 'Run tests',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			modelId: 'openrouter/group/model',
		});

		assert.strictEqual(automation.modelId, 'openrouter/group/model');
	});

	test('reconnect drops stale run state and follows fresh summaries', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const connection = new TestConnection(['copilotcli']);
		connection.seedAutomation('ahp-automation:/test', true);
		const connections = new TestConnectionsService(connection);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			connections,
			languageModelsService,
		));
		await Event.toPromise(connection.onDidListAutomations);
		const automation = service.automations.get()[0];
		const started = await service.startRun(automation.id, 'request');
		assert.strictEqual(started.claimed, true);

		connections.setConnection(undefined);
		await waitForState(service.automations, items => items[0]?.host?.connected === false);
		connections.setConnection(connection);
		await Event.toPromise(connection.onDidListAutomations);
		connection.setRunStatus(started.run.id.split('\0')[1], AutomationRunStatus.Completed);
		const completedRuns = await waitForState(service.runs, runs => runs.some(run => run.status === 'completed'));

		assert.strictEqual(completedRuns[0].status, 'completed');
	});

	test('projects the operations the owning host permits', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const connection = new TestConnection(['copilotcli']);
		connection.seedAutomation('ahp-automation:/test', true);
		connection.setAutomationOperations('ahp-automation:/test', [AutomationOperation.Run]);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			languageModelsService,
		));
		await Event.toPromise(connection.onDidListAutomations);
		const automation = service.automations.get()[0];

		await assert.rejects(() => service.updateAutomation(automation.id, { name: 'renamed' }), /does not allow the 'update' operation/);
		await assert.rejects(() => service.deleteAutomation(automation.id), /does not allow the 'dispose' operation/);
		assert.deepStrictEqual({
			canEdit: automation.host?.canEdit,
			canRun: automation.host?.canRun,
			canDelete: automation.host?.canDelete,
		}, {
			canEdit: false,
			canRun: true,
			canDelete: false,
		});
	});

	test('cancelling a run resolves only once the host reports a terminal run', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const connection = new TestConnection(['copilotcli']);
		connection.seedAutomation('ahp-automation:/test', true);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
			languageModelsService,
		));
		await Event.toPromise(connection.onDidListAutomations);
		const automation = service.automations.get()[0];
		const started = await service.startRun(automation.id, 'request');

		let settled = false;
		const cancelled = service.cancelRun(started.run.id).then(() => settled = true);
		await timeout(0);
		const settledBeforeHostAcknowledged = settled;
		connection.setRunStatus(started.run.id.split('\0')[1], AutomationRunStatus.Cancelled);
		await cancelled;

		assert.deepStrictEqual({
			settledBeforeHostAcknowledged,
			cancelRequests: connection.cancelRequests,
			status: service.runs.get()[0].status,
		}, {
			settledBeforeHostAcknowledged: false,
			cancelRequests: ['ahp-automation-run:/run'],
			status: 'cancelled',
		});
	});
});

class TestSubscription<T> implements IAgentSubscription<T> {
	private readonly _onDidChange = new Emitter<T>();
	readonly onDidChange = this._onDidChange.event;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;

	constructor(public value: T | Error | undefined) { }

	get verifiedValue(): T | undefined {
		return this.value instanceof Error ? undefined : this.value;
	}

	set(value: T): void {
		this.value = value;
		this._onDidChange.fire(value);
	}
}

class TestConnection extends NullAgentHostService {
	override readonly initializeResult = observableValue<InitializeResult | undefined>(this, {
		protocolVersion: '0.8.0',
		serverSeq: 0,
		snapshots: [],
		automations: { execution: { lifetime: AutomationExecutionLifetime.HostLifetime }, create: {} },
	});
	private readonly _rootState: TestSubscription<RootState>;
	readonly operations: string[];

	private readonly _onDidNotificationEmitter = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotificationEmitter.event;
	private readonly _onDidListAutomations = new Emitter<void>();
	readonly onDidListAutomations = this._onDidListAutomations.event;
	private readonly _onDidEnableImportedAutomation = new Emitter<void>();
	readonly onDidEnableImportedAutomation = this._onDidEnableImportedAutomation.event;
	private readonly _onDidCreateAutomationConflict = new Emitter<void>();
	readonly onDidCreateAutomationConflict = this._onDidCreateAutomationConflict.event;
	private readonly automations = new Map<string, TestSubscription<AutomationState>>();
	private readonly runs = new Map<string, TestSubscription<AutomationRunState>>();
	private readonly modelIds: readonly string[];
	readonly cancelRequests: string[] = [];
	lastCreateDefinition: AutomationDefinition | undefined;
	afterCreateAutomation: (() => void) | undefined;

	constructor(providers: readonly string[], operations: string[] = [], modelIds: readonly string[] = ['auto', 'openrouter/group/model']) {
		super();
		this.operations = operations;
		this.modelIds = modelIds;
		this._rootState = new TestSubscription<RootState>({
			agents: providers.map(provider => this.toAgentInfo(provider)),
			activeSessions: 0,
			terminals: [],
		});
	}

	override get rootState(): IAgentSubscription<RootState> {
		return this._rootState;
	}

	setProviders(providers: readonly string[]): void {
		this._rootState.set({
			agents: providers.map(provider => this.toAgentInfo(provider)),
			activeSessions: 0,
			terminals: [],
		});
	}

	private toAgentInfo(provider: string) {
		return {
			provider,
			displayName: provider,
			description: provider,
			models: this.modelIds.map(id => ({ provider, id, name: id })),
			tools: [],
		};
	}

	override async listAutomations(): Promise<ListAutomationsResult> {
		queueMicrotask(() => this._onDidListAutomations.fire());
		return { items: [...this.automations.values()].map(subscription => toSummary(subscription.value as AutomationState)) };
	}

	override async createAutomation(params: CreateAutomationParams): Promise<void> {
		this.lastCreateDefinition = params.definition;
		if (this.automations.has(params.channel)) {
			queueMicrotask(() => this._onDidCreateAutomationConflict.fire());
			throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Automation already exists: ${params.channel}`);
		}
		this.operations.push(params.definition.enabled ? 'host:create-enabled' : 'host:create-disabled');
		const now = new Date().toISOString();
		const state: AutomationState = {
			resource: params.channel,
			definition: params.definition,
			revision: 1,
			runs: [],
			operations: [AutomationOperation.Update, AutomationOperation.Dispose, AutomationOperation.Run],
			createdAt: now,
			modifiedAt: now,
		};
		this.automations.set(params.channel, new TestSubscription(state));
		this.afterCreateAutomation?.();
	}

	setAutomationOperations(resource: string, operations: readonly AutomationOperation[]): void {
		const subscription = this.automations.get(resource)!;
		const current = subscription.value as AutomationState;
		subscription.set({ ...current, operations: [...operations] });
	}

	setAutomationDefinition(resource: string, definition: AutomationDefinition): void {
		const subscription = this.automations.get(resource)!;
		const current = subscription.value as AutomationState;
		subscription.set({
			...current,
			definition,
			revision: current.revision + 1,
			modifiedAt: new Date().toISOString(),
		});
	}

	seedAutomation(resource: string, enabled: boolean, title = 'resume', modelId?: string): void {
		void this.createAutomation({
			channel: resource,
			definition: {
				title,
				message: { text: 'Run tests', origin: { kind: MessageKind.User } },
				session: { provider: 'copilotcli', ...(modelId ? { model: { id: modelId } } : {}) },
				enabled,
				triggers: [],
			},
		});
		this.operations.length = 0;
	}

	publishAutomation(resource: string, enabled: boolean): void {
		this.seedAutomation(resource, enabled, 'cloud');
		const state = this.automations.get(resource)!.value as AutomationState;
		this._onDidNotificationEmitter.fire({
			type: 'root/automationAdded',
			channel: 'ahp-root://',
			summary: toSummary(state),
		});
	}

	removeAutomation(resource: string): void {
		this.automations.delete(resource);
		this._onDidNotificationEmitter.fire({
			type: 'root/automationRemoved',
			channel: 'ahp-root://',
			automation: resource,
		});
	}

	override async updateAutomation(params: UpdateAutomationParams): Promise<void> {
		const subscription = this.automations.get(params.channel)!;
		const current = subscription.value as AutomationState;
		const next: AutomationState = {
			...current,
			definition: { ...current.definition, ...params.changes },
			revision: current.revision + 1,
			modifiedAt: new Date().toISOString(),
		};
		subscription.set(next);
		if (params.changes.enabled === true) {
			this.operations.push('host:enable');
			queueMicrotask(() => this._onDidEnableImportedAutomation.fire());
		}
	}

	override async runAutomation(params: RunAutomationParams): Promise<RunAutomationResult> {
		const resource = 'ahp-automation-run:/run';
		const automation = this.automations.get(params.channel)!;
		const state = automation.value as AutomationState;
		const now = new Date().toISOString();
		const run: AutomationRunState = {
			resource,
			automation: params.channel,
			cause: { kind: AutomationRunCauseKind.Manual },
			lifecycle: { status: AutomationRunStatus.Running, createdAt: now, startedAt: now },
			sessions: ['copilotcli:/session'],
			primarySession: 'copilotcli:/session',
			artifacts: [],
			operations: [AutomationRunOperation.Cancel],
		};
		this.runs.set(resource, new TestSubscription(run));
		automation.set({ ...state, runs: [toRunSummary(run)] });
		return { run: resource };
	}

	setRunStatus(resource: string, status: AutomationRunStatus): void {
		const subscription = this.runs.get(resource)!;
		const current = subscription.value as AutomationRunState;
		const startedAt = current.lifecycle.status === AutomationRunStatus.Pending
			? current.lifecycle.createdAt
			: current.lifecycle.startedAt ?? current.lifecycle.createdAt;
		const completedAt = new Date().toISOString();
		const lifecycle: AutomationRunLifecycle = status === AutomationRunStatus.Completed || status === AutomationRunStatus.Cancelled
			? { status, createdAt: current.lifecycle.createdAt, startedAt, completedAt }
			: status === AutomationRunStatus.Failed
				? { status, createdAt: current.lifecycle.createdAt, startedAt, completedAt, error: { errorType: 'Error', message: 'run failed' } }
				: current.lifecycle;
		const next = { ...current, lifecycle, operations: [] };
		subscription.set(next);
		const automation = this.automations.get(current.automation)!;
		const automationState = automation.value as AutomationState;
		automation.set({ ...automationState, runs: [toRunSummary(next)] });
	}

	override dispatch(channel: string): void {
		this.cancelRequests.push(channel);
	}

	override getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		const subscription = kind === StateComponents.Automation
			? this.automations.get(resource.toString())!
			: this.runs.get(resource.toString())!;
		return {
			object: subscription,
			dispose() { },
		} as never;
	}
}

class TestConnectionsService implements IAgentHostConnectionsService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeConnections = new Emitter<void>();
	readonly onDidChangeConnections = this._onDidChangeConnections.event;
	private connection: TestConnection | undefined;

	constructor(connection: TestConnection) {
		this.connection = connection;
	}

	get connections() {
		return [{
			authority: AMBIENT_AGENT_HOST_AUTHORITY,
			address: undefined,
			name: 'Local',
			isAmbient: true,
			connection: this.connection,
		}];
	}

	get ambientConnection() {
		return this.connection!;
	}

	setConnection(connection: TestConnection | undefined): void {
		this.connection = connection;
		this._onDidChangeConnections.fire();
	}

	getConnectionByAuthority(authority: string) {
		return authority === AMBIENT_AGENT_HOST_AUTHORITY ? this.ambientConnection : undefined;
	}

	getConnectionByAddress() {
		return undefined;
	}

	resolveSessionResource() {
		return undefined;
	}
}

class RecordingMigrationStorage implements ILegacyAutomationMigrationStorageService {
	declare readonly _serviceBrand: undefined;
	injectBackupConflict = false;
	beforeLegacyCompareAndSwap: (() => void) | undefined;
	beforeLegacyRemoveCompareAndSwap: (() => void) | undefined;

	constructor(
		private readonly storage: InMemoryStorageService,
		private readonly operations: string[] = [],
	) { }

	get value(): string | undefined {
		return this.storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION);
	}

	async read(key = AUTOMATION_STORAGE_KEY): Promise<string | undefined> {
		return this.storage.get(key, StorageScope.APPLICATION);
	}

	async compareAndSwap(key: string, expectedValue: string | undefined, newValue: string): Promise<ILegacyAutomationMigrationCompareAndSwapResult> {
		if (LEGACY_AUTOMATION_STORAGE_KEYS.includes(key as typeof LEGACY_AUTOMATION_STORAGE_KEYS[number]) && this.beforeLegacyCompareAndSwap) {
			const callback = this.beforeLegacyCompareAndSwap;
			this.beforeLegacyCompareAndSwap = undefined;
			callback();
		}
		if (LEGACY_AUTOMATION_STORAGE_KEYS.includes(key as typeof LEGACY_AUTOMATION_STORAGE_KEYS[number]) && this.beforeLegacyRemoveCompareAndSwap && expectedValue) {
			const previous = JSON.parse(expectedValue) as { automations: unknown[] };
			const next = JSON.parse(newValue) as { automations: unknown[] };
			if (next.automations.length < previous.automations.length) {
				const callback = this.beforeLegacyRemoveCompareAndSwap;
				this.beforeLegacyRemoveCompareAndSwap = undefined;
				callback();
			}
		}
		const currentValue = this.storage.get(key, StorageScope.APPLICATION);
		if (currentValue !== expectedValue) {
			return { swapped: false, currentValue };
		}
		if (this.injectBackupConflict && key === 'chat.automations.ahpMigration.backup.v1') {
			this.injectBackupConflict = false;
			const concurrentValue = JSON.stringify({
				'other-window': {
					automation: serializedAutomation('other-window', 'copilotcli'),
					runs: [],
				},
			});
			this.storage.store(key, concurrentValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
			return { swapped: false, currentValue: concurrentValue };
		}
		if (LEGACY_AUTOMATION_STORAGE_KEYS.includes(key as typeof LEGACY_AUTOMATION_STORAGE_KEYS[number])) {
			const previous = expectedValue ? JSON.parse(expectedValue) as { automations: { enabled: boolean }[] } : undefined;
			const next = JSON.parse(newValue) as { automations: { enabled: boolean }[] };
			if (previous?.automations.length && next.automations.length === previous.automations.length) {
				this.operations.push('legacy:disable');
			} else if (previous?.automations.length && next.automations.length < previous.automations.length) {
				this.operations.push('legacy:remove');
			}
		}
		this.storage.store(key, newValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
		return { swapped: true, currentValue: newValue };
	}
}

function serializedAutomation(name: string, sessionTypeId: string, modelId?: string) {
	return {
		id: name,
		name,
		prompt: 'Run tests',
		schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
		target: { kind: 'quickChat', providerId: 'default-copilot', sessionTypeId },
		...(modelId ? { modelId } : {}),
		enabled: true,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	};
}

function testLanguageModelsService(models: ReadonlyMap<string, string> = new Map(), onDidChangeLanguageModels = Event.None): ILanguageModelsService {
	return upcastPartial<ILanguageModelsService>({
		onDidChangeLanguageModels,
		lookupLanguageModel: identifier => {
			const id = models.get(identifier);
			return id ? upcastPartial<ILanguageModelChatMetadata>({ id }) : undefined;
		},
	});
}

function serializeLegacyLedger(automations: readonly ReturnType<typeof serializedAutomation>[], runs: readonly IAutomationRun[] = []): string {
	return JSON.stringify({ schemaVersion: 3, revision: 1, automations, runs });
}

function toSummary(state: AutomationState): AutomationSummary {
	return {
		resource: state.resource,
		title: state.definition.title,
		enabled: state.definition.enabled,
		triggerCount: state.definition.triggers.length,
		revision: state.revision,
		operations: state.operations,
		createdAt: state.createdAt,
		modifiedAt: state.modifiedAt,
	};
}

function toRunSummary(state: AutomationRunState): AutomationRunSummary {
	return {
		resource: state.resource,
		automation: state.automation,
		cause: state.cause,
		lifecycle: state.lifecycle,
		primarySession: state.primarySession,
		sessionCount: state.sessions.length,
		artifactCount: state.artifacts.length,
		operations: state.operations,
	};
}
