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
		// CR=4, LF=1: CR | LF = 5 (distinct bits)
		assert.strictEqual(eol, StringEOL.CR | StringEOL.LF);
		assert.strictEqual(eol & StringEOL.CR, StringEOL.CR);
		assert.strictEqual(eol & StringEOL.LF, StringEOL.LF);
		assert.strictEqual(eol & StringEOL.CRLF, 0);
	});

	test('mixed CR and CRLF', () => {
		const [eolCount, , , eol] = countEOL('line1\rline2\r\nline3');
		assert.strictEqual(eolCount, 2);
		// CR=4, CRLF=2: CR | CRLF = 6 (distinct bits)
		assert.strictEqual(eol, StringEOL.CR | StringEOL.CRLF);
		assert.strictEqual(eol & StringEOL.CR, StringEOL.CR);
		assert.strictEqual(eol & StringEOL.CRLF, StringEOL.CRLF);
		assert.strictEqual(eol & StringEOL.LF, 0);
	});

	test('mixed LF and CRLF', () => {
		const [eolCount, , , eol] = countEOL('line1\nline2\r\nline3');
		assert.strictEqual(eolCount, 2);
		// LF=1, CRLF=2: LF | CRLF = 3 (distinct from CR=4)
		assert.strictEqual(eol, StringEOL.LF | StringEOL.CRLF);
		assert.strictEqual(eol & StringEOL.LF, StringEOL.LF);
		assert.strictEqual(eol & StringEOL.CRLF, StringEOL.CRLF);
		assert.strictEqual(eol & StringEOL.CR, 0);
	});

	test('CR at end of string', () => {
		const [eolCount, , lastLineLength, eol] = countEOL('line1\r');
		assert.strictEqual(eolCount, 1);
		assert.strictEqual(lastLineLength, 0);
		assert.strictEqual(eol, StringEOL.CR);
	});
});
