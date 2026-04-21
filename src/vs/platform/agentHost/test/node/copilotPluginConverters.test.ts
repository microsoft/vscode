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
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import { toSdkMcpServers, toSdkCustomAgents, toSdkSkillDirectories, parsedPluginsEqual } from '../../node/copilot/copilotPluginConverters.js';
import type { IMcpServerDefinition, INamedPluginResource, IParsedPlugin } from '../../../agentPlugins/common/pluginParsers.js';

suite('copilotPluginConverters', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- toSdkMcpServers ------------------------------------------------

	suite('toSdkMcpServers', () => {

		test('converts local server definitions', () => {
			const defs: IMcpServerDefinition[] = [{
				name: 'test-server',
				uri: URI.file('/plugin'),
				configuration: {
					type: McpServerType.LOCAL,
					command: 'node',
					args: ['server.js', '--port', '3000'],
					env: { NODE_ENV: 'production', PORT: 3000 as unknown as string },
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
			const defs: IMcpServerDefinition[] = [{
				name: 'remote-server',
				uri: URI.file('/plugin'),
				configuration: {
					type: McpServerType.REMOTE,
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
			const defs: IMcpServerDefinition[] = [{
				name: 'minimal',
				uri: URI.file('/plugin'),
				configuration: {
					type: McpServerType.LOCAL,
					command: 'echo',
				},
			}];

			const result = toSdkMcpServers(defs);
			assert.strictEqual(result['minimal'].type, 'local');
			assert.deepStrictEqual((result['minimal'] as { args?: string[] }).args, []);
			assert.strictEqual(Object.hasOwn(result['minimal'], 'env'), false);
			assert.strictEqual(Object.hasOwn(result['minimal'], 'cwd'), false);
		});

		test('filters null values from env', () => {
			const defs: IMcpServerDefinition[] = [{
				name: 'with-null-env',
				uri: URI.file('/plugin'),
				configuration: {
					type: McpServerType.LOCAL,
					command: 'test',
					env: { KEEP: 'value', DROP: null as unknown as string },
				},
			}];

			const result = toSdkMcpServers(defs);
			const env = (result['with-null-env'] as { env?: Record<string, string> }).env;
			assert.deepStrictEqual(env, { KEEP: 'value' });
		});
	});

	// ---- toSdkCustomAgents ----------------------------------------------

	suite('toSdkCustomAgents', () => {

		test('reads agent files and creates configs', async () => {
			const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/helper.md' });
			await fileService.writeFile(agentUri, VSBuffer.fromString('You are a helpful assistant'));

			const agents: INamedPluginResource[] = [{ uri: agentUri, name: 'helper' }];
			const result = await toSdkCustomAgents(agents, fileService);

			assert.deepStrictEqual(result, [{
				name: 'helper',
				prompt: 'You are a helpful assistant',
			}]);
		});

		test('skips agents whose files cannot be read', async () => {
			const agents: INamedPluginResource[] = [
				{ uri: URI.from({ scheme: Schemas.inMemory, path: '/nonexistent/agent.md' }), name: 'missing' },
			];
			const result = await toSdkCustomAgents(agents, fileService);
			assert.deepStrictEqual(result, []);
		});

		test('processes multiple agents, skipping failures', async () => {
			const goodUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/good.md' });
			await fileService.writeFile(goodUri, VSBuffer.fromString('Good agent'));

			const agents: INamedPluginResource[] = [
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
			const skills: INamedPluginResource[] = [
				{ uri: URI.file('/plugins/skill-a/SKILL.md'), name: 'skill-a' },
				{ uri: URI.file('/plugins/skill-b/SKILL.md'), name: 'skill-b' },
			];
			const result = toSdkSkillDirectories(skills);
			assert.strictEqual(result.length, 2);
		});

		test('deduplicates directories', () => {
			const skills: INamedPluginResource[] = [
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

		function makePlugin(overrides?: Partial<IParsedPlugin>): IParsedPlugin {
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
					configuration: { type: McpServerType.LOCAL, command: 'node' },
				}],
			});
			const b = makePlugin({
				skills: [{ uri: URI.file('/a/SKILL.md'), name: 'a' }],
				mcpServers: [{
					name: 'server',
					uri: URI.file('/mcp'),
					configuration: { type: McpServerType.LOCAL, command: 'node' },
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
