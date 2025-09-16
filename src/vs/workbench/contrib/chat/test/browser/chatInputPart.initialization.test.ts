/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { ICustomChatMode } from '../../common/promptSyntax/service/promptsService.js';
import { MockChatModeService } from '../common/mockChatModeService.js';

// Simple mock class to test the initialization logic without the full ChatInputPart
class ChatInputPartInitializationHelper {
	constructor(
		private configurationService: TestConfigurationService,
		private storageService: IStorageService,
		private chatModeService: MockChatModeService,
		private logService: { warn: (message: string) => void }
	) {}

	/**
	 * Simplified version of the initialization logic from ChatInputPart.initForNewChatModel
	 */
	determineInitialChatMode(stateHasChatMode: boolean): string {
		if (stateHasChatMode) {
			// If state has a chat mode, return it (this is mocked for simplicity)
			return 'state-provided-mode';
		}

		// Check for configured default mode first
		const configuredDefaultMode = this.configurationService.getValue<string>(ChatConfiguration.DefaultChatMode);
		if (configuredDefaultMode && configuredDefaultMode !== ChatModeKind.Ask) {
			// Validate that the configured mode is available
			const validatedMode = this.chatModeService.findModeById(configuredDefaultMode);
			if (validatedMode) {
				return configuredDefaultMode;
			} else {
				// Log the issue and fall back to persisted mode or Ask mode
				this.logService.warn(`Configured default chat mode "${configuredDefaultMode}" is not available, falling back to persisted mode`);
				const persistedMode = this.storageService.get('chat.lastChatMode', 0 /* APPLICATION scope */);
				if (persistedMode) {
					return persistedMode;
				} else {
					return ChatModeKind.Ask;
				}
			}
		} else {
			// Fall back to persisted mode if no configured default
			const persistedMode = this.storageService.get('chat.lastChatMode', 0 /* APPLICATION scope */);
			if (persistedMode) {
				return persistedMode;
			} else {
				return ChatModeKind.Ask;
			}
		}
	}
}

suite('ChatInputPart - Default Mode Initialization', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let configurationService: TestConfigurationService;
	let storageService: TestStorageService;
	let chatModeService: MockChatModeService;
	let logMessages: string[];
	let helper: ChatInputPartInitializationHelper;

	setup(() => {
		configurationService = new TestConfigurationService();
		storageService = new TestStorageService();
		chatModeService = new MockChatModeService();
		logMessages = [];

		const mockLogService = {
			warn: (message: string) => logMessages.push(message)
		};

		helper = new ChatInputPartInitializationHelper(
			configurationService,
			storageService,
			chatModeService,
			mockLogService
		);
	});

	test('should use Ask mode when no configuration or persisted mode exists', () => {
		const result = helper.determineInitialChatMode(false);
		assert.strictEqual(result, ChatModeKind.Ask);
	});

	test('should use persisted mode when no configuration exists', () => {
		storageService.store('chat.lastChatMode', ChatModeKind.Edit, 0, 0);
		
		const result = helper.determineInitialChatMode(false);
		assert.strictEqual(result, ChatModeKind.Edit);
	});

	test('should use configured default mode when available', () => {
		configurationService.setUserConfiguration(ChatConfiguration.DefaultChatMode, ChatModeKind.Agent);
		
		const result = helper.determineInitialChatMode(false);
		assert.strictEqual(result, ChatModeKind.Agent);
	});

	test('should use configured custom mode when available', () => {
		const customMode: ICustomChatMode = {
			uri: URI.parse('file:///test/custom-mode.md'),
			name: 'Test Custom Mode',
			description: 'A test custom mode',
			tools: [],
			body: 'Custom mode body',
			variableReferences: []
		};

		chatModeService.addCustomMode(customMode);
		configurationService.setUserConfiguration(ChatConfiguration.DefaultChatMode, customMode.uri.toString());

		const result = helper.determineInitialChatMode(false);
		assert.strictEqual(result, customMode.uri.toString());
	});

	test('should fall back to persisted mode when configured mode is unavailable', () => {
		const unavailableModeId = 'file:///nonexistent/mode.md';
		configurationService.setUserConfiguration(ChatConfiguration.DefaultChatMode, unavailableModeId);
		storageService.store('chat.lastChatMode', ChatModeKind.Edit, 0, 0);

		const result = helper.determineInitialChatMode(false);
		assert.strictEqual(result, ChatModeKind.Edit);
		assert.strictEqual(logMessages.length, 1);
		assert.ok(logMessages[0].includes('not available'));
	});

	test('should fall back to Ask mode when both configured and persisted modes are unavailable', () => {
		const unavailableModeId = 'file:///nonexistent/mode.md';
		configurationService.setUserConfiguration(ChatConfiguration.DefaultChatMode, unavailableModeId);

		const result = helper.determineInitialChatMode(false);
		assert.strictEqual(result, ChatModeKind.Ask);
		assert.strictEqual(logMessages.length, 1);
		assert.ok(logMessages[0].includes('not available'));
	});

	test('should prioritize configured default over persisted mode', () => {
		configurationService.setUserConfiguration(ChatConfiguration.DefaultChatMode, ChatModeKind.Agent);
		storageService.store('chat.lastChatMode', ChatModeKind.Edit, 0, 0);

		const result = helper.determineInitialChatMode(false);
		assert.strictEqual(result, ChatModeKind.Agent);
	});

	test('should ignore configured default when it is Ask mode (to avoid redundancy)', () => {
		configurationService.setUserConfiguration(ChatConfiguration.DefaultChatMode, ChatModeKind.Ask);
		storageService.store('chat.lastChatMode', ChatModeKind.Edit, 0, 0);

		const result = helper.determineInitialChatMode(false);
		assert.strictEqual(result, ChatModeKind.Edit);
	});
});