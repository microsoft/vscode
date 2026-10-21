/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual, basename } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_SCHEME, createAgentHostResourceUriMapper, identityAgentHostResourceUriMapper, IAgentHostResourceUriMapper, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { createSessionState, SessionState, SessionStatus } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationOverrides, IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileService, IFileWriteOptions } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { ILogService, ILoggerService, NullLogService, NullLoggerService } from '../../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IWorkspaceContextService, WorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { AbstractVariableResolverService } from '../../../../../services/configurationResolver/common/variableResolver.js';
import { CustomizationMigrationService as BaseCustomizationMigrationService } from '../../../browser/aiCustomization/customizationMigrationServiceImpl.js';
import { CustomizationMigrationCategoryId, getCustomizationMigrationCategory } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostCustomizationService, WorkbenchAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostMcpServerMigrationProvider } from '../../../browser/agentSessions/agentHost/agentHostMcpServerMigrationProvider.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, AgentHostMcpServerEnablementState, AgentHostMcpServerSourceKind, AgentHostMcpSupportReason, IAgentHostMcpServerSupportSnapshot } from '../../../browser/agentSessions/agentHost/agentHostMcpServerSupport.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceManagementProvider, ICustomizationMcpServerMigrationProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { CustomizationMigrationType, McpServerCustomizationMigrationFailureReason, PluginMarketplaceCustomizationMigrationFailureReason } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IPromptPath, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { IMcpCopilotGlobalConfigurationService } from '../../../../mcp/common/mcpCopilotGlobalConfigurationService.js';
import { TestEnablementModel, TestMcpService } from '../../../../mcp/test/common/testMcpService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { MockPromptsService } from '../../common/promptSyntax/service/mockPromptsService.js';
import { DEFAULT_PLUGIN_MARKETPLACE } from '../../../common/plugins/marketplaceReference.js';
import { TestSecretStorageService } from '../../../../../../platform/secrets/test/common/testSecretStorageService.js';

class TestPromptsService extends MockPromptsService {
	readonly requestedTypes: PromptsType[] = [];

	constructor(private readonly files: readonly IPromptPath[]) {
		super();
	}

	override async listPromptFiles(type: PromptsType): Promise<readonly IPromptPath[]> {
		this.requestedTypes.push(type);
		return this.files.filter(file => file.type === type);
	}
}

class SupportChangingFileSystemProvider extends InMemoryFileSystemProvider {
	targetUri: URI | undefined;
	afterTargetWrite: (() => void) | undefined;

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		await super.writeFile(resource, content, options);
		if (this.targetUri && isEqual(resource, this.targetUri)) {
			const afterTargetWrite = this.afterTargetWrite;
			this.afterTargetWrite = undefined;
			afterTargetWrite?.();
		}
	}
}

class TrackingFileSystemProvider extends SupportChangingFileSystemProvider {
	readonly readRequests: URI[] = [];
	readonly writeRequests: URI[] = [];

	override async readFile(resource: URI): Promise<Uint8Array> {
		this.readRequests.push(resource);
		return super.readFile(resource);
	}

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		this.writeRequests.push(resource);
		await super.writeFile(resource, content, options);
	}

	resetRequests(): void {
		this.readRequests.length = 0;
		this.writeRequests.length = 0;
	}
}

class TestConfigurationResolverService extends AbstractVariableResolverService {
	constructor(configurationService?: IConfigurationService) {
		super({
			getFolderUri: () => undefined,
			getWorkspaceFolderCount: () => 0,
			// Like the workbench resolver, which reads the setting in the folder's scope.
			getConfigurationValue: (folderUri, section) => configurationService?.getValue<string>(section, folderUri ? { resource: folderUri } : {}),
			getAppRoot: () => undefined,
			getExecPath: () => undefined,
			getFilePath: () => undefined,
			getSelectedText: () => undefined,
			getLineNumber: () => undefined,
			getColumnNumber: () => undefined,
			getExtension: async () => undefined,
		});
	}
}

class MutableMcpServerSupportScope {
	readonly support: ISettableObservable<IAgentHostMcpServerSupportSnapshot>;
	readonly isResolved = observableValue('supportResolved', true);
	private latestResolution = new DeferredPromise<void>();

	constructor(snapshot: IAgentHostMcpServerSupportSnapshot) {
		this.support = observableValue<IAgentHostMcpServerSupportSnapshot>('support', snapshot);
		this.latestResolution.complete();
	}

	queue(): void {
		const previousResolution = this.latestResolution;
		this.latestResolution = new DeferredPromise<void>();
		this.isResolved.set(false, undefined);
		if (!previousResolution.isSettled) {
			previousResolution.complete();
		}
	}

	settle(snapshot: IAgentHostMcpServerSupportSnapshot): void {
		this.support.set(snapshot, undefined);
		this.isResolved.set(true, undefined);
		if (!this.latestResolution.isSettled) {
			this.latestResolution.complete();
		}
	}

	whenResolved(): Promise<void> {
		return this.latestResolution.p;
	}

	dispose(): void { }
}

class TestCustomizationHarnessService extends mock<ICustomizationHarnessService>() {
	readonly requestedSourceFolderTypes: PromptsType[] = [];
	override readonly activeSessionResource;
	override readonly activeHarness;
	mcpServerMigrationProvider: ICustomizationMcpServerMigrationProvider | undefined;
	override readonly availableHarnesses;
	private _marketplaceManagementProvider: ICustomizationMarketplaceManagementProvider | undefined;

	get marketplaceManagementProvider(): ICustomizationMarketplaceManagementProvider | undefined {
		return this._marketplaceManagementProvider;
	}

	set marketplaceManagementProvider(provider: ICustomizationMarketplaceManagementProvider | undefined) {
		this._marketplaceManagementProvider = provider;
		this.availableHarnesses.set([this.createDescriptor()], undefined);
	}

	constructor(
		private readonly sessionType = SessionType.AgentHostCopilot,
		private readonly harnessLabel = 'Copilot',
		override readonly onDidChangeCustomAgents: Event<{ readonly sessionType: string }> = Event.None,
	) {
		super();
		this.activeSessionResource = observableValue('activeSessionResource', URI.from({ scheme: sessionType, path: '/session' }));
		this.activeHarness = observableValue('activeHarness', sessionType);
		this.availableHarnesses = observableValue<readonly IHarnessDescriptor[]>('availableHarnesses', [this.createDescriptor()]);
	}

	override findHarnessById(sessionType: string): IHarnessDescriptor | undefined {
		if (sessionType !== this.sessionType) {
			return undefined;
		}
		return this.createDescriptor();
	}

	private createDescriptor(): IHarnessDescriptor {
		return {
			id: this.sessionType,
			label: this.harnessLabel,
			icon: Codicon.copilot,
			mcpServerMigrationProvider: this.mcpServerMigrationProvider,
			marketplaceManagementProvider: this.marketplaceManagementProvider,
			itemProvider: {
				onDidChange: Event.None,
				provideChatSessionCustomizations: async () => [],
				getWorkspaceGroupId: (_sessionResource, resource) => resource.path.startsWith('/workspace/') ? 'workspace' : undefined,
				provideSourceFolders: async (_sessionResource, type) => {
					this.requestedSourceFolderTypes.push(type);
					switch (type) {
						case PromptsType.agent:
							return [{ uri: URI.file('/copilot/agents'), label: 'Agents', source: PromptsStorage.user }];
						case PromptsType.skill:
							return [
								{ uri: URI.file('/workspace/.github/skills'), label: 'Workspace Skills', source: PromptsStorage.local, workspaceGroupId: 'workspace' },
								{ uri: URI.file('/copilot/skills'), label: 'User Skills', source: PromptsStorage.user },
							];
						default:
							return [];
					}
				},
			},
		};
	}
}

class CustomizationMigrationService extends BaseCustomizationMigrationService {
	constructor(
		promptsService: TestPromptsService,
		harnessService: TestCustomizationHarnessService,
		activeClientService: IAgentHostActiveClientService,
		agentHostCustomizationService: IAgentHostCustomizationService,
		fileService: IFileService,
		logService: ILogService,
		configurationService: TestConfigurationService,
		configurationResolverService: TestConfigurationResolverService,
		mcpService = new TestMcpService(),
		copilotGlobalConfigurationService: IMcpCopilotGlobalConfigurationService = new class extends mock<IMcpCopilotGlobalConfigurationService>() {
			override async getConfigurationResource() { return undefined; }
		}(),
		workspaceContextService: IWorkspaceContextService = createWorkspaceContextService(),
	) {
		super(promptsService, harnessService, configurationService, mcpService);
		harnessService.mcpServerMigrationProvider = this._register(new AgentHostMcpServerMigrationProvider(
			harnessService,
			activeClientService,
			agentHostCustomizationService,
			fileService,
			logService,
			configurationService,
			configurationResolverService,
			mcpService,
			copilotGlobalConfigurationService,
			workspaceContextService,
			this._register(new TestSecretStorageService()),
		));
	}

	protected override generateMigrationFlowId(): string {
		return 'test-migration-flow-id';
	}
}

class DisposableTestConfigurationService extends TestConfigurationService {
	/** Settings reported as workspace settings, which `TestConfigurationService` reports as user settings. */
	readonly workspaceKeys = new Set<string>();

	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		const inspected = super.inspect<T>(key, overrides);
		return this.workspaceKeys.has(key) ? { ...inspected, userValue: undefined, userLocalValue: undefined, workspaceValue: inspected.value } : inspected;
	}

	dispose(): void {
		this.onDidChangeConfigurationEmitter.dispose();
	}
}

function createMigrationConfiguration(enabled = true): DisposableTestConfigurationService {
	return new DisposableTestConfigurationService({
		[ChatConfiguration.ChatCustomizationsMigrationEnabled]: enabled,
	});
}

function createWorkspaceContextService(...folders: URI[]): IWorkspaceContextService {
	const workspace = new Workspace('test-workspace', folders.map((uri, index) => new WorkspaceFolder({ uri, index, name: basename(uri) })));
	return new class extends mock<IWorkspaceContextService>() {
		override getWorkspace() { return workspace; }
	}();
}

function setMigrationEnabled(configurationService: TestConfigurationService, enabled: boolean): Promise<void> {
	return configurationService.setUserConfiguration(ChatConfiguration.ChatCustomizationsMigrationEnabled, enabled);
}

function createWorkspaceMcpSupportSnapshot(root: URI, options: {
	readonly enablement?: { readonly enabled: boolean; readonly state: AgentHostMcpServerEnablementState };
	readonly compatibility?: IAgentHostMcpServerSupportSnapshot['servers'][number]['compatibility'];
	readonly command?: string;
} = {}): IAgentHostMcpServerSupportSnapshot {
	const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
	return {
		servers: [{
			id: 'mcp.config.ws0.server',
			name: 'server',
			collectionId: 'mcp.config.ws0',
			source: {
				group: undefined,
				kind: AgentHostMcpServerSourceKind.VscodeWorkspaceFolder,
				label: 'Workspace',
				collectionUri: sourceUri,
				definitionLocation: undefined,
				remoteAuthority: null,
				extensionId: undefined,
				pluginUri: undefined,
			},
			enablement: options.enablement ?? { enabled: true, state: AgentHostMcpServerEnablementState.EnabledWorkspace },
			applicability: AgentHostMcpServerApplicability.Applicable,
			delivery: AgentHostMcpServerDelivery.ClientForwarded,
			compatibility: options.compatibility ?? { kind: 'supported' },
			projectedConfiguration: { type: McpServerType.LOCAL, command: options.command ?? 'node' },
		}],
		discoveryComplete: true,
		coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
	};
}

