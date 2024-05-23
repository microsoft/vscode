/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { getNWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';

suite('ChatWordCounter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function doTest(str: string, nWords: number, resultStr: string) {
		const result = getNWords(str, nWords);
		assert.strictEqual(result.value, resultStr);
		assert.strictEqual(result.actualWordCount, nWords);
	}

	test('getNWords, matching actualWordCount', () => {
		const cases: [string, number, string][] = [
			['hello world', 1, 'hello'],
			['hello', 1, 'hello'],
			['hello world', 0, ''],
			['here\'s, some.   punctuation?', 3, 'here\'s, some.   punctuation?'],
			['| markdown | _table_ | header |', 3, '| markdown | _table_ | header'],
			['| --- | --- | --- |', 1, '| --- | --- | --- |'],
			[' \t some \n whitespace     \n\n\nhere   ', 3, ' \t some \n whitespace     \n\n\nhere'],
		];

		cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
	});

	test('getNWords, matching links', () => {
		const cases: [string, number, string][] = [
			['[hello](https://example.com) world', 1, '[hello](https://example.com)'],
			['[hello](https://example.com) world', 2, '[hello](https://example.com) world'],
			['oh [hello](https://example.com "title") world', 1, 'oh'],
			['oh [hello](https://example.com "title") world', 2, 'oh [hello](https://example.com "title")'],
		];

		cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
	});
});
