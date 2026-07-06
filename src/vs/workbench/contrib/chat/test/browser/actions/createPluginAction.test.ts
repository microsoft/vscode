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
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptPath, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { McpCollectionSortOrder, McpServerTransportType } from '../../../../mcp/common/mcpTypes.js';
import {
	validatePluginName,
	getResourceLabel,
	getResourceFileName,
	serializeHookCommand,
	serializeMcpLaunch,
	writePluginToDisk,
	updateMarketplaceIfNeeded,
	type IResourceTreeItem,
} from '../../../browser/actions/createPluginAction.js';

function makePromptPath(overrides: Partial<IPromptPath> & { uri: URI; storage: PromptsStorage; type: PromptsType }): IPromptPath {
	return overrides as IPromptPath;
}

function makeResourceItem(overrides: Partial<IResourceTreeItem> & Pick<IResourceTreeItem, 'label' | 'resourceType'>): IResourceTreeItem {
	return { checked: false, ...overrides };
}

suite('CreatePluginAction helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('validatePluginName', () => {

		test('rejects empty name', () => {
			assert.ok(validatePluginName(''));
		});

		test('accepts valid names', () => {
			assert.deepStrictEqual(
				['my-plugin', 'plugin1', 'a', 'code-reviewer', 'my.plugin', 'a1b2c3'].map(n => validatePluginName(n)),
				[undefined, undefined, undefined, undefined, undefined, undefined]
			);
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
			assert.deepStrictEqual(
				serializeHookCommand({
					type: 'command',
					command: 'echo hello',
					windows: 'echo.exe hello',
					linux: '/bin/echo hello',
					osx: '/bin/echo hello',
				}),
				{
					type: 'command',
					command: 'echo hello',
					windows: 'echo.exe hello',
					linux: '/bin/echo hello',
					osx: '/bin/echo hello',
				}
			);
		});

		test('includes env and timeout when present', () => {
			assert.deepStrictEqual(
				serializeHookCommand({
					type: 'command',
					command: 'test',
					env: { FOO: 'bar' },
					timeout: 5000,
				}),
				{
					type: 'command',
					command: 'test',
					env: { FOO: 'bar' },
					timeout: 5000,
				}
			);
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
			assert.deepStrictEqual(
				serializeMcpLaunch({
					type: McpServerTransportType.Stdio,
					command: 'node',
					args: ['server.js'],
					cwd: '/workspace',
					env: { NODE_ENV: 'production' },
					envFile: undefined,
					sandbox: undefined,
				}),
				{
					type: 'stdio',
					command: 'node',
					args: ['server.js'],
					cwd: '/workspace',
					env: { NODE_ENV: 'production' },
				}
			);
		});

		test('omits empty args and env for stdio', () => {
			assert.deepStrictEqual(
				serializeMcpLaunch({
					type: McpServerTransportType.Stdio,
					command: 'server',
					args: [],
					cwd: undefined,
					env: {},
					envFile: undefined,
					sandbox: undefined,
				}),
				{
					type: 'stdio',
					command: 'server',
				}
			);
		});

		test('serializes http launch', () => {
			assert.deepStrictEqual(
				serializeMcpLaunch({
					type: McpServerTransportType.HTTP,
					uri: URI.parse('http://localhost:3000'),
					headers: [['Authorization', 'Bearer token']],
				}),
				{
					type: 'http',
					url: 'http://localhost:3000/',
					headers: { Authorization: 'Bearer token' },
				}
			);
		});

		test('omits empty headers for http', () => {
			assert.deepStrictEqual(
				serializeMcpLaunch({
					type: McpServerTransportType.HTTP,
					uri: URI.parse('http://localhost:3000'),
					headers: [],
				}),
				{
					type: 'http',
					url: 'http://localhost:3000/',
				}
			);
		});
	});
});

suite('writePluginToDisk', () => {

	const disposables = new DisposableStore();
	let fileService: IFileService;
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

	async function readJson(uri: URI): Promise<Record<string, unknown>> {
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
						order: McpCollectionSortOrder.User,
					} as IResourceTreeItem['mcpServer'] extends undefined ? never : NonNullable<IResourceTreeItem['mcpServer']>['collection'],
					definition: {
						id: 'def1',
						label: 'my-server',
						launch: {
							type: McpServerTransportType.Stdio,
							command: 'npx',
							args: ['-y', 'my-mcp-server'],
							cwd: undefined,
							env: {},
							envFile: undefined,
							sandbox: undefined,
						},
						cacheNonce: '1',
					} as IResourceTreeItem['mcpServer'] extends undefined ? never : NonNullable<IResourceTreeItem['mcpServer']>['definition'],
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
	let fileService: IFileService;
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
