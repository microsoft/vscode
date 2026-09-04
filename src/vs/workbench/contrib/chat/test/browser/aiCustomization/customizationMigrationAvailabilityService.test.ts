/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ICustomizationMigrationAvailabilityService } from '../../../browser/aiCustomization/customizationMigrationAvailabilityService.js';
import { CUSTOMIZATION_MIGRATION_CATEGORIES } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { CustomizationMigration, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, ICustomizationMigrationService, McpServerCustomizationMigration } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { MockPromptsService } from '../../common/promptSyntax/service/mockPromptsService.js';

class TestMigrationService extends mock<ICustomizationMigrationService>() {
	readonly calls: FileCustomizationMigrationType[] = [];
	private readonly queuedResponses: Promise<FileCustomizationMigration>[] = [];

	enqueue(response: Promise<FileCustomizationMigration>): void {
		this.queuedResponses.push(response);
	}

	override computeMigration(sessionResource: URI, type: FileCustomizationMigrationType): Promise<FileCustomizationMigration>;
	override computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers): Promise<McpServerCustomizationMigration>;
	override computeMigration(_sessionResource: URI, type: CustomizationMigrationType): Promise<CustomizationMigration> {
		if (type === CustomizationMigrationType.McpServers) {
			throw new Error('MCP migrations are not expected.');
		}
		this.calls.push(type);
		return this.queuedResponses.shift() ?? Promise.resolve(createMigration(type, 1));
	}
}

function createMigration(type: FileCustomizationMigrationType, count: number): FileCustomizationMigration {
	return {
		type,
		files: Array.from({ length: count }, (_, index) => URI.file(`/migration/${type}/${index}`)),
		candidates: [],
	};
}

suite('CustomizationMigrationAvailabilityService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(configuration: Record<string, unknown>, migrationService = new TestMigrationService()) {
		const configurationService = new TestConfigurationService(configuration);
		store.add(configurationService.onDidChangeConfigurationEmitter);

		const harnessSlashCommandsChanged = store.add(new Emitter<{ readonly sessionType: string }>());
		const harnessCustomAgentsChanged = store.add(new Emitter<{ readonly sessionType: string }>());
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = observableValue(this, 'agent-host-copilot');
			override readonly activeSessionResource = observableValue(this, URI.parse('agent-host-copilot:/session'));
			override readonly availableHarnesses = constObservable([]);
			override readonly onDidChangeSlashCommands = harnessSlashCommandsChanged.event;
			override readonly onDidChangeCustomAgents = harnessCustomAgentsChanged.event;
		};

		const promptSlashCommandsChanged = store.add(new Emitter<void>());
		const promptCustomAgentsChanged = store.add(new Emitter<void>());
		const promptInstructionsChanged = store.add(new Emitter<void>());
		const promptAgentInstructionsChanged = store.add(new Emitter<void>());
		const promptsService = new class extends MockPromptsService {
			override readonly onDidChangeSlashCommands = promptSlashCommandsChanged.event;
			override readonly onDidChangeCustomAgents = promptCustomAgentsChanged.event;
			override readonly onDidChangeInstructions = promptInstructionsChanged.event;
			override readonly onDidChangeAgentInstructions = promptAgentInstructionsChanged.event;
		};

		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === ICustomizationMigrationAvailabilityService)?.[1];
		assert.ok(descriptor);
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IConfigurationService, configurationService],
			[ICustomizationMigrationService, migrationService],
			[ICustomizationHarnessService, harnessService],
			[IPromptsService, promptsService],
			[ILogService, new NullLogService()],
			[ICustomizationMigrationAvailabilityService, new SyncDescriptor(descriptor.ctor, descriptor.staticArguments)],
		)));
		const service = store.add(instantiationService.get(ICustomizationMigrationAvailabilityService) as ICustomizationMigrationAvailabilityService & IDisposable);

		return {
			configurationService,
			migrationService,
			service,
			promptChanges: [
				promptSlashCommandsChanged,
				promptCustomAgentsChanged,
				promptInstructionsChanged,
				promptAgentInstructionsChanged,
			],
		};
	}

	function fireConfigurationChange(configurationService: TestConfigurationService, key: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: candidate => candidate === key,
		}));
	}

	async function waitFor(predicate: () => boolean): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (predicate()) {
				return;
			}
			await timeout(0);
		}
		assert.fail('Timed out waiting for customization migration availability refresh.');
	}

	test('skips discovery while disabled and respects every category gate', async () => {
		const testObject = createService({
			[ChatConfiguration.CustomizationEntryPoints]: false,
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
			[ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: false,
			[ChatConfiguration.ChatCustomizationsLocationsMigrationEnabled]: true,
		});

		await timeout(0);
		assert.deepStrictEqual({
			calls: testObject.migrationService.calls,
			count: testObject.service.candidateCount.get(),
		}, {
			calls: [],
			count: 0,
		});

		await testObject.configurationService.setUserConfiguration(ChatConfiguration.CustomizationEntryPoints, true);
		fireConfigurationChange(testObject.configurationService, ChatConfiguration.CustomizationEntryPoints);
		await waitFor(() => testObject.migrationService.calls.length === 2);
		assert.deepStrictEqual({
			calls: testObject.migrationService.calls,
			count: testObject.service.candidateCount.get(),
		}, {
			calls: [CustomizationMigrationType.PromptFiles, CustomizationMigrationType.ConfiguredLocations],
			count: 2,
		});

		await testObject.configurationService.setUserConfiguration(ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled, true);
		fireConfigurationChange(testObject.configurationService, ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled);
		await waitFor(() => testObject.migrationService.calls.length === 5);
		assert.deepStrictEqual({
			calls: testObject.migrationService.calls.slice(2),
			count: testObject.service.candidateCount.get(),
		}, {
			calls: [CustomizationMigrationType.PromptFiles, CustomizationMigrationType.UserData, CustomizationMigrationType.ConfiguredLocations],
			count: 3,
		});
	});

	test('refreshes for configured-location and prompt source changes', async () => {
		const testObject = createService({
			[ChatConfiguration.CustomizationEntryPoints]: true,
			[ChatConfiguration.ChatCustomizationsLocationsMigrationEnabled]: true,
		});
		await waitFor(() => testObject.migrationService.calls.length === 1);

		const configuredLocationSetting = CUSTOMIZATION_MIGRATION_CATEGORIES
			.find(category => category.migrationType === CustomizationMigrationType.ConfiguredLocations)
			?.configurationSettingIds?.[0];
		assert.ok(configuredLocationSetting);
		fireConfigurationChange(testObject.configurationService, configuredLocationSetting);
		await waitFor(() => testObject.migrationService.calls.length === 2);

		for (const promptChange of testObject.promptChanges) {
			promptChange.fire();
			await waitFor(() => testObject.migrationService.calls.length === 3 + testObject.promptChanges.indexOf(promptChange));
		}

		assert.deepStrictEqual(testObject.migrationService.calls, Array.from(
			{ length: 6 },
			() => CustomizationMigrationType.ConfiguredLocations,
		));
	});

	test('rejects stale asynchronous migration results', async () => {
		const migrationService = new TestMigrationService();
		const first = new DeferredPromise<FileCustomizationMigration>();
		const second = new DeferredPromise<FileCustomizationMigration>();
		migrationService.enqueue(first.p);
		migrationService.enqueue(second.p);
		const testObject = createService({
			[ChatConfiguration.CustomizationEntryPoints]: true,
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
		}, migrationService);

		await waitFor(() => migrationService.calls.length === 1);
		testObject.promptChanges[0].fire();
		await waitFor(() => migrationService.calls.length === 2);
		second.complete(createMigration(CustomizationMigrationType.PromptFiles, 2));
		await waitFor(() => testObject.service.candidateCount.get() === 2);
		first.complete(createMigration(CustomizationMigrationType.PromptFiles, 1));
		await timeout(0);

		assert.strictEqual(testObject.service.candidateCount.get(), 2);
	});
});