suite('CustomizationMigrationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const configurationResolverService = new TestConfigurationResolverService();

	test('reports migration-relevant customization changes', () => {
		const slashCommandsChanged = store.add(new Emitter<void>());
		const instructionsChanged = store.add(new Emitter<void>());
		const agentInstructionsChanged = store.add(new Emitter<void>());
		const skillsChanged = store.add(new Emitter<void>());
		const harnessCustomizationsChanged = store.add(new Emitter<{ readonly sessionType: string }>());
		const mcpService = new TestMcpService();
		const promptsService = store.add(new class extends TestPromptsService {
			override readonly onDidChangeSlashCommands = slashCommandsChanged.event;
			override readonly onDidChangeInstructions = instructionsChanged.event;
			override readonly onDidChangeAgentInstructions = agentInstructionsChanged.event;
			override readonly onDidChangeSkills = skillsChanged.event;
		}([]));
		const agentHostCustomizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() { return []; }
		}();
		const service = store.add(new CustomizationMigrationService(
			promptsService,
			new TestCustomizationHarnessService(SessionType.AgentHostCopilot, 'Copilot', harnessCustomizationsChanged.event),
			new class extends mock<IAgentHostActiveClientService>() { }(),
			agentHostCustomizationService,
			{} as IFileService,
			new NullLogService(),
			store.add(createMigrationConfiguration()),
			configurationResolverService,
			mcpService,
		));
		let changeCount = 0;
		store.add(service.onDidChangeCustomizations(() => changeCount++));

		slashCommandsChanged.fire();
		instructionsChanged.fire();
		agentInstructionsChanged.fire();
		skillsChanged.fire();
		harnessCustomizationsChanged.fire({ sessionType: SessionType.AgentHostCopilot });
		mcpService.servers.set([], undefined);

		assert.strictEqual(changeCount, 6);
	});

	test('reports active harness marketplace inventory and provider changes', () => {
		const firstProviderChanges = store.add(new Emitter<void>());
		const secondProviderChanges = store.add(new Emitter<void>());
		const harnessService = new TestCustomizationHarnessService();
		const createProvider = (onDidChange: Event<void>): ICustomizationMarketplaceManagementProvider => ({
			onDidChange,
			list: async () => [],
			add: async (_sessionResource, source) => ({ name: source, source, isDefault: false, managed: false, available: true }),
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async () => ({ removed: true }),
			refresh: async () => [],
		});
		harnessService.marketplaceManagementProvider = createProvider(firstProviderChanges.event);
		const service = store.add(new BaseCustomizationMigrationService(
			store.add(new TestPromptsService([])),
			harnessService,
			store.add(createMigrationConfiguration()),
			new TestMcpService(),
		));
		let changeCount = 0;
		store.add(service.onDidChangeCustomizations(() => changeCount++));

		firstProviderChanges.fire();
		harnessService.marketplaceManagementProvider = createProvider(secondProviderChanges.event);
		firstProviderChanges.fire();
		secondProviderChanges.fire();

		assert.strictEqual(changeCount, 3);
	});

	test('uses provider-neutral service dependencies', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IPromptsService, store.add(new TestPromptsService([])));
		instantiationService.stub(ICustomizationHarnessService, new TestCustomizationHarnessService());
		instantiationService.stub(IConfigurationService, store.add(createMigrationConfiguration()));
		instantiationService.stub(IMcpService, new TestMcpService());

		store.add(instantiationService.createInstance(BaseCustomizationMigrationService));
	});

	test('copies configured plugin marketplaces without removing Local harness configuration', async () => {
		const addedSources: string[] = [];
		const configurationUpdates: unknown[] = [];
		const configuredValues = [
			DEFAULT_PLUGIN_MARKETPLACE,
			'microsoft/vscode-team-kit',
			'https://example.com/team/plugins.git#stable',
			'file:///marketplaces/local-marketplace',
			'invalid marketplace',
		];
		const configurationService = store.add(new class extends DisposableTestConfigurationService {
			constructor() {
				super({
					[ChatConfiguration.ChatCustomizationsMigrationEnabled]: true,
					[ChatConfiguration.PluginMarketplaces]: configuredValues,
				});
			}

			override inspect<T>(key: string) {
				const inspected = super.inspect<T>(key);
				return key === ChatConfiguration.PluginMarketplaces
					? { ...inspected, defaultValue: [DEFAULT_PLUGIN_MARKETPLACE] as T, applicationValue: configuredValues as T, userValue: undefined }
					: inspected;
			}

			override async updateValue(key: string, value: unknown): Promise<void> {
				configurationUpdates.push({ key, value });
			}
		}());
		const harnessService = new TestCustomizationHarnessService();
		const providerMarketplaces = [{
			name: 'local-marketplace',
			source: `Directory: ${URI.file('/marketplaces/local-marketplace').fsPath}`,
			isDefault: false,
			managed: false,
			available: true,
		}];
		harnessService.marketplaceManagementProvider = {
			onDidChange: Event.None,
			list: async () => providerMarketplaces,
			add: async (_sessionResource, source) => {
				addedSources.push(source);
				if (source.startsWith('https://')) {
					throw new Error('Marketplace unavailable');
				}
				const marketplace = { name: 'vscode-team-kit', source: `GitHub: ${source}`, isDefault: false, managed: false, available: true };
				providerMarketplaces.push(marketplace);
				return marketplace;
			},
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async () => ({ removed: true }),
			refresh: async () => [],
		};
		const service = store.add(new class extends BaseCustomizationMigrationService {
			protected override generateMigrationFlowId(): string {
				return 'test-migration-flow-id';
			}
		}(
			store.add(new TestPromptsService([])),
			harnessService,
			configurationService,
			new TestMcpService(),
		));
		const sessionResource = harnessService.activeSessionResource.get();

		const migration = await service.computeMigration(sessionResource, CustomizationMigrationType.PluginMarketplaces);
		const hint = await service.computeMigrationHint(sessionResource);
		const result = await service.migratePluginMarketplaces(sessionResource, migration.candidates);
		const remainingMigration = await service.computeMigration(sessionResource, CustomizationMigrationType.PluginMarketplaces);

		assert.deepStrictEqual({
			candidates: migration.candidates.map(candidate => ({
				name: candidate.name,
				source: candidate.source,
				storage: candidate.storage,
			})),
			addedSources,
			configurationUpdates,
			result: {
				migratedCount: result.migratedCount,
				failures: result.failures.map(failure => ({
					name: failure.name,
					reason: failure.reason,
					error: failure.error?.message,
				})),
			},
			remainingCandidates: remainingMigration.candidates.map(candidate => candidate.source),
			hint,
		}, {
			candidates: [
				{ name: 'microsoft/vscode-team-kit', source: 'microsoft/vscode-team-kit', storage: PromptsStorage.user },
				{ name: 'https://example.com/team/plugins.git#stable', source: 'https://example.com/team/plugins.git#stable', storage: PromptsStorage.user },
			],
			addedSources: [
				'microsoft/vscode-team-kit',
				'https://example.com/team/plugins.git#stable',
			],
			configurationUpdates: [],
			result: {
				migratedCount: 1,
				failures: [{
					name: 'https://example.com/team/plugins.git#stable',
					reason: PluginMarketplaceCustomizationMigrationFailureReason.AddFailed,
					error: 'Marketplace unavailable',
				}],
			},
			remainingCandidates: ['https://example.com/team/plugins.git#stable'],
			hint: {
				migrationFlowId: 'test-migration-flow-id',
				message: '2 user customizations need an update to keep working.',
				counts: [{ type: CustomizationMigrationType.PluginMarketplaces, count: 2 }],
			},
		});
	});

	test('isolates plugin marketplace discovery failures and skips unnecessary provider reads', async () => {
		let listCalls = 0;
		const configurationService = store.add(new class extends DisposableTestConfigurationService {
			private configuredValues: readonly unknown[] = [];

			constructor() {
				super({ [ChatConfiguration.ChatCustomizationsMigrationEnabled]: true });
			}

			setConfiguredValues(values: readonly unknown[]): void {
				this.configuredValues = values;
			}

			override inspect<T>(key: string) {
				const inspected = super.inspect<T>(key);
				return key === ChatConfiguration.PluginMarketplaces
					? { ...inspected, defaultValue: [DEFAULT_PLUGIN_MARKETPLACE] as T, applicationValue: this.configuredValues as T }
					: inspected;
			}
		}());
		const harnessService = new TestCustomizationHarnessService();
		harnessService.marketplaceManagementProvider = {
			onDidChange: Event.None,
			list: async () => {
				listCalls++;
				throw new Error('Marketplace inventory unavailable');
			},
			add: async () => { throw new Error('Unexpected add'); },
			queryMarketplace: async () => ({ items: [], total: 0 }),
			remove: async () => ({ removed: true }),
			refresh: async () => [],
		};
		const promptsService = store.add(new TestPromptsService([{
			uri: URI.file('/workspace/.github/prompts/review.prompt.md'),
			storage: PromptsStorage.local,
			type: PromptsType.prompt,
			source: PromptFileSource.GitHubWorkspace,
		}]));
		const service = store.add(new BaseCustomizationMigrationService(
			promptsService,
			harnessService,
			configurationService,
			new TestMcpService(),
		));
		const sessionResource = harnessService.activeSessionResource.get();

		const emptyMigration = await service.computeMigration(sessionResource, CustomizationMigrationType.PluginMarketplaces);
		configurationService.setConfiguredValues(['microsoft/vscode-team-kit']);
		const migrations = await service.computeMigrations(sessionResource);
		const marketplaceMigration = migrations.find(migration => migration.type === CustomizationMigrationType.PluginMarketplaces);
		const promptMigration = migrations.find(migration => migration.type === CustomizationMigrationType.PromptFiles);
		const hint = await service.computeMigrationHint(sessionResource);

		assert.deepStrictEqual({
			emptyMigration,
			listCalls,
			marketplaceMigration: marketplaceMigration?.type === CustomizationMigrationType.PluginMarketplaces ? {
				candidates: marketplaceMigration.candidates,
				error: marketplaceMigration.discoveryError?.message,
			} : undefined,
			promptCandidates: promptMigration?.type === CustomizationMigrationType.PromptFiles
				? promptMigration.candidates.map(candidate => candidate.uri.path)
				: [],
			hint: hint && {
				message: hint.message,
				counts: hint.counts,
			},
		}, {
			emptyMigration: {
				type: CustomizationMigrationType.PluginMarketplaces,
				candidates: [],
			},
			listCalls: 2,
			marketplaceMigration: {
				candidates: [],
				error: 'Marketplace inventory unavailable',
			},
			promptCandidates: ['/workspace/.github/prompts/review.prompt.md'],
			hint: {
				message: '1 workspace customization needs an update to keep working.',
				counts: [{ type: CustomizationMigrationType.PromptFiles, count: 1 }],
			},
		});
	});

	test('computes file and MCP migration candidates for Agent Host sessions', async () => {
		const root = URI.file('/workspace');
		const promptsService = store.add(new TestPromptsService([
			{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/user-data/prompts/release.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/prompts/reviewer.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/prompts/style.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.UserData },
			{ uri: URI.file('/home/test/.copilot/agents/planner.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.CopilotPersonal },
			{ uri: URI.file('/workspace/.github/skills/deploy/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/home/test/custom-agents/architect.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.ConfigPersonal },
			{ uri: URI.file('/copilot/agents/already-supported.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.ConfigPersonal },
			{ uri: URI.file('/workspace/custom-skills/release/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, source: PromptFileSource.ConfigWorkspace },
			{ uri: URI.file('/workspace/.github/skills/already-supported/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, source: PromptFileSource.ConfigWorkspace },
			{ uri: URI.file('/home/test/custom-instructions/style.instructions.md'), storage: PromptsStorage.user, type: PromptsType.instructions, source: PromptFileSource.ConfigPersonal },
		]));
		const harnessService = new TestCustomizationHarnessService();
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [
				{
					id: 'supported',
					name: 'Supported server',
					collectionId: 'test',
					source: {
						group: undefined,
						kind: AgentHostMcpServerSourceKind.UserProfile,
						label: 'User',
						collectionUri: undefined,
						definitionLocation: undefined,
						remoteAuthority: null,
						extensionId: undefined,
						pluginUri: undefined,
					},
					enablement: { enabled: true, state: AgentHostMcpServerEnablementState.EnabledProfile },
					applicability: AgentHostMcpServerApplicability.Applicable,
					delivery: AgentHostMcpServerDelivery.ClientForwarded,
					compatibility: { kind: 'supported' },
				},
				{
					id: 'unsupported',
					name: 'Unsupported server',
					collectionId: 'test',
					source: {
						group: undefined,
						kind: AgentHostMcpServerSourceKind.WorkspaceConfiguration,
						label: 'Workspace',
						collectionUri: undefined,
						definitionLocation: undefined,
						remoteAuthority: null,
						extensionId: undefined,
						pluginUri: undefined,
					},
					enablement: { enabled: true, state: AgentHostMcpServerEnablementState.EnabledWorkspace },
					applicability: AgentHostMcpServerApplicability.Applicable,
					delivery: AgentHostMcpServerDelivery.NotDelivered,
					compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.UnsupportedSourceLocation] },
				},
				{
					id: 'outside-scope',
					name: 'Outside scope',
					collectionId: 'test',
					source: {
						group: undefined,
						kind: AgentHostMcpServerSourceKind.VscodeWorkspaceFolder,
						label: 'Other workspace',
						collectionUri: undefined,
						definitionLocation: undefined,
						remoteAuthority: null,
						extensionId: undefined,
						pluginUri: undefined,
					},
					enablement: { enabled: true, state: AgentHostMcpServerEnablementState.EnabledWorkspace },
					applicability: AgentHostMcpServerApplicability.OutsideCurrentScope,
					delivery: AgentHostMcpServerDelivery.NotDelivered,
					compatibility: { kind: 'supported' },
				},
			],
			discoveryComplete: false,
			coverage: {
				restrictedByMcpAccess: true,
				restrictedByCustomizationPolicy: false,
			},
		};
		let requestedSessionType: string | undefined;
		let requestedRoots: readonly URI[] | undefined;
		let supportScopeDisposed = false;
		const activeClientService = {
			acquireMcpServerSupportScope: (sessionType: string, roots: readonly URI[] | undefined) => {
				requestedSessionType = sessionType;
				requestedRoots = roots;
				return {
					support: constObservable(snapshot),
					isResolved: constObservable(true),
					whenResolved: () => Promise.resolve(),
					dispose: () => supportScopeDisposed = true,
				};
			},
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getClientWorkingDirectoryUris: () => [root],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));
		const agentHostSessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' });
		const localSessionResource = URI.from({ scheme: SessionType.Local, path: '/session' });

		const migrations = await service.computeMigrations(agentHostSessionResource);
		const localMigrations = await service.computeMigrations(localSessionResource);
		const hint = await service.computeMigrationHint(agentHostSessionResource);
		const localHint = await service.computeMigrationHint(localSessionResource);

		assert.deepStrictEqual({
			migrations: migrations.map(migration => ({
				type: migration.type,
				...(migration.type === CustomizationMigrationType.McpServers
					? {
						servers: migration.servers,
						candidates: migration.candidates,
						discoveryComplete: migration.discoveryComplete,
						coverage: migration.coverage,
					}
					: migration.type === CustomizationMigrationType.PluginMarketplaces
						? {
							candidates: migration.candidates.map(candidate => candidate.source),
						}
						: {
							files: migration.files.map(file => file.path),
							candidates: migration.candidates.map(candidate => candidate.uri.path),
						}),
			})),
			localMigrations,
			hint,
			localHint,
			requestedTypes: promptsService.requestedTypes,
			requestedSourceFolderTypes: harnessService.requestedSourceFolderTypes.toSorted(),
			workspaceGroupIds: migrations
				.filter(migration => migration.type !== CustomizationMigrationType.McpServers && migration.type !== CustomizationMigrationType.PluginMarketplaces)
				.flatMap(migration => migration.candidates.map(candidate => candidate.workspaceGroupId)),
			requestedSessionType,
			requestedRoots: requestedRoots?.map(requestedRoot => requestedRoot.path),
			supportScopeDisposed,
		}, {
			migrations: [
				{
					type: 'userData',
					files: ['/user-data/prompts/reviewer.agent.md'],
					candidates: ['/user-data/prompts/reviewer.agent.md'],
				},
				{
					type: 'promptFiles',
					files: [
						'/workspace/.github/prompts/review.prompt.md',
						'/user-data/prompts/release.prompt.md',
					],
					candidates: [
						'/workspace/.github/prompts/review.prompt.md',
						'/user-data/prompts/release.prompt.md',
					],
				},
				{
					type: 'configuredLocations',
					files: [
						'/home/test/custom-agents/architect.agent.md',
						'/workspace/custom-skills/release/SKILL.md',
					],
					candidates: [
						'/home/test/custom-agents/architect.agent.md',
						'/workspace/custom-skills/release/SKILL.md',
					],
				},
				{
					type: 'mcpServers',
					servers: [
						{ id: 'supported', name: 'Supported server', supported: true },
						{ id: 'unsupported', name: 'Unsupported server', supported: false },
					],
					candidates: [],
					discoveryComplete: false,
					coverage: {
						restrictedByMcpAccess: true,
						restrictedByCustomizationPolicy: false,
					},
				},
				{
					type: 'pluginMarketplaces',
					candidates: [],
				},
			],
			localMigrations: [
				{ type: 'userData', files: [], candidates: [] },
				{ type: 'promptFiles', files: [], candidates: [] },
				{ type: 'configuredLocations', files: [], candidates: [] },
				{
					type: 'mcpServers',
					servers: [],
					candidates: [],
					exclusions: [],
					discoveryComplete: true,
					coverage: {
						restrictedByMcpAccess: false,
						restrictedByCustomizationPolicy: false,
					},
				},
				{ type: 'pluginMarketplaces', candidates: [] },
			],
			hint: {
				migrationFlowId: 'test-migration-flow-id',
				message: '2 workspace and 3 user customizations need an update to keep working.',
				counts: [
					{ type: CustomizationMigrationType.UserData, count: 1 },
					{ type: CustomizationMigrationType.PromptFiles, count: 2 },
					{ type: CustomizationMigrationType.ConfiguredLocations, count: 2 },
				],
			},
			localHint: undefined,
			requestedTypes: [
				PromptsType.agent, PromptsType.instructions, PromptsType.prompt, PromptsType.agent, PromptsType.instructions, PromptsType.skill,
				PromptsType.agent, PromptsType.instructions, PromptsType.prompt, PromptsType.agent, PromptsType.instructions, PromptsType.skill,
			],
			requestedSourceFolderTypes: [
				PromptsType.agent, PromptsType.agent, PromptsType.agent, PromptsType.agent,
				PromptsType.instructions, PromptsType.instructions, PromptsType.instructions, PromptsType.instructions,
				PromptsType.skill, PromptsType.skill, PromptsType.skill, PromptsType.skill,
			],
			workspaceGroupIds: [undefined, 'workspace', undefined, undefined, 'workspace'],
			requestedSessionType: SessionType.AgentHostCopilot,
			requestedRoots: ['/workspace'],
			supportScopeDisposed: true,
		});
	});

	test('uses scope counts in migration hints', async () => {
		const promptsService = store.add(new TestPromptsService([
			{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
		]));
		const harnessService = new TestCustomizationHarnessService(SessionType.AgentHostClaude, 'Claude');
		const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
			override acquireMcpServerSupportScope() { return undefined; }
		}();
		const agentHostCustomizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() { return []; }
		}();
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostClaude, path: '/session' }));

		assert.deepStrictEqual(hint, {
			migrationFlowId: 'test-migration-flow-id',
			message: '1 workspace customization needs an update to keep working.',
			counts: [{ type: CustomizationMigrationType.PromptFiles, count: 1 }],
		});
	});

	test('summarizes migration candidates by storage', async () => {
		const promptsService = store.add(new TestPromptsService([
			{ uri: URI.file('/workspace/.github/prompts/one.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/workspace/.github/prompts/two.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/user-data/prompts/three.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, source: PromptFileSource.UserData },
			{ uri: URI.file('/user-data/prompts/four.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
		]));
		const harnessService = new TestCustomizationHarnessService(SessionType.AgentHostClaude, 'Claude');
		const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
			override acquireMcpServerSupportScope() { return undefined; }
		}();
		const agentHostCustomizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() { return []; }
		}();
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostClaude, path: '/session' }));

		assert.deepStrictEqual(hint, {
			migrationFlowId: 'test-migration-flow-id',
			message: '2 workspace and 2 user customizations need an update to keep working.',
			counts: [
				{ type: CustomizationMigrationType.UserData, count: 1 },
				{ type: CustomizationMigrationType.PromptFiles, count: 3 },
			],
		});
	});

	test('uses singular wording for a single user customization', async () => {
		const promptsService = store.add(new TestPromptsService([
			{ uri: URI.file('/user-data/prompts/three.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
		]));
		const harnessService = new TestCustomizationHarnessService(SessionType.AgentHostClaude, 'Claude');
		const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
			override acquireMcpServerSupportScope() { return undefined; }
		}();
		const agentHostCustomizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() { return []; }
		}();
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostClaude, path: '/session' }));

		assert.deepStrictEqual(hint, {
			migrationFlowId: 'test-migration-flow-id',
			message: '1 user customization needs an update to keep working.',
			counts: [{ type: CustomizationMigrationType.UserData, count: 1 }],
		});
	});

	for (const sessionType of [SessionType.AgentHostCopilot, SessionType.AgentHostClaude]) {
		test(`offers profile MCP migration only for the window's Copilot host (${sessionType})`, async () => {
			const sourceUri = URI.from({ scheme: Schemas.vscodeUserData, path: '/profile/mcp.json' });
			const targetUri = URI.file('/custom-copilot/mcp-config.json');
			let currentTarget = targetUri;
			const fileService = store.add(new FileService(new NullLogService()));
			store.add(fileService.registerProvider(Schemas.vscodeUserData, store.add(new InMemoryFileSystemProvider())));
			store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
			await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"},"null-env":{"command":"node","env":{"REMOVE_ME":null}}}}'));
			const workspaceSnapshot = createWorkspaceMcpSupportSnapshot(URI.file('/workspace'));
			const snapshot: IAgentHostMcpServerSupportSnapshot = {
				...workspaceSnapshot,
				servers: workspaceSnapshot.servers.flatMap(server => [{
					...server,
					source: { ...server.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: sourceUri },
					enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledProfile },
				}, {
					...server,
					id: 'mcp.config.usrlocal.null-env',
					name: 'null-env',
					source: { ...server.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: sourceUri },
					enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledProfile },
					projectedConfiguration: { type: McpServerType.LOCAL, command: 'node', env: { REMOVE_ME: null } },
				}]),
			};
			const harnessService = new TestCustomizationHarnessService(sessionType);
			const supportScope = new MutableMcpServerSupportScope(snapshot);
			const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
				override acquireMcpServerSupportScope() { return supportScope; }
			}();
			const customizationService = new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override getClientWorkingDirectoryUris() { return []; }
			}();
			const globalConfigurationService = new class extends mock<IMcpCopilotGlobalConfigurationService>() {
				override async getConfigurationResource() { return currentTarget; }
			}();
			const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, customizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService, new TestMcpService(), globalConfigurationService));
			const session = harnessService.activeSessionResource.get();
			const migration = await service.computeMigration(session, CustomizationMigrationType.McpServers);
			const hint = await service.computeMigrationHint(session);
			currentTarget = URI.file('/changed-copilot/mcp-config.json');
			const staleResult = await service.migrateMcpServers(session, migration.candidates);
			currentTarget = targetUri;
			const result = await service.migrateMcpServers(session, migration.candidates);
			const copilot = sessionType === SessionType.AgentHostCopilot;

			assert.deepStrictEqual({
				candidates: migration.candidates.map(candidate => [candidate.storage, candidate.sourceUri.toString(), candidate.targetUri.toString()]),
				exclusions: migration.exclusions.map(exclusion => [exclusion.name, exclusion.details]),
				hint: hint?.message,
				staleFailures: staleResult.failures.map(failure => failure.reason),
				result,
				target: await fileService.exists(targetUri) ? JSON.parse((await fileService.readFile(targetUri)).value.toString()) : undefined,
				source: JSON.parse((await fileService.readFile(sourceUri)).value.toString()),
			}, {
				candidates: copilot ? [[PromptsStorage.user, sourceUri.toString(), targetUri.toString()]] : [],
				exclusions: copilot ? [['null-env', ['Environment variables with null values are not supported in the destination MCP configuration. Remove or replace the null value to migrate this server.']]] : [],
				hint: copilot ? '1 user customization needs an update to keep working.' : undefined,
				staleFailures: copilot ? ['noLongerEligible'] : [],
				result: { migratedCount: copilot ? 1 : 0, failures: [] },
				target: copilot ? { mcpServers: { server: { type: 'stdio', command: 'node', args: [], tools: ['*'] } } } : undefined,
				source: copilot
					? { servers: { 'null-env': { command: 'node', env: { REMOVE_ME: null } } } }
					: { servers: { server: { command: 'node' }, 'null-env': { command: 'node', env: { REMOVE_ME: null } } } },
			});
		});
	}

	test('migrates profile MCP servers with ${env:} references and explains unsupported ones', async () => {
		const sourceUri = URI.from({ scheme: Schemas.vscodeUserData, path: '/profile/mcp.json' });
		const targetUri = URI.file('/custom-copilot/mcp-config.json');
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.vscodeUserData, store.add(new InMemoryFileSystemProvider())));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node","env":{"TOKEN":"${env:TOKEN}"}},"header-name":{"type":"http","url":"https://example.com/mcp","headers":{"${env:HEADER}":"value"}}}}'));
		const [workspaceServer] = createWorkspaceMcpSupportSnapshot(URI.file('/workspace')).servers;
		const userServer = (name: string, projectedConfiguration: IMcpServerConfiguration) => ({
			...workspaceServer,
			id: `mcp.config.usrlocal.${name}`,
			name,
			source: { ...workspaceServer.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: sourceUri },
			// User servers are forwarded with their variables unresolved.
			compatibility: { kind: 'unsupported' as const, reasons: [AgentHostMcpSupportReason.UnresolvedConfiguration] },
			projectedConfiguration,
		});
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [
				userServer('server', { type: McpServerType.LOCAL, command: 'node', env: { TOKEN: '${env:TOKEN}' } }),
				userServer('header-name', { type: McpServerType.REMOTE, url: 'https://example.com/mcp', headers: { '${env:HEADER}': 'value' } }),
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const harnessService = new TestCustomizationHarnessService(SessionType.AgentHostCopilot);
		const supportScope = new MutableMcpServerSupportScope(snapshot);
		const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
			override acquireMcpServerSupportScope() { return supportScope; }
		}();
		const customizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() { return []; }
		}();
		const globalConfigurationService = new class extends mock<IMcpCopilotGlobalConfigurationService>() {
			override async getConfigurationResource() { return targetUri; }
		}();
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, customizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService, new TestMcpService(), globalConfigurationService));
		const session = harnessService.activeSessionResource.get();
		const migration = await service.computeMigration(session, CustomizationMigrationType.McpServers);
		const staleResult = await service.migrateMcpServers(session, migration.candidates.map(candidate => ({ ...candidate, migratedConfiguration: undefined })));
		const result = await service.migrateMcpServers(session, migration.candidates);

		assert.deepStrictEqual({
			candidates: migration.candidates.map(candidate => [candidate.name, candidate.migratedConfiguration]),
			exclusions: migration.exclusions.map(exclusion => [exclusion.name, exclusion.reason, exclusion.details]),
			staleFailures: staleResult.failures.map(failure => failure.reason),
			result,
			target: JSON.parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			candidates: [['server', { type: McpServerType.LOCAL, command: 'node', env: { TOKEN: '${TOKEN}' } }]],
			exclusions: [['header-name', 'environmentVariableInName', ['Variables (\'${env:...}\', \'${input:...}\' or \'${config:...}\') in environment variable or header names are not supported in the destination MCP configuration. Use a fixed name to migrate this server.']]],
			staleFailures: ['noLongerEligible'],
			result: { migratedCount: 1, failures: [] },
			target: { mcpServers: { server: { type: 'stdio', command: 'node', args: [], env: { TOKEN: '${TOKEN}' }, tools: ['*'] } } },
		});
	});

	test('migrates profile MCP servers with ${input:} references, and explains unsupported ones', async () => {
		const sourceUri = URI.from({ scheme: Schemas.vscodeUserData, path: '/profile/mcp.json' });
		const targetUri = URI.file('/custom-copilot/mcp-config.json');
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.vscodeUserData, store.add(new InMemoryFileSystemProvider())));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const servers = {
			server: { command: 'node', env: { TOKEN: '${input:token}' } },
			password: { command: 'node', args: ['${input:secret}'] },
			digit: { command: 'node', args: ['${input:1st}'] },
			collision: { command: 'node', args: ['${input:api-key}', '${env:API_KEY}'] },
			default: { command: 'node', args: ['${input:level}'] },
			command: { command: '${command:extension.pick}', args: ['${input:token}'] },
			setting: { command: '${config:mcp.missing}' },
		};
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({
			inputs: [
				{ id: 'token', type: 'promptString', description: 'Token' },
				{ id: 'secret', type: 'promptString', description: 'Secret', password: true },
				{ id: '1st', type: 'promptString', description: 'First' },
				{ id: 'api-key', type: 'promptString', description: 'API key' },
				{ id: 'level', type: 'pickString', description: 'Level', options: ['info', 'debug'], default: 'trace' },
			],
			servers,
		})));
		const [workspaceServer] = createWorkspaceMcpSupportSnapshot(URI.file('/workspace')).servers;
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: Object.entries(servers).map(([name, server]) => ({
				...workspaceServer,
				id: `mcp.config.usrlocal.${name}`,
				name,
				source: { ...workspaceServer.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: sourceUri },
				// User servers are forwarded with their variables unresolved.
				compatibility: { kind: 'unsupported' as const, reasons: [AgentHostMcpSupportReason.RequiresUserInteraction] },
				projectedConfiguration: { type: McpServerType.LOCAL, ...server },
			})),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const harnessService = new TestCustomizationHarnessService(SessionType.AgentHostCopilot);
		const supportScope = new MutableMcpServerSupportScope(snapshot);
		const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
			override acquireMcpServerSupportScope() { return supportScope; }
		}();
		const customizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() { return []; }
		}();
		const globalConfigurationService = new class extends mock<IMcpCopilotGlobalConfigurationService>() {
			override async getConfigurationResource() { return targetUri; }
		}();
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, customizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService, new TestMcpService(), globalConfigurationService));
		const session = harnessService.activeSessionResource.get();
		const migration = await service.computeMigration(session, CustomizationMigrationType.McpServers);
		const result = await service.migrateMcpServers(session, migration.candidates);

		assert.deepStrictEqual({
			candidates: migration.candidates.map(candidate => candidate.name),
			exclusions: migration.exclusions.map(exclusion => [exclusion.name, exclusion.reason, exclusion.details]),
			result,
			source: JSON.parse((await fileService.readFile(sourceUri)).value.toString()).inputs.map((input: { id: string }) => input.id),
			target: JSON.parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			// The setting is not set, so it migrates to an empty variable.
			candidates: ['server', 'digit', 'setting'],
			exclusions: [
				['password', 'unsupportedInputType', ['Inputs are migrated to environment variables, except password and command inputs, and inputs that are not fully declared in the \'inputs\' of the same file. Use an environment variable (\'${env:...}\') instead to migrate this server.']],
				['collision', 'variableNameCollision', ['Inputs and settings are migrated to environment variables named after their IDs or keys, and an input or setting of this server would use the same environment variable as a different input, setting or environment variable reference (\'${env:...}\') in the same file, or as an entry of its \'env\'. Rename the input or use a different setting to migrate this server.']],
				['default', 'unsupportedInputDefault', ['The default value of an input contains a variable or cannot be represented in the destination MCP configuration, or the default of a pick input is not one of its options. Change the default value to migrate this server.']],
				// Its inputs are fine, so the reason names the variable that isn't, not the inputs.
				['command', 'unsupportedVariable', ['This server uses a variable that cannot be migrated, such as a command variable, or a workspace variable in a user configuration. Replace it with a fixed value or an environment variable (\'${env:...}\') to migrate this server.']],
			],
			result: { migratedCount: 3, failures: [] },
			source: ['token', 'secret', 'api-key', 'level'],
			target: {
				mcpServers: {
					server: { type: 'stdio', command: 'node', args: [], env: { TOKEN: '' }, tools: ['*'] },
					digit: { type: 'stdio', command: 'node', args: ['${MCP_1ST}'], env: { MCP_1ST: '' }, tools: ['*'] },
					setting: { type: 'stdio', command: '${MCP_MISSING}', args: [], env: { MCP_MISSING: '' }, tools: ['*'] },
				},
			},
		});
	});

	test('migrates profile MCP servers with ${config:} references to their current values, and explains unsupported ones', async () => {
		const sourceUri = URI.from({ scheme: Schemas.vscodeUserData, path: '/profile/mcp.json' });
		const targetUri = URI.file('/custom-copilot/mcp-config.json');
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.vscodeUserData, store.add(new InMemoryFileSystemProvider())));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const servers = {
			local: { command: '${config:mcp.command}', args: ['--level=${input:level}'], env: { PORT: '${config:mcp.port}', TOKEN: '${env:TOKEN}' } },
			remote: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Host': '${config:mcp.host}' } },
			changed: { command: 'node', args: ['--timeout=${config:mcp.timeout}'] },
			// These settings have no usable value, so they become empty variables.
			unset: { command: '${config:mcp.missing}' },
			structured: { command: 'node', args: ['${config:mcp.options}'] },
			// Rare, so migrated even though the `}` ends the `${NAME:-value}` default early.
			brace: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Brace': '${config:mcp.brace}' } },
			collision: { command: 'node', args: ['${config:api.key}', '${env:API_KEY}'] },
		};
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({
			inputs: [{ id: 'level', type: 'promptString', description: 'Level', default: 'info' }],
			servers,
		})));
		const configurationService = store.add(createMigrationConfiguration());
		for (const [key, value] of Object.entries({ 'mcp.command': 'npx', 'mcp.port': 8080, 'mcp.host': 'localhost', 'mcp.timeout': 30, 'mcp.options': { verbose: true }, 'api.key': 'key', 'mcp.brace': 'a}b' })) {
			await configurationService.setUserConfiguration(key, value);
		}
		const [workspaceServer] = createWorkspaceMcpSupportSnapshot(URI.file('/workspace')).servers;
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: Object.entries(servers).map(([name, server]) => ({
				...workspaceServer,
				id: `mcp.config.usrlocal.${name}`,
				name,
				source: { ...workspaceServer.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: sourceUri },
				// User servers are forwarded with their variables unresolved.
				compatibility: { kind: 'unsupported' as const, reasons: [AgentHostMcpSupportReason.UnresolvedConfiguration] },
				projectedConfiguration: name === 'remote' || name === 'brace'
					? { type: McpServerType.REMOTE, url: 'https://example.com/mcp', headers: (server as { headers: Record<string, string> }).headers }
					: { type: McpServerType.LOCAL, ...server as { command: string } },
			})),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const harnessService = new TestCustomizationHarnessService(SessionType.AgentHostCopilot);
		const supportScope = new MutableMcpServerSupportScope(snapshot);
		const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
			override acquireMcpServerSupportScope() { return supportScope; }
		}();
		const customizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() { return []; }
		}();
		const globalConfigurationService = new class extends mock<IMcpCopilotGlobalConfigurationService>() {
			override async getConfigurationResource() { return targetUri; }
		}();
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, customizationService, fileService, new NullLogService(), configurationService, new TestConfigurationResolverService(configurationService), new TestMcpService(), globalConfigurationService));
		const session = harnessService.activeSessionResource.get();
		const migration = await service.computeMigration(session, CustomizationMigrationType.McpServers);
		// The value the user confirmed is no longer current.
		await configurationService.setUserConfiguration('mcp.timeout', 60);
		const result = await service.migrateMcpServers(session, migration.candidates);
		const category = getCustomizationMigrationCategory(CustomizationMigrationCategoryId.McpServers);

		assert.deepStrictEqual({
			candidates: migration.candidates.map(candidate => [candidate.name, candidate.settingVariables?.map(setting => [setting.name, setting.value]), category.getCandidateWarnings?.(candidate, 'Copilot')]),
			exclusions: migration.exclusions.map(exclusion => [exclusion.name, exclusion.reason, exclusion.details]),
			result: { migratedCount: result.migratedCount, failures: result.failures.map(failure => [failure.name, failure.reason]) },
			source: Object.keys(JSON.parse((await fileService.readFile(sourceUri)).value.toString()).servers),
			target: JSON.parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			candidates: [
				['local', [['MCP_COMMAND', 'npx'], ['MCP_PORT', '8080']], [
					'Inputs will become environment variables. Configure them in the MCP server details after migrating.',
					'Configs will become environment variables. Later changes won\'t apply.',
					'VS Code will ask you to trust this server again after migration.',
				]],
				['remote', [['MCP_HOST', 'localhost']], ['Configs will become environment variables. Later changes won\'t apply.', 'VS Code will ask you to trust this server again after migration.']],
				['changed', [['MCP_TIMEOUT', '30']], ['Configs will become environment variables. Later changes won\'t apply.', 'VS Code will ask you to trust this server again after migration.']],
				['unset', [['MCP_MISSING', '']], ['Configs will become environment variables. Later changes won\'t apply.', 'VS Code will ask you to trust this server again after migration.']],
				['structured', [['MCP_OPTIONS', '']], ['Configs will become environment variables. Later changes won\'t apply.', 'VS Code will ask you to trust this server again after migration.']],
				['brace', [['MCP_BRACE', 'a}b']], ['Configs will become environment variables. Later changes won\'t apply.', 'VS Code will ask you to trust this server again after migration.']],
			],
			exclusions: [
				['collision', 'variableNameCollision', ['Inputs and settings are migrated to environment variables named after their IDs or keys, and an input or setting of this server would use the same environment variable as a different input, setting or environment variable reference (\'${env:...}\') in the same file, or as an entry of its \'env\'. Rename the input or use a different setting to migrate this server.']],
			],
			result: { migratedCount: 5, failures: [['changed', McpServerCustomizationMigrationFailureReason.SourceChanged]] },
			source: ['changed', 'collision'],
			target: {
				mcpServers: {
					local: { type: 'stdio', command: '${MCP_COMMAND}', args: ['--level=${LEVEL}'], env: { PORT: '8080', TOKEN: '${TOKEN}', LEVEL: 'info', MCP_COMMAND: 'npx' }, tools: ['*'] },
					remote: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Host': '${MCP_HOST:-localhost}' }, tools: ['*'] },
					unset: { type: 'stdio', command: '${MCP_MISSING}', args: [], env: { MCP_MISSING: '' }, tools: ['*'] },
					structured: { type: 'stdio', command: 'node', args: ['${MCP_OPTIONS}'], env: { MCP_OPTIONS: '' }, tools: ['*'] },
					// Written as is, even though the `}` ends the default early.
					brace: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Brace': '${MCP_BRACE:-a}b}' }, tools: ['*'] },
				},
			},
		});
	});

	test('migrates workspace MCP servers with ${config:} references to the values in the workspace settings', async () => {
		const root = URI.file('/workspace');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node","args":["--port=${config:mcp.port}","--token=${config:user.token}"]}}}'));
		const configurationService = store.add(createMigrationConfiguration());
		await configurationService.setUserConfiguration('mcp.port', 1);
		await configurationService.setUserConfiguration('mcp.port', 8080, root);
		configurationService.workspaceKeys.add('mcp.port');
		// Only in the user's settings, so its value is not written into the workspace.
		await configurationService.setUserConfiguration('user.token', 'secret', root);
		const [server] = createWorkspaceMcpSupportSnapshot(root).servers;
		// The client resolves the setting in the folder's scope before forwarding the server.
		const supportScope = new MutableMcpServerSupportScope({
			servers: [{ ...server, projectedConfiguration: { type: McpServerType.LOCAL, command: 'node', args: ['--port=8080', '--token=secret'] } }],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		});
		const harnessService = new TestCustomizationHarnessService(SessionType.AgentHostCopilot);
		const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
			override acquireMcpServerSupportScope() { return supportScope; }
		}();
		const customizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() { return [root]; }
		}();
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, customizationService, fileService, new NullLogService(), configurationService, new TestConfigurationResolverService(configurationService)));
		const session = harnessService.activeSessionResource.get();
		const migration = await service.computeMigration(session, CustomizationMigrationType.McpServers);
		const result = await service.migrateMcpServers(session, migration.candidates);

		assert.deepStrictEqual({
			candidates: migration.candidates.map(candidate => [candidate.name, candidate.storage, candidate.settingVariables]),
			result,
			target: JSON.parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			candidates: [['server', PromptsStorage.local, [{ key: 'mcp.port', name: 'MCP_PORT', value: '8080' }, { key: 'user.token', name: 'USER_TOKEN', value: '' }]]],
			result: { migratedCount: 1, failures: [] },
			target: { mcpServers: { server: { type: 'stdio', command: 'node', args: ['--port=${MCP_PORT}', '--token=${USER_TOKEN}'], env: { MCP_PORT: '8080', USER_TOKEN: '' }, tools: ['*'] } } },
		});
	});

	test('does not report non-migratable MCP servers', async () => {
		const promptsService = store.add(new TestPromptsService([]));
		const harnessService = new TestCustomizationHarnessService();
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [0, 1].map(index => ({
				id: `unsupported-${index}`,
				name: `Unsupported server ${index}`,
				collectionId: 'test',
				source: {
					group: undefined,
					kind: AgentHostMcpServerSourceKind.UserProfile,
					label: 'User',
					collectionUri: undefined,
					definitionLocation: undefined,
					remoteAuthority: null,
					extensionId: undefined,
					pluginUri: undefined,
				},
				enablement: { enabled: true, state: AgentHostMcpServerEnablementState.EnabledProfile },
				applicability: AgentHostMcpServerApplicability.Applicable,
				delivery: AgentHostMcpServerDelivery.NotDelivered,
				compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.LaunchNotRepresentable] },
			})),
			discoveryComplete: true,
			coverage: {
				restrictedByMcpAccess: false,
				restrictedByCustomizationPolicy: false,
			},
		};
		const activeClientService = {
			acquireMcpServerSupportScope: () => ({
				support: constObservable(snapshot),
				isResolved: constObservable(true),
				whenResolved: () => Promise.resolve(),
				dispose: () => { },
			}),
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const agentHostCustomizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() { return []; }
		}();
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }));

		assert.strictEqual(hint, undefined);
	});

	test('gates MCP migration candidate planning and execution by setting', async () => {
		const root = URI.file('/workspace');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = store.add(new FileService(new NullLogService()));
		const fileProvider = store.add(new TrackingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{}}'));
		fileProvider.resetRequests();

		const activeSessionResource = observableValue('activeSessionResource', URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }));
		const activeHarness = observableValue('activeHarness', SessionType.AgentHostCopilot);
		const harnessService = new class extends TestCustomizationHarnessService {
			override readonly activeSessionResource = activeSessionResource;
			override readonly activeHarness = activeHarness;
		}();
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [{
				id: 'mcp.config.ws0.server',
				name: 'server',
				collectionId: 'mcp.config.ws0',
				source: {
					group: undefined,
					kind: AgentHostMcpServerSourceKind.VscodeWorkspaceFolder,
					label: 'Workspace',
					collectionUri: sourceUri,
					definitionLocation: undefined,
					remoteAuthority: null,
					extensionId: undefined,
					pluginUri: undefined,
				},
				enablement: { enabled: true, state: AgentHostMcpServerEnablementState.EnabledWorkspace },
				applicability: AgentHostMcpServerApplicability.Applicable,
				delivery: AgentHostMcpServerDelivery.ClientForwarded,
				compatibility: { kind: 'supported' },
				projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
			}],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const activeClientService = {
			acquireMcpServerSupportScope: () => ({
				support: constObservable(snapshot),
				isResolved: constObservable(true),
				whenResolved: () => Promise.resolve(),
				dispose: () => { },
			}),
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getClientWorkingDirectoryUris: () => [root],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const configurationService = store.add(createMigrationConfiguration(false));
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), configurationService, configurationResolverService));

		const disabledMigration = await service.computeMigration(activeSessionResource.get(), CustomizationMigrationType.McpServers);
		const disabledHint = await service.computeMigrationHint(activeSessionResource.get());
		const disabledPlanningReads = fileProvider.readRequests.map(resource => resource.path);
		fileProvider.resetRequests();
		await setMigrationEnabled(configurationService, true);
		const enabledMigration = await service.computeMigration(activeSessionResource.get(), CustomizationMigrationType.McpServers);
		const enabledPlanningReads = fileProvider.readRequests.map(resource => resource.path);
		fileProvider.resetRequests();
		await setMigrationEnabled(configurationService, false);
		const disabledExecutionResult = await service.migrateMcpServers(activeSessionResource.get(), enabledMigration.candidates);
		const disabledExecutionReads = fileProvider.readRequests.map(resource => resource.path);
		const disabledExecutionWrites = fileProvider.writeRequests.map(resource => resource.path);
		fileProvider.resetRequests();
		await setMigrationEnabled(configurationService, true);
		const enabledExecutionResult = await service.migrateMcpServers(activeSessionResource.get(), enabledMigration.candidates);
		const enabledExecutionWrites = fileProvider.writeRequests.map(resource => resource.path);
		const source = JSON.parse((await fileService.readFile(sourceUri)).value.toString());
		const target = JSON.parse((await fileService.readFile(targetUri)).value.toString());

		assert.deepStrictEqual({
			disabledMigration: {
				servers: disabledMigration.servers,
				candidates: disabledMigration.candidates,
			},
			disabledHint,
			disabledPlanningReads,
			enabledMigration: enabledMigration.candidates.map(candidate => ({
				name: candidate.name,
				source: candidate.sourceUri.path,
				target: candidate.targetUri.path,
			})),
			enabledPlanningReads,
			disabledExecutionResult: {
				migratedCount: disabledExecutionResult.migratedCount,
				failures: disabledExecutionResult.failures.map(failure => failure.reason),
			},
			disabledExecutionReads,
			disabledExecutionWrites,
			enabledExecutionResult: {
				migratedCount: enabledExecutionResult.migratedCount,
				failures: enabledExecutionResult.failures.map(failure => failure.reason),
			},
			enabledExecutionWrites,
			source,
			target,
		}, {
			disabledMigration: {
				servers: [],
				candidates: [],
			},
			disabledHint: undefined,
			disabledPlanningReads: [],
			enabledMigration: [{ name: 'server', source: '/workspace/.vscode/mcp.json', target: '/workspace/.mcp.json' }],
			enabledPlanningReads: ['/workspace/.vscode/mcp.json'],
			disabledExecutionResult: { migratedCount: 0, failures: ['noLongerEligible'] },
			disabledExecutionReads: [],
			disabledExecutionWrites: [],
			enabledExecutionResult: { migratedCount: 1, failures: [] },
			enabledExecutionWrites: ['/workspace/.mcp.json', '/workspace/.vscode/mcp.json'],
			source: { servers: {} },
			target: { mcpServers: { server: { type: 'stdio', command: 'node', args: [], tools: ['*'] } } },
		});
	});

	test('waits for queued MCP support before planning migration execution', async () => {
		const root = URI.file('/queued-before-plan');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = store.add(new FileService(new NullLogService()));
		const fileProvider = store.add(new TrackingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{}}'));
		fileProvider.resetRequests();

		const activeSessionResource = observableValue('activeSessionResource', URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }));
		const activeHarness = observableValue('activeHarness', SessionType.AgentHostCopilot);
		const harnessService = new class extends TestCustomizationHarnessService {
			override readonly activeSessionResource = activeSessionResource;
			override readonly activeHarness = activeHarness;
		}();
		const supportScope = new MutableMcpServerSupportScope(createWorkspaceMcpSupportSnapshot(root));
		supportScope.queue();
		const activeClientService = {
			acquireMcpServerSupportScope: () => supportScope,
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getClientWorkingDirectoryUris: () => [root],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));
		const requested = [{
			type: CustomizationMigrationType.McpServers,
			storage: PromptsStorage.local,
			id: 'mcp.config.ws0.server',
			name: 'server',
			sourceUri,
			targetUri,
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		}] as const;

		const migration = service.migrateMcpServers(activeSessionResource.get(), requested);
		await Promise.resolve();
		const readsBeforeSupportSettled = fileProvider.readRequests.map(resource => resource.path);
		supportScope.settle(createWorkspaceMcpSupportSnapshot(root, {
			enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledWorkspace },
		}));
		const result = await migration;

		assert.deepStrictEqual({
			readsBeforeSupportSettled,
			result: {
				migratedCount: result.migratedCount,
				failures: result.failures.map(failure => failure.reason),
			},
			reads: fileProvider.readRequests.map(resource => resource.path),
			writes: fileProvider.writeRequests.map(resource => resource.path),
			source: JSON.parse((await fileService.readFile(sourceUri)).value.toString()),
			target: JSON.parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			readsBeforeSupportSettled: [],
			result: { migratedCount: 1, failures: [] },
			reads: [
				'/queued-before-plan/.vscode/mcp.json',
				'/queued-before-plan/.vscode/mcp.json',
				'/queued-before-plan/.mcp.json',
				'/queued-before-plan/.mcp.json',
				'/queued-before-plan/.vscode/mcp.json',
				'/queued-before-plan/.vscode/mcp.json',
				'/queued-before-plan/.mcp.json',
			],
			writes: ['/queued-before-plan/.mcp.json', '/queued-before-plan/.vscode/mcp.json'],
			source: { servers: {} },
			target: { mcpServers: { server: { type: 'stdio', command: 'node', args: [], tools: ['*'] } } },
		});
	});

	test('does not compute MCP migration or compatibility hints when MCP migration is disabled', async () => {
		const root = URI.file('/workspace');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const fileService = store.add(new FileService(new NullLogService()));
		const fileProvider = store.add(new TrackingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"supported":{"command":"node"},"unsupported":{"command":"python"}}}'));
		fileProvider.resetRequests();

		const harnessService = new TestCustomizationHarnessService();
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [
				{
					id: 'mcp.config.ws0.supported',
					name: 'supported',
					collectionId: 'mcp.config.ws0',
					source: {
						group: undefined,
						kind: AgentHostMcpServerSourceKind.VscodeWorkspaceFolder,
						label: 'Workspace',
						collectionUri: sourceUri,
						definitionLocation: undefined,
						remoteAuthority: null,
						extensionId: undefined,
						pluginUri: undefined,
					},
					enablement: { enabled: true, state: AgentHostMcpServerEnablementState.EnabledWorkspace },
					applicability: AgentHostMcpServerApplicability.Applicable,
					delivery: AgentHostMcpServerDelivery.ClientForwarded,
					compatibility: { kind: 'supported' },
					projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
				},
				{
					id: 'mcp.config.ws0.unsupported',
					name: 'unsupported',
					collectionId: 'mcp.config.ws0',
					source: {
						group: undefined,
						kind: AgentHostMcpServerSourceKind.VscodeWorkspaceFolder,
						label: 'Workspace',
						collectionUri: sourceUri,
						definitionLocation: undefined,
						remoteAuthority: null,
						extensionId: undefined,
						pluginUri: undefined,
					},
					enablement: { enabled: true, state: AgentHostMcpServerEnablementState.EnabledWorkspace },
					applicability: AgentHostMcpServerApplicability.Applicable,
					delivery: AgentHostMcpServerDelivery.NotDelivered,
					compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.LaunchNotRepresentable] },
				},
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const activeClientService = {
			acquireMcpServerSupportScope: () => ({
				support: constObservable(snapshot),
				isResolved: constObservable(true),
				whenResolved: () => Promise.resolve(),
				dispose: () => { },
			}),
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getClientWorkingDirectoryUris: () => [root],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration(false)), configurationResolverService));

		const migration = await service.computeMigration(harnessService.activeSessionResource.get(), CustomizationMigrationType.McpServers);
		const hint = await service.computeMigrationHint(harnessService.activeSessionResource.get());

		assert.deepStrictEqual({
			migration: {
				servers: migration.servers,
				candidates: migration.candidates,
			},
			hint,
			fileReads: fileProvider.readRequests.map(resource => resource.path),
		}, {
			migration: {
				servers: [],
				candidates: [],
			},
			hint: undefined,
			fileReads: [],
		});
	});

	test('queries file migration categories only when enabled', async () => {
		const promptsService = store.add(new TestPromptsService([
			{ uri: URI.file('/user-data/prompts/reviewer.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.UserData },
			{ uri: URI.file('/workspace/.github/prompts/review.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, source: PromptFileSource.GitHubWorkspace },
			{ uri: URI.file('/home/test/custom-agents/architect.agent.md'), storage: PromptsStorage.user, type: PromptsType.agent, source: PromptFileSource.ConfigPersonal },
			{ uri: URI.file('/workspace/custom-skills/release/SKILL.md'), storage: PromptsStorage.local, type: PromptsType.skill, source: PromptFileSource.ConfigWorkspace },
		]));
		const harnessService = new TestCustomizationHarnessService();
		const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
			override acquireMcpServerSupportScope() { return undefined; }
		}();
		const agentHostCustomizationService = new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getClientWorkingDirectoryUris() { return []; }
		}();
		const configurationService = store.add(createMigrationConfiguration(false));
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), configurationService, configurationResolverService));
		const sessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' });

		const disabledMigrations = await service.computeMigrations(sessionResource);
		const disabledHint = await service.computeMigrationHint(sessionResource);
		const disabledRequestedTypes = [...promptsService.requestedTypes];
		const disabledSourceFolderTypes = [...harnessService.requestedSourceFolderTypes];
		promptsService.requestedTypes.length = 0;
		harnessService.requestedSourceFolderTypes.length = 0;
		await setMigrationEnabled(configurationService, true);
		const enabledHint = await service.computeMigrationHint(sessionResource);

		assert.deepStrictEqual({
			disabledMigrations: disabledMigrations.map(migration => ({
				type: migration.type,
				candidates: migration.candidates.length,
				...(migration.type === CustomizationMigrationType.McpServers
					? { servers: migration.servers.length }
					: migration.type === CustomizationMigrationType.PluginMarketplaces
						? {}
						: { files: migration.files.length }),
			})),
			disabledHint,
			disabledRequestedTypes,
			disabledSourceFolderTypes,
			enabledHint,
			enabledRequestedTypes: promptsService.requestedTypes,
			enabledSourceFolderTypes: harnessService.requestedSourceFolderTypes,
		}, {
			disabledMigrations: [
				{ type: 'userData', candidates: 0, files: 0 },
				{ type: 'promptFiles', candidates: 0, files: 0 },
				{ type: 'configuredLocations', candidates: 0, files: 0 },
				{ type: 'mcpServers', candidates: 0, servers: 0 },
				{ type: 'pluginMarketplaces', candidates: 0 },
			],
			disabledHint: undefined,
			disabledRequestedTypes: [],
			disabledSourceFolderTypes: [],
			enabledHint: {
				migrationFlowId: 'test-migration-flow-id',
				message: '2 workspace and 2 user customizations need an update to keep working.',
				counts: [
					{ type: CustomizationMigrationType.UserData, count: 1 },
					{ type: CustomizationMigrationType.PromptFiles, count: 1 },
					{ type: CustomizationMigrationType.ConfiguredLocations, count: 2 },
				],
			},
			enabledRequestedTypes: [
				PromptsType.agent, PromptsType.instructions, PromptsType.prompt,
				PromptsType.agent, PromptsType.instructions, PromptsType.skill,
			],
			enabledSourceFolderTypes: [
				PromptsType.skill, PromptsType.agent, PromptsType.agent, PromptsType.skill,
			],
		});
	});

	test('computes migratable MCP candidates and revalidates requested candidates', async () => {
		const root = URI.file('/workspace');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = store.add(new FileService(new NullLogService()));
		const fileProvider = store.add(new SupportChangingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{}}'));
		fileProvider.targetUri = targetUri;
		const activeSessionResource = observableValue('activeSessionResource', URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }));
		const activeHarness = observableValue('activeHarness', SessionType.AgentHostCopilot);
		const harnessService = new class extends TestCustomizationHarnessService {
			override readonly activeSessionResource = activeSessionResource;
			override readonly activeHarness = activeHarness;
		}();
		const supportedSnapshot = createWorkspaceMcpSupportSnapshot(root);
		const unsupportedSnapshot = createWorkspaceMcpSupportSnapshot(root, {
			compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.LaunchNotRepresentable] },
		});
		const disabledSnapshot = createWorkspaceMcpSupportSnapshot(root, {
			enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledWorkspace },
		});
		const supportScope = new MutableMcpServerSupportScope(supportedSnapshot);
		const activeClientService = {
			acquireMcpServerSupportScope: () => supportScope,
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getClientWorkingDirectoryUris: () => [root],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));
		const migration = await service.computeMigration(activeSessionResource.get(), CustomizationMigrationType.McpServers);
		const hint = await service.computeMigrationHint(activeSessionResource.get());
		supportScope.settle(unsupportedSnapshot);
		const result = await service.migrateMcpServers(activeSessionResource.get(), migration.candidates);
		supportScope.settle(supportedSnapshot);
		const targetWriteRefreshQueued = new DeferredPromise<void>();
		fileProvider.afterTargetWrite = () => {
			supportScope.queue();
			targetWriteRefreshQueued.complete();
		};
		const changedDuringWrite = service.migrateMcpServers(activeSessionResource.get(), migration.candidates);
		await targetWriteRefreshQueued.p;
		const sourceBeforeSupportSettled = (await fileService.readFile(sourceUri)).value.toString();
		supportScope.settle(disabledSnapshot);
		const changedDuringWriteResult = await changedDuringWrite;

		assert.deepStrictEqual({
			candidates: migration.candidates.map(candidate => ({
				name: candidate.name,
				source: candidate.sourceUri.path,
				target: candidate.targetUri.path,
			})),
			hint,
			result: {
				migratedCount: result.migratedCount,
				failures: result.failures.map(failure => failure.reason),
			},
			changedDuringWriteResult: {
				migratedCount: changedDuringWriteResult.migratedCount,
				failures: changedDuringWriteResult.failures.map(failure => failure.reason),
			},
			sourceBeforeSupportSettled,
			source: (await fileService.readFile(sourceUri)).value.toString(),
			target: (await fileService.readFile(targetUri)).value.toString(),
		}, {
			candidates: [{ name: 'server', source: '/workspace/.vscode/mcp.json', target: '/workspace/.mcp.json' }],
			hint: {
				migrationFlowId: 'test-migration-flow-id',
				message: '1 workspace customization needs an update to keep working.',
				counts: [{ type: CustomizationMigrationType.McpServers, count: 1 }],
			},
			result: { migratedCount: 0, failures: ['noLongerEligible'] },
			changedDuringWriteResult: { migratedCount: 1, failures: [] },
			sourceBeforeSupportSettled: '{"servers":{"server":{"command":"node"}}}',
			source: '{\n\t"servers": {}\n}',
			target: '{\n\t"mcpServers": {\n\t\t"server": {\n\t\t\t"type": "stdio",\n\t\t\t"command": "node",\n\t\t\t"args": [],\n\t\t\t"tools": [\n\t\t\t\t"*"\n\t\t\t]\n\t\t}\n\t}\n}',
		});
	});

	test('rejects migration when ordered roots change during support resolution', async () => {
		const root = URI.file('/workspace');
		const secondRoot = URI.file('/second');
		const activeSessionResource = observableValue('activeSessionResource', URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }));
		const activeHarness = observableValue('activeHarness', SessionType.AgentHostCopilot);
		const harnessService = new class extends TestCustomizationHarnessService {
			override readonly activeSessionResource = activeSessionResource;
			override readonly activeHarness = activeHarness;
		}();
		const resolved = new DeferredPromise<void>();
		const acquired = new DeferredPromise<void>();
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const activeClientService = {
			acquireMcpServerSupportScope: () => {
				acquired.complete();
				return {
					support: constObservable(snapshot),
					isResolved: constObservable(false),
					whenResolved: () => resolved.p,
					dispose: () => { },
				};
			},
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		let roots = [root];
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getClientWorkingDirectoryUris: () => roots,
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));
		const requested = [{
			type: CustomizationMigrationType.McpServers,
			storage: PromptsStorage.local,
			id: 'server',
			name: 'server',
			sourceUri: URI.joinPath(root, '.vscode', 'mcp.json'),
			targetUri: URI.joinPath(root, '.mcp.json'),
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
		}] as const;

		const migration = service.migrateMcpServers(activeSessionResource.get(), requested);
		await acquired.p;
		roots = [root, secondRoot];
		resolved.complete();
		const result = await migration;

		assert.deepStrictEqual(result.failures.map(failure => failure.reason), ['noLongerEligible']);
	});

	for (const [property, before, after] of [
		['gallery', { gallery: false }, { gallery: true }],
		['version', { version: '1' }, { version: '2' }],
		['dev', { dev: {} }, { dev: { watch: '*.ts' } }],
		['sandboxEnabled', { sandboxEnabled: false }, { sandboxEnabled: true }],
	] as const) {
		test(`rejects a stale ${property} removal when the provider replans before execution`, async () => {
			const root = URI.file('/stale-removal');
			const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
			const targetUri = URI.joinPath(root, '.mcp.json');
			const fileService = store.add(new FileService(new NullLogService()));
			const fileProvider = store.add(new TrackingFileSystemProvider());
			store.add(fileService.registerProvider(Schemas.file, fileProvider));
			await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({ servers: { server: { command: 'node', ...before } } })));
			const targetContent = '{"mcpServers":{}}';
			await fileService.writeFile(targetUri, VSBuffer.fromString(targetContent));
			const session = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' });
			const harnessService = new class extends TestCustomizationHarnessService {
				override readonly activeSessionResource = observableValue('activeSessionResource', session);
				override readonly activeHarness = observableValue('activeHarness', SessionType.AgentHostCopilot);
			}();
			const snapshot = createWorkspaceMcpSupportSnapshot(root);
			const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
				override acquireMcpServerSupportScope() {
					return {
						support: constObservable(snapshot),
						isResolved: constObservable(true),
						whenResolved: () => Promise.resolve(),
						dispose: () => { },
					};
				}
			}();
			const customizationService = new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override getClientWorkingDirectoryUris() { return [root]; }
			}();
			const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, customizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));
			const originalPlan = await service.computeMigration(session, CustomizationMigrationType.McpServers);
			const sourceContent = JSON.stringify({ servers: { server: { command: 'node', ...after } } });
			await fileService.writeFile(sourceUri, VSBuffer.fromString(sourceContent));
			const currentPlan = await service.computeMigration(session, CustomizationMigrationType.McpServers);
			fileProvider.resetRequests();

			const result = await service.migrateMcpServers(session, originalPlan.candidates);
			assert.deepStrictEqual({
				originalRemovals: originalPlan.candidates.map(candidate => candidate.removedProperties),
				currentRemovals: currentPlan.candidates.map(candidate => candidate.removedProperties),
				originalProjections: originalPlan.candidates.map(candidate => candidate.projectedConfiguration),
				currentProjections: currentPlan.candidates.map(candidate => candidate.projectedConfiguration),
				migratedCount: result.migratedCount,
				reasons: result.failures.map(failure => failure.reason),
				writes: fileProvider.writeRequests,
				source: (await fileService.readFile(sourceUri)).value.toString(),
				target: (await fileService.readFile(targetUri)).value.toString(),
			}, {
				originalRemovals: [before],
				currentRemovals: [after],
				originalProjections: [{ type: McpServerType.LOCAL, command: 'node' }],
				currentProjections: [{ type: McpServerType.LOCAL, command: 'node' }],
				migratedCount: 0,
				reasons: [McpServerCustomizationMigrationFailureReason.NoLongerEligible],
				writes: [],
				source: sourceContent,
				target: targetContent,
			});
		});
	}

	test('migrates when the write itself republishes an equivalent support snapshot', async () => {
		const root = URI.file('/republish');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = store.add(new FileService(new NullLogService()));
		const fileProvider = store.add(new SupportChangingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, fileProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{}}'));
		fileProvider.targetUri = targetUri;
		const activeSessionResource = observableValue('activeSessionResource', URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }));
		const activeHarness = observableValue('activeHarness', SessionType.AgentHostCopilot);
		const harnessService = new class extends TestCustomizationHarnessService {
			override readonly activeSessionResource = activeSessionResource;
			override readonly activeHarness = activeHarness;
		}();
		const snapshot = createWorkspaceMcpSupportSnapshot(root);
		const supportScope = new MutableMcpServerSupportScope(snapshot);
		const targetWriteRefreshQueued = new DeferredPromise<void>();
		fileProvider.afterTargetWrite = () => {
			supportScope.queue();
			targetWriteRefreshQueued.complete();
		};
		const activeClientService = {
			acquireMcpServerSupportScope: () => supportScope,
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getClientWorkingDirectoryUris: () => [root],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));

		const migration = await service.computeMigration(activeSessionResource.get(), CustomizationMigrationType.McpServers);
		const resultPromise = service.migrateMcpServers(activeSessionResource.get(), migration.candidates);
		await targetWriteRefreshQueued.p;
		const sourceBeforeSupportSettled = JSON.parse((await fileService.readFile(sourceUri)).value.toString());
		supportScope.settle({
			...snapshot,
			servers: snapshot.servers.map(server => ({ ...server })),
			coverage: { ...snapshot.coverage },
		});
		const result = await resultPromise;

		assert.deepStrictEqual({
			migratedCount: result.migratedCount,
			failures: result.failures.map(failure => failure.reason),
			sourceBeforeSupportSettled,
			source: JSON.parse((await fileService.readFile(sourceUri)).value.toString()),
			target: JSON.parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			migratedCount: 1,
			failures: [],
			sourceBeforeSupportSettled: { servers: { server: { command: 'node' } } },
			source: { servers: {} },
			target: { mcpServers: { server: { type: 'stdio', command: 'node', args: [], tools: ['*'] } } },
		});
	});

	test('continues remaining groups after support drops an already migrated server', async () => {
		const roots = [URI.file('/first'), URI.file('/second')];
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			...createWorkspaceMcpSupportSnapshot(roots[0]),
			servers: roots.map((root, index) => ({
				...createWorkspaceMcpSupportSnapshot(root).servers[0],
				id: `mcp.config.ws${index}.server${index}`,
				name: `server${index}`,
			})),
		};
		const scope = new MutableMcpServerSupportScope(snapshot);
		const firstCompleted = new DeferredPromise<void>();
		const firstSource = URI.joinPath(roots[0], '.vscode', 'mcp.json');
		const fileService = store.add(new FileService(new NullLogService()));
		let executing = false;
		const provider = store.add(new class extends InMemoryFileSystemProvider {
			override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
				await super.writeFile(resource, content, options);
				if (executing && isEqual(resource, firstSource)) {
					scope.queue();
					firstCompleted.complete();
				}
			}
		}());
		store.add(fileService.registerProvider(Schemas.file, provider));
		for (const [index, root] of roots.entries()) {
			await fileService.writeFile(URI.joinPath(root, '.vscode', 'mcp.json'), VSBuffer.fromString(JSON.stringify({ servers: { [`server${index}`]: { command: 'node' } } })));
		}
		const harness = new TestCustomizationHarnessService();
		const service = store.add(new CustomizationMigrationService(
			store.add(new TestPromptsService([])), harness,
			new class extends mock<IAgentHostActiveClientService>() {
				override acquireMcpServerSupportScope() { return scope; }
			}(),
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override getClientWorkingDirectoryUris() { return roots; }
			}(),
			fileService, new NullLogService(), store.add(createMigrationConfiguration()),
			configurationResolverService,
		));
		const session = harness.activeSessionResource.get();
		const plan = await service.computeMigration(session, CustomizationMigrationType.McpServers);
		executing = true;
		const pending = service.migrateMcpServers(session, plan.candidates);
		await firstCompleted.p;
		scope.settle({ ...snapshot, servers: snapshot.servers.slice(1) });
		const result = await pending;

		assert.deepStrictEqual({
			result,
			sources: await Promise.all(roots.map(async root => JSON.parse((await fileService.readFile(URI.joinPath(root, '.vscode', 'mcp.json'))).value.toString()))),
			targets: await Promise.all(roots.map(async root => JSON.parse((await fileService.readFile(URI.joinPath(root, '.mcp.json'))).value.toString()))),
		}, {
			result: { migratedCount: 2, failures: [] },
			sources: [{ servers: {} }, { servers: {} }],
			targets: [
				{ mcpServers: { server0: { type: 'stdio', command: 'node', args: [], tools: ['*'] } } },
				{ mcpServers: { server1: { type: 'stdio', command: 'node', args: [], tools: ['*'] } } },
			],
		});
	});

	test('preserves disabled state on each migrated server in its own workspace folder', async () => {
		const roots = [URI.file('/root-one'), URI.file('/root-two')];
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		for (const root of roots) {
			await fileService.writeFile(URI.joinPath(root, '.vscode', 'mcp.json'), VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		}
		const [shadowed, registered] = roots.map((root, index) => ({
			...createWorkspaceMcpSupportSnapshot(root).servers[0],
			id: `mcp.config.ws${index}.server`,
			collectionId: `mcp.config.ws${index}`,
		}));
		const supportScope = new MutableMcpServerSupportScope({
			servers: [
				{ ...shadowed, enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledNotRegistered }, delivery: AgentHostMcpServerDelivery.NotDelivered, shadowedBy: registered.id },
				{ ...registered, enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledWorkspace } },
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		});
		const enablementCalls: unknown[][] = [];
		const mcpService = new class extends TestMcpService {
			override readonly enablementModel = new class extends TestEnablementModel {
				override readEnabled(key: string) { return key === shadowed.id ? ContributionEnablementState.DisabledProfile : ContributionEnablementState.EnabledProfile; }
				override setEnabled(key: string, state: ContributionEnablementState) { enablementCalls.push(['set', key, state]); }
				override remove(key: string) { enablementCalls.push(['remove', key]); }
			}();
		}();
		const harnessService = new TestCustomizationHarnessService();
		const activeClientService = {
			acquireMcpServerSupportScope: () => supportScope,
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		// A session whose primary is the second workspace folder lists that folder first.
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getClientWorkingDirectoryUris: () => [roots[1], roots[0]],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService, mcpService, undefined, createWorkspaceContextService(...roots)));

		const migration = await service.computeMigration(harnessService.activeSessionResource.get(), CustomizationMigrationType.McpServers);
		const result = await service.migrateMcpServers(harnessService.activeSessionResource.get(), migration.candidates);

		assert.deepStrictEqual({ result, enablementCalls }, {
			result: { migratedCount: 2, failures: [] },
			enablementCalls: [
				['set', 'workspace-dot-mcp.0.server', ContributionEnablementState.DisabledProfile],
				['remove', shadowed.id],
				['set', 'workspace-dot-mcp.1.server', ContributionEnablementState.DisabledWorkspace],
				['remove', registered.id],
			],
		});
	});

	for (const [selection, label] of [['winner', 'only the server that takes precedence'], ['shadowed', 'only the shadowed server'], ['both', 'both servers']] as const) {
		test(`keeps same-named server precedence when migrating ${label}`, async () => {
			const roots = [URI.file('/root-one'), URI.file('/root-two')];
			const fileService = store.add(new FileService(new NullLogService()));
			store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
			for (const root of roots) {
				await fileService.writeFile(URI.joinPath(root, '.vscode', 'mcp.json'), VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
			}
			const [shadowed, winner] = roots.map((root, index) => ({
				...createWorkspaceMcpSupportSnapshot(root).servers[0],
				id: `mcp.config.ws${index}.server`,
				collectionId: `mcp.config.ws${index}`,
			}));
			const supportScope = new MutableMcpServerSupportScope({
				servers: [
					{ ...shadowed, enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledNotRegistered }, delivery: AgentHostMcpServerDelivery.NotDelivered, shadowedBy: winner.id },
					winner,
				],
				discoveryComplete: true,
				coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
			});
			const harnessService = new TestCustomizationHarnessService();
			const activeClientService = {
				acquireMcpServerSupportScope: () => supportScope,
			} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
			const agentHostCustomizationService = {
				onDidChangeCustomizations: Event.None,
				getClientWorkingDirectoryUris: () => roots,
			} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
			const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService, undefined, undefined, createWorkspaceContextService(...roots)));

			const migration = await service.computeMigration(harnessService.activeSessionResource.get(), CustomizationMigrationType.McpServers);
			// The winner is listed first so the shadowed server must still migrate before it.
			const selected = [...migration.candidates].reverse().filter(candidate => selection === 'both' || candidate.id === (selection === 'winner' ? winner.id : shadowed.id));
			const result = await service.migrateMcpServers(harnessService.activeSessionResource.get(), selected);

			assert.deepStrictEqual({
				migratedCount: result.migratedCount,
				failures: result.failures.map(failure => [failure.id, failure.reason]),
				targets: await Promise.all(roots.map(root => fileService.exists(URI.joinPath(root, '.mcp.json')))),
			}, {
				migratedCount: selection === 'both' ? 2 : selection === 'shadowed' ? 1 : 0,
				failures: selection === 'winner' ? [[winner.id, McpServerCustomizationMigrationFailureReason.ShadowedServerNotMigrated]] : [],
				targets: [selection !== 'winner', selection === 'both'],
			});
		});
	}

	test('abandons MCP computation when the caller cancels', async () => {
		const root = URI.file('/cancel');
		const activeSessionResource = observableValue('activeSessionResource', URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }));
		const activeHarness = observableValue('activeHarness', SessionType.AgentHostCopilot);
		const harnessService = new class extends TestCustomizationHarnessService {
			override readonly activeSessionResource = activeSessionResource;
			override readonly activeHarness = activeHarness;
		}();
		const acquired = new DeferredPromise<void>();
		const neverResolves = new DeferredPromise<void>();
		let scopeDisposed = false;
		const activeClientService = {
			acquireMcpServerSupportScope: () => {
				acquired.complete();
				return {
					support: constObservable<IAgentHostMcpServerSupportSnapshot>({
						servers: [],
						discoveryComplete: true,
						coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
					}),
					isResolved: constObservable(false),
					whenResolved: () => neverResolves.p,
					dispose: () => { scopeDisposed = true; },
				};
			},
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getClientWorkingDirectoryUris: () => [root],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));
		const tokenSource = store.add(new CancellationTokenSource());

		const migration = service.computeMigration(activeSessionResource.get(), CustomizationMigrationType.McpServers, tokenSource.token);
		await acquired.p;
		tokenSource.cancel();
		const result = await migration;

		assert.deepStrictEqual({
			candidates: result.candidates,
			servers: result.servers,
			scopeDisposed,
		}, {
			candidates: [],
			servers: [],
			scopeDisposed: true,
		});
	});

	test('keeps MCP migration candidates through remote workspace root hydration', async () => {
		const remoteRoot = URI.parse('vscode-remote://dev-container+test/workspaces/project');
		const sourceUri = URI.joinPath(remoteRoot, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(remoteRoot, '.mcp.json');
		const fileService = store.add(new FileService(new NullLogService()));
		const remoteProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.vscodeRemote, remoteProvider));
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		const snapshot = createWorkspaceMcpSupportSnapshot(remoteRoot);
		const harnessService = new TestCustomizationHarnessService();
		const session = harnessService.activeSessionResource.get();

		const compute = async (resourceUris: IAgentHostResourceUriMapper) => {
			let requestedRoots: readonly URI[] | undefined;
			const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
				override acquireMcpServerSupportScope(_sessionType: string, roots: readonly URI[] | undefined) {
					requestedRoots = roots;
					return {
						support: constObservable(snapshot),
						isResolved: constObservable(true),
						whenResolved: () => Promise.resolve(),
						dispose: () => { },
					};
				}
				override isBundledMcpServer() {
					return false;
				}
			}();
			const subscriptionChanged = store.add(new Emitter<SessionState>());
			const subscription = new class extends mock<IAgentSubscription<SessionState>>() {
				override value: SessionState | undefined;
				override get verifiedValue() { return this.value; }
				override readonly onDidChange = subscriptionChanged.event;
				override readonly onDidError = Event.None;
			}();
			const connection = {
				onDidAction: Event.None,
				rootState: { value: undefined },
				resourceUris,
				getSubscription: () => ({ object: subscription, dispose: () => { } }),
			} as unknown as IAgentConnection;
			const provisionalSessionService = {
				onDidChange: Event.None,
				get: () => URI.parse('copilot:/provisional'),
				getProvisionalWorkingDirectories: () => [remoteRoot],
			} as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService;
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(ILoggerService, store.add(new NullLoggerService()));
			instantiationService.stub(IOutputService, {
				getChannel: () => undefined,
				getChannelDescriptor: () => undefined,
				showChannel: async () => { },
			});
			const agentHostCustomizationService = store.add(new WorkbenchAgentHostCustomizationService(
				{ ambientConnection: connection } as IAgentHostConnectionsService,
				provisionalSessionService,
				instantiationService,
				new NullLogService() as ILogService,
				{ onDidDisposeSession: Event.None } as Partial<IChatService> as IChatService,
				activeClientService,
				{} as IMcpService,
				store.add(createMigrationConfiguration()),
			));
			const migrationService = store.add(new CustomizationMigrationService(
				store.add(new TestPromptsService([])),
				harnessService,
				activeClientService,
				agentHostCustomizationService,
				fileService,
				new NullLogService(),
				store.add(createMigrationConfiguration()),
				configurationResolverService,
			));

			const readMigration = async () => {
				const migration = await migrationService.computeMigration(session, CustomizationMigrationType.McpServers);
				return {
					roots: requestedRoots?.map(root => root.toString()),
					candidates: migration.candidates.map(candidate => ({
						sourceUri: candidate.sourceUri.toString(),
						targetUri: candidate.targetUri.toString(),
					})),
				};
			};
			const provisional = await readMigration();
			subscription.value = createSessionState({
				resource: 'copilot:/provisional',
				provider: 'copilot',
				title: 'Session',
				status: SessionStatus.Idle,
				createdAt: new Date(0).toISOString(),
				modifiedAt: new Date(0).toISOString(),
				workingDirectories: [remoteRoot.toString()],
			});
			subscriptionChanged.fire(subscription.value);
			return { provisional, hydrated: await readMigration() };
		};

		const identityControl = await compute(identityAgentHostResourceUriMapper);
		const remoteConnection = await compute(createAgentHostResourceUriMapper('remote-test'));
		const expectedMigration = {
			roots: [remoteRoot.toString()],
			candidates: [{ sourceUri: sourceUri.toString(), targetUri: targetUri.toString() }],
		};

		assert.deepStrictEqual({
			identityControl,
			remoteConnection,
		}, {
			identityControl: {
				provisional: expectedMigration,
				hydrated: expectedMigration,
			},
			remoteConnection: {
				provisional: expectedMigration,
				hydrated: expectedMigration,
			},
		});
	});

	for (const disconnected of [false, true]) {
		test(disconnected ? 'does not fall back to local files when the remote provider is unavailable' : 'migrates only remote configuration when local paths overlap', async () => {
			const hostRoot = URI.file('/workspace');
			const remoteRoot = toAgentHostUri(hostRoot, 'remote-test');
			const sourceUri = URI.joinPath(remoteRoot, '.vscode', 'mcp.json');
			const targetUri = URI.joinPath(remoteRoot, '.mcp.json');
			const localSourceUri = URI.joinPath(hostRoot, '.vscode', 'mcp.json');
			const fileService = store.add(new FileService(new NullLogService()));
			const localAccesses: URI[] = [];
			const localProvider = store.add(new class extends InMemoryFileSystemProvider {
				override readFile(resource: URI): Promise<Uint8Array> {
					localAccesses.push(resource);
					return super.readFile(resource);
				}
				override writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
					localAccesses.push(resource);
					return super.writeFile(resource, content, options);
				}
			}());
			const remoteProvider = store.add(new InMemoryFileSystemProvider());
			store.add(fileService.registerProvider(Schemas.file, localProvider));
			const remoteRegistration = store.add(fileService.registerProvider(AGENT_HOST_SCHEME, remoteProvider));
			const sourceContent = '{"servers":{"server":{"command":"node"}}}';
			await fileService.writeFile(localSourceUri, VSBuffer.fromString(sourceContent));
			await fileService.writeFile(sourceUri, VSBuffer.fromString(sourceContent));
			localAccesses.length = 0;

			const snapshot: IAgentHostMcpServerSupportSnapshot = {
				servers: [hostRoot, remoteRoot].map((root, index) => ({
					id: `mcp.config.ws${index}.server`,
					name: 'server',
					collectionId: `mcp.config.ws${index}`,
					source: {
						group: undefined,
						kind: AgentHostMcpServerSourceKind.VscodeWorkspaceFolder,
						label: 'Workspace',
						collectionUri: URI.joinPath(root, '.vscode', 'mcp.json'),
						definitionLocation: undefined,
						remoteAuthority: null,
						extensionId: undefined,
						pluginUri: undefined,
					},
					enablement: { enabled: true, state: AgentHostMcpServerEnablementState.EnabledWorkspace },
					applicability: AgentHostMcpServerApplicability.Applicable,
					delivery: AgentHostMcpServerDelivery.ClientForwarded,
					compatibility: { kind: 'supported' },
					projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
				})),
				discoveryComplete: true,
				coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
			};
			let requestedRoots: readonly URI[] | undefined;
			const activeClientService = new class extends mock<IAgentHostActiveClientService>() {
				override acquireMcpServerSupportScope(_sessionType: string, roots: readonly URI[] | undefined) {
					requestedRoots = roots;
					return {
						support: constObservable(snapshot),
						isResolved: constObservable(true),
						whenResolved: () => Promise.resolve(),
						dispose: () => { },
					};
				}
			}();
			const agentHostCustomizationService = new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override getWorkingDirectories() { return [hostRoot.toString()]; }
				override getClientWorkingDirectoryUris() { return [remoteRoot]; }
			}();
			const harnessService = new TestCustomizationHarnessService();
			const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration()), configurationResolverService));
			const session = harnessService.activeSessionResource.get();
			const migration = await service.computeMigration(session, CustomizationMigrationType.McpServers);
			if (disconnected) {
				remoteRegistration.dispose();
			}
			const result = await service.migrateMcpServers(session, migration.candidates);

			assert.deepStrictEqual({
				requestedRoots: requestedRoots?.map(root => root.toString()),
				candidates: migration.candidates.map(candidate => [candidate.sourceUri.toString(), candidate.targetUri.toString()]),
				migratedCount: result.migratedCount,
				failures: result.failures.map(failure => failure.reason),
				localAccesses: localAccesses.map(resource => resource.toString()),
				localSource: (await fileService.readFile(localSourceUri)).value.toString(),
				localTargetExists: await fileService.exists(URI.joinPath(hostRoot, '.mcp.json')),
				remoteSource: JSON.parse(VSBuffer.wrap(await remoteProvider.readFile(sourceUri)).toString()),
				remoteTarget: disconnected ? undefined : JSON.parse((await fileService.readFile(targetUri)).value.toString()),
			}, {
				requestedRoots: [remoteRoot.toString()],
				candidates: [[sourceUri.toString(), targetUri.toString()]],
				migratedCount: disconnected ? 0 : 1,
				failures: disconnected ? ['noLongerEligible'] : [],
				localAccesses: [],
				localSource: sourceContent,
				localTargetExists: false,
				remoteSource: disconnected ? { servers: { server: { command: 'node' } } } : { servers: {} },
				remoteTarget: disconnected ? undefined : { mcpServers: { server: { type: 'stdio', command: 'node', args: [], tools: ['*'] } } },
			});
		});
	}
});
