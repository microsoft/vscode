/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationNode, IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IChatModeService } from '../../common/chatModes.js';
import { ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { ICustomChatMode } from '../../common/promptSyntax/service/promptsService.js';
import { DynamicChatModeConfiguration } from '../../browser/dynamicChatModeConfiguration.js';
import { MockChatModeService } from './mockChatModeService.js';

suite('DynamicChatModeConfiguration', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let chatModeService: MockChatModeService;
	let configurationRegistry: IConfigurationRegistry;
	let dynamicConfiguration: DynamicChatModeConfiguration;

	setup(async () => {
		instantiationService = new TestInstantiationService();
		chatModeService = new MockChatModeService();
		configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

		instantiationService.set(IChatModeService, chatModeService);

		dynamicConfiguration = testDisposables.add(instantiationService.createInstance(DynamicChatModeConfiguration));
	});

	test('should register initial configuration with built-in modes', async () => {
		// The initial configuration should be registered automatically
		await timeout(0);

		// Check that a configuration was registered
		assert.ok(dynamicConfiguration['currentConfigurationNode'], 'Configuration node should be registered');

		const configNode = dynamicConfiguration['currentConfigurationNode'];
		const defaultModeProperty = configNode.properties?.[ChatConfiguration.DefaultChatMode];

		assert.ok(defaultModeProperty, 'Default chat mode property should exist');
		assert.strictEqual(defaultModeProperty.type, 'string');
		assert.strictEqual(defaultModeProperty.default, ChatModeKind.Ask);
		assert.ok(Array.isArray(defaultModeProperty.enum), 'Enum values should be an array');
		assert.ok(Array.isArray(defaultModeProperty.enumDescriptions), 'Enum descriptions should be an array');

		// Should include built-in modes
		const enumValues = defaultModeProperty.enum as string[];
		assert.ok(enumValues.includes(ChatModeKind.Ask), 'Should include Ask mode');
		assert.ok(enumValues.includes(ChatModeKind.Edit), 'Should include Edit mode');
		assert.ok(enumValues.includes(ChatModeKind.Agent), 'Should include Agent mode');
	});

	test('should update configuration when custom modes are added', async () => {
		// Add a custom mode
		const customMode: ICustomChatMode = {
			uri: URI.parse('file:///test/custom-mode.md'),
			name: 'Test Custom Mode',
			description: 'A test custom mode',
			tools: [],
			body: 'Custom mode body',
			variableReferences: []
		};

		chatModeService.addCustomMode(customMode);

		// Wait for the configuration to update
		await timeout(0);

		const configNode = dynamicConfiguration['currentConfigurationNode'];
		const defaultModeProperty = configNode.properties?.[ChatConfiguration.DefaultChatMode];
		const enumValues = defaultModeProperty.enum as string[];

		// Should now include the custom mode
		assert.ok(enumValues.includes(customMode.uri.toString()), 'Should include custom mode ID');
	});

	test('should update configuration when modes are removed', async () => {
		// Add a custom mode first
		const customMode: ICustomChatMode = {
			uri: URI.parse('file:///test/temporary-mode.md'),
			name: 'Temporary Mode',
			description: 'A temporary custom mode',
			tools: [],
			body: 'Temporary mode body',
			variableReferences: []
		};

		chatModeService.addCustomMode(customMode);
		await timeout(0);

		// Verify it was added
		let configNode = dynamicConfiguration['currentConfigurationNode'];
		let defaultModeProperty = configNode.properties?.[ChatConfiguration.DefaultChatMode];
		let enumValues = defaultModeProperty.enum as string[];
		assert.ok(enumValues.includes(customMode.uri.toString()), 'Custom mode should be added');

		// Now remove it
		chatModeService.removeCustomMode(customMode.uri);
		await timeout(0);

		// Verify it was removed
		configNode = dynamicConfiguration['currentConfigurationNode'];
		defaultModeProperty = configNode.properties?.[ChatConfiguration.DefaultChatMode];
		enumValues = defaultModeProperty.enum as string[];
		assert.ok(!enumValues.includes(customMode.uri.toString()), 'Custom mode should be removed');
	});

	test('should clean up configuration when disposed', () => {
		const initialConfigNode = dynamicConfiguration['currentConfigurationNode'];
		assert.ok(initialConfigNode, 'Should have initial configuration');

		dynamicConfiguration.dispose();

		assert.strictEqual(dynamicConfiguration['currentConfigurationNode'], undefined, 'Configuration node should be cleared');
	});
});