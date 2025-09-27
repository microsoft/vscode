/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { LocalMcpConfigService, McpLocalSettings } from '../../common/mcpLocalConfigLoader.js';
import { TestFileService } from '../../../../services/files/test/common/testFileService.js';
import { TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';

suite('LocalMcpConfigService', () => {
	let fileService: TestFileService;
	let environmentService: TestEnvironmentService;
	let logService: ILogService;
	let configService: LocalMcpConfigService;

	setup(() => {
		fileService = new TestFileService();
		environmentService = new TestEnvironmentService();
		logService = new NullLogService();
	});

	teardown(() => {
		configService?.dispose();
	});

	test('should return null when config file does not exist', async () => {
		configService = new LocalMcpConfigService(fileService, environmentService, logService);
		
		// Wait a bit for async loading to complete
		await new Promise(resolve => setTimeout(resolve, 10));
		
		const config = configService.getDiscoveryConfig();
		assert.strictEqual(config, null);
	});

	test('should return null when config file is empty', async () => {
		const configPath = URI.file('/test/user/data/cline_mcp_settings.json');
		fileService.setContent(configPath, VSBuffer.fromString(''));
		
		configService = new LocalMcpConfigService(fileService, environmentService, logService);
		
		// Wait a bit for async loading to complete
		await new Promise(resolve => setTimeout(resolve, 10));
		
		const config = configService.getDiscoveryConfig();
		assert.strictEqual(config, null);
	});

	test('should return null when config file contains malformed JSON', async () => {
		const configPath = URI.file('/test/user/data/cline_mcp_settings.json');
		fileService.setContent(configPath, VSBuffer.fromString('{ invalid json'));
		
		configService = new LocalMcpConfigService(fileService, environmentService, logService);
		
		// Wait a bit for async loading to complete
		await new Promise(resolve => setTimeout(resolve, 10));
		
		const config = configService.getDiscoveryConfig();
		assert.strictEqual(config, null);
	});

	test('should return null when config file does not contain mcp_discovery object', async () => {
		const configPath = URI.file('/test/user/data/cline_mcp_settings.json');
		const settings = { other_config: { enabled: true } };
		fileService.setContent(configPath, VSBuffer.fromString(JSON.stringify(settings)));
		
		configService = new LocalMcpConfigService(fileService, environmentService, logService);
		
		// Wait a bit for async loading to complete
		await new Promise(resolve => setTimeout(resolve, 10));
		
		const config = configService.getDiscoveryConfig();
		assert.strictEqual(config, null);
	});

	test('should return valid config when file exists and is valid', async () => {
		const configPath = URI.file('/test/user/data/cline_mcp_settings.json');
		const settings: McpLocalSettings = {
			mcp_discovery: {
				enabled: true,
				hostname: 'staging-discovery.example.com',
				port: 443,
				use_tls: true,
				timeout_ms: 5000
			}
		};
		fileService.setContent(configPath, VSBuffer.fromString(JSON.stringify(settings)));
		
		configService = new LocalMcpConfigService(fileService, environmentService, logService);
		
		// Wait a bit for async loading to complete
		await new Promise(resolve => setTimeout(resolve, 10));
		
		const config = configService.getDiscoveryConfig();
		assert.ok(config);
		assert.strictEqual(config.enabled, true);
		assert.strictEqual(config.hostname, 'staging-discovery.example.com');
		assert.strictEqual(config.port, 443);
		assert.strictEqual(config.use_tls, true);
		assert.strictEqual(config.timeout_ms, 5000);
	});

	test('should handle partial config correctly', async () => {
		const configPath = URI.file('/test/user/data/cline_mcp_settings.json');
		const settings: McpLocalSettings = {
			mcp_discovery: {
				enabled: false
			}
		};
		fileService.setContent(configPath, VSBuffer.fromString(JSON.stringify(settings)));
		
		configService = new LocalMcpConfigService(fileService, environmentService, logService);
		
		// Wait a bit for async loading to complete
		await new Promise(resolve => setTimeout(resolve, 10));
		
		const config = configService.getDiscoveryConfig();
		assert.ok(config);
		assert.strictEqual(config.enabled, false);
		assert.strictEqual(config.hostname, undefined);
		assert.strictEqual(config.port, undefined);
		assert.strictEqual(config.use_tls, undefined);
		assert.strictEqual(config.timeout_ms, undefined);
	});
});