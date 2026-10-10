/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { toCopilotMcpServerConfiguration } from '../../../../../platform/mcp/common/mcpCopilotConfiguration.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { McpResourceFormat } from '../../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { mcpRemoteServerSchema, mcpStdioServerSchema } from '../../common/mcpConfiguration.js';
import { getMcpGenerationSchema, normalizeMcpGeneratedConfiguration } from '../../common/mcpConfigurationGeneration.js';

suite('MCP configuration generation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const format of [McpResourceFormat.Vscode, McpResourceFormat.WorkspaceRoot, McpResourceFormat.CopilotGlobal]) {
		test(`the ${format} schema requires one name and preserves transport alternatives`, () => {
			const schema = getMcpGenerationSchema(format);
			assert.deepStrictEqual(schema.oneOf!.map(branch => ({
				required: branch.required,
				additionalProperties: branch.additionalProperties,
				type: branch.properties!.type.enum,
				name: branch.properties!.name.minLength,
			})), [
				{ required: ['name', 'command'], additionalProperties: false, type: [format === McpResourceFormat.CopilotGlobal ? 'local' : 'stdio'], name: 1 },
				{ required: ['name', 'url'], additionalProperties: false, type: ['http', 'sse'], name: 1 },
			]);
		});
	}

	test('VS Code schemas are reused, while root output can retain fields requiring explicit fallback', () => {
		for (const format of [McpResourceFormat.Vscode, McpResourceFormat.WorkspaceRoot]) {
			const [stdio, http] = getMcpGenerationSchema(format).oneOf!;
			assert.deepStrictEqual({
				cwd: stdio.properties!.cwd,
				envFile: stdio.properties!.envFile,
				oauth: http.properties!.oauth,
			}, {
				cwd: mcpStdioServerSchema.properties!.cwd,
				envFile: mcpStdioServerSchema.properties!.envFile,
				oauth: mcpRemoteServerSchema.properties!.oauth,
			});
		}
	});

	test('Copilot schema uses its own dialect without VS Code-only fields', () => {
		const [stdio, http] = getMcpGenerationSchema(McpResourceFormat.CopilotGlobal).oneOf!;
		assert.deepStrictEqual({
			local: Object.keys(stdio.properties!),
			remote: Object.keys(http.properties!),
			tools: stdio.properties!.tools,
		}, {
			local: ['type', 'command', 'args', 'env', 'cwd', 'tools', 'name'],
			remote: ['type', 'url', 'headers', 'oauthClientId', 'tools', 'name'],
			tools: { const: ['*'] },
		});
	});

	test('Copilot output round-trips once through shared converters without losing SSE or OAuth', () => {
		const server = { type: 'sse', url: 'https://example.com', headers: { Authorization: 'Bearer ${TOKEN}' }, oauthClientId: 'client', tools: ['*'] };
		const config = normalizeMcpGeneratedConfiguration({ type: 'assisted', format: McpResourceFormat.CopilotGlobal, name: 'test', server }, McpResourceFormat.CopilotGlobal);
		assert.deepStrictEqual(toCopilotMcpServerConfiguration(config), server);
	});

	test('VS Code output keeps development, sandbox and enterprise OAuth fields', () => {
		const servers = [
			{ type: 'stdio', command: 'node', sandboxEnabled: true, dev: { watch: '*.js' }, envFile: '.env' },
			{ type: 'sse', url: 'https://example.com', oauth: { clientId: 'client', enterpriseManaged: true } },
		];
		const configs = servers.map(server => normalizeMcpGeneratedConfiguration({ type: 'assisted', format: McpResourceFormat.Vscode, name: 'test', server }, McpResourceFormat.Vscode));
		assert.deepStrictEqual(configs, [
			{ ...servers[0], args: undefined, env: undefined, cwd: undefined },
			{ ...servers[1], type: 'http', transport: 'sse', headers: undefined, dev: undefined },
		]);
	});

	test('mapped HTTP manifests stay HTTP and retain their input metadata outside normalization', () => {
		const server: IMcpServerConfiguration = { type: McpServerType.REMOTE, transport: 'sse', url: 'https://example.com' };
		assert.strictEqual(normalizeMcpGeneratedConfiguration({ type: 'mapped', name: 'test', server }, McpResourceFormat.CopilotGlobal), server);
	});

	test('mismatched and invalid model output fail explicitly', () => {
		assert.throws(() => normalizeMcpGeneratedConfiguration({ type: 'assisted', format: McpResourceFormat.Vscode, name: 'test', server: { command: 'node' } }, McpResourceFormat.CopilotGlobal), /unexpected configuration format/);
		assert.throws(() => normalizeMcpGeneratedConfiguration({ type: 'assisted', format: McpResourceFormat.CopilotGlobal, name: 'test', server: {} }, McpResourceFormat.CopilotGlobal), /invalid/);
	});
});
