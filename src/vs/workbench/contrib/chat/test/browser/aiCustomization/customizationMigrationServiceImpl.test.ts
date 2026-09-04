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
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
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
import { CustomizationMigrationHintTarget, CustomizationMigrationType } from '../../../common/promptSyntax/service/customizationMigrationService.js';
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
			getWorkingDirectories: () => [root.toString()],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService()));
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
			override getWorkingDirectories() { return []; }
		}();
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService()));

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
			override getWorkingDirectories() { return []; }
		}();
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService()));

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
			override getWorkingDirectories() { return []; }
		}();
		const service = store.add(new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService()));

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }));

		assert.deepStrictEqual(hint, {
			message: 'Found 2 MCP servers that are not fully supported by Copilot.',
			target: CustomizationMigrationHintTarget.McpServers,
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
		let snapshot: IAgentHostMcpServerSupportSnapshot = {
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
		const supportedSnapshot = snapshot;
		const snapshotObservable = observableValue('snapshot', snapshot);
		const activeClientService = {
			acquireMcpServerSupportScope: () => ({
				support: snapshotObservable,
				isResolved: constObservable(true),
				whenResolved: () => Promise.resolve(),
				dispose: () => { },
			}),
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getWorkingDirectories: () => [root.toString()],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService()));
		const migration = await service.computeMigration(activeSessionResource.get(), CustomizationMigrationType.McpServers);
		const hint = await service.computeMigrationHint(activeSessionResource.get());
		snapshot = {
			...snapshot,
			servers: snapshot.servers.map(server => ({ ...server, compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.LaunchNotRepresentable] } })),
		};
		snapshotObservable.set(snapshot, undefined);
		const result = await service.migrateMcpServers(activeSessionResource.get(), migration.candidates);
		snapshot = supportedSnapshot;
		snapshotObservable.set(snapshot, undefined);
		fileProvider.afterTargetWrite = () => {
			snapshot = {
				...supportedSnapshot,
				servers: supportedSnapshot.servers.map(server => ({
					...server,
					enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledWorkspace },
				})),
			};
			snapshotObservable.set(snapshot, undefined);
		};
		const changedDuringWriteResult = await service.migrateMcpServers(activeSessionResource.get(), migration.candidates);

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
		let roots = [root.toString()];
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getWorkingDirectories: () => roots,
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService()));
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
		roots = [root.toString(), secondRoot.toString()];
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
		const snapshotObservable = observableValue('snapshot', snapshot);
		// The support scope watches MCP definitions, so migrating republishes an equal-but-new snapshot.
		fileProvider.afterTargetWrite = () => snapshotObservable.set({
			...snapshot,
			servers: snapshot.servers.map(server => ({ ...server })),
			coverage: { ...snapshot.coverage },
		}, undefined);
		const activeClientService = {
			acquireMcpServerSupportScope: () => ({
				support: snapshotObservable,
				isResolved: constObservable(true),
				whenResolved: () => Promise.resolve(),
				dispose: () => { },
			}),
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const agentHostCustomizationService = {
			onDidChangeCustomizations: Event.None,
			getWorkingDirectories: () => [root.toString()],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, fileService, new NullLogService()));

		const migration = await service.computeMigration(activeSessionResource.get(), CustomizationMigrationType.McpServers);
		const result = await service.migrateMcpServers(activeSessionResource.get(), migration.candidates);

		assert.deepStrictEqual({
			migratedCount: result.migratedCount,
			failures: result.failures.map(failure => failure.reason),
			source: JSON.parse((await fileService.readFile(sourceUri)).value.toString()),
			target: JSON.parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			migratedCount: 1,
			failures: [],
			source: { servers: {} },
			target: { mcpServers: { server: { type: 'stdio', command: 'node' } } },
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
			getWorkingDirectories: () => [root.toString()],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = store.add(new CustomizationMigrationService(store.add(new TestPromptsService([])), harnessService, activeClientService, agentHostCustomizationService, {} as IFileService, new NullLogService()));
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
});
