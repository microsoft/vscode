/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../files/common/files.js';
import { CustomizationType } from '../../../../common/state/protocol/state.js';
import { scanClaudeRules } from '../../../../node/claude/customizations/scan/claudeRuleScan.js';
import { claudeTestUserHome as userHome, claudeTestWorkspace as workspace, createInMemoryFileService, seedFile } from '../claudeCustomizationTestUtils.js';

suite('claudeRuleScan', () => {

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

	test('CLAUDE.md memory files (project + user) become always-on rules with the file name', async () => {
		const userMem = await seed('/home/.claude/CLAUDE.md', '# user memory');
		const rootMem = await seed('/workspace/CLAUDE.md', '# project memory');
		const dotMem = await seed('/workspace/.claude/CLAUDE.md', '# project .claude memory');
		const localMem = await seed('/workspace/CLAUDE.local.md', '# personal memory');

		const rules = await scanClaudeRules(workspace, userHome, fileService);

		assert.deepStrictEqual(
			rules
				.map(r => ({ uri: r.uri.toString(), name: r.name, type: r.customization.type, alwaysApply: r.customization.alwaysApply, globs: r.customization.globs }))
				.sort((a, b) => a.uri.localeCompare(b.uri)),
			[
				{ uri: dotMem.toString(), name: 'CLAUDE.md', type: CustomizationType.Rule, alwaysApply: true, globs: undefined },
				{ uri: localMem.toString(), name: 'CLAUDE.local.md', type: CustomizationType.Rule, alwaysApply: true, globs: undefined },
				{ uri: rootMem.toString(), name: 'CLAUDE.md', type: CustomizationType.Rule, alwaysApply: true, globs: undefined },
				{ uri: userMem.toString(), name: 'CLAUDE.md', type: CustomizationType.Rule, alwaysApply: true, globs: undefined },
			].sort((a, b) => a.uri.localeCompare(b.uri)),
		);
	});

	test('.claude/rules files are path-scoped when `paths` frontmatter is present, else always-on', async () => {
		const scoped = await seed('/workspace/.claude/rules/scoped.md', '---\nname: scoped-rule\ndescription: Only for src\npaths:\n  - "src/**"\n  - "lib/**"\n---\nbody');
		const always = await seed('/workspace/.claude/rules/always.md', '# applies everywhere');

		const rules = await scanClaudeRules(workspace, userHome, fileService);

		assert.deepStrictEqual(
			rules
				.map(r => ({ uri: r.uri.toString(), name: r.name, description: r.customization.description, alwaysApply: r.customization.alwaysApply, globs: r.customization.globs }))
				.sort((a, b) => a.uri.localeCompare(b.uri)),
			[
				{ uri: always.toString(), name: 'always', description: undefined, alwaysApply: true, globs: undefined },
				{ uri: scoped.toString(), name: 'scoped-rule', description: 'Only for src', alwaysApply: false, globs: ['src/**', 'lib/**'] },
			].sort((a, b) => a.uri.localeCompare(b.uri)),
		);
	});

	test('recurses into .claude/rules subdirectories for both scopes', async () => {
		const projectNested = await seed('/workspace/.claude/rules/frontend/ui.md', '# ui rule');
		const userRule = await seed('/home/.claude/rules/global.md', '# global rule');

		const rules = await scanClaudeRules(workspace, userHome, fileService);

		assert.deepStrictEqual(
			rules.map(r => r.uri.toString()).sort(),
			[projectNested.toString(), userRule.toString()].sort(),
		);
	});
});
