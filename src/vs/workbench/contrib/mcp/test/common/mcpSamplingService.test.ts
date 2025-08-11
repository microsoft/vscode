/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mcpServerSamplingSection } from '../../common/mcpConfiguration.js';
import { McpSamplingService } from '../../common/mcpSamplingService.js';
import { IMcpServer } from '../../common/mcpTypes.js';
import { TestNotificationService } from '../../../../test/common/workbenchTestServices.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TestCommandService } from '../../../../test/common/workbenchTestServices.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';

suite('MCP - Sampling Service Configuration', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let configurationService: TestConfigurationService;
	let samplingService: McpSamplingService;
	let instantiationService: TestInstantiationService;

	// Mock servers
	const mockServer1: IMcpServer = {
		definition: { id: 'server1', label: 'Test Server 1' },
		collection: { label: 'Global in Code' },
		readDefinitions: () => ({
			get: () => ({ collection: { configTarget: ConfigurationTarget.USER } })
		})
	} as any;

	const mockServer2: IMcpServer = {
		definition: { id: 'server2', label: 'Test Server 2' },
		collection: { label: 'Global in Code' },
		readDefinitions: () => ({
			get: () => ({ collection: { configTarget: ConfigurationTarget.USER } })
		})
	} as any;

	// Mock language models service
	const mockLanguageModelsService: ILanguageModelsService = {
		getLanguageModelIds: () => ['model1', 'model2', 'model3'],
		lookupLanguageModel: (id: string) => ({
			id,
			name: `Model ${id}`,
			isUserSelectable: true,
			isDefault: id === 'model1'
		}),
		sendChatRequest: () => Promise.resolve({} as any)
	} as any;

	setup(() => {
		configurationService = new TestConfigurationService();
		instantiationService = ds.add(new TestInstantiationService());
		instantiationService.stub(ILanguageModelsService, mockLanguageModelsService);

		samplingService = ds.add(new McpSamplingService(
			mockLanguageModelsService,
			configurationService,
			new TestDialogService(),
			new TestNotificationService(),
			new TestCommandService(instantiationService),
			instantiationService
		));
	});

	test('multiple server configurations should not overwrite each other', async () => {
		// Configure first server
		await samplingService.updateConfig(mockServer1, config => {
			config.allowedModels = ['model1', 'model2'];
		});

		// Verify first server config is set
		const config1 = configurationService.getValue(mcpServerSamplingSection);
		assert.deepStrictEqual(config1, {
			'Global in Code: Test Server 1': {
				allowedModels: ['model1', 'model2']
			}
		});

		// Configure second server
		await samplingService.updateConfig(mockServer2, config => {
			config.allowedModels = ['model2', 'model3'];
		});

		// Verify both server configs exist
		const finalConfig = configurationService.getValue(mcpServerSamplingSection);
		assert.deepStrictEqual(finalConfig, {
			'Global in Code: Test Server 1': {
				allowedModels: ['model1', 'model2']
			},
			'Global in Code: Test Server 2': {
				allowedModels: ['model2', 'model3']
			}
		});

		// Verify individual server configs can still be retrieved
		const server1Config = samplingService.getConfig(mockServer1);
		assert.deepStrictEqual(server1Config.allowedModels, ['model1', 'model2']);

		const server2Config = samplingService.getConfig(mockServer2);
		assert.deepStrictEqual(server2Config.allowedModels, ['model2', 'model3']);
	});

	test('updating existing server configuration should preserve other servers', async () => {
		// Set up initial configuration with both servers
		await configurationService.updateValue(mcpServerSamplingSection, {
			'Global in Code: Test Server 1': {
				allowedModels: ['model1']
			},
			'Global in Code: Test Server 2': {
				allowedModels: ['model2']
			}
		});

		// Update first server
		await samplingService.updateConfig(mockServer1, config => {
			config.allowedModels = ['model1', 'model3'];
			config.allowedDuringChat = true;
		});

		// Verify both configs still exist and first is updated
		const finalConfig = configurationService.getValue(mcpServerSamplingSection);
		assert.deepStrictEqual(finalConfig, {
			'Global in Code: Test Server 1': {
				allowedModels: ['model1', 'model3'],
				allowedDuringChat: true
			},
			'Global in Code: Test Server 2': {
				allowedModels: ['model2']
			}
		});
	});

	test('server configuration should work when no previous configuration exists', async () => {
		// Ensure no existing configuration
		assert.strictEqual(configurationService.getValue(mcpServerSamplingSection), undefined);

		// Configure server
		await samplingService.updateConfig(mockServer1, config => {
			config.allowedModels = ['model1'];
		});

		// Verify configuration is created
		const config = configurationService.getValue(mcpServerSamplingSection);
		assert.deepStrictEqual(config, {
			'Global in Code: Test Server 1': {
				allowedModels: ['model1']
			}
		});
	});
});