/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Event } from '../../../../base/common/event.js';
import { McpManagementCli } from '../../common/mcpManagementCli.js';
import { ILogger } from '../../../log/common/log.js';
import { IMcpManagementService, IInstallableMcpServer, InstallOptions, ILocalMcpServer, IGalleryMcpServerConfiguration, RegistryType } from '../../common/mcpManagement.js';
import { McpServerType } from '../../common/mcpPlatformTypes.js';
import { URI } from '../../../../base/common/uri.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';

class MockLogger implements ILogger {
	onDidChangeLogLevel = Event.None;
	getLevel() { return 0; }
	setLevel() { }
	trace() { }
	debug() { }
	info() { }
	warn() { }
	error() { }
	flush() { }
	dispose() { }
}

class MockMcpManagementService implements IMcpManagementService {
	readonly _serviceBrand = undefined;
	readonly onInstallMcpServer = Event.None;
	readonly onDidInstallMcpServers = Event.None;
	readonly onDidUpdateMcpServers = Event.None;
	readonly onUninstallMcpServer = Event.None;
	readonly onDidUninstallMcpServer = Event.None;

	public lastInstalledServer: IInstallableMcpServer | undefined;
	public lastInstallOptions: InstallOptions | undefined;

	async getInstalled() { return []; }
	canInstall(): true | IMarkdownString { return true as const; }
	
	async install(server: IInstallableMcpServer, options?: InstallOptions): Promise<ILocalMcpServer> {
		this.lastInstalledServer = server;
		this.lastInstallOptions = options;
		
		return {
			name: server.name,
			config: server.config,
			mcpResource: URI.file('/test'),
			source: 'local'
		};
	}
	
	async installFromGallery(): Promise<ILocalMcpServer> { throw new Error('Not implemented'); }
	async updateMetadata(): Promise<ILocalMcpServer> { throw new Error('Not implemented'); }
	async uninstall() { }
	getMcpServerConfigurationFromManifest(manifest: IGalleryMcpServerConfiguration, packageType: RegistryType): Omit<IInstallableMcpServer, 'name'> { 
		throw new Error('Not implemented'); 
	}
}

suite('McpManagementCli', () => {
	let cli: McpManagementCli;
	let mockLogger: MockLogger;
	let mockMcpService: MockMcpManagementService;
	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
		mockLogger = new MockLogger();
		mockMcpService = new MockMcpManagementService();
		cli = new McpManagementCli(mockLogger, mockMcpService);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should install MCP server without target', async () => {
		const serverConfig = JSON.stringify({
			name: 'test-server',
			command: 'node',
			args: ['server.js']
		});

		await cli.addMcpDefinitions([serverConfig]);

		assert.strictEqual(mockMcpService.lastInstalledServer?.name, 'test-server');
		assert.strictEqual(mockMcpService.lastInstalledServer?.config.type, McpServerType.LOCAL);
		if (mockMcpService.lastInstalledServer?.config.type === McpServerType.LOCAL) {
			assert.strictEqual(mockMcpService.lastInstalledServer.config.command, 'node');
			assert.deepStrictEqual(mockMcpService.lastInstalledServer.config.args, ['server.js']);
		}
		assert.strictEqual(mockMcpService.lastInstallOptions, undefined);
	});

	test('should install MCP server with user target', async () => {
		const serverConfig = JSON.stringify({
			name: 'test-server',
			command: 'node',
			args: ['server.js']
		});

		await cli.addMcpDefinitions([serverConfig], 'user');

		assert.strictEqual(mockMcpService.lastInstalledServer?.name, 'test-server');
		assert.strictEqual(mockMcpService.lastInstallOptions, undefined); // CLI doesn't pass options to platform service
	});

	test('should handle workspace target with warning', async () => {
		const serverConfig = JSON.stringify({
			name: 'test-server',
			command: 'node',
			args: ['server.js']
		});

		// For now, CLI doesn't support workspace target, so it should warn and install to user
		await cli.addMcpDefinitions([serverConfig], 'workspace');

		assert.strictEqual(mockMcpService.lastInstalledServer?.name, 'test-server');
		assert.strictEqual(mockMcpService.lastInstallOptions, undefined);
	});

	test('should handle invalid target with warning', async () => {
		const serverConfig = JSON.stringify({
			name: 'test-server',
			command: 'node',
			args: ['server.js']
		});

		await cli.addMcpDefinitions([serverConfig], 'invalid');

		assert.strictEqual(mockMcpService.lastInstalledServer?.name, 'test-server');
		assert.strictEqual(mockMcpService.lastInstallOptions, undefined);
	});

	test('should validate required name property', async () => {
		const serverConfig = JSON.stringify({
			command: 'node',
			args: ['server.js']
		});

		await assert.rejects(
			() => cli.addMcpDefinitions([serverConfig]),
			/Missing name property/
		);
	});

	test('should validate required command or url property', async () => {
		const serverConfig = JSON.stringify({
			name: 'test-server'
		});

		await assert.rejects(
			() => cli.addMcpDefinitions([serverConfig]),
			/Missing command or URL property/
		);
	});

	test('should handle invalid JSON', async () => {
		const invalidJson = '{ invalid json';

		await assert.rejects(
			() => cli.addMcpDefinitions([invalidJson]),
			/Invalid JSON/
		);
	});

	test('should handle multiple server definitions', async () => {
		const serverConfigs = [
			JSON.stringify({
				name: 'server1',
				command: 'node',
				args: ['server1.js']
			}),
			JSON.stringify({
				name: 'server2',
				url: 'http://localhost:3000'
			})
		];

		await cli.addMcpDefinitions(serverConfigs);

		// Should install the last server (the service mock only tracks the last one)
		assert.strictEqual(mockMcpService.lastInstalledServer?.name, 'server2');
	});

	test('should handle server with inputs', async () => {
		const serverConfig = JSON.stringify({
			name: 'test-server',
			command: 'node',
			args: ['server.js'],
			inputs: [{
				description: 'API key for the service'
			}]
		});

		await cli.addMcpDefinitions([serverConfig]);

		assert.strictEqual(mockMcpService.lastInstalledServer?.name, 'test-server');
		assert.strictEqual(mockMcpService.lastInstalledServer?.inputs?.length, 1);
		assert.strictEqual(mockMcpService.lastInstalledServer?.inputs?.[0].description, 'API key for the service');
	});
});