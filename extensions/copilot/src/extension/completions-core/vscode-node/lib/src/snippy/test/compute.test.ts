/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as SnippyCompute from '../../../../../../../platform/snippy/common/snippyCompute';

const testMatchSource =
	'function calculateDaysBetweenDates(begin, end) {\n    var oneDay = 24*60*60*1000; // hours*minutes*seconds*milliseconds\n    var firstDate = new Date(begin);\n    var secondDate = new Date(end);\n\n    return Math.round(Math.abs((firstDate.getTime() - secondDate.getTime())/(oneDay)));\n}';

suite('Compute', () => {
	const testCases = [
		{ input: 'const', expected: 1 },
		{ input: 'const foo = "bar";', expected: 7 },
		{ input: ' \t\r\n', expected: 0 },
		{ input: 'long_identifier'.repeat(110), expected: 1 },
		{ input: '==== ---- #### //// ****', expected: 5 },
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
			expected: 90,
		},
	];

	test('lexemeLength returns the number of lexemes in a given string', () => {
		for (const { input, expected } of testCases) {
			assert.strictEqual(SnippyCompute.lexemeLength(input), expected);
		}
	});

	test('lexemeLength stops counting at the 110-lexeme Match minimum', () => {
		assert.strictEqual(SnippyCompute.lexemeLength(testMatchSource.repeat(2)), 110);
	});

	for (const { count, length, hasMinimum } of [
		{ count: 0, length: 0, hasMinimum: false },
		{ count: 64, length: 64, hasMinimum: false },
		{ count: 65, length: 65, hasMinimum: false },
		{ count: 109, length: 109, hasMinimum: false },
		{ count: 110, length: 110, hasMinimum: true },
		{ count: 111, length: 110, hasMinimum: true },
	]) {
		test(`checks the Match minimum for ${count} lexemes`, () => {
			const source = 'token '.repeat(count);
			assert.deepStrictEqual({
				length: SnippyCompute.lexemeLength(source),
				hasMinimum: SnippyCompute.hasMinLexemeLength(source),
			}, { length, hasMinimum });
		});
	}

	test('does not retain regex state between minimum-length checks', () => {
		assert.deepStrictEqual([
			SnippyCompute.hasMinLexemeLength(testMatchSource.repeat(2)),
			SnippyCompute.hasMinLexemeLength(testMatchSource.repeat(2)),
			SnippyCompute.hasMinLexemeLength(testMatchSource),
		], [true, true, false]);
	});

	test('takes 110 preceding lexemes when extending a short completion', () => {
		const precedingContext = 'prefix '.repeat(110);
		const source = 'ignored '.repeat(45) + precedingContext;
		const offset = SnippyCompute.offsetLastLexemes(source, SnippyCompute.MinTokenLength);
		assert.strictEqual(source.slice(offset), precedingContext);
	});

	test('keeps all preceding context when fewer than 110 lexemes are available', () => {
		assert.strictEqual(SnippyCompute.offsetLastLexemes('prefix '.repeat(109), SnippyCompute.MinTokenLength), 0);
	});
});
