/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { validatePluginName, getResourceLabel, getResourceFileName, serializeHookCommand, serializeMcpLaunch, writePluginToDisk, updateMarketplaceIfNeeded, } from '../../../browser/actions/createPluginAction.js';
function makePromptPath(overrides) {
    return overrides;
}
function makeResourceItem(overrides) {
    return { checked: false, ...overrides };
}
suite('CreatePluginAction helpers', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('validatePluginName', () => {
        test('rejects empty name', () => {
            assert.ok(validatePluginName(''));
        });
        test('accepts valid names', () => {
            assert.deepStrictEqual(['my-plugin', 'plugin1', 'a', 'code-reviewer', 'my.plugin', 'a1b2c3'].map(n => validatePluginName(n)), [undefined, undefined, undefined, undefined, undefined, undefined]);
        });
        test('rejects names with invalid characters', () => {
            assert.ok(validatePluginName('My-Plugin'));
            assert.ok(validatePluginName('my_plugin'));
            assert.ok(validatePluginName('my plugin'));
            assert.ok(validatePluginName('plugin!'));
        });
        test('rejects names not starting/ending with alphanumeric', () => {
            assert.ok(validatePluginName('-plugin'));
            assert.ok(validatePluginName('plugin-'));
            assert.ok(validatePluginName('.plugin'));
            assert.ok(validatePluginName('plugin.'));
        });
        test('rejects consecutive hyphens or periods', () => {
            assert.ok(validatePluginName('my--plugin'));
            assert.ok(validatePluginName('my..plugin'));
        });
        test('rejects names longer than 64 characters', () => {
            assert.ok(validatePluginName('a'.repeat(65)));
        });
        test('accepts name with exactly 64 characters', () => {
            assert.strictEqual(validatePluginName('a'.repeat(64)), undefined);
        });
    });
    suite('getResourceLabel', () => {
        test('returns name if set', () => {
            const path = makePromptPath({
                uri: URI.file('/foo/bar.instructions.md'),
                storage: PromptsStorage.local,
                type: PromptsType.instructions,
                name: 'my-instructions',
            });
            assert.strictEqual(getResourceLabel(path), 'my-instructions');
        });
        test('returns basename for non-skill resources without name', () => {
            const path = makePromptPath({
                uri: URI.file('/foo/bar.instructions.md'),
                storage: PromptsStorage.local,
                type: PromptsType.instructions,
            });
            assert.strictEqual(getResourceLabel(path), 'bar.instructions.md');
        });
        test('returns parent directory name for skills pointing to SKILL.md', () => {
            const path = makePromptPath({
                uri: URI.file('/workspace/.github/skills/my-skill/SKILL.md'),
                storage: PromptsStorage.local,
                type: PromptsType.skill,
            });
            assert.strictEqual(getResourceLabel(path), 'my-skill');
        });
        test('returns basename for skill not named SKILL.md', () => {
            const path = makePromptPath({
                uri: URI.file('/workspace/.github/skills/custom.md'),
                storage: PromptsStorage.local,
                type: PromptsType.skill,
            });
            assert.strictEqual(getResourceLabel(path), 'custom.md');
        });
    });
    suite('getResourceFileName', () => {
        test('strips namespace prefix', () => {
            const path = makePromptPath({
                uri: URI.file('/foo/SKILL.md'),
                storage: PromptsStorage.plugin,
                type: PromptsType.skill,
                name: 'hookify:writing-rules',
            });
            assert.strictEqual(getResourceFileName(path), 'writing-rules');
        });
        test('returns full name when no prefix', () => {
            const path = makePromptPath({
                uri: URI.file('/foo/my-skill/SKILL.md'),
                storage: PromptsStorage.local,
                type: PromptsType.skill,
            });
            assert.strictEqual(getResourceFileName(path), 'my-skill');
        });
        test('handles names with multiple colons', () => {
            const path = makePromptPath({
                uri: URI.file('/foo/bar.md'),
                storage: PromptsStorage.plugin,
                type: PromptsType.agent,
                name: 'ns:sub:name',
            });
            assert.strictEqual(getResourceFileName(path), 'sub:name');
        });
    });
    suite('serializeHookCommand', () => {
        test('serializes basic command', () => {
            assert.deepStrictEqual(serializeHookCommand({ type: 'command', command: 'echo hello' }), {
                type: 'command',
                command: 'echo hello',
            });
        });
        test('serializes platform-specific commands', () => {
            assert.deepStrictEqual(serializeHookCommand({
                type: 'command',
                command: 'echo hello',
                windows: 'echo.exe hello',
                linux: '/bin/echo hello',
                osx: '/bin/echo hello',
            }), {
                type: 'command',
                command: 'echo hello',
                windows: 'echo.exe hello',
                linux: '/bin/echo hello',
                osx: '/bin/echo hello',
            });
        });
        test('includes env and timeout when present', () => {
            assert.deepStrictEqual(serializeHookCommand({
                type: 'command',
                command: 'test',
                env: { FOO: 'bar' },
                timeout: 5000,
            }), {
                type: 'command',
                command: 'test',
                env: { FOO: 'bar' },
                timeout: 5000,
            });
        });
        test('omits empty env', () => {
            const result = serializeHookCommand({ type: 'command', command: 'test', env: {} });
            assert.strictEqual(result['env'], undefined);
        });
        test('converts URI-like cwd to string', () => {
            const cwd = URI.file('/workspace');
            const result = serializeHookCommand({ type: 'command', command: 'test', cwd });
            assert.strictEqual(typeof result['cwd'], 'string');
        });
        test('preserves timeout of 0', () => {
            const result = serializeHookCommand({ type: 'command', command: 'test', timeout: 0 });
            assert.strictEqual(result['timeout'], 0);
        });
    });
    suite('serializeMcpLaunch', () => {
        test('serializes stdio launch', () => {
            assert.deepStrictEqual(serializeMcpLaunch({
                type: 1 /* McpServerTransportType.Stdio */,
                command: 'node',
                args: ['server.js'],
                cwd: '/workspace',
                env: { NODE_ENV: 'production' },
                envFile: undefined,
                sandbox: undefined,
            }), {
                type: 'stdio',
                command: 'node',
                args: ['server.js'],
                cwd: '/workspace',
                env: { NODE_ENV: 'production' },
            });
        });
        test('omits empty args and env for stdio', () => {
            assert.deepStrictEqual(serializeMcpLaunch({
                type: 1 /* McpServerTransportType.Stdio */,
                command: 'server',
                args: [],
                cwd: undefined,
                env: {},
                envFile: undefined,
                sandbox: undefined,
            }), {
                type: 'stdio',
                command: 'server',
            });
        });
        test('serializes http launch', () => {
            assert.deepStrictEqual(serializeMcpLaunch({
                type: 2 /* McpServerTransportType.HTTP */,
                uri: URI.parse('http://localhost:3000'),
                headers: [['Authorization', 'Bearer token']],
            }), {
                type: 'http',
                url: 'http://localhost:3000/',
                headers: { Authorization: 'Bearer token' },
            });
        });
        test('omits empty headers for http', () => {
            assert.deepStrictEqual(serializeMcpLaunch({
                type: 2 /* McpServerTransportType.HTTP */,
                uri: URI.parse('http://localhost:3000'),
                headers: [],
            }), {
                type: 'http',
                url: 'http://localhost:3000/',
            });
        });
    });
});
suite('writePluginToDisk', () => {
    const disposables = new DisposableStore();
    let fileService;
    const root = URI.from({ scheme: Schemas.inMemory, path: '/test' });
    setup(() => {
        const service = disposables.add(new FileService(new NullLogService()));
        const provider = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(service.registerProvider(Schemas.inMemory, provider));
        fileService = service;
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    async function readJson(uri) {
        const content = await fileService.readFile(uri);
        return JSON.parse(content.value.toString());
    }
    test('creates manifest with correct structure', async () => {
        const pluginRoot = URI.joinPath(root, 'my-plugin');
        await writePluginToDisk(fileService, pluginRoot, 'my-plugin', []);
        assert.deepStrictEqual(await readJson(URI.joinPath(pluginRoot, '.plugin', 'plugin.json')), {
            name: 'my-plugin',
            version: '1.0.0',
            description: '',
        });
    });
    test('copies instructions to rules/', async () => {
        const sourceUri = URI.joinPath(root, 'source', 'coding.instructions.md');
        await fileService.writeFile(sourceUri, VSBuffer.fromString('# My coding rules'));
        const pluginRoot = URI.joinPath(root, 'test-plugin');
        await writePluginToDisk(fileService, pluginRoot, 'test-plugin', [
            makeResourceItem({
                label: 'coding',
                resourceType: 'instruction',
                promptPath: makePromptPath({
                    uri: sourceUri,
                    storage: PromptsStorage.local,
                    type: PromptsType.instructions,
                    name: 'coding',
                }),
            }),
        ]);
        const content = await fileService.readFile(URI.joinPath(pluginRoot, 'rules', 'coding.instructions.md'));
        assert.strictEqual(content.value.toString(), '# My coding rules');
    });
    test('preserves .mdc suffix for rule files', async () => {
        const sourceUri = URI.joinPath(root, 'source', 'prefer-const.mdc');
        await fileService.writeFile(sourceUri, VSBuffer.fromString('prefer const'));
        const pluginRoot = URI.joinPath(root, 'test-plugin');
        await writePluginToDisk(fileService, pluginRoot, 'test-plugin', [
            makeResourceItem({
                label: 'prefer-const.mdc',
                resourceType: 'instruction',
                promptPath: makePromptPath({
                    uri: sourceUri,
                    storage: PromptsStorage.local,
                    type: PromptsType.instructions,
                    name: 'prefer-const.mdc',
                }),
            }),
        ]);
        const content = await fileService.readFile(URI.joinPath(pluginRoot, 'rules', 'prefer-const.mdc'));
        assert.strictEqual(content.value.toString(), 'prefer const');
    });
    test('copies prompts to commands/', async () => {
        const sourceUri = URI.joinPath(root, 'source', 'review.prompt.md');
        await fileService.writeFile(sourceUri, VSBuffer.fromString('Review this code'));
        const pluginRoot = URI.joinPath(root, 'test-plugin');
        await writePluginToDisk(fileService, pluginRoot, 'test-plugin', [
            makeResourceItem({
                label: 'review',
                resourceType: 'prompt',
                promptPath: makePromptPath({
                    uri: sourceUri,
                    storage: PromptsStorage.local,
                    type: PromptsType.prompt,
                    name: 'review',
                }),
            }),
        ]);
        const content = await fileService.readFile(URI.joinPath(pluginRoot, 'commands', 'review.md'));
        assert.strictEqual(content.value.toString(), 'Review this code');
    });
    test('copies agents to agents/', async () => {
        const sourceUri = URI.joinPath(root, 'source', 'reviewer.agent.md');
        await fileService.writeFile(sourceUri, VSBuffer.fromString('---\nname: reviewer\n---\nYou review code.'));
        const pluginRoot = URI.joinPath(root, 'test-plugin');
        await writePluginToDisk(fileService, pluginRoot, 'test-plugin', [
            makeResourceItem({
                label: 'reviewer',
                resourceType: 'agent',
                promptPath: makePromptPath({
                    uri: sourceUri,
                    storage: PromptsStorage.local,
                    type: PromptsType.agent,
                    name: 'reviewer',
                }),
            }),
        ]);
        const content = await fileService.readFile(URI.joinPath(pluginRoot, 'agents', 'reviewer.md'));
        assert.strictEqual(content.value.toString(), '---\nname: reviewer\n---\nYou review code.');
    });
    test('copies skill directories recursively', async () => {
        const skillDir = URI.joinPath(root, 'source', 'skills', 'my-skill');
        await fileService.writeFile(URI.joinPath(skillDir, 'SKILL.md'), VSBuffer.fromString('# My Skill'));
        await fileService.writeFile(URI.joinPath(skillDir, 'helper.md'), VSBuffer.fromString('helper content'));
        const pluginRoot = URI.joinPath(root, 'test-plugin');
        await writePluginToDisk(fileService, pluginRoot, 'test-plugin', [
            makeResourceItem({
                label: 'my-skill',
                resourceType: 'skill',
                promptPath: makePromptPath({
                    uri: URI.joinPath(skillDir, 'SKILL.md'),
                    storage: PromptsStorage.local,
                    type: PromptsType.skill,
                }),
            }),
        ]);
        const skillMd = await fileService.readFile(URI.joinPath(pluginRoot, 'skills', 'my-skill', 'SKILL.md'));
        assert.strictEqual(skillMd.value.toString(), '# My Skill');
        const helperMd = await fileService.readFile(URI.joinPath(pluginRoot, 'skills', 'my-skill', 'helper.md'));
        assert.strictEqual(helperMd.value.toString(), 'helper content');
    });
    test('merges hooks into hooks/hooks.json', async () => {
        const hooksUri = URI.joinPath(root, 'source', 'hooks.json');
        await fileService.writeFile(hooksUri, VSBuffer.fromString(JSON.stringify({
            hooks: {
                SessionStart: [{ type: 'command', command: 'echo start' }],
                PreToolUse: [{ type: 'command', command: 'echo pre' }],
            }
        })));
        const pluginRoot = URI.joinPath(root, 'test-plugin');
        await writePluginToDisk(fileService, pluginRoot, 'test-plugin', [
            makeResourceItem({
                label: 'hooks',
                resourceType: 'hook',
                promptPath: makePromptPath({
                    uri: hooksUri,
                    storage: PromptsStorage.local,
                    type: PromptsType.hook,
                }),
            }),
        ]);
        assert.deepStrictEqual(await readJson(URI.joinPath(pluginRoot, 'hooks', 'hooks.json')), {
            hooks: {
                SessionStart: [{ type: 'command', command: 'echo start' }],
                PreToolUse: [{ type: 'command', command: 'echo pre' }],
            }
        });
    });
    test('exports MCP servers to .mcp.json', async () => {
        const pluginRoot = URI.joinPath(root, 'test-plugin');
        await writePluginToDisk(fileService, pluginRoot, 'test-plugin', [
            makeResourceItem({
                label: 'my-server',
                resourceType: 'mcp',
                mcpServer: {
                    collection: {
                        id: 'col1',
                        label: 'Test Collection',
                        presentation: { order: 200 /* McpCollectionSortOrder.User */ },
                    },
                    definition: {
                        id: 'def1',
                        label: 'my-server',
                        launch: {
                            type: 1 /* McpServerTransportType.Stdio */,
                            command: 'npx',
                            args: ['-y', 'my-mcp-server'],
                            cwd: undefined,
                            env: {},
                            envFile: undefined,
                            sandbox: undefined,
                        },
                        cacheNonce: '1',
                    },
                },
            }),
        ]);
        assert.deepStrictEqual(await readJson(URI.joinPath(pluginRoot, '.mcp.json')), {
            mcpServers: {
                'my-server': {
                    type: 'stdio',
                    command: 'npx',
                    args: ['-y', 'my-mcp-server'],
                }
            }
        });
    });
    test('strips namespace prefix from plugin resource names', async () => {
        const sourceUri = URI.joinPath(root, 'source', 'rules.instructions.md');
        await fileService.writeFile(sourceUri, VSBuffer.fromString('content'));
        const pluginRoot = URI.joinPath(root, 'test-plugin');
        await writePluginToDisk(fileService, pluginRoot, 'test-plugin', [
            makeResourceItem({
                label: 'hookify:writing-rules',
                resourceType: 'instruction',
                promptPath: makePromptPath({
                    uri: sourceUri,
                    storage: PromptsStorage.plugin,
                    type: PromptsType.instructions,
                    name: 'hookify:writing-rules',
                }),
            }),
        ]);
        const content = await fileService.readFile(URI.joinPath(pluginRoot, 'rules', 'writing-rules.instructions.md'));
        assert.strictEqual(content.value.toString(), 'content');
    });
    test('does not create directories for empty resource types', async () => {
        const pluginRoot = URI.joinPath(root, 'test-plugin');
        await writePluginToDisk(fileService, pluginRoot, 'test-plugin', []);
        assert.ok(await fileService.exists(URI.joinPath(pluginRoot, '.plugin', 'plugin.json')));
        assert.ok(!(await fileService.exists(URI.joinPath(pluginRoot, 'rules'))));
        assert.ok(!(await fileService.exists(URI.joinPath(pluginRoot, 'commands'))));
        assert.ok(!(await fileService.exists(URI.joinPath(pluginRoot, 'agents'))));
        assert.ok(!(await fileService.exists(URI.joinPath(pluginRoot, 'skills'))));
        assert.ok(!(await fileService.exists(URI.joinPath(pluginRoot, 'hooks'))));
        assert.ok(!(await fileService.exists(URI.joinPath(pluginRoot, '.mcp.json'))));
    });
});
suite('updateMarketplaceIfNeeded', () => {
    const disposables = new DisposableStore();
    let fileService;
    const root = URI.from({ scheme: Schemas.inMemory, path: '/marketplace-test' });
    setup(() => {
        const service = disposables.add(new FileService(new NullLogService()));
        const provider = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(service.registerProvider(Schemas.inMemory, provider));
        fileService = service;
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('adds plugin to existing marketplace.json', async () => {
        const marketplace = { name: 'my-marketplace', plugins: [{ name: 'existing', source: './existing/' }] };
        await fileService.writeFile(URI.joinPath(root, 'marketplace.json'), VSBuffer.fromString(JSON.stringify(marketplace)));
        await updateMarketplaceIfNeeded(fileService, root, 'new-plugin');
        const content = await fileService.readFile(URI.joinPath(root, 'marketplace.json'));
        const result = JSON.parse(content.value.toString());
        assert.deepStrictEqual(result.plugins, [
            { name: 'existing', source: './existing/' },
            { name: 'new-plugin', source: './new-plugin/' },
        ]);
    });
    test('creates plugins array if missing', async () => {
        await fileService.writeFile(URI.joinPath(root, 'marketplace.json'), VSBuffer.fromString(JSON.stringify({ name: 'test' })));
        await updateMarketplaceIfNeeded(fileService, root, 'my-plugin');
        const content = await fileService.readFile(URI.joinPath(root, 'marketplace.json'));
        const result = JSON.parse(content.value.toString());
        assert.deepStrictEqual(result.plugins, [
            { name: 'my-plugin', source: './my-plugin/' },
        ]);
    });
    test('detects .plugin/marketplace.json', async () => {
        const marketplace = { name: 'test', plugins: [] };
        await fileService.writeFile(URI.joinPath(root, '.plugin', 'marketplace.json'), VSBuffer.fromString(JSON.stringify(marketplace)));
        await updateMarketplaceIfNeeded(fileService, root, 'my-plugin');
        const content = await fileService.readFile(URI.joinPath(root, '.plugin', 'marketplace.json'));
        const result = JSON.parse(content.value.toString());
        assert.deepStrictEqual(result.plugins, [
            { name: 'my-plugin', source: './my-plugin/' },
        ]);
    });
    test('does nothing when no marketplace.json exists', async () => {
        await updateMarketplaceIfNeeded(fileService, root, 'my-plugin');
        assert.ok(!(await fileService.exists(URI.joinPath(root, 'marketplace.json'))));
    });
    test('does not duplicate existing plugin entry', async () => {
        const marketplace = { name: 'test', plugins: [{ name: 'my-plugin', source: './my-plugin/' }] };
        await fileService.writeFile(URI.joinPath(root, 'marketplace.json'), VSBuffer.fromString(JSON.stringify(marketplace)));
        await updateMarketplaceIfNeeded(fileService, root, 'my-plugin');
        const content = await fileService.readFile(URI.joinPath(root, 'marketplace.json'));
        const result = JSON.parse(content.value.toString());
        assert.deepStrictEqual(result.plugins, [
            { name: 'my-plugin', source: './my-plugin/' },
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlUGx1Z2luQWN0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9hY3Rpb25zL2NyZWF0ZVBsdWdpbkFjdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBRXJGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ25ILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDMUUsT0FBTyxFQUFlLGNBQWMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBRXJHLE9BQU8sRUFDTixrQkFBa0IsRUFDbEIsZ0JBQWdCLEVBQ2hCLG1CQUFtQixFQUNuQixvQkFBb0IsRUFDcEIsa0JBQWtCLEVBQ2xCLGlCQUFpQixFQUNqQix5QkFBeUIsR0FFekIsTUFBTSxnREFBZ0QsQ0FBQztBQUV4RCxTQUFTLGNBQWMsQ0FBQyxTQUEwRjtJQUNqSCxPQUFPLFNBQXdCLENBQUM7QUFDakMsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMs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