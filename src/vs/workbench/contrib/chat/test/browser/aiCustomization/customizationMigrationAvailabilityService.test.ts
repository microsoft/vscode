/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { IMcpService, IMcpServer, IMcpWorkbenchService, IWorkbenchMcpServer, McpCollectionDefinition, McpServerDefinition, McpServerTransportType, McpServerTrust } from '../../../../mcp/common/mcpTypes.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { ICustomizationMigrationAvailabilityService } from '../../../browser/aiCustomization/customizationMigrationAvailabilityService.js';
import { CUSTOMIZATION_MIGRATION_CATEGORIES } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { CustomizationMigration, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, ICustomizationMigrationService, IMcpServerCustomizationMigrationCandidate, McpServerCustomizationMigration, MigratableConfiguration } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { MockPromptsService } from '../../common/promptSyntax/service/mockPromptsService.js';

class TestMigrationService extends mock<ICustomizationMigrationService>() {
	readonly calls: CustomizationMigrationType[] = [];
	private readonly queuedResponses: Promise<CustomizationMigration>[] = [];
	private readonly defaultCounts = new Map<CustomizationMigrationType, number>();

	enqueue(response: Promise<CustomizationMigration>): void {
		this.queuedResponses.push(response);
	}

	setDefaultCount(type: CustomizationMigrationType, count: number): void {
		this.defaultCounts.set(type, count);
	}

	override computeMigration(sessionResource: URI, type: FileCustomizationMigrationType): Promise<FileCustomizationMigration>;
	override computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers): Promise<McpServerCustomizationMigration>;
	override computeMigration(_sessionResource: URI, type: CustomizationMigrationType): Promise<CustomizationMigration> {
		this.calls.push(type);
		const queuedResponse = this.queuedResponses.shift();
		if (queuedResponse) {
			return queuedResponse;
		}
		const count = this.defaultCounts.get(type) ?? 1;
		switch (type) {
			case CustomizationMigrationType.McpServers:
				return Promise.resolve(createMcpMigration(count));
			case CustomizationMigrationType.UserData:
				return Promise.resolve(createMigration(CustomizationMigrationType.UserData, count));
			case CustomizationMigrationType.PromptFiles:
				return Promise.resolve(createMigration(CustomizationMigrationType.PromptFiles, count));
			case CustomizationMigrationType.ConfiguredLocations:
				return Promise.resolve(createMigration(CustomizationMigrationType.ConfiguredLocations, count));
		}
	}
}

function createMigration(type: FileCustomizationMigrationType, count: number): FileCustomizationMigration {
	const candidates = Array.from({ length: count }, (_, index) => createFileMigrationCandidate(type, index));
	return {
		type,
		files: candidates.map(candidate => candidate.uri),
		candidates,
	};
}

function createFileMigrationCandidate(type: FileCustomizationMigrationType, index: number): MigratableConfiguration {
	const uri = URI.file(`/migration/${type}/${index}`);
	switch (type) {
		case CustomizationMigrationType.PromptFiles:
			return { uri, type: PromptsType.prompt, storage: index % 2 === 0 ? PromptsStorage.local : PromptsStorage.user, name: `prompt-${index}` };
		case CustomizationMigrationType.UserData:
			return { uri, type: PromptsType.agent, storage: PromptsStorage.user, source: PromptFileSource.UserData, name: `agent-${index}` };
		case CustomizationMigrationType.ConfiguredLocations:
			return { uri, type: PromptsType.skill, storage: PromptsStorage.local, source: PromptFileSource.ConfigWorkspace, name: `skill-${index}` };
	}
}

function createMcpMigration(count: number): McpServerCustomizationMigration {
	const candidates: IMcpServerCustomizationMigrationCandidate[] = Array.from({ length: count }, (_, index) => ({
		type: CustomizationMigrationType.McpServers,
		id: `mcp-${index}`,
		name: `MCP ${index}`,
		sourceUri: URI.file('/workspace/.vscode/mcp.json'),
		targetUri: URI.file('/workspace/.mcp.json'),
		projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
	}));
	return {
		type: CustomizationMigrationType.McpServers,
		servers: candidates.map(candidate => ({ id: candidate.id, name: candidate.name, supported: true })),
		candidates,
		discoveryComplete: true,
		coverage: {
			restrictedByMcpAccess: false,
			restrictedByCustomizationPolicy: false,
		},
	};
}

function createRuntimeMcpServer(id: string) {
	const definition: McpServerDefinition = {
		id,
		label: id,
		cacheNonce: '1',
		launch: { type: McpServerTransportType.Stdio, command: 'node', args: [], env: {}, envFile: undefined, cwd: undefined, sandbox: undefined },
	};
	const collection: McpCollectionDefinition = {
		id: `collection.${id}`,
		label: 'Test Collection',
		remoteAuthority: null,
		serverDefinitions: constObservable([definition]),
		trustBehavior: McpServerTrust.Kind.Trusted,
		scope: StorageScope.WORKSPACE,
		configTarget: ConfigurationTarget.WORKSPACE,
		order: 0,
	};
	const definitions = observableValue<{ server: McpServerDefinition | undefined; collection: McpCollectionDefinition | undefined }>('mcpDefinitions', { server: definition, collection });
	const enablement = observableValue<ContributionEnablementState>('mcpEnablement', ContributionEnablementState.EnabledProfile);
	const server = upcastPartial<IMcpServer>({
		definition: { id, label: id },
		collection: { id: collection.id, label: collection.label, order: collection.order },
		enablement,
		readDefinitions: () => definitions,
	});
	return { server, definitions, enablement };
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

		const mcpServers = observableValue<readonly IMcpServer[]>('mcpServers', []);
		const mcpService = new class extends mock<IMcpService>() {
			override readonly servers = mcpServers;
		};

		const mcpWorkbenchChanged = store.add(new Emitter<IWorkbenchMcpServer | undefined>());
		const mcpWorkbenchReset = store.add(new Emitter<void>());
		const mcpWorkbenchService = new class extends mock<IMcpWorkbenchService>() {
			override readonly onChange = mcpWorkbenchChanged.event;
			override readonly onReset = mcpWorkbenchReset.event;
			override readonly local = [];
			override readonly whenInitialLocalMcpServersLoaded = Promise.resolve();
		};

		const agentHostCustomizationsChanged = store.add(new Emitter<void>());
		const agentHostCustomizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomAgents = Event.None;
			override readonly onDidChangeCustomizations = agentHostCustomizationsChanged.event;
		};

		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === ICustomizationMigrationAvailabilityService)?.[1];
		assert.ok(descriptor);
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IConfigurationService, configurationService],
			[ICustomizationMigrationService, migrationService],
			[ICustomizationHarnessService, harnessService],
			[IPromptsService, promptsService],
			[IMcpService, mcpService],
			[IMcpWorkbenchService, mcpWorkbenchService],
			[IAgentHostCustomizationService, agentHostCustomizationService],
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
			mcpServers,
			mcpWorkbenchChanged,
			mcpWorkbenchReset,
			agentHostCustomizationsChanged,
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

	function fireMcpRefreshSignals(testObject: ReturnType<typeof createService>): void {
		const runtimeServer = createRuntimeMcpServer(`runtime-${testObject.migrationService.calls.length}`);
		testObject.mcpServers.set([runtimeServer.server], undefined);
		runtimeServer.enablement.set(ContributionEnablementState.DisabledProfile, undefined);
		testObject.mcpWorkbenchChanged.fire(undefined);
		testObject.mcpWorkbenchReset.fire();
		testObject.agentHostCustomizationsChanged.fire();
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

	test('counts mixed file and MCP migration candidates', async () => {
		const migrationService = new TestMigrationService();
		migrationService.setDefaultCount(CustomizationMigrationType.PromptFiles, 2);
		migrationService.setDefaultCount(CustomizationMigrationType.McpServers, 3);
		const testObject = createService({
			[ChatConfiguration.CustomizationEntryPoints]: true,
			[ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
			[ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled]: true,
		}, migrationService);

		await waitFor(() => testObject.migrationService.calls.length === 2);

		assert.deepStrictEqual({
			calls: testObject.migrationService.calls,
			count: testObject.service.candidateCount.get(),
		}, {
			calls: [CustomizationMigrationType.PromptFiles, CustomizationMigrationType.McpServers],
			count: 5,
		});
	});

	test('refreshes for MCP inventory, runtime, and agent host changes', async () => {
		const testObject = createService({
			[ChatConfiguration.CustomizationEntryPoints]: true,
			[ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled]: true,
		});
		await waitFor(() => testObject.migrationService.calls.length === 1);

		const runtimeServer = createRuntimeMcpServer('runtime');
		testObject.mcpServers.set([runtimeServer.server], undefined);
		await waitFor(() => testObject.migrationService.calls.length === 2);

		const currentDefinitions = runtimeServer.definitions.get();
		const currentDefinition = currentDefinitions.server;
		assert.ok(currentDefinition);
		runtimeServer.definitions.set({ ...currentDefinitions, server: { ...currentDefinition, cacheNonce: '2' } }, undefined);
		await waitFor(() => testObject.migrationService.calls.length === 3);

		runtimeServer.enablement.set(ContributionEnablementState.DisabledProfile, undefined);
		await waitFor(() => testObject.migrationService.calls.length === 4);

		testObject.mcpWorkbenchChanged.fire(undefined);
		await waitFor(() => testObject.migrationService.calls.length === 5);

		testObject.mcpWorkbenchReset.fire();
		await waitFor(() => testObject.migrationService.calls.length === 6);

		testObject.agentHostCustomizationsChanged.fire();
		await waitFor(() => testObject.migrationService.calls.length === 7);

		assert.deepStrictEqual(testObject.migrationService.calls, Array.from(
			{ length: 7 },
			() => CustomizationMigrationType.McpServers,
		));
	});

	test('disabling entry points or MCP migration clears count and ignores MCP refresh signals', async () => {
		const testObject = createService({
			[ChatConfiguration.CustomizationEntryPoints]: true,
			[ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled]: true,
		});
		await waitFor(() => testObject.service.candidateCount.get() === 1);

		await testObject.configurationService.setUserConfiguration(ChatConfiguration.CustomizationEntryPoints, false);
		fireConfigurationChange(testObject.configurationService, ChatConfiguration.CustomizationEntryPoints);
		await waitFor(() => testObject.service.candidateCount.get() === 0);
		let callCount = testObject.migrationService.calls.length;
		fireMcpRefreshSignals(testObject);
		await timeout(0);

		assert.deepStrictEqual({
			calls: testObject.migrationService.calls.slice(callCount),
			count: testObject.service.candidateCount.get(),
		}, {
			calls: [],
			count: 0,
		});

		await testObject.configurationService.setUserConfiguration(ChatConfiguration.CustomizationEntryPoints, true);
		fireConfigurationChange(testObject.configurationService, ChatConfiguration.CustomizationEntryPoints);
		await waitFor(() => testObject.migrationService.calls.length === callCount + 1);
		assert.strictEqual(testObject.service.candidateCount.get(), 1);

		await testObject.configurationService.setUserConfiguration(ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled, false);
		fireConfigurationChange(testObject.configurationService, ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled);
		await waitFor(() => testObject.service.candidateCount.get() === 0);
		callCount = testObject.migrationService.calls.length;

		fireMcpRefreshSignals(testObject);
		await timeout(0);

		assert.deepStrictEqual({
			calls: testObject.migrationService.calls.slice(callCount),
			count: testObject.service.candidateCount.get(),
		}, {
			calls: [],
			count: 0,
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
