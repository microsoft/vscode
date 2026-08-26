/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, Workspace, toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ChatConfiguration, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, getComputedDefaultSessionResource, getComputedDefaultSessionType, getDefaultNewChatSessionResource, getDefaultNewChatSessionType, getDefaultNewChatSessionTypeAndReason, IDefaultNewChatSessionTypeOptions, isEditorLocalAgentEnabled, isNewChatSessionTypeUsable, isVisibleEditorChatSessionType, recordUserSelectedSessionType } from '../../common/constants.js';
import { localChatSessionType, SessionType, IChatSessionsExtensionPoint, IChatSessionsService } from '../../common/chatSessionsService.js';
import { MockChatSessionsService } from './mockChatSessionsService.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { getRememberedSessionType, storeUserSelectedSessionType } from '../../common/chatSessionTypePreference.js';
import { getChatSessionType } from '../../common/model/chatUri.js';

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
		accessor.set(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(agentHostEnabled), managedSandboxEnforced: constObservable(false) });
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
		accessor.set(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(agentHostEnabled), managedSandboxEnforced: constObservable(false) });
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
