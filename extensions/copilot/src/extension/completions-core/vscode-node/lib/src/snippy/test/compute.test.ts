/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as SnippyCompute from '../../snippy/compute';

const testMatchSource =
	'function calculateDaysBetweenDates(begin, end) {\n    var oneDay = 24*60*60*1000; // hours*minutes*seconds*milliseconds\n    var firstDate = new Date(begin);\n    var secondDate = new Date(end);\n\n    return Math.round(Math.abs((firstDate.getTime() - secondDate.getTime())/(oneDay)));\n}';

suite('Compute', function () {
	const testCases = [
		{ input: 'const', expected: 1 },
		{ input: 'const foo = "bar";', expected: 7 },
		{
			input: `for (var i = 1; i <= 100; i++) {
                if (i % 15 == 0) {
                    console.log("FizzBuzz");
                } else if (i % 3 == 0) {
                    console.log("Fizz");
                } else if (i % 5 == 0) {
                    console.log("Buzz");
                } else {
                    console.log(i);
                }
                }`,
			expected: 65,
		},
	];

	test('lexemeLength returns the number of lexemes in a given string', function () {
		for (const { input, expected } of testCases) {
			assert.strictEqual(SnippyCompute.lexemeLength(input), expected);
		}
	});

	test(`lexemeLength returns at most ${SnippyCompute.MinTokenLength} lexemes`, function () {
		assert.strictEqual(SnippyCompute.lexemeLength(testMatchSource), SnippyCompute.MinTokenLength);
	});

	test(`hasMinLexemeLength returns true if the string has at least ${SnippyCompute.MinTokenLength} lexemes`, function () {
		assert.strictEqual(SnippyCompute.hasMinLexemeLength(testMatchSource), true);
		assert.strictEqual(SnippyCompute.hasMinLexemeLength(`const foo = 'test'`), false);
	});
});
