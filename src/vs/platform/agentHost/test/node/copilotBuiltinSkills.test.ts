/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync } from 'fs';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TROUBLESHOOT_SKILL_NAME } from '../../common/agentHostTroubleshoot.js';
import { getBuiltinSkillDirectories, isBuiltinSkill } from '../../node/copilot/copilotBuiltinSkills.js';

suite('copilotBuiltinSkills', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('exposes one skill directory per built-in skill', () => {
		const dirs = getBuiltinSkillDirectories();
		assert.strictEqual(dirs.length, 1);
		assert.ok(dirs[0].replace(/\\/g, '/').endsWith(`/skills/${TROUBLESHOOT_SKILL_NAME}`));
	});

	test('each resolved directory contains a bundled SKILL.md', () => {
		// Exercises `builtinSkillsRoot()` end-to-end: `FileAccess.asFileUri` must
		// resolve to a real on-disk folder, and the bundled `SKILL.md` must live
		// there (guards the resolution + the build's resource copy in dev/`out`).
		for (const dir of getBuiltinSkillDirectories()) {
			assert.ok(existsSync(join(dir, 'SKILL.md')), `expected SKILL.md under ${dir}`);
		}
	});

	test('recognizes built-in skill names', () => {
		assert.strictEqual(isBuiltinSkill(TROUBLESHOOT_SKILL_NAME), true);
		assert.strictEqual(isBuiltinSkill('not-a-builtin'), false);
	});
});
