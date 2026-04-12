/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Selection } from '../../../../common/core/selection.js';
import { CopyLinesCommand } from '../../browser/copyLinesCommand.js';
import { DuplicateSelectionAction } from '../../browser/linesOperations.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { testCommand } from '../../../../test/browser/testCommand.js';
function testCopyLinesDownCommand(lines, selection, expectedLines, expectedSelection) {
    testCommand(lines, null, selection, (accessor, sel) => new CopyLinesCommand(sel, true), expectedLines, expectedSelection);
}
function testCopyLinesUpCommand(lines, selection, expectedLines, expectedSelection) {
    testCommand(lines, null, selection, (accessor, sel) => new CopyLinesCommand(sel, false), expectedLines, expectedSelection);
}
suite('Editor Contrib - Copy Lines Command', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('copy first line down', function () {
        testCopyLinesDownCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 3, 1, 1), [
            'first',
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 3, 2, 1));
    });
    test('copy first line up', function () {
        testCopyLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 3, 1, 1), [
            'first',
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(1, 3, 1, 1));
    });
    test('copy last line down', function () {
        testCopyLinesDownCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(5, 3, 5, 1), [
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth',
            'fifth'
        ], new Selection(6, 3, 6, 1));
    });
    test('copy last line up', function () {
        testCopyLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(5, 3, 5, 1), [
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth',
            'fifth'
        ], new Selection(5, 3, 5, 1));
    });
    test('issue #1322: copy line up', function () {
        testCopyLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(3, 11, 3, 11), [
            'first',
            'second line',
            'third line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(3, 11, 3, 11));
    });
    test('issue #1322: copy last line up', function () {
        testCopyLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(5, 6, 5, 6), [
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth',
            'fifth'
        ], new Selection(5, 6, 5, 6));
    });
    test('copy many lines up', function () {
        testCopyLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(4, 3, 2, 1), [
            'first',
            'second line',
            'third line',
            'fourth line',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(4, 3, 2, 1));
    });
    test('ignore empty selection', function () {
        testCopyLinesUpCommand([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 1, 1, 1), [
            'first',
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], new Selection(2, 1, 1, 1));
    });
});
suite('Editor Contrib - Duplicate Selection', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const duplicateSelectionAction = new DuplicateSelectionAction();
    function testDuplicateSelectionAction(lines, selections, expectedLines, expectedSelections) {
        withTestCodeEditor(lines.join('\n'), {}, (editor) => {
            editor.setSelections(selections);
            duplicateSelectionAction.run(null, editor, {});
            assert.deepStrictEqual(editor.getValue(), expectedLines.join('\n'));
            assert.deepStrictEqual(editor.getSelections().map(s => s.toString()), expectedSelections.map(s => s.toString()));
        });
    }
    test('empty selection', function () {
        testDuplicateSelectionAction([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], [new Selection(2, 2, 2, 2), new Selection(3, 2, 3, 2)], [
            'first',
            'second line',
            'second line',
            'third line',
            'third line',
            'fourth line',
            'fifth'
        ], [new Selection(3, 2, 3, 2), new Selection(5, 2, 5, 2)]);
    });
    test('with selection', function () {
        testDuplicateSelectionAction([
            'first',
            'second line',
            'third line',
            'fourth line',
            'fifth'
        ], [new Selection(2, 1, 2, 4), new Selection(3, 1, 3, 4)], [
            'first',
            'secsecond line',
            'thithird line',
            'fourth line',
            'fifth'
        ], [new Selection(2, 4, 2, 7), new Selection(3, 4, 3, 7)]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29weUxpbmVzQ29tbWFuZC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvbGluZXNPcGVyYXRpb25zL3Rlc3QvYnJvd3Nlci9jb3B5TGluZXNDb21tYW5kLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNoRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFdEUsU0FBUyx3QkFBd0IsQ0FBQyxLQUFlLEVBQUUsU0FBb0IsRUFBRSxhQUF1QixFQUFFLGlCQUE0QjtJQUM3SCxXQUFXLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxJQUFJLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsRUFBRSxhQUFhLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztBQUMzSCxDQUFDO0FBRUQsU0FBUyxzQkFBc0IsQ0FBQyxLQUFlLEVBQUUsU0FBb0IsRUFBRSxhQUF1QixFQUFFLGlCQUE0QjtJQUMzSCxXQUFXLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxJQUFJLGdCQUFnQixD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