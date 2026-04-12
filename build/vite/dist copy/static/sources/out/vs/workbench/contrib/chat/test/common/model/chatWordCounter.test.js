/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getNWords } from '../../../common/model/chatWordCounter.js';
suite('ChatWordCounter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function doTest(str, nWords, resultStr) {
        const result = getNWords(str, nWords);
        assert.strictEqual(result.value, resultStr);
        assert.strictEqual(result.returnedWordCount, nWords);
    }
    suite('getNWords', () => {
        test('matching actualWordCount', () => {
            const cases = [
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
            assert.deepStrictEqual(getNWords('hello ', 1), {
                value: 'hello ',
                returnedWordCount: 1,
                isFullString: true,
                totalWordCount: 1,
            });
            assert.deepStrictEqual(getNWords('hello\n\n', 1), {
                value: 'hello\n\n',
                returnedWordCount: 1,
                isFullString: true,
                totalWordCount: 1,
            });
            assert.deepStrictEqual(getNWords('\nhello', 1), {
                value: '\nhello',
                returnedWordCount: 1,
                isFullString: true,
                totalWordCount: 1,
            });
        });
        test('matching links', () => {
            const cases = [
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
            const cases = [
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
            const cases = [
                ['hello\n\n```\n```\n\nworld foo', 2, 'hello\n\n```\n```\n\nworld'],
            ];
            cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
        });
        test('chinese characters', () => {
            const cases = [
                ['我喜欢中国菜', 3, '我喜欢'],
            ];
            cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
        });
        test(`Inline math shouldn't be broken up`, () => {
            const cases = [
                ['a $x + y$ b', 3, 'a $x + y$ b'],
                ['a $\\frac{1}{2} + \\sqrt{x^2 + y^2}$ b', 3, 'a $\\frac{1}{2} + \\sqrt{x^2 + y^2}$ b'],
            ];
            cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFdvcmRDb3VudGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL21vZGVsL2NoYXRXb3JkQ291bnRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsU0FBUyxFQUFvQixNQUFNLDBDQUEwQyxDQUFDO0FBRXZGLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7SUFDN0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLE1BQU0sQ0FBQyxHQUFXLEVBQUUsTUFBYyxFQUFFLFNBQWlCO1FBQzdELE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDdEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtRQUN2QixJQUFJLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO1lBQ3JDLE1BQU0sS0FBSyxHQUErQjtnQkFDekMsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxFQUFFLE9BQU8sQ0FBQztnQkFDM0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE9BQU8sQ0FBQztnQkFDckIsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDdEIsQ0FBQywrQkFBK0IsRUFBRSxDQUFDLEVBQUUsK0JBQStC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