/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PluginFormat, type IMcpServerDefinition } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { CustomizationType, McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { toPluginMcpServerDefinition } from '../../common/discovery/pluginMcpDiscovery.js';
import { McpServerTransportType as LaunchTransportType } from '../../common/mcpTypes.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

suite('PluginMcpDiscovery', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('interpolates AgentPlugin MCP definitions before creating the launch', async () => {
		const pluginUri = URI.file('/plugins/example');
		const pluginDataUri = URI.file('/plugin-data/example');
		const definition: IMcpServerDefinition = {
			name: 'example',
			uri: URI.joinPath(pluginUri, '.mcp.json'),
			configuration: {
				type: McpServerType.LOCAL,
				command: './server.py',
				args: ['--data', '${PLUGIN_DATA}'],
				env: { CUSTOM_ROOT: '${PLUGIN_ROOT}' },
				cwd: '${PLUGIN_DATA}/work',
			},
			customization: {
				type: CustomizationType.McpServer,
				id: 'example',
				uri: URI.joinPath(pluginUri, '.mcp.json').toString(),
				name: 'example',
				state: { kind: McpServerStatus.Stopped },
			},
		};

		const server = await toPluginMcpServerDefinition('plugin:', { dataDir: constObservable(pluginDataUri), format: PluginFormat.AgentPlugin, uri: pluginUri }, definition);
		assert.deepStrictEqual(server?.launch, {
			type: LaunchTransportType.Stdio,
			command: './server.py',
			args: ['--data', pluginDataUri.fsPath],
			cwd: URI.joinPath(pluginDataUri, 'work').fsPath,
			env: {
				CUSTOM_ROOT: pluginUri.fsPath,
				PLUGIN_ROOT: pluginUri.fsPath,
				PLUGIN_DATA: pluginDataUri.fsPath,
			},
			envFile: undefined,
			sandbox: undefined,
		});
	});

	test('does not interpolate non-AgentPlugin MCP definitions', async () => {
		const pluginUri = URI.file('/plugins/example');
		const definition: IMcpServerDefinition = {
			name: 'example',
			uri: URI.joinPath(pluginUri, '.mcp.json'),
			configuration: { type: McpServerType.LOCAL, command: '${PLUGIN_ROOT}/server.py' },
			customization: {
				type: CustomizationType.McpServer,
				id: 'example',
				uri: URI.joinPath(pluginUri, '.mcp.json').toString(),
				name: 'example',
				state: { kind: McpServerStatus.Stopped },
			},
		};

		const server = await toPluginMcpServerDefinition('plugin:', { format: PluginFormat.Copilot, uri: pluginUri }, definition);
		assert.ok(server?.launch.type === LaunchTransportType.Stdio);
		assert.strictEqual(server.launch.command, '${PLUGIN_ROOT}/server.py');
	});

	test('does not interpolate AgentPlugin HTTP URLs or headers', async () => {
		const pluginUri = URI.file('/plugins/example');
		const definition: IMcpServerDefinition = {
			name: 'remote',
			uri: URI.joinPath(pluginUri, 'mcp.json'),
			configuration: {
				type: McpServerType.REMOTE,
				url: 'https://example.test/${PLUGIN_ROOT}',
				headers: { 'X-Plugin': '${PLUGIN_DATA}' },
			},
			customization: {
				type: CustomizationType.McpServer,
				id: 'remote',
				uri: URI.joinPath(pluginUri, 'mcp.json').toString(),
				name: 'remote',
				state: { kind: McpServerStatus.Stopped },
			},
		};

		const server = await toPluginMcpServerDefinition('plugin:', { format: PluginFormat.AgentPlugin, uri: pluginUri }, definition);
		assert.ok(server?.launch.type === LaunchTransportType.HTTP);
		assert.strictEqual(server.launch.uri.toString(true), 'https://example.test/${PLUGIN_ROOT}');
		assert.deepStrictEqual(server.launch.headers, [['X-Plugin', '${PLUGIN_DATA}']]);
	});

	test('creates plugin dataDir on file system when resolving MCP server definition', async () => {
		let createdFolderUri: URI | undefined;

		const fileService = {
			createFolder: async (resource: URI) => {
				createdFolderUri = resource;
				return {} as unknown as ReturnType<IFileService['createFolder']>;
			}
		} as unknown as IFileService;

		const targetDataDir = URI.file('/test/user/globalStorage/agentPlugins/data/a1b2c3d4');

		const plugin: Parameters<typeof toPluginMcpServerDefinition>[1] = {
			format: PluginFormat.AgentPlugin,
			uri: URI.file('/test/plugins/my-plugin'),
			dataDir: targetDataDir,
		} as unknown as Parameters<typeof toPluginMcpServerDefinition>[1];

		const definition: Parameters<typeof toPluginMcpServerDefinition>[2] = {
			name: 'test-server',
			configuration: {
				type: 'stdio',
				command: 'node',
				args: ['${PLUGIN_DATA}/index.js'],
			},
		} as unknown as Parameters<typeof toPluginMcpServerDefinition>[2];

		const result = await toPluginMcpServerDefinition('collection-1', plugin, definition, fileService);

		assert.ok(result);
		assert.strictEqual(createdFolderUri?.toString(), targetDataDir.toString());
	});
});
