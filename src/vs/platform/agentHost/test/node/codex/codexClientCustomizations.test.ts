/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PluginFormat, type IMcpServerDefinition, type IParsedPlugin, type IParsedSkill } from '../../../../agentPlugins/common/pluginParsers.js';
import { McpServerType, type IMcpServerConfiguration } from '../../../../mcp/common/mcpPlatformTypes.js';
import type { ISyncedCustomization } from '../../../common/agentPluginManager.js';
import { CustomizationType, McpServerStatus, type PluginCustomization } from '../../../common/state/protocol/channels-session/state.js';
import { CodexClientCustomizationStore, codexMcpServersFromPlugins, codexSkillRootsFromPlugins, type ICodexClientPlugin } from '../../../node/codex/codexClientCustomizations.js';

suite('codexClientCustomizations', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function pluginCustomization(id: string): PluginCustomization {
		return { type: CustomizationType.Plugin, id, uri: `https://plugins/${id}`, name: id, enabled: true };
	}

	function mcpDef(name: string, config: IMcpServerConfiguration): IMcpServerDefinition {
		const uri = URI.file(`/plugins/${name}/.mcp.json`);
		return { name, configuration: config, uri, customization: { type: CustomizationType.McpServer, id: `mcp:${name}`, uri: uri.toString(), name, enabled: true, state: { kind: McpServerStatus.Starting } } };
	}

	function skillDef(pluginDir: string, name: string): IParsedSkill {
		const uri = URI.file(`${pluginDir}/skills/${name}/SKILL.md`);
		return { uri, name, description: `${name} desc`, customization: { type: CustomizationType.Skill, id: `skill:${name}`, uri: uri.toString(), name } };
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
			enabled: c.enabled,
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
