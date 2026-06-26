/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatConfiguration, getDefaultNewChatSessionType, getNewChatEditorSessionType, isVisibleEditorChatSessionType } from '../../common/constants.js';
import { localChatSessionType, SessionType, IChatSessionsExtensionPoint } from '../../common/chatSessionsService.js';
import { MockChatSessionsService } from './mockChatSessionsService.js';

suite('ChatConfiguration defaults', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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

		assert.strictEqual(getDefaultNewChatSessionType(configurationService, chatSessionsService), localChatSessionType);
		assert.strictEqual(isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService), true);
	});

	test('editor default returns agent host Copilot when local is disabled and copilotAh is configured', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
			[ChatConfiguration.EditorDefaultProvider]: 'copilotAh',
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);

		assert.strictEqual(getDefaultNewChatSessionType(configurationService, chatSessionsService), SessionType.AgentHostCopilot);
		assert.strictEqual(isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService), false);
	});

	test('editor default keeps configured agent host Copilot before contribution registers', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
			[ChatConfiguration.EditorDefaultProvider]: 'copilotAh',
		});
		const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI);

		assert.strictEqual(getDefaultNewChatSessionType(configurationService, chatSessionsService), SessionType.AgentHostCopilot);
		assert.strictEqual(isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService), false);
	});

	test('editor default skips hidden extension host Copilot CLI', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
			[ChatConfiguration.EditorDefaultProvider]: 'copilotEh',
			[ChatConfiguration.CopilotCliHideExtensionHostEditor]: true,
		});
		const chatSessionsService = createChatSessionsService(SessionType.CopilotCLI, SessionType.AgentHostCopilot);

		assert.strictEqual(getDefaultNewChatSessionType(configurationService, chatSessionsService), SessionType.AgentHostCopilot);
		assert.strictEqual(isVisibleEditorChatSessionType(SessionType.CopilotCLI, configurationService, chatSessionsService), false);
	});

	test('editor default keeps local as last resort when local is disabled without configured provider', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorLocalAgentEnabled]: false,
		});
		const chatSessionsService = createChatSessionsService();

		assert.strictEqual(getDefaultNewChatSessionType(configurationService, chatSessionsService), localChatSessionType);
		assert.strictEqual(isVisibleEditorChatSessionType(localChatSessionType, configurationService, chatSessionsService), true);
	});
});

suite('getNewChatEditorSessionType (last-used agent)', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('prefers a visible non-local last-used agent when the provider is not explicitly configured', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);

		assert.strictEqual(getNewChatEditorSessionType(configurationService, chatSessionsService, SessionType.AgentHostCopilot), SessionType.AgentHostCopilot);
	});

	test('ignores a last-used agent whose provider is not visible/registered', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(); // agent host not registered

		assert.strictEqual(getNewChatEditorSessionType(configurationService, chatSessionsService, SessionType.AgentHostCopilot), localChatSessionType);
	});

	test('an explicitly configured local provider wins over a last-used agent', () => {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorDefaultProvider]: 'local',
		});
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);

		assert.strictEqual(getNewChatEditorSessionType(configurationService, chatSessionsService, SessionType.AgentHostCopilot), localChatSessionType);
	});

	test('a last-used local agent does not override the default', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);

		assert.strictEqual(getNewChatEditorSessionType(configurationService, chatSessionsService, localChatSessionType), localChatSessionType);
	});

	test('falls back to the default when there is no last-used agent', () => {
		const configurationService = new TestConfigurationService();
		const chatSessionsService = createChatSessionsService(SessionType.AgentHostCopilot);

		assert.strictEqual(getNewChatEditorSessionType(configurationService, chatSessionsService, undefined), localChatSessionType);
	});
});
