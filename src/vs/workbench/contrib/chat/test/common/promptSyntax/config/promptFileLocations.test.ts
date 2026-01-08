/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { getPromptFileType, getCleanPromptName } from '../../../../common/promptSyntax/config/promptFileLocations.js';
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
	});
});
