/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Configuration, ConfigurationModel } from '../../../../../platform/configuration/common/configurationModels.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, Workspace, toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ChatConfiguration, ChatPermissionLevel, CopilotHarnessIntroductionMode, getChatPermissionLevelFromDefaultConfiguration, getComputedDefaultSessionResource, getComputedDefaultSessionType, getCopilotHarnessIntroductionMode, getDefaultNewChatSessionResource, getDefaultNewChatSessionType, getDefaultNewChatSessionTypeAndReason, getDefaultNewChatSessionTypeAndReasonFromServices, getLocalFallbackSessionTypeSelectionReason, IDefaultNewChatSessionTypeOptions, isEditorLocalAgentEnabled, isNewChatSessionTypeUsable, isVisibleEditorChatSessionType, recordUserSelectedSessionType } from '../../common/constants.js';
import { localChatSessionType, SessionType, IChatSessionsExtensionPoint, IChatSessionsService } from '../../common/chatSessionsService.js';
import { MockChatSessionsService } from './mockChatSessionsService.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { getRememberedSessionType, storeUserSelectedSessionType } from '../../common/chatSessionTypePreference.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { getAgentHostPolicyGaps } from '../../../../../platform/agentHost/common/agentHostPolicyReadiness.js';
import { Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';

suite('ChatConfiguration defaults', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const localWorkspace = createWorkspace(URI.file('/workspace'));

	function createWorkspace(...resources: URI[]): Workspace {
		return new Workspace(
			resources.map(resource => resource.toString()).join(','),
			resources.map(toWorkspaceFolder),
			false,
			null,
			() => false,
		);
	}

	test('normalizes the Copilot harness introduction mode', () => {
		assert.deepStrictEqual([
			getCopilotHarnessIntroductionMode(new TestConfigurationService({ [ChatConfiguration.CopilotHarnessIntroductionMode]: CopilotHarnessIntroductionMode.NewSession })),
			getCopilotHarnessIntroductionMode(new TestConfigurationService({ [ChatConfiguration.CopilotHarnessIntroductionMode]: CopilotHarnessIntroductionMode.AfterRequest })),
			getCopilotHarnessIntroductionMode(new TestConfigurationService({ [ChatConfiguration.CopilotHarnessIntroductionMode]: 'unexpected' })),
		], [
			CopilotHarnessIntroductionMode.NewSession,
			CopilotHarnessIntroductionMode.AfterRequest,
			CopilotHarnessIntroductionMode.Off,
		]);
	});

	function createChatSessionsService(...types: string[]): MockChatSessionsService {
		const service = new MockChatSessionsService();
		service.setContributions(types.map(type => ({
			type,
			name: type,
			displayName: type,
			description: type,
		} satisfies IChatSessionsExtensionPoint)));
		return service;
	}

	suite('enterprise policy diagnostics preserve existing rollout selection', () => {
		const legacyRequirements = [
			{ policy: 'ChatMCP', setting: 'chat.mcp.access', value: 'none', reportsGap: true },
			{ policy: 'ChatHooks', setting: 'chat.useHooks', value: false, reportsGap: true },
			{ policy: 'ChatPluginsEnabled', setting: 'chat.plugins.enabled', value: false, reportsGap: true },
			{ policy: 'ChatToolsEligibleForAutoApproval', setting: 'chat.tools.eligibleForAutoApproval', value: { tool: false }, reportsGap: true },
			{ policy: 'ChatAgentSandboxEnabled', setting: 'chat.agent.sandbox.enabled', value: 'on', reportsGap: false },
			{ policy: 'ChatAgentSandboxAllowNetwork', setting: 'chat.agent.sandbox.network.allowNetwork', value: false, reportsGap: false },
			{ policy: 'ChatAgentSandboxAllowUnsandboxedCommands', setting: 'chat.agent.sandbox.allowUnsandboxedCommands', value: false, reportsGap: false },
		];
		setup(() => {
			sinon.stub(Registry.as<IConfigurationRegistry>(Extensions.Configuration), 'getPolicyConfigurations')
				.returns(new Map([...legacyRequirements.map(({ policy, setting }): [string, string] => [policy, setting]), ['ChatAllowManagedMcpServersOnly', 'chat.mcp.allowManagedServersOnly']]));
		});
		teardown(() => sinon.restore());

		function createRestrictedConfiguration(settings: Record<string, unknown> = {}) {
			const configuration = new TestConfigurationService({ [ChatConfiguration.DefaultToCopilotHarness]: true, ...settings });
			disposables.add(configuration.onDidChangeConfigurationEmitter);
			const inspection = sinon.stub(configuration, 'inspect').callThrough();
			inspection.withArgs('chat.mcp.access').returns({ policyValue: 'none' });
			inspection.withArgs('chat.useHooks').returns({ policyValue: false });
			return { configuration, inspection };
		}

		test('legacy gaps remain visible and retired sandbox policies stay excluded without changing either rollout default', () => {
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			for (const { policy, setting, value, reportsGap } of legacyRequirements) {
				for (const rolloutDefault of [false, true]) {
					const { configuration, inspection } = createRestrictedConfiguration({
						[ChatConfiguration.DefaultToCopilotHarness]: rolloutDefault,
						'chat.agent.sandbox.enabled': 'on',
						'chat.agent.sandbox.enabledWindows': 'on',
					});
					inspection.withArgs('chat.mcp.access').returns({});
					inspection.withArgs('chat.useHooks').returns({});
					inspection.withArgs(setting).returns({ policyValue: value });
					const expected = rolloutDefault ? SessionType.AgentHostCopilot : localChatSessionType;
					assert.deepStrictEqual({
						gaps: getAgentHostPolicyGaps(configuration).map(gap => gap.policyName),
						computed: getComputedDefaultSessionType(configuration, sessions, localWorkspace, true),
						resolved: resolveSessionTypeWithReason(configuration, sessions, storage, localWorkspace, true),
					}, { gaps: reportsGap ? [policy] : [], computed: expected, resolved: { sessionType: expected, selectionReason: 'computedDefault' } });
				}
			}
		});

		test('applied gaps do not change the Copilot default or expose a hidden Local picker entry', () => {
			const { configuration } = createRestrictedConfiguration({
				[ChatConfiguration.EditorPreferCopilotHarness]: true,
				[ChatConfiguration.EditorLocalAgentEnabled]: false,
			});
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			assert.deepStrictEqual({
				reported: getAgentHostPolicyGaps(configuration).map(gap => gap.policyName),
				computed: getComputedDefaultSessionType(configuration, sessions, localWorkspace, true),
				resolved: resolveSessionTypeWithReason(configuration, sessions, storage, localWorkspace, true),
				visible: isVisibleEditorChatSessionType(localChatSessionType, configuration, sessions, localWorkspace),
				localExperiment: configuration.getValue(ChatConfiguration.EditorLocalAgentEnabled),
			}, {
				reported: ['ChatHooks', 'ChatMCP'],
				computed: SessionType.AgentHostCopilot,
				resolved: { sessionType: SessionType.AgentHostCopilot, selectionReason: 'computedDefault' },
				visible: false,
				localExperiment: false,
			});
		});

		test('applied gaps preserve remembered and inherited Copilot choices and selection reasons', () => {
			const { configuration } = createRestrictedConfiguration();
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			const inherited = resolveSessionTypeWithReason(configuration, sessions, storage, localWorkspace, true, { currentSessionType: SessionType.AgentHostCopilot });
			storeUserSelectedSessionType(storage, SessionType.AgentHostCopilot);
			assert.deepStrictEqual({
				inherited,
				remembered: resolveSessionTypeWithReason(configuration, sessions, storage, localWorkspace, true),
				saved: getRememberedSessionType(storage),
			}, {
				inherited: { sessionType: SessionType.AgentHostCopilot, selectionReason: 'currentSession' },
				remembered: { sessionType: SessionType.AgentHostCopilot, selectionReason: 'rememberedSelection' },
				saved: SessionType.AgentHostCopilot,
			});
		});

		test('explicit selection, other providers, and virtual workspaces retain their semantics', () => {
			const { configuration } = createRestrictedConfiguration();
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude, SessionType.AgentHostCodex, 'remote-agent-host');
			const storage = disposables.add(new TestStorageService());
			assert.deepStrictEqual({
				explicit: resolveSessionTypeWithReason(configuration, sessions, storage, localWorkspace, true, { explicitOverride: SessionType.AgentHostCopilot }),
				others: [SessionType.AgentHostClaude, SessionType.AgentHostCodex, 'remote-agent-host'].map(type =>
					getDefaultNewChatSessionType(configuration, sessions, storage, localWorkspace, true, { currentSessionType: type })),
				virtual: getDefaultNewChatSessionType(configuration, sessions, storage, createWorkspace(URI.parse('vscode-vfs://test/repo')), true),
			}, {
				explicit: { sessionType: SessionType.AgentHostCopilot, selectionReason: 'explicitOverride' },
				others: [SessionType.AgentHostClaude, SessionType.AgentHostCodex, 'remote-agent-host'],
				virtual: localChatSessionType,
			});
		});

		test('diagnostic gaps do not override the enterprise sandbox floor', () => {
			const { configuration } = createRestrictedConfiguration();
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			assert.deepStrictEqual({
				resolved: getDefaultNewChatSessionTypeAndReasonFromServices(configuration, sessions, storage, localWorkspace, true, undefined, true),
				computed: getComputedDefaultSessionType(configuration, sessions, localWorkspace, true, true),
				localEnabled: isEditorLocalAgentEnabled(configuration, localWorkspace, true),
			}, {
				resolved: { sessionType: SessionType.AgentHostCopilot, selectionReason: 'computedDefault' },
				computed: SessionType.AgentHostCopilot,
				localEnabled: false,
			});
		});

		test('applied gaps preserve provider ordering when Local is hidden', () => {
			const { configuration } = createRestrictedConfiguration({
				[ChatConfiguration.DefaultToCopilotHarness]: false,
				[ChatConfiguration.EditorLocalAgentEnabled]: false,
			});
			assert.deepStrictEqual(
				[SessionType.AgentHostCopilot, SessionType.AgentHostClaude, SessionType.AgentHostCodex].map(type =>
					getComputedDefaultSessionType(configuration, createChatSessionsService(type), localWorkspace, true)),
				[SessionType.AgentHostCopilot, SessionType.AgentHostClaude, SessionType.AgentHostCodex],
			);
		});

		test('policy removal clears diagnostics without changing harness selection', () => {
			const { configuration, inspection } = createRestrictedConfiguration();
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			const resolve = () => getDefaultNewChatSessionType(configuration, sessions, storage, localWorkspace, true);
			const before = { sessionType: resolve(), gaps: getAgentHostPolicyGaps(configuration).map(gap => gap.policyName) };
			inspection.withArgs('chat.mcp.access').returns({});
			inspection.withArgs('chat.useHooks').returns({});
			assert.deepStrictEqual({
				before,
				after: { sessionType: resolve(), gaps: getAgentHostPolicyGaps(configuration).map(gap => gap.policyName) },
			}, {
				before: { sessionType: SessionType.AgentHostCopilot, gaps: ['ChatHooks', 'ChatMCP'] },
				after: { sessionType: SessionType.AgentHostCopilot, gaps: [] },
			});
		});

		test('applied gaps neither veto nor enroll users in experiment-driven Agent Host selection', () => {
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			for (const rolloutDefault of [false, true]) {
				for (const applied of [false, true]) {
					const { configuration, inspection } = createRestrictedConfiguration({
						[ChatConfiguration.DefaultToCopilotHarness]: rolloutDefault,
					});
					if (!applied) {
						inspection.withArgs('chat.mcp.access').returns({});
						inspection.withArgs('chat.useHooks').returns({});
					}
					const expected = rolloutDefault ? SessionType.AgentHostCopilot : localChatSessionType;
					assert.deepStrictEqual({
						computed: getComputedDefaultSessionType(configuration, sessions, localWorkspace, true),
						resolved: resolveSessionTypeWithReason(configuration, sessions, storage, localWorkspace, true),
						rolloutDefault: configuration.getValue(ChatConfiguration.DefaultToCopilotHarness),
						remembered: getRememberedSessionType(storage),
					}, { computed: expected, resolved: { sessionType: expected, selectionReason: 'computedDefault' }, rolloutDefault, remembered: undefined });
				}
			}
		});

		test('applied gaps preserve the Copilot preference and its selection reason', () => {
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			const { configuration } = createRestrictedConfiguration({
				[ChatConfiguration.DefaultToCopilotHarness]: false,
				[ChatConfiguration.EditorPreferCopilotHarness]: true,
			});
			assert.deepStrictEqual(resolveSessionTypeWithReason(configuration, sessions, storage, localWorkspace, true),
				{ sessionType: SessionType.AgentHostCopilot, selectionReason: 'copilotPreference' });
		});

		test('review-only applied policies do not override experiment selection', () => {
			const { configuration, inspection } = createRestrictedConfiguration();
			inspection.withArgs('chat.mcp.access').returns({});
			inspection.withArgs('chat.useHooks').returns({});
			inspection.withArgs('chat.mcp.allowManagedServersOnly').returns({ policyValue: true });
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			assert.deepStrictEqual(getAgentHostPolicyGaps(configuration).map(gap => gap.policyName), ['ChatAllowManagedMcpServersOnly']);
			assert.deepStrictEqual(resolveSessionTypeWithReason(configuration, sessions, storage, localWorkspace, true),
				{ sessionType: SessionType.AgentHostCopilot, selectionReason: 'computedDefault' });
		});

		test('diagnostics cannot enable an unavailable Agent Host', () => {
			const { configuration } = createRestrictedConfiguration();
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			assert.strictEqual(getDefaultNewChatSessionType(configuration, sessions, storage, localWorkspace, false), localChatSessionType);
		});

		test('real configuration layering preserves rollout changes and policy-over-user harness preference', () => {
			const logService = new NullLogService();
			const empty = () => ConfigurationModel.createEmptyModel(logService);
			const defaults = empty();
			defaults.setValue(ChatConfiguration.DefaultToCopilotHarness, true);
			const policy = empty();
			policy.setValue('chat.mcp.access', 'none');
			policy.setValue(ChatConfiguration.EditorPreferCopilotHarness, false);
			const user = empty();
			user.setValue(ChatConfiguration.EditorPreferCopilotHarness, true);
			const model = new Configuration(defaults, policy, empty(), user, empty(), empty(), new ResourceMap(), empty(), new ResourceMap(), logService);
			const configuration = new TestConfigurationService();
			disposables.add(configuration.onDidChangeConfigurationEmitter);
			const values = sinon.stub(configuration, 'getValue').callThrough();
			for (const key of [ChatConfiguration.DefaultToCopilotHarness, ChatConfiguration.EditorPreferCopilotHarness]) {
				values.withArgs(key).callsFake(() => model.getValue(key, {}, localWorkspace));
			}
			const inspection = sinon.stub(configuration, 'inspect').callThrough();
			inspection.withArgs('chat.mcp.access').callsFake(() => model.inspect('chat.mcp.access', {}, localWorkspace));
			const sessions = createChatSessionsService(SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			const resolve = () => getDefaultNewChatSessionType(configuration, sessions, storage, localWorkspace, true);
			assert.strictEqual(resolve(), SessionType.AgentHostCopilot);
			assert.strictEqual(defaults.getValue(ChatConfiguration.DefaultToCopilotHarness), true);
			defaults.setValue(ChatConfiguration.DefaultToCopilotHarness, false);
			model.updateDefaultConfiguration(defaults);
			assert.strictEqual(resolve(), localChatSessionType);
			policy.setValue(ChatConfiguration.EditorPreferCopilotHarness, true);
			model.updatePolicyConfiguration(policy);
			assert.strictEqual(resolve(), SessionType.AgentHostCopilot);
		});

		test('applied gaps do not make a hidden remembered Local choice usable', () => {
			const { configuration } = createRestrictedConfiguration({
				[ChatConfiguration.DefaultToCopilotHarness]: false,
				[ChatConfiguration.EditorLocalAgentEnabled]: false,
			});
			const sessions = createChatSessionsService(SessionType.AgentHostClaude, SessionType.AgentHostCopilot);
			const storage = disposables.add(new TestStorageService());
			storeUserSelectedSessionType(storage, localChatSessionType);
			assert.strictEqual(resolveSessionTypeWithReason(configuration, sessions, storage, localWorkspace, true).sessionType, SessionType.AgentHostClaude);
		});
	});

	function resolveSessionType(
		configurationService: IConfigurationService,
		chatSessionsService: IChatSessionsService,
		storageService: IStorageService,
		workspace: Workspace,
		agentHostEnabled: boolean,
		options?: IDefaultNewChatSessionTypeOptions,
	) {
		const accessor = disposables.add(new TestInstantiationService());
		accessor.set(IConfigurationService, configurationService);
		accessor.set(IChatSessionsService, chatSessionsService);
		accessor.set(IStorageService, storageService);
		accessor.set(IWorkspaceContextService, new TestContextService(workspace));
		accessor.set(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(agentHostEnabled), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) });
		return { sessionType: getDefaultNewChatSessionTypeAndReason(accessor, options).sessionType };
	}

	function resolveSessionTypeWithReason(
		configurationService: IConfigurationService,
		chatSessionsService: IChatSessionsService,
		storageService: IStorageService,
		workspace: Workspace,
		agentHostEnabled: boolean,
		options?: IDefaultNewChatSessionTypeOptions,
	) {
		const accessor = disposables.add(new TestInstantiationService());
		accessor.set(IConfigurationService, configurationService);
		accessor.set(IChatSessionsService, chatSessionsService);
		accessor.set(IStorageService, storageService);
		accessor.set(IWorkspaceContextService, new TestContextService(workspace));
		accessor.set(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(agentHostEnabled), managedSandboxEnforced: constObservable(false), managedSandboxAllowsBypass: constObservable(false) });
		return getDefaultNewChatSessionTypeAndReason(accessor, options);
	}

	test('default permission configuration maps setting values to Agent Host values', () => {
		assert.deepStrictEqual({
			manual: getChatPermissionLevelFromDefaultConfiguration('manual'),
			assisted: getChatPermissionLevelFromDefaultConfiguration('assisted'),
			allowAll: getChatPermissionLevelFromDefaultConfiguration('allowAll'),
			legacyDefault: getChatPermissionLevelFromDefaultConfiguration('default'),
			legacyAutoApprove: getChatPermissionLevelFromDefaultConfiguration('autoApprove'),
			invalid: getChatPermissionLevelFromDefaultConfiguration('invalid'),
		}, {
			manual: ChatPermissionLevel.Default,
			assisted: ChatPermissionLevel.Assisted,
			allowAll: ChatPermissionLevel.AutoApprove,
			legacyDefault: ChatPermissionLevel.Default,
			legacyAutoApprove: ChatPermissionLevel.AutoApprove,
			invalid: undefined,
		});
	});

	test('local fallback reason identifies failed Agent Host acquisition', () => {
		assert.deepStrictEqual({
			agentHostUnavailable: getLocalFallbackSessionTypeSelectionReason(SessionType.AgentHostCopilot, false),
			agentHostAcquired: getLocalFallbackSessionTypeSelectionReason(SessionType.AgentHostCopilot, true),
			nonAgentHostUnavailable: getLocalFallbackSessionTypeSelectionReason(SessionType.CopilotCLI, false),
			inheritedReason: getLocalFallbackSessionTypeSelectionReason(SessionType.CopilotCLI, false, 'computedDefault'),
		}, {
			agentHostUnavailable: 'agentHostUnavailable',
			agentHostAcquired: undefined,
			nonAgentHostUnavailable: undefined,
			inheritedReason: 'computedDefault',
		});
	});

	test('editor default returns local when agent host disabled and local enabled', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, false),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace),
		}, {
			computed: localChatSessionType,
			rememberedAware: localChatSessionType,
			localVisible: true,
		});
	});

	test('editor default prefers agent host Copilot when the agent host is enabled', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace),
		}, {
			computed: SessionType.AgentHostCopilot,
			rememberedAware: SessionType.AgentHostCopilot,
			localVisible: true,
		});
	});

	test('editor default stays local when the agent host is enabled but the Copilot default is not opted in', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		// The agent host is enabled but `chat.defaultToCopilotHarness` is off (its
		// default), so the computed default remains the local harness.
		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
		}, {
			computed: localChatSessionType,
			rememberedAware: localChatSessionType,
		});
	});

	test('editor default keeps agent host Copilot before contribution registers', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
		});
		const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace),
		}, {
			computed: SessionType.AgentHostCopilot,
			rememberedAware: SessionType.AgentHostCopilot,
			localVisible: true,
		});
	});

	test('editor default skips extension host Copilot CLI', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
		});
		const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, false),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
			extensionHostVisible: isVisibleEditorChatSessionType(SessionType.CopilotCLI, configurationService, chatSessionsService, localWorkspace),
		}, {
			computed: SessionType.AgentHostCopilot,
			rememberedAware: SessionType.AgentHostCopilot,
			extensionHostVisible: false,
		});
	});

	test('remembered extension host Copilot CLI falls back for a new chat', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.CopilotCLI, true);

		assert.deepStrictEqual({
			remembered: getRememberedSessionType(storageService),
			rememberedUsable: isNewChatSessionTypeUsable(SessionType.CopilotCLI, configurationService, chatSessionsService, localWorkspace),
			newSessionType: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
		}, {
			remembered: SessionType.CopilotCLI,
			rememberedUsable: false,
			newSessionType: localChatSessionType,
		});
	});

	test('current extension host Copilot CLI is not inherited by a new chat', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual(
			resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.CopilotCLI }),
			{ sessionType: localChatSessionType }
		);
	});

	for (const type of ['history-only', 'remote-history-only-copilot']) {
		test(`hidden session type ${type} remains registered but is excluded from new-chat choices and defaults`, () => {
			const configurationService = new TestConfigurationService({
				[ChatConfiguration.EditorLocalAgentEnabled]: false,
			});
			const chatSessionsService = new MockChatSessionsService();
			chatSessionsService.setContributions([
				{ type, name: type, displayName: type, description: '', hideFromSessionTypePicker: true },
				{ type: SessionType.CopilotCloud, name: 'Cloud', displayName: 'Cloud', description: '' },
			]);
			const storageService = disposables.add(new TestStorageService());
			storeUserSelectedSessionType(storageService, type);

			assert.deepStrictEqual({
				registered: !!chatSessionsService.getChatSessionContribution(type),
				visible: isVisibleEditorChatSessionType(type, configurationService, chatSessionsService, localWorkspace),
				usable: isNewChatSessionTypeUsable(type, configurationService, chatSessionsService, localWorkspace),
				cloudVisible: isVisibleEditorChatSessionType(SessionType.CopilotCloud, configurationService, chatSessionsService, localWorkspace),
				computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
				remembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
				current: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: type }),
			}, {
				registered: true,
				visible: false,
				usable: false,
				cloudVisible: true,
				computed: SessionType.CopilotCloud,
				remembered: SessionType.CopilotCloud,
				current: SessionType.CopilotCloud,
			});
		});
	}

	test('hidden session types do not prevent the last-resort local fallback', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
		});
		const chatSessionsService = new MockChatSessionsService();
		chatSessionsService.setContributions([
			{ type: 'history-only', name: 'History', displayName: 'History', description: '', hideFromSessionTypePicker: true },
		]);

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace),
		}, {
			computed: localChatSessionType,
			localVisible: true,
		});
	});

	test('editor default keeps local as last resort when local is disabled without any provider', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
		});
		const chatSessionsService = createChatSessionsService();
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, false),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace),
		}, {
			computed: localChatSessionType,
			rememberedAware: localChatSessionType,
			localVisible: true,
		});
	});

	test('remembered non-local selection wins over the agent host default', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
			remembered: getRememberedSessionType(storageService),
			rememberedAware: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
		}, {
			computed: SessionType.AgentHostCopilot,
			remembered: SessionType.AgentHostClaude,
			rememberedAware: { sessionType: SessionType.AgentHostClaude },
		});
	});

	test('explicit override wins over remembered selection', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, false);

		assert.deepStrictEqual({
			remembered: getRememberedSessionType(storageService),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { explicitOverride: SessionType.AgentHostCopilot }),
		}, {
			remembered: SessionType.AgentHostClaude,
			rememberedAware: SessionType.AgentHostCopilot,
		});
	});

	test('current session type is fallback after remembered selection', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			withoutRemembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
		}, {
			withoutRemembered: SessionType.AgentHostCopilot,
		});

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, false);

		assert.deepStrictEqual({
			withRemembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
		}, {
			withRemembered: SessionType.AgentHostClaude,
		});
	});

	test('preferCopilotHarness replaces local on every new chat', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			pickerFallback: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
			directCurrent: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
			firstResolve: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
			secondResolve: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
		}, {
			pickerFallback: SessionType.AgentHostCopilot,
			directCurrent: SessionType.AgentHostCopilot,
			firstResolve: { sessionType: SessionType.AgentHostCopilot },
			secondResolve: { sessionType: SessionType.AgentHostCopilot },
		});
	});

	test('Copilot preference is skipped when the agent host is disabled', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		// With the agent host disabled (e.g. on web), the Copilot harness is unavailable.
		const resolved = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: localChatSessionType });

		assert.deepStrictEqual({
			resolved,
		}, {
			resolved: { sessionType: localChatSessionType },
		});
	});

	test('preferCopilotHarness preserves Claude and Codex selections', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude, SessionType.AgentHostCodex);
		const storageService = disposables.add(new TestStorageService());

		const currentClaude = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostClaude });
		const currentCodex = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostCodex });
		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);
		const rememberedClaude = resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });
		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostCodex, true);

		assert.deepStrictEqual({
			currentClaude,
			currentCodex,
			rememberedClaude,
			rememberedCodex: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
		}, {
			currentClaude: { sessionType: SessionType.AgentHostClaude },
			currentCodex: { sessionType: SessionType.AgentHostCodex },
			rememberedClaude: { sessionType: SessionType.AgentHostClaude },
			rememberedCodex: { sessionType: SessionType.AgentHostCodex },
		});
	});

	test('selecting computed default clears remembered selection', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);
		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostCopilot, true);

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true),
			remembered: getRememberedSessionType(storageService),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
		}, {
			computed: SessionType.AgentHostCopilot,
			remembered: undefined,
			rememberedAware: SessionType.AgentHostCopilot,
		});
	});

	test('selecting local while the agent host default is Copilot remembers local as an opt-out', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		// With the agent host enabled the computed default is Copilot, so picking
		// local differs from the default and must be persisted as an explicit opt-out.
		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, localChatSessionType, true);

		assert.deepStrictEqual({
			remembered: getRememberedSessionType(storageService),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
		}, {
			remembered: localChatSessionType,
			rememberedAware: localChatSessionType,
		});
	});

	test('Copilot preference overrides a remembered local selection every time', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		// Remember local (only reachable because the computed default is Copilot).
		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, localChatSessionType, true);

		assert.deepStrictEqual({
			firstResolve: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
			secondResolve: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
			pickerFallback: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true),
		}, {
			firstResolve: { sessionType: SessionType.AgentHostCopilot },
			secondResolve: { sessionType: SessionType.AgentHostCopilot },
			pickerFallback: SessionType.AgentHostCopilot,
		});
	});

	test('Copilot preference preserves the current non-local harness over remembered local', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, localChatSessionType, true);

		assert.deepStrictEqual({
			direct: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostClaude }),
			resolved: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostClaude }),
		}, {
			direct: SessionType.AgentHostClaude,
			resolved: { sessionType: SessionType.AgentHostClaude },
		});
	});

	test('new chat from a local session preserves local even when the agent host default is Copilot', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		// No remembered selection and no preferred-harness setting: the current
		// session type wins over the Copilot computed default (session preservation).
		assert.deepStrictEqual({
			resolved: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
		}, {
			resolved: { sessionType: localChatSessionType },
		});
	});

	test('explicit New Local Chat wins over a non-local current session even when the agent host default is Copilot', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		// "New Local Chat" from a Copilot session must resolve to local: the explicit
		// override outranks both the current session type and the computed default,
		// so the clear path opens a local session instead of dropping the request.
		assert.deepStrictEqual({
			resolved: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { explicitOverride: localChatSessionType, currentSessionType: SessionType.AgentHostCopilot }),
		}, {
			resolved: { sessionType: localChatSessionType },
		});
	});

	test('default session resource follows the agent host default', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			computedWithAgentHost: getChatSessionType(getComputedDefaultSessionResource(configurationService, chatSessionsService, localWorkspace, true)),
			computedWithoutAgentHost: getChatSessionType(getComputedDefaultSessionResource(configurationService, chatSessionsService, localWorkspace, false)),
			defaultNewWithAgentHost: getChatSessionType(getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, localWorkspace, true)),
			defaultNewWithoutAgentHost: getChatSessionType(getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, localWorkspace, false)),
		}, {
			computedWithAgentHost: SessionType.AgentHostCopilot,
			computedWithoutAgentHost: localChatSessionType,
			defaultNewWithAgentHost: SessionType.AgentHostCopilot,
			defaultNewWithoutAgentHost: localChatSessionType,
		});
	});

	test('virtual workspace defaults implicit new chats to local', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const rememberedStorageService = disposables.add(new TestStorageService());
		const currentStorageService = disposables.add(new TestStorageService());
		const workspace = createWorkspace(URI.parse('vscode-vfs://github/microsoft/vscode'));
		recordUserSelectedSessionType(rememberedStorageService, configurationService, chatSessionsService, workspace, SessionType.AgentHostClaude, true);

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, true),
			remembered: getRememberedSessionType(rememberedStorageService),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, rememberedStorageService, workspace, true),
			currentAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
			resolvedRemembered: resolveSessionType(configurationService, chatSessionsService, rememberedStorageService, workspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
			resolvedCurrent: resolveSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { currentSessionType: SessionType.AgentHostCopilot }),
			resolvedPreferMigration: resolveSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { currentSessionType: localChatSessionType }),
			explicitOverride: resolveSessionType(configurationService, chatSessionsService, currentStorageService, workspace, true, { explicitOverride: SessionType.AgentHostClaude }),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, workspace),
			localRememberedUsable: isNewChatSessionTypeUsable(localChatSessionType, configurationService, chatSessionsService, workspace),
		}, {
			computed: localChatSessionType,
			remembered: SessionType.AgentHostClaude,
			rememberedAware: localChatSessionType,
			currentAware: localChatSessionType,
			resolvedRemembered: { sessionType: localChatSessionType },
			resolvedCurrent: { sessionType: localChatSessionType },
			resolvedPreferMigration: { sessionType: localChatSessionType },
			explicitOverride: { sessionType: SessionType.AgentHostClaude },
			localVisible: true,
			localRememberedUsable: true,
		});
	});

	test('remembered agent host is usable before contribution registers', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService();
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			agentHost: isNewChatSessionTypeUsable(SessionType.AgentHostClaude, configurationService, chatSessionsService, localWorkspace),
			agentHostCurrent: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostClaude }),
			extensionContributed: isNewChatSessionTypeUsable('my-extension-agent', configurationService, chatSessionsService, localWorkspace),
		}, {
			agentHost: true,
			agentHostCurrent: { sessionType: SessionType.AgentHostClaude },
			extensionContributed: false,
		});
	});

	test('disabled Agent Host is not inherited from remembered or current session types', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService();
		const storageService = disposables.add(new TestStorageService());
		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);

		assert.deepStrictEqual({
			usable: isNewChatSessionTypeUsable(SessionType.AgentHostClaude, configurationService, chatSessionsService, localWorkspace, false),
			remembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false),
			current: resolveSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: SessionType.AgentHostClaude }),
		}, {
			usable: false,
			remembered: localChatSessionType,
			current: { sessionType: localChatSessionType },
		});
	});

	test('local agent setting is ignored only in fully virtual workspaces', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
		});
		const remoteWorkspace = createWorkspace(URI.parse('vscode-remote://ssh-remote+test/workspace'));
		const remoteRepositoriesWorkspace = createWorkspace(URI.parse('vscode-vfs://github/microsoft/vscode'));
		const customVirtualWorkspace = createWorkspace(URI.parse('custom-vfs://provider/workspace'));
		const mixedWorkspace = createWorkspace(URI.file('/workspace'), URI.parse('custom-vfs://provider/workspace'));

		assert.deepStrictEqual({
			local: isEditorLocalAgentEnabled(configurationService, localWorkspace),
			remote: isEditorLocalAgentEnabled(configurationService, remoteWorkspace),
			remoteRepositories: isEditorLocalAgentEnabled(configurationService, remoteRepositoriesWorkspace),
			customVirtual: isEditorLocalAgentEnabled(configurationService, customVirtualWorkspace),
			mixed: isEditorLocalAgentEnabled(configurationService, mixedWorkspace),
		}, {
			local: false,
			remote: false,
			remoteRepositories: true,
			customVirtual: true,
			mixed: false,
		});
	});

	test('managed sandbox floor hides the local harness and defaults to the Copilot SDK', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		// `chat.editor.localAgent.enabled` and `chat.defaultToCopilotHarness` are left at their
		// defaults: an enterprise-mandated sandbox floor implies both.
		assert.deepStrictEqual({
			localEnabled: isEditorLocalAgentEnabled(configurationService, localWorkspace, true),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace, true),
			localUsable: isNewChatSessionTypeUsable(localChatSessionType, configurationService, chatSessionsService, localWorkspace, true, true),
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true, true),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, undefined, true),
			fromLocal: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }, true),
		}, {
			localEnabled: false,
			localVisible: false,
			localUsable: false,
			computed: SessionType.AgentHostCopilot,
			rememberedAware: SessionType.AgentHostCopilot,
			fromLocal: SessionType.AgentHostCopilot,
		});
	});

	test('managed sandbox floor reaches the New Chat entry points and overrides remembered local', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		// A local harness remembered from before the floor was mandated must not keep winning:
		// otherwise the picker hides local while New Chat keeps opening local sessions.
		storeUserSelectedSessionType(storageService, localChatSessionType);

		assert.deepStrictEqual({
			remembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, undefined, true),
			resource: getChatSessionType(getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, localWorkspace, true, undefined, true)),
		}, {
			remembered: SessionType.AgentHostCopilot,
			resource: SessionType.AgentHostCopilot,
		});
	});

	test('managed sandbox floor does not override remembered Claude and Codex selections', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude, SessionType.AgentHostCodex);
		const storageService = disposables.add(new TestStorageService());

		const currentCodex = getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostCodex }, true);
		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, true);

		assert.deepStrictEqual({
			currentCodex,
			rememberedClaude: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }, true),
		}, {
			currentCodex: SessionType.AgentHostCodex,
			rememberedClaude: SessionType.AgentHostClaude,
		});
	});

	test('no managed sandbox floor leaves the harness settings in charge', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			localEnabled: isEditorLocalAgentEnabled(configurationService, localWorkspace, false),
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, true, false),
			resolved: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }, false),
		}, {
			localEnabled: true,
			computed: localChatSessionType,
			resolved: localChatSessionType,
		});
	});

	test('managed sandbox floor keeps local when Agent Host is disabled', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			visible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace, true, false),
			usable: isNewChatSessionTypeUsable(localChatSessionType, configurationService, chatSessionsService, localWorkspace, false, true),
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace, false, true),
			resolved: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: localChatSessionType }, true),
		}, {
			visible: true,
			usable: true,
			computed: localChatSessionType,
			resolved: localChatSessionType,
		});
	});

	test('virtual workspace keeps local available when the sandbox floor is managed', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const workspace = createWorkspace(URI.parse('vscode-vfs://github/microsoft/vscode'));

		assert.deepStrictEqual({
			localEnabled: isEditorLocalAgentEnabled(configurationService, workspace, true),
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, true, true),
		}, {
			localEnabled: true,
			computed: localChatSessionType,
		});
	});

	test('new chat default resolver reports every selection reason', () => {
		const configurationService = new TestConfigurationService();
		const preferenceConfigurationService = new TestConfigurationService({
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());
		const rememberedStorageService = disposables.add(new TestStorageService());
		storeUserSelectedSessionType(rememberedStorageService, SessionType.AgentHostClaude);

		assert.deepStrictEqual({
			explicit: resolveSessionTypeWithReason(configurationService, chatSessionsService, storageService, localWorkspace, true, { explicitOverride: SessionType.AgentHostClaude }),
			virtual: resolveSessionTypeWithReason(configurationService, chatSessionsService, storageService, createWorkspace(URI.parse('vscode-vfs://github/microsoft/vscode')), true),
			remembered: resolveSessionTypeWithReason(configurationService, chatSessionsService, rememberedStorageService, localWorkspace, true),
			current: resolveSessionTypeWithReason(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: SessionType.AgentHostClaude }),
			copilotPreference: resolveSessionTypeWithReason(preferenceConfigurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
			computed: resolveSessionTypeWithReason(configurationService, chatSessionsService, storageService, localWorkspace, true),
		}, {
			explicit: { sessionType: SessionType.AgentHostClaude, selectionReason: 'explicitOverride' },
			virtual: { sessionType: localChatSessionType, selectionReason: 'virtualWorkspace' },
			remembered: { sessionType: SessionType.AgentHostClaude, selectionReason: 'rememberedSelection' },
			current: { sessionType: SessionType.AgentHostClaude, selectionReason: 'currentSession' },
			copilotPreference: { sessionType: SessionType.AgentHostCopilot, selectionReason: 'copilotPreference' },
			computed: { sessionType: localChatSessionType, selectionReason: 'computedDefault' },
		});
	});

	test('virtual workspace keeps local available when setting is disabled', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());
		const workspace = createWorkspace(URI.parse('vscode-vfs://github/microsoft/vscode'));

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, false),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, false),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, workspace),
			localRememberedUsable: isNewChatSessionTypeUsable(localChatSessionType, configurationService, chatSessionsService, workspace),
		}, {
			computed: localChatSessionType,
			rememberedAware: localChatSessionType,
			localVisible: true,
			localRememberedUsable: true,
		});
	});
});
