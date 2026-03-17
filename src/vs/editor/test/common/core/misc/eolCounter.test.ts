/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { countEOL, StringEOL } from '../../../../common/core/misc/eolCounter.js';

suite('eolCounter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty string', () => {
		const [eolCount, firstLineLength, lastLineLength, eol] = countEOL('');
		assert.strictEqual(eolCount, 0);
		assert.strictEqual(firstLineLength, 0);
		assert.strictEqual(lastLineLength, 0);
		assert.strictEqual(eol, StringEOL.Unknown);
	});

	test('single line', () => {
		const [eolCount, firstLineLength, lastLineLength, eol] = countEOL('hello');
		assert.strictEqual(eolCount, 0);
		assert.strictEqual(firstLineLength, 5);
		assert.strictEqual(lastLineLength, 5);
		assert.strictEqual(eol, StringEOL.Unknown);
	});

	test('LF line endings', () => {
		const [eolCount, , , eol] = countEOL('line1\nline2\nline3');
		assert.strictEqual(eolCount, 2);
		assert.strictEqual(eol, StringEOL.LF);
	});

	test('CRLF line endings', () => {
		const [eolCount, , , eol] = countEOL('line1\r\nline2\r\nline3');
		assert.strictEqual(eolCount, 2);
		assert.strictEqual(eol, StringEOL.CRLF);
	});

	test('CR line endings', () => {
		const [eolCount, firstLineLength, lastLineLength, eol] = countEOL('line1\rline2\rline3');
		assert.strictEqual(eolCount, 2);
		assert.strictEqual(firstLineLength, 5);
		assert.strictEqual(lastLineLength, 5);
		assert.strictEqual(eol, StringEOL.CR);
	});

	test('mixed CR and LF', () => {
		const [eolCount, , , eol] = countEOL('line1\rline2\nline3');
		assert.strictEqual(eolCount, 2);
		// CR | LF = 3 | 1 = 3 (both bits set)
		assert.strictEqual(eol & StringEOL.CR, StringEOL.CR);
		assert.strictEqual(eol & StringEOL.LF, StringEOL.LF);
	});

	test('mixed CR and CRLF', () => {
		const [eolCount, , , eol] = countEOL('line1\rline2\r\nline3');
		assert.strictEqual(eolCount, 2);
		assert.strictEqual(eol & StringEOL.CR, StringEOL.CR);
		assert.strictEqual(eol & StringEOL.CRLF, StringEOL.CRLF);
	});

	test('CR at end of string', () => {
		const [eolCount, , lastLineLength, eol] = countEOL('line1\r');
		assert.strictEqual(eolCount, 1);
		assert.strictEqual(lastLineLength, 0);
		assert.strictEqual(eol, StringEOL.CR);
	});
});
