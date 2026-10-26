/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../files/common/files.js';
import { NullLogService } from '../../../../log/common/log.js';
import { discoverClaudeMultiRootCustomizations } from '../../../node/claude/customizations/claudeMultiRootCustomizationDiscovery.js';
import { scanClaudeDiskCustomizations } from '../../../node/claude/customizations/scan/claudeAgentSkillScan.js';
import { scanClaudeNativePlugins } from '../../../node/claude/customizations/scan/claudeNativePluginScan.js';
import { createInMemoryFileService, seedFile } from './claudeCustomizationTestUtils.js';

class CapturingLogService extends NullLogService {
	readonly warns: string[] = [];
	override warn(message: string, ...args: unknown[]): void {
		this.warns.push([message, ...args.map(a => String(a))].join(' '));
	}
}

suite('claudeMultiRootCustomizationDiscovery', () => {
	const disposables = new DisposableStore();
	const rootA = URI.from({ scheme: Schemas.inMemory, path: '/a' });
	const rootB = URI.from({ scheme: Schemas.inMemory, path: '/b' });
	const userHome = URI.from({ scheme: Schemas.inMemory, path: '/home' });
	let fileService: IFileService;
	const seed = (path: string, content = '') => seedFile(fileService, path, content);

	setup(() => {
		fileService = createInMemoryFileService(disposables);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the existing single-root discovery path without changing output order', async () => {
		await Promise.all([
			seed('/a/.claude/agents/project.md', '---\nname: project\ndescription: project agent\n---'),
			seed('/home/.claude/agents/user.md', '---\nname: user\ndescription: user agent\n---'),
			seed('/a/.claude/skills/project-skill/SKILL.md', '---\nname: project-skill\ndescription: project skill\n---'),
			seed('/home/.claude/skills/user-skill/SKILL.md', '---\nname: user-skill\ndescription: user skill\n---'),
			seed('/home/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'user-plugin@m': true } })),
			seed('/a/.claude/settings.json', JSON.stringify({ enabledPlugins: { 'project-plugin@m': true } })),
			seed('/home/.claude/plugins/cache/m/user-plugin/1.0.0/.claude-plugin/plugin.json', JSON.stringify({ name: 'user-plugin' })),
			seed('/home/.claude/plugins/cache/m/project-plugin/1.0.0/.claude-plugin/plugin.json', JSON.stringify({ name: 'project-plugin' })),
		]);
		const logService = new NullLogService();
		const [expectedDiscovered, expectedPlugins, actual] = await Promise.all([
			scanClaudeDiskCustomizations(rootA, userHome, fileService),
			scanClaudeNativePlugins(rootA, userHome, fileService, logService),
			discoverClaudeMultiRootCustomizations([rootA], userHome, fileService, logService),
		]);

		assert.deepStrictEqual({
			discovered: actual.discovered,
			plugins: actual.nativePlugins,
		}, {
			discovered: expectedDiscovered,
			plugins: expectedPlugins,
		});
	});

	test('combines roots in order and applies first-name-wins precedence', async () => {
		await Promise.all([
			seed('/a/.claude/agents/shared.md', '---\nname: shared\ndescription: from a\n---'),
			seed('/b/.claude/agents/shared.md', '---\nname: shared\ndescription: from b\n---'),
			seed('/b/.claude/agents/b-only.md', '---\nname: b-only\ndescription: from b\n---'),
			seed('/b/.claude/skills/shared-skill/SKILL.md', '---\nname: shared-skill\ndescription: from b\n---'),
			seed('/home/.claude/skills/shared-skill/SKILL.md', '---\nname: shared-skill\ndescription: from user\n---'),
			seed('/home/.claude/skills/user-only/SKILL.md', '---\nname: user-only\ndescription: from user\n---'),
			seed('/b/.claude/commands/not-loaded.md', '---\nname: not-loaded\ndescription: added-directory command\n---'),
		]);

		const result = await discoverClaudeMultiRootCustomizations([rootA, rootB], userHome, fileService, new NullLogService());

		assert.deepStrictEqual({
			roots: result.workingDirectories.map(root => root.path),
			items: result.discovered.map(item => ({ name: item.name, description: item.description, path: item.uri.path })),
		}, {
			roots: ['/a', '/b'],
			items: [
				{ name: 'shared', description: 'from a', path: '/a/.claude/agents/shared.md' },
				{ name: 'b-only', description: 'from b', path: '/b/.claude/agents/b-only.md' },
				{ name: 'shared-skill', description: 'from b', path: '/b/.claude/skills/shared-skill/SKILL.md' },
				{ name: 'user-only', description: 'from user', path: '/home/.claude/skills/user-only/SKILL.md' },
			],
		});
	});

	test('warns when a workspace folder skill or agent is shadowed by another folder', async () => {
		const agentA = await seed('/a/.claude/agents/reviewer.md', '---\nname: reviewer\ndescription: from a\n---');
		const agentB = await seed('/b/.claude/agents/reviewer.md', '---\nname: reviewer\ndescription: from b\n---');
		const skillA = await seed('/a/.claude/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: from a\n---');
		const skillB = await seed('/b/.claude/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: from b\n---');
		// A same-named user-scope skill is an expected override, not a cross-folder collision.
		await seed('/home/.claude/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: from user\n---');
		const logService = new CapturingLogService();

		await discoverClaudeMultiRootCustomizations([rootA, rootB], userHome, fileService, logService);

		assert.deepStrictEqual(logService.warns.sort(), [
			`[claudeMultiRootCustomizationDiscovery] agent 'reviewer' at '${agentB.toString()}' is shadowed by '${agentA.toString()}' from another workspace folder and is unreachable by name`,
			`[claudeMultiRootCustomizationDiscovery] skill 'deploy' at '${skillB.toString()}' is shadowed by '${skillA.toString()}' from another workspace folder and is unreachable by name`,
		].sort());
	});

	test('deduplicates equivalent roots without changing precedence', async () => {
		await seed('/a/.claude/agents/a.md', '---\nname: a\ndescription: A\n---');

		const result = await discoverClaudeMultiRootCustomizations([rootA, rootA], userHome, fileService, new NullLogService());

		assert.deepStrictEqual({
			roots: result.workingDirectories.map(root => root.path),
			items: result.discovered.map(item => item.name),
		}, {
			roots: ['/a'],
			items: ['a'],
		});
	});
});
