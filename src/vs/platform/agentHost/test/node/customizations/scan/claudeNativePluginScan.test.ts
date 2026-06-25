/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../log/common/log.js';
import { IFileService } from '../../../../../files/common/files.js';
import { scanClaudeNativePlugins } from '../../../../node/claude/customizations/scan/claudeNativePluginScan.js';
import { claudeTestUserHome as userHome, claudeTestWorkspace as workspace, createInMemoryFileService, seedFile } from '../claudeCustomizationTestUtils.js';

suite('claudeNativePluginScan', () => {

	const disposables = new DisposableStore();
	let fileService: IFileService;
	const logService = new NullLogService();
	const seed = (path: string, content = '') => seedFile(fileService, path, content);

	const manifest = (name: string) => JSON.stringify({ name, description: `${name} plugin`, version: '1.0.0' });

	setup(() => {
		fileService = createInMemoryFileService(disposables);
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves a marketplace-cache plugin (id → <marketplace>/<plugin>/<version>) with its real root', async () => {
		await seed('/home/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'telegram@official': true } }));
		await seed('/home/.claude/plugins/cache/official/telegram/0.0.6/.claude-plugin/plugin.json', manifest('telegram'));

		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);

		assert.deepStrictEqual(
			plugins.map(p => ({ id: p.id, root: p.root.path })),
			[{ id: 'telegram@official', root: '/home/.claude/plugins/cache/official/telegram/0.0.6' }],
		);
	});

	test('resolves an Open-Plugins-format plugin (.plugin/plugin.json), not just the Claude layout', async () => {
		// Marketplace plugins can ship the Open Plugins manifest layout
		// (`.plugin/plugin.json`) rather than `.claude-plugin/plugin.json`; the
		// runtime still loads them, so the scanner must surface them too.
		await seed('/home/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'github-inbox@team-kit': true } }));
		await seed('/home/.claude/plugins/cache/team-kit/github-inbox/1.0.0/.plugin/plugin.json', manifest('github-inbox'));

		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);

		assert.deepStrictEqual(
			plugins.map(p => ({ id: p.id, root: p.root.path })),
			[{ id: 'github-inbox@team-kit', root: '/home/.claude/plugins/cache/team-kit/github-inbox/1.0.0' }],
		);
	});

	test('picks the newest-mtime version dir when several are cached', async () => {
		await seed('/home/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'p@m': true } }));
		await seed('/home/.claude/plugins/cache/m/p/0.0.1/.claude-plugin/plugin.json', manifest('p'));
		// Seeded second, so it has the newer mtime in the in-memory provider.
		await seed('/home/.claude/plugins/cache/m/p/0.0.2/.claude-plugin/plugin.json', manifest('p'));

		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);

		assert.deepStrictEqual(plugins.map(p => p.root.path), ['/home/.claude/plugins/cache/m/p/0.0.2']);
	});

	test('breaks an mtime tie by numeric version order (`0.0.10` beats `0.0.9`)', async () => {
		await seed('/home/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'p@m': true } }));
		// Plain string compare would pick `0.0.9` ('9' > '1'); numeric order picks `0.0.10`.
		await seed('/home/.claude/plugins/cache/m/p/0.0.9/.claude-plugin/plugin.json', manifest('p'));
		await seed('/home/.claude/plugins/cache/m/p/0.0.10/.claude-plugin/plugin.json', manifest('p'));

		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);

		assert.deepStrictEqual(plugins.map(p => p.root.path), ['/home/.claude/plugins/cache/m/p/0.0.10']);
	});

	test('surfaces bundled components (skills / MCP) with real URIs', async () => {
		await seed('/home/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'tg@m': true } }));
		const root = '/home/.claude/plugins/cache/m/tg/1.0.0';
		await seed(`${root}/.claude-plugin/plugin.json`, manifest('tg'));
		await seed(`${root}/.mcp.json`, JSON.stringify({ mcpServers: { bridge: { command: 'node' } } }));
		await seed(`${root}/skills/send/SKILL.md`, '---\nname: send\ndescription: send a message\n---\nbody');

		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);

		assert.strictEqual(plugins.length, 1);
		const p = plugins[0];
		assert.deepStrictEqual(p.parsed.mcpServers.map(m => m.name), ['bridge']);
		assert.deepStrictEqual(p.parsed.skills.map(s => ({ name: s.name, uri: s.customization.uri })), [
			{ name: 'send', uri: `inmemory:${root}/skills/send/SKILL.md` },
		]);
	});

	test('local `false` disables a project-enabled plugin (precedence user < project < local)', async () => {
		await seed('/workspace/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'p@m': true } }));
		await seed('/workspace/.claude/settings.local.json', JSON.stringify({ enabledPlugins: { 'p@m': false } }));
		await seed('/home/.claude/plugins/cache/m/p/1.0.0/.claude-plugin/plugin.json', manifest('p'));

		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);

		assert.deepStrictEqual(plugins, []);
	});

	test('treats string[] / object values as enabled, only `false` disables', async () => {
		await seed('/home/.claude/settings.json', JSON.stringify({
			enabledPlugins: { 'ver@m': ['1.x'], 'obj@m': { pinned: true }, 'off@m': false },
		}));
		await seed('/home/.claude/plugins/cache/m/ver/1.0.0/.claude-plugin/plugin.json', manifest('ver'));
		await seed('/home/.claude/plugins/cache/m/obj/1.0.0/.claude-plugin/plugin.json', manifest('obj'));
		await seed('/home/.claude/plugins/cache/m/off/1.0.0/.claude-plugin/plugin.json', manifest('off'));

		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);

		assert.deepStrictEqual(plugins.map(p => p.id), ['obj@m', 'ver@m']);
	});

	test('resolves an in-place @skills-dir plugin, preferring the workspace scope', async () => {
		await seed('/home/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'mine@skills-dir': true } }));
		await seed('/workspace/.claude/skills/mine/.claude-plugin/plugin.json', manifest('mine'));
		await seed('/home/.claude/skills/mine/.claude-plugin/plugin.json', manifest('mine'));

		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);

		assert.deepStrictEqual(plugins.map(p => p.root.path), ['/workspace/.claude/skills/mine']);
	});

	test('fail-soft: an enabled plugin with no resolvable root is skipped, not thrown', async () => {
		await seed('/home/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'present@m': true, 'missing@m': true } }));
		await seed('/home/.claude/plugins/cache/m/present/1.0.0/.claude-plugin/plugin.json', manifest('present'));

		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);

		assert.deepStrictEqual(plugins.map(p => p.id), ['present@m']);
	});

	test('no enabledPlugins block yields no plugins', async () => {
		await seed('/home/.claude/settings.json', JSON.stringify({ model: 'x' }));
		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);
		assert.deepStrictEqual(plugins, []);
	});

	test('with no workspace, only the user-home settings are read (skills-dir skips the workspace candidate)', async () => {
		await seed('/home/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'p@m': true, 'mine@skills-dir': true } }));
		await seed('/home/.claude/plugins/cache/m/p/1.0.0/.claude-plugin/plugin.json', manifest('p'));
		await seed('/home/.claude/skills/mine/.claude-plugin/plugin.json', manifest('mine'));

		const plugins = await scanClaudeNativePlugins(undefined, userHome, fileService, logService);

		assert.deepStrictEqual(
			plugins.map(p => p.root.path).sort(),
			['/home/.claude/plugins/cache/m/p/1.0.0', '/home/.claude/skills/mine'],
		);
	});

	test('rejects ids whose segments could traverse outside the plugin roots', async () => {
		// A crafted enabledPlugins key (e.g. from an untrusted workspace
		// settings.local.json) must never redirect the scan via `..` / path
		// separators, even if a manifest happens to exist at the target.
		await seed('/workspace/.claude/settings.local.json', JSON.stringify({
			enabledPlugins: { '../../../etc@m': true, 'p@../../../etc': true, 'ok@m': true },
		}));
		await seed('/home/.claude/plugins/cache/m/ok/1.0.0/.claude-plugin/plugin.json', manifest('ok'));
		// Seed a manifest at a traversal target to prove it is NOT resolved.
		await seed('/etc/.claude-plugin/plugin.json', manifest('evil'));

		const plugins = await scanClaudeNativePlugins(workspace, userHome, fileService, logService);

		assert.deepStrictEqual(plugins.map(p => p.id), ['ok@m']);
	});
});
