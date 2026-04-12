/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { toSdkMcpServers, toSdkCustomAgents, toSdkSkillDirectories, parsedPluginsEqual } from '../../node/copilot/copilotPluginConverters.js';
suite('copilotPluginConverters', () => {
    const disposables = new DisposableStore();
    let fileService;
    setup(() => {
        fileService = disposables.add(new FileService(new NullLogService()));
        disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
    });
    teardown(() => disposables.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    // ---- toSdkMcpServers ------------------------------------------------
    suite('toSdkMcpServers', () => {
        test('converts local server definitions', () => {
            const defs = [{
                    name: 'test-server',
                    uri: URI.file('/plugin'),
                    configuration: {
                        type: "stdio" /* McpServerType.LOCAL */,
                        command: 'node',
                        args: ['server.js', '--port', '3000'],
                        env: { NODE_ENV: 'production', PORT: 3000 },
                        cwd: '/workspace',
                    },
                }];
            const result = toSdkMcpServers(defs);
            assert.deepStrictEqual(result, {
                'test-server': {
                    type: 'local',
                    command: 'node',
                    args: ['server.js', '--port', '3000'],
                    tools: ['*'],
                    env: { NODE_ENV: 'production', PORT: '3000' },
                    cwd: '/workspace',
                },
            });
        });
        test('converts remote/http server definitions', () => {
            const defs = [{
                    name: 'remote-server',
                    uri: URI.file('/plugin'),
                    configuration: {
                        type: "http" /* McpServerType.REMOTE */,
                        url: 'https://example.com/mcp',
                        headers: { 'Authorization': 'Bearer token' },
                    },
                }];
            const result = toSdkMcpServers(defs);
            assert.deepStrictEqual(result, {
                'remote-server': {
                    type: 'http',
                    url: 'https://example.com/mcp',
                    tools: ['*'],
                    headers: { 'Authorization': 'Bearer token' },
                },
            });
        });
        test('handles empty definitions', () => {
            const result = toSdkMcpServers([]);
            assert.deepStrictEqual(result, {});
        });
        test('omits optional fields when undefined', () => {
            const defs = [{
                    name: 'minimal',
                    uri: URI.file('/plugin'),
                    configuration: {
                        type: "stdio" /* McpServerType.LOCAL */,
                        command: 'echo',
                    },
                }];
            const result = toSdkMcpServers(defs);
            assert.strictEqual(result['minimal'].type, 'local');
            assert.deepStrictEqual(result['minimal'].args, []);
            assert.strictEqual(Object.hasOwn(result['minimal'], 'env'), false);
            assert.strictEqual(Object.hasOwn(result['minimal'], 'cwd'), false);
        });
        test('filters null values from env', () => {
            const defs = [{
                    name: 'with-null-env',
                    uri: URI.file('/plugin'),
                    configuration: {
                        type: "stdio" /* McpServerType.LOCAL */,
                        command: 'test',
                        env: { KEEP: 'value', DROP: null },
                    },
                }];
            const result = toSdkMcpServers(defs);
            const env = result['with-null-env'].env;
            assert.deepStrictEqual(env, { KEEP: 'value' });
        });
    });
    // ---- toSdkCustomAgents ----------------------------------------------
    suite('toSdkCustomAgents', () => {
        test('reads agent files and creates configs', async () => {
            const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/helper.md' });
            await fileService.writeFile(agentUri, VSBuffer.fromString('You are a helpful assistant'));
            const agents = [{ uri: agentUri, name: 'helper' }];
            const result = await toSdkCustomAgents(agents, fileService);
            assert.deepStrictEqual(result, [{
                    name: 'helper',
                    prompt: 'You are a helpful assistant',
                }]);
        });
        test('skips agents whose files cannot be read', async () => {
            const agents = [
                { uri: URI.from({ scheme: Schemas.inMemory, path: '/nonexistent/agent.md' }), name: 'missing' },
            ];
            const result = await toSdkCustomAgents(agents, fileService);
            assert.deepStrictEqual(result, []);
        });
        test('processes multiple agents, skipping failures', async () => {
            const goodUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/good.md' });
            await fileService.writeFile(goodUri, VSBuffer.fromString('Good agent'));
            const agents = [
                { uri: goodUri, name: 'good' },
                { uri: URI.from({ scheme: Schemas.inMemory, path: '/agents/bad.md' }), name: 'bad' },
            ];
            const result = await toSdkCustomAgents(agents, fileService);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'good');
        });
    });
    // ---- toSdkSkillDirectories ------------------------------------------
    suite('toSdkSkillDirectories', () => {
        test('extracts parent directories of skill URIs', () => {
            const skills = [
                { uri: URI.file('/plugins/skill-a/SKILL.md'), name: 'skill-a' },
                { uri: URI.file('/plugins/skill-b/SKILL.md'), name: 'skill-b' },
            ];
            const result = toSdkSkillDirectories(skills);
            assert.strictEqual(result.length, 2);
        });
        test('deduplicates directories', () => {
            const skills = [
                { uri: URI.file('/plugins/shared/SKILL.md'), name: 'skill-a' },
                { uri: URI.file('/plugins/shared/SKILL.md'), name: 'skill-b' },
            ];
            const result = toSdkSkillDirectories(skills);
            assert.strictEqual(result.length, 1);
        });
        test('handles empty input', () => {
            const result = toSdkSkillDirectories([]);
            assert.deepStrictEqual(result, []);
        });
    });
    // ---- parsedPluginsEqual ---------------------------------------------
    suite('parsedPluginsEqual', () => {
        function makePlugin(overrides) {
            return {
                hooks: [],
                mcpServers: [],
                skills: [],
                agents: [],
                ...overrides,
            };
        }
        test('returns true for identical empty plugins', () => {
            assert.strictEqual(parsedPluginsEqual([makePlugin()], [makePlugin()]), true);
        });
        test('returns true for same content', () => {
            const a = makePlugin({
                skills: [{ uri: URI.file('/a/SKILL.md'), name: 'a' }],
                mcpServers: [{
                        name: 'server',
                        uri: URI.file('/mcp'),
                        configuration: { type: "stdio" /* McpServerType.LOCAL */, command: 'node' },
                    }],
            });
            const b = makePlugin({
                skills: [{ uri: URI.file('/a/SKILL.md'), name: 'a' }],
                mcpServers: [{
                        name: 'server',
                        uri: URI.file('/mcp'),
                        configuration: { type: "stdio" /* McpServerType.LOCAL */, command: 'node' },
                    }],
            });
            assert.strictEqual(parsedPluginsEqual([a], [b]), true);
        });
        test('returns false for different content', () => {
            const a = makePlugin({ skills: [{ uri: URI.file('/a/SKILL.md'), name: 'a' }] });
            const b = makePlugin({ skills: [{ uri: URI.file('/b/SKILL.md'), name: 'b' }] });
            assert.strictEqual(parsedPluginsEqual([a], [b]), false);
        });
        test('returns false for different lengths', () => {
            assert.strictEqual(parsedPluginsEqual([makePlugin()], [makePlugin(), makePlugin()]), false);
        });
        test('returns true for empty arrays', () => {
            assert.strictEqual(parsedPluginsEqual([], []), true);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdFBsdWdpbkNvbnZlcnRlcnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29waWxvdFBsdWdpbkNvbnZlcnRlcnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFNUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRzlJLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7SUFFckMsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUMxQyxJQUFJLFdBQXdCLENBQUM7SUFFN0IsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLFdBQVcsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksV0FBVyxDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLFdBQVcs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