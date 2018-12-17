/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/workbench/services/search/node/ripgrepSearchUtils';
import { fixRegexCRMatchingNonWordClass, fixRegexCRMatchingWhitespaceClass, fixRegexEndingPattern, fixRegexNewline, IRgMatch, IRgMessage, RipgrepParser, unicodeEscapesToPCRE2, fixNewline } from 'vs/workbench/services/search/node/ripgrepTextSearchEngine';
import { TextSearchResult } from 'vscode';

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

	test('fixNewline', () => {
		function testFixNewline([inputReg, testStr, shouldMatch = true]): void {
			const fixed = fixNewline(inputReg);
			const reg = new RegExp(fixed);
			assert.equal(reg.test(testStr), shouldMatch, `${inputReg} => ${reg}, ${testStr}, ${shouldMatch}`);
		}

		[
			['foo', 'foo'],

			['foo\n', 'foo\r\n'],
			['foo\n', 'foo\n'],
			['foo\nabc', 'foo\r\nabc'],
			['foo\nabc', 'foo\nabc'],
			['foo\r\n', 'foo\r\n'],

			['foo\nbarc', 'foobar', false],
			['foobar', 'foo\nbar', false],
		].forEach(testFixNewline);
	});

	suite('RipgrepParser', () => {
		const TEST_FOLDER = URI.file('/foo/bar');

		function testParser(inputData: string[], expectedResults: TextSearchResult[]): void {
			const testParser = new RipgrepParser(1000, TEST_FOLDER.fsPath);

			const actualResults: TextSearchResult[] = [];
			testParser.on('result', r => {
				actualResults.push(r);
			});

			inputData.forEach(d => testParser.handleData(d));
			testParser.flush();

			assert.deepEqual(actualResults, expectedResults);
		}

		function makeRgMatch(relativePath: string, text: string, lineNumber: number, matchRanges: { start: number, end: number }[]): string {
			return JSON.stringify(<IRgMessage>{
				type: 'match',
				data: <IRgMatch>{
					path: {
						text: relativePath
					},
					lines: {
						text
					},
					line_number: lineNumber,
					absolute_offset: 0, // unused
					submatches: matchRanges.map(mr => {
						return {
							...mr,
							match: { text: text.substring(mr.start, mr.end) }
						};
					})
				}
			}) + '\n';
		}

		test('single result', () => {
			testParser(
				[
					makeRgMatch('file1.js', 'foobar', 4, [{ start: 3, end: 6 }])
				],
				[
					{
						preview: {
							text: 'foobar',
							matches: [new Range(0, 3, 0, 6)]
						},
						uri: joinPath(TEST_FOLDER, 'file1.js'),
						ranges: [new Range(3, 3, 3, 6)]
					}
				]);
		});

		test('multiple results', () => {
			testParser(
				[
					makeRgMatch('file1.js', 'foobar', 4, [{ start: 3, end: 6 }]),
					makeRgMatch('app/file2.js', 'foobar', 4, [{ start: 3, end: 6 }]),
					makeRgMatch('app2/file3.js', 'foobar', 4, [{ start: 3, end: 6 }]),
				],
				[
					{
						preview: {
							text: 'foobar',
							matches: [new Range(0, 3, 0, 6)]
						},
						uri: joinPath(TEST_FOLDER, 'file1.js'),
						ranges: [new Range(3, 3, 3, 6)]
					},
					{
						preview: {
							text: 'foobar',
							matches: [new Range(0, 3, 0, 6)]
						},
						uri: joinPath(TEST_FOLDER, 'app/file2.js'),
						ranges: [new Range(3, 3, 3, 6)]
					},
					{
						preview: {
							text: 'foobar',
							matches: [new Range(0, 3, 0, 6)]
						},
						uri: joinPath(TEST_FOLDER, 'app2/file3.js'),
						ranges: [new Range(3, 3, 3, 6)]
					}
				]);
		});

		test('chopped-up input chunks', () => {
			const dataStrs = [
				makeRgMatch('file1.js', 'foobar', 4, [{ start: 3, end: 6 }]),
				makeRgMatch('app/file2.js', 'foobar', 4, [{ start: 3, end: 6 }]),
				makeRgMatch('app2/file3.js', 'foobar', 4, [{ start: 3, end: 6 }]),
			];

			testParser(
				[
					dataStrs[0].substring(0, 5),
					dataStrs[0].substring(5),
					'\n',
					dataStrs[1].trim(),
					'\n' + dataStrs[2].substring(0, 25),
					dataStrs[2].substring(25)
				],
				[
					{
						preview: {
							text: 'foobar',
							matches: [new Range(0, 3, 0, 6)]
						},
						uri: joinPath(TEST_FOLDER, 'file1.js'),
						ranges: [new Range(3, 3, 3, 6)]
					},
					{
						preview: {
							text: 'foobar',
							matches: [new Range(0, 3, 0, 6)]
						},
						uri: joinPath(TEST_FOLDER, 'app/file2.js'),
						ranges: [new Range(3, 3, 3, 6)]
					},
					{
						preview: {
							text: 'foobar',
							matches: [new Range(0, 3, 0, 6)]
						},
						uri: joinPath(TEST_FOLDER, 'app2/file3.js'),
						ranges: [new Range(3, 3, 3, 6)]
					}
				]);
		});
	});
});
