/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createArcTextEditFromDiff, extractArcTextEdit } from '../../../node/shared/arcToolEdit.js';

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

	test('creates verified ARC edits from existing diff changes', () => {
		assert.deepStrictEqual(createArcTextEditFromDiff([{
			startOffset: 6,
			endOffsetExclusive: 12,
			newText: 'after',
		}], 'value=before', 'value=after'), {
			replacements: [{ start: 6, endExclusive: 12, text: 'after' }]
		});
	});

	test('falls back to a full replacement when diff changes do not reconstruct the result', () => {
		assert.deepStrictEqual(createArcTextEditFromDiff([], 'first\r\nsecond', 'first\nsecond'), {
			replacements: [{ start: 0, endExclusive: 13, text: 'first\nsecond' }]
		});
	});
});
