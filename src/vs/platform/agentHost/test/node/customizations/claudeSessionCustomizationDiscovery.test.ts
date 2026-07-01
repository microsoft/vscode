/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../files/common/files.js';
import { NullLogService } from '../../../../log/common/log.js';
import { CustomizationType, McpServerStatus, type AgentSelection, type DirectoryCustomization, type HookCustomization, type McpServerCustomization } from '../../../common/state/protocol/state.js';
import { customizationId, type PluginCustomization } from '../../../common/state/sessionState.js';
import type { ISdkResolvedCustomizations } from '../../../node/claude/claudeSdkPipeline.js';
import { ClaudeCustomizationWatcher, buildDiscoveredCustomizations, mapDiscoveredCustomizations, resolveClaudeAgentName } from '../../../node/claude/customizations/claudeSessionCustomizationDiscovery.js';
import { CLAUDE_BUILTIN_AGENTS } from '../../../node/claude/customizations/claudeBuiltinCommands.js';
import { toParsedAgent, toParsedSkill, type IParsedRule } from '../../../../agentPlugins/common/pluginParsers.js';
import type { IResolvedNativePlugin } from '../../../node/claude/customizations/scan/claudeNativePluginScan.js';
import { claudeTestUserHome as userHome, claudeTestWorkspace as workspace, createInMemoryFileService, seedFile } from './claudeCustomizationTestUtils.js';

