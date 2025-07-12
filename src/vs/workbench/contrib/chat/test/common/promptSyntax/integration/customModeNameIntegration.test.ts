/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getCleanPromptName } from '../../../config/promptFileLocations.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';

suite('Custom Mode Name Integration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('getCleanPromptName works as fallback', () => {
		// Test the fallback behavior - when no name is provided in metadata
		const uri = URI.file('/path/to/learn.chatmode.md');
		const cleanName = getCleanPromptName(uri);
		assert.strictEqual(cleanName, 'learn');
	});

	test('getCleanPromptName handles different cases', () => {
		// Test various filename patterns
		const testCases = [
			{ input: '/path/to/learn.chatmode.md', expected: 'learn' },
			{ input: '/path/to/plan.chatmode.md', expected: 'plan' },
			{ input: '/path/to/my-custom-mode.chatmode.md', expected: 'my-custom-mode' },
			{ input: '/path/to/UPPERCASE.chatmode.md', expected: 'UPPERCASE' },
		];

		testCases.forEach(({ input, expected }) => {
			const uri = URI.file(input);
			const cleanName = getCleanPromptName(uri);
			assert.strictEqual(cleanName, expected, `Expected '${expected}' for input '${input}' but got '${cleanName}'`);
		});
	});
});