/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { unicodeEscapesToPCRE2, fixRegexEndingPattern, fixRegexCRMatchingWhitespaceClass, fixRegexCRMatchingNonWordClass, fixRegexNewline } from 'vs/workbench/services/search/node/ripgrepTextSearchEngine';

suite('RipgrepTextSearchEngine', () => {
	test('unicodeEscapesToPCRE2', async () => {
		assert.equal(unicodeEscapesToPCRE2('\\u1234'), '\\x{1234}');
		assert.equal(unicodeEscapesToPCRE2('\\u1234\\u0001'), '\\x{1234}\\x{0001}');
		assert.equal(unicodeEscapesToPCRE2('foo\\u1234bar'), 'foo\\x{1234}bar');
		assert.equal(unicodeEscapesToPCRE2('\\\\\\u1234'), '\\\\\\x{1234}');
		assert.equal(unicodeEscapesToPCRE2('foo\\\\\\u1234'), 'foo\\\\\\x{1234}');

		assert.equal(unicodeEscapesToPCRE2('\\u123'), '\\u123');
		assert.equal(unicodeEscapesToPCRE2('\\u12345'), '\\u12345');
		assert.equal(unicodeEscapesToPCRE2('\\\\u12345'), '\\\\u12345');
		assert.equal(unicodeEscapesToPCRE2('foo'), 'foo');
		assert.equal(unicodeEscapesToPCRE2(''), '');
	});

	test('fixRegexEndingPattern', () => {
		function testFixRegexEndingPattern([input, expectedResult]: string[]): void {
			assert.equal(fixRegexEndingPattern(input), expectedResult);
		}

		[
			['foo', 'foo'],
			['', ''],
			['^foo.*bar\\s+', '^foo.*bar\\s+'],
			['foo$', 'foo\\r?$'],
			['$', '\\r?$'],
			['foo\\$', 'foo\\$'],
			['foo\\\\$', 'foo\\\\\\r?$'],
		].forEach(testFixRegexEndingPattern);
	});

	test('fixRegexCRMatchingWhitespaceClass', () => {
		function testFixRegexCRMatchingWhitespaceClass([inputReg, isMultiline, testStr, shouldMatch]): void {
			const fixed = fixRegexCRMatchingWhitespaceClass(inputReg, isMultiline);
			const reg = new RegExp(fixed);
			assert.equal(reg.test(testStr), shouldMatch, `${inputReg} => ${reg}, ${testStr}, ${shouldMatch}`);
		}

		[
			['foo', false, 'foo', true],

			['foo\\s', false, 'foo\r\n', false],
			['foo\\sabc', true, 'foo\r\nabc', true],

			['foo\\s', false, 'foo\n', false],
			['foo\\s', true, 'foo\n', true],

			['foo\\s\\n', true, 'foo\r\n', false],
			['foo\\r\\s', true, 'foo\r\n', true],

			['foo\\s+abc', true, 'foo   \r\nabc', true],
			['foo\\s+abc', false, 'foo   \t   abc', true],
		].forEach(testFixRegexCRMatchingWhitespaceClass);
	});

	test('fixRegexCRMatchingNonWordClass', () => {
		function testRegexCRMatchingNonWordClass([inputReg, isMultiline, testStr, shouldMatch]): void {
			const fixed = fixRegexCRMatchingNonWordClass(inputReg, isMultiline);
			const reg = new RegExp(fixed);
			assert.equal(reg.test(testStr), shouldMatch, `${inputReg} => ${reg}, ${testStr}, ${shouldMatch}`);
		}

		[
			['foo', false, 'foo', true],

			['foo\\W', false, 'foo\r\n', false],
			['foo\\Wabc', true, 'foo\r\nabc', true],

			['foo\\W', false, 'foo\n', true],
			['foo\\W', true, 'foo\n', true],

			['foo\\W\\n', true, 'foo\r\n', false],
			['foo\\r\\W', true, 'foo\r\n', true],

			['foo\\W+abc', true, 'foo   \r\nabc', true],
			['foo\\W+abc', false, 'foo .-\t   abc', true],
		].forEach(testRegexCRMatchingNonWordClass);
	});

	test('fixRegexNewline', () => {
		function testFixRegexNewline([inputReg, testStr, shouldMatch]): void {
			const fixed = fixRegexNewline(inputReg);
			const reg = new RegExp(fixed);
			assert.equal(reg.test(testStr), shouldMatch, `${inputReg} => ${reg}, ${testStr}, ${shouldMatch}`);
		}

		[
			['foo', 'foo', true],

			['foo\\n', 'foo\r\n', true],
			['foo\\n', 'foo\n', true],
			['foo\\nabc', 'foo\r\nabc', true],
			['foo\\nabc', 'foo\nabc', true],
			['foo\\r\\n', 'foo\r\n', true],

			['foo\\n+abc', 'foo\r\nabc', true],
			['foo\\n+abc', 'foo\n\n\nabc', true],
		].forEach(testFixRegexNewline);
	});
});
