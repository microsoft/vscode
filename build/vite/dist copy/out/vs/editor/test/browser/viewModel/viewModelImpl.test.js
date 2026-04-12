/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { ViewEventHandler } from '../../../common/viewEventHandler.js';
import { testViewModel } from './testViewModel.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { createTextModel } from '../../common/testTextModel.js';
import { createCodeEditorServices, instantiateTestCodeEditor } from '../testCodeEditor.js';
suite('ViewModel', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('issue #21073: SplitLinesCollection: attempt to access a \'newer\' model', () => {
        const text = [''];
        const opts = {
            lineNumbersMinChars: 1
        };
        testViewModel(text, opts, (viewModel, model) => {
            assert.strictEqual(viewModel.getLineCount(), 1);
            viewModel.setViewport(1, 1, 1);
            model.applyEdits([{
                    range: new Range(1, 1, 1, 1),
                    text: [
                        'line01',
                        'line02',
                        'line03',
                        'line04',
                        'line05',
                        'line06',
                        'line07',
                        'line08',
                        'line09',
                        'line10',
                    ].join('\n')
                }]);
            assert.strictEqual(viewModel.getLineCount(), 10);
        });
    });
    test('issue #44805: SplitLinesCollection: attempt to access a \'newer\' model', () => {
        const text = [''];
        testViewModel(text, {}, (viewModel, model) => {
            assert.strictEqual(viewModel.getLineCount(), 1);
            model.pushEditOperations([], [{
                    range: new Range(1, 1, 1, 1),
                    text: '\ninsert1'
                }], () => ([]));
            model.pushEditOperations([], [{
                    range: new Range(1, 1, 1, 1),
                    text: '\ninsert2'
                }], () => ([]));
            model.pushEditOperations([], [{
                    range: new Range(1, 1, 1, 1),
                    text: '\ninsert3'
                }], () => ([]));
            const viewLineCount = [];
            viewLineCount.push(viewModel.getLineCount());
            const eventHandler = new class extends ViewEventHandler {
                handleEvents(events) {
                    // Access the view model
                    viewLineCount.push(viewModel.getLineCount());
                }
            };
            viewModel.addViewEventHandler(eventHandler);
            model.undo();
            viewLineCount.push(viewModel.getLineCount());
            assert.deepStrictEqual(viewLineCount, [4, 1, 1, 1, 1]);
            viewModel.removeViewEventHandler(eventHandler);
            eventHandler.dispose();
        });
    });
    test('view models react first to model changes', () => {
        const initialText = [
            'Hello',
            'world'
        ];
        const disposables = new DisposableStore();
        const model = disposables.add(createTextModel(initialText.join('\n')));
        const instantiationService = createCodeEditorServices(disposables);
        const ed1 = disposables.add(instantiateTestCodeEditor(instantiationService, model));
        disposables.add(instantiateTestCodeEditor(instantiationService, model));
        // Add a nasty listener which modifies the model during the model change event
        let isFirst = true;
        disposables.add(ed1.onDidChangeModelContent((e) => {
            if (isFirst) {
                isFirst = false;
                // delete the \n
                model.applyEdits([{ range: new Range(1, 6, 2, 1), text: '' }]);
            }
        }));
        model.applyEdits([{ range: new Range(2, 6, 2, 6), text: '!' }]);
        disposables.dispose();
    });
    test('issue #44805: No visible lines via API call', () => {
        const text = [
            'line1',
            'line2',
            'line3'
        ];
        testViewModel(text, {}, (viewModel, model) => {
            assert.strictEqual(viewModel.getLineCount(), 3);
            viewModel.setHiddenAreas([new Range(1, 1, 3, 1)]);
            assert.ok(viewModel.getVisibleRanges() !== null);
        });
    });
    test('issue #44805: No visible lines via undoing', () => {
        const text = [
            ''
        ];
        testViewModel(text, {}, (viewModel, model) => {
            assert.strictEqual(viewModel.getLineCount(), 1);
            model.pushEditOperations([], [{
                    range: new Range(1, 1, 1, 1),
                    text: 'line1\nline2\nline3'
                }], () => ([]));
            viewModel.setHiddenAreas([new Range(1, 1, 1, 1)]);
            assert.strictEqual(viewModel.getLineCount(), 2);
            model.undo();
            assert.ok(viewModel.getVisibleRanges() !== null);
        });
    });
    function assertGetPlainTextToCopy(text, ranges, emptySelectionClipboard, expected) {
        testViewModel(text, {}, (viewModel, model) => {
            const actual = viewModel.getPlainTextToCopy(ranges, emptySelectionClipboard, false);
            assert.deepStrictEqual(actual.sourceText, expected);
        });
    }
    const USUAL_TEXT = [
        '',
        'line2',
        'line3',
        'line4',
        ''
    ];
    test('getPlainTextToCopy 0/1', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 2, 2, 2)
        ], false, '');
    });
    test('getPlainTextToCopy 0/1 - emptySelectionClipboard', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 2, 2, 2)
        ], true, 'line2\n');
    });
    test('getPlainTextToCopy 1/1', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 2, 2, 6)
        ], false, 'ine2');
    });
    test('getPlainTextToCopy 1/1 - emptySelectionClipboard', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 2, 2, 6)
        ], true, 'ine2');
    });
    test('getPlainTextToCopy 0/2', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 2, 2, 2),
            new Range(3, 2, 3, 2),
        ], false, '');
    });
    test('getPlainTextToCopy 0/2 - emptySelectionClipboard', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 2, 2, 2),
            new Range(3, 2, 3, 2),
        ], true, [
            'line2\n',
            'line3\n'
        ]);
    });
    test('issue #256039: getPlainTextToCopy with multiple cursors and empty selections should return array', () => {
        // Bug: When copying with multiple cursors (empty selections) with emptySelectionClipboard enabled,
        // the result should be an array so that pasting with "editor.multiCursorPaste": "full"
        // correctly distributes each line to the corresponding cursor.
        // Without the fix, this returns 'line2\nline3\n' (a single string).
        // With the fix, this returns ['line2\n', 'line3\n'] (an array).
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 1, 2, 1),
            new Range(3, 1, 3, 1),
        ], true, ['line2\n', 'line3\n']);
    });
    test('getPlainTextToCopy 1/2', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 2, 2, 6),
            new Range(3, 2, 3, 2),
        ], false, 'ine2');
    });
    test('getPlainTextToCopy 1/2 - emptySelectionClipboard', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 2, 2, 6),
            new Range(3, 2, 3, 2),
        ], true, ['ine2', 'line3\n']);
    });
    test('getPlainTextToCopy 2/2', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 2, 2, 6),
            new Range(3, 2, 3, 6),
        ], false, ['ine2', 'ine3']);
    });
    test('getPlainTextToCopy 2/2 reversed', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(3, 2, 3, 6),
            new Range(2, 2, 2, 6),
        ], false, ['ine2', 'ine3']);
    });
    test('getPlainTextToCopy 0/3 - emptySelectionClipboard', () => {
        assertGetPlainTextToCopy(USUAL_TEXT, [
            new Range(2, 2, 2, 2),
            new Range(2, 3, 2, 3),
            new Range(3, 2, 3, 2),
        ], true, [
            'line2\n',
            'line3\n'
        ]);
    });
    test('issue #22688 - always use CRLF for clipboard on Windows', () => {
        testViewModel(USUAL_TEXT, {}, (viewModel, model) => {
            model.setEOL(0 /* EndOfLineSequence.LF */);
            const actual = viewModel.getPlainTextToCopy([new Range(2, 1, 5, 1)], true, true);
            assert.deepStrictEqual(actual.sourceText, 'line2\r\nline3\r\nline4\r\n');
        });
    });
    test('issue #40926: Incorrect spacing when inserting new line after multiple folded blocks of code', () => {
        testViewModel([
            'foo = {',
            '    foobar: function() {',
            '        this.foobar();',
            '    },',
            '    foobar: function() {',
            '        this.foobar();',
            '    },',
            '    foobar: function() {',
            '        this.foobar();',
            '    },',
            '}',
        ], {}, (viewModel, model) => {
            viewModel.setHiddenAreas([
                new Range(3, 1, 3, 1),
                new Range(6, 1, 6, 1),
                new Range(9, 1, 9, 1),
            ]);
            model.applyEdits([
                { range: new Range(4, 7, 4, 7), text: '\n    ' },
                { range: new Range(7, 7, 7, 7), text: '\n    ' },
                { range: new Range(10, 7, 10, 7), text: '\n    ' }
            ]);
            assert.strictEqual(viewModel.getLineCount(), 11);
        });
    });
    test('normalizePosition with multiple touching injected text', () => {
        testViewModel([
            'just some text'
        ], {}, (viewModel, model) => {
            model.deltaDecorations([], [
                {
                    range: new Range(1, 8, 1, 8),
                    options: {
                        description: 'test',
                        before: {
                            content: 'bar'
                        },
                        showIfCollapsed: true
                    }
                },
                {
                    range: new Range(1, 8, 1, 8),
                    options: {
                        description: 'test',
                        before: {
                            content: 'bz'
                        },
                        showIfCollapsed: true
                    }
                },
            ]);
            // just sobarbzme text
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), 2 /* PositionAffinity.None */), new Position(1, 8));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), 2 /* PositionAffinity.None */), new Position(1, 8));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), 2 /* PositionAffinity.None */), new Position(1, 11));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), 2 /* PositionAffinity.None */), new Position(1, 11));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), 2 /* PositionAffinity.None */), new Position(1, 13));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), 0 /* PositionAffinity.Left */), new Position(1, 8));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), 0 /* PositionAffinity.Left */), new Position(1, 8));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), 0 /* PositionAffinity.Left */), new Position(1, 8));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), 0 /* PositionAffinity.Left */), new Position(1, 8));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), 0 /* PositionAffinity.Left */), new Position(1, 8));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), 1 /* PositionAffinity.Right */), new Position(1, 13));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), 1 /* PositionAffinity.Right */), new Position(1, 13));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), 1 /* PositionAffinity.Right */), new Position(1, 13));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), 1 /* PositionAffinity.Right */), new Position(1, 13));
            assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), 1 /* PositionAffinity.Right */), new Position(1, 13));
        });
    });
    test('issue #193262: Incorrect implementation of modifyPosition', () => {
        testViewModel([
            'just some text'
        ], {
            wordWrap: 'wordWrapColumn',
            wordWrapColumn: 5
        }, (viewModel, model) => {
            assert.deepStrictEqual(new Position(3, 1), viewModel.modifyPosition(new Position(3, 2), -1));
        });
    });
    suite('hidden areas must always leave at least one visible line', () => {
        test('replacing the only visible line content does not make it hidden', () => {
            const text = [
                'line1',
                'line2',
                'line3',
            ];
            testViewModel(text, {}, (viewModel, model) => {
                // Hide lines 1 and 3, leaving only line 2 visible
                viewModel.setHiddenAreas([
                    new Range(1, 1, 1, 1),
                    new Range(3, 1, 3, 1),
                ]);
                assert.strictEqual(viewModel.getLineCount(), 1);
                // Replace line 2 content entirely
                model.applyEdits([{
                        range: new Range(2, 1, 2, 6),
                        text: 'new content'
                    }]);
                assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
            });
        });
        test('deleting the only visible line when it is the last line', () => {
            const text = [
                'line1',
                'line2',
                'line3',
            ];
            testViewModel(text, {}, (viewModel, model) => {
                // Hide lines 1-2, leaving only line 3 visible
                viewModel.setHiddenAreas([new Range(1, 1, 2, 1)]);
                assert.strictEqual(viewModel.getLineCount(), 1);
                // Delete line 3 by merging it into line 2
                model.applyEdits([{
                        range: new Range(2, 6, 3, 6),
                        text: null
                    }]);
                assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
            });
        });
        test('deleting the only visible line when it is in the middle', () => {
            const text = [
                'line1',
                'line2',
                'line3',
                'line4',
                'line5',
            ];
            testViewModel(text, {}, (viewModel, model) => {
                // Hide lines 1-2 and 4-5, leaving only line 3 visible
                viewModel.setHiddenAreas([
                    new Range(1, 1, 2, 1),
                    new Range(4, 1, 5, 1),
                ]);
                assert.strictEqual(viewModel.getLineCount(), 1);
                // Delete line 3 by merging adjacent lines
                model.applyEdits([{
                        range: new Range(2, 6, 4, 1),
                        text: null
                    }]);
                assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
            });
        });
        test('undo that removes the only visible line', () => {
            const text = [
                'line1',
            ];
            testViewModel(text, {}, (viewModel, model) => {
                assert.strictEqual(viewModel.getLineCount(), 1);
                // Insert lines to create content
                model.pushEditOperations([], [{
                        range: new Range(1, 6, 1, 6),
                        text: '\nline2\nline3\nline4\nline5'
                    }], () => ([]));
                assert.strictEqual(viewModel.getLineCount(), 5);
                // Hide lines 1-2 and 4-5, leaving only line 3 visible
                viewModel.setHiddenAreas([
                    new Range(1, 1, 2, 1),
                    new Range(4, 1, 5, 1),
                ]);
                assert.strictEqual(viewModel.getLineCount(), 1);
                // Undo collapses back to 1 line, but hidden area decorations may grow
                model.undo();
                assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
            });
        });
        test('deleting the only visible line between two hidden areas leaves all lines hidden', () => {
            const text = [
                'line1',
                'line2',
                'line3',
                'line4',
                'line5',
                'line6',
                'line7',
                'line8',
            ];
            testViewModel(text, {}, (viewModel, model) => {
                assert.strictEqual(viewModel.getLineCount(), 8);
                // Hide lines 1-5 and 7-8, leaving only line 6 visible
                viewModel.setHiddenAreas([
                    new Range(1, 1, 5, 1),
                    new Range(7, 1, 8, 1),
                ]);
                assert.strictEqual(viewModel.getLineCount(), 1);
                // Delete lines 6, 7, 8 — the only visible line plus some hidden ones
                model.applyEdits([{
                        range: new Range(6, 1, 8, 5),
                        text: null
                    }]);
                // The view model must still have at least one visible line
                assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
            });
        });
        test('multiple visible lines deleted leaving only hidden lines', () => {
            const text = [
                'hidden1',
                'hidden2',
                'visible1',
                'visible2',
                'hidden3',
                'hidden4',
            ];
            testViewModel(text, {}, (viewModel, model) => {
                viewModel.setHiddenAreas([
                    new Range(1, 1, 2, 1),
                    new Range(5, 1, 6, 1),
                ]);
                assert.strictEqual(viewModel.getLineCount(), 2);
                // Delete visible lines 3 and 4
                model.applyEdits([{
                        range: new Range(2, 8, 5, 1),
                        text: null
                    }]);
                assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
            });
        });
        test('hidden areas from multiple sources that overlap produce valid merged result', () => {
            const text = [];
            for (let i = 1; i <= 10; i++) {
                text.push(`line${i}`);
            }
            testViewModel(text, {}, (viewModel, model) => {
                // Source A hides a large range [1-8].
                // Source B hides small ranges [2-3] and [5-6] that are subsumed by A.
                // mergeLineRangeArray has a bug where it advances both pointers after
                // merging [1-8]+[2-3]=[1-8], leaving [5-6] and [8,9] as separate entries
                // that overlap with or are subsumed by [1-8].
                // normalizeLineRanges in setHiddenAreas cleans this up, so the result
                // should still be correct: lines 1-8 hidden, lines 9-10 visible.
                viewModel.setHiddenAreas([new Range(1, 1, 8, 1)], 'sourceA');
                viewModel.setHiddenAreas([new Range(2, 1, 3, 1), new Range(5, 1, 6, 1), new Range(8, 1, 9, 1)], 'sourceB');
                // Lines 1-9 should be hidden (merged from [1-8] and [8-9]), line 10 visible
                assert.strictEqual(viewModel.getLineCount(), 1, 'only line 10 should be visible');
                // The hidden areas returned should be non-overlapping and sorted
                const hiddenAreas = viewModel.getHiddenAreas();
                for (let i = 1; i < hiddenAreas.length; i++) {
                    assert.ok(hiddenAreas[i].startLineNumber > hiddenAreas[i - 1].endLineNumber, `hidden areas should not overlap: [${hiddenAreas[i - 1].startLineNumber}-${hiddenAreas[i - 1].endLineNumber}] and [${hiddenAreas[i].startLineNumber}-${hiddenAreas[i].endLineNumber}]`);
                }
            });
        });
        test('tab size change with drifted hidden area decorations must not leave 0 visible lines', () => {
            const text = [
                'line1',
                'line2',
                'line3',
            ];
            testViewModel(text, {}, (viewModel, model) => {
                // Hide lines 1-2, leaving only line 3 visible.
                viewModel.setHiddenAreas([new Range(1, 1, 2, 1)]);
                assert.strictEqual(viewModel.getLineCount(), 1);
                // Insert at (2,1) — the end edge of the hidden area decoration.
                // AlwaysGrowsWhenTypingAtEdges causes the decoration to grow from
                // [1,1 → 2,1] to [1,1 → 3,1], covering what was the visible line 3.
                // After this insert, the file has 4 lines, decoration covers [1-3], line 4 visible.
                model.applyEdits([{ range: new Range(2, 1, 2, 1), text: 'x\n' }]);
                // Insert again to push decoration further
                model.applyEdits([{ range: new Range(3, 1, 3, 1), text: 'y\n' }]);
                // Now file has 5 lines, decoration covers [1-4], line 5 visible.
                // Delete lines 4-5 to collapse back, making decoration cover everything
                model.applyEdits([{ range: new Range(4, 1, 5, 6), text: '' }]);
                // Now file has 4 lines. acceptVersionId ensures viewLines >= 1.
                // Tab size change: triggers _constructLines(resetHiddenAreas=false)
                // which re-reads the decoration ranges (which may cover all lines).
                model.updateOptions({ tabSize: 8 });
                assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld01vZGVsSW1wbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvYnJvd3Nlci92aWV3TW9kZWwvdmlld01vZGVsSW1wbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXRELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXZFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNuRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRTNGLEtBQUssQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO0lBRXZCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHlFQUF5RSxFQUFFLEdBQUcsRUFBRTtRQUNwRixNQUFNLElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2xCLE1BQU0sSUFBSSxHQUFHO1lBQ1osbUJBQW1CLEVBQUUsQ0FBQztTQUN0QixDQUFDO1FBQ0YsYUFBYSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFF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