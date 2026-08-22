/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IAutomation, IAutomationSnapshotImportResult, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { AutomationStore } from '../../browser/automationService.js';
import { ProviderAutomationService } from '../../browser/providerAutomationService.js';
import { AUTOMATION_STORAGE_KEY, IAutomationStorageService, providerAutomationStorageKey } from '../../common/automationStorageService.js';
import { TestAutomationStorageService } from './automationTestUtils.js';

const FOLDER = URI.parse('file:///workspace');
const PROVIDER_ID = 'local-agent-host';
const SESSION_TYPE_ID = 'copilotcli';

class FailingStaleRunRecoveryAutomationStore extends AutomationStore {
	override async markStaleRunsFailed(): Promise<void> {
		throw new Error('Provider unavailable.');
	}
}

class PartiallyFailingMigrationAutomationStore extends AutomationStore {
	override async importAutomationSnapshot(snapshot: IAutomation): Promise<IAutomationSnapshotImportResult> {
		if (snapshot.automation.id === 'automation-1') {
			throw new Error('Import failed.');
		}
		return super.importAutomationSnapshot(snapshot);
	}
}

class FailingTransferAutomationStore extends AutomationStore {
	override async upsertAutomationSnapshot(): Promise<void> {
		throw new Error('Transfer failed.');
	}
}

class ConcurrentlyMutatingMigrationAutomationStore extends AutomationStore {
	legacyWriter!: AutomationStore;
	mutation!: 'update' | 'delete' | 'run' | 'continuousUpdate';
	private didMutate = false;
	private updateCount = 0;

	override async importAutomationSnapshot(snapshot: IAutomation): Promise<IAutomationSnapshotImportResult> {
		const result = await super.importAutomationSnapshot(snapshot);
		if (this.mutation === 'continuousUpdate') {
			await this.legacyWriter.updateAutomation(snapshot.automation.id, { name: `Concurrent update ${++this.updateCount}` });
		} else if (!this.didMutate) {
			this.didMutate = true;
			if (this.mutation === 'update') {
				await this.legacyWriter.updateAutomation(snapshot.automation.id, { name: 'Concurrent update' });
			} else if (this.mutation === 'delete') {
				await this.legacyWriter.deleteAutomation(snapshot.automation.id);
			} else {
				await this.legacyWriter.recordRunStart(snapshot.automation.id, 'manual', 1);
			}
		}
		return result;
	}
}

class ConcurrentlyMutatingTransferAutomationStore extends AutomationStore {
	legacyWriter!: AutomationStore;
	private didMutate = false;

	override async upsertAutomationSnapshot(snapshot: IAutomation): Promise<void> {
		await super.upsertAutomationSnapshot(snapshot);
		if (!this.didMutate) {
			this.didMutate = true;
			await this.legacyWriter.recordRunStart(snapshot.automation.id, 'manual', 1);
		}
	}
}

class DestinationDeletingTransferAutomationStore extends AutomationStore {
	destinationStore!: AutomationStore;
	private didMutate = false;

	override async removeAutomationSnapshotIfUnchanged(expected: IAutomation) {
		if (!this.didMutate) {
			this.didMutate = true;
			await this.updateAutomation(expected.automation.id, { name: 'Concurrent source update' });
			await this.destinationStore.deleteAutomation(expected.automation.id);
		}
		return super.removeAutomationSnapshotIfUnchanged(expected);
	}
}

