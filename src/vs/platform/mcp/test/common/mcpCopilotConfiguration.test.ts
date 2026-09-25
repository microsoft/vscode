/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { fromCopilotMcpServerConfiguration, toCopilotMcpServerConfiguration } from '../../common/mcpCopilotConfiguration.js';
import { getCopilotGlobalMcpConfigurationResource } from '../../common/mcpCopilotGlobalConfiguration.js';
import { McpServerType } from '../../common/mcpPlatformTypes.js';

suite('McpCopilotConfiguration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('converts stdio, cwd, env and remote OAuth/SSE to the SDK format', () => {
		assert.deepStrictEqual([
			toCopilotMcpServerConfiguration({ type: McpServerType.LOCAL, command: 'node' }),
			toCopilotMcpServerConfiguration({ type: McpServerType.LOCAL, command: 'node', args: ['server.js'], env: { TOKEN: '$TOKEN', PORT: 3000, UNSET: null }, cwd: '/configured' }),
			toCopilotMcpServerConfiguration({ type: McpServerType.LOCAL, command: 'node', cwd: './relative' }, '/resolved'),
			toCopilotMcpServerConfiguration({ type: McpServerType.REMOTE, url: 'https://example.com/mcp' }),
			toCopilotMcpServerConfiguration({ type: McpServerType.REMOTE, transport: 'sse', url: 'https://example.com/sse', headers: { Authorization: '$TOKEN' }, oauth: { clientId: 'client' } }),
		], [
			{ type: 'local', command: 'node', args: [], tools: ['*'] },
			{ type: 'local', command: 'node', args: ['server.js'], tools: ['*'], env: { TOKEN: '$TOKEN', PORT: '3000' }, cwd: '/configured' },
			{ type: 'local', command: 'node', args: [], tools: ['*'], cwd: '/resolved' },
			{ type: 'http', url: 'https://example.com/mcp', tools: ['*'] },
			{ type: 'sse', url: 'https://example.com/sse', tools: ['*'], headers: { Authorization: '$TOKEN' }, oauthClientId: 'client' },
		]);
	});

	test('reads supported entries without rejecting CLI-owned properties', () => {
		const servers = [
			{ type: 'local', command: 'node', cwd: '/repo', tools: ['read'], timeout: 30000 },
			{ type: 'sse', url: 'https://example.com/sse', oauthClientId: 'client' },
			{ type: 'ws', url: 'ws://localhost' },
			{ type: 'local' },
		];
		assert.deepStrictEqual(JSON.parse(JSON.stringify(servers.map(fromCopilotMcpServerConfiguration))), [
			{ type: 'stdio', command: 'node', cwd: '/repo' },
			{ type: 'http', transport: 'sse', url: 'https://example.com/sse', oauth: { clientId: 'client' } },
			null, null,
		]);
	});

	test('uses the discovery host and Copilot home override', () => {
		const homedir = URI.file('/home/me');
		assert.deepStrictEqual([
			getCopilotGlobalMcpConfigurationResource({ homedir }).path,
			getCopilotGlobalMcpConfigurationResource({ homedir, copilotHome: URI.file('/custom') }).path,
		], ['/home/me/.copilot/mcp-config.json', '/custom/mcp-config.json']);
	});

	test('preserves the remote discovery scheme and authority for default and custom Copilot homes', () => {
		const resources = ['/home/remote', '/c:/Users/remote'].flatMap(path => {
			const homedir = URI.parse(`vscode-remote://ssh-remote+test${path}`);
			const copilotHome = URI.parse('vscode-remote://ssh-remote+test/custom/copilot');
			return [
				getCopilotGlobalMcpConfigurationResource({ homedir }).toString(),
				getCopilotGlobalMcpConfigurationResource({ homedir, copilotHome }).toString(),
			];
		});

		assert.deepStrictEqual(resources, [
			URI.parse('vscode-remote://ssh-remote+test/home/remote/.copilot/mcp-config.json').toString(),
			URI.parse('vscode-remote://ssh-remote+test/custom/copilot/mcp-config.json').toString(),
			URI.parse('vscode-remote://ssh-remote+test/c:/Users/remote/.copilot/mcp-config.json').toString(),
			URI.parse('vscode-remote://ssh-remote+test/custom/copilot/mcp-config.json').toString(),
		]);
	});
});
