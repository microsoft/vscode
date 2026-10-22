/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { IMcpServerConfiguration, McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import { toCopilotMcpServerConfiguration } from '../../../mcp/common/mcpCopilotConfiguration.js';
import { toSdkInstructionDirectories, toSdkMcpServers, toSdkCustomAgents, toSdkSessionCustomAgents, toSdkSkillDirectories, findRelocatedAgentName, parsedPluginsEqual, toSdkHooks, type IPluginAgentsForSdk } from '../../node/copilot/copilotPluginConverters.js';
import { PluginFormat, type IMcpServerDefinition, type INamedPluginResource, type IParsedHookGroup, type IParsedPlugin, type IParsedSkill } from '../../../agentPlugins/common/pluginParsers.js';
import { CustomizationType, McpServerStatus, type HookCustomization, type McpServerCustomization, type SkillCustomization } from '../../common/state/protocol/state.js';

function stubMcpCustomization(name = 'test'): McpServerCustomization {
	return { type: CustomizationType.McpServer, id: `mcp:${name}`, uri: 'file:///plugin', name, state: { kind: McpServerStatus.Starting } };
}
function stubHookCustomization(type: string): HookCustomization {
	return { type: CustomizationType.Hook, id: `hook:${type}`, uri: 'file:///plugin/hooks.json', name: 'hooks.json' };
}
function stubSkillCustomization(name: string): SkillCustomization {
	return { type: CustomizationType.Skill, id: `skill:${name}`, uri: `file:///${name}/SKILL.md`, name };
}

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

		test('matches persistent Copilot configuration conversion', () => {
			const configurations: IMcpServerConfiguration[] = [
				{ type: McpServerType.LOCAL, command: 'node', args: ['server.js'], cwd: '/workspace', env: { PORT: 3000, OMIT: null, TOKEN: '$TOKEN' } },
				{ type: McpServerType.REMOTE, url: 'https://example.com/mcp', headers: { Authorization: '$TOKEN' }, oauth: { clientId: 'client' } },
				{ type: McpServerType.REMOTE, transport: 'sse', url: 'https://example.com/sse' },
			];
			const defs = configurations.map((configuration, index): IMcpServerDefinition => ({
				name: String(index), uri: URI.file('/plugin'), configuration, customization: stubMcpCustomization(String(index)),
			}));
			assert.deepStrictEqual(toSdkMcpServers(defs), Object.fromEntries(defs.map(def => [def.name, toCopilotMcpServerConfiguration(def.configuration)])));
		});

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
				customization: stubMcpCustomization('test-server'),
			}];

			const result = toSdkMcpServers(defs);
			assert.deepStrictEqual(result, {
				'test-server': {
					type: 'stdio',
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
				customization: stubMcpCustomization('remote-server'),
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

		test('converts remote/SSE server definitions', () => {
			const defs: IMcpServerDefinition[] = [{
				name: 'sse-server',
				uri: URI.file('/plugin'),
				configuration: {
					type: McpServerType.REMOTE,
					transport: 'sse',
					url: 'https://example.com/sse',
				},
				customization: stubMcpCustomization('sse-server'),
			}];

			assert.deepStrictEqual(toSdkMcpServers(defs), {
				'sse-server': {
					type: 'sse',
					url: 'https://example.com/sse',
					tools: ['*'],
				},
			});
		});

		test('converts remote OAuth client configuration', () => {
			const defs: IMcpServerDefinition[] = [{
				name: 'slack',
				uri: URI.file('/plugin'),
				configuration: {
					type: McpServerType.REMOTE,
					url: 'https://mcp.slack.com/mcp',
					oauth: { clientId: 'public-client-id' },
				},
				customization: stubMcpCustomization('slack'),
			}];

			assert.deepStrictEqual(toSdkMcpServers(defs), {
				slack: {
					type: 'http',
					url: 'https://mcp.slack.com/mcp',
					tools: ['*'],
					oauthClientId: 'public-client-id',
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
				customization: stubMcpCustomization('minimal'),
			}];

			const result = toSdkMcpServers(defs);
			assert.strictEqual(result['minimal'].type, 'stdio');
			assert.deepStrictEqual((result['minimal'] as { args?: string[] }).args, []);
			assert.strictEqual(Object.hasOwn(result['minimal'], 'env'), false);
			assert.strictEqual(Object.hasOwn(result['minimal'], 'cwd'), false);
		});

		test('uses a URI default cwd without overriding explicit cwd', () => {
			const defs: IMcpServerDefinition[] = [{
				name: 'defaulted',
				uri: URI.file('/plugin/.mcp.json'),
				defaultCwd: URI.file('/workspace'),
				configuration: { type: McpServerType.LOCAL, command: 'defaulted' },
				customization: stubMcpCustomization('defaulted'),
			}, {
				name: 'explicit',
				uri: URI.file('/plugin/.mcp.json'),
				defaultCwd: URI.file('/workspace'),
				configuration: { type: McpServerType.LOCAL, command: 'explicit', cwd: '/explicit' },
				customization: stubMcpCustomization('explicit'),
			}, {
				name: 'relative',
				uri: URI.file('/plugin/.mcp.json'),
				defaultCwd: URI.file('/workspace'),
				configuration: { type: McpServerType.LOCAL, command: 'relative', cwd: './relative' },
				customization: stubMcpCustomization('relative'),
			}];

			const result = toSdkMcpServers(defs);
			assert.strictEqual((result['defaulted'] as { cwd?: string }).cwd, URI.file('/workspace').fsPath);
			assert.strictEqual((result['explicit'] as { cwd?: string }).cwd, '/explicit');
			assert.strictEqual((result['relative'] as { cwd?: string }).cwd, URI.file('/workspace/relative').fsPath);
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
				customization: stubMcpCustomization('with-null-env'),
			}];

			const result = toSdkMcpServers(defs);
			const env = (result['with-null-env'] as { env?: Record<string, string> }).env;
			assert.deepStrictEqual(env, { KEEP: 'value' });
		});
	});

	// ---- toSdkCustomAgents ----------------------------------------------

	suite('toSdkCustomAgents', () => {

		test('reads agent files without frontmatter and creates configs', async () => {
			const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/helper.md' });
			await fileService.writeFile(agentUri, VSBuffer.fromString('You are a helpful assistant'));

			const agents: INamedPluginResource[] = [{ uri: agentUri, name: 'helper' }];
			const result = await toSdkCustomAgents(agents, fileService);

			assert.deepStrictEqual(result, [{
				name: 'helper',
				tools: null,
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

		test('parses YAML frontmatter for name, description, tools, and body', async () => {
			const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/review.md' });
			await fileService.writeFile(agentUri, VSBuffer.fromString([
				'---',
				'name: code-reviewer',
				'description: Reviews code for quality issues',
				'tools:',
				'  - read_file',
				'  - grep_search',
				'---',
				'You are a meticulous code reviewer.',
				'',
			].join('\n')));

			const agents: INamedPluginResource[] = [{ uri: agentUri, name: 'review' }];
			const result = await toSdkCustomAgents(agents, fileService);

			assert.deepStrictEqual(result, [{
				name: 'code-reviewer',
				description: 'Reviews code for quality issues',
				tools: ['read_file', 'grep_search'],
				prompt: 'You are a meticulous code reviewer.\n',
			}]);
		});

		test('preserves scalar and fallback-array models from frontmatter', async () => {
			const scalarUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/scalar-model.md' });
			const fallbackUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/fallback-models.md' });
			await fileService.writeFile(scalarUri, VSBuffer.fromString([
				'---',
				'name: scalar-model',
				'model: claude-haiku-4.5',
				'---',
				'Scalar body.',
			].join('\n')));
			await fileService.writeFile(fallbackUri, VSBuffer.fromString([
				'---',
				'name: fallback-models',
				'model: [not-a-model, gpt-5.6-sol]',
				'---',
				'Fallback body.',
			].join('\n')));

			const result = await toSdkCustomAgents([
				{ uri: scalarUri, name: 'scalar-model' },
				{ uri: fallbackUri, name: 'fallback-models' },
			], fileService, new Set(['claude-haiku-4.5', 'gpt-5.6-sol']));

			assert.deepStrictEqual(result, [
				{
					name: 'scalar-model',
					model: 'claude-haiku-4.5',
					tools: null,
					prompt: 'Scalar body.',
				},
				{
					name: 'fallback-models',
					model: 'gpt-5.6-sol',
					tools: null,
					prompt: 'Fallback body.',
				},
			]);
		});

		test('preserves agent-specific frontmatter hooks without merging between agents', async () => {
			const firstAgentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/first.md' });
			const secondAgentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/second.md' });
			await fileService.writeFile(firstAgentUri, VSBuffer.fromString([
				'---',
				'name: first',
				'hooks:',
				'  SessionStart:',
				'    - type: command',
				'      command: echo first',
				'  PreToolUse:',
				'    - type: command',
				'      command: deny first',
				'      timeout: 5',
				'---',
				'First agent.',
			].join('\n')));
			await fileService.writeFile(secondAgentUri, VSBuffer.fromString([
				'---',
				'name: second',
				'hooks:',
				'  PreToolUse:',
				'    - type: command',
				'      command: deny second',
				'---',
				'Second agent.',
			].join('\n')));

			const result = await toSdkCustomAgents([
				{ uri: firstAgentUri, name: 'first' },
				{ uri: secondAgentUri, name: 'second' },
			], fileService);

			assert.deepStrictEqual(result, [
				{
					name: 'first',
					tools: null,
					hooks: {
						SessionStart: [{ type: 'command', command: 'echo first' }],
						PreToolUse: [{ type: 'command', command: 'deny first', timeout: 5 }],
					},
					prompt: 'First agent.',
				},
				{
					name: 'second',
					tools: null,
					hooks: {
						PreToolUse: [{ type: 'command', command: 'deny second' }],
					},
					prompt: 'Second agent.',
				},
			]);
		});

		test('preserves valid hook commands around malformed entries', async () => {
			const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/mixed.md' });
			await fileService.writeFile(agentUri, VSBuffer.fromString([
				'---',
				'name: mixed',
				'hooks:',
				'  SessionStart:',
				'    - type: command',
				'      command: echo started',
				'  PreToolUse:',
				'    - invalid',
				'    - type: command',
				'      command: deny first',
				'    - [invalid]',
				'    - type: command',
				'      command: deny second',
				'    - null',
				'  SessionEnd:',
				'    - invalid',
				'    - [invalid]',
				'---',
				'Mixed hooks.',
			].join('\n')));

			const result = await toSdkCustomAgents([{ uri: agentUri, name: 'mixed' }], fileService);

			assert.deepStrictEqual(result, [{
				name: 'mixed',
				tools: null,
				hooks: {
					SessionStart: [{ type: 'command', command: 'echo started' }],
					PreToolUse: [
						{ type: 'command', command: 'deny first' },
						{ type: 'command', command: 'deny second' },
					],
				},
				prompt: 'Mixed hooks.',
			}]);
		});

		test('parses supported reasoning-effort values from frontmatter', async () => {
			const reasoningEfforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
			const agents: INamedPluginResource[] = [];
			for (const reasoningEffort of reasoningEfforts) {
				const agentUri = URI.from({ scheme: Schemas.inMemory, path: `/agents/${reasoningEffort}.md` });
				await fileService.writeFile(agentUri, VSBuffer.fromString([
					'---',
					`name: ${reasoningEffort}`,
					`reasoning-effort: ${reasoningEffort}`,
					'---',
					'Body.',
				].join('\n')));
				agents.push({ uri: agentUri, name: reasoningEffort });
			}

			const result = await toSdkCustomAgents(agents, fileService);

			assert.deepStrictEqual(result, reasoningEfforts.map(reasoningEffort => ({
				name: reasoningEffort,
				reasoningEffort,
				tools: null,
				prompt: 'Body.',
			})));
		});

		test('omits missing or unsupported reasoning-effort values', async () => {
			const missingUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/missing-effort.md' });
			const unsupportedUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/unsupported-effort.md' });
			await fileService.writeFile(missingUri, VSBuffer.fromString([
				'---',
				'name: missing-effort',
				'---',
				'Body.',
			].join('\n')));
			await fileService.writeFile(unsupportedUri, VSBuffer.fromString([
				'---',
				'name: unsupported-effort',
				'reasoning-effort: extreme',
				'---',
				'Body.',
			].join('\n')));

			const result = await toSdkCustomAgents([
				{ uri: missingUri, name: 'missing-effort' },
				{ uri: unsupportedUri, name: 'unsupported-effort' },
			], fileService);

			assert.deepStrictEqual(result, [
				{ name: 'missing-effort', tools: null, prompt: 'Body.' },
				{ name: 'unsupported-effort', tools: null, prompt: 'Body.' },
			]);
		});

		test('parses skills and infer from frontmatter', async () => {
			const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/skilled.md' });
			await fileService.writeFile(agentUri, VSBuffer.fromString([
				'---',
				'name: skilled',
				'skills:',
				'  - baking-cake',
				'  - cooking-pasta',
				'infer: true',
				'---',
				'Body.',
			].join('\n')));

			const agents: INamedPluginResource[] = [{ uri: agentUri, name: 'skilled' }];
			const result = await toSdkCustomAgents(agents, fileService);

			assert.deepStrictEqual(result, [{
				name: 'skilled',
				tools: null,
				skills: ['baking-cake', 'cooking-pasta'],
				infer: true,
				prompt: 'Body.',
			}]);
		});

		test('forwards model invocation restrictions', async () => {
			const disabledUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/no-invoke.md' });
			const legacyUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/legacy-no-invoke.md' });
			await fileService.writeFile(disabledUri, VSBuffer.fromString([
				'---',
				'name: no-invoke',
				'disable-model-invocation: true',
				'---',
				'Body.',
			].join('\n')));
			await fileService.writeFile(legacyUri, VSBuffer.fromString([
				'---',
				'name: legacy-no-invoke',
				'infer: false',
				'---',
				'Legacy body.',
			].join('\n')));

			const agents: INamedPluginResource[] = [
				{ uri: disabledUri, name: 'no-invoke' },
				{ uri: legacyUri, name: 'legacy-no-invoke' },
			];
			const result = await toSdkCustomAgents(agents, fileService);

			assert.deepStrictEqual(result, [
				{
					name: 'no-invoke',
					tools: null,
					infer: false,
					disableModelInvocation: true,
					prompt: 'Body.',
				},
				{
					name: 'legacy-no-invoke',
					tools: null,
					infer: false,
					disableModelInvocation: true,
					prompt: 'Legacy body.',
				},
			]);
		});

		test('omits skills and infer when frontmatter does not specify them', async () => {
			const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/plain.md' });
			await fileService.writeFile(agentUri, VSBuffer.fromString([
				'---',
				'name: plain',
				'---',
				'Body.',
			].join('\n')));

			const agents: INamedPluginResource[] = [{ uri: agentUri, name: 'plain' }];
			const result = await toSdkCustomAgents(agents, fileService);

			assert.strictEqual(Object.hasOwn(result[0], 'skills'), false);
			assert.strictEqual(Object.hasOwn(result[0], 'infer'), false);
		});

		test('empty tools array becomes null (all tools)', async () => {
			const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/empty-tools.md' });
			await fileService.writeFile(agentUri, VSBuffer.fromString([
				'---',
				'name: free-for-all',
				'tools: []',
				'---',
				'Body.',
			].join('\n')));

			const agents: INamedPluginResource[] = [{ uri: agentUri, name: 'fallback' }];
			const result = await toSdkCustomAgents(agents, fileService);

			assert.deepStrictEqual(result, [{
				name: 'free-for-all',
				tools: null,
				prompt: 'Body.',
			}]);
		});

		test('falls back to resource name when frontmatter omits name', async () => {
			const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/no-name.md' });
			await fileService.writeFile(agentUri, VSBuffer.fromString([
				'---',
				'description: Helper without an explicit name',
				'---',
				'Body only.',
			].join('\n')));

			const agents: INamedPluginResource[] = [{ uri: agentUri, name: 'resource-name' }];
			const result = await toSdkCustomAgents(agents, fileService);

			assert.deepStrictEqual(result, [{
				name: 'resource-name',
				description: 'Helper without an explicit name',
				tools: null,
				prompt: 'Body only.',
			}]);
		});

		test('trims whitespace from frontmatter name to match parsed agent name', async () => {
			const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/agents/padded.md' });
			await fileService.writeFile(agentUri, VSBuffer.fromString([
				'---',
				'name: "  Inbox  "',
				'---',
				'Body.',
			].join('\n')));

			const agents: INamedPluginResource[] = [{ uri: agentUri, name: 'padded' }];
			const result = await toSdkCustomAgents(agents, fileService);

			assert.strictEqual(result[0].name, 'Inbox');
		});
	});

	// ---- toSdkSessionCustomAgents ---------------------------------------

	suite('toSdkSessionCustomAgents', () => {

		test('includes agents from plugins without a file directory', async () => {
			const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/loose/helper.md' });
			await fileService.writeFile(agentUri, VSBuffer.fromString('Loose agent'));

			const plugins: IPluginAgentsForSdk[] = [{ agents: [{ uri: agentUri, name: 'helper' }] }];
			const result = await toSdkSessionCustomAgents(plugins, fileService);

			assert.deepStrictEqual(result, [{ name: 'helper', tools: null, prompt: 'Loose agent' }]);
		});

		test('includes plugin agents and preserves their hooks', async () => {
			const parentUri = URI.from({ scheme: Schemas.inMemory, path: '/plugin/parent.md' });
			const siblingUri = URI.from({ scheme: Schemas.inMemory, path: '/plugin/sibling.md' });
			await Promise.all([
				fileService.writeFile(parentUri, VSBuffer.fromString([
					'---',
					'hooks:',
					'  PreToolUse:',
					'    - type: command',
					'      command: deny parent',
					'---',
					'Parent agent',
				].join('\n'))),
				fileService.writeFile(siblingUri, VSBuffer.fromString('Sibling agent')),
			]);

			const plugins: IPluginAgentsForSdk[] = [{
				agents: [
					{ uri: parentUri, name: 'parent' },
					{ uri: siblingUri, name: 'sibling' },
				],
			}];
			const result = await toSdkSessionCustomAgents(plugins, fileService);

			assert.deepStrictEqual(result, [
				{
					name: 'parent',
					tools: null,
					hooks: { PreToolUse: [{ type: 'command', command: 'deny parent' }] },
					prompt: 'Parent agent',
				},
				{ name: 'sibling', tools: null, prompt: 'Sibling agent' },
			]);
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

	// ---- toSdkHooks -------------------------------------------------------

	suite('toSdkInstructionDirectories', () => {

		test('extracts parent directories of instruction files', () => {
			const instructions: INamedPluginResource[] = [
				{ uri: URI.file('/plugins/rules/project.mdc'), name: 'project' },
				{ uri: URI.file('/plugins/rules/review.instructions.md'), name: 'review' },
			];
			const result = toSdkInstructionDirectories(instructions);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].replaceAll('\\', '/'), '/plugins/rules');
		});

		test('deduplicates directories', () => {
			const instructions: INamedPluginResource[] = [
				{ uri: URI.file('/plugins/rules/a.mdc'), name: 'a' },
				{ uri: URI.file('/plugins/rules/b.mdc'), name: 'b' },
			];
			const result = toSdkInstructionDirectories(instructions);
			assert.strictEqual(result.length, 1);
		});

		test('handles empty input', () => {
			const result = toSdkInstructionDirectories([]);
			assert.deepStrictEqual(result, []);
		});
	});

	// ---- toSdkHooks -------------------------------------------------------

	suite('toSdkHooks', () => {

		function makeHookGroup(type: string, command: string): IParsedHookGroup {
			return {
				type,
				commands: [{ command }],
				uri: URI.file('/plugin/hooks.json'),
				originalId: type,
				customization: stubHookCustomization(type),
			};
		}

		/**
		 * Writes a temp JS script that outputs JSON to stdout and returns
		 * a `node <path>` command. Works on both bash (/bin/sh -c) and
		 * cmd.exe without any shell-quoting issues.
		 * The script is written alongside the compiled test file which is
		 * guaranteed to exist, be writable, and have no spaces in CI.
		 */
		function echoJsonCmd(value: object): { command: string; cleanup: () => void } {
			const json = JSON.stringify(value);
			// fileURLToPath(new URL('.', import.meta.url)) is the Node ESM equivalent
			// of __dirname and works on Node 12+, unlike import.meta.dirname (Node 21.2+).
			const dir = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
			const filePath = `${dir}/vscode-test-hook-${Date.now()}.js`;
			writeFileSync(filePath, `process.stdout.write(${JSON.stringify(json)});\n`);
			// Do NOT quote the path: cmd.exe /c "node path" strips the outer quotes,
			// leaving "node path" without inner quoting which cmd.exe handles cleanly.
			const command = `node ${filePath}`;
			return { command, cleanup: () => { try { unlinkSync(filePath); } catch { /* ignore */ } } };
		}

		test('onPostToolUse returns parsed JSON output as hook result', async () => {
			const expectedOutput = { additionalContext: 'Before presenting the plan, run review-plan skill' };
			const { command, cleanup } = echoJsonCmd(expectedOutput);
			try {
				const hookGroup = makeHookGroup('PostToolUse', command);
				const hooks = toSdkHooks([hookGroup]);
				const toolResult = { textResultForLlm: 'ok', resultType: 'success' as const };
				const result = await hooks.onPostToolUse!({ toolName: 'memory', toolArgs: {}, toolResult, timestamp: new Date(0), workingDirectory: '/', sessionId: 'test' }, { sessionId: 'test' });
				assert.deepStrictEqual(result, expectedOutput);
			} finally {
				cleanup();
			}
		});

		test('onPostToolUse returns output of a hook that exits without reading its input', async () => {
			const expectedOutput = { additionalContext: 'stdin was ignored' };
			const { command, cleanup } = echoJsonCmd(expectedOutput);
			try {
				const hookGroup = makeHookGroup('PostToolUse', command);
				const hooks = toSdkHooks([hookGroup]);
				// Larger than any OS pipe buffer, so the stdin write is still pending
				// when the hook exits and fails with EPIPE (EOF on Windows).
				const toolResult = { textResultForLlm: 'x'.repeat(4 * 1024 * 1024), resultType: 'success' as const };
				const result = await hooks.onPostToolUse!({ toolName: 'view', toolArgs: {}, toolResult, timestamp: new Date(0), workingDirectory: '/', sessionId: 'test' }, { sessionId: 'test' });
				assert.deepStrictEqual(result, expectedOutput);
			} finally {
				cleanup();
			}
		});

		test('onPostToolUse returns undefined when output is non-JSON', async () => {
			// Use a script file so there are no cmd.exe quoting issues on Windows.
			const dir = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
			const filePath = `${dir}/vscode-test-hook-nonjson-${Date.now()}.js`;
			writeFileSync(filePath, `process.stdout.write('not-json');\n`);
			try {
				const hookGroup = makeHookGroup('PostToolUse', `node ${filePath}`);
				const hooks = toSdkHooks([hookGroup]);
				const toolResult = { textResultForLlm: 'ok', resultType: 'success' as const };
				const result = await hooks.onPostToolUse!({ toolName: 'memory', toolArgs: {}, toolResult, timestamp: new Date(0), workingDirectory: '/', sessionId: 'test' }, { sessionId: 'test' });
				assert.strictEqual(result, undefined);
			} finally {
				try { unlinkSync(filePath); } catch { /* ignore */ }
			}
		});

		test('onPostToolUse returns undefined when command fails', async () => {
			const dir = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
			const filePath = `${dir}/vscode-test-hook-fail-${Date.now()}.js`;
			writeFileSync(filePath, `process.exit(1);\n`);
			try {
				const hookGroup = makeHookGroup('PostToolUse', `node ${filePath}`);
				const hooks = toSdkHooks([hookGroup]);
				const toolResult = { textResultForLlm: 'ok', resultType: 'success' as const };
				const result = await hooks.onPostToolUse!({ toolName: 'memory', toolArgs: {}, toolResult, timestamp: new Date(0), workingDirectory: '/', sessionId: 'test' }, { sessionId: 'test' });
				assert.strictEqual(result, undefined);
			} finally {
				try { unlinkSync(filePath); } catch { /* ignore */ }
			}
		});

		test('onPostToolUse returns undefined when no commands', async () => {
			const hooks = toSdkHooks([]);
			assert.strictEqual(hooks.onPostToolUse, undefined);
		});

		test('onPostToolUse calls editTrackingHooks and returns command output', async () => {
			const expectedOutput = { additionalContext: 'context from hook' };
			const { command, cleanup } = echoJsonCmd(expectedOutput);
			try {
				const hookGroup = makeHookGroup('PostToolUse', command);
				let trackingInput: unknown;
				const editTrackingHooks = {
					onPreToolUse: async () => { },
					onPostToolUse: async (input: unknown) => { trackingInput = input; return undefined; },
				};
				const hooks = toSdkHooks([hookGroup], editTrackingHooks);
				const toolResult = { textResultForLlm: 'ok', resultType: 'success' as const };
				const callInput = { toolName: 'memory', toolArgs: {}, toolResult, timestamp: new Date(0), workingDirectory: '/', sessionId: 'test' };
				const result = await hooks.onPostToolUse!(callInput, { sessionId: 'test' });
				assert.deepStrictEqual(result, expectedOutput);
				assert.deepStrictEqual(trackingInput, callInput);
			} finally {
				cleanup();
			}
		});

		test('tool hooks preserve host context alongside plugin output and after failures', async () => {
			const { command, cleanup } = echoJsonCmd({ additionalContext: 'context from hook', suppressOutput: true });
			try {
				const hooks = toSdkHooks([makeHookGroup('PostToolUse', command)], {
					onPreToolUse: async () => { },
					onPostToolUse: async () => ({ additionalContext: 'host context' }),
					onPostToolUseFailure: () => ({ additionalContext: 'host context after a failure' }),
				});
				const base = { toolName: 'edit', toolArgs: {}, timestamp: new Date(0), workingDirectory: '/', sessionId: 'test' };

				assert.deepStrictEqual({
					success: await hooks.onPostToolUse!({ ...base, toolResult: { textResultForLlm: 'ok', resultType: 'success' } }, { sessionId: 'test' }),
					failure: await hooks.onPostToolUseFailure!({ ...base, error: 'No match found' }, { sessionId: 'test' }),
				}, {
					success: { additionalContext: 'host context\n\ncontext from hook', suppressOutput: true },
					failure: { additionalContext: 'host context after a failure' },
				});
			} finally {
				cleanup();
			}
		});

		test('onPostToolUse returns VS Code\'s own result change without plugin hooks', async () => {
			const modifiedResult = { textResultForLlm: 'ok\npath: /images/image.png', resultType: 'success' as const };
			const hooks = toSdkHooks([], { onPreToolUse: async () => { }, onPostToolUse: async () => ({ modifiedResult }) });
			const toolResult = { textResultForLlm: 'ok', resultType: 'success' as const };

			const result = await hooks.onPostToolUse!({ toolName: 'image_generation', toolArgs: {}, toolResult, timestamp: new Date(0), workingDirectory: '/', sessionId: 'test' }, { sessionId: 'test' });

			assert.deepStrictEqual(result, { modifiedResult });
		});

		test('onPostToolUse shows plugin hooks the result VS Code changed and keeps both outputs', async () => {
			// Answers with the result text it received, so the test sees what the plugin hook saw.
			const dir = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
			const filePath = `${dir}/vscode-test-hook-echo-result-${Date.now()}.js`;
			writeFileSync(filePath, `let input = ''; process.stdin.on('data', data => input += data).on('end', () => process.stdout.write(JSON.stringify({ additionalContext: 'saw: ' + JSON.parse(input).toolResult.textResultForLlm })));\n`);
			try {
				const modifiedResult = { textResultForLlm: 'ok\npath: /images/image.png', resultType: 'success' as const };
				const hooks = toSdkHooks([makeHookGroup('PostToolUse', `node ${filePath}`)], {
					onPreToolUse: async () => { },
					onPostToolUse: async () => ({ modifiedResult, additionalContext: 'from VS Code' }),
				});
				const toolResult = { textResultForLlm: 'ok', resultType: 'success' as const };

				const result = await hooks.onPostToolUse!({ toolName: 'image_generation', toolArgs: {}, toolResult, timestamp: new Date(0), workingDirectory: '/', sessionId: 'test' }, { sessionId: 'test' });

				assert.deepStrictEqual(result, { modifiedResult, additionalContext: 'from VS Code\n\nsaw: ok\npath: /images/image.png' });
			} finally {
				try { unlinkSync(filePath); } catch { /* ignore */ }
			}
		});

		test('onUserPromptSubmitted returns host context without rewriting the prompt', async () => {
			const hooks = toSdkHooks([], {
				onPreToolUse: async () => { },
				onPostToolUse: async () => undefined,
				onUserPromptSubmitted: () => ({ additionalContext: 'Rename with exact casing' }),
			});
			const input = { prompt: 'Keep GitHub casing', timestamp: new Date(0), workingDirectory: '/', sessionId: 'test' };

			const result = await hooks.onUserPromptSubmitted!(input, { sessionId: 'test' });

			assert.strictEqual(input.prompt, 'Keep GitHub casing');
			assert.deepStrictEqual(result, { additionalContext: 'Rename with exact casing' });
		});
	});

	// ---- parsedPluginsEqual ---------------------------------------------

	suite('parsedPluginsEqual', () => {

		function makePlugin(overrides?: Partial<IParsedPlugin>): IParsedPlugin {
			return {
				format: PluginFormat.Copilot,
				hooks: [],
				mcpServers: [],
				skills: [],
				agents: [],
				instructions: [],
				...overrides,
			};
		}

		test('returns true for identical empty plugins', () => {
			assert.strictEqual(parsedPluginsEqual([makePlugin()], [makePlugin()]), true);
		});

		test('returns true for same content', () => {
			const a = makePlugin({
				skills: [{ uri: URI.file('/a/SKILL.md'), name: 'a', customization: stubSkillCustomization('a') } satisfies IParsedSkill],
				mcpServers: [{
					name: 'server',
					uri: URI.file('/mcp'),
					configuration: { type: McpServerType.LOCAL, command: 'node' },
					customization: stubMcpCustomization('server'),
				}],
			});
			const b = makePlugin({
				skills: [{ uri: URI.file('/a/SKILL.md'), name: 'a', customization: stubSkillCustomization('a') } satisfies IParsedSkill],
				mcpServers: [{
					name: 'server',
					uri: URI.file('/mcp'),
					configuration: { type: McpServerType.LOCAL, command: 'node' },
					customization: stubMcpCustomization('server'),
				}],
			});
			assert.strictEqual(parsedPluginsEqual([a], [b]), true);
		});

		test('returns false for different content', () => {
			const a = makePlugin({ skills: [{ uri: URI.file('/a/SKILL.md'), name: 'a', customization: stubSkillCustomization('a') } satisfies IParsedSkill] });
			const b = makePlugin({ skills: [{ uri: URI.file('/b/SKILL.md'), name: 'b', customization: stubSkillCustomization('b') } satisfies IParsedSkill] });
			assert.strictEqual(parsedPluginsEqual([a], [b]), false);
		});

		function relocatedPlugin(path: string) {
			const pluginDir = URI.file(path);
			const resource = (name: string) => ({ uri: URI.joinPath(pluginDir, name), name });
			return {
				...makePlugin(),
				pluginDir,
				nonce: 'same-content',
				hooks: [{
					type: 'SessionStart',
					uri: URI.joinPath(pluginDir, 'hooks.json'),
					originalId: 'SessionStart',
					customization: stubHookCustomization('SessionStart'),
					commands: [{
						command: `node "${pluginDir.fsPath}/hook.cjs"`,
						windows: `node "${pluginDir.fsPath}/hook.cjs"`,
						linux: `node "${pluginDir.fsPath}/hook.cjs"`,
						osx: `node "${pluginDir.fsPath}/hook.cjs"`,
						cwd: pluginDir,
						env: { PLUGIN_ROOT: pluginDir.fsPath },
					}],
				}],
				mcpServers: [{
					name: 'server',
					uri: URI.joinPath(pluginDir, '.mcp.json'),
					defaultCwd: pluginDir,
					configuration: {
						type: McpServerType.LOCAL as const,
						command: 'node',
						args: [URI.joinPath(pluginDir, 'server.cjs').fsPath],
						env: { PLUGIN_ROOT: pluginDir.fsPath },
						envFile: URI.joinPath(pluginDir, '.env').fsPath,
						cwd: pluginDir.fsPath,
					},
					customization: stubMcpCustomization('server'),
				}],
				skills: [{ ...resource('skills/a/SKILL.md'), customization: stubSkillCustomization('a') }],
				agents: [{ ...resource('agents/a.agent.md'), customization: { type: CustomizationType.Agent, id: 'agent:a', uri: 'file:///agent', name: 'a' } }],
				instructions: [{ ...resource('rules/a.instructions.md'), customization: { type: CustomizationType.Rule, id: 'rule:a', uri: 'file:///rule', name: 'a' } }],
			} satisfies IParsedPlugin & { pluginDir: URI; nonce: string };
		}

		test('compares identical plugin content relative to each materialized root', () => {
			const a = relocatedPlugin('/cache/old/revision');
			const b = relocatedPlugin('/cache/new/revision');
			assert.deepStrictEqual({
				plugin: parsedPluginsEqual([a], [b]),
				standalone: parsedPluginsEqual([{ ...a, pluginDir: undefined, resourceDir: a.pluginDir }], [{ ...b, pluginDir: undefined, resourceDir: b.pluginDir }]),
			}, { plugin: true, standalone: true });
		});

		test('compares absolute roots when a plugin has no content nonce', () => {
			const a = relocatedPlugin('/cache/old/revision');
			const b = relocatedPlugin('/cache/new/revision');
			assert.deepStrictEqual([
				parsedPluginsEqual([{ ...a, nonce: undefined }], [{ ...b, nonce: undefined }]),
				parsedPluginsEqual([{ ...a, nonce: '' }], [{ ...b, nonce: '' }]),
				parsedPluginsEqual([{ ...a, nonce: undefined }], [{ ...a, nonce: undefined }]),
			], [false, false, true]);
		});

		test('resolves a published agent URI to the applied agent name only across an equivalent relocation', () => {
			const applied = relocatedPlugin('/cache/old/revision');
			const published = relocatedPlugin('/cache/new/revision');
			const agentUri = published.agents[0].uri.toString();
			assert.deepStrictEqual([
				findRelocatedAgentName([applied], [published], agentUri),
				findRelocatedAgentName([applied], [{ ...published, nonce: 'changed-resource-body' }], agentUri),
				findRelocatedAgentName([applied], [published], 'file:///unknown.agent.md'),
				findRelocatedAgentName([applied], [{ ...makePlugin(), pluginDir: URI.file('/workspace') }, published], agentUri),
			], [applied.agents[0].name, undefined, undefined, applied.agents[0].name]);
		});

		test('preserves content changes when plugin roots differ', () => {
			const a = relocatedPlugin('/cache/old/revision');
			const b = relocatedPlugin('/cache/new/revision');
			assert.deepStrictEqual([
				parsedPluginsEqual([a], [{ ...b, nonce: 'changed-resource-body' }]),
				parsedPluginsEqual([a], [{ ...b, skills: [] }]),
				parsedPluginsEqual([a], [{ ...b, agents: [] }]),
				parsedPluginsEqual([a], [{ ...b, instructions: [] }]),
				parsedPluginsEqual([a], [{ ...b, hooks: [{ ...b.hooks[0], commands: [{ command: 'different' }] }] }]),
				parsedPluginsEqual([a], [{ ...b, mcpServers: [{ ...b.mcpServers[0], configuration: { type: McpServerType.LOCAL, command: 'different' } }] }]),
			], [false, false, false, false, false, false]);
		});

		test('compares relative resource paths within their own plugin, not across plugins', () => {
			const a = relocatedPlugin('/cache/first');
			const b = relocatedPlugin('/cache/second');
			const first = { ...a, skills: [] };
			const second = { ...b, skills: [] };
			assert.deepStrictEqual([
				parsedPluginsEqual([a, second], [first, b]),
				parsedPluginsEqual([a], [{ ...b, skills: a.skills }]),
				parsedPluginsEqual([a], [{ ...b, skills: [{ ...b.skills[0], uri: URI.file('/cache/second-extra/skills/a/SKILL.md') }] }]),
			], [false, false, false]);
		});

		test('returns false for different skill invocation metadata', () => {
			const makeSkill = (flags: Pick<IParsedSkill, 'disableModelInvocation' | 'disableUserInvocation'>): IParsedSkill => ({
				uri: URI.file('/a/SKILL.md'),
				name: 'a',
				...flags,
				customization: { ...stubSkillCustomization('a'), ...flags },
			});
			const defaults = makePlugin({ skills: [makeSkill({})] });

			assert.deepStrictEqual([
				parsedPluginsEqual([defaults], [makePlugin({ skills: [makeSkill({ disableModelInvocation: true })] })]),
				parsedPluginsEqual([defaults], [makePlugin({ skills: [makeSkill({ disableUserInvocation: true })] })]),
			], [false, false]);
		});

		test('returns false for different MCP default cwd URIs', () => {
			const definition = (defaultCwd: URI): IMcpServerDefinition => ({
				name: 'server',
				uri: URI.file('/mcp'),
				defaultCwd,
				configuration: { type: McpServerType.LOCAL, command: 'node' },
				customization: stubMcpCustomization('server'),
			});
			assert.strictEqual(parsedPluginsEqual(
				[makePlugin({ mcpServers: [definition(URI.file('/a'))] })],
				[makePlugin({ mcpServers: [definition(URI.file('/b'))] })],
			), false);
		});

		test('returns false for different plugin formats', () => {
			assert.strictEqual(parsedPluginsEqual(
				[makePlugin({ format: PluginFormat.AgentPlugin })],
				[makePlugin({ format: PluginFormat.OpenPlugin })],
			), false);
		});

		test('returns false for different lengths', () => {
			assert.strictEqual(parsedPluginsEqual([makePlugin()], [makePlugin(), makePlugin()]), false);
		});

		test('returns true for empty arrays', () => {
			assert.strictEqual(parsedPluginsEqual([], []), true);
		});
	});
});
