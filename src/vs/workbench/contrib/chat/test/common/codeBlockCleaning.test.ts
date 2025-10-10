/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { stripCommentsForShellExecution } from '../../common/codeBlockCleaning.js';

suite('ChatCodeBlockCleaning', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('removes block comments', () => {
		const input = 'echo 1; /* remove this */\necho 2';
		assert.strictEqual(stripCommentsForShellExecution(input), 'echo 1; \necho 2');
	});

	test('removes line // comments but keeps protocols', () => {
		const input = 'echo 1 // comment\n# full hash comment\nhttp://example.com//still';
		const expected = 'echo 1 \n\nhttp://example.com//still';
		assert.strictEqual(stripCommentsForShellExecution(input), expected);
	});

	test('preserves shebang', () => {
		const input = '#!/usr/bin/env bash\n# comment\necho 1';
		const expected = '#!/usr/bin/env bash\n\necho 1';
		assert.strictEqual(stripCommentsForShellExecution(input), expected);
	});

	test('hash mid-line not preceded by space is preserved', () => {
		const input = 'VAR=foo#bar\necho done';
		assert.strictEqual(stripCommentsForShellExecution(input), 'VAR=foo#bar\necho done');
	});

	test('hash preceded by whitespace becomes comment', () => {
		const input = 'echo 1  # trailing comment';
		assert.strictEqual(stripCommentsForShellExecution(input), 'echo 1');
	});

	test('empty input', () => {
		assert.strictEqual(stripCommentsForShellExecution(''), '');
	});

	test('comment above input', () => {
		const input = '# comment\necho 1';
		const expected = 'echo 1';
		assert.strictEqual(stripCommentsForShellExecution(input), expected);
	});
});
