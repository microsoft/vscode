/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { autorun, type ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
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
import { AutomationActiveRunError, AutomationCatalogueState } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
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

class MutableCatalogueAutomationStore extends AutomationStore {
	private readonly state = observableValue<AutomationCatalogueState>(this, 'ready');
	override readonly catalogueState = this.state;

	setCatalogueState(state: AutomationCatalogueState, tx?: ITransaction): void {
		this.state.set(state, tx);
	}
}

class MigrationDeferringAutomationStore extends AutomationStore {
	recoveryCalls = 0;
	migrationCalls = 0;

	override async markStaleRunsFailed(reason: string): Promise<void> {
		this.recoveryCalls++;
		await super.markStaleRunsFailed(reason);
	}

	async completeMigration(): Promise<void> {
		this.migrationCalls++;
		const activeRun = this.runs.get().find(run => run.status === 'pending' || run.status === 'running');
		if (activeRun) {
			throw new AutomationActiveRunError(activeRun.automationId, activeRun.id);
		}
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

class AcknowledgingMigrationAutomationStore extends AutomationStore {
	readonly acknowledgedAutomationIds: string[] = [];

	async acknowledgeAutomationSnapshotImported(snapshot: IAutomation): Promise<void> {
		this.acknowledgedAutomationIds.push(snapshot.automation.id);
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

	function createService(
		legacyRaw?: string,
		providerRaw?: string,
		providerFailure?: 'staleRunRecovery' | 'migration' | 'transfer' | 'acknowledgement' | 'concurrentMigrationUpdate' | 'concurrentMigrationDelete' | 'concurrentMigrationRun' | 'continuousMigrationUpdate' | 'concurrentTransferRun' | 'destinationDeleteDuringRollback',
		registerDefaultProvider = true,
		initialProvidersSettled = true,
	): {
		readonly service: ProviderAutomationService;
		readonly providerStore: AutomationStore;
		readonly storage: InMemoryStorageService;
		readonly automationStorage: TestAutomationStorageService;
		readonly addProvider: (provider: ISessionsProvider) => void;
		readonly settleInitialProviders: () => void;
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
			case 'acknowledgement':
				providerStore = new AcknowledgingMigrationAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
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
		const registeredProviders: ISessionsProvider[] = registerDefaultProvider ? [provider] : [];
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
		const providersSettled = observableValue('initialProvidersSettled', initialProvidersSettled);
		const service = teardown.add(instantiationService.createInstance(ProviderAutomationService, providersSettled));
		return {
			service,
			providerStore,
			storage,
			automationStorage,
			addProvider: addedProvider => {
				registeredProviders.push(addedProvider);
				providersChanged.fire({ added: [addedProvider], removed: [] });
			},
			settleInitialProviders: () => providersSettled.set(true, undefined),
		};
	}

	test('aggregates provider catalogue state', () => {
		const { service, storage, automationStorage, addProvider } = createService();
		const emissions: AutomationCatalogueState[] = [];
		teardown.add(autorun(reader => emissions.push(service.catalogueState.read(reader))));
		const store = teardown.add(new MutableCatalogueAutomationStore(
			providerAutomationStorageKey('stateful-provider'),
			storage,
			new NullLogService(),
			NullTelemetryService,
			automationStorage,
		));
		store.setCatalogueState('loading');
		addProvider(upcastPartial<ISessionsProvider>({ id: 'stateful-provider', order: 1, automations: store }));
		const loading = service.catalogueState.get();
		store.setCatalogueState('error');
		const error = service.catalogueState.get();
		store.setCatalogueState('unavailable');
		const unavailable = service.catalogueState.get();
		store.setCatalogueState('ready');
		const ready = service.catalogueState.get();

		assert.deepStrictEqual({ loading, error, unavailable, ready }, {
			loading: 'loading',
			error: 'error',
			unavailable: 'unavailable',
			ready: 'ready',
		});
		assert.deepStrictEqual(emissions, ['ready', 'loading', 'error', 'unavailable', 'ready']);
	});

	test('settles a provider-less catalogue after initial provider contributions complete', () => {
		const { service, providerStore, addProvider, settleInitialProviders } = createService(undefined, undefined, undefined, false, false);
		const beforeSettlement = service.catalogueState.get();
		settleInitialProviders();
		const afterSettlement = service.catalogueState.get();
		addProvider(upcastPartial<ISessionsProvider>({ id: PROVIDER_ID, order: 0, automations: providerStore }));

		assert.deepStrictEqual({
			beforeSettlement,
			afterSettlement,
			afterRegistration: service.catalogueState.get(),
		}, {
			beforeSettlement: 'loading',
			afterSettlement: 'ready',
			afterRegistration: 'ready',
		});
	});

	test('keeps registered providers loading until initial contributions settle', () => {
		const { service, providerStore, addProvider, settleInitialProviders } = createService(undefined, undefined, undefined, false, false);
		const emissions: AutomationCatalogueState[] = [];
		teardown.add(autorun(reader => emissions.push(service.catalogueState.read(reader))));
		addProvider(upcastPartial<ISessionsProvider>({ id: PROVIDER_ID, order: 0, automations: providerStore }));
		const beforeSettlement = service.catalogueState.get();
		settleInitialProviders();

		assert.deepStrictEqual({ beforeSettlement, emissions }, {
			beforeSettlement: 'loading',
			emissions: ['loading', 'ready'],
		});
	});

	test('legacy rows do not make initial provider discovery authoritative', async () => {
		const { service, settleInitialProviders } = createService(undefined, undefined, undefined, false, false);
		await service.createAutomation({
			name: 'Legacy only',
			prompt: 'Review changes.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, isolation: { kind: 'default' } },
		});
		const beforeSettlement = service.catalogueState.get();
		settleInitialProviders();

		assert.deepStrictEqual({
			beforeSettlement,
			afterSettlement: service.catalogueState.get(),
			names: service.automations.get().map(automation => automation.name),
		}, {
			beforeSettlement: 'loading',
			afterSettlement: 'ready',
			names: ['Legacy only'],
		});
	});

	test('aggregates error, loading, and unavailable states independently of provider order', () => {
		const { service, storage, automationStorage, addProvider } = createService();
		const first = teardown.add(new MutableCatalogueAutomationStore('first', storage, new NullLogService(), NullTelemetryService, automationStorage));
		const second = teardown.add(new MutableCatalogueAutomationStore('second', storage, new NullLogService(), NullTelemetryService, automationStorage));
		addProvider(upcastPartial<ISessionsProvider>({ id: 'first', order: 1, automations: first }));
		addProvider(upcastPartial<ISessionsProvider>({ id: 'second', order: 2, automations: second }));
		let observedState: AutomationCatalogueState = 'ready';
		teardown.add(autorun(reader => observedState = service.catalogueState.read(reader)));
		const states: readonly AutomationCatalogueState[] = ['ready', 'unavailable', 'loading', 'error'];
		const actual = states.map(firstState => states.map(secondState => {
			transaction(tx => {
				first.setCatalogueState(firstState, tx);
				second.setCatalogueState(secondState, tx);
			});
			return observedState;
		}));

		assert.deepStrictEqual(actual, [
			['ready', 'unavailable', 'loading', 'error'],
			['unavailable', 'unavailable', 'loading', 'error'],
			['loading', 'loading', 'loading', 'error'],
			['error', 'error', 'error', 'error'],
		]);
	});

	test('does not let provider loading mask a legacy catalogue error', () => {
		const { service, storage, automationStorage, addProvider } = createService('{', undefined, undefined, false);
		const emissions: AutomationCatalogueState[] = [];
		teardown.add(autorun(reader => emissions.push(service.catalogueState.read(reader))));
		const store = teardown.add(new MutableCatalogueAutomationStore(
			providerAutomationStorageKey('loading-provider'),
			storage,
			new NullLogService(),
			NullTelemetryService,
			automationStorage,
		));
		store.setCatalogueState('loading');
		addProvider(upcastPartial<ISessionsProvider>({ id: 'loading-provider', order: 1, automations: store }));

		assert.deepStrictEqual({
			catalogueState: service.catalogueState.get(),
			emissions,
		}, {
			catalogueState: 'error',
			emissions: ['error'],
		});
	});

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

	test('an unavailable remote catalogue does not block local automation operations', async () => {
		const { service, providerStore, storage, automationStorage, addProvider } = createService();
		const remote = teardown.add(new MutableCatalogueAutomationStore('remote', storage, new NullLogService(), NullTelemetryService, automationStorage));
		remote.setCatalogueState('unavailable');
		addProvider(upcastPartial<ISessionsProvider>({ id: 'remote', order: 1, automations: remote }));

		const created = await service.createAutomation({
			name: 'Local review',
			prompt: 'Review local changes.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
		});
		await service.updateAutomation(created.id, { name: 'Updated local review' });
		const claim = await service.recordRunStart(created.id, 'manual', 1);

		assert.deepStrictEqual({
			catalogueState: service.catalogueState.get(),
			localNames: providerStore.automations.get().map(automation => automation.name),
			remoteAutomations: remote.automations.get(),
			canRun: service.canRunAutomation(created.id),
			canUpdate: service.canUpdateAutomation(created.id),
			claimed: claim.claimed,
			activeRunId: providerStore.getActiveRunFor(created.id)?.id,
		}, {
			catalogueState: 'unavailable',
			localNames: ['Updated local review'],
			remoteAutomations: [],
			canRun: true,
			canUpdate: true,
			claimed: true,
			activeRunId: claim.run.id,
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
		await service.updateRun(claim.run.id, { status: 'completed', completedAt: '2026-01-01T00:01:00.000Z' });

		const transferToProvider = await service.updateAutomationIfUnchanged(created.id, { target: providerTarget }, created);
		const afterProviderTransfer = {
			result: transferToProvider.kind,
			providerTarget: providerStore.getAutomation(created.id)?.target,
			providerRunIds: providerStore.runs.get().map(run => run.id),
			legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).automations.map((automation: { id: string }) => automation.id),
		};

		await service.updateAutomation(created.id, { target: legacyTarget });
		const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!);
		const finalLegacyTarget = legacyLedger.automations.find((automation: { id: string }) => automation.id === created.id)?.target;

		assert.deepStrictEqual({
			claimRunId: claim.run.id,
			afterProviderTransfer,
			finalProviderAutomation: providerStore.getAutomation(created.id),
			finalProviderRunIds: providerStore.runs.get().map(run => run.id),
			finalLegacyTarget: finalLegacyTarget ? {
				...finalLegacyTarget,
				folderUri: URI.revive(finalLegacyTarget.folderUri).toString(),
			} : undefined,
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
				folderUri: FOLDER.toString(),
				providerId: 'provider-without-storage',
				sessionTypeId: 'other',
				isolation: { kind: 'default' },
			},
			finalLegacyRunIds: [claim.run.id],
		});
	});

	test('does not change storage ownership while an Automation run is active', async () => {
		const { service, providerStore, storage } = createService();
		const legacyTarget = { kind: 'workspace', folderUri: FOLDER, providerId: 'provider-without-storage', sessionTypeId: 'other', isolation: { kind: 'default' } } as const;
		const providerTarget = { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } } as const;
		const created = await service.createAutomation({
			name: 'Active',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: legacyTarget,
		});
		await service.recordRunStart(created.id, 'manual', 1);

		await assert.rejects(service.updateAutomation(created.id, { target: providerTarget }), /Wait for the active run to finish/);
		const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!);

		assert.deepStrictEqual({
			providerAutomation: providerStore.getAutomation(created.id),
			legacyTarget: URI.revive(legacyLedger.automations[0].target.folderUri).toString(),
			legacyProviderId: legacyLedger.automations[0].target.providerId,
			legacyRunStatus: legacyLedger.runs[0].status,
		}, {
			providerAutomation: undefined,
			legacyTarget: FOLDER.toString(),
			legacyProviderId: 'provider-without-storage',
			legacyRunStatus: 'pending',
		});
	});

	test('allows unrelated edits while an active run defers storage migration', async () => {
		const { service, providerStore, storage, automationStorage } = createService();
		await service.waitForMigrationForTesting();
		const legacy = teardown.add(new AutomationStore(AUTOMATION_STORAGE_KEY, storage, new NullLogService(), NullTelemetryService, automationStorage));
		const target = { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } } as const;
		const created = await legacy.createAutomation({
			name: 'Active',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target,
		});
		await legacy.recordRunStart(created.id, 'manual', 1);

		const updated = await service.updateAutomation(created.id, { name: 'Renamed', target });

		assert.deepStrictEqual({
			updatedName: updated.name,
			providerAutomation: providerStore.getAutomation(created.id),
			legacyName: service.getAutomation(created.id)?.name,
			activeRunStatus: service.getActiveRunFor(created.id)?.status,
		}, {
			updatedName: 'Renamed',
			providerAutomation: undefined,
			legacyName: 'Renamed',
			activeRunStatus: 'pending',
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
		await service.recordRunStart(created.id, 'manual', 1);

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

	test('restores the source target when a run starts during ownership transfer', async () => {
		const { service, providerStore, storage } = createService(undefined, undefined, 'concurrentTransferRun');
		const legacyTarget = { kind: 'workspace', folderUri: FOLDER, providerId: 'provider-without-storage', sessionTypeId: 'other', isolation: { kind: 'default' } } as const;
		const created = await service.createAutomation({
			name: 'Legacy',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: legacyTarget,
			modelId: 'legacy-model',
			mode: 'ask',
			permissionLevel: 'autopilot',
		});

		await assert.rejects(service.updateAutomation(created.id, {
			name: 'Updated',
			prompt: 'Updated prompt',
			schedule: { interval: 'daily', scheduleHour: 8, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: 'default' } },
			modelId: 'new-model',
			mode: 'plan',
			permissionLevel: 'autoApprove',
			enabled: false,
		}), /Wait for the active run to finish/);
		const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!);
		const restoredTarget = legacyLedger.automations[0].target;

		assert.deepStrictEqual({
			providerAutomation: providerStore.getAutomation(created.id),
			legacyName: legacyLedger.automations[0].name,
			legacyPrompt: legacyLedger.automations[0].prompt,
			legacySchedule: legacyLedger.automations[0].schedule,
			legacyTarget: { ...restoredTarget, folderUri: URI.revive(restoredTarget.folderUri).toString() },
			legacyModelId: legacyLedger.automations[0].modelId,
			legacyMode: legacyLedger.automations[0].mode,
			legacyPermissionLevel: legacyLedger.automations[0].permissionLevel,
			legacyEnabled: legacyLedger.automations[0].enabled,
			legacyRunStatuses: legacyLedger.runs.map((run: { status: string }) => run.status),
		}, {
			providerAutomation: undefined,
			legacyName: 'Legacy',
			legacyPrompt: 'prompt',
			legacySchedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			legacyTarget: { ...legacyTarget, folderUri: FOLDER.toString() },
			legacyModelId: 'legacy-model',
			legacyMode: 'ask',
			legacyPermissionLevel: 'autopilot',
			legacyEnabled: true,
			legacyRunStatuses: ['pending'],
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
		const { service, providerStore, storage } = createService(legacy, undefined, 'acknowledgement');

		await service.waitForMigrationForTesting();

		assert.deepStrictEqual({
			automation: providerStore.getAutomation('automation-1'),
			acknowledgedAutomationIds: (providerStore as AcknowledgingMigrationAutomationStore).acknowledgedAutomationIds,
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
			acknowledgedAutomationIds: ['automation-1'],
			runIds: ['run-1'],
			legacy: { schemaVersion: 4, revision: 2, automations: [], runs: [] },
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

	test('recovers a late provider before completing its migration', async () => {
		const { service, storage, automationStorage, addProvider } = createService();
		await service.startStaleRunRecovery('Recovered after restart.');
		const providerId = 'late-migrating-provider';
		const store = teardown.add(new MigrationDeferringAutomationStore(providerAutomationStorageKey(providerId), storage, new NullLogService(), NullTelemetryService, automationStorage));
		const automation = await store.createAutomation({
			name: 'Late migration',
			prompt: 'prompt',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: FOLDER, providerId, sessionTypeId: 'late', isolation: { kind: 'default' } },
		});
		await store.recordRunStart(automation.id, 'manual', 1);

		addProvider(upcastPartial<ISessionsProvider>({ id: providerId, order: 1, automations: store }));
		await service.waitForMigrationForTesting();

		assert.deepStrictEqual({
			runStatuses: store.runs.get().map(run => run.status),
			recoveryCalls: store.recoveryCalls,
			migrationCalls: store.migrationCalls,
		}, {
			runStatuses: ['failed'],
			recoveryCalls: 1,
			migrationCalls: 1,
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
		const catalogueState = service.catalogueState.get();

		await assert.rejects(service.waitForMigrationForTesting(), /cannot be migrated safely/);

		assert.deepStrictEqual({
			catalogueState,
			providerAutomations: providerStore.automations.get(),
			persisted: storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION),
		}, {
			catalogueState: 'error',
			providerAutomations: [],
			persisted: futureLedger,
		});
	});
});
