/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { McpSamplingService } from '../../common/mcpSamplingService.js';
import { IMcpServer, IMcpServerDefinition } from '../../common/mcpTypes.js';
import { mcpServerSamplingSection } from '../../common/mcpConfiguration.js';

suite('MCP - Sampling Service Configuration', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let samplingService: McpSamplingService;
	let configurationService: TestConfigurationService;
	let instantiationService: TestInstantiationService;

	const createMockServer = (id: string, label: string): IMcpServer => {
		const definition: IMcpServerDefinition = {
			id,
			label,
			type: 'stdio' as const,
			command: 'test',
		};

		return {
			definition,
			collection: {
				label: 'Test Collection',
				configTarget: ConfigurationTarget.USER,
			},
			readDefinitions: () => ({
				get: () => ({
					collection: {
						label: 'Test Collection',
						configTarget: ConfigurationTarget.USER,
					}
				})
			})
		} as any;
	};

	setup(() => {
		configurationService = new TestConfigurationService();
		instantiationService = ds.add(new TestInstantiationService());
		instantiationService.stub(ILanguageModelsService, {} as ILanguageModelsService);

		samplingService = ds.add(instantiationService.createInstance(McpSamplingService, configurationService));
	});

	test('should add new server configurations without overwriting existing ones', async () => {
		const server1 = createMockServer('server1', 'Server 1');
		const server2 = createMockServer('server2', 'Server 2');

		// Configure first server
		await samplingService.updateConfig(server1, config => {
			config.allowedDuringChat = true;
			config.allowedModels = ['model1'];
		});

		// Verify first server configuration was saved
		const config1 = configurationService.getValue(mcpServerSamplingSection);
		assert.strictEqual(Object.keys(config1).length, 1);
		assert.strictEqual(config1['Test Collection: Server 1'].allowedDuringChat, true);
		assert.deepStrictEqual(config1['Test Collection: Server 1'].allowedModels, ['model1']);

		// Configure second server
		await samplingService.updateConfig(server2, config => {
			config.allowedDuringChat = false;
			config.allowedModels = ['model2'];
		});

		// Verify both server configurations exist
		const finalConfig = configurationService.getValue(mcpServerSamplingSection);
		assert.strictEqual(Object.keys(finalConfig).length, 2);

		// First server configuration should still exist
		assert.strictEqual(finalConfig['Test Collection: Server 1'].allowedDuringChat, true);
		assert.deepStrictEqual(finalConfig['Test Collection: Server 1'].allowedModels, ['model1']);

		// Second server configuration should be added
		assert.strictEqual(finalConfig['Test Collection: Server 2'].allowedDuringChat, false);
		assert.deepStrictEqual(finalConfig['Test Collection: Server 2'].allowedModels, ['model2']);
	});

	test('should update existing server configuration without affecting other servers', async () => {
		const server1 = createMockServer('server1', 'Server 1');
		const server2 = createMockServer('server2', 'Server 2');

		// Set up initial configurations for both servers
		await samplingService.updateConfig(server1, config => {
			config.allowedDuringChat = true;
			config.allowedModels = ['model1'];
		});

		await samplingService.updateConfig(server2, config => {
			config.allowedDuringChat = false;
			config.allowedModels = ['model2'];
		});

		// Update first server's configuration
		await samplingService.updateConfig(server1, config => {
			config.allowedDuringChat = false;
			config.allowedModels = ['model1-updated'];
		});

		// Verify both configurations exist and first server was updated
		const finalConfig = configurationService.getValue(mcpServerSamplingSection);
		assert.strictEqual(Object.keys(finalConfig).length, 2);

		// First server configuration should be updated
		assert.strictEqual(finalConfig['Test Collection: Server 1'].allowedDuringChat, false);
		assert.deepStrictEqual(finalConfig['Test Collection: Server 1'].allowedModels, ['model1-updated']);

		// Second server configuration should remain unchanged
		assert.strictEqual(finalConfig['Test Collection: Server 2'].allowedDuringChat, false);
		assert.deepStrictEqual(finalConfig['Test Collection: Server 2'].allowedModels, ['model2']);
	});

	test('should handle empty initial configuration correctly', async () => {
		const server1 = createMockServer('server1', 'Server 1');

		// Verify initial configuration is empty
		let config = configurationService.getValue(mcpServerSamplingSection);
		assert.strictEqual(Object.keys(config).length, 0);

		// Configure first server
		await samplingService.updateConfig(server1, config => {
			config.allowedDuringChat = true;
		});

		// Verify configuration was saved
		config = configurationService.getValue(mcpServerSamplingSection);
		assert.strictEqual(Object.keys(config).length, 1);
		assert.strictEqual(config['Test Collection: Server 1'].allowedDuringChat, true);
	});
});