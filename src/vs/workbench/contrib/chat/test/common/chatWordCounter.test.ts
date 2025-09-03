/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getNWords, IWordCountResult } from '../../common/chatWordCounter.js';

suite('ChatWordCounter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function doTest(str: string, nWords: number, resultStr: string) {
		const result = getNWords(str, nWords);
		assert.strictEqual(result.value, resultStr);
		assert.strictEqual(result.returnedWordCount, nWords);
	}

	suite('getNWords', () => {
		test('matching actualWordCount', () => {
			const cases: [string, number, string][] = [
				['hello world', 1, 'hello'],
				['hello', 1, 'hello'],
				['hello world', 0, ''],
				['here\'s, some.   punctuation?', 3, 'here\'s, some.   punctuation?'],
				['| markdown | _table_ | header |', 3, '| markdown | _table_ | header |'],
				['| --- | --- | --- |', 1, '| ---'],
				['| --- | --- | --- |', 3, '| --- | --- | --- |'],
				[' \t some \n whitespace     \n\n\nhere   ', 3, ' \t some \n whitespace     \n\n\nhere   '],
			];

			cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
		});

		test('whitespace', () => {
			assert.deepStrictEqual(
				getNWords('hello ', 1),
				{
					value: 'hello ',
					returnedWordCount: 1,
					isFullString: true,
					totalWordCount: 1,
				} satisfies IWordCountResult);
			assert.deepStrictEqual(
				getNWords('hello\n\n', 1),
				{
					value: 'hello\n\n',
					returnedWordCount: 1,
					isFullString: true,
					totalWordCount: 1,
				} satisfies IWordCountResult);
			assert.deepStrictEqual(
				getNWords('\nhello', 1),
				{
					value: '\nhello',
					returnedWordCount: 1,
					isFullString: true,
					totalWordCount: 1,
				} satisfies IWordCountResult);
		});

		test('matching links', () => {
			const cases: [string, number, string][] = [
				['[hello](https://example.com) world', 1, '[hello](https://example.com)'],
				['[hello](https://example.com) world', 2, '[hello](https://example.com) world'],
				['oh [hello](https://example.com "title") world', 1, 'oh'],
				['oh [hello](https://example.com "title") world', 2, 'oh [hello](https://example.com "title")'],
				// Parens in link destination
				['[hello](https://example.com?()) world', 1, '[hello](https://example.com?())'],
				// Escaped brackets in link text
				['[he \\[l\\] \\]lo](https://example.com?()) world', 1, '[he \\[l\\] \\]lo](https://example.com?())'],
			];

			cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
		});

		test('code', () => {
			const cases: [string, number, string][] = [
				['let a=1-2', 2, 'let a'],
				['let a=1-2', 3, 'let a='],
				['let a=1-2', 4, 'let a=1'],
				['const myVar = 1+2', 4, 'const myVar = 1'],
				['<div id="myDiv"></div>', 3, '<div id='],
				['<div id="myDiv"></div>', 4, '<div id="myDiv"></div>'],
			];

			cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
		});

		test('codeblocks', () => {
			const cases: [string, number, string][] = [
				['hello\n\n```\n```\n\nworld foo', 2, 'hello\n\n```\n```\n\nworld'],
			];

			cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
		});

		test('chinese characters', () => {
			const cases: [string, number, string][] = [
				['我喜欢中国菜', 3, '我喜欢'],
			];

			cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
		});

		test(`Inline math shouldn't be broken up`, () => {
			const cases: [string, number, string][] = [
				['a $x + y$ b', 3, 'a $x + y$ b'],
				['a $\\frac{1}{2} + \\sqrt{x^2 + y^2}$ b', 3, 'a $\\frac{1}{2} + \\sqrt{x^2 + y^2}$ b'],
			];

			cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
		});
	});
});