suite('claudeSessionCustomizationDiscovery', () => {

	const disposables = new DisposableStore();
	let fileService: IFileService;
	const seed = (path: string, content = '') => seedFile(fileService, path, content);

	/** Builds a resolved native plugin with optional bundled skills / agents. */
	const nativePlugin = (id: string, rootPath: string, parts: { skills?: string[]; agents?: string[] } = {}): IResolvedNativePlugin => {
		const root = URI.from({ scheme: Schemas.inMemory, path: rootPath });
		return {
			id,
			root,
			parsed: {
				hooks: [],
				mcpServers: [],
				instructions: [],
				skills: (parts.skills ?? []).map(name => toParsedSkill({ uri: URI.joinPath(root, 'skills', name, 'SKILL.md'), name })),
				agents: (parts.agents ?? []).map(name => toParsedAgent({ uri: URI.joinPath(root, 'agents', `${name}.md`), name })),
			},
		};
	};

	setup(() => {
		fileService = createInMemoryFileService(disposables);
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('mapDiscoveredCustomizations', () => {
		test('maps discovered entries into per-scope Directory containers with real child URIs + top-level MCP', () => {
			const wsAgentUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.claude/agents/wa.md' });
			const wsSkillUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.claude/skills/ws/SKILL.md' });
			const userAgentUri = URI.from({ scheme: Schemas.inMemory, path: '/home/.claude/agents/ua.md' });
			const discovered = [
				toParsedAgent({ uri: wsAgentUri, name: 'wa', description: 'WA' }),
				toParsedSkill({ uri: wsSkillUri, name: 'ws', description: 'WS' }),
				toParsedAgent({ uri: userAgentUri, name: 'ua', description: 'UA' }),
			];
			const mcp: McpServerCustomization[] = [{ type: CustomizationType.McpServer, id: 'mcp-id', uri: 'inmemory:/x', name: 'srv', enabled: true, state: { kind: McpServerStatus.Starting } }];

			const result = mapDiscoveredCustomizations(discovered, mcp, [], [], workspace, userHome);

			const dirs = result.filter(c => c.type === CustomizationType.Directory) as DirectoryCustomization[];
			// Workspace containers first (agents, skills), then user — each rooted at
			// the real `<scope>/.claude/<sub>` dir so the workbench can label scope.
			assert.deepStrictEqual(
				dirs.map(d => ({ uri: d.uri, contents: d.contents, children: d.children?.map(c => ({ name: c.name, uri: c.uri })) })),
				[
					{ uri: URI.joinPath(workspace, '.claude', 'agents').toString(), contents: CustomizationType.Agent, children: [{ name: 'wa', uri: wsAgentUri.toString() }] },
					{ uri: URI.joinPath(workspace, '.claude', 'skills').toString(), contents: CustomizationType.Skill, children: [{ name: 'ws', uri: wsSkillUri.toString() }] },
					{ uri: URI.joinPath(userHome, '.claude', 'agents').toString(), contents: CustomizationType.Agent, children: [{ name: 'ua', uri: userAgentUri.toString() }] },
				],
			);

			const server = result.find(c => c.type === CustomizationType.McpServer) as McpServerCustomization;
			assert.strictEqual(server.name, 'srv');
		});

		test('maps rules into per-scope Directory containers rooted at `.claude/rules`', () => {
			const wsRuleUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/CLAUDE.md' });
			const userRuleUri = URI.from({ scheme: Schemas.inMemory, path: '/home/.claude/rules/g.md' });
			const rule = (uri: URI, name: string): IParsedRule => ({
				uri,
				name,
				customization: { type: CustomizationType.Rule, id: customizationId(uri.toString()), uri: uri.toString(), name, alwaysApply: true },
			});
			const discovered = [rule(wsRuleUri, 'CLAUDE.md'), rule(userRuleUri, 'g')];

			const result = mapDiscoveredCustomizations(discovered, [], [], [], workspace, userHome);

			const dirs = result.filter(c => c.type === CustomizationType.Directory) as DirectoryCustomization[];
			assert.deepStrictEqual(
				dirs.map(d => ({ uri: d.uri, contents: d.contents, children: d.children?.map(c => ({ name: c.name, uri: c.uri })) })),
				[
					{ uri: URI.joinPath(workspace, '.claude', 'rules').toString(), contents: CustomizationType.Rule, children: [{ name: 'CLAUDE.md', uri: wsRuleUri.toString() }] },
					{ uri: URI.joinPath(userHome, '.claude', 'rules').toString(), contents: CustomizationType.Rule, children: [{ name: 'g', uri: userRuleUri.toString() }] },
				],
			);
		});

		test('maps hooks into per-scope Directory containers carrying the real settings-file URI', () => {
			const wsHookUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.claude/settings.json' });
			const userHookUri = URI.from({ scheme: Schemas.inMemory, path: '/home/.claude/settings.json' });
			const hook = (uri: URI): HookCustomization => ({ type: CustomizationType.Hook, id: customizationId(uri.toString()), uri: uri.toString(), name: 'settings.json' });

			const result = mapDiscoveredCustomizations([], [], [hook(wsHookUri), hook(userHookUri)], [], workspace, userHome);

			const dirs = result.filter(c => c.type === CustomizationType.Directory) as DirectoryCustomization[];
			assert.deepStrictEqual(
				dirs.map(d => ({ uri: d.uri, contents: d.contents, children: d.children?.map(c => ({ name: c.name, uri: c.uri })) })),
				[
					{ uri: URI.joinPath(workspace, '.claude', 'hooks').toString(), contents: CustomizationType.Hook, children: [{ name: 'settings.json', uri: wsHookUri.toString() }] },
					{ uri: URI.joinPath(userHome, '.claude', 'hooks').toString(), contents: CustomizationType.Hook, children: [{ name: 'settings.json', uri: userHookUri.toString() }] },
				],
			);
		});

		test('maps a native plugin into a top-level Plugin container carrying its bundled children', () => {
			const plugin = nativePlugin('tg@m', '/home/.claude/plugins/cache/m/tg/1.0.0', { skills: ['send'], agents: ['helper'] });

			const result = mapDiscoveredCustomizations([], [], [], [plugin], workspace, userHome);

			const plugins = result.filter(c => c.type === CustomizationType.Plugin) as PluginCustomization[];
			assert.deepStrictEqual(
				plugins.map(p => ({ uri: p.uri, name: p.name, children: p.children?.map(c => c.name).sort() })),
				[{ uri: plugin.root.toString(), name: 'tg@m', children: ['helper', 'send'] }],
			);
		});
	});

	suite('buildDiscoveredCustomizations', () => {
		test('post-materialize filter keeps SDK-known disk entries, hides unknown, adds non-editable fallback', () => {
			const knownAgent = URI.from({ scheme: Schemas.inMemory, path: '/home/.claude/agents/known.md' });
			const hiddenAgent = URI.from({ scheme: Schemas.inMemory, path: '/home/.claude/agents/hidden.md' });
			const diskSkill = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.claude/skills/kskill/SKILL.md' });
			const discovered = [
				toParsedAgent({ uri: knownAgent, name: 'known', description: 'K' }),
				toParsedAgent({ uri: hiddenAgent, name: 'hidden' }),
				toParsedSkill({ uri: diskSkill, name: 'kskill' }),
			];
			const diskMcp: McpServerCustomization = { type: CustomizationType.McpServer, id: 'disk-mcp', uri: 'inmemory:/settings.json', name: 'diskmcp', enabled: true, state: { kind: McpServerStatus.Starting } };
			const sdk: ISdkResolvedCustomizations = {
				agents: [{ name: 'known', description: 'K' }, { name: 'sdkonly', description: 'S' }, { name: 'general-purpose', description: 'default' }],
				commands: [{ name: 'kskill', description: '', argumentHint: '' }, { name: 'sdkcmd', description: 'C', argumentHint: '' }],
				mcpServers: [{ name: 'diskmcp', status: 'connected' }, { name: 'sdkmcp', status: 'failed' }],
				plugins: [],
			};

			const result = buildDiscoveredCustomizations(discovered, [diskMcp], [], [], workspace, userHome, sdk);

			// Children are split into per-scope containers; aggregate across them.
			const dirs = result.filter(c => c.type === CustomizationType.Directory) as DirectoryCustomization[];
			const agentChildren = dirs.filter(d => d.contents === CustomizationType.Agent).flatMap(d => d.children ?? []);
			// Editable disk-skill directories only (exclude the read-only Built-in container).
			const skillChildren = dirs.filter(d => d.contents === CustomizationType.Skill && URI.parse(d.uri).scheme !== 'agent-builtin').flatMap(d => d.children ?? []);
			const mcps = result.filter(c => c.type === CustomizationType.McpServer) as McpServerCustomization[];

			// known agent kept with its real URI; hidden dropped; sdkonly added
			// non-editable; general-purpose default agent hidden.
			assert.deepStrictEqual(agentChildren.map(c => ({ name: c.name, uri: c.uri })).sort((a, b) => a.name.localeCompare(b.name)), [
				{ name: 'known', uri: knownAgent.toString() },
				{ name: 'sdkonly', uri: 'claude-internal:/agent/sdkonly' },
			]);
			// disk skill kept (real URI); the SDK-only command `sdkcmd` is NOT mixed
			// in among the editable disk skills (it surfaces in the Built-in container).
			assert.deepStrictEqual(skillChildren.map(c => ({ name: c.name, uri: c.uri })), [
				{ name: 'kskill', uri: diskSkill.toString() },
			]);
			// disk MCP kept + enriched to Ready (connected); SDK-only MCP added.
			assert.deepStrictEqual(mcps.map(m => ({ name: m.name, state: m.state.kind })).sort((a, b) => a.name.localeCompare(b.name)), [
				{ name: 'diskmcp', state: McpServerStatus.Ready },
				{ name: 'sdkmcp', state: McpServerStatus.Starting },
			]);
		});

		test('SDK-only commands surface read-only in the Built-in container, not among editable disk skills', () => {
			const diskSkill = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.claude/skills/real/SKILL.md' });
			const discovered = [toParsedSkill({ uri: diskSkill, name: 'real' })];
			const sdk: ISdkResolvedCustomizations = {
				agents: [],
				// `real` is a loaded disk skill; `init` / `loop` are SDK-only
				// built-in slash commands with no editable file.
				commands: [
					{ name: 'real', description: '', argumentHint: '' },
					{ name: 'init', description: 'Initialize', argumentHint: '' },
					{ name: 'loop', description: 'Loop', argumentHint: '' },
				],
				mcpServers: [],
				plugins: [],
			};

			const result = buildDiscoveredCustomizations(discovered, [], [], [], workspace, userHome, sdk);
			const skillDirs = result.filter(c => c.type === CustomizationType.Directory) as DirectoryCustomization[];

			// Editable disk-skill directories contain only the real on-disk skill.
			const editableSkills = skillDirs
				.filter(d => d.contents === CustomizationType.Skill && URI.parse(d.uri).scheme !== 'agent-builtin')
				.flatMap(d => d.children ?? []);
			assert.deepStrictEqual(editableSkills.map(c => ({ name: c.name, uri: c.uri })), [{ name: 'real', uri: diskSkill.toString() }]);

			// The SDK-only commands appear in the read-only Built-in container.
			const builtin = skillDirs.find(d => URI.parse(d.uri).scheme === 'agent-builtin');
			assert.deepStrictEqual((builtin?.children ?? []).map(c => c.name), ['init', 'loop']);
		});

		test('rules survive the post-materialize SDK filter (no SDK counterpart)', () => {
			const ruleUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/CLAUDE.md' });
			const discovered: IParsedRule[] = [{
				uri: ruleUri,
				name: 'CLAUDE.md',
				customization: { type: CustomizationType.Rule, id: customizationId(ruleUri.toString()), uri: ruleUri.toString(), name: 'CLAUDE.md', alwaysApply: true },
			}];
			const sdk: ISdkResolvedCustomizations = { agents: [], commands: [], mcpServers: [], plugins: [] };

			const result = buildDiscoveredCustomizations(discovered, [], [], [], workspace, userHome, sdk);

			const ruleChildren = (result.filter(c => c.type === CustomizationType.Directory) as DirectoryCustomization[])
				.filter(d => d.contents === CustomizationType.Rule)
				.flatMap(d => d.children ?? []);
			assert.deepStrictEqual(ruleChildren.map(c => ({ name: c.name, uri: c.uri })), [{ name: 'CLAUDE.md', uri: ruleUri.toString() }]);
		});

		test('hooks survive the post-materialize SDK filter (no SDK counterpart)', () => {
			const hookUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.claude/settings.json' });
			const hooks: HookCustomization[] = [{ type: CustomizationType.Hook, id: customizationId(hookUri.toString()), uri: hookUri.toString(), name: 'settings.json' }];
			const sdk: ISdkResolvedCustomizations = { agents: [], commands: [], mcpServers: [], plugins: [] };

			const result = buildDiscoveredCustomizations([], [], hooks, [], workspace, userHome, sdk);

			const hookChildren = (result.filter(c => c.type === CustomizationType.Directory) as DirectoryCustomization[])
				.filter(d => d.contents === CustomizationType.Hook)
				.flatMap(d => d.children ?? []);
			assert.deepStrictEqual(hookChildren.map(c => ({ name: c.name, uri: c.uri })), [{ name: 'settings.json', uri: hookUri.toString() }]);
		});

		test('post-materialize keeps native plugins the live session loaded, hides the rest (matched by root path)', () => {
			const loaded = nativePlugin('loaded@m', '/home/.claude/plugins/cache/m/loaded/1.0.0', { skills: ['x'] });
			const unloaded = nativePlugin('unloaded@m', '/home/.claude/plugins/cache/m/unloaded/1.0.0', { skills: ['y'] });
			const sdk: ISdkResolvedCustomizations = { agents: [], commands: [], mcpServers: [], plugins: [{ name: 'loaded', path: loaded.root.fsPath }] };

			const result = buildDiscoveredCustomizations([], [], [], [loaded, unloaded], workspace, userHome, sdk);

			const plugins = result.filter(c => c.type === CustomizationType.Plugin) as PluginCustomization[];
			assert.deepStrictEqual(plugins.map(p => p.name), ['loaded@m']);
		});

		test('post-materialize matches a plugin by SDK `source` (id) even when the reported path is not the resolved root', () => {
			// The SDK reports a workspace-`local`-scoped plugin with a path that
			// is NOT its cache root (observed: `<workspace-parent>/<marketplace>/<plugin>/`).
			// `source` (the `<plugin>@<marketplace>` id) is the reliable key.
			const local = nativePlugin('github-inbox@team-kit', '/home/.claude/plugins/cache/team-kit/github-inbox/1.0.0', { agents: ['inbox'] });
			const sdk: ISdkResolvedCustomizations = {
				agents: [], commands: [], mcpServers: [],
				plugins: [{ name: 'github-inbox', path: '/some/bogus/team-kit/github-inbox/', source: 'github-inbox@team-kit' }],
			};

			const result = buildDiscoveredCustomizations([], [], [], [local], workspace, userHome, sdk);

			const plugins = result.filter(c => c.type === CustomizationType.Plugin) as PluginCustomization[];
			assert.deepStrictEqual(plugins.map(p => p.name), ['github-inbox@team-kit']);
		});

		test('pre-materialize shows all native plugins (no live session to filter against)', () => {
			const a = nativePlugin('a@m', '/home/.claude/plugins/cache/m/a/1.0.0');
			const b = nativePlugin('b@m', '/home/.claude/plugins/cache/m/b/1.0.0');

			const result = buildDiscoveredCustomizations([], [], [], [a, b], workspace, userHome, undefined);

			const plugins = result.filter(c => c.type === CustomizationType.Plugin) as PluginCustomization[];
			assert.deepStrictEqual(plugins.map(p => p.name).sort(), ['a@m', 'b@m']);
		});

		test('a surfaced plugin\'s components do not also leak as standalone SDK fallbacks (bare + namespaced names suppressed)', () => {
			// The live SDK reports a loaded plugin's components as agents
			// (namespaced `<plugin>:<name>`) and commands (usually bare). Both
			// forms must be suppressed from the standalone `claude-internal:`
			// agents / Built-in skills — they belong under the plugin container.
			const plugin = nativePlugin('inbox@team-kit', '/home/.claude/plugins/cache/team-kit/inbox/1.0.0', { agents: ['Investigator'], skills: ['do-thing'] });
			const sdk: ISdkResolvedCustomizations = {
				agents: [{ name: 'inbox:Investigator', description: 'p' }, { name: 'standalone-agent', description: 's' }],
				commands: [{ name: 'do-thing', description: 'p', argumentHint: '' }, { name: 'standalone-cmd', description: 's', argumentHint: '' }],
				mcpServers: [],
				plugins: [{ name: 'inbox', path: '/bogus', source: 'inbox@team-kit' }],
			};

			const result = buildDiscoveredCustomizations([], [], [], [plugin], workspace, userHome, sdk);

			// Plugin surfaced as its own container.
			assert.deepStrictEqual((result.filter(c => c.type === CustomizationType.Plugin) as PluginCustomization[]).map(p => p.name), ['inbox@team-kit']);
			// Standalone (per-scope Directory) entries: plugin components absent, non-plugin SDK entries present.
			const standaloneNames = result.flatMap(c => c.type === CustomizationType.Directory ? (c.children ?? []).map(ch => ch.name) : []);
			assert.strictEqual(standaloneNames.includes('inbox:Investigator'), false, 'namespaced plugin agent not standalone');
			assert.strictEqual(standaloneNames.includes('do-thing'), false, 'bare plugin skill not in Built-in');
			assert.deepStrictEqual([standaloneNames.includes('standalone-agent'), standaloneNames.includes('standalone-cmd')], [true, true], 'non-plugin SDK entries still surface');
		});

		test('pre-materialize seeds curated built-in agents (claude-internal; general-purpose hidden; disk name wins)', () => {
			// A disk agent named 'Explore' must shadow the curated built-in of the
			// same name (the editable file wins).
			const diskExplore = URI.from({ scheme: Schemas.inMemory, path: '/home/.claude/agents/Explore.md' });
			const discovered = [toParsedAgent({ uri: diskExplore, name: 'Explore', description: 'mine' })];

			const result = buildDiscoveredCustomizations(discovered, [], [], [], workspace, userHome, undefined);

			const agentChildren = (result.filter(c => c.type === CustomizationType.Directory) as DirectoryCustomization[])
				.filter(d => d.contents === CustomizationType.Agent)
				.flatMap(d => d.children ?? []);

			// Disk Explore kept (real URI); every curated built-in EXCEPT
			// general-purpose (hidden) and the disk-shadowed Explore is added as a
			// non-editable `claude-internal:` entry.
			const expected = [
				{ name: 'Explore', uri: diskExplore.toString() },
				...CLAUDE_BUILTIN_AGENTS
					.map(a => a.name)
					.filter(n => n !== 'general-purpose' && n !== 'Explore')
					.map(n => ({ name: n, uri: `claude-internal:/agent/${n}` })),
			].sort((a, b) => a.name.localeCompare(b.name));

			assert.deepStrictEqual(
				agentChildren.map(c => ({ name: c.name, uri: c.uri })).sort((a, b) => a.name.localeCompare(b.name)),
				expected,
			);
		});
	});

	suite('ClaudeCustomizationWatcher', () => {
		// Debounce wide enough that a burst of edits reliably lands in a single
		// window even on a loaded CI machine; `settle` then waits a clear
		// multiple of it so the one debounced fire is always counted before we
		// assert. The burst itself is issued concurrently so the change events
		// cluster inside one window rather than racing the debounce.
		const debounceMs = 20;
		const settle = () => timeout(debounceMs * 6);

		test('fires once (debounced) for changes under watched roots and ignores unrelated edits', async () => {
			const watcher = disposables.add(new ClaudeCustomizationWatcher(workspace, userHome, fileService, new NullLogService(), debounceMs));
			let fires = 0;
			disposables.add(watcher.onDidChange(() => { fires++; }));

			// An unrelated edit in the workspace root must NOT trigger a refresh.
			await seed('/workspace/unrelated.txt', 'x');
			await settle();
			assert.strictEqual(fires, 0);

			// A burst of edits across the watched roots collapses to a single fire:
			// a user-scope agent, a project-scope skill, and the sibling `.mcp.json`.
			await Promise.all([
				seed('/home/.claude/agents/a.md', 'a'),
				seed('/workspace/.claude/skills/s/SKILL.md', 's'),
				seed('/workspace/.mcp.json', '{}'),
			]);
			await settle();
			assert.strictEqual(fires, 1);
		});

		test('fires for a root-level CLAUDE.md / CLAUDE.local.md edit', async () => {
			const watcher = disposables.add(new ClaudeCustomizationWatcher(workspace, userHome, fileService, new NullLogService(), debounceMs));
			let fires = 0;
			disposables.add(watcher.onDidChange(() => { fires++; }));

			await Promise.all([
				seed('/workspace/CLAUDE.md', '# memory'),
				seed('/workspace/CLAUDE.local.md', '# personal'),
			]);
			await settle();
			assert.strictEqual(fires, 1);
		});
	});

	suite('resolveClaudeAgentName', () => {
		const log = new NullLogService();
		const sel = (uri: string): AgentSelection => ({ uri });

		test('no selection → undefined', async () => {
			assert.strictEqual(await resolveClaudeAgentName(undefined, fileService, log, 'sid'), undefined);
		});

		test('claude-internal URI decodes the name (inverse of nonEditableUri)', async () => {
			assert.strictEqual(await resolveClaudeAgentName(sel('claude-internal:/agent/sdkonly'), fileService, log, 'sid'), 'sdkonly');
			assert.strictEqual(await resolveClaudeAgentName(sel('claude-internal:/agent/two%20words'), fileService, log, 'sid'), 'two words');
		});

		test('file URI resolves the frontmatter name (not the filename)', async () => {
			const file = await seed('/home/.claude/agents/foo.md', '---\nname: my-real-agent\ndescription: d\n---\nbody');
			assert.strictEqual(await resolveClaudeAgentName(sel(file.toString()), fileService, log, 'sid'), 'my-real-agent');
		});

		test('unreadable file URI falls back to the basename (minus .md)', async () => {
			const missing = URI.from({ scheme: Schemas.inMemory, path: '/home/.claude/agents/missing.md' });
			assert.strictEqual(await resolveClaudeAgentName(sel(missing.toString()), fileService, log, 'sid'), 'missing');
		});
	});
});
