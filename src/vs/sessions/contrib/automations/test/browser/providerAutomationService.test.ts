/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAutomation, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
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
	override async importAutomation(automation: IAutomation, runs: readonly IAutomationRun[]): Promise<void> {
		if (automation.id === 'automation-1') {
			throw new Error('Import failed.');
		}
		await super.importAutomation(automation, runs);
	}
}

suite('ProviderAutomationService', () => {
	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(legacyRaw?: string, providerRaw?: string, providerFailure?: 'staleRunRecovery' | 'migration'): {
		readonly service: ProviderAutomationService;
		readonly providerStore: AutomationStore;
		readonly storage: InMemoryStorageService;
	} {
		const storage = teardown.add(new InMemoryStorageService());
		if (legacyRaw) {
			storage.store(AUTOMATION_STORAGE_KEY, legacyRaw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		if (providerRaw) {
			storage.store(providerAutomationStorageKey(PROVIDER_ID), providerRaw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		const automationStorage = new TestAutomationStorageService(storage);
		const providerStore = teardown.add(providerFailure === 'staleRunRecovery'
			? new FailingStaleRunRecoveryAutomationStore(providerAutomationStorageKey(PROVIDER_ID), storage, new NullLogService(), NullTelemetryService, automationStorage)
			: providerFailure === 'migration'
				? new PartiallyFailingMigrationAutomationStore(providerAutomationStorageKey(PROVIDER_ID), storage, new NullLogService(), NullTelemetryService, automationStorage)
			: new AutomationStore(providerAutomationStorageKey(PROVIDER_ID), storage, new NullLogService(), NullTelemetryService, automationStorage));
		const provider = upcastPartial<ISessionsProvider>({
			id: PROVIDER_ID,
			order: 0,
			automations: providerStore,
		});
		const providers = upcastPartial<ISessionsProvidersService>({
			onDidChangeProviders: Event.None,
			getProviders: () => [provider],
			getProvider: <T extends ISessionsProvider>(providerId: string) => providerId === PROVIDER_ID ? provider as T : undefined,
		});
		const instantiationService = teardown.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IAutomationStorageService, automationStorage);
		instantiationService.stub(ISessionsProvidersService, providers);
		instantiationService.stub(IInstantiationService, instantiationService);
		const service = teardown.add(instantiationService.createInstance(ProviderAutomationService));
		return { service, providerStore, storage };
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

	test('merges missing runs when the provider already has the Automation', async () => {
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
			providerRunIds: ['legacy-run', 'provider-run'],
			legacy: { schemaVersion: 3, revision: 2, automations: [], runs: [] },
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

	test('continues migrating after an Automation import fails', async () => {
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

		await service.waitForMigrationForTesting();

		assert.deepStrictEqual({
			providerAutomationIds: providerStore.automations.get().map(automation => automation.id),
			legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)!).automations.map((automation: { id: string }) => automation.id),
		}, {
			providerAutomationIds: ['automation-2'],
			legacyAutomationIds: ['automation-1'],
		});
	});
});
