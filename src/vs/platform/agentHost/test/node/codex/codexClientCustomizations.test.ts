/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isCustomizationEnabled } from '../../../common/customizationEnablement.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { PluginFormat, type IMcpServerDefinition, type IParsedAgent, type IParsedPlugin, type IParsedRule, type IParsedSkill } from '../../../../agentPlugins/common/pluginParsers.js';
import { McpServerType, type IMcpServerConfiguration } from '../../../../mcp/common/mcpPlatformTypes.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../common/agentHostFileSystemService.js';
import { toClientPluginMcpDefaultCwdsMeta } from '../../../common/meta/clientPluginCustomizationMeta.js';
import type { ISyncedCustomization } from '../../../common/agentPluginManager.js';
import { CustomizationType, McpServerStatus, type PluginCustomization } from '../../../common/state/protocol/channels-session/state.js';
import { CodexClientCustomizationStore, codexAgentRoleToml, codexCustomizationConfig, codexMcpServersFromPlugins, codexSkillCapabilityRoots, codexSkillRootsFromPlugins, type ICodexClientPlugin } from '../../../node/codex/codexClientCustomizations.js';

suite('codexClientCustomizations', () => {
	const disposables = new DisposableStore();
	let fileService: FileService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
	});

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function pluginCustomization(id: string): PluginCustomization {
		return { type: CustomizationType.Plugin, id, uri: `https://plugins/${id}`, name: id, };
	}

	function mcpDef(name: string, config: IMcpServerConfiguration): IMcpServerDefinition {
		const uri = URI.file(`/plugins/${name}/.mcp.json`);
		return { name, configuration: config, uri, customization: { type: CustomizationType.McpServer, id: `mcp:${name}`, uri: uri.toString(), name, state: { kind: McpServerStatus.Starting } } };
	}

	function skillDef(pluginDir: string, name: string): IParsedSkill {
		const uri = URI.file(`${pluginDir}/skills/${name}/SKILL.md`);
		return { uri, name, description: `${name} desc`, customization: { type: CustomizationType.Skill, id: `skill:${name}`, uri: uri.toString(), name } };
	}

	function agentDef(uri: URI, name: string): IParsedAgent {
		return { uri, name, customization: { type: CustomizationType.Agent, id: `agent:${name}`, uri: uri.toString(), name } };
	}

	function instructionDef(uri: URI, name: string): IParsedRule {
		return { uri, name, customization: { type: CustomizationType.Rule, id: `rule:${name}`, uri: uri.toString(), name } };
	}

	function parsed(overrides: Partial<IParsedPlugin> = {}): IParsedPlugin {
		return { format: PluginFormat.Copilot, hooks: [], mcpServers: [], skills: [], agents: [], instructions: [], ...overrides };
	}

	function plugin(id: string, pluginDir: string | undefined, p: IParsedPlugin | undefined): ICodexClientPlugin {
		const synced: ISyncedCustomization = { customization: pluginCustomization(id), pluginDir: pluginDir ? URI.file(pluginDir) : undefined };
		return { synced, parsed: p };
	}

	test('toCustomizations folds parsed children and applies the enablement overlay', () => {
		const store = new CodexClientCustomizationStore();
		store.setClient('c1', [plugin('p1', '/plugins/p1', parsed({
			mcpServers: [mcpDef('srv', { type: McpServerType.LOCAL, command: 'run' })],
			skills: [skillDef('/plugins/p1', 'greet')],
		}))]);
		store.setEnabled('p1', false);
		assert.deepStrictEqual(store.toCustomizations().map(c => ({
			id: c.id,
			enabled: isCustomizationEnabled(c),
			children: c.children?.map(ch => ({ type: ch.type, id: ch.id })),
		})), [{
			id: 'p1',
			enabled: false,
			children: [
				{ type: CustomizationType.Skill, id: 'skill:greet' },
				{ type: CustomizationType.McpServer, id: 'mcp:srv' },
			],
		}]);
	});

	test('enabledPlugins excludes disabled and unparsed plugins; merge dedupes by id (first client wins)', () => {
		const store = new CodexClientCustomizationStore();
		store.setClient('c1', [
			plugin('shared', '/plugins/shared', parsed({ skills: [skillDef('/plugins/shared', 's')] })),
			plugin('unparsed', undefined, undefined),
			plugin('off', '/plugins/off', parsed()),
		]);
		store.setClient('c2', [plugin('shared', '/plugins/other', parsed())]); // duplicate id ignored
		store.setEnabled('off', false);
		assert.deepStrictEqual(store.enabledPlugins().map(p => p.synced.customization.id), ['shared']);
	});

	test('codexMcpServersFromPlugins maps stdio + http, stringifies env, and maps headers', () => {
		const plugins = [plugin('p', '/plugins/p', parsed({
			mcpServers: [
				mcpDef('local', { type: McpServerType.LOCAL, command: 'npx', args: ['-y', 'pkg'], env: { KEY: 'v', N: 3, DROP: null }, cwd: '/w' }),
				mcpDef('remote', { type: McpServerType.REMOTE, url: 'https://x/mcp', headers: { Authorization: 'Bearer t' } }),
			],
		}))];
		assert.deepStrictEqual(codexMcpServersFromPlugins(plugins), {
			local: { command: 'npx', args: ['-y', 'pkg'], env: { KEY: 'v', N: '3' }, cwd: '/w' },
			remote: { url: 'https://x/mcp', http_headers: { Authorization: 'Bearer t' } },
		});
	});

	test('codexMcpServersFromPlugins resolves session-relative defaults at launch time', () => {
		const sessionCwd = URI.file('/worktree');
		const clientPlugin = plugin('p', '/cache/p', parsed({
			mcpServers: [mcpDef('local', { type: McpServerType.LOCAL, command: 'run' })],
		}));
		clientPlugin.synced.customization._meta = toClientPluginMcpDefaultCwdsMeta({ local: null });

		assert.deepStrictEqual(codexMcpServersFromPlugins([clientPlugin], sessionCwd), {
			local: { command: 'run', cwd: sessionCwd.fsPath },
		});
	});

	test('codexMcpServersFromPlugins de-duplicates server names (first wins) and omits empties', () => {
		const plugins = [
			plugin('a', '/plugins/a', parsed({ mcpServers: [mcpDef('dup', { type: McpServerType.LOCAL, command: 'first', args: [], env: {} })] })),
			plugin('b', '/plugins/b', parsed({ mcpServers: [mcpDef('dup', { type: McpServerType.LOCAL, command: 'second' })] })),
		];
		assert.deepStrictEqual(codexMcpServersFromPlugins(plugins), { dup: { command: 'first' } });
	});

	test('codexSkillRootsFromPlugins returns the skills root (dirname twice), deduped and sorted', () => {
		const plugins = [plugin('p', '/plugins/p', parsed({
			skills: [skillDef('/plugins/p', 'b'), skillDef('/plugins/p', 'a')],
		})), plugin('q', '/plugins/q', parsed({ skills: [skillDef('/plugins/q', 'c')] }))];
		// The roots are native fsPaths (backslashes on Windows), so express the
		// expectation with the same platform-aware transform rather than a
		// hardcoded posix path.
		const skillsRoot = (pluginDir: string) => URI.file(`${pluginDir}/skills`).fsPath;
		assert.deepStrictEqual(codexSkillRootsFromPlugins(plugins), [skillsRoot('/plugins/p'), skillsRoot('/plugins/q')]);
		assert.deepStrictEqual(codexSkillCapabilityRoots(plugins).map(root => root.fsPath), [skillsRoot('/plugins/p'), skillsRoot('/plugins/q')]);
	});

	test('converts agent markdown and plugin instructions into codex launch configuration', async () => {
		const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/plugin/agents/reviewer.agent.md' });
		const instructionUri = URI.from({ scheme: Schemas.inMemory, path: '/plugin/rules/repo.instructions.md' });
		await fileService.writeFile(agentUri, VSBuffer.fromString(`---\nname: Reviewer\ndescription: Reviews carefully\nmodel: gpt-test\n---\nReview the change and report risks.`));
		await fileService.writeFile(instructionUri, VSBuffer.fromString(`---\ndescription: Repository rules\n---\nAlways run focused tests.`));
		const plugins = [plugin('p', undefined, parsed({
			agents: [agentDef(agentUri, 'reviewer')],
			instructions: [instructionDef(instructionUri, 'repo')],
		}))];

		const config = await codexCustomizationConfig([], plugins, { uri: agentUri.toString() }, fileService);

		assert.deepStrictEqual(config, {
			agentRoles: [{
				name: 'Reviewer',
				description: 'Reviews carefully',
				instructions: 'Review the change and report risks.',
				model: 'gpt-test',
			}],
			developerInstructions: 'Always run focused tests.\n\nReview the change and report risks.',
		});
		assert.strictEqual(codexAgentRoleToml(config.agentRoles[0]), [
			'name = "Reviewer"',
			'description = "Reviews carefully"',
			'developer_instructions = "Review the change and report risks."',
			'model = "gpt-test"',
			'',
		].join('\n'));
	});

	test('converts a selected workspace agent without a client plugin', async () => {
		const agentUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.github/agents/reviewer.agent.md' });
		await fileService.writeFile(agentUri, VSBuffer.fromString([
			'---',
			'name: Workspace Reviewer',
			'description: Reviews workspace changes',
			'model: [gpt-first, gpt-second]',
			'tools: [read_file, search]',
			'infer: true',
			'disable-model-invocation: true',
			'---',
			'Review the workspace change.',
		].join('\n')));

		const config = await codexCustomizationConfig(
			[agentDef(agentUri, 'reviewer')],
			[],
			{ uri: agentUri.toString() },
			fileService,
		);

		assert.deepStrictEqual(config, {
			agentRoles: [{
				name: 'Workspace Reviewer',
				description: 'Reviews workspace changes',
				instructions: 'Review the workspace change.',
				model: 'gpt-first',
			}],
			developerInstructions: 'Review the workspace change.',
		});
	});

	test('does not promote path-scoped plugin instructions to thread-global instructions', async () => {
		const globalInstructionUri = URI.from({ scheme: Schemas.inMemory, path: '/plugin/rules/global.instructions.md' });
		const scopedInstructionUri = URI.from({ scheme: Schemas.inMemory, path: '/plugin/rules/typescript.instructions.md' });
		await fileService.writeFile(globalInstructionUri, VSBuffer.fromString(`---\napplyTo: "**/*"\n---\nApply globally.`));
		await fileService.writeFile(scopedInstructionUri, VSBuffer.fromString(`---\napplyTo: "**/*.ts"\n---\nApply only to TypeScript.`));
		const plugins = [plugin('p', undefined, parsed({
			instructions: [
				instructionDef(globalInstructionUri, 'global'),
				instructionDef(scopedInstructionUri, 'typescript'),
			],
		}))];

		const config = await codexCustomizationConfig([], plugins, undefined, fileService);

		assert.strictEqual(config.developerInstructions, 'Apply globally.');
	});

	test('matches a selected source agent to its host-synced plugin copy', async () => {
		const sourcePluginUri = URI.from({ scheme: Schemas.inMemory, path: '/source/plugin' });
		const syncedPluginUri = URI.from({ scheme: Schemas.inMemory, path: '/synced/plugin' });
		const sourceAgentUri = URI.joinPath(sourcePluginUri, 'agents', 'reviewer.agent.md');
		const syncedAgentUri = URI.joinPath(syncedPluginUri, 'agents', 'reviewer.agent.md');
		await fileService.writeFile(syncedAgentUri, VSBuffer.fromString(`---\nname: Reviewer\ndescription: Reviews carefully\n---\nApply synced reviewer instructions.`));
		const synced: ISyncedCustomization = {
			customization: {
				type: CustomizationType.Plugin,
				id: 'synced-plugin',
				uri: sourcePluginUri.toString(),
				name: 'Synced Plugin',
			},
			pluginDir: syncedPluginUri,
		};
		const plugins: ICodexClientPlugin[] = [{
			synced,
			parsed: parsed({ agents: [agentDef(syncedAgentUri, 'reviewer')] }),
		}];

		const config = await codexCustomizationConfig([], plugins, { uri: sourceAgentUri.toString() }, fileService);

		assert.strictEqual(config.developerInstructions, 'Apply synced reviewer instructions.');
	});

	test('matches an original loose-agent URI to its synthetic bundle copy', async () => {
		const sourceAgentUri = URI.file('/workspace/.github/agents/reviewer.agent.md');
		const syncedPluginUri = URI.from({ scheme: Schemas.inMemory, path: '/synced/plugin' });
		const syncedAgentUri = URI.joinPath(syncedPluginUri, 'agents', 'reviewer.agent.md');
		await fileService.writeFile(syncedAgentUri, VSBuffer.fromString(`---\nname: Reviewer\ndescription: Reviews carefully\n---\nApply loose reviewer instructions.`));
		const synced: ISyncedCustomization = {
			customization: {
				type: CustomizationType.Plugin,
				id: 'synthetic-plugin',
				uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/agent-host-codex`,
				name: 'VS Code Synced Data',
			},
			pluginDir: syncedPluginUri,
		};
		const plugins: ICodexClientPlugin[] = [{
			synced,
			parsed: parsed({ agents: [agentDef(syncedAgentUri, 'reviewer')] }),
		}];

		const config = await codexCustomizationConfig([], plugins, { uri: sourceAgentUri.toString() }, fileService);

		assert.strictEqual(config.developerInstructions, 'Apply loose reviewer instructions.');
	});

	test('prefers an exact selected agent over a synthetic filename fallback', async () => {
		const selectedPluginUri = URI.from({ scheme: Schemas.inMemory, path: '/source/plugin' });
		const selectedSyncedPluginUri = URI.from({ scheme: Schemas.inMemory, path: '/synced/selected-plugin' });
		const selectedAgentUri = URI.joinPath(selectedPluginUri, 'agents', 'reviewer.agent.md');
		const selectedSyncedAgentUri = URI.joinPath(selectedSyncedPluginUri, 'agents', 'reviewer.agent.md');
		const syntheticPluginUri = URI.from({ scheme: Schemas.inMemory, path: '/synced/synthetic-plugin' });
		const syntheticAgentUri = URI.joinPath(syntheticPluginUri, 'agents', 'reviewer.agent.md');
		await fileService.writeFile(selectedSyncedAgentUri, VSBuffer.fromString('Apply exact reviewer instructions.'));
		await fileService.writeFile(syntheticAgentUri, VSBuffer.fromString('Do not apply synthetic reviewer instructions.'));
		const plugins: ICodexClientPlugin[] = [
			{
				synced: {
					customization: { type: CustomizationType.Plugin, id: 'selected-plugin', uri: selectedPluginUri.toString(), name: 'Selected Plugin', },
					pluginDir: selectedSyncedPluginUri,
				},
				parsed: parsed({ agents: [agentDef(selectedSyncedAgentUri, 'selected-reviewer')] }),
			},
			{
				synced: {
					customization: { type: CustomizationType.Plugin, id: 'synthetic-plugin', uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/agent-host-codex`, name: 'VS Code Synced Data', },
					pluginDir: syntheticPluginUri,
				},
				parsed: parsed({ agents: [agentDef(syntheticAgentUri, 'synthetic-reviewer')] }),
			},
		];

		const config = await codexCustomizationConfig([], plugins, { uri: selectedAgentUri.toString() }, fileService);

		assert.strictEqual(config.developerInstructions, 'Apply exact reviewer instructions.');
	});

	test('removeClient drops a client and setEnabled reports whether it changed', () => {
		const store = new CodexClientCustomizationStore();
		store.setClient('c1', [plugin('p1', '/plugins/p1', parsed())]);
		assert.deepStrictEqual({
			hasBefore: store.has('p1'),
			toggledOff: store.setEnabled('p1', false),
			toggledOffAgain: store.setEnabled('p1', false),
			removed: store.removeClient('c1'),
			emptyAfter: store.isEmpty(),
		}, { hasBefore: true, toggledOff: true, toggledOffAgain: false, removed: true, emptyAfter: true });
	});
});
