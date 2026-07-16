/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspace, toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ChatConfiguration, getComputedDefaultSessionType, getDefaultNewChatSessionType, isEditorLocalAgentEnabled, isRememberedSessionTypeUsable, isVisibleEditorChatSessionType, recordUserSelectedSessionType, resolveDefaultNewChatSessionType } from '../../common/constants.js';
import { localChatSessionType, SessionType, IChatSessionsExtensionPoint } from '../../common/chatSessionsService.js';
import { MockChatSessionsService } from './mockChatSessionsService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { getRememberedSessionType, hasPreferredCopilotHarness, markPreferredCopilotHarness } from '../../common/chatSessionTypePreference.js';

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

	test('editor default returns local when local is enabled', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace),
		}, {
			computed: localChatSessionType,
			rememberedAware: localChatSessionType,
			localVisible: true,
		});
	});

	test('preferCopilotHarness does not change the computed default or local visibility', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace),
		}, {
			computed: localChatSessionType,
			rememberedAware: localChatSessionType,
			localVisible: true,
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
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace),
			extensionHostVisible: isVisibleEditorChatSessionType(SessionType.CopilotCLI, configurationService, chatSessionsService, localWorkspace),
		}, {
			computed: SessionType.AgentHostCopilot,
			rememberedAware: SessionType.AgentHostCopilot,
			extensionHostVisible: false,
		});
	});

	test('editor default keeps local as last resort when local is disabled without configured provider', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
		});
		const chatSessionsService = createChatSessionsService();
		const storageService = disposables.add(new TestStorageService());

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace),
			localVisible: isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService, localWorkspace),
		}, {
			computed: localChatSessionType,
			rememberedAware: localChatSessionType,
			localVisible: true,
		});
	});

	test('remembered non-local selection wins over the one-time swap', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude);

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace),
			remembered: getRememberedSessionType(storageService),
			rememberedAware: resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType }),
		}, {
			computed: localChatSessionType,
			remembered: SessionType.AgentHostClaude,
			rememberedAware: { sessionType: SessionType.AgentHostClaude, isPreferCopilotHarnessSwap: false },
		});
	});

	test('explicit override wins over remembered selection', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude);

		assert.deepStrictEqual({
			remembered: getRememberedSessionType(storageService),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, { explicitOverride: SessionType.AgentHostCopilot }),
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
			withoutRemembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, { currentSessionType: SessionType.AgentHostCopilot }),
		}, {
			withoutRemembered: SessionType.AgentHostCopilot,
		});

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude);

		assert.deepStrictEqual({
			withRemembered: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, { currentSessionType: SessionType.AgentHostCopilot }),
		}, {
			withRemembered: SessionType.AgentHostClaude,
		});
	});

	test('preferCopilotHarness resolves the swap without consuming the marker until applied', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorPreferCopilotHarness]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		// Not swapped while the agent host is disabled.
		const whileAgentHostDisabled = resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, false, { currentSessionType: localChatSessionType });

		// Resolving does not consume the marker on its own: repeated resolves keep
		// returning the swap until the caller applies it and marks it.
		const firstResolve = resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });
		const markerBeforeApply = hasPreferredCopilotHarness(storageService);
		const secondResolveBeforeApply = resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });

		// The caller applies the swap and marks it; further resolves stay local.
		markPreferredCopilotHarness(storageService);
		const afterApply = resolveDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace, true, { currentSessionType: localChatSessionType });

		assert.deepStrictEqual({
			whileAgentHostDisabled,
			firstResolve,
			markerBeforeApply,
			secondResolveBeforeApply,
			afterApply,
			markerAfterApply: hasPreferredCopilotHarness(storageService),
		}, {
			whileAgentHostDisabled: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
			firstResolve: { sessionType: SessionType.AgentHostCopilot, isPreferCopilotHarnessSwap: true },
			markerBeforeApply: false,
			secondResolveBeforeApply: { sessionType: SessionType.AgentHostCopilot, isPreferCopilotHarnessSwap: true },
			afterApply: { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false },
			markerAfterApply: true,
		});
	});

	test('selecting computed default clears remembered selection', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot, SessionType.AgentHostClaude);
		const storageService = disposables.add(new TestStorageService());

		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, SessionType.AgentHostClaude);
		recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, localWorkspace, localChatSessionType);

		assert.deepStrictEqual({
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, localWorkspace),
			remembered: getRememberedSessionType(storageService),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, localWorkspace),
		}, {
			computed: localChatSessionType,
			remembered: undefined,
			rememberedAware: localChatSessionType,
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
			computed: getComputedDefaultSessionType(configurationService, chatSessionsService, workspace),
			rememberedAware: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace),
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
