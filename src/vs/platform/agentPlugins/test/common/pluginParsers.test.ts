/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { FileSystemProviderCapabilities } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import { CustomizationType, McpServerStatus, type McpServerCustomization } from '../../../agentHost/common/state/protocol/state.js';
import { DEFAULT_MCP_APP } from '../../../agentHost/common/state/protocol/mcpAppDefaults.js';
import { customizationId } from '../../../agentHost/common/state/sessionState.js';

function stubMcpCustomization(): McpServerCustomization {
	return { type: CustomizationType.McpServer, id: 'stub', uri: 'file:///plugin', name: 'test', enabled: true, state: { kind: McpServerStatus.Starting } };
}
import {
	IParsedHookCommand,
	makeMcpServerCustomization,
	parseComponentPathConfig,
	parseHooksJson,
	resolveComponentDirs,
	normalizeMcpServerConfiguration,
	shellQuotePluginRootInCommand,
	interpolateMcpPluginRoot,
	convertBareEnvVarsToVsCodeSyntax,
	toParsedAgent,
	toParsedSkill,
	parsePlugin,
	PluginFormat,
} from '../../common/pluginParsers.js';
import { AGENT_PLUGIN_MCP_SCHEMA, AGENT_PLUGIN_SCHEMA } from '../../common/agentPluginParser.js';

suite('pluginParsers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- parseComponentPathConfig ---------------------------------------

	suite('parseComponentPathConfig', () => {

		test('returns empty config for undefined', () => {
			const result = parseComponentPathConfig(undefined);
			assert.deepStrictEqual(result, { paths: [], exclusive: false });
		});

		test('returns empty config for null', () => {
			const result = parseComponentPathConfig(null);
			assert.deepStrictEqual(result, { paths: [], exclusive: false });
		});

		test('parses a string to single-element paths', () => {
			const result = parseComponentPathConfig('custom/skills');
			assert.deepStrictEqual(result, { paths: ['custom/skills'], exclusive: false });
		});

		test('trims whitespace from string', () => {
			const result = parseComponentPathConfig('  spaced  ');
			assert.deepStrictEqual(result, { paths: ['spaced'], exclusive: false });
		});

		test('returns empty for blank string', () => {
			const result = parseComponentPathConfig('   ');
			assert.deepStrictEqual(result, { paths: [], exclusive: false });
		});

		test('parses a string array', () => {
			const result = parseComponentPathConfig(['a', 'b', 'c']);
			assert.deepStrictEqual(result, { paths: ['a', 'b', 'c'], exclusive: false });
		});

		test('filters non-string entries from arrays', () => {
			const result = parseComponentPathConfig(['valid', 42, null, 'ok']);
			assert.deepStrictEqual(result, { paths: ['valid', 'ok'], exclusive: false });
		});

		test('parses object with paths and exclusive', () => {
			const result = parseComponentPathConfig({ paths: ['x', 'y'], exclusive: true });
			assert.deepStrictEqual(result, { paths: ['x', 'y'], exclusive: true });
		});

		test('object without exclusive defaults to false', () => {
			const result = parseComponentPathConfig({ paths: ['z'] });
			assert.deepStrictEqual(result, { paths: ['z'], exclusive: false });
		});

		test('returns empty for unrecognized types', () => {
			const result = parseComponentPathConfig(42);
			assert.deepStrictEqual(result, { paths: [], exclusive: false });
		});
	});

	// ---- resolveComponentDirs -------------------------------------------

	suite('resolveComponentDirs', () => {

		const pluginUri = URI.file('/workspace/.plugin-root');

		test('includes default directory when not exclusive', () => {
			const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: [], exclusive: false });
			assert.strictEqual(dirs.length, 1);
			assert.ok(dirs[0].path.endsWith('/skills'));
		});

		test('excludes default directory when exclusive', () => {
			const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: ['custom'], exclusive: true });
			assert.ok(!dirs.some(d => d.path.endsWith('/skills')));
			assert.ok(dirs.some(d => d.path.endsWith('/custom')));
		});

		test('resolves relative paths from plugin root', () => {
			const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: ['other/skills'], exclusive: false });
			assert.strictEqual(dirs.length, 2);
			assert.ok(dirs[1].path.endsWith('/other/skills'));
		});

		test('rejects paths that escape plugin root', () => {
			const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: ['../../outside'], exclusive: false });
			// Should only have the default dir, the traversal path is rejected
			assert.strictEqual(dirs.length, 1);
		});

		test('allows paths that escape plugin root but stay within boundaryUri', () => {
			const boundaryUri = URI.file('/workspace');
			const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: ['../shared-skills'], exclusive: false }, boundaryUri);
			assert.strictEqual(dirs.length, 2);
			assert.ok(dirs[1].path.endsWith('/shared-skills'));
		});

		test('rejects paths that escape boundaryUri', () => {
			const boundaryUri = URI.file('/workspace');
			const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: ['../../outside'], exclusive: false }, boundaryUri);
			assert.strictEqual(dirs.length, 1);
		});

		test('falls back to pluginUri when boundaryUri is not an ancestor of pluginUri', () => {
			const boundaryUri = URI.file('/unrelated/directory');
			const dirs = resolveComponentDirs(pluginUri, 'skills', { paths: ['custom'], exclusive: false }, boundaryUri);
			assert.strictEqual(dirs.length, 2);
			assert.ok(dirs[1].path.endsWith('/custom'));
		});
	});

	// ---- normalizeMcpServerConfiguration --------------------------------

	suite('normalizeMcpServerConfiguration', () => {

		test('returns undefined for non-object input', () => {
			assert.strictEqual(normalizeMcpServerConfiguration(null), undefined);
			assert.strictEqual(normalizeMcpServerConfiguration('string'), undefined);
			assert.strictEqual(normalizeMcpServerConfiguration(42), undefined);
		});

		test('parses local server with command', () => {
			const result = normalizeMcpServerConfiguration({
				type: 'stdio',
				command: 'node',
				args: ['server.js'],
				env: { KEY: 'value' },
				cwd: '/workspace',
			});
			assert.ok(result);
			assert.strictEqual(result!.type, McpServerType.LOCAL);
			assert.strictEqual((result as { command: string }).command, 'node');
		});

		test('infers local type from command without explicit type', () => {
			const result = normalizeMcpServerConfiguration({ command: 'python' });
			assert.ok(result);
			assert.strictEqual(result!.type, McpServerType.LOCAL);
		});

		test('parses remote server with url', () => {
			const result = normalizeMcpServerConfiguration({
				type: 'sse',
				url: 'https://example.com',
				headers: { 'X-Key': 'val' },
			});
			assert.ok(result);
			assert.strictEqual(result!.type, McpServerType.REMOTE);
		});

		test('infers remote type from url without explicit type', () => {
			const result = normalizeMcpServerConfiguration({ url: 'https://example.com' });
			assert.ok(result);
			assert.strictEqual(result!.type, McpServerType.REMOTE);
		});

		test('rejects ws type', () => {
			const result = normalizeMcpServerConfiguration({ type: 'ws', url: 'ws://localhost:3000' });
			assert.strictEqual(result, undefined);
		});

		test('rejects local type without command', () => {
			const result = normalizeMcpServerConfiguration({ type: 'stdio' });
			assert.strictEqual(result, undefined);
		});

		test('filters non-string args', () => {
			const result = normalizeMcpServerConfiguration({
				command: 'test',
				args: ['valid', 42, null, 'also-valid'],
			});
			assert.ok(result);
			const args = (result as { args?: string[] }).args;
			assert.deepStrictEqual(args, ['valid', 'also-valid']);
		});
	});

	// ---- shellQuotePluginRootInCommand -----------------------------------

	suite('shellQuotePluginRootInCommand', () => {

		test('replaces token with path when no special chars', () => {
			const result = shellQuotePluginRootInCommand(
				'cd ${PLUGIN_ROOT} && run',
				'/simple/path',
				'${PLUGIN_ROOT}'
			);
			assert.strictEqual(result, 'cd /simple/path && run');
		});

		test('quotes path with spaces', () => {
			const result = shellQuotePluginRootInCommand(
				'cd ${PLUGIN_ROOT} && run',
				'/path with spaces',
				'${PLUGIN_ROOT}'
			);
			assert.ok(result.includes('"'), 'should add quotes for path with spaces');
			assert.ok(result.includes('/path with spaces'));
		});

		test('returns unchanged when token not present', () => {
			const result = shellQuotePluginRootInCommand('echo hello', '/path', '${PLUGIN_ROOT}');
			assert.strictEqual(result, 'echo hello');
		});

		test('handles already-quoted token', () => {
			const result = shellQuotePluginRootInCommand(
				'"${PLUGIN_ROOT}/script.sh"',
				'/path with spaces',
				'${PLUGIN_ROOT}'
			);
			assert.ok(!result.includes('""'), 'should not double-quote');
		});
	});

	suite('interpolateMcpPluginRoot', () => {

		test('replaces tokens and sets env vars without pairing array entries', () => {
			const result = interpolateMcpPluginRoot({
				name: 'test',
				uri: URI.file('/plugin/.mcp.json'),
				configuration: {
					type: McpServerType.LOCAL,
					command: '${PLUGIN_ROOT}/bin/server',
					args: ['--data', '${CLAUDE_PLUGIN_ROOT}/data'],
				},
				customization: stubMcpCustomization(),
			}, '/plugin', ['${PLUGIN_ROOT}', '${CLAUDE_PLUGIN_ROOT}'], ['PLUGIN_ROOT']);

			assert.deepStrictEqual(result.configuration, {
				type: McpServerType.LOCAL,
				command: '/plugin/bin/server',
				args: ['--data', '/plugin/data'],
				env: { PLUGIN_ROOT: '/plugin' },
			});
		});
	});

	// ---- convertBareEnvVarsToVsCodeSyntax -------------------------------

	suite('convertBareEnvVarsToVsCodeSyntax', () => {

		test('converts bare env vars to VS Code syntax', () => {
			const def = {
				name: 'test',
				uri: URI.file('/plugin'),
				configuration: {
					type: McpServerType.LOCAL as const,
					command: '${MY_TOOL}',
					args: ['--key=${API_KEY}'],
				},
				customization: stubMcpCustomization(),
			};
			const result = convertBareEnvVarsToVsCodeSyntax(def);
			assert.strictEqual((result.configuration as { command: string }).command, '${env:MY_TOOL}');
			assert.deepStrictEqual((result.configuration as unknown as { args: string[] }).args, ['--key=${env:API_KEY}']);
		});

		test('does not convert already-qualified vars', () => {
			const def = {
				name: 'test',
				uri: URI.file('/plugin'),
				configuration: {
					type: McpServerType.LOCAL as const,
					command: '${env:ALREADY_QUALIFIED}',
				},
				customization: stubMcpCustomization(),
			};
			const result = convertBareEnvVarsToVsCodeSyntax(def);
			assert.strictEqual((result.configuration as { command: string }).command, '${env:ALREADY_QUALIFIED}');
		});

		test('ignores lowercase vars', () => {
			const def = {
				name: 'test',
				uri: URI.file('/plugin'),
				configuration: {
					type: McpServerType.LOCAL as const,
					command: '${lowercase}',
				},
				customization: stubMcpCustomization(),
			};
			const result = convertBareEnvVarsToVsCodeSyntax(def);
			assert.strictEqual((result.configuration as { command: string }).command, '${lowercase}');
		});
	});

	suite('IParsedHookCommand.isEquals', () => {

		test('returns true for structurally equivalent commands', () => {
			const left: IParsedHookCommand = {
				command: 'echo hi',
				windows: 'Write-Host hi',
				linux: 'echo hi',
				osx: 'echo hi',
				cwd: URI.file('/workspace'),
				env: { A: '1' },
				timeout: 10,
				sourceUri: URI.file('/workspace/.github/hooks.yml')
			};
			const right: IParsedHookCommand = {
				command: 'echo hi',
				windows: 'Write-Host hi',
				linux: 'echo hi',
				osx: 'echo hi',
				cwd: URI.file('/workspace'),
				env: { A: '1' },
				timeout: 10,
				sourceUri: URI.file('/workspace/.github/hooks.yml')
			};

			assert.strictEqual(IParsedHookCommand.isEquals(left, right), true);
		});

		test('returns false when any field differs', () => {
			const left: IParsedHookCommand = {
				command: 'echo hi',
				cwd: URI.file('/workspace'),
				env: { A: '1' },
				timeout: 10,
				sourceUri: URI.file('/workspace/.github/hooks.yml')
			};
			const right: IParsedHookCommand = {
				command: 'echo bye',
				cwd: URI.file('/workspace/other'),
				env: { A: '2' },
				timeout: 20,
				sourceUri: URI.file('/workspace/.github/other-hooks.yml')
			};

			assert.strictEqual(IParsedHookCommand.isEquals(left, right), false);
		});
	});

	suite('toParsedAgent / toParsedSkill', () => {

		test('toParsedAgent pairs the resource with an AgentCustomization', () => {
			const uri = URI.file('/home/.claude/agents/explore.md');
			const parsed = toParsedAgent({ uri, name: 'explore', description: 'Explore the codebase' });
			assert.deepStrictEqual(parsed, {
				uri,
				name: 'explore',
				description: 'Explore the codebase',
				customization: {
					type: CustomizationType.Agent,
					id: customizationId(uri.toString()),
					uri: uri.toString(),
					name: 'explore',
					description: 'Explore the codebase',
				},
			});
		});

		test('toParsedSkill pairs the resource with a SkillCustomization and omits an absent description', () => {
			const uri = URI.file('/home/.claude/skills/mapper/SKILL.md');
			const parsed = toParsedSkill({ uri, name: 'mapper' });
			assert.deepStrictEqual(parsed, {
				uri,
				name: 'mapper',
				customization: {
					type: CustomizationType.Skill,
					id: customizationId(uri.toString()),
					uri: uri.toString(),
					name: 'mapper',
				},
			});
		});
	});

	suite('makeMcpServerCustomization', () => {

		test('builds a Stopped server with DEFAULT_MCP_APP and a name-disambiguated id', () => {
			const uri = URI.file('/workspace/.mcp.json');
			const customization = makeMcpServerCustomization(uri, 'fs server');
			assert.deepStrictEqual(customization, {
				type: CustomizationType.McpServer,
				id: `${customizationId(uri.toString())}#mcp=${encodeURIComponent('fs server')}`,
				uri: uri.toString(),
				name: 'fs server',
				enabled: true,
				state: { kind: McpServerStatus.Stopped },
				mcpApp: DEFAULT_MCP_APP,
			});
		});

		suite('Agent Plugin', () => {
			const store = new DisposableStore();
			let fileService: FileService;

			setup(() => {
				fileService = store.add(new FileService(new NullLogService()));
				store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
			});

			teardown(() => store.clear());

			async function write(path: string, contents: string): Promise<void> {
				await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path }), VSBuffer.fromString(contents));
			}

			async function parse(path = '/plugins/example') {
				const root = URI.from({ scheme: Schemas.inMemory, path });
				return parsePlugin(root, fileService, undefined, URI.from({ scheme: Schemas.inMemory, path: '/home' }), root);
			}

			test('recognizes the Agent Plugin schema and gives it precedence over legacy metadata', async () => {
				await write('/plugins/example/plugin.json', JSON.stringify({
					$schema: AGENT_PLUGIN_SCHEMA.replace('/1.0.0/', '/1.0.1/'),
					name: 'agent-plugin',
					description: 42,
					unknown: true,
					extensions: 'ignored',
				}));
				await write('/plugins/example/.plugin/plugin.json', JSON.stringify({ name: 'legacy-plugin', commands: './commands' }));
				await write('/plugins/example/commands/legacy.md', '# Legacy');
				await write('/plugins/example/skills/good/SKILL.md', '---\nname: good\ndescription: A valid skill\n---\nUse it.');
				await write('/plugins/example/SKILL.md', '---\nname: example\ndescription: Root fallback\n---');

				const plugin = await parse();
				assert.deepStrictEqual({
					format: plugin.format,
					skills: plugin.skills.map(skill => skill.name),
					agents: plugin.agents.length,
					hooks: plugin.hooks.length,
					instructions: plugin.instructions.length,
				}, {
					format: PluginFormat.AgentPlugin,
					skills: ['good'],
					agents: 0,
					hooks: 0,
					instructions: 0,
				});
			});

			test('reads usable immediate-child skills permissively', async () => {
				await write('/plugins/example/plugin.json', JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: 'example' }));
				await write('/plugins/example/skills/SKILL.md', '---\nname: ignored\ndescription: Not an immediate child\n---');
				await write('/plugins/example/skills/valid/SKILL.md', '---\nname: valid\ndescription: Valid skill\n---');
				await write('/plugins/example/skills/mismatch/SKILL.md', '---\nname: other\ndescription: Wrong directory\n---');
				await write('/plugins/example/skills/nested/deeper/SKILL.md', '---\nname: deeper\ndescription: Too deep\n---');

				assert.deepStrictEqual((await parse()).skills.map(skill => skill.name), ['other', 'valid']);
			});

			test('reads known MCP fields and leaves harness placeholders unresolved', async () => {
				await write('/plugins/example/plugin.json', JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: 'example' }));
				await write('/plugins/example/mcp.json', JSON.stringify({
					$schema: AGENT_PLUGIN_MCP_SCHEMA.replace('/1.0.0/', '/1.0.1/'),
					mcpServers: {
						stdio: {
							type: 'stdio',
							command: 'server',
							args: ['${PLUGIN_ROOT}', '${PLUGIN_DATA}', '${UNKNOWN}'],
							env: { ROOT: '${PLUGIN_ROOT}' },
							cwd: './work',
						},
						http: { type: 'streamable-http', url: 'https://example.com/mcp' },
						sse: { type: 'sse', url: 'http://127.0.0.2:3000/sse' },
					},
				}));

				const servers = new Map((await parse()).mcpServers.map(server => [server.name, server.configuration]));
				assert.deepStrictEqual([...servers.keys()], ['http', 'sse', 'stdio']);
				assert.strictEqual(servers.get('http')?.type, McpServerType.REMOTE);
				assert.strictEqual(servers.get('sse')?.type, McpServerType.REMOTE);
				const stdio = servers.get('stdio');
				assert.ok(stdio?.type === McpServerType.LOCAL);
				assert.deepStrictEqual({
					command: stdio.command,
					args: stdio.args,
					env: stdio.env,
					cwd: stdio.cwd,
				}, {
					command: 'server',
					args: ['${PLUGIN_ROOT}', '${PLUGIN_DATA}', '${UNKNOWN}'],
					env: { ROOT: '${PLUGIN_ROOT}' },
					cwd: './work',
				});
			});

			test('rejects filesystem-resolved skill escapes', async () => {
				class RealpathProvider extends InMemoryFileSystemProvider {
					override get capabilities(): FileSystemProviderCapabilities {
						return super.capabilities | FileSystemProviderCapabilities.FileRealpath;
					}
					async realpath(resource: URI): Promise<string> {
						return resource.path.endsWith('/skills/escape/SKILL.md') ? '/outside/SKILL.md' : resource.path;
					}
				}

				fileService = store.add(new FileService(new NullLogService()));
				store.add(fileService.registerProvider(Schemas.inMemory, store.add(new RealpathProvider())));
				await write('/plugins/example/plugin.json', JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: 'example' }));
				await write('/plugins/example/skills/escape/SKILL.md', '---\nname: escape\ndescription: Escaped\n---');

				assert.deepStrictEqual((await parse()).skills, []);
			});
		});

		test('two servers declared in the same file get distinct ids', () => {
			const uri = URI.file('/workspace/.mcp.json');
			assert.notStrictEqual(makeMcpServerCustomization(uri, 'a').id, makeMcpServerCustomization(uri, 'b').id);
		});
	});

	// ---- parseHooksJson -------------------------------------------------

	suite('parseHooksJson', () => {

		const hookUri = URI.file('/workspace/.claude/settings.json');
		const parse = (json: unknown) => parseHooksJson(hookUri, json, undefined, URI.file('/home'));

		test('returns [] for a non-object, a missing hooks block, or disableAllHooks', () => {
			assert.deepStrictEqual(parse(undefined), []);
			assert.deepStrictEqual(parse({ model: 'x' }), []);
			assert.deepStrictEqual(parse({ disableAllHooks: true, hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'echo' }] }] } }), []);
		});

		test('canonicalizes event names (camelCase → PascalCase) and ignores unrecognized events', () => {
			const groups = parse({
				hooks: {
					postToolUse: [{ hooks: [{ type: 'command', command: 'echo a' }] }],
					bogusEvent: [{ hooks: [{ type: 'command', command: 'echo b' }] }],
				},
			});
			assert.deepStrictEqual(groups.map(g => g.type), ['PostToolUse']);
		});

		test('extracts commands from the nested matcher form and drops empty groups', () => {
			const groups = parse({
				hooks: {
					PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo run' }] }],
					Stop: [{ matcher: 'X', hooks: [{ type: 'not-a-command' }] }],
				},
			});
			assert.deepStrictEqual(groups.map(g => g.type), ['PreToolUse']);
			assert.deepStrictEqual(groups[0].commands.map(c => c.command), ['echo run']);
		});

		test('extracts commands from the flat (non-nested) command form', () => {
			const groups = parse({
				hooks: { PostToolUse: [{ type: 'command', command: 'echo flat' }] },
			});
			assert.deepStrictEqual(groups.map(g => g.type), ['PostToolUse']);
			assert.deepStrictEqual(groups[0].commands.map(c => c.command), ['echo flat']);
		});

		test('all groups from one file share a single file-level customization', () => {
			const groups = parse({
				hooks: {
					PreToolUse: [{ hooks: [{ type: 'command', command: 'a' }] }],
					PostToolUse: [{ hooks: [{ type: 'command', command: 'b' }] }],
				},
			});
			assert.strictEqual(groups.length, 2);
			assert.strictEqual(groups[0].customization, groups[1].customization);
			assert.deepStrictEqual(groups[0].customization, {
				type: CustomizationType.Hook,
				id: customizationId(hookUri.toString()),
				uri: hookUri.toString(),
				name: 'settings.json',
			});
		});
	});
});
