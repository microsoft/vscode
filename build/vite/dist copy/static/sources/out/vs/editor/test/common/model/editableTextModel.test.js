/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { MirrorTextModel } from '../../../common/model/mirrorTextModel.js';
import { assertSyncedModels, testApplyEditsWithSyncedModels } from './editableTextModelTestUtils.js';
import { createTextModel } from '../testTextModel.js';
suite('EditorModel - EditableTextModel.applyEdits updates mightContainRTL', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function testApplyEdits(original, edits, before, after) {
        const model = createTextModel(original.join('\n'));
        model.setEOL(0 /* EndOfLineSequence.LF */);
        assert.strictEqual(model.mightContainRTL(), before);
        model.applyEdits(edits);
        assert.strictEqual(model.mightContainRTL(), after);
        model.dispose();
    }
    function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
        return {
            range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
            text: text.join('\n')
        };
    }
    test('start with RTL, insert LTR', () => {
        testApplyEdits(['Hello,\nזוהי עובדה מבוססת שדעתו'], [editOp(1, 1, 1, 1, ['hello'])], true, true);
    });
    test('start with RTL, delete RTL', () => {
        testApplyEdits(['Hello,\nזוהי עובדה מבוססת שדעתו'], [editOp(1, 1, 10, 10, [''])], true, true);
    });
    test('start with RTL, insert RTL', () => {
        testApplyEdits(['Hello,\nזוהי עובדה מבוססת שדעתו'], [editOp(1, 1, 1, 1, ['هناك حقيقة مثبتة منذ زمن طويل'])], true, true);
    });
    test('start with LTR, insert LTR', () => {
        testApplyEdits(['Hello,\nworld!'], [editOp(1, 1, 1, 1, ['hello'])], false, false);
    });
    test('start with LTR, insert RTL 1', () => {
        testApplyEdits(['Hello,\nworld!'], [editOp(1, 1, 1, 1, ['هناك حقيقة مثبتة منذ زمن طويل'])], false, true);
    });
    test('start with LTR, insert RTL 2', () => {
        testApplyEdits(['Hello,\nworld!'], [editOp(1, 1, 1, 1, ['זוהי עובדה מבוססת שדעתו'])], false, true);
    });
});
suite('EditorModel - EditableTextModel.applyEdits updates mightContainNonBasicASCII', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function testApplyEdits(original, edits, before, after) {
        const model = createTextModel(original.join('\n'));
        model.setEOL(0 /* EndOfLineSequence.LF */);
        assert.strictEqual(model.mightContainNonBasicASCII(), before);
        model.applyEdits(edits);
        assert.strictEqual(model.mightContainNonBasicASCII(), after);
        model.dispose();
    }
    function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
        return {
            range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
            text: text.join('\n')
        };
    }
    test('start with NON-ASCII, insert ASCII', () => {
        testApplyEdits(['Hello,\nZürich'], [editOp(1, 1, 1, 1, ['hello', 'second line'])], true, true);
    });
    test('start with NON-ASCII, delete NON-ASCII', () => {
        testApplyEdits(['Hello,\nZürich'], [editOp(1, 1, 10, 10, [''])], true, true);
    });
    test('start with NON-ASCII, insert NON-ASCII', () => {
        testApplyEdits(['Hello,\nZürich'], [editOp(1, 1, 1, 1, ['Zürich'])], true, true);
    });
    test('start with ASCII, insert ASCII', () => {
        testApplyEdits(['Hello,\nworld!'], [editOp(1, 1, 1, 1, ['hello', 'second line'])], false, false);
    });
    test('start with ASCII, insert NON-ASCII', () => {
        testApplyEdits(['Hello,\nworld!'], [editOp(1, 1, 1, 1, ['Zürich', 'Zürich'])], false, true);
    });
});
suite('EditorModel - EditableTextModel.applyEdits', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
        return {
            range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
            text: text.join('\n'),
            forceMoveMarkers: false
        };
    }
    test('high-low surrogates 1', () => {
        testApplyEditsWithSyncedModels([
            '📚some',
            'very nice',
            'text'
        ], [
            editOp(1, 2, 1, 2, ['a'])
        ], [
            'a📚some',
            'very nice',
            'text'
        ], 
        /*inputEditsAreInvalid*/ true);
    });
    test('high-low surrogates 2', () => {
        testApplyEditsWithSyncedModels([
            '📚some',
            'very nice',
            'text'
        ], [
            editOp(1, 2, 1, 3, ['a'])
        ], [
            'asome',
            'very nice',
            'text'
        ], 
        /*inputEditsAreInvalid*/ true);
    });
    test('high-low surrogates 3', () => {
        testApplyEditsWithSyncedModels([
            '📚some',
            'very nice',
            'text'
        ], [
            editOp(1, 1, 1, 2, ['a'])
        ], [
            'asome',
            'very nice',
            'text'
        ], 
        /*inputEditsAreInvalid*/ true);
    });
    test('high-low surrogates 4', () => {
        testApplyEditsWithSyncedModels([
            '📚some',
            'very nice',
            'text'
        ], [
            editOp(1, 1, 1, 3, ['a'])
        ], [
            'asome',
            'very nice',
            'text'
        ], 
        /*inputEditsAreInvalid*/ true);
    });
    test('Bug 19872: Undo is funky', () => {
        testApplyEditsWithSyncedModels([
            'something',
            ' A',
            '',
            ' B',
            'something else'
        ], [
            editOp(2, 1, 2, 2, ['']),
            editOp(3, 1, 4, 2, [''])
        ], [
            'something',
            'A',
            'B',
            'something else'
        ]);
    });
    test('Bug 19872: Undo is funky (2)', () => {
        testApplyEditsWithSyncedModels([
            'something',
            'A',
            'B',
            'something else'
        ], [
            editOp(2, 1, 2, 1, [' ']),
            editOp(3, 1, 3, 1, ['', ' '])
        ], [
            'something',
            ' A',
            '',
            ' B',
            'something else'
        ]);
    });
    test('insert empty text', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 1, 1, 1, [''])
        ], [
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('last op is no-op', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 1, 1, 2, ['']),
            editOp(4, 1, 4, 1, [''])
        ], [
            'y First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('insert text without newline 1', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 1, 1, 1, ['foo '])
        ], [
            'foo My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('insert text without newline 2', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 3, 1, 3, [' foo'])
        ], [
            'My foo First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('insert one newline', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 4, 1, 4, ['', ''])
        ], [
            'My ',
            'First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('insert text with one newline', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 3, 1, 3, [' new line', 'No longer'])
        ], [
            'My new line',
            'No longer First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('insert text with two newlines', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 3, 1, 3, [' new line', 'One more line in the middle', 'No longer'])
        ], [
            'My new line',
            'One more line in the middle',
            'No longer First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('insert text with many newlines', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 3, 1, 3, ['', '', '', '', ''])
        ], [
            'My',
            '',
            '',
            '',
            ' First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('insert multiple newlines', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 3, 1, 3, ['', '', '', '', '']),
            editOp(3, 15, 3, 15, ['a', 'b'])
        ], [
            'My',
            '',
            '',
            '',
            ' First Line',
            '\t\tMy Second Line',
            '    Third Linea',
            'b',
            '',
            '1'
        ]);
    });
    test('delete empty text', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 1, 1, 1, [''])
        ], [
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('delete text from one line', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 1, 1, 2, [''])
        ], [
            'y First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('delete text from one line 2', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 1, 1, 3, ['a'])
        ], [
            'a First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('delete all text from a line', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 1, 1, 14, [''])
        ], [
            '',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('delete text from two lines', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 4, 2, 6, [''])
        ], [
            'My Second Line',
            '    Third Line',
            '',
            '1'
        ]);
    });
    test('delete text from many lines', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 4, 3, 5, [''])
        ], [
            'My Third Line',
            '',
            '1'
        ]);
    });
    test('delete everything', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '1'
        ], [
            editOp(1, 1, 5, 2, [''])
        ], [
            ''
        ]);
    });
    test('two unrelated edits', () => {
        testApplyEditsWithSyncedModels([
            'My First Line',
            '\t\tMy Second Line',
            '    Third Line',
            '',
            '123'
        ], [
            editOp(2, 1, 2, 3, ['\t']),
            editOp(3, 1, 3, 5, [''])
        ], [
            'My First Line',
            '\tMy Second Line',
            'Third Line',
            '',
            '123'
        ]);
    });
    test('two edits on one line', () => {
        testApplyEditsWithSyncedModels([
            '\t\tfirst\t    ',
            '\t\tsecond line',
            '\tthird line',
            'fourth line',
            '\t\t<!@#fifth#@!>\t\t'
        ], [
            editOp(5, 3, 5, 7, ['']),
            editOp(5, 12, 5, 16, [''])
        ], [
            '\t\tfirst\t    ',
            '\t\tsecond line',
            '\tthird line',
            'fourth line',
            '\t\tfifth\t\t'
        ]);
    });
    test('many edits', () => {
        testApplyEditsWithSyncedModels([
            '{"x" : 1}'
        ], [
            editOp(1, 2, 1, 2, ['\n  ']),
            editOp(1, 5, 1, 6, ['']),
            editOp(1, 9, 1, 9, ['\n'])
        ], [
            '{',
            '  "x": 1',
            '}'
        ]);
    });
    test('many edits reversed', () => {
        testApplyEditsWithSyncedModels([
            '{',
            '  "x": 1',
            '}'
        ], [
            editOp(1, 2, 2, 3, ['']),
            editOp(2, 6, 2, 6, [' ']),
            editOp(2, 9, 3, 1, [''])
        ], [
            '{"x" : 1}'
        ]);
    });
    test('replacing newlines 1', () => {
        testApplyEditsWithSyncedModels([
            '{',
            '"a": true,',
            '',
            '"b": true',
            '}'
        ], [
            editOp(1, 2, 2, 1, ['', '\t']),
            editOp(2, 11, 4, 1, ['', '\t'])
        ], [
            '{',
            '\t"a": true,',
            '\t"b": true',
            '}'
        ]);
    });
    test('replacing newlines 2', () => {
        testApplyEditsWithSyncedModels([
            'some text',
            'some more text',
            'now comes an empty line',
            '',
            'after empty line',
            'and the last line'
        ], [
            editOp(1, 5, 3, 1, [' text', 'some more text', 'some more text']),
            editOp(3, 2, 4, 1, ['o more lines', 'asd', 'asd', 'asd']),
            editOp(5, 1, 5, 6, ['zzzzzzzz']),
            editOp(5, 11, 6, 16, ['1', '2', '3', '4'])
        ], [
            'some text',
            'some more text',
            'some more textno more lines',
            'asd',
            'asd',
            'asd',
            'zzzzzzzz empt1',
            '2',
            '3',
            '4ne'
        ]);
    });
    test('advanced 1', () => {
        testApplyEditsWithSyncedModels([
            ' {       "d": [',
            '             null',
            '        ] /*comment*/',
            '        ,"e": /*comment*/ [null] }',
        ], [
            editOp(1, 1, 1, 2, ['']),
            editOp(1, 3, 1, 10, ['', '  ']),
            editOp(1, 16, 2, 14, ['', '    ']),
            editOp(2, 18, 3, 9, ['', '  ']),
            editOp(3, 22, 4, 9, ['']),
            editOp(4, 10, 4, 10, ['', '  ']),
            editOp(4, 28, 4, 28, ['', '    ']),
            editOp(4, 32, 4, 32, ['', '  ']),
            editOp(4, 33, 4, 34, ['', ''])
        ], [
            '{',
            '  "d": [',
            '    null',
            '  ] /*comment*/,',
            '  "e": /*comment*/ [',
            '    null',
            '  ]',
            '}',
        ]);
    });
    test('advanced simplified', () => {
        testApplyEditsWithSyncedModels([
            '   abc',
            ' ,def'
        ], [
            editOp(1, 1, 1, 4, ['']),
            editOp(1, 7, 2, 2, ['']),
            editOp(2, 3, 2, 3, ['', ''])
        ], [
            'abc,',
            'def'
        ]);
    });
    test('issue #144', () => {
        testApplyEditsWithSyncedModels([
            'package caddy',
            '',
            'func main() {',
            '\tfmt.Println("Hello World! :)")',
            '}',
            ''
        ], [
            editOp(1, 1, 6, 1, [
                'package caddy',
                '',
                'import "fmt"',
                '',
                'func main() {',
                '\tfmt.Println("Hello World! :)")',
                '}',
                ''
            ])
        ], [
            'package caddy',
            '',
            'import "fmt"',
            '',
            'func main() {',
            '\tfmt.Println("Hello World! :)")',
            '}',
            ''
        ]);
    });
    test('issue #2586 Replacing selected end-of-line with newline locks up the document', () => {
        testApplyEditsWithSyncedModels([
            'something',
            'interesting'
        ], [
            editOp(1, 10, 2, 1, ['', ''])
        ], [
            'something',
            'interesting'
        ]);
    });
    test('issue #3980', () => {
        testApplyEditsWithSyncedModels([
            'class A {',
            '    someProperty = false;',
            '    someMethod() {',
            '    this.someMethod();',
            '    }',
            '}',
        ], [
            editOp(1, 8, 1, 9, ['', '']),
            editOp(3, 17, 3, 18, ['', '']),
            editOp(3, 18, 3, 18, ['    ']),
            editOp(4, 5, 4, 5, ['    ']),
        ], [
            'class A',
            '{',
            '    someProperty = false;',
            '    someMethod()',
            '    {',
            '        this.someMethod();',
            '    }',
            '}',
        ]);
    });
    function testApplyEditsFails(original, edits) {
        const model = createTextModel(original.join('\n'));
        let hasThrown = false;
        try {
            model.applyEdits(edits);
        }
        catch (err) {
            hasThrown = true;
        }
        assert.ok(hasThrown, 'expected model.applyEdits to fail.');
        model.dispose();
    }
    test('touching edits: two inserts at the same position', () => {
        testApplyEditsWithSyncedModels([
            'hello world'
        ], [
            editOp(1, 1, 1, 1, ['a']),
            editOp(1, 1, 1, 1, ['b']),
        ], [
            'abhello world'
        ]);
    });
    test('touching edits: insert and replace touching', () => {
        testApplyEditsWithSyncedModels([
            'hello world'
        ], [
            editOp(1, 1, 1, 1, ['b']),
            editOp(1, 1, 1, 3, ['ab']),
        ], [
            'babllo world'
        ]);
    });
    test('overlapping edits: two overlapping replaces', () => {
        testApplyEditsFails([
            'hello world'
        ], [
            editOp(1, 1, 1, 2, ['b']),
            editOp(1, 1, 1, 3, ['ab']),
        ]);
    });
    test('overlapping edits: two overlapping deletes', () => {
        testApplyEditsFails([
            'hello world'
        ], [
            editOp(1, 1, 1, 2, ['']),
            editOp(1, 1, 1, 3, ['']),
        ]);
    });
    test('touching edits: two touching replaces', () => {
        testApplyEditsWithSyncedModels([
            'hello world'
        ], [
            editOp(1, 1, 1, 2, ['H']),
            editOp(1, 2, 1, 3, ['E']),
        ], [
            'HEllo world'
        ]);
    });
    test('touching edits: two touching deletes', () => {
        testApplyEditsWithSyncedModels([
            'hello world'
        ], [
            editOp(1, 1, 1, 2, ['']),
            editOp(1, 2, 1, 3, ['']),
        ], [
            'llo world'
        ]);
    });
    test('touching edits: insert and replace', () => {
        testApplyEditsWithSyncedModels([
            'hello world'
        ], [
            editOp(1, 1, 1, 1, ['H']),
            editOp(1, 1, 1, 3, ['e']),
        ], [
            'Hello world'
        ]);
    });
    test('touching edits: replace and insert', () => {
        testApplyEditsWithSyncedModels([
            'hello world'
        ], [
            editOp(1, 1, 1, 3, ['H']),
            editOp(1, 3, 1, 3, ['e']),
        ], [
            'Hello world'
        ]);
    });
    test('change while emitting events 1', () => {
        let disposable;
        assertSyncedModels('Hello', (model, assertMirrorModels) => {
            model.applyEdits([{
                    range: new Range(1, 6, 1, 6),
                    text: ' world!',
                    // forceMoveMarkers: false
                }]);
            assertMirrorModels();
        }, (model) => {
            let isFirstTime = true;
            disposable = model.onDidChangeContent(() => {
                if (!isFirstTime) {
                    return;
                }
                isFirstTime = false;
                model.applyEdits([{
                        range: new Range(1, 13, 1, 13),
                        text: ' How are you?',
                        // forceMoveMarkers: false
                    }]);
            });
        });
        disposable.dispose();
    });
    test('change while emitting events 2', () => {
        let disposable;
        assertSyncedModels('Hello', (model, assertMirrorModels) => {
            model.applyEdits([{
                    range: new Range(1, 6, 1, 6),
                    text: ' world!',
                    // forceMoveMarkers: false
                }]);
            assertMirrorModels();
        }, (model) => {
            let isFirstTime = true;
            disposable = model.onDidChangeContent((e) => {
                if (!isFirstTime) {
                    return;
                }
                isFirstTime = false;
                model.applyEdits([{
                        range: new Range(1, 13, 1, 13),
                        text: ' How are you?',
                        // forceMoveMarkers: false
                    }]);
            });
        });
        disposable.dispose();
    });
    test('issue #1580: Changes in line endings are not correctly reflected in the extension host, leading to invalid offsets sent to external refactoring tools', () => {
        const model = createTextModel('Hello\nWorld!');
        assert.strictEqual(model.getEOL(), '\n');
        const mirrorModel2 = new MirrorTextModel(null, model.getLinesContent(), model.getEOL(), model.getVersionId());
        let mirrorModel2PrevVersionId = model.getVersionId();
        const disposable = model.onDidChangeContent((e) => {
            const versionId = e.versionId;
            if (versionId < mirrorModel2PrevVersionId) {
                console.warn('Model version id did not advance between edits (2)');
            }
            mirrorModel2PrevVersionId = versionId;
            mirrorModel2.onEvents(e);
        });
        const assertMirrorModels = () => {
            assert.strictEqual(mirrorModel2.getText(), model.getValue(), 'mirror model 2 text OK');
            assert.strictEqual(mirrorModel2.version, model.getVersionId(), 'mirror model 2 version OK');
        };
        model.setEOL(1 /* EndOfLineSequence.CRLF */);
        assertMirrorModels();
        disposable.dispose();
        model.dispose();
        mirrorModel2.dispose();
    });
    test('issue #47733: Undo mangles unicode characters', () => {
        const model = createTextModel('\'👁\'');
        model.applyEdits([
            { range: new Range(1, 1, 1, 1), text: '"' },
            { range: new Range(1, 2, 1, 2), text: '"' },
        ]);
        assert.strictEqual(model.getValue(1 /* EndOfLinePreference.LF */), '"\'"👁\'');
        assert.deepStrictEqual(model.validateRange(new Range(1, 3, 1, 4)), new Range(1, 3, 1, 4));
        model.applyEdits([
            { range: new Range(1, 1, 1, 2), text: null },
            { range: new Range(1, 3, 1, 4), text: null },
        ]);
        assert.strictEqual(model.getValue(1 /* EndOfLinePreference.LF */), '\'👁\'');
        model.dispose();
    });
    test('issue #48741: Broken undo stack with move lines up with multiple cursors', () => {
        const model = createTextModel([
            'line1',
            'line2',
            'line3',
            '',
        ].join('\n'));
        const undoEdits = model.applyEdits([
            { range: new Range(4, 1, 4, 1), text: 'line3', },
            { range: new Range(3, 1, 3, 6), text: null, },
            { range: new Range(2, 1, 3, 1), text: null, },
            { range: new Range(3, 6, 3, 6), text: '\nline2' }
        ], true);
        model.applyEdits(undoEdits);
        assert.deepStrictEqual(model.getValue(), 'line1\nline2\nline3\n');
        model.dispose();
    });
});
suite('CRLF edit normalization', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('edit ending with \\r followed by \\n in buffer should strip trailing \\r', () => {
        // Document: "abc\r\ndef\r\n"
        // Edit: Replace range (1,1)-(1,4) "abc" with "xyz\r"
        // The \r at end of replacement should be stripped since next char is \n
        const model = createTextModel('abc\r\ndef\r\n');
        model.setEOL(1 /* EndOfLineSequence.CRLF */);
        assert.strictEqual(model.getEOL(), '\r\n');
        assert.strictEqual(model.getLineCount(), 3);
        assert.strictEqual(model.getLineContent(1), 'abc');
        assert.strictEqual(model.getLineContent(2), 'def');
        model.applyEdits([
            { range: new Range(1, 1, 1, 4), text: 'xyz\r' }
        ]);
        // The trailing \r should be stripped, so we get "xyz" not "xyz\r"
        assert.strictEqual(model.getLineContent(1), 'xyz');
        assert.strictEqual(model.getLineContent(2), 'def');
        assert.strictEqual(model.getLineCount(), 3);
        model.dispose();
    });
    test('edit ending with \\r\\n should NOT be modified', () => {
        // Document: "abc\r\ndef\r\n"
        // Edit: Replace range (1,1)-(1,4) "abc" with "xyz\r\n"
        // This is a proper CRLF so should not be modified
        const model = createTextModel('abc\r\ndef\r\n');
        model.setEOL(1 /* EndOfLineSequence.CRLF */);
        model.applyEdits([
            { range: new Range(1, 1, 1, 4), text: 'xyz\r\n' }
        ]);
        // Should add a new line
        assert.strictEqual(model.getLineContent(1), 'xyz');
        assert.strictEqual(model.getLineContent(2), '');
        assert.strictEqual(model.getLineContent(3), 'def');
        assert.strictEqual(model.getLineCount(), 4);
        model.dispose();
    });
    test('edit ending with \\r NOT followed by \\n should NOT be modified', () => {
        // Document: "abcdef" (no newline after)
        // Edit: Replace range (1,1)-(1,4) "abc" with "xyz\r"
        // Since there's no \n after the range, the \r should stay
        const model = createTextModel('abcdef');
        model.setEOL(1 /* EndOfLineSequence.CRLF */);
        model.applyEdits([
            { range: new Range(1, 1, 1, 4), text: 'xyz\r' }
        ]);
        // The \r should cause a new line since buffer normalizes EOL
        // Actually since buffer uses CRLF, the lone \r will be normalized to \r\n
        assert.strictEqual(model.getLineCount(), 2);
        model.dispose();
    });
    test('edit in LF buffer should NOT strip trailing \\r', () => {
        // Document with LF: "abc\ndef\n"
        // Edit: Replace range (1,1)-(1,4) "abc" with "xyz\r"
        // Since buffer is LF, no special handling needed
        const model = createTextModel('abc\ndef\n');
        model.setEOL(0 /* EndOfLineSequence.LF */);
        assert.strictEqual(model.getEOL(), '\n');
        assert.strictEqual(model.getLineCount(), 3);
        model.applyEdits([
            { range: new Range(1, 1, 1, 4), text: 'xyz\r' }
        ]);
        // The \r will be normalized to \n (buffer's EOL)
        assert.strictEqual(model.getLineCount(), 4);
        model.dispose();
    });
    test('LSP include sorting scenario - edit ending with \\r should be normalized', () => {
        // This is the real-world scenario from the issue
        // Document: "#include \"a.h\"\r\n#include \"c.h\"\r\n#include \"b.h\"\r\n"
        // Edit: Replace lines 1-3 with reordered includes ending with \r
        const model = createTextModel('#include "a.h"\r\n#include "c.h"\r\n#include "b.h"\r\n');
        model.setEOL(1 /* EndOfLineSequence.CRLF */);
        assert.strictEqual(model.getEOL(), '\r\n');
        assert.strictEqual(model.getLineCount(), 4);
        assert.strictEqual(model.getLineContent(1), '#include "a.h"');
        assert.strictEqual(model.getLineContent(2), '#include "c.h"');
        assert.strictEqual(model.getLineContent(3), '#include "b.h"');
        // Edit: replace range (1,1)-(3,16) with text ending in \r
        // Range covers: #include "a.h"\r\n#include "c.h"\r\n#include "b.h"
        // Note: line 3 col 16 is after the last char "h" but before the \r\n
        model.applyEdits([
            {
                range: new Range(1, 1, 3, 16),
                text: '#include "a.h"\r\n#include "b.h"\r\n#include "c.h"\r'
            }
        ]);
        // The trailing \r should be stripped because the next char after range is \n
        assert.strictEqual(model.getLineCount(), 4);
        assert.strictEqual(model.getLineContent(1), '#include "a.h"');
        assert.strictEqual(model.getLineContent(2), '#include "b.h"');
        assert.strictEqual(model.getLineContent(3), '#include "c.h"');
        assert.strictEqual(model.getLineContent(4), '');
        model.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdGFibGVUZXh0TW9kZWwudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9lZGl0YWJsZVRleHRNb2RlbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUU1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFdEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUV0RCxLQUFLLENBQUMsb0VBQW9FLEVBQUUsR0FBRyxFQUFFO0lBRWhGLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsU0FBUyxjQUFjLENBQUMsUUFBa0IsRUFBRSxLQUE2QixFQUFFLE1BQWUsRUFBRSxLQUFjO1FBQ3pHLE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbkQsS0FBSyxDQUFDLE1BQU0sOEJBQXNCLENBQUM7UUFFbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFcEQsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRCxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFD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