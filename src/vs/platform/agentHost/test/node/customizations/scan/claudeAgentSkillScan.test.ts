/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../files/common/files.js';
import { CustomizationType } from '../../../../common/state/protocol/state.js';
import { scanClaudeDiskCustomizations } from '../../../../node/claude/customizations/scan/claudeAgentSkillScan.js';
import { claudeTestUserHome as userHome, claudeTestWorkspace as workspace, createInMemoryFileService, seedFile } from '../claudeCustomizationTestUtils.js';

suite('claudeAgentSkillScan', () => {

	const disposables = new DisposableStore();
	let fileService: IFileService;
	const seed = (path: string, content = '') => seedFile(fileService, path, content);

	setup(() => {
		fileService = createInMemoryFileService(disposables);
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('scans agents, skills, and commands (commands folded into skills) with real URIs', async () => {
		const agent = await seed('/home/.claude/agents/a.md', '---\nname: a-agent\ndescription: Agent A\n---\nbody');
		const skill = await seed('/workspace/.claude/skills/s/SKILL.md', '---\nname: s-skill\ndescription: Skill S\n---\nbody');
		// Slash commands are a variant of skills (spec §3) — discovered as Skill kind.
		const command = await seed('/workspace/.claude/commands/c.md', '---\nname: c-cmd\ndescription: Command C\n---\nbody');

		const discovered = await scanClaudeDiskCustomizations(workspace, userHome, fileService);
		const actual = discovered
			.map(d => ({ type: d.customization.type, uri: d.uri.toString(), name: d.name, description: d.description }))
			.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(actual, [
			{ type: CustomizationType.Agent, uri: agent.toString(), name: 'a-agent', description: 'Agent A' },
			{ type: CustomizationType.Skill, uri: command.toString(), name: 'c-cmd', description: 'Command C' },
			{ type: CustomizationType.Skill, uri: skill.toString(), name: 's-skill', description: 'Skill S' },
		].sort((a, b) => a.uri.localeCompare(b.uri)));
	});

	test('a skill wins over a same-named command (spec §3 priority)', async () => {
		const skill = await seed('/workspace/.claude/skills/dup/SKILL.md', '---\nname: dup\ndescription: The skill\n---\nbody');
		await seed('/workspace/.claude/commands/dup.md', '---\nname: dup\ndescription: The command\n---\nbody');

		const discovered = await scanClaudeDiskCustomizations(workspace, userHome, fileService);

		assert.deepStrictEqual(
			discovered.map(d => ({ type: d.customization.type, uri: d.uri.toString(), name: d.name, description: d.description })),
			[{ type: CustomizationType.Skill, uri: skill.toString(), name: 'dup', description: 'The skill' }],
		);
	});

	test('project scope shadows user scope on name clash', async () => {
		const projectAgent = await seed('/workspace/.claude/agents/dup.md', '---\nname: dup\ndescription: project\n---\nbody');
		await seed('/home/.claude/agents/dup.md', '---\nname: dup\ndescription: user\n---\nbody');

		const discovered = await scanClaudeDiskCustomizations(workspace, userHome, fileService);
		const dup = discovered.filter(d => d.name === 'dup');

		assert.strictEqual(dup.length, 1);
		assert.strictEqual(dup[0].uri.toString(), projectAgent.toString());
		assert.strictEqual(dup[0].description, 'project');
	});

	test('a `.claude/skills/<name>` dir that is a native plugin is not surfaced as a standalone skill (PB-8)', async () => {
		// A plain on-disk skill is surfaced normally.
		const realSkill = await seed('/workspace/.claude/skills/real/SKILL.md', '---\nname: real\ndescription: Real\n---\nbody');
		// A `@skills-dir` plugin dir holds a plugin manifest (and may also carry a
		// top-level SKILL.md) — it belongs to its PluginCustomization, not the
		// standalone skill list.
		await seed('/workspace/.claude/skills/tg/.claude-plugin/plugin.json', JSON.stringify({ name: 'tg' }));
		await seed('/workspace/.claude/skills/tg/SKILL.md', '---\nname: tg\ndescription: plugin\n---\nbody');

		const discovered = await scanClaudeDiskCustomizations(workspace, userHome, fileService);

		assert.deepStrictEqual(
			discovered.filter(d => d.customization.type === CustomizationType.Skill).map(d => ({ name: d.name, uri: d.uri.toString() })),
			[{ name: 'real', uri: realSkill.toString() }],
		);
	});
});
