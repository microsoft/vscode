/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { getPromptFileType, getCleanPromptName, isPromptOrInstructionsFile } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../../common/promptSyntax/promptTypes.js';

suite('promptFileLocations', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getPromptFileType', () => {
		test('.prompt.md files', () => {
			const uri = URI.file('/workspace/test.prompt.md');
			assert.strictEqual(getPromptFileType(uri), PromptsType.prompt);
		});

		test('.instructions.md files', () => {
			const uri = URI.file('/workspace/test.instructions.md');
			assert.strictEqual(getPromptFileType(uri), PromptsType.instructions);
		});

		test('.agent.md files', () => {
			const uri = URI.file('/workspace/test.agent.md');
			assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
		});

		test('.chatmode.md files (legacy)', () => {
			const uri = URI.file('/workspace/test.chatmode.md');
			assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
		});

		test('.md files in .github/agents/ folder should be recognized as agent files', () => {
			const uri = URI.file('/workspace/.github/agents/demonstrate.md');
			assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
		});

		test('README.md in .github/agents/ should NOT be recognized as agent file', () => {
			const uri = URI.file('/workspace/.github/agents/README.md');
			assert.strictEqual(getPromptFileType(uri), undefined);
		});

		test('.md files in .github/agents/ subfolder should NOT be recognized as agent files', () => {
			const uri = URI.file('/workspace/.github/agents/subfolder/test.md');
			assert.strictEqual(getPromptFileType(uri), undefined);
		});

		test('.md files outside .github/agents/ should not be recognized as agent files', () => {
			const uri = URI.file('/workspace/test/foo.md');
			assert.strictEqual(getPromptFileType(uri), undefined);
		});

		test('.md files in other .github/ subfolders should not be recognized as agent files', () => {
			const uri = URI.file('/workspace/.github/prompts/test.md');
			assert.strictEqual(getPromptFileType(uri), undefined);
		});

		test('copilot-instructions.md should be recognized as instructions', () => {
			const uri = URI.file('/workspace/.github/copilot-instructions.md');
			assert.strictEqual(getPromptFileType(uri), PromptsType.instructions);
		});

		test('regular .md files should return undefined', () => {
			const uri = URI.file('/workspace/README.md');
			assert.strictEqual(getPromptFileType(uri), undefined);
		});

		test('SKILL.md (uppercase) should be recognized as skill', () => {
			const uri = URI.file('/workspace/.github/skills/test/SKILL.md');
			assert.strictEqual(getPromptFileType(uri), PromptsType.skill);
		});

		test('skill.md (lowercase) should be recognized as skill', () => {
			const uri = URI.file('/workspace/.github/skills/test/skill.md');
			assert.strictEqual(getPromptFileType(uri), PromptsType.skill);
		});

		test('Skill.md (mixed case) should be recognized as skill', () => {
			const uri = URI.file('/workspace/.github/skills/test/Skill.md');
			assert.strictEqual(getPromptFileType(uri), PromptsType.skill);
		});

		test('hooks.json should be recognized as hook', () => {
			const uri = URI.file('/workspace/.github/hooks/hooks.json');
			assert.strictEqual(getPromptFileType(uri), PromptsType.hook);
		});

		test('HOOKS.JSON (uppercase) should be recognized as hook', () => {
			const uri = URI.file('/workspace/.github/hooks/HOOKS.JSON');
			assert.strictEqual(getPromptFileType(uri), PromptsType.hook);
		});

		test('hooks.json in any folder should be recognized as hook', () => {
			const uri = URI.file('/workspace/some/other/path/hooks.json');
			assert.strictEqual(getPromptFileType(uri), PromptsType.hook);
		});

		test('settings.json in .claude folder should be recognized as hook', () => {
			const uri = URI.file('/workspace/.claude/settings.json');
			assert.strictEqual(getPromptFileType(uri), PromptsType.hook);
		});

		test('settings.local.json in .claude folder should be recognized as hook', () => {
			const uri = URI.file('/workspace/.claude/settings.local.json');
			assert.strictEqual(getPromptFileType(uri), PromptsType.hook);
		});

		test('SETTINGS.JSON (uppercase) in .claude folder should be recognized as hook', () => {
			const uri = URI.file('/workspace/.claude/SETTINGS.JSON');
			assert.strictEqual(getPromptFileType(uri), PromptsType.hook);
		});

		test('settings.json outside .claude folder should NOT be recognized as hook', () => {
			const uri = URI.file('/workspace/.github/settings.json');
			assert.strictEqual(getPromptFileType(uri), undefined);
		});

		test('settings.local.json outside .claude folder should NOT be recognized as hook', () => {
			const uri = URI.file('/workspace/some/path/settings.local.json');
			assert.strictEqual(getPromptFileType(uri), undefined);
		});

		test('settings.json in ~/.claude folder should be recognized as hook', () => {
			const uri = URI.file('/Users/user/.claude/settings.json');
			assert.strictEqual(getPromptFileType(uri), PromptsType.hook);
		});
	});

	suite('getCleanPromptName', () => {
		test('removes .prompt.md extension', () => {
			const uri = URI.file('/workspace/test.prompt.md');
			assert.strictEqual(getCleanPromptName(uri), 'test');
		});

		test('removes .instructions.md extension', () => {
			const uri = URI.file('/workspace/test.instructions.md');
			assert.strictEqual(getCleanPromptName(uri), 'test');
		});

		test('removes .agent.md extension', () => {
			const uri = URI.file('/workspace/test.agent.md');
			assert.strictEqual(getCleanPromptName(uri), 'test');
		});

		test('removes .chatmode.md extension (legacy)', () => {
			const uri = URI.file('/workspace/test.chatmode.md');
			assert.strictEqual(getCleanPromptName(uri), 'test');
		});

		test('removes .md extension for files in .github/agents/', () => {
			const uri = URI.file('/workspace/.github/agents/demonstrate.md');
			assert.strictEqual(getCleanPromptName(uri), 'demonstrate');
		});

		test('README.md in .github/agents/ should keep .md extension', () => {
			const uri = URI.file('/workspace/.github/agents/README.md');
			assert.strictEqual(getCleanPromptName(uri), 'README.md');
		});

		test('removes .md extension for copilot-instructions.md', () => {
			const uri = URI.file('/workspace/.github/copilot-instructions.md');
			assert.strictEqual(getCleanPromptName(uri), 'copilot-instructions');
		});

		test('keeps .md extension for regular files', () => {
			const uri = URI.file('/workspace/README.md');
			assert.strictEqual(getCleanPromptName(uri), 'README.md');
		});

		test('keeps full filename for files without known extensions', () => {
			const uri = URI.file('/workspace/test.txt');
			assert.strictEqual(getCleanPromptName(uri), 'test.txt');
		});

		test('removes .md extension for SKILL.md (uppercase)', () => {
			const uri = URI.file('/workspace/.github/skills/test/SKILL.md');
			assert.strictEqual(getCleanPromptName(uri), 'SKILL');
		});

		test('removes .md extension for skill.md (lowercase)', () => {
			const uri = URI.file('/workspace/.github/skills/test/skill.md');
			assert.strictEqual(getCleanPromptName(uri), 'skill');
		});

		test('removes .md extension for Skill.md (mixed case)', () => {
			const uri = URI.file('/workspace/.github/skills/test/Skill.md');
			assert.strictEqual(getCleanPromptName(uri), 'Skill');
		});
	});

	suite('isPromptOrInstructionsFile', () => {
		test('SKILL.md files should return true', () => {
			assert.strictEqual(isPromptOrInstructionsFile(URI.file('/workspace/.github/skills/test/SKILL.md')), true);
		});

		test('skill.md (lowercase) should return true', () => {
			assert.strictEqual(isPromptOrInstructionsFile(URI.file('/workspace/.claude/skills/myskill/skill.md')), true);
		});

		test('Skill.md (mixed case) should return true', () => {
			assert.strictEqual(isPromptOrInstructionsFile(URI.file('/workspace/skills/Skill.md')), true);
		});

		test('regular .md files should return false', () => {
			assert.strictEqual(isPromptOrInstructionsFile(URI.file('/workspace/SKILL2.md')), false);
		});

		test('hooks.json should return true', () => {
			assert.strictEqual(isPromptOrInstructionsFile(URI.file('/workspace/.github/hooks/hooks.json')), true);
		});

		test('settings.json in .claude folder should return true', () => {
			assert.strictEqual(isPromptOrInstructionsFile(URI.file('/workspace/.claude/settings.json')), true);
		});

		test('settings.local.json in .claude folder should return true', () => {
			assert.strictEqual(isPromptOrInstructionsFile(URI.file('/workspace/.claude/settings.local.json')), true);
		});

		test('settings.json outside .claude folder should return false', () => {
			assert.strictEqual(isPromptOrInstructionsFile(URI.file('/workspace/settings.json')), false);
		});
	});
});