suite('ProviderAutomationService', () => {
	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(legacyRaw?: string, providerRaw?: string, providerFailure?: 'staleRunRecovery' | 'migration' | 'transfer' | 'concurrentMigrationUpdate' | 'concurrentMigrationDelete' | 'concurrentMigrationRun' | 'continuousMigrationUpdate' | 'concurrentTransferRun' | 'destinationDeleteDuringRollback'): {
		readonly service: ProviderAutomationService;
		readonly providerStore: AutomationStore;
		readonly storage: InMemoryStorageService;
		readonly automationStorage: TestAutomationStorageService;
		readonly addProvider: (provider: ISessionsProvider) => void;
	} {
		const storage = teardown.add(new InMemoryStorageService());
		if (legacyRaw) {
			storage.store(AUTOMATION_STORAGE_KEY, legacyRaw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		if (providerRaw) {
			storage.store(providerAutomationStorageKey(PROVIDER_ID), providerRaw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		const automationStorage = new TestAutomationStorageService(storage);
		const storageKey = providerAutomationStorageKey(PROVIDER_ID);
		let providerStore: AutomationStore;
		switch (providerFailure) {
			case 'staleRunRecovery':
				providerStore = new FailingStaleRunRecoveryAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
				break;
			case 'migration':
				providerStore = new PartiallyFailingMigrationAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
				break;
			case 'transfer':
				providerStore = new FailingTransferAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
				break;
			case 'concurrentMigrationUpdate':
			case 'concurrentMigrationDelete':
			case 'concurrentMigrationRun':
			case 'continuousMigrationUpdate': {
				const mutatingStore = new ConcurrentlyMutatingMigrationAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
				mutatingStore.legacyWriter = teardown.add(new AutomationStore(AUTOMATION_STORAGE_KEY, storage, new NullLogService(), NullTelemetryService, automationStorage));
				if (providerFailure === 'concurrentMigrationUpdate') {
					mutatingStore.mutation = 'update';
				} else if (providerFailure === 'concurrentMigrationDelete') {
					mutatingStore.mutation = 'delete';
				} else if (providerFailure === 'continuousMigrationUpdate') {
					mutatingStore.mutation = 'continuousUpdate';
				} else {
					mutatingStore.mutation = 'run';
				}
				providerStore = mutatingStore;
				break;
			}
			case 'concurrentTransferRun': {
				const mutatingStore = new ConcurrentlyMutatingTransferAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
				mutatingStore.legacyWriter = teardown.add(new AutomationStore(AUTOMATION_STORAGE_KEY, storage, new NullLogService(), NullTelemetryService, automationStorage));
				providerStore = mutatingStore;
				break;
			}
			case 'destinationDeleteDuringRollback': {
				const deletingStore = new DestinationDeletingTransferAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
				deletingStore.destinationStore = teardown.add(new AutomationStore(AUTOMATION_STORAGE_KEY, storage, new NullLogService(), NullTelemetryService, automationStorage));
				providerStore = deletingStore;
				break;
			}
			default:
				providerStore = new AutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
		}
		teardown.add(providerStore);
		const provider = upcastPartial<ISessionsProvider>({
			id: PROVIDER_ID,
			order: 0,
			automations: providerStore,
		});
		const registeredProviders: ISessionsProvider[] = [provider];
		const providersChanged = teardown.add(new Emitter<ISessionsProvidersChangeEvent>());
		const providers = upcastPartial<ISessionsProvidersService>({
			onDidChangeProviders: providersChanged.event,
			getProviders: () => [...registeredProviders],
			getProvider: <T extends ISessionsProvider>(providerId: string) => registeredProviders.find(candidate => candidate.id === providerId) as T | undefined,
		});
		const instantiationService = teardown.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IAutomationStorageService, automationStorage);
		instantiationService.stub(ISessionsProvidersService, providers);
		instantiationService.stub(IInstantiationService, instantiationService);
		const service = teardown.add(instantiationService.createInstance(ProviderAutomationService));
		return {
			service,
			providerStore,
			storage,
			automationStorage,
			addProvider: addedProvider => {
				registeredProviders.push(addedProvider);
				providersChanged.fire({ added: [addedProvider], removed: [] });
			},
		};
	}

	test('routes new Automations to their provider store', async () => {
		const { service, providerStore, storage } = createService();
		await service.createAutomation({
			name: 'Provider owned',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
			modelId: 'model',
			mode: 'agent',
			permissionLevel: 'autopilot',
		});

		assert.deepStrictEqual({
			aggregate: service.automations.get().map(automation => automation.name),
			provider: providerStore.automations.get().map(automation => automation.name),
			legacy: storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION),
		}, {
			aggregate: ['Provider owned'],
			provider: ['Provider owned'],
			legacy: undefined,
		});
	});

	test('transfers Automations and runs when updates change store ownership', async () => {
		const { service, providerStore, storage } = createService();
		const legacyTarget = { kind: 'workspace', folderUri: FOLDER, providerId: 'provider-without-storage', sessionTypeId: 'other', isolation: { kind: 'default' } } as const;
		const providerTarget = { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } } as const;
		const created = await service.createAutomation({
			name: 'Transferred',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: legacyTarget,
		});
		const claim = await service.recordRunStart(created.id, 'manual', 1);

		const transferToProvider = await service.updateAutomationIfUnchanged(created.id, { target: providerTarget }, created);
		const afterProviderTransfer = {
			result: transferToProvider.kind,
			providerTarget: providerStore.getAutomation(created.id)?.target,
			providerRunIds: providerStore.runs.get().map(run => run.id),
			legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).automations.map((automation: { id: string }) => automation.id),
		};

		await service.updateAutomation(created.id, { target: legacyTarget });
		const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!);

		assert.deepStrictEqual({
			claimRunId: claim.run.id,
			afterProviderTransfer,
			finalProviderAutomation: providerStore.getAutomation(created.id),
			finalProviderRunIds: providerStore.runs.get().map(run => run.id),
			finalLegacyTarget: legacyLedger.automations.find((automation: { id: string }) => automation.id === created.id)?.target,
			finalLegacyRunIds: legacyLedger.runs.map((run: { id: string }) => run.id),
		}, {
			claimRunId: claim.run.id,
			afterProviderTransfer: {
				result: 'updated',
				providerTarget,
				providerRunIds: [claim.run.id],
				legacyAutomationIds: [],
			},
			finalProviderAutomation: undefined,
			finalProviderRunIds: [],
			finalLegacyTarget: {
				kind: 'workspace',
				folderUri: FOLDER.toJSON(),
				providerId: 'provider-without-storage',
				sessionTypeId: 'other',
				isolation: { kind: 'default' },
			},
			finalLegacyRunIds: [claim.run.id],
		});
	});

	test('does not transfer an Automation when a guarded update conflicts', async () => {
		const { service, providerStore, storage } = createService();
		const created = await service.createAutomation({
			name: 'Provider owned',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
		});

		const result = await service.updateAutomationIfUnchanged(created.id, {
			target: { kind: 'workspace', folderUri: FOLDER, providerId: 'provider-without-storage', sessionTypeId: 'other', isolation: { kind: 'default' } },
		}, { ...created, name: 'Stale' });

		assert.deepStrictEqual({
			result: result.kind,
			providerAutomationId: providerStore.getAutomation(created.id)?.id,
			legacy: storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION),
		}, {
			result: 'conflict',
			providerAutomationId: created.id,
			legacy: undefined,
		});
	});

	test('retains the source Automation when ownership transfer fails', async () => {
		const { service, providerStore, storage } = createService(undefined, undefined, 'transfer');
		const created = await service.createAutomation({
			name: 'Legacy',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId: 'provider-without-storage', sessionTypeId: 'other', isolation: { kind: 'default' } },
		});

		await assert.rejects(service.updateAutomation(created.id, {
			target: { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
		}), /Transfer failed/);
		const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!);

		assert.deepStrictEqual({
			providerAutomation: providerStore.getAutomation(created.id),
			legacyAutomationIds: legacyLedger.automations.map((automation: { id: string }) => automation.id),
		}, {
			providerAutomation: undefined,
			legacyAutomationIds: [created.id],
		});
	});

	test('retries ownership transfer when a run is added concurrently', async () => {
		const { service, providerStore, storage } = createService(undefined, undefined, 'concurrentTransferRun');
		const created = await service.createAutomation({
			name: 'Legacy',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId: 'provider-without-storage', sessionTypeId: 'other', isolation: { kind: 'default' } },
		});

		await service.updateAutomation(created.id, {
			target: { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
		});

		assert.deepStrictEqual({
			providerRunAutomationIds: providerStore.runs.get().map(run => run.automationId),
			legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).automations.map((automation: { id: string }) => automation.id),
		}, {
			providerRunAutomationIds: [created.id],
			legacyAutomationIds: [],
		});
	});

	test('does not recreate a destination deleted during rollback', async () => {
		const { service, providerStore, storage } = createService(undefined, undefined, 'destinationDeleteDuringRollback');
		const created = await service.createAutomation({
			name: 'Provider owned',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
		});

		await service.updateAutomation(created.id, {
			target: { kind: 'workspace', folderUri: FOLDER, providerId: 'provider-without-storage', sessionTypeId: 'other', isolation: { kind: 'default' } },
		});
		const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!);

		assert.deepStrictEqual({
			sourceName: providerStore.getAutomation(created.id)?.name,
			legacyAutomationIds: legacyLedger.automations.map((automation: { id: string }) => automation.id),
		}, {
			sourceName: 'Concurrent source update',
			legacyAutomationIds: [],
		});
	});

	test('does not re-run the mutation guard after the source update commits', async () => {
		const { service, providerStore } = createService();
		const created = await service.createAutomation({
			name: 'Legacy',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId: 'provider-without-storage', sessionTypeId: 'other', isolation: { kind: 'default' } },
		});
		let guardCalls = 0;

		const result = await service.updateAutomationIfUnchanged(created.id, {
			target: { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
		}, created, () => {
			guardCalls++;
			if (guardCalls > 1) {
				throw new Error('Guard called after commit.');
			}
		});

		assert.deepStrictEqual({
			result: result.kind,
			guardCalls,
			providerAutomationId: providerStore.getAutomation(created.id)?.id,
		}, {
			result: 'updated',
			guardCalls: 1,
			providerAutomationId: created.id,
		});
	});

	test('migrates legacy Automations and runs unchanged into the provider store', async () => {
		const legacy = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [{
				id: 'automation-1',
				name: 'Legacy',
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
				modelId: 'model',
				mode: 'agent',
				permissionLevel: 'autopilot',
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}],
			runs: [{
				id: 'run-1',
				automationId: 'automation-1',
				status: 'completed',
				trigger: 'manual',
				startedAt: '2026-01-01T00:00:00.000Z',
				leaderWindowId: 1,
			}],
		});
		const { service, providerStore, storage } = createService(legacy);

		await service.waitForMigrationForTesting();

		assert.deepStrictEqual({
			automation: providerStore.getAutomation('automation-1'),
			runIds: providerStore.runs.get().map(run => run.id),
			legacy: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!),
		}, {
			automation: {
				id: 'automation-1',
				name: 'Legacy',
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
				modelId: 'model',
				mode: 'agent',
				permissionLevel: 'autopilot',
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				lastRunAt: undefined,
				nextRunAt: undefined,
			},
			runIds: ['run-1'],
			legacy: { schemaVersion: 3, revision: 2, automations: [], runs: [] },
		});
	});

	test('retries migration when the legacy Automation changes during import', async () => {
		const legacy = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [{
				id: 'automation-1',
				name: 'Original',
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}],
			runs: [],
		});
		const { service, providerStore, storage } = createService(legacy, undefined, 'concurrentMigrationUpdate');

		await service.waitForMigrationForTesting();

		assert.deepStrictEqual({
			providerName: providerStore.getAutomation('automation-1')?.name,
			legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).automations.map((automation: { id: string }) => automation.id),
		}, {
			providerName: 'Concurrent update',
			legacyAutomationIds: [],
		});
	});

	test('rolls back migration when the legacy Automation is deleted during import', async () => {
		const legacy = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [{
				id: 'automation-1',
				name: 'Deleted concurrently',
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}],
			runs: [],
		});
		const { service, providerStore, storage } = createService(legacy, undefined, 'concurrentMigrationDelete');

		await service.waitForMigrationForTesting();

		assert.deepStrictEqual({
			providerAutomation: providerStore.getAutomation('automation-1'),
			legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).automations.map((automation: { id: string }) => automation.id),
		}, {
			providerAutomation: undefined,
			legacyAutomationIds: [],
		});
	});

	test('retries migration when a run is added during import', async () => {
		const legacy = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [{
				id: 'automation-1',
				name: 'Concurrent run',
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}],
			runs: [],
		});
		const { service, providerStore, storage } = createService(legacy, undefined, 'concurrentMigrationRun');

		await service.waitForMigrationForTesting();

		assert.deepStrictEqual({
			providerRunCount: providerStore.runs.get().length,
			providerRunAutomationIds: providerStore.runs.get().map(run => run.automationId),
			legacyRunIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).runs.map((run: { id: string }) => run.id),
		}, {
			providerRunCount: 1,
			providerRunAutomationIds: ['automation-1'],
			legacyRunIds: [],
		});
	});

	test('bounds migration retries and leaves a continuously changing source in legacy storage', async () => {
		const legacy = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [{
				id: 'automation-1',
				name: 'Original',
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}],
			runs: [],
		});
		const { service, providerStore, storage } = createService(legacy, undefined, 'continuousMigrationUpdate');

		await service.waitForMigrationForTesting();
		const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!);

		assert.deepStrictEqual({
			providerAutomation: providerStore.getAutomation('automation-1'),
			legacyAutomationIds: legacyLedger.automations.map((automation: { id: string }) => automation.id),
			legacyName: legacyLedger.automations[0]?.name,
		}, {
			providerAutomation: undefined,
			legacyAutomationIds: ['automation-1'],
			legacyName: 'Concurrent update 3',
		});
	});

	test('deduplicates overlapping provider and legacy entries during migration', () => {
		const ledger = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [{
				id: 'automation-1',
				name: 'Shared',
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}],
			runs: [{
				id: 'run-1',
				automationId: 'automation-1',
				status: 'completed',
				trigger: 'manual',
				startedAt: '2026-01-01T00:00:00.000Z',
				leaderWindowId: 1,
			}],
		});
		const { service } = createService(ledger, ledger);

		assert.deepStrictEqual({
			automationIds: service.automations.get().map(automation => automation.id),
			runIds: service.runs.get().map(run => run.id),
		}, {
			automationIds: ['automation-1'],
			runIds: ['run-1'],
		});
	});

	test('retains legacy data when the provider Automation payload diverges', async () => {
		const createLedger = (name: string) => JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [{
				id: 'automation-1',
				name,
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}],
			runs: [],
		});
		const { service, providerStore, storage } = createService(createLedger('Legacy'), createLedger('Provider'));

		await service.waitForMigrationForTesting();
		const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!);

		assert.deepStrictEqual({
			providerName: providerStore.getAutomation('automation-1')?.name,
			legacyNames: legacyLedger.automations.map((automation: { name: string }) => automation.name),
		}, {
			providerName: 'Provider',
			legacyNames: ['Legacy'],
		});
	});

	test('retains legacy data when a same-ID run payload diverges', async () => {
		const automation = {
			id: 'automation-1',
			name: 'Shared',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
			enabled: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		};
		const createLedger = (status: 'completed' | 'failed') => JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [automation],
			runs: [{
				id: 'run-1',
				automationId: automation.id,
				status,
				trigger: 'manual',
				startedAt: '2026-01-01T00:00:00.000Z',
				leaderWindowId: 1,
			}],
		});
		const { service, providerStore, storage } = createService(createLedger('failed'), createLedger('completed'));

		await service.waitForMigrationForTesting();
		const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!);

		assert.deepStrictEqual({
			providerStatuses: providerStore.runs.get().map(run => run.status),
			legacyStatuses: legacyLedger.runs.map((run: { status: string }) => run.status),
		}, {
			providerStatuses: ['completed'],
			legacyStatuses: ['failed'],
		});
	});

	test('retains legacy data when provider run history diverges', async () => {
		const automation = {
			id: 'automation-1',
			name: 'Shared',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
			enabled: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		};
		const legacy = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [automation],
			runs: [{
				id: 'legacy-run',
				automationId: automation.id,
				status: 'completed',
				trigger: 'manual',
				startedAt: '2026-01-02T00:00:00.000Z',
				leaderWindowId: 1,
			}],
		});
		const provider = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [automation],
			runs: [{
				id: 'provider-run',
				automationId: automation.id,
				status: 'completed',
				trigger: 'manual',
				startedAt: '2026-01-01T00:00:00.000Z',
				leaderWindowId: 1,
			}],
		});
		const { service, providerStore, storage } = createService(legacy, provider);

		await service.waitForMigrationForTesting();

		assert.deepStrictEqual({
			providerRunIds: providerStore.runs.get().map(run => run.id),
			legacy: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!),
		}, {
			providerRunIds: ['provider-run'],
			legacy: {
				schemaVersion: 3, revision: 1, automations: [automation], runs: [{
					id: 'legacy-run',
					automationId: automation.id,
					status: 'completed',
					trigger: 'manual',
					startedAt: '2026-01-02T00:00:00.000Z',
					leaderWindowId: 1,
				}]
			},
		});
	});

	test('recovers active runs after migration completes', async () => {
		const legacy = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [{
				id: 'automation-1',
				name: 'Legacy',
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}],
			runs: [{
				id: 'run-1',
				automationId: 'automation-1',
				status: 'running',
				trigger: 'manual',
				startedAt: '2026-01-01T00:00:00.000Z',
				leaderWindowId: 1,
			}],
		});
		const { service, providerStore } = createService(legacy);

		await service.markStaleRunsFailed('Recovered after restart.');

		assert.deepStrictEqual(providerStore.runs.get().map(run => ({
			id: run.id,
			status: run.status,
			errorMessage: run.errorMessage,
		})), [{
			id: 'run-1',
			status: 'failed',
			errorMessage: 'Recovered after restart.',
		}]);
	});

	test('recovers stale runs for providers added only while leader-scoped recovery is active', async () => {
		const { service, storage, automationStorage, addProvider } = createService();
		await service.startStaleRunRecovery('Recovered after restart.');

		const activeProviderId = 'late-active-provider';
		const activeStore = teardown.add(new AutomationStore(providerAutomationStorageKey(activeProviderId), storage, new NullLogService(), NullTelemetryService, automationStorage));
		const activeAutomation = await activeStore.createAutomation({
			name: 'Active recovery',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId: activeProviderId, sessionTypeId: 'late', isolation: { kind: 'default' } },
		});
		await activeStore.recordRunStart(activeAutomation.id, 'manual', 1);
		addProvider(upcastPartial<ISessionsProvider>({ id: activeProviderId, order: 1, automations: activeStore }));
		await service.waitForMigrationForTesting();

		service.stopStaleRunRecovery();
		const inactiveProviderId = 'late-inactive-provider';
		const inactiveStore = teardown.add(new AutomationStore(providerAutomationStorageKey(inactiveProviderId), storage, new NullLogService(), NullTelemetryService, automationStorage));
		const inactiveAutomation = await inactiveStore.createAutomation({
			name: 'Inactive recovery',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId: inactiveProviderId, sessionTypeId: 'late', isolation: { kind: 'default' } },
		});
		await inactiveStore.recordRunStart(inactiveAutomation.id, 'manual', 1);
		addProvider(upcastPartial<ISessionsProvider>({ id: inactiveProviderId, order: 2, automations: inactiveStore }));
		await service.waitForMigrationForTesting();

		assert.deepStrictEqual({
			activeStatuses: activeStore.runs.get().map(run => run.status),
			inactiveStatuses: inactiveStore.runs.get().map(run => run.status),
		}, {
			activeStatuses: ['failed'],
			inactiveStatuses: ['pending'],
		});
	});

	test('migrates before recovering a provider added while initial recovery is queued', async () => {
		const lateProviderId = 'late-provider';
		const legacy = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [{
				id: 'automation-1',
				name: 'Late provider',
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: lateProviderId, sessionTypeId: 'late', isolation: { kind: 'default' } },
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}],
			runs: [{
				id: 'run-1',
				automationId: 'automation-1',
				status: 'running',
				trigger: 'manual',
				startedAt: '2026-01-01T00:00:00.000Z',
				leaderWindowId: 1,
			}],
		});
		const { service, storage, automationStorage, addProvider } = createService(legacy);
		const recovery = service.startStaleRunRecovery('Recovered after restart.');
		const lateStore = teardown.add(new AutomationStore(providerAutomationStorageKey(lateProviderId), storage, new NullLogService(), NullTelemetryService, automationStorage));
		addProvider(upcastPartial<ISessionsProvider>({ id: lateProviderId, order: 1, automations: lateStore }));

		await recovery;
		await service.waitForMigrationForTesting();

		assert.deepStrictEqual(lateStore.runs.get().map(run => ({
			id: run.id,
			status: run.status,
			errorMessage: run.errorMessage,
		})), [{
			id: 'run-1',
			status: 'failed',
			errorMessage: 'Recovered after restart.',
		}]);
	});

	test('continues stale-run recovery when a provider store fails', async () => {
		const legacy = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [{
				id: 'automation-1',
				name: 'Legacy',
				prompt: 'prompt',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'workspace', folderUri: FOLDER.toJSON(), sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}],
			runs: [{
				id: 'run-1',
				automationId: 'automation-1',
				status: 'running',
				trigger: 'manual',
				startedAt: '2026-01-01T00:00:00.000Z',
				leaderWindowId: 1,
			}],
		});
		const { service } = createService(legacy, undefined, 'staleRunRecovery');

		await service.markStaleRunsFailed('Recovered after restart.');

		assert.deepStrictEqual(service.runs.get().map(run => ({
			id: run.id,
			status: run.status,
			errorMessage: run.errorMessage,
		})), [{
			id: 'run-1',
			status: 'failed',
			errorMessage: 'Recovered after restart.',
		}]);
	});

	test('continues migrating after an Automation import fails and surfaces the failure', async () => {
		const createAutomation = (id: string) => ({
			id,
			name: id,
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
			enabled: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		});
		const legacy = JSON.stringify({
			schemaVersion: 3,
			revision: 1,
			automations: [createAutomation('automation-1'), createAutomation('automation-2')],
			runs: [],
		});
		const { service, providerStore, storage } = createService(legacy, undefined, 'migration');

		await assert.rejects(service.waitForMigrationForTesting(), /Failed to migrate 1 Automation snapshot/);

		assert.deepStrictEqual({
			providerAutomationIds: providerStore.automations.get().map(automation => automation.id),
			legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).automations.map((automation: { id: string }) => automation.id),
		}, {
			providerAutomationIds: ['automation-2'],
			legacyAutomationIds: ['automation-1'],
		});
	});

	test('does not complete migration from a newer legacy ledger schema', async () => {
		const futureLedger = JSON.stringify({
			schemaVersion: 999,
			revision: 7,
			automations: [{ id: 'future-content' }],
			runs: [],
		});
		const { service, providerStore, storage } = createService(futureLedger);

		await assert.rejects(service.waitForMigrationForTesting(), /cannot be migrated safely/);

		assert.deepStrictEqual({
			providerAutomations: providerStore.automations.get(),
			persisted: storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION),
		}, {
			providerAutomations: [],
			persisted: futureLedger,
		});
	});
});
