/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentCustomizationContentExpander } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationContentExpander.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { mockFiles } from '../../../test/common/promptSyntax/testUtils/mockFilesystem.js';
import { AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationItem } from '../../../common/customizationHarnessService.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';

const REMOTE_HOST_GROUP = 'remote-host';
const REMOTE_CLIENT_GROUP = 'remote-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expand(expander: AgentCustomizationContentExpander, pluginUri: URI, groupKey: string, isBundleItem: boolean, source: AICustomizationSource, token: CancellationToken): Promise<readonly ICustomizationItem[]> {
	return expander.expandPluginContents(pluginUri, groupKey, isBundleItem, source, token);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite('AgentCustomizationContentExpander', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: IFileService;

	setup(() => {
		const fs = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fs.registerProvider(Schemas.file, provider));
		fileService = fs;
	});

	// -----------------------------------------------------------------------
	// expandPluginContents — skills folder
	// -----------------------------------------------------------------------

	suite('expandPluginContents – skills', () => {
		test('emits one item per subfolder that has a SKILL.md, skips folders without one', async () => {
			const pluginRoot = URI.file('/plugins/my-plugin');
			await mockFiles(fileService, [
				// valid skill folder with frontmatter name + description
				{
					path: '/plugins/my-plugin/skills/my-lint/SKILL.md', contents: [
						'---',
						'name: Lint',
						'description: Runs linting',
						'---',
						'',
						'# Body',
					]
				},
				// skill folder missing SKILL.md → should be skipped
				{
					path: '/plugins/my-plugin/skills/broken/README.md', contents: [
						'no frontmatter',
					]
				},
				// dotfile folder → should be skipped
				{
					path: '/plugins/my-plugin/skills/.hidden/SKILL.md', contents: [
						'---',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);

			assert.deepStrictEqual(items.map(i => ({ type: i.type, name: i.name, description: i.description })), [
				{ type: PromptsType.skill, name: 'Lint', description: 'Runs linting' },
			]);
		});

		test('uses folder name as fallback when SKILL.md has no name frontmatter', async () => {
			const pluginRoot = URI.file('/plugins/p');
			await mockFiles(fileService, [
				// SKILL.md exists but has no name/description
				{
					path: '/plugins/p/skills/unnamed-skill/SKILL.md', contents: [
						'---',
						'---',
						'',
						'# Content',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			assert.strictEqual(items.length, 1);
			assert.strictEqual(items[0].name, 'unnamed-skill');
			assert.strictEqual(items[0].description, undefined);
		});

		test('rewrites skill folder URI to point at SKILL.md', async () => {
			const pluginRoot = URI.file('/plugins/q');
			await mockFiles(fileService, [
				{
					path: '/plugins/q/skills/my-skill/SKILL.md', contents: [
						'---',
						'name: My Skill',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			assert.strictEqual(items.length, 1);
			assert.ok(items[0].uri.path.endsWith('/SKILL.md'), `expected SKILL.md URI, got ${items[0].uri}`);
		});

		test('userInvocable is surfaced from SKILL.md frontmatter', async () => {
			const pluginRoot = URI.file('/plugins/r');
			await mockFiles(fileService, [
				{
					path: '/plugins/r/skills/invocable/SKILL.md', contents: [
						'---',
						'name: Invocable',
						'user-invocable: true',
						'---',
					]
				},
				{
					path: '/plugins/r/skills/silent/SKILL.md', contents: [
						'---',
						'name: Silent',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			const invocable = items.find(i => i.name === 'Invocable');
			const silent = items.find(i => i.name === 'Silent');
			assert.ok(invocable, 'should have invocable item');
			assert.ok(silent, 'should have silent item');
			assert.strictEqual(invocable.userInvocable, true);
			assert.strictEqual(silent.userInvocable, undefined);
		});

		test('flat non-directory entries in skills/ are ignored', async () => {
			const pluginRoot = URI.file('/plugins/s');
			await mockFiles(fileService, [
				// flat file alongside a proper skill folder — flat files are no longer supported
				{
					path: '/plugins/s/skills/flat.skill.md', contents: [
						'---',
						'name: Flat',
						'---',
					]
				},
				{
					path: '/plugins/s/skills/folder-skill/SKILL.md', contents: [
						'---',
						'name: Folder Skill',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			// Only the folder-based skill should appear; the flat file is not a directory, so it is skipped
			assert.deepStrictEqual(items.map(i => i.name), ['Folder Skill']);
		});
	});

	// -----------------------------------------------------------------------
	// expandPluginContents — agents folder
	// -----------------------------------------------------------------------

	suite('expandPluginContents – agents', () => {
		test('emits one item per .md file with name/description/userInvocable from frontmatter', async () => {
			const pluginRoot = URI.file('/plugins/agents-plugin');
			await mockFiles(fileService, [
				{
					path: '/plugins/agents-plugin/agents/my-agent.agent.md', contents: [
						'---',
						'name: My Agent',
						'description: Does things',
						'user-invocable: true',
						'---',
					]
				},
				{
					path: '/plugins/agents-plugin/agents/other.agent.md', contents: [
						'---',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			const agentItems = items.filter(i => i.type === PromptsType.agent);
			assert.deepStrictEqual(
				agentItems.map(i => ({ name: i.name, description: i.description, userInvocable: i.userInvocable })).sort((a, b) => a.name.localeCompare(b.name)),
				[
					{ name: 'My Agent', description: 'Does things', userInvocable: true },
					{ name: 'other', description: undefined, userInvocable: undefined },
				],
			);
		});

		test('non-.md files in agents/ are ignored', async () => {
			const pluginRoot = URI.file('/plugins/agents-filter');
			await mockFiles(fileService, [
				{
					path: '/plugins/agents-filter/agents/valid.agent.md', contents: [
						'---',
						'name: Valid',
						'---',
					]
				},
				{
					path: '/plugins/agents-filter/agents/ignored.json', contents: [
						'{}',
					]
				},
				{
					path: '/plugins/agents-filter/agents/ignored.txt', contents: [
						'text',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			const agentItems = items.filter(i => i.type === PromptsType.agent);
			assert.deepStrictEqual(agentItems.map(i => i.name), ['Valid']);
		});

		test('directories in agents/ are ignored', async () => {
			const pluginRoot = URI.file('/plugins/agents-no-dirs');
			await mockFiles(fileService, [
				{
					path: '/plugins/agents-no-dirs/agents/nested/some.agent.md', contents: [
						'---',
						'name: Nested',
						'---',
					]
				},
				{
					path: '/plugins/agents-no-dirs/agents/flat.agent.md', contents: [
						'---',
						'name: Flat',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			const agentItems = items.filter(i => i.type === PromptsType.agent);
			// Only flat.agent.md; the nested/ directory is skipped
			assert.deepStrictEqual(agentItems.map(i => i.name), ['Flat']);
		});
	});

	// -----------------------------------------------------------------------
	// expandPluginContents — rules folder
	// -----------------------------------------------------------------------

	suite('expandPluginContents – rules', () => {
		test('emits one item per .md file with name/description from frontmatter', async () => {
			const pluginRoot = URI.file('/plugins/rules-plugin');
			await mockFiles(fileService, [
				{
					path: '/plugins/rules-plugin/rules/style.instructions.md', contents: [
						'---',
						'name: Style Guide',
						'description: Enforces style',
						'---',
					]
				},
				{
					path: '/plugins/rules-plugin/rules/noname.instructions.md', contents: [
						'---',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			const ruleItems = items.filter(i => i.type === PromptsType.instructions);
			assert.deepStrictEqual(
				ruleItems.map(i => ({ name: i.name, description: i.description })).sort((a, b) => a.name.localeCompare(b.name)),
				[
					{ name: 'Style Guide', description: 'Enforces style' },
					{ name: 'noname', description: undefined },
				].sort((a, b) => a.name.localeCompare(b.name)),
			);
		});

		test('userInvocable is NOT surfaced for rules', async () => {
			const pluginRoot = URI.file('/plugins/rules-no-invocable');
			await mockFiles(fileService, [
				{
					path: '/plugins/rules-no-invocable/rules/rule.instructions.md', contents: [
						'---',
						'name: My Rule',
						'user-invocable: true',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			const ruleItems = items.filter(i => i.type === PromptsType.instructions);
			assert.strictEqual(ruleItems.length, 1);
			assert.strictEqual(ruleItems[0].userInvocable, undefined, 'rules must not expose userInvocable');
		});

		test('emits one item per .mdc file per the Open Plugins spec', async () => {
			const pluginRoot = URI.file('/plugins/rules-mdc');
			await mockFiles(fileService, [
				{ path: '/plugins/rules-mdc/rules/style.mdc', contents: ['Some rule content'] },
				{ path: '/plugins/rules-mdc/rules/other.mdc', contents: ['Another rule'] },
				// `.txt` and similar must still be ignored
				{ path: '/plugins/rules-mdc/rules/readme.txt', contents: ['not a rule'] },
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			const ruleItems = items.filter(i => i.type === PromptsType.instructions);
			assert.deepStrictEqual(
				ruleItems.map(i => i.name).sort(),
				['other', 'style'],
			);
		});
	});

	// -----------------------------------------------------------------------
	// expandPluginContents — commands folder
	// -----------------------------------------------------------------------

	suite('expandPluginContents – commands', () => {
		test('emits one item per .md file, name from filename (no frontmatter parsing)', async () => {
			const pluginRoot = URI.file('/plugins/cmds-plugin');
			await mockFiles(fileService, [
				{
					path: '/plugins/cmds-plugin/commands/fix.prompt.md', contents: [
						'---',
						'name: Fix It',
						'---',
						'Fix the code',
					]
				},
				{
					path: '/plugins/cmds-plugin/commands/review.prompt.md', contents: [
						'# Review',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			const cmdItems = items.filter(i => i.type === PromptsType.prompt);
			assert.deepStrictEqual(
				cmdItems.map(i => i.name).sort(),
				['fix', 'review'],
			);
			// Commands do not expose description or userInvocable
			for (const cmd of cmdItems) {
				assert.strictEqual(cmd.description, undefined);
				assert.strictEqual(cmd.userInvocable, undefined);
			}
		});
	});

	// -----------------------------------------------------------------------
	// expandPluginContents — mixed plugin
	// -----------------------------------------------------------------------

	suite('expandPluginContents – mixed plugin', () => {
		test('all four folder types are discovered and returned together', async () => {
			const pluginRoot = URI.file('/plugins/mixed');
			await mockFiles(fileService, [
				{
					path: '/plugins/mixed/agents/bot.agent.md', contents: [
						'---',
						'name: Bot',
						'---',
					]
				},
				{
					path: '/plugins/mixed/skills/linter/SKILL.md', contents: [
						'---',
						'name: Linter',
						'---',
					]
				},
				{
					path: '/plugins/mixed/commands/fix.prompt.md', contents: [
						'# Fix',
					]
				},
				{
					path: '/plugins/mixed/rules/style.instructions.md', contents: [
						'---',
						'name: Style',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			const byType = (t: PromptsType) => items.filter(i => i.type === t).map(i => i.name);

			assert.deepStrictEqual(byType(PromptsType.agent), ['Bot']);
			assert.deepStrictEqual(byType(PromptsType.skill), ['Linter']);
			assert.deepStrictEqual(byType(PromptsType.prompt), ['fix']);
			assert.deepStrictEqual(byType(PromptsType.instructions), ['Style']);
		});
	});

	// -----------------------------------------------------------------------
	// expandPluginContents — groupKey and pluginUri propagation
	// -----------------------------------------------------------------------

	suite('expandPluginContents – groupKey and pluginUri', () => {
		test('all child items carry the groupKey passed to expand', async () => {
			const pluginRoot = URI.file('/plugins/gk');
			await mockFiles(fileService, [
				{
					path: '/plugins/gk/agents/a.agent.md', contents: [
						'---',
						'---',
					]
				},
				{
					path: '/plugins/gk/skills/s/SKILL.md', contents: [
						'---',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_CLIENT_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			for (const item of items) {
				assert.strictEqual(item.groupKey, REMOTE_CLIENT_GROUP, `item ${item.name} should carry remote-client groupKey`);
			}
		});

		test('isBundleItem=true clears pluginUri on child items', async () => {
			const pluginRoot = URI.file('/plugins/bundle');
			await mockFiles(fileService, [
				{
					path: '/plugins/bundle/skills/bs/SKILL.md', contents: [
						'---',
						'name: Bundle Skill',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const bundleItems = await expand(expander, pluginRoot, REMOTE_CLIENT_GROUP, true /* isBundleItem */, AICustomizationSources.plugin, CancellationToken.None);

			// Bundle items must not carry pluginUri
			for (const item of bundleItems) {
				assert.strictEqual(item.pluginUri, undefined, `bundle item ${item.name} must have no pluginUri`);
			}
		});

		test('isBundleItem=false sets pluginUri to the plugin root on child items', async () => {
			const pluginRoot = URI.file('/plugins/with-uri');
			await mockFiles(fileService, [
				{
					path: '/plugins/with-uri/skills/sk/SKILL.md', contents: [
						'---',
						'name: Sk',
						'---',
					]
				},
			]);

			const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
			const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
			assert.strictEqual(items.length, 1);
			assert.strictEqual(items[0].pluginUri?.toString(), pluginRoot.toString());
		});
	});
});
