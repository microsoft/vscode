/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { randomInt } from '../../../../base/common/numbers.js';
import { getCleanPromptName, isPromptOrInstructionsFile } from '../../common/constants.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';


suite('Prompt Constants', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('• getCleanPromptName', () => {
		test('• returns a clean prompt name', () => {
			assert.strictEqual(
				getCleanPromptName(URI.file('/path/to/my-prompt.prompt.md')),
				'my-prompt',
			);

			assert.strictEqual(
				getCleanPromptName(URI.file('../common.prompt.md')),
				'common',
			);

			const expectedPromptName = `some-${randomInt(1000)}`;
			assert.strictEqual(
				getCleanPromptName(URI.file(`./${expectedPromptName}.prompt.md`)),
				expectedPromptName,
			);

			assert.strictEqual(
				getCleanPromptName(URI.file('.github/copilot-instructions.md')),
				'copilot-instructions',
			);

			assert.strictEqual(
				getCleanPromptName(URI.file('/etc/prompts/my-prompt')),
				'my-prompt',
			);

			assert.strictEqual(
				getCleanPromptName(URI.file('../some-folder/frequent.txt')),
				'frequent.txt',
			);

			assert.strictEqual(
				getCleanPromptName(URI.parse('untitled:Untitled-1')),
				'Untitled-1',
			);
		});
	});

	suite('• isPromptOrInstructionsFile', () => {
		test('• returns `true` for prompt files', () => {
			assert(
				isPromptOrInstructionsFile(URI.file('/path/to/my-prompt.prompt.md')),
			);

			assert(
				isPromptOrInstructionsFile(URI.file('../common.prompt.md')),
			);

			assert(
				isPromptOrInstructionsFile(URI.file(`./some-${randomInt(1000)}.prompt.md`)),
			);

			assert(
				isPromptOrInstructionsFile(URI.file('.github/copilot-instructions.md')),
			);
		});

		test('• returns `false` for non-prompt files', () => {
			assert(
				!isPromptOrInstructionsFile(URI.file('/path/to/my-prompt.prompt.md1')),
			);

			assert(
				!isPromptOrInstructionsFile(URI.file('../common.md')),
			);

			assert(
				!isPromptOrInstructionsFile(URI.file(`./some-${randomInt(1000)}.txt`)),
			);
		});
	});
});
