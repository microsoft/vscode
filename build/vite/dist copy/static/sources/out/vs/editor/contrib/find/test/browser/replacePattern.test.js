/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { buildReplaceStringWithCasePreserved } from '../../../../../base/common/search.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseReplaceString, ReplacePattern, ReplacePiece } from '../../browser/replacePattern.js';
suite('Replace Pattern test', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('parse replace string', () => {
        const testParse = (input, expectedPieces) => {
            const actual = parseReplaceString(input);
            const expected = new ReplacePattern(expectedPieces);
            assert.deepStrictEqual(actual, expected, 'Parsing ' + input);
        };
        // no backslash => no treatment
        testParse('hello', [ReplacePiece.staticValue('hello')]);
        // \t => TAB
        testParse('\\thello', [ReplacePiece.staticValue('\thello')]);
        testParse('h\\tello', [ReplacePiece.staticValue('h\tello')]);
        testParse('hello\\t', [ReplacePiece.staticValue('hello\t')]);
        // \n => LF
        testParse('\\nhello', [ReplacePiece.staticValue('\nhello')]);
        // \\t => \t
        testParse('\\\\thello', [ReplacePiece.staticValue('\\thello')]);
        testParse('h\\\\tello', [ReplacePiece.staticValue('h\\tello')]);
        testParse('hello\\\\t', [ReplacePiece.staticValue('hello\\t')]);
        // \\\t => \TAB
        testParse('\\\\\\thello', [ReplacePiece.staticValue('\\\thello')]);
        // \\\\t => \\t
        testParse('\\\\\\\\thello', [ReplacePiece.staticValue('\\\\thello')]);
        // \ at the end => no treatment
        testParse('hello\\', [ReplacePiece.staticValue('hello\\')]);
        // \ with unknown char => no treatment
        testParse('hello\\x', [ReplacePiece.staticValue('hello\\x')]);
        // \ with back reference => no treatment
        testParse('hello\\0', [ReplacePiece.staticValue('hello\\0')]);
        testParse('hello$&', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(0)]);
        testParse('hello$0', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(0)]);
        testParse('hello$02', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(0), ReplacePiece.staticValue('2')]);
        testParse('hello$1', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(1)]);
        testParse('hello$2', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(2)]);
        testParse('hello$9', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(9)]);
        testParse('$9hello', [ReplacePiece.matchIndex(9), ReplacePiece.staticValue('hello')]);
        testParse('hello$12', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(12)]);
        testParse('hello$99', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(99)]);
        testParse('hello$99a', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(99), ReplacePiece.staticValue('a')]);
        testParse('hello$1a', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(1), ReplacePiece.staticValue('a')]);
        testParse('hello$100', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(10), ReplacePiece.staticValue('0')]);
        testParse('hello$100a', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(10), ReplacePiece.staticValue('0a')]);
        testParse('hello$10a0', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(10), ReplacePiece.staticValue('a0')]);
        testParse('hello$$', [ReplacePiece.staticValue('hello$')]);
        testParse('hello$$0', [ReplacePiece.staticValue('hello$0')]);
        testParse('hello$`', [ReplacePiece.staticValue('hello$`')]);
        testParse('hello$\'', [ReplacePiece.staticValue('hello$\'')]);
    });
    test('parse replace string with case modifiers', () => {
        const testParse = (input, expectedPieces) => {
            const actual = parseReplaceString(input);
            const expected = new ReplacePattern(expectedPieces);
            assert.deepStrictEqual(actual, expected, 'Parsing ' + input);
        };
        function assertReplace(target, search, replaceString, expected) {
            const replacePattern = parseReplaceString(replaceString);
            const m = search.exec(target);
            const actual = replacePattern.buildReplaceString(m);
            assert.strictEqual(actual, expected, `${target}.replace(${search}, ${replaceString}) === ${expected}`);
        }
        // \U, \u => uppercase  \L, \l => lowercase  \E => cancel
        testParse('hello\\U$1', [ReplacePiece.staticValue('hello'), ReplacePiece.caseOps(1, ['U'])]);
        assertReplace('func privateFunc(', /func (\w+)\(/, 'func \\U$1(', 'func PRIVATEFUNC(');
        testParse('hello\\u$1', [ReplacePiece.staticValue('hello'), ReplacePiece.caseOps(1, ['u'])]);
        assertReplace('func privateFunc(', /func (\w+)\(/, 'func \\u$1(', 'func PrivateFunc(');
        testParse('hello\\L$1', [ReplacePiece.staticValue('hello'), ReplacePiece.caseOps(1, ['L'])]);
        assertReplace('func privateFunc(', /func (\w+)\(/, 'func \\L$1(', 'func privatefunc(');
        testParse('hello\\l$1', [ReplacePiece.staticValue('hello'), ReplacePiece.caseOps(1, ['l'])]);
        assertReplace('func PrivateFunc(', /func (\w+)\(/, 'func \\l$1(', 'func privateFunc(');
        testParse('hello$1\\u\\u\\U$4goodbye', [ReplacePiece.staticValue('hello'), ReplacePiece.matchIndex(1), ReplacePiece.caseOps(4, ['u', 'u', 'U']), ReplacePiece.staticValue('goodbye')]);
        assertReplace('hellogooDbye', /hello(\w+)/, 'hello\\u\\u\\l\\l\\U$1', 'helloGOodBYE');
    });
    test('replace has JavaScript semantics', () => {
        const testJSReplaceSemantics = (target, search, replaceString, expected) => {
            const replacePattern = parseReplaceString(replaceString);
            const m = search.exec(target);
            const actual = replacePattern.buildReplaceString(m);
            assert.deepStrictEqual(actual, expected, `${target}.replace(${search}, ${replaceString})`);
        };
        testJSReplaceSemantics('hi', /hi/, 'hello', 'hi'.replace(/hi/, 'hello'));
        testJSReplaceSemantics('hi', /hi/, '\\t', 'hi'.replace(/hi/, '\t'));
        testJSReplaceSemantics('hi', /hi/, '\\n', 'hi'.replace(/hi/, '\n'));
        testJSReplaceSemantics('hi', /hi/, '\\\\t', 'hi'.replace(/hi/, '\\t'));
        testJSReplaceSemantics('hi', /hi/, '\\\\n', 'hi'.replace(/hi/, '\\n'));
        // implicit capture group 0
        testJSReplaceSemantics('hi', /hi/, 'hello$&', 'hi'.replace(/hi/, 'hello$&'));
        testJSReplaceSemantics('hi', /hi/, 'hello$0', 'hi'.replace(/hi/, 'hello$&'));
        testJSReplaceSemantics('hi', /hi/, 'hello$&1', 'hi'.replace(/hi/, 'hello$&1'));
        testJSReplaceSemantics('hi', /hi/, 'hello$01', 'hi'.replace(/hi/, 'hello$&1'));
        // capture groups have funny semantics in replace strings
        // the replace string interprets $nn as a captured group only if it exists in the search regex
        testJSReplaceSemantics('hi', /(hi)/, 'hello$10', 'hi'.replace(/(hi)/, 'hello$10'));
        testJSReplaceSemantics('hi', /(hi)()()()()()()()()()/, 'hello$10', 'hi'.replace(/(hi)()()()()()()()()()/, 'hello$10'));
        testJSReplaceSemantics('hi', /(hi)/, 'hello$100', 'hi'.replace(/(hi)/, 'hello$100'));
        testJSReplaceSemantics('hi', /(hi)/, 'hello$20', 'hi'.replace(/(hi)/, 'hello$20'));
    });
    test('get replace string if given text is a complete match', () => {
        function assertReplace(target, search, replaceString, expected) {
            const replacePattern = parseReplaceString(replaceString);
            const m = search.exec(target);
            const actual = replacePattern.buildReplaceString(m);
            assert.strictEqual(actual, expected, `${target}.replace(${search}, ${replaceString}) === ${expected}`);
        }
        assertReplace('bla', /bla/, 'hello', 'hello');
        assertReplace('bla', /(bla)/, 'hello', 'hello');
        assertReplace('bla', /(bla)/, 'hello$0', 'hellobla');
        const searchRegex = /let\s+(\w+)\s*=\s*require\s*\(\s*['"]([\w\.\-/]+)\s*['"]\s*\)\s*/;
        assertReplace('let fs = require(\'fs\')', searchRegex, 'import * as $1 from \'$2\';', 'import * as fs from \'fs\';');
        assertReplace('let something = require(\'fs\')', searchRegex, 'import * as $1 from \'$2\';', 'import * as something from \'fs\';');
        assertReplace('let something = require(\'fs\')', searchRegex, 'import * as $1 from \'$1\';', 'import * as something from \'something\';');
        assertReplace('let something = require(\'fs\')', searchRegex, 'import * as $2 from \'$1\';', 'import * as fs from \'something\';');
        assertReplace('let something = require(\'fs\')', searchRegex, 'import * as $0 from \'$0\';', 'import * as let something = require(\'fs\') from \'let something = require(\'fs\')\';');
        assertReplace('let fs = require(\'fs\')', searchRegex, 'import * as $1 from \'$2\';', 'import * as fs from \'fs\';');
        assertReplace('for ()', /for(.*)/, 'cat$1', 'cat ()');
        // issue #18111
        assertReplace('HRESULT OnAmbientPropertyChange(DISPID   dispid);', /\b\s{3}\b/, ' ', ' ');
    });
    test('get replace string if match is sub-string of the text', () => {
        function assertReplace(target, search, replaceString, expected) {
            const replacePattern = parseReplaceString(replaceString);
            const m = search.exec(target);
            const actual = replacePattern.buildReplaceString(m);
            assert.strictEqual(actual, expected, `${target}.replace(${search}, ${replaceString}) === ${expected}`);
        }
        assertReplace('this is a bla text', /bla/, 'hello', 'hello');
        assertReplace('this is a bla text', /this(?=.*bla)/, 'that', 'that');
        assertReplace('this is a bla text', /(th)is(?=.*bla)/, '$1at', 'that');
        assertReplace('this is a bla text', /(th)is(?=.*bla)/, '$1e', 'the');
        assertReplace('this is a bla text', /(th)is(?=.*bla)/, '$1ere', 'there');
        assertReplace('this is a bla text', /(th)is(?=.*bla)/, '$1', 'th');
        assertReplace('this is a bla text', /(th)is(?=.*bla)/, 'ma$1', 'math');
        assertReplace('this is a bla text', /(th)is(?=.*bla)/, 'ma$1s', 'maths');
        assertReplace('this is a bla text', /(th)is(?=.*bla)/, '$0', 'this');
        assertReplace('this is a bla text', /(th)is(?=.*bla)/, '$0$1', 'thisth');
        assertReplace('this is a bla text', /bla(?=\stext$)/, 'foo', 'foo');
        assertReplace('this is a bla text', /b(la)(?=\stext$)/, 'f$1', 'fla');
        assertReplace('this is a bla text', /b(la)(?=\stext$)/, 'f$0', 'fbla');
        assertReplace('this is a bla text', /b(la)(?=\stext$)/, '$0ah', 'blaah');
    });
    test('issue #19740 Find and replace capture group/backreference inserts `undefined` instead of empty string', () => {
        const replacePattern = parseReplaceString('a{$1}');
        const matches = /a(z)?/.exec('abcd');
        const actual = replacePattern.buildReplaceString(matches);
        assert.strictEqual(actual, 'a{}');
    });
    test('buildReplaceStringWithCasePreserved test', () => {
        function assertReplace(target, replaceString, expected) {
            let actual = '';
            actual = buildReplaceStringWithCasePreserved(target, replaceString);
            assert.strictEqual(actual, expected);
        }
        assertReplace(['abc'], 'Def', 'def');
        assertReplace(['Abc'], 'Def', 'Def');
        assertReplace(['ABC'], 'Def', 'DEF');
        assertReplace(['abc', 'Abc'], 'Def', 'def');
        assertReplace(['Abc', 'abc'], 'Def', 'Def');
        assertReplace(['ABC', 'abc'], 'Def', 'DEF');
        assertReplace(['aBc', 'abc'], 'Def', 'def');
        assertReplace(['AbC'], 'Def', 'Def');
        assertReplace(['aBC'], 'Def', 'def');
        assertReplace(['aBc'], 'DeF', 'deF');
        assertReplace(['Foo-Bar'], 'newfoo-newbar', 'Newfoo-Newbar');
        assertReplace(['Foo-Bar-Abc'], 'newfoo-newbar-newabc', 'Newfoo-Newbar-Newabc');
        assertReplace(['Foo-Bar-abc'], 'newfoo-newbar', 'Newfoo-newbar');
        assertReplace(['foo-Bar'], 'newfoo-newbar', 'newfoo-Newbar');
        assertReplace(['foo-BAR'], 'newfoo-newbar', 'newfoo-NEWBAR');
        assertReplace(['foO-BAR'], 'NewFoo-NewBar', 'newFoo-NEWBAR');
        assertReplace(['Foo_Bar'], 'newfoo_newbar', 'Newfoo_Newbar');
        assertReplace(['Foo_Bar_Abc'], 'newfoo_newbar_newabc', 'Newfoo_Newbar_Newabc');
        assertReplace(['Foo_Bar_abc'], 'newfoo_newbar', 'Newfoo_newbar');
        assertReplace(['Foo_Bar-abc'], 'newfoo_newbar-abc', 'Newfoo_newbar-abc');
        assertReplace(['foo_Bar'], 'newfoo_newbar', 'newfoo_Newbar');
        assertReplace(['Foo_BAR'], 'newfoo_newbar', 'Newfoo_NEWBAR');
    });
    test('preserve case', () => {
        function assertReplace(target, replaceString, expected) {
            const replacePattern = parseReplaceString(replaceString);
            const actual = replacePattern.buildReplaceString(target, true);
            assert.strictEqual(actual, expected);
        }
        assertReplace(['abc'], 'Def', 'def');
        assertReplace(['Abc'], 'Def', 'Def');
        assertReplace(['ABC'], 'Def', 'DEF');
        assertReplace(['abc', 'Abc'], 'Def', 'def');
        assertReplace(['Abc', 'abc'], 'Def', 'Def');
        assertReplace(['ABC', 'abc'], 'Def', 'DEF');
        assertReplace(['aBc', 'abc'], 'Def', 'def');
        assertReplace(['AbC'], 'Def', 'Def');
        assertReplace(['aBC'], 'Def', 'def');
        assertReplace(['aBc'], 'DeF', 'deF');
        assertReplace(['Foo-Bar'], 'newfoo-newbar', 'Newfoo-Newbar');
        assertReplace(['Foo-Bar-Abc'], 'newfoo-newbar-newabc', 'Newfoo-Newbar-Newabc');
        assertReplace(['Foo-Bar-abc'], 'newfoo-newbar', 'Newfoo-newbar');
        assertReplace(['foo-Bar'], 'newfoo-newbar', 'newfoo-Newbar');
        assertReplace(['foo-BAR'], 'newfoo-newbar', 'newfoo-NEWBAR');
        assertReplace(['foO-BAR'], 'NewFoo-NewBar', 'newFoo-NEWBAR');
        assertReplace(['Foo_Bar'], 'newfoo_newbar', 'Newfoo_Newbar');
        assertReplace(['Foo_Bar_Abc'], 'newfoo_newbar_newabc', 'Newfoo_Newbar_Newabc');
        assertReplace(['Foo_Bar_abc'], 'newfoo_newbar', 'Newfoo_newbar');
        assertReplace(['Foo_Bar-abc'], 'newfoo_newbar-abc', 'Newfoo_newbar-abc');
        assertReplace(['foo_Bar'], 'newfoo_newbar', 'newfoo_Newbar');
        assertReplace(['foo_BAR'], 'newfoo_newbar', 'newfoo_NEWBAR');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbGFjZVBhdHRlcm4udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2ZpbmQvdGVzdC9icm93c2VyL3JlcGxhY2VQYXR0ZXJuLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFbkcsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtJQUVsQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDakMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxLQUFhLEVBQUUsY0FBOEIsRUFBRSxFQUFFO1lBQ25FLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sUUFBUSxHQUFHLElBQUksY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ3BELE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxVQUFVLEdBQUcsS0FBSyxDQUFDLENBQUM7UUFDOUQsQ0FBQyxDQUFDO1FBRUYsK0JBQStCO1FBQy9CLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV4RCxZQUFZO1FBQ1osU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdELFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RCxTQUFTLENBQUMsVUFBVSxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFN0QsV0FBVztRQUNYLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU3RCxZQUFZO1FBQ1osU0FBUyxDQUFDLFlBQVksRUFBRSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLFNBQVMsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRSxTQUFTLENBQUMsWUFBWSxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFaEUsZUFBZTtRQUNmLFNBQVMsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVuRSxlQUFlO1FBQ2YsU0FBUyxDQUFDLGdCQUFnQixFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFdEUsK0JBQStCO1FBQy9CLFNBQVMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU1RCxzQ0FBc0M7UUFDdEMsU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTlELHdDQUF3QztRQUN4QyxTQUFTLENBQUMsVUFBVSxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFOUQsU0FBUyxDQUFDLFNBQVMsRUFBRSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEVBQUUsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEYsU0FBUyxDQUFDLFNBQVMsRUFBRSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEVBQUUsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEYsU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEVBQUUsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0SCxTQUFTLENBQUMsU0FBUyxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsRUFBRSxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0RixTQUFTLENBQUMsU0FBUyxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsRUFBRSxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0RixTQUFTLENBQUMsU0FBUyxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsRUFBRSxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0RixTQUFTLENBQUMsU0FBUyxFQUFFLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV0RixTQUFTLENBQUMsVUFBVSxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsRUFB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