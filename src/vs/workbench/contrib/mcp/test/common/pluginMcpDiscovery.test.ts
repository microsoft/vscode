/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PluginFormat, type IMcpServerDefinition } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { CustomizationType, McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { toPluginMcpServerDefinition } from '../../common/discovery/pluginMcpDiscovery.js';
import { McpServerTransportType as LaunchTransportType } from '../../common/mcpTypes.js';

suite('PluginMcpDiscovery', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('interpolates AgentPlugin MCP definitions before creating the launch', () => {
		const pluginUri = URI.file('/plugins/example');
		const definition: IMcpServerDefinition = {
			name: 'example',
			uri: URI.joinPath(pluginUri, '.mcp.json'),
			configuration: {
				type: McpServerType.LOCAL,
				command: '${PLUGIN_ROOT}/server.py',
				args: ['--data', '${PLUGIN_DATA}'],
				env: { CUSTOM_ROOT: '${PLUGIN_ROOT}' },
			},
			customization: {
				type: CustomizationType.McpServer,
				id: 'example',
				uri: URI.joinPath(pluginUri, '.mcp.json').toString(),
				name: 'example',
				state: { kind: McpServerStatus.Stopped },
			},
		};

		const server = toPluginMcpServerDefinition('plugin:', { format: PluginFormat.AgentPlugin, uri: pluginUri }, definition);
		assert.deepStrictEqual(server?.launch, {
			type: LaunchTransportType.Stdio,
			command: `${pluginUri.fsPath}/server.py`,
			args: ['--data', pluginUri.fsPath],
			cwd: undefined,
			env: {
				CUSTOM_ROOT: pluginUri.fsPath,
				PLUGIN_ROOT: pluginUri.fsPath,
				PLUGIN_DATA: pluginUri.fsPath,
			},
			envFile: undefined,
			sandbox: undefined,
		});
	});

	test('does not interpolate non-AgentPlugin MCP definitions', () => {
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

		const server = toPluginMcpServerDefinition('plugin:', { format: PluginFormat.Copilot, uri: pluginUri }, definition);
		assert.ok(server?.launch.type === LaunchTransportType.Stdio);
		assert.strictEqual(server.launch.command, '${PLUGIN_ROOT}/server.py');
	});
});
