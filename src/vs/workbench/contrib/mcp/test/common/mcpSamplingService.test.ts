/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { MockConfigurationService } from '../../../../test/common/workbenchTestServices.js';
import { McpSamplingService } from '../../common/mcpSamplingService.js';
import { IMcpServer, McpCollectionReference, McpDefinitionReference } from '../../common/mcpTypes.js';
import { mcpServerSamplingSection } from '../../common/mcpConfiguration.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';

suite('MCP Sampling Service', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let samplingService: McpSamplingService;
	let configurationService: MockConfigurationService;
	let instantiationService: TestInstantiationService;

	const createMockServer = (id: string, label: string): IMcpServer => ({
		definition: { id, label } as McpDefinitionReference,
		collection: { id: 'test-collection', label: 'Test Collection' } as McpCollectionReference,
		readDefinitions: () => ({
			get: () => ({
				collection: {
					configTarget: ConfigurationTarget.USER,
					presentation: { origin: undefined }
				}
			})
		}),
		dispose: () => { },
		connection: undefined as any,
		connectionState: undefined as any,
		serverMetadata: undefined as any,
		showOutput: async () => { },
		start: async () => undefined as any,
		stop: async () => { },
		cacheState: undefined as any,
		tools: undefined as any,
		prompts: undefined as any,
		capabilities: undefined as any,
		resources: undefined as any,
		resourceTemplates: undefined as any
	});

	setup(() => {
		configurationService = new MockConfigurationService();
		instantiationService = ds.add(new TestInstantiationService());

		// Setup mock services
		instantiationService.stub(ILanguageModelsService, <ILanguageModelsService>{});
		instantiationService.stub(IDialogService, <IDialogService>{});
		instantiationService.stub(INotificationService, <INotificationService>{});
		instantiationService.stub(ICommandService, <ICommandService>{});

		samplingService = ds.add(instantiationService.createInstance(McpSamplingService, configurationService));
	});

	test('updateConfig preserves existing server configurations', async () => {
		const server1 = createMockServer('server1', 'Server 1');
		const server2 = createMockServer('server2', 'Server 2');

		// Initially, no configuration exists
		configurationService.setUserConfiguration(mcpServerSamplingSection, {});

		// Configure server1
		await samplingService.updateConfig(server1, (config) => {
			config.allowedDuringChat = true;
			config.allowedModels = ['model1'];
		});

		// Verify server1 configuration was set
		let currentConfig = configurationService.getValue(mcpServerSamplingSection);
		assert.strictEqual(Object.keys(currentConfig).length, 1);
		assert.strictEqual(currentConfig['Test Collection: Server 1'].allowedDuringChat, true);
		assert.deepStrictEqual(currentConfig['Test Collection: Server 1'].allowedModels, ['model1']);

		// Configure server2 - this should NOT overwrite server1's configuration
		await samplingService.updateConfig(server2, (config) => {
			config.allowedOutsideChat = true;
			config.allowedModels = ['model2'];
		});

		// Verify both server configurations exist
		currentConfig = configurationService.getValue(mcpServerSamplingSection);
		assert.strictEqual(Object.keys(currentConfig).length, 2);

		// Server1 configuration should still exist
		assert.strictEqual(currentConfig['Test Collection: Server 1'].allowedDuringChat, true);
		assert.deepStrictEqual(currentConfig['Test Collection: Server 1'].allowedModels, ['model1']);

		// Server2 configuration should be added
		assert.strictEqual(currentConfig['Test Collection: Server 2'].allowedOutsideChat, true);
		assert.deepStrictEqual(currentConfig['Test Collection: Server 2'].allowedModels, ['model2']);
	});

	test('updateConfig preserves existing server configurations when updating existing server', async () => {
		const server1 = createMockServer('server1', 'Server 1');
		const server2 = createMockServer('server2', 'Server 2');

		// Set initial configuration with both servers
		configurationService.setUserConfiguration(mcpServerSamplingSection, {
			'Test Collection: Server 1': {
				allowedDuringChat: true,
				allowedModels: ['model1']
			},
			'Test Collection: Server 2': {
				allowedOutsideChat: true,
				allowedModels: ['model2']
			}
		});

		// Update server1's configuration
		await samplingService.updateConfig(server1, (config) => {
			config.allowedDuringChat = false;
			config.allowedOutsideChat = true;
		});

		// Verify both servers' configurations exist and server1 was updated correctly
		const currentConfig = configurationService.getValue(mcpServerSamplingSection);
		assert.strictEqual(Object.keys(currentConfig).length, 2);

		// Server1 should be updated
		assert.strictEqual(currentConfig['Test Collection: Server 1'].allowedDuringChat, false);
		assert.strictEqual(currentConfig['Test Collection: Server 1'].allowedOutsideChat, true);
		assert.deepStrictEqual(currentConfig['Test Collection: Server 1'].allowedModels, ['model1']); // Should preserve existing models

		// Server2 should remain unchanged
		assert.strictEqual(currentConfig['Test Collection: Server 2'].allowedOutsideChat, true);
		assert.deepStrictEqual(currentConfig['Test Collection: Server 2'].allowedModels, ['model2']);
	});

	test('updateConfig works correctly when no existing configuration exists', async () => {
		const server1 = createMockServer('server1', 'Server 1');

		// No initial configuration
		configurationService.setUserConfiguration(mcpServerSamplingSection, undefined);

		// Configure server1
		await samplingService.updateConfig(server1, (config) => {
			config.allowedDuringChat = true;
			config.allowedModels = ['model1'];
		});

		// Verify server1 configuration was set correctly
		const currentConfig = configurationService.getValue(mcpServerSamplingSection);
		assert.strictEqual(Object.keys(currentConfig).length, 1);
		assert.strictEqual(currentConfig['Test Collection: Server 1'].allowedDuringChat, true);
		assert.deepStrictEqual(currentConfig['Test Collection: Server 1'].allowedModels, ['model1']);
	});
});