/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { convertBareEnvVarsToVsCodeSyntax } from '../../../common/plugins/agentPluginServiceImpl.js';
suite('convertBareEnvVarsToVsCodeSyntax', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    /** Helper to narrow the result configuration to a stdio server. */
    function asStdio(result) {
        assert.strictEqual(result.configuration.type, "stdio" /* McpServerType.LOCAL */);
        return result.configuration;
    }
    /** Helper to narrow the result configuration to a remote server. */
    function asRemote(result) {
        assert.strictEqual(result.configuration.type, "http" /* McpServerType.REMOTE */);
        return result.configuration;
    }
    suite('stdio (LOCAL) servers', () => {
        test('converts bare ${VAR} in command to ${env:VAR}', () => {
            const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
                name: 'test',
                uri: URI.parse('file:///test'),
                configuration: {
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "stdio" /* McpServerType.LOCAL */,
                    command: 'server',
                    env: {
                        TOKEN: '${ENTERPRISE_GITHUB_TOKEN}',
                        STATIC: 'literal-value',
                    },
                },
            }));
            assert.strictEqual(cfg.env.TOKEN, '${env:ENTERPRISE_GITHUB_TOKEN}');
            assert.strictEqual(cfg.env.STATIC, 'literal-value');
        });
        test('converts bare ${VAR} in cwd', () => {
            const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
                name: 'test',
                uri: URI.parse('file:///test'),
                configuration: {
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "stdio" /* McpServerType.LOCAL */,
                    command: '/usr/bin/server',
                    args: ['--port', '8080'],
                    env: { KEY: 'plain-value' },
                },
            }));
            assert.strictEqual(cfg.command, '/usr/bin/server');
            assert.deepStrictEqual(cfg.args, ['--port', '8080']);
            assert.strictEqual(cfg.env.KEY, 'plain-value');
        });
        test('preserves non-string env values (numbers and null)', () => {
            const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
                name: 'test',
                uri: URI.parse('file:///test'),
                configuration: {
                    type: "stdio" /* McpServerType.LOCAL */,
                    command: 'server',
                    env: {
                        PORT: 3000,
                        UNSET: null,
                        TOKEN: '${MY_TOKEN}',
                    },
                },
            }));
            assert.strictEqual(cfg.env.PORT, 3000);
            assert.strictEqual(cfg.env.UNSET, null);
            assert.strictEqual(cfg.env.TOKEN, '${env:MY_TOKEN}');
        });
        test('converts underscore-prefixed variable names', () => {
            const cfg = asStdio(convertBareEnvVarsToVsCodeSyntax({
                name: 'test',
                uri: URI.parse('file:///test'),
                configuration: {
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "stdio" /* McpServerType.LOCAL */,
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
                    type: "http" /* McpServerType.REMOTE */,
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
                    type: "http" /* McpServerType.REMOTE */,
                    url: 'https://example.com/mcp',
                    headers: {
                        Authorization: 'Bearer ${API_TOKEN}',
                        'X-Custom': 'static-value',
                    },
                },
            }));
            assert.strictEqual(cfg.headers.Authorization, 'Bearer ${env:API_TOKEN}');
            assert.strictEqual(cfg.headers['X-Custom'], 'static-value');
        });
        test('does not convert already-namespaced ${env:VAR} in url', () => {
            const cfg = asRemote(convertBareEnvVarsToVsCodeSyntax({
                name: 'test',
                uri: URI.parse('file:///test'),
                configuration: {
                    type: "http" /* McpServerType.REMOTE */,
                    url: 'https://${env:API_HOST}/mcp',
                },
            }));
            assert.strictEqual(cfg.url, 'https://${env:API_HOST}/mcp');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcGx1Z2lucy9jb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFdEcsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFckcsS0FBSyxDQUFDLGtDQUFrQyxFQUFFLEdBQUcsRUFBRTtJQUM5Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLG1FQUFtRTtJQUNuRSxTQUFTLE9BQU8sQ0FBQyxNQUEyRDtRQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxvQ0FBc0IsQ0FBQztRQUNuRSxPQUFPLE1BQU0sQ0FBQyxhQUE2QyxDQUFDO0lBQzdELENBQUM7SUFFRCxvRUFBb0U7SUFDcEUsU0FBUyxRQUFRLENBQUMsTUFBMkQ7UUFDNUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksb0NBQXVCLENBQUM7UUFDcEUsT0FBTyxNQUFNLENBQUMsYUFBOEMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtRQUVuQyxJQUFJLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1lBQzFELE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxnQ0FBZ0MsQ0FBQztnQkFDcEQsSUFB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