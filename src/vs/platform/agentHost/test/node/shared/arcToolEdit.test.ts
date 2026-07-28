/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractArcTextEdit } from '../../../node/shared/arcToolEdit.js';

suite('Agent Host ARC Tool Edit', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts verified single replacements', () => {
		assert.deepStrictEqual(extractArcTextEdit('Edit', {
			old_string: 'before',
			new_string: 'after',
		}, 'const value = before;', 'const value = after;'), {
			replacements: [{ start: 14, endExclusive: 20, text: 'after' }]
		});
	});

	test('extracts verified full-file writes', () => {
		assert.deepStrictEqual(extractArcTextEdit('Write', {
			content: 'new content',
		}, 'old content', 'new content'), {
			replacements: [{ start: 0, endExclusive: 11, text: 'new content' }]
		});
	});

	test('rejects tool edits that do not reproduce the captured result', () => {
		assert.strictEqual(extractArcTextEdit('Edit', {
			old_string: 'before',
			new_string: 'after',
		}, 'const value = before;', 'formatter changed this'), undefined);
	});
});
