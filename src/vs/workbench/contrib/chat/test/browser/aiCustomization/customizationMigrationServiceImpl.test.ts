/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMigrationService } from '../../../browser/aiCustomization/customizationMigrationServiceImpl.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, AgentHostMcpServerEnablementState, AgentHostMcpServerSourceKind, AgentHostMcpSupportReason, IAgentHostMcpServerSupportSnapshot } from '../../../browser/agentSessions/agentHost/agentHostMcpServerSupport.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { CustomizationMigrationType } from '../../../common/promptSyntax/service/customizationMigrationService.js';
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

class TestCustomizationHarnessService extends mock<ICustomizationHarnessService>() {
	readonly requestedSourceFolderTypes: PromptsType[] = [];

	constructor(
		private readonly sessionType = SessionType.AgentHostCopilot,
		private readonly harnessLabel = 'Copilot',
	) {
		super();
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
			getWorkingDirectories: () => [root.fsPath],
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const service = new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService);
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
					type: 'mcpServers',
					servers: [
						{ id: 'supported', name: 'Supported server', supported: true },
						{ id: 'unsupported', name: 'Unsupported server', supported: false },
					],
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
				{
					type: 'mcpServers',
					servers: [],
					discoveryComplete: true,
					coverage: {
						restrictedByMcpAccess: false,
						restrictedByCustomizationPolicy: false,
					},
				},
			],
			hint: 'Found 3 customization files that are present but not used by Copilot and could be migrated. Found 1 MCP server that is not fully supported by Copilot.',
			localHint: undefined,
			requestedTypes: [
				PromptsType.agent, PromptsType.instructions, PromptsType.prompt,
				PromptsType.agent, PromptsType.instructions, PromptsType.prompt,
			],
			requestedSourceFolderTypes: [
				PromptsType.agent, PromptsType.agent, PromptsType.instructions,
				PromptsType.instructions, PromptsType.skill, PromptsType.skill,
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
			override getWorkingDirectories() { return []; }
		}();
		const service = new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService);

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostClaude, path: '/session' }));

		assert.strictEqual(hint, 'Found 1 customization file that is present but not used by Claude and could be migrated.');
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
			override getWorkingDirectories() { return []; }
		}();
		const service = new CustomizationMigrationService(promptsService, harnessService, activeClientService, agentHostCustomizationService);

		const hint = await service.computeMigrationHint(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/session' }));

		assert.strictEqual(hint, 'Found 2 MCP servers that are not fully supported by Copilot.');
	});
});
