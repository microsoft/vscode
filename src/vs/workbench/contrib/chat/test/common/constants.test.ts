/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspace, toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ChatConfiguration, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, getComputedDefaultSessionResource, getComputedDefaultSessionType, getDefaultNewChatSessionResource, getDefaultNewChatSessionType, isEditorLocalAgentEnabled, isRememberedSessionTypeUsable, isVisibleEditorChatSessionType, recordUserSelectedSessionType, resolveDefaultNewChatSessionType } from '../../common/constants.js';
import { localChatSessionType, SessionType, IChatSessionsExtensionPoint } from '../../common/chatSessionsService.js';
import { MockChatSessionsService } from './mockChatSessionsService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { getRememberedSessionType, hasPreferredCopilotHarness, markPreferredCopilotHarness } from '../../common/chatSessionTypePreference.js';
import { getChatSessionType } from '../../common/model/chatUri.js';

suite('ChatConfiguration defaults', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const localWorkspace = createWorkspace(URI.file('/workspace'));

	function createWorkspace(...resources: URI[]): IWorkspace {
		return {
			id: resources.map(resource => resource.toString()).join(','),
			folders: resources.map(toWorkspaceFolder),
		};
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

	test('default permission configuration maps Allow All to the Agent Host value', () => {
		assert.deepStrictEqual({
			default: getChatPermissionLevelFromDefaultConfiguration('default'),
			assisted: getChatPermissionLevelFromDefaultConfiguration('assisted'),
			allowAll: getChatPermissionLevelFromDefaultConfiguration('allowAll'),
			legacyAutoApprove: getChatPermissionLevelFromDefaultConfiguration('autoApprove'),
			invalid: getChatPermissionLevelFromDefaultConfiguration('invalid'),
		}, {
			default: ChatPermissionLevel.Default,
			assisted: ChatPermissionLevel.Assisted,
			allowAll: ChatPermissionLevel.AutoApprove,
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
			localVisible: false,
		});
	});

	test('editor default skips hidden extension host Copilot CLI', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
			[ChatConfiguration.CopilotCliHideExtensionHostEditor]: true,
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
			rememberedAware: resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
		}, {
			computed: SessionType.AgentHostCopilot,
			remembered: SessionType.AgentHostClaude,
			rememberedAware: { sessionType: SessionType.AgentHostClaude, isPreferCopilotHarnessSwap: false },
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
			withoutRemembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: SessionType.AgentHostCopilot }),
		}, {
			withoutRemembered: SessionType.AgentHostCopilot,
		});

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude, false);

		assert.deepStrictEqual({
			withRemembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: SessionType.AgentHostCopilot }),
		}, {
			withRemembered: SessionType.AgentHostClaude,
		});
	});

	test('preferCopilotHarness resolves the swap without consuming the marker until applied', () => {
		// DefaultToCopilotHarness stays unset so this proves the one-time swap
		// fires solely because EditorPreferCopilotHarness is enabled, independent
		// of the new default gate.
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		// Resolving does not consume the marker on its own: repeated resolves keep
		// returning the swap until the caller applies it and marks it.
		const firstResolve = resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });
		const markerBeforeApply = hasPreferredCopilotHarness(storageService);
		const secondResolveBeforeApply = resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });

		// The caller applies the swap and marks it; further resolves no longer swap.
		markPreferredCopilotHarness(storageService);
		const afterApply = resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });

		assert.deepStrictEqual({
			firstResolve,
			markerBeforeApply,
			secondResolveBeforeApply,
			afterApply,
			markerAfterApply: hasPreferredCopilotHarness(storageService),
		}, {
			firstResolve: { sessionType: SessionType.AgentHostCopilot, isPreferCopilotHarnessSwap: true },
			markerBeforeApply: false,
			secondResolveBeforeApply: { sessionType: SessionType.AgentHostCopilot, isPreferCopilotHarnessSwap: true },
			// Once marked, the one-time swap no longer fires; with no remembered
			// selection the current local session type is returned.
			afterApply: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
			markerAfterApply: true,
		});
	});

	test('one-time Copilot swap is skipped and unmarked when the agent host is disabled', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		// With the agent host disabled (e.g. on web) the swap must not fire, so it
		// neither returns an unresolvable Copilot type nor marks the transition.
		const resolved = resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: localChatSessionType });

		assert.deepStrictEqual({
			resolved,
			preferenceApplied: hasPreferredCopilotHarness(storageService),
		}, {
			resolved: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
			preferenceApplied: false,
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

	test('one-time Copilot swap overrides a remembered local opt-out and stays redundant when agent host is enabled', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		// Remember local (only reachable because the computed default is Copilot).
		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, localChatSessionType, true);

		// The `remembered !== local` guard lets the one-time swap replace the
		// remembered local, even though the computed default is already Copilot.
		// The resolver reports the swap but does not mark it (the caller does).
		const swapped = resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });

		assert.deepStrictEqual({
			swapped,
			preferenceApplied: hasPreferredCopilotHarness(storageService),
		}, {
			swapped: { sessionType: SessionType.AgentHostCopilot, isPreferCopilotHarnessSwap: true },
			preferenceApplied: false,
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
			resolved: resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
			preferenceApplied: hasPreferredCopilotHarness(storageService),
		}, {
			resolved: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
			preferenceApplied: false,
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
			resolved: resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { explicitOverride: localChatSessionType, currentSessionType: SessionType.AgentHostCopilot }),
		}, {
			resolved: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
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

	test('virtual workspace defaults to local when the agent host default is enabled', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.DefaultToCopilotHarness]: true,
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());
		const workspace = createWorkspace(URI.parse('vscode-vfs://github/microsoft/vscode'));

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, true),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, true),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, workspace),
			localRememberedUsable: isRememberedSessionTypeUsable(localChatSessionType, configurationService, chatSessionsService, workspace),
		}, {
			computed: localChatSessionType,
			rememberedAware: localChatSessionType,
			localVisible: true,
			localRememberedUsable: true,
		});
	});

	test('remembered agent host is usable before contribution registers', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService();

		assert.deepStrictEqual({
			agentHost: isRememberedSessionTypeUsable(SessionType.AgentHostClaude, configurationService, chatSessionsService, localWorkspace),
			extensionContributed: isRememberedSessionTypeUsable('my-extension-agent', configurationService, chatSessionsService, localWorkspace),
		}, {
			agentHost: true,
			extensionContributed: false,
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
			localRememberedUsable: isRememberedSessionTypeUsable(localChatSessionType, configurationService, chatSessionsService, workspace),
		}, {
			computed: localChatSessionType,
			rememberedAware: localChatSessionType,
			localVisible: true,
			localRememberedUsable: true,
		});
	});
});
