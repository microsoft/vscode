/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IMcpServerConfiguration, McpServerType, McpServerVariableType } from '../../common/mcpPlatformTypes.js';
import { getWorkspaceRootMcpConfigurationError, parseWorkspaceRootMcpConfiguration } from '../../common/mcpWorkspaceConfiguration.js';

suite('McpWorkspaceConfiguration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts portable stdio and HTTP configurations without resolving their values', () => {
		const configurations: IMcpServerConfiguration[] = [
			{ type: McpServerType.LOCAL, command: 'node', args: ['server.js'], env: { TOKEN: 'literal', PORT: 3000 } },
			{ type: McpServerType.REMOTE, url: 'https://example.com/mcp', headers: { Authorization: 'literal' }, transport: 'http' },
		];
		assert.deepStrictEqual(configurations.map(config => getWorkspaceRootMcpConfigurationError({ name: 'test', config, inputs: [] })), [undefined, undefined]);
	});

	test('rejects raw metadata, malformed fields and interpolation before normalization', () => {
		const local = { type: 'stdio', command: 'node' };
		const remote = { type: 'http', url: 'https://example.com/mcp' };
		const configurations: unknown[] = [
			null, [], 'node',
			{ ...local, gallery: false },
			{ ...local, version: '1' },
			{ ...local, dev: {} },
			{ ...local, cwd: './server' },
			{ ...local, envFile: '.env' },
			{ ...local, sandboxEnabled: false },
			{ ...local, custom: 'value' },
			{ ...remote, oauth: { clientId: 'client' } },
			{ ...remote, oauthClientId: 'client' },
			{ ...remote, transport: 'sse' },
			{ ...remote, type: 'sse' },
			{ ...remote, type: 'ws' },
			{ ...local, args: ['valid', 1] },
			{ ...local, args: 'invalid' },
			{ ...local, env: [] },
			{ ...local, env: { DROP: null } },
			{ ...local, env: { FLAG: false } },
			{ ...local, env: { PORT: Infinity } },
			{ ...remote, headers: { Authorization: 1 } },
			{ ...local, command: '' },
			{ type: 'http' },
			{ ...local, command: '${env:COMMAND}' },
			{ ...local, args: ['${workspaceFolder}/server.js'] },
			{ ...local, env: { TOKEN: '${input:token}' } },
			{ ...local, env: { TOKEN: '${TOKEN}' } },
			{ ...remote, url: '${env:URL}' },
			{ ...remote, headers: { Authorization: '${command:token}' } },
		];
		assert.deepStrictEqual(configurations.map(config => !!getWorkspaceRootMcpConfigurationError({ name: 'test', config: config as IMcpServerConfiguration })), configurations.map(() => true));
	});

	test('rejects assisted inputs even when the configuration has no input references', () => {
		const error = getWorkspaceRootMcpConfigurationError({
			name: 'assisted',
			config: { type: McpServerType.LOCAL, command: 'node' },
			inputs: [{ id: 'token', type: McpServerVariableType.PROMPT, description: 'Token', password: true }],
		});
		assert.ok(error?.includes('.vscode/mcp.json'));
	});

	test('keeps compatibility errors concise regardless of server name length', () => {
		const error = getWorkspaceRootMcpConfigurationError({
			name: 'long-server-name-'.repeat(20),
			config: { type: McpServerType.LOCAL, command: 'node', cwd: '/workspace' },
		});
		assert.strictEqual(error, '\'cwd\' is not supported in .mcp.json. Use .vscode/mcp.json.');
	});

	test('reads both JSONC shapes and skips invalid entries without changing other configurations', () => {
		const servers = '"local": { "command": "node" }, "bad": null, "array": [], "unsupported": { "type": "ws" }, "remote": { "url": "https://example.com/mcp" },';
		assert.deepStrictEqual([
			parseWorkspaceRootMcpConfiguration(`{ /* wrapped */ "mcpServers": { ${servers} }, "other": true, }`),
			parseWorkspaceRootMcpConfiguration(`{ /* flat */ ${servers} }`),
		].map(parsed => ({
			wrapped: parsed.wrapped,
			servers: Object.entries(parsed.servers).map(([name, config]) => [name, config.type]),
		})), [
			{ wrapped: true, servers: [['local', 'stdio'], ['remote', 'http']] },
			{ wrapped: false, servers: [['local', 'stdio'], ['remote', 'http']] },
		]);
	});

	for (const content of ['', 'null', '[]', '{"mcpServers":null}', '{"mcpServers":[]}', '{"mcpServers":"bad"}', '{"mcpServers":{"good":{"command":"node"}}']) {
		test(`rejects an invalid root document: ${JSON.stringify(content)}`, () => {
			assert.throws(() => parseWorkspaceRootMcpConfiguration(content));
		});
	}
});
