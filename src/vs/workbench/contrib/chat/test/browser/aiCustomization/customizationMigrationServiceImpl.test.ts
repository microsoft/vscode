/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileService, IFileWriteOptions } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { CustomizationMigrationService } from '../../../browser/aiCustomization/customizationMigrationServiceImpl.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, AgentHostMcpServerEnablementState, AgentHostMcpServerSourceKind, AgentHostMcpSupportReason, IAgentHostMcpServerSupportSnapshot } from '../../../browser/agentSessions/agentHost/agentHostMcpServerSupport.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { CustomizationMigrationHintTarget, CustomizationMigrationType, getCustomizationMigrationEnablementSetting } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptPath, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { MockPromptsService } from '../../common/promptSyntax/service/mockPromptsService.js';

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

	constructor(
		private readonly sessionType = SessionType.AgentHostCopilot,
		private readonly harnessLabel = 'Copilot',
	) {
		super();
		this.activeSessionResource = observableValue('activeSessionResource', URI.from({ scheme: sessionType, path: '/session' }));
		this.activeHarness = observableValue('activeHarness', sessionType);
	}

	override findHarnessById(sessionType: string): IHarnessDescriptor | undefined {
		if (sessionType !== this.sessionType) {
			return undefined;
		}
		return {
			id: sessionType,
			label: this.harnessLabel,
			icon: Codicon.copilot,
			itemProvider: {
				onDidChange: Event.None,
				provideChatSessionCustomizations: async () => [],
				provideSourceFolders: async (_sessionResource, type) => {
					this.requestedSourceFolderTypes.push(type);
					switch (type) {
						case PromptsType.agent:
							return [{ uri: URI.file('/copilot/agents'), label: 'Agents', source: PromptsStorage.user }];
						case PromptsType.skill:
							return [
								{ uri: URI.file('/workspace/.github/skills'), label: 'Workspace Skills', source: PromptsStorage.local },
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

const customizationMigrationTypes = [
	CustomizationMigrationType.UserData,
	CustomizationMigrationType.PromptFiles,
	CustomizationMigrationType.ConfiguredLocations,
	CustomizationMigrationType.McpServers,
] as const;

class DisposableTestConfigurationService extends TestConfigurationService {
	dispose(): void {
		this.onDidChangeConfigurationEmitter.dispose();
	}
}

function createMigrationConfiguration(overrides: Partial<Record<CustomizationMigrationType, boolean>> = {}): DisposableTestConfigurationService {
	const configuration: Record<string, boolean> = Object.create(null);
	for (const type of customizationMigrationTypes) {
		configuration[getCustomizationMigrationEnablementSetting(type)] = overrides[type] ?? true;
	}
	return new DisposableTestConfigurationService(configuration);
}

function setMigrationEnabled(configurationService: TestConfigurationService, type: CustomizationMigrationType, enabled: boolean): Promise<void> {
	return configurationService.setUserConfiguration(getCustomizationMigrationEnablementSetting(type), enabled);
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
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration())));
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
			],
			localMigrations: [
				{ type: 'userData', files: [], candidates: [] },
				{ type: 'promptFiles', files: [], candidates: [] },
				{ type: 'configuredLocations', files: [], candidates: [] },
				{
					type: 'mcpServers',
					servers: [],
					candidates: [],
					discoveryComplete: true,
					coverage: {
						restrictedByMcpAccess: false,
						restrictedByCustomizationPolicy: false,
					},
				},
			],
			hint: {
				message: 'Found 2 workspace and 3 user customizations that are present but not used by Copilot and could be migrated. Found 1 MCP server that is not fully supported by Copilot.',
				target: CustomizationMigrationHintTarget.FileMigrations,
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
			requestedSessionType: SessionType.AgentHostCopilot,
			requestedRoots: ['/workspace'],
			supportScopeDisposed: true,
		});
	});

	test('uses the session harness label in migration hints', async () => {
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
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration())));

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostClaude, path: '/session' }));

		assert.deepStrictEqual(hint, {
			message: 'Found 1 workspace customization file that is present but not used by Claude and could be migrated.',
			target: CustomizationMigrationHintTarget.FileMigrations,
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
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration())));

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostClaude, path: '/session' }));

		assert.deepStrictEqual(hint, {
			message: 'Found 2 workspace and 2 user customizations that are present but not used by Claude and could be migrated.',
			target: CustomizationMigrationHintTarget.FileMigrations,
		});
	});

	test('reports unsupported MCP servers when there are no file migrations', async () => {
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
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration())));

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }));

		assert.deepStrictEqual(hint, {
			message: 'Found 2 MCP servers that are not fully supported by Copilot.',
			target: CustomizationMigrationHintTarget.McpServers,
		});
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
		const configurationService = store.add(createMigrationConfiguration({ [CustomizationMigrationType.McpServers]: false }));
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), configurationService));

		const disabledMigration = await service.computeMigration(activeSessionResource.get(), CustomizationMigrationType.McpServers);
		const disabledHint = await service.computeMigrationHint(activeSessionResource.get());
		const disabledPlanningReads = fileProvider.readRequests.map(resource => resource.path);
		fileProvider.resetRequests();
		await setMigrationEnabled(configurationService, CustomizationMigrationType.McpServers, true);
		const enabledMigration = await service.computeMigration(activeSessionResource.get(), CustomizationMigrationType.McpServers);
		const enabledPlanningReads = fileProvider.readRequests.map(resource => resource.path);
		fileProvider.resetRequests();
		await setMigrationEnabled(configurationService, CustomizationMigrationType.McpServers, false);
		const disabledExecutionResult = await service.migrateMcpServers(activeSessionResource.get(), enabledMigration.candidates);
		const disabledExecutionReads = fileProvider.readRequests.map(resource => resource.path);
		const disabledExecutionWrites = fileProvider.writeRequests.map(resource => resource.path);
		fileProvider.resetRequests();
		await setMigrationEnabled(configurationService, CustomizationMigrationType.McpServers, true);
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
				servers: [{ id: 'mcp.config.ws0.server', name: 'server', supported: true }],
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
			target: { mcpServers: { server: { type: 'stdio', command: 'node' } } },
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
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration())));
		const requested = [{
			type: CustomizationMigrationType.McpServers,
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
			result: { migratedCount: 0, failures: ['noLongerEligible'] },
			reads: [],
			writes: [],
			source: { servers: { server: { command: 'node' } } },
			target: { mcpServers: {} },
		});
	});

	test('keeps MCP support diagnostics when MCP migration is disabled', async () => {
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
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration({ [CustomizationMigrationType.McpServers]: false }))));

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
				servers: [
					{ id: 'mcp.config.ws0.supported', name: 'supported', supported: true },
					{ id: 'mcp.config.ws0.unsupported', name: 'unsupported', supported: false },
				],
				candidates: [],
			},
			hint: {
				message: 'Found 1 MCP server that is not fully supported by Copilot.',
				target: CustomizationMigrationHintTarget.McpServers,
			},
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
		const configurationService = store.add(createMigrationConfiguration({
			[CustomizationMigrationType.UserData]: false,
			[CustomizationMigrationType.PromptFiles]: false,
			[CustomizationMigrationType.ConfiguredLocations]: false,
			[CustomizationMigrationType.McpServers]: false,
		}));
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), configurationService));
		const sessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' });

		const disabledMigrations = await service.computeMigrations(sessionResource);
		const disabledHint = await service.computeMigrationHint(sessionResource);
		const disabledRequestedTypes = [...promptsService.requestedTypes];
		const disabledSourceFolderTypes = [...harnessService.requestedSourceFolderTypes];
		promptsService.requestedTypes.length = 0;
		harnessService.requestedSourceFolderTypes.length = 0;
		await setMigrationEnabled(configurationService, CustomizationMigrationType.PromptFiles, true);
		const promptOnlyHint = await service.computeMigrationHint(sessionResource);

		assert.deepStrictEqual({
			disabledMigrations: disabledMigrations.map(migration => ({
				type: migration.type,
				candidates: migration.candidates.length,
				...(migration.type === CustomizationMigrationType.McpServers ? { servers: migration.servers.length } : { files: migration.files.length }),
			})),
			disabledHint,
			disabledRequestedTypes,
			disabledSourceFolderTypes,
			promptOnlyHint,
			promptOnlyRequestedTypes: promptsService.requestedTypes,
			promptOnlySourceFolderTypes: harnessService.requestedSourceFolderTypes,
		}, {
			disabledMigrations: [
				{ type: 'userData', candidates: 0, files: 0 },
				{ type: 'promptFiles', candidates: 0, files: 0 },
				{ type: 'configuredLocations', candidates: 0, files: 0 },
				{ type: 'mcpServers', candidates: 0, servers: 0 },
			],
			disabledHint: undefined,
			disabledRequestedTypes: [],
			disabledSourceFolderTypes: [],
			promptOnlyHint: {
				message: 'Found 1 workspace customization file that is present but not used by Copilot and could be migrated.',
				target: CustomizationMigrationHintTarget.FileMigrations,
			},
			promptOnlyRequestedTypes: [PromptsType.prompt],
			promptOnlySourceFolderTypes: [PromptsType.skill],
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
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration())));
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
				message: 'Found 1 workspace MCP server that can be migrated for Copilot.',
				target: CustomizationMigrationHintTarget.FileMigrations,
			},
			result: { migratedCount: 0, failures: ['noLongerEligible'] },
			changedDuringWriteResult: { migratedCount: 0, failures: ['noLongerEligible'] },
			sourceBeforeSupportSettled: '{"servers":{"server":{"command":"node"}}}',
			source: '{"servers":{"server":{"command":"node"}}}',
			target: '{"mcpServers":{}}',
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
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration())));
		const requested = [{
			type: CustomizationMigrationType.McpServers,
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
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration())));

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
			target: { mcpServers: { server: { type: 'stdio', command: 'node' } } },
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
				{ mcpServers: { server0: { type: 'stdio', command: 'node' } } },
				{ mcpServers: { server1: { type: 'stdio', command: 'node' } } },
			],
		});
	});

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
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService(), store.add(createMigrationConfiguration())));
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
			const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService(), store.add(createMigrationConfiguration())));
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
				remoteTarget: disconnected ? undefined : { mcpServers: { server: { type: 'stdio', command: 'node' } } },
			});
		});
	}
});
