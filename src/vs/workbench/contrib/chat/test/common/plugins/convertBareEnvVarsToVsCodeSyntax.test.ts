/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IMcpRemoteServerConfiguration, IMcpStdioServerConfiguration, McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { convertBareEnvVarsToVsCodeSyntax } from '../../../common/plugins/agentPluginServiceImpl.js';

suite('convertBareEnvVarsToVsCodeSyntax', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/** Helper to narrow the result configuration to a stdio server. */
	function asStdio(result: ReturnType<typeof convertBareEnvVarsToVsCodeSyntax>): IMcpStdioServerConfiguration {
		assert.strictEqual(result.configuration.type, McpServerType.LOCAL);
		return result.configuration as IMcpStdioServerConfiguration;
	}

	/** Helper to narrow the result configuration to a remote server. */
	function asRemote(result: ReturnType<typeof convertBareEnvVarsToVsCodeSyntax>): IMcpRemoteServerConfiguration {
		assert.strictEqual(result.configuration.type, McpServerType.REMOTE);
		return result.configuration as IMcpRemoteServerConfiguration;
	}

	suite('stdio (LOCAL) servers', () => {

		test('converts bare ${VAR} in command to ${env:VAR}', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: '${MY_TOOL_PATH}/bin/server',
				},
			}));
			assert.strictEqual(cfg.command, '${env:MY_TOOL_PATH}/bin/server');
		});

		test('converts bare ${VAR} in args', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: 'node',
					args: ['--token', '${ENTERPRISE_GITHUB_TOKEN}'],
				},
			}));
			assert.deepStrictEqual(cfg.args, ['--token', '${env:ENTERPRISE_GITHUB_TOKEN}']);
		});

		test('converts bare ${VAR} in env values', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: 'server',
					env: {
						TOKEN: '${ENTERPRISE_GITHUB_TOKEN}',
						STATIC: 'literal-value',
					},
				},
			}));
			assert.strictEqual(cfg.env!.TOKEN, '${env:ENTERPRISE_GITHUB_TOKEN}');
			assert.strictEqual(cfg.env!.STATIC, 'literal-value');
		});

		test('converts bare ${VAR} in cwd', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: 'server',
					cwd: '${PROJECT_DIR}/subdir',
				},
			}));
			assert.strictEqual(cfg.cwd, '${env:PROJECT_DIR}/subdir');
		});

		test('converts bare ${VAR} in envFile', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: 'server',
					envFile: '${HOME}/.env',
				},
			}));
			assert.strictEqual(cfg.envFile, '${env:HOME}/.env');
		});

		test('does not convert already-namespaced ${env:VAR} references', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: '${env:ALREADY_RESOLVED}/bin/server',
				},
			}));
			assert.strictEqual(cfg.command, '${env:ALREADY_RESOLVED}/bin/server');
		});

		test('does not convert ${config:...} references', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: '${config:editor.fontSize}',
				},
			}));
			assert.strictEqual(cfg.command, '${config:editor.fontSize}');
		});

		test('does not convert lowercase/camelCase VS Code variable tokens', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: '${workspaceFolder}/server',
					cwd: '${fileDirname}',
				},
			}));
			assert.strictEqual(cfg.command, '${workspaceFolder}/server');
			assert.strictEqual(cfg.cwd, '${fileDirname}');
		});

		test('converts multiple bare ${VAR} references in a single string', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: '${BIN_DIR}/run --config ${CONFIG_DIR}/cfg.json',
				},
			}));
			assert.strictEqual(cfg.command, '${env:BIN_DIR}/run --config ${env:CONFIG_DIR}/cfg.json');
		});

		test('leaves strings without any ${VAR} unchanged', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: '/usr/bin/server',
					args: ['--port', '8080'],
					env: { KEY: 'plain-value' },
				},
			}));
			assert.strictEqual(cfg.command, '/usr/bin/server');
			assert.deepStrictEqual(cfg.args, ['--port', '8080']);
			assert.strictEqual(cfg.env!.KEY, 'plain-value');
		});

		test('preserves non-string env values (numbers and null)', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: 'server',
					env: {
						PORT: 3000,
						UNSET: null,
						TOKEN: '${MY_TOKEN}',
					},
				},
			}));
			assert.strictEqual(cfg.env!.PORT, 3000);
			assert.strictEqual(cfg.env!.UNSET, null);
			assert.strictEqual(cfg.env!.TOKEN, '${env:MY_TOKEN}');
		});

		test('converts underscore-prefixed variable names', () => {
			const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: '${_PRIVATE_BIN}/server',
				},
			}));
			assert.strictEqual(cfg.command, '${env:_PRIVATE_BIN}/server');
		});

		test('preserves the definition name unchanged', () => {
			const result = convertBareEnvVarsToVsCodeSyntax({
				name: 'my-mcp-server',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.LOCAL,
					command: '${MY_PATH}/server',
				},
			});
			assert.strictEqual(result.name, 'my-mcp-server');
		});

		test('preserves uri as a URI instance', () => {
			const input = URI.parse('file:///plugins/my-plugin');
			const result = convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: input,
				configuration: {
					type: McpServerType.LOCAL,
					command: '${MY_PATH}/server',
				},
			});
			assert.ok(URI.isUri(result.uri), 'uri must remain a URI instance');
			assert.strictEqual(result.uri.toString(), input.toString());
		});
	});

	suite('remote (HTTP) servers', () => {

		test('converts bare ${VAR} in url', () => {
			const cfg = asRemote(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.REMOTE,
					url: 'https://${API_HOST}/mcp',
				},
			}));
			assert.strictEqual(cfg.url, 'https://${env:API_HOST}/mcp');
		});

		test('converts bare ${VAR} in header values', () => {
			const cfg = asRemote(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.REMOTE,
					url: 'https://example.com/mcp',
					headers: {
						Authorization: 'Bearer ${API_TOKEN}',
						'X-Custom': 'static-value',
					},
				},
			}));
			assert.strictEqual(cfg.headers!.Authorization, 'Bearer ${env:API_TOKEN}');
			assert.strictEqual(cfg.headers!['X-Custom'], 'static-value');
		});

		test('does not convert already-namespaced ${env:VAR} in url', () => {
			const cfg = asRemote(convertBareEnvVarsToVsCodeSyntax({
				name: 'test',
				uri: URI.parse('file:///test'),
				configuration: {
					type: McpServerType.REMOTE,
					url: 'https://${env:API_HOST}/mcp',
				},
			}));
			assert.strictEqual(cfg.url, 'https://${env:API_HOST}/mcp');
		});
	});
});
