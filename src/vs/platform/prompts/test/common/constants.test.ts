/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { randomInt } from '../../../../base/common/numbers.js';
import { getCleanPromptName, isPromptFile } from '../../common/constants.js';
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
		});

		test('• throws if not a prompt file URI provided', () => {
			assert.throws(() => {
				getCleanPromptName(URI.file('/path/to/default.prompt.md1'));
			});

			assert.throws(() => {
				getCleanPromptName(URI.file('./some.md'));
			});


			assert.throws(() => {
				getCleanPromptName(URI.file('../some-folder/frequent.txt'));
			});

			assert.throws(() => {
				getCleanPromptName(URI.file('/etc/prompts/my-prompt'));
			});
		});
	});

	suite('• isPromptFile', () => {
		test('• returns `true` for prompt files', () => {
			assert(
				isPromptFile(URI.file('/path/to/my-prompt.prompt.md')),
			);

			assert(
				isPromptFile(URI.file('../common.prompt.md')),
			);

			assert(
				isPromptFile(URI.file(`./some-${randomInt(1000)}.prompt.md`)),
			);

			assert(
				isPromptFile(URI.file('.github/copilot-instructions.md')),
			);
		});

		test('• returns `false` for non-prompt files', () => {
			assert(
				!isPromptFile(URI.file('/path/to/my-prompt.prompt.md1')),
			);

			assert(
				!isPromptFile(URI.file('../common.md')),
			);

			assert(
				!isPromptFile(URI.file(`./some-${randomInt(1000)}.txt`)),
			);
		});
	});
});
