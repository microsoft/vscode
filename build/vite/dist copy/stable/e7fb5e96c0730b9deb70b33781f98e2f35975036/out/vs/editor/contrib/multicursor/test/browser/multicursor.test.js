/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Selection } from '../../../../common/core/selection.js';
import { CommonFindController } from '../../../find/browser/findController.js';
import { AddSelectionToNextFindMatchAction, InsertCursorAbove, InsertCursorBelow, MultiCursorSelectionController, SelectHighlightsAction } from '../../browser/multicursor.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
suite('Multicursor', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('issue #26393: Multiple cursors + Word wrap', () => {
        withTestCodeEditor([
            'a'.repeat(20),
            'a'.repeat(20),
        ], { wordWrap: 'wordWrapColumn', wordWrapColumn: 10 }, (editor, viewModel) => {
            const addCursorDownAction = new InsertCursorBelow();
            addCursorDownAction.run(null, editor, {});
            assert.strictEqual(viewModel.getCursorStates().length, 2);
            assert.strictEqual(viewModel.getCursorStates()[0].viewState.position.lineNumber, 1);
            assert.strictEqual(viewModel.getCursorStates()[1].viewState.position.lineNumber, 3);
            editor.setPosition({ lineNumber: 4, column: 1 });
            const addCursorUpAction = new InsertCursorAbove();
            addCursorUpAction.run(null, editor, {});
            assert.strictEqual(viewModel.getCursorStates().length, 2);
            assert.strictEqual(viewModel.getCursorStates()[0].viewState.position.lineNumber, 4);
            assert.strictEqual(viewModel.getCursorStates()[1].viewState.position.lineNumber, 2);
        });
    });
    test('issue #2205: Multi-cursor pastes in reverse order', () => {
        withTestCodeEditor([
            'abc',
            'def'
        ], {}, (editor, viewModel) => {
            const addCursorUpAction = new InsertCursorAbove();
            editor.setSelection(new Selection(2, 1, 2, 1));
            addCursorUpAction.run(null, editor, {});
            assert.strictEqual(viewModel.getSelections().length, 2);
            editor.trigger('test', "paste" /* Handler.Paste */, {
                text: '1\n2',
                multicursorText: [
                    '1',
                    '2'
                ]
            });
            assert.strictEqual(editor.getModel().getLineContent(1), '1abc');
            assert.strictEqual(editor.getModel().getLineContent(2), '2def');
        });
    });
    test('issue #1336: Insert cursor below on last line adds a cursor to the end of the current line', () => {
        withTestCodeEditor([
            'abc'
        ], {}, (editor, viewModel) => {
            const addCursorDownAction = new InsertCursorBelow();
            addCursorDownAction.run(null, editor, {});
            assert.strictEqual(viewModel.getSelections().length, 1);
        });
    });
});
function fromRange(rng) {
    return [rng.startLineNumber, rng.startColumn, rng.endLineNumber, rng.endColumn];
}
suite('Multicursor selection', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const serviceCollection = new ServiceCollection();
    serviceCollection.set(IStorageService, new InMemoryStorageService());
    test('issue #8817: Cursor position changes when you cancel multicursor', () => {
        withTestCodeEditor([
            'var x = (3 * 5)',
            'var y = (3 * 5)',
            'var z = (3 * 5)',
        ], { serviceCollection: serviceCollection }, (editor) => {
            const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
            const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
            const selectHighlightsAction = new SelectHighlightsAction();
            editor.setSelection(new Selection(2, 9, 2, 16));
            selectHighlightsAction.run(null, editor);
            assert.deepStrictEqual(editor.getSelections().map(fromRange), [
                [2, 9, 2, 16],
                [1, 9, 1, 16],
                [3, 9, 3, 16],
            ]);
            editor.trigger('test', 'removeSecondaryCursors', null);
            assert.deepStrictEqual(fromRange(editor.getSelection()), [2, 9, 2, 16]);
            multiCursorSelectController.dispose();
            findController.dispose();
        });
    });
    test('issue #5400: "Select All Occurrences of Find Match" does not select all if find uses regex', () => {
        withTestCodeEditor([
            'something',
            'someething',
            'someeething',
            'nothing'
        ], { serviceCollection: serviceCollection }, (editor) => {
            const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
            const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
            const selectHighlightsAction = new SelectHighlightsAction();
            editor.setSelection(new Selection(1, 1, 1, 1));
            findController.getState().change({ searchString: 'some+thing', isRegex: true, isRevealed: true }, false);
            selectHighlightsAction.run(null, editor);
            assert.deepStrictEqual(editor.getSelections().map(fromRange), [
                [1, 1, 1, 10],
                [2, 1, 2, 11],
                [3, 1, 3, 12],
            ]);
            assert.strictEqual(findController.getState().searchString, 'some+thing');
            multiCursorSelectController.dispose();
            findController.dispose();
        });
    });
    test('AddSelectionToNextFindMatchAction can work with multiline', () => {
        withTestCodeEditor([
            '',
            'qwe',
            'rty',
            '',
            'qwe',
            '',
            'rty',
            'qwe',
            'rty'
        ], { serviceCollection: serviceCollection }, (editor) => {
            const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
            const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
            const addSelectionToNextFindMatch = new AddSelectionToNextFindMatchAction();
            editor.setSelection(new Selection(2, 1, 3, 4));
            addSelectionToNextFindMatch.run(null, editor);
            assert.deepStrictEqual(editor.getSelections().map(fromRange), [
                [2, 1, 3, 4],
                [8, 1, 9, 4]
            ]);
            editor.trigger('test', 'removeSecondaryCursors', null);
            assert.deepStrictEqual(fromRange(editor.getSelection()), [2, 1, 3, 4]);
            multiCursorSelectController.dispose();
            findController.dispose();
        });
    });
    test('issue #6661: AddSelectionToNextFindMatchAction can work with touching ranges', () => {
        withTestCodeEditor([
            'abcabc',
            'abc',
            'abcabc',
        ], { serviceCollection: serviceCollection }, (editor) => {
            const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
            const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
            const addSelectionToNextFindMatch = new AddSelectionToNextFindMatchAction();
            editor.setSelection(new Selection(1, 1, 1, 4));
            addSelectionToNextFindMatch.run(null, editor);
            assert.deepStrictEqual(editor.getSelections().map(fromRange), [
                [1, 1, 1, 4],
                [1, 4, 1, 7]
            ]);
            addSelectionToNextFindMatch.run(null, editor);
            addSelectionToNextFindMatch.run(null, editor);
            addSelectionToNextFindMatch.run(null, editor);
            assert.deepStrictEqual(editor.getSelections().map(fromRange), [
                [1, 1, 1, 4],
                [1, 4, 1, 7],
                [2, 1, 2, 4],
                [3, 1, 3, 4],
                [3, 4, 3, 7]
            ]);
            editor.trigger('test', "type" /* Handler.Type */, { text: 'z' });
            assert.deepStrictEqual(editor.getSelections().map(fromRange), [
                [1, 2, 1, 2],
                [1, 3, 1, 3],
                [2, 2, 2, 2],
                [3, 2, 3, 2],
                [3, 3, 3, 3]
            ]);
            assert.strictEqual(editor.getValue(), [
                'zz',
                'z',
                'zz',
            ].join('\n'));
            multiCursorSelectController.dispose();
            findController.dispose();
        });
    });
    test('issue #23541: Multiline Ctrl+D does not work in CRLF files', () => {
        withTestCodeEditor([
            '',
            'qwe',
            'rty',
            '',
            'qwe',
            '',
            'rty',
            'qwe',
            'rty'
        ], { serviceCollection: serviceCollection }, (editor) => {
            editor.getModel().setEOL(1 /* EndOfLineSequence.CRLF */);
            const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
            const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
            const addSelectionToNextFindMatch = new AddSelectionToNextFindMatchAction();
            editor.setSelection(new Selection(2, 1, 3, 4));
            addSelectionToNextFindMatch.run(null, editor);
            assert.deepStrictEqual(editor.getSelections().map(fromRange), [
                [2, 1, 3, 4],
                [8, 1, 9, 4]
            ]);
            editor.trigger('test', 'removeSecondaryCursors', null);
            assert.deepStrictEqual(fromRange(editor.getSelection()), [2, 1, 3, 4]);
            multiCursorSelectController.dispose();
            findController.dispose();
        });
    });
    function testMulticursor(text, callback) {
        withTestCodeEditor(text, { serviceCollection: serviceCollection }, (editor) => {
            const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
            const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
            callback(editor, findController);
            multiCursorSelectController.dispose();
            findController.dispose();
        });
    }
    function testAddSelectionToNextFindMatchAction(text, callback) {
        testMulticursor(text, (editor, findController) => {
            const action = new AddSelectionToNextFindMatchAction();
            callback(editor, action, findController);
        });
    }
    test('AddSelectionToNextFindMatchAction starting with single collapsed selection', () => {
        const text = [
            'abc pizza',
            'abc house',
            'abc bar'
        ];
        testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
            editor.setSelections([
                new Selection(1, 2, 1, 2),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
                new Selection(3, 1, 3, 4),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
                new Selection(3, 1, 3, 4),
            ]);
        });
    });
    test('AddSelectionToNextFindMatchAction starting with two selections, one being collapsed 1)', () => {
        const text = [
            'abc pizza',
            'abc house',
            'abc bar'
        ];
        testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
            editor.setSelections([
                new Selection(1, 1, 1, 4),
                new Selection(2, 2, 2, 2),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
                new Selection(3, 1, 3, 4),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
                new Selection(3, 1, 3, 4),
            ]);
        });
    });
    test('AddSelectionToNextFindMatchAction starting with two selections, one being collapsed 2)', () => {
        const text = [
            'abc pizza',
            'abc house',
            'abc bar'
        ];
        testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
            editor.setSelections([
                new Selection(1, 2, 1, 2),
                new Selection(2, 1, 2, 4),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
                new Selection(3, 1, 3, 4),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
                new Selection(3, 1, 3, 4),
            ]);
        });
    });
    test('AddSelectionToNextFindMatchAction starting with all collapsed selections', () => {
        const text = [
            'abc pizza',
            'abc house',
            'abc bar'
        ];
        testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
            editor.setSelections([
                new Selection(1, 2, 1, 2),
                new Selection(2, 2, 2, 2),
                new Selection(3, 1, 3, 1),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
                new Selection(3, 1, 3, 4),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 4),
                new Selection(2, 1, 2, 4),
                new Selection(3, 1, 3, 4),
            ]);
        });
    });
    test('AddSelectionToNextFindMatchAction starting with all collapsed selections on different words', () => {
        const text = [
            'abc pizza',
            'abc house',
            'abc bar'
        ];
        testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
            editor.setSelections([
                new Selection(1, 6, 1, 6),
                new Selection(2, 6, 2, 6),
                new Selection(3, 6, 3, 6),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 5, 1, 10),
                new Selection(2, 5, 2, 10),
                new Selection(3, 5, 3, 8),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 5, 1, 10),
                new Selection(2, 5, 2, 10),
                new Selection(3, 5, 3, 8),
            ]);
        });
    });
    test('issue #20651: AddSelectionToNextFindMatchAction case insensitive', () => {
        const text = [
            'test',
            'testte',
            'Test',
            'testte',
            'test'
        ];
        testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
            editor.setSelections([
                new Selection(1, 1, 1, 5),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 5),
                new Selection(2, 1, 2, 5),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 5),
                new Selection(2, 1, 2, 5),
                new Selection(3, 1, 3, 5),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 5),
                new Selection(2, 1, 2, 5),
                new Selection(3, 1, 3, 5),
                new Selection(4, 1, 4, 5),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 5),
                new Selection(2, 1, 2, 5),
                new Selection(3, 1, 3, 5),
                new Selection(4, 1, 4, 5),
                new Selection(5, 1, 5, 5),
            ]);
            action.run(null, editor);
            assert.deepStrictEqual(editor.getSelections(), [
                new Selection(1, 1, 1, 5),
                new Selection(2, 1, 2, 5),
                new Selection(3, 1, 3, 5),
                new Selection(4, 1, 4, 5),
                new Selection(5, 1, 5, 5),
            ]);
        });
    });
    suite('Find state disassociation', () => {
        const text = [
            'app',
            'apples',
            'whatsapp',
            'app',
            'App',
            ' app'
        ];
        test('enters mode', () => {
            testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
                editor.setSelections([
                    new Selection(1, 2, 1, 2),
                ]);
                action.run(null, editor);
                assert.deepStrictEqual(editor.getSelections(), [
                    new Selection(1, 1, 1, 4),
                ]);
                action.run(null, editor);
                assert.deepStrictEqual(editor.getSelections(), [
                    new Selection(1, 1, 1, 4),
                    new Selection(4, 1, 4, 4),
                ]);
                action.run(null, editor);
                assert.deepStrictEqual(editor.getSelections(), [
                    new Selection(1, 1, 1, 4),
                    new Selection(4, 1, 4, 4),
                    new Selection(6, 2, 6, 5),
                ]);
            });
        });
        test('leaves mode when selection changes', () => {
            testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
                editor.setSelections([
                    new Selection(1, 2, 1, 2),
                ]);
                action.run(null, editor);
                assert.deepStrictEqual(editor.getSelections(), [
                    new Selection(1, 1, 1, 4),
                ]);
                action.run(null, editor);
                assert.deepStrictEqual(editor.getSelections(), [
                    new Selection(1, 1, 1, 4),
                    new Selection(4, 1, 4, 4),
                ]);
                // change selection
                editor.setSelections([
                    new Selection(1, 1, 1, 4),
                ]);
                action.run(null, editor);
                assert.deepStrictEqual(editor.getSelections(), [
                    new Selection(1, 1, 1, 4),
                    new Selection(2, 1, 2, 4),
                ]);
            });
        });
        test('Select Highlights respects mode ', () => {
            testMulticursor(text, (editor, findController) => {
                const action = new SelectHighlightsAction();
                editor.setSelections([
                    new Selection(1, 2, 1, 2),
                ]);
                action.run(null, editor);
                assert.deepStrictEqual(editor.getSelections(), [
                    new Selection(1, 1, 1, 4),
                    new Selection(4, 1, 4, 4),
                    new Selection(6, 2, 6, 5),
                ]);
                action.run(null, editor);
                assert.deepStrictEqual(editor.getSelections(), [
                    new Selection(1, 1, 1, 4),
                    new Selection(4, 1, 4, 4),
                    new Selection(6, 2, 6, 5),
                ]);
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGljdXJzb3IudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL211bHRpY3Vyc29yL3Rlc3QvYnJvd3Nlci9tdWx0aWN1cnNvci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHakUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLDhCQUE4QixFQUFFLHNCQUFzQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDL0ssT0FBTyxFQUFtQixrQkFBa0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUU1RyxLQUFLLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtJQUV6Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7UUFDdkQsa0JBQWtCLENBQUM7WUFDbEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDZCxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztTQUNkLEVBQUUsRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxFQUFFO1lBQzVFLE1B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