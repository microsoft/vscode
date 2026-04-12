/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { IndentAction } from '../../../../common/languages/languageConfiguration.js';
import { OnEnterSupport } from '../../../../common/languages/supports/onEnter.js';
import { javascriptOnEnterRules } from './onEnterRules.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('OnEnter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('uses brackets', () => {
        const brackets = [
            ['(', ')'],
            ['begin', 'end']
        ];
        const support = new OnEnterSupport({
            brackets: brackets
        });
        const testIndentAction = (beforeText, afterText, expected) => {
            const actual = support.onEnter(3 /* EditorAutoIndentStrategy.Advanced */, '', beforeText, afterText);
            if (expected === IndentAction.None) {
                assert.strictEqual(actual, null);
            }
            else {
                assert.strictEqual(actual.indentAction, expected);
            }
        };
        testIndentAction('a', '', IndentAction.None);
        testIndentAction('', 'b', IndentAction.None);
        testIndentAction('(', 'b', IndentAction.Indent);
        testIndentAction('a', ')', IndentAction.None);
        testIndentAction('begin', 'ending', IndentAction.Indent);
        testIndentAction('abegin', 'end', IndentAction.None);
        testIndentAction('begin', ')', IndentAction.Indent);
        testIndentAction('begin', 'end', IndentAction.IndentOutdent);
        testIndentAction('begin ', ' end', IndentAction.IndentOutdent);
        testIndentAction(' begin', 'end//as', IndentAction.IndentOutdent);
        testIndentAction('(', ')', IndentAction.IndentOutdent);
        testIndentAction('( ', ')', IndentAction.IndentOutdent);
        testIndentAction('a(', ')b', IndentAction.IndentOutdent);
        testIndentAction('(', '', IndentAction.Indent);
        testIndentAction('(', 'foo', IndentAction.Indent);
        testIndentAction('begin', 'foo', IndentAction.Indent);
        testIndentAction('begin', '', IndentAction.Indent);
    });
    test('Issue #121125: onEnterRules with global modifier', () => {
        const support = new OnEnterSupport({
            onEnterRules: [
                {
                    action: {
                        appendText: '/// ',
                        indentAction: IndentAction.Outdent
                    },
                    beforeText: /^\s*\/{3}.*$/gm
                }
            ]
        });
        const testIndentAction = (previousLineText, beforeText, afterText, expectedIndentAction, expectedAppendText, removeText = 0) => {
            const actual = support.onEnter(3 /* EditorAutoIndentStrategy.Advanced */, previousLineText, beforeText, afterText);
            if (expectedIndentAction === null) {
                assert.strictEqual(actual, null, 'isNull:' + beforeText);
            }
            else {
                assert.strictEqual(actual !== null, true, 'isNotNull:' + beforeText);
                assert.strictEqual(actual.indentAction, expectedIndentAction, 'indentAction:' + beforeText);
                if (expectedAppendText !== null) {
                    assert.strictEqual(actual.appendText, expectedAppendText, 'appendText:' + beforeText);
                }
                if (removeText !== 0) {
                    assert.strictEqual(actual.removeText, removeText, 'removeText:' + beforeText);
                }
            }
        };
        testIndentAction('/// line', '/// line', '', IndentAction.Outdent, '/// ');
        testIndentAction('/// line', '/// line', '', IndentAction.Outdent, '/// ');
    });
    test('uses regExpRules', () => {
        const support = new OnEnterSupport({
            onEnterRules: javascriptOnEnterRules
        });
        const testIndentAction = (previousLineText, beforeText, afterText, expectedIndentAction, expectedAppendText, removeText = 0) => {
            const actual = support.onEnter(3 /* EditorAutoIndentStrategy.Advanced */, previousLineText, beforeText, afterText);
            if (expectedIndentAction === null) {
                assert.strictEqual(actual, null, 'isNull:' + beforeText);
            }
            else {
                assert.strictEqual(actual !== null, true, 'isNotNull:' + beforeText);
                assert.strictEqual(actual.indentAction, expectedIndentAction, 'indentAction:' + beforeText);
                if (expectedAppendText !== null) {
                    assert.strictEqual(actual.appendText, expectedAppendText, 'appendText:' + beforeText);
                }
                if (removeText !== 0) {
                    assert.strictEqual(actual.removeText, removeText, 'removeText:' + beforeText);
                }
            }
        };
        testIndentAction('', '\t/**', ' */', IndentAction.IndentOutdent, ' * ');
        testIndentAction('', '\t/**', '', IndentAction.None, ' * ');
        testIndentAction('', '\t/** * / * / * /', '', IndentAction.None, ' * ');
        testIndentAction('', '\t/** /*', '', IndentAction.None, ' * ');
        testIndentAction('', '/**', '', IndentAction.None, ' * ');
        testIndentAction('', '\t/**/', '', null, null);
        testIndentAction('', '\t/***/', '', null, null);
        testIndentAction('', '\t/*******/', '', null, null);
        testIndentAction('', '\t/** * * * * */', '', null, null);
        testIndentAction('', '\t/** */', '', null, null);
        testIndentAction('', '\t/** asdfg */', '', null, null);
        testIndentAction('', '\t/* asdfg */', '', null, null);
        testIndentAction('', '\t/* asdfg */', '', null, null);
        testIndentAction('', '\t/** asdfg */', '', null, null);
        testIndentAction('', '*/', '', null, null);
        testIndentAction('', '\t/*', '', null, null);
        testIndentAction('', '\t*', '', null, null);
        testIndentAction('\t/**', '\t *', '', IndentAction.None, '* ');
        testIndentAction('\t * something', '\t *', '', IndentAction.None, '* ');
        testIndentAction('\t *', '\t *', '', IndentAction.None, '* ');
        testIndentAction('', '\t */', '', IndentAction.None, null, 1);
        testIndentAction('', '\t * */', '', IndentAction.None, null, 1);
        testIndentAction('', '\t * * / * / * / */', '', null, null);
        testIndentAction('\t/**', '\t * ', '', IndentAction.None, '* ');
        testIndentAction('\t * something', '\t * ', '', IndentAction.None, '* ');
        testIndentAction('\t *', '\t * ', '', IndentAction.None, '* ');
        testIndentAction('/**', ' * ', '', IndentAction.None, '* ');
        testIndentAction(' * something', ' * ', '', IndentAction.None, '* ');
        testIndentAction(' *', ' * asdfsfagadfg', '', IndentAction.None, '* ');
        testIndentAction('/**', ' * asdfsfagadfg * * * ', '', IndentAction.None, '* ');
        testIndentAction(' * something', ' * asdfsfagadfg * * * ', '', IndentAction.None, '* ');
        testIndentAction(' *', ' * asdfsfagadfg * * * ', '', IndentAction.None, '* ');
        testIndentAction('/**', ' * /*', '', IndentAction.None, '* ');
        testIndentAction(' * something', ' * /*', '', IndentAction.None, '* ');
        testIndentAction(' *', ' * /*', '', IndentAction.None, '* ');
        testIndentAction('/**', ' * asdfsfagadfg * / * / * /', '', IndentAction.None, '* ');
        testIndentAction(' * something', ' * asdfsfagadfg * / * / * /', '', IndentAction.None, '* ');
        testIndentAction(' *', ' * asdfsfagadfg * / * / * /', '', IndentAction.None, '* ');
        testIndentAction('/**', ' * asdfsfagadfg * / * / * /*', '', IndentAction.None, '* ');
        testIndentAction(' * something', ' * asdfsfagadfg * / * / * /*', '', IndentAction.None, '* ');
        testIndentAction(' *', ' * asdfsfagadfg * / * / * /*', '', IndentAction.None, '* ');
        testIndentAction('', ' */', '', IndentAction.None, null, 1);
        testIndentAction(' */', ' * test() {', '', IndentAction.Indent, null, 0);
        testIndentAction('', '\t */', '', IndentAction.None, null, 1);
        testIndentAction('', '\t\t */', '', IndentAction.None, null, 1);
        testIndentAction('', '   */', '', IndentAction.None, null, 1);
        testIndentAction('', '     */', '', IndentAction.None, null, 1);
        testIndentAction('', '\t     */', '', IndentAction.None, null, 1);
        testIndentAction('', ' *--------------------------------------------------------------------------------------------*/', '', IndentAction.None, null, 1);
        // issue #43469
        testIndentAction('class A {', '    * test() {', '', IndentAction.Indent, null, 0);
        testIndentAction('', '    * test() {', '', IndentAction.Indent, null, 0);
        testIndentAction('    ', '    * test() {', '', IndentAction.Indent, null, 0);
        testIndentAction('class A {', '  * test() {', '', IndentAction.Indent, null, 0);
        testIndentAction('', '  * test() {', '', IndentAction.Indent, null, 0);
        testIndentAction('  ', '  * test() {', '', IndentAction.Indent, null, 0);
    });
    test('issue #141816', () => {
        const support = new OnEnterSupport({
            onEnterRules: javascriptOnEnterRules
        });
        const testIndentAction = (beforeText, afterText, expected) => {
            const actual = support.onEnter(3 /* EditorAutoIndentStrategy.Advanced */, '', beforeText, afterText);
            if (expected === IndentAction.None) {
                assert.strictEqual(actual, null);
            }
            else {
                assert.strictEqual(actual.indentAction, expected);
            }
        };
        testIndentAction('const r = /{/;', '', IndentAction.None);
        testIndentAction('const r = /{[0-9]/;', '', IndentAction.None);
        testIndentAction('const r = /[a-zA-Z]{/;', '', IndentAction.None);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib25FbnRlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVzL3N1cHBvcnRzL29uRW50ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFpQixZQUFZLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7SUFFckIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUMxQixNQUFNLFFBQVEsR0FBb0I7WUFDakMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO1lBQ1YsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDO1NBQ2hCLENBQUM7UUFDRixNQUFNLE9BQU8sR0FBRyxJQUFJLGNBQWMsQ0FBQztZQUNsQyxRQUFRLEVBQUUsUUFBUTtTQUNsQixDQUFDLENBQUM7UUFDSCxNQUFNLGdCQUFnQixHQUFHLENBQUMsVUFBa0IsRUFBRSxTQUFpQixFQUFFLFFBQXNCLEVBQUUsRUFBRTtZQUMxRixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsT0FBTyw0Q0FBb0MsRUFBRSxFQUFFLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUM3RixJQUFJLFFBQVEsS0FBSyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3BDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLElBQUksQ0FB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