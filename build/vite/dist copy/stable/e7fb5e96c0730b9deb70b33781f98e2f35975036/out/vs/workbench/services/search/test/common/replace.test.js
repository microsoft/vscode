/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ReplacePattern } from '../../common/replace.js';
suite('Replace Pattern test', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('parse replace string', () => {
        const testParse = (input, expected, expectedHasParameters) => {
            let actual = new ReplacePattern(input, { pattern: 'somepattern', isRegExp: true });
            assert.strictEqual(expected, actual.pattern);
            assert.strictEqual(expectedHasParameters, actual.hasParameters);
            actual = new ReplacePattern('hello' + input + 'hi', { pattern: 'sonepattern', isRegExp: true });
            assert.strictEqual('hello' + expected + 'hi', actual.pattern);
            assert.strictEqual(expectedHasParameters, actual.hasParameters);
        };
        // no backslash => no treatment
        testParse('hello', 'hello', false);
        // \t => TAB
        testParse('\\thello', '\thello', false);
        // \n => LF
        testParse('\\nhello', '\nhello', false);
        // \\t => \t
        testParse('\\\\thello', '\\thello', false);
        // \\\t => \TAB
        testParse('\\\\\\thello', '\\\thello', false);
        // \\\\t => \\t
        testParse('\\\\\\\\thello', '\\\\thello', false);
        // \ at the end => no treatment
        testParse('hello\\', 'hello\\', false);
        // \ with unknown char => no treatment
        testParse('hello\\x', 'hello\\x', false);
        // \ with back reference => no treatment
        testParse('hello\\0', 'hello\\0', false);
        // $1 => no treatment
        testParse('hello$1', 'hello$1', true);
        // $2 => no treatment
        testParse('hello$2', 'hello$2', true);
        // $12 => no treatment
        testParse('hello$12', 'hello$12', true);
        // $99 => no treatment
        testParse('hello$99', 'hello$99', true);
        // $99a => no treatment
        testParse('hello$99a', 'hello$99a', true);
        // $100 => no treatment
        testParse('hello$100', 'hello$100', false);
        // $100a => no treatment
        testParse('hello$100a', 'hello$100a', false);
        // $10a0 => no treatment
        testParse('hello$10a0', 'hello$10a0', true);
        // $$ => no treatment
        testParse('hello$$', 'hello$$', false);
        // $$0 => no treatment
        testParse('hello$$0', 'hello$$0', false);
        // $0 => $&
        testParse('hello$0', 'hello$&', true);
        testParse('hello$02', 'hello$&2', true);
        testParse('hello$`', 'hello$`', true);
        testParse('hello$\'', 'hello$\'', true);
    });
    test('create pattern by passing regExp', () => {
        let expected = /abc/;
        let actual = new ReplacePattern('hello', false, expected).regExp;
        assert.deepStrictEqual(actual, expected);
        expected = /abc/;
        actual = new ReplacePattern('hello', false, /abc/g).regExp;
        assert.deepStrictEqual(actual, expected);
        let testObject = new ReplacePattern('hello$0', false, /abc/g);
        assert.strictEqual(testObject.hasParameters, false);
        testObject = new ReplacePattern('hello$0', true, /abc/g);
        assert.strictEqual(testObject.hasParameters, true);
    });
    test('get replace string if given text is a complete match', () => {
        let testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: true });
        let actual = testObject.getReplaceString('bla');
        assert.strictEqual(actual, 'hello');
        testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: false });
        actual = testObject.getReplaceString('bla');
        assert.strictEqual(actual, 'hello');
        testObject = new ReplacePattern('hello', { pattern: '(bla)', isRegExp: true });
        actual = testObject.getReplaceString('bla');
        assert.strictEqual(actual, 'hello');
        testObject = new ReplacePattern('hello$0', { pattern: '(bla)', isRegExp: true });
        actual = testObject.getReplaceString('bla');
        assert.strictEqual(actual, 'hellobla');
        testObject = new ReplacePattern('import * as $1 from \'$2\';', { pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true });
        actual = testObject.getReplaceString('let fs = require(\'fs\')');
        assert.strictEqual(actual, 'import * as fs from \'fs\';');
        actual = testObject.getReplaceString('let something = require(\'fs\')');
        assert.strictEqual(actual, 'import * as something from \'fs\';');
        actual = testObject.getReplaceString('let require(\'fs\')');
        assert.strictEqual(actual, null);
        testObject = new ReplacePattern('import * as $1 from \'$1\';', { pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true });
        actual = testObject.getReplaceString('let something = require(\'fs\')');
        assert.strictEqual(actual, 'import * as something from \'something\';');
        testObject = new ReplacePattern('import * as $2 from \'$1\';', { pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true });
        actual = testObject.getReplaceString('let something = require(\'fs\')');
        assert.strictEqual(actual, 'import * as fs from \'something\';');
        testObject = new ReplacePattern('import * as $0 from \'$0\';', { pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true });
        actual = testObject.getReplaceString('let something = require(\'fs\');');
        assert.strictEqual(actual, 'import * as let something = require(\'fs\') from \'let something = require(\'fs\')\';');
        testObject = new ReplacePattern('import * as $1 from \'$2\';', { pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: false });
        actual = testObject.getReplaceString('let fs = require(\'fs\');');
        assert.strictEqual(actual, null);
        testObject = new ReplacePattern('cat$1', { pattern: 'for(.*)', isRegExp: true });
        actual = testObject.getReplaceString('for ()');
        assert.strictEqual(actual, 'cat ()');
    });
    test('case operations', () => {
        const testObject = new ReplacePattern('a\\u$1l\\u\\l\\U$2M$3n', { pattern: 'a(l)l(good)m(e)n', isRegExp: true });
        const actual = testObject.getReplaceString('allgoodmen');
        assert.strictEqual(actual, 'aLlGoODMen');
    });
    test('case operations - no false positive', () => {
        let testObject = new ReplacePattern('\\left $1', { pattern: '(pattern)', isRegExp: true });
        let actual = testObject.getReplaceString('pattern');
        assert.strictEqual(actual, '\\left pattern');
        testObject = new ReplacePattern('\\hi \\left $1', { pattern: '(pattern)', isRegExp: true });
        actual = testObject.getReplaceString('pattern');
        assert.strictEqual(actual, '\\hi \\left pattern');
        testObject = new ReplacePattern('\\left \\L$1', { pattern: 'PATT(ERN)', isRegExp: true });
        actual = testObject.getReplaceString('PATTERN');
        assert.strictEqual(actual, '\\left ern');
    });
    test('case operations and newline', () => {
        const testObject = new ReplacePattern('$1\n\\U$2', { pattern: '(multi)(line)', isRegExp: true });
        const actual = testObject.getReplaceString('multiline');
        assert.strictEqual(actual, 'multi\nLINE');
    });
    test('get replace string for no matches', () => {
        let testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: true });
        let actual = testObject.getReplaceString('foo');
        assert.strictEqual(actual, null);
        testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: false });
        actual = testObject.getReplaceString('foo');
        assert.strictEqual(actual, null);
    });
    test('get replace string if match is sub-string of the text', () => {
        let testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: true });
        let actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'hello');
        testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: false });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'hello');
        testObject = new ReplacePattern('that', { pattern: 'this(?=.*bla)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'that');
        testObject = new ReplacePattern('$1at', { pattern: '(th)is(?=.*bla)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'that');
        testObject = new ReplacePattern('$1e', { pattern: '(th)is(?=.*bla)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'the');
        testObject = new ReplacePattern('$1ere', { pattern: '(th)is(?=.*bla)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'there');
        testObject = new ReplacePattern('$1', { pattern: '(th)is(?=.*bla)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'th');
        testObject = new ReplacePattern('ma$1', { pattern: '(th)is(?=.*bla)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'math');
        testObject = new ReplacePattern('ma$1s', { pattern: '(th)is(?=.*bla)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'maths');
        testObject = new ReplacePattern('ma$1s', { pattern: '(th)is(?=.*bla)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'maths');
        testObject = new ReplacePattern('$0', { pattern: '(th)is(?=.*bla)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'this');
        testObject = new ReplacePattern('$0$1', { pattern: '(th)is(?=.*bla)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'thisth');
        testObject = new ReplacePattern('foo', { pattern: 'bla(?=\\stext$)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'foo');
        testObject = new ReplacePattern('f$1', { pattern: 'b(la)(?=\\stext$)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'fla');
        testObject = new ReplacePattern('f$0', { pattern: 'b(la)(?=\\stext$)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'fbla');
        testObject = new ReplacePattern('$0ah', { pattern: 'b(la)(?=\\stext$)', isRegExp: true });
        actual = testObject.getReplaceString('this is a bla text');
        assert.strictEqual(actual, 'blaah');
        testObject = new ReplacePattern('newrege$1', true, /Testrege(\w*)/);
        actual = testObject.getReplaceString('Testregex', true);
        assert.strictEqual(actual, 'Newregex');
        testObject = new ReplacePattern('newrege$1', true, /TESTREGE(\w*)/);
        actual = testObject.getReplaceString('TESTREGEX', true);
        assert.strictEqual(actual, 'NEWREGEX');
        testObject = new ReplacePattern('new_rege$1', true, /Test_Rege(\w*)/);
        actual = testObject.getReplaceString('Test_Regex', true);
        assert.strictEqual(actual, 'New_Regex');
        testObject = new ReplacePattern('new-rege$1', true, /Test-Rege(\w*)/);
        actual = testObject.getReplaceString('Test-Regex', true);
        assert.strictEqual(actual, 'New-Regex');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbGFjZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC90ZXN0L2NvbW1vbi9yZXBsYWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUV6RCxLQUFLLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO0lBQ2xDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtRQUNqQyxNQUFNLFNBQVMsR0FBRyxDQUFDLEtBQWEsRUFBRSxRQUFnQixFQUFFLHFCQUE4QixFQUFFLEVBQUU7WUFDckYsSUFBSSxNQUFNLEdBQUcsSUFBSSxjQUFjLENBQUMsS0FBSyxFQUFFLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNuRixNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsRUFBRSxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7WUFFaEUsTUFBTSxHQUFHLElBQUksY0FBYyxDQUFDLE9BQU8sR0FBRyxLQUFLLEdBQUcsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNoRyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sR0FBRyxRQUFRLEdBQUcsSUFBSSxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMs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LFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3pGLE1BQU0sR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVwQyxVQUFVLEdBQUcsSUFBSSxjQUFjLENBQUMsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVuQyxVQUFVLEdBQUcsSUFBSSxjQUFjLENBQUMsTUFBTSxFQUFFLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztRQUVyQyxVQUFVLEdBQUcsSUFBSSxjQUFjLENBQUMsS0FBSyxFQUFFLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZGLE1BQU0sR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVsQyxVQUFVLEdBQUcsSUFBSSxjQUFjLENBQUMsS0FBSyxFQUFFLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3pGLE1BQU0sR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVsQyxVQUFVLEdBQUcsSUFBSSxjQUFjLENBQUMsS0FBSyxFQUFFLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3pGLE1BQU0sR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVuQyxVQUFVLEdBQUcsSUFBSSxjQUFjLENBQUMsTUFBTSxFQUFFLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzFGLE1BQU0sR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVwQyxVQUFVLEdBQUcsSUFBSSxjQUFjLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxlQUFlLENBQUMsQ0FBQztRQUNwRSxNQUFNLEdBQUcsVUFBVSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQztRQUV2QyxVQUFVLEdBQUcsSUFBSSxjQUFjLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxlQUFlLENBQUMsQ0FBQztRQUNwRSxNQUFNLEdBQUcsVUFBVSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQztRQUV2QyxVQUFVLEdBQUcsSUFBSSxjQUFjLENBQUMsWUFBWSxFQUFFLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRXhDLFVBQVUsR0FBRyxJQUFJLGNBQWMsQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDdEUsTUFBTSxHQUFHLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDekMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9