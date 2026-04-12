/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { getSelectionSearchString } from '../../browser/findController.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
suite('Find', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('search string at position', () => {
        withTestCodeEditor([
            'ABC DEF',
            '0123 456'
        ], {}, (editor) => {
            // The cursor is at the very top, of the file, at the first ABC
            const searchStringAtTop = getSelectionSearchString(editor);
            assert.strictEqual(searchStringAtTop, 'ABC');
            // Move cursor to the end of ABC
            editor.setPosition(new Position(1, 3));
            const searchStringAfterABC = getSelectionSearchString(editor);
            assert.strictEqual(searchStringAfterABC, 'ABC');
            // Move cursor to DEF
            editor.setPosition(new Position(1, 5));
            const searchStringInsideDEF = getSelectionSearchString(editor);
            assert.strictEqual(searchStringInsideDEF, 'DEF');
        });
    });
    test('search string with selection', () => {
        withTestCodeEditor([
            'ABC DEF',
            '0123 456'
        ], {}, (editor) => {
            // Select A of ABC
            editor.setSelection(new Range(1, 1, 1, 2));
            const searchStringSelectionA = getSelectionSearchString(editor);
            assert.strictEqual(searchStringSelectionA, 'A');
            // Select BC of ABC
            editor.setSelection(new Range(1, 2, 1, 4));
            const searchStringSelectionBC = getSelectionSearchString(editor);
            assert.strictEqual(searchStringSelectionBC, 'BC');
            // Select BC DE
            editor.setSelection(new Range(1, 2, 1, 7));
            const searchStringSelectionBCDE = getSelectionSearchString(editor);
            assert.strictEqual(searchStringSelectionBCDE, 'BC DE');
        });
    });
    test('search string with multiline selection', () => {
        withTestCodeEditor([
            'ABC DEF',
            '0123 456'
        ], {}, (editor) => {
            // Select first line and newline
            editor.setSelection(new Range(1, 1, 2, 1));
            const searchStringSelectionWholeLine = getSelectionSearchString(editor);
            assert.strictEqual(searchStringSelectionWholeLine, null);
            // Select first line and chunk of second
            editor.setSelection(new Range(1, 1, 2, 4));
            const searchStringSelectionTwoLines = getSelectionSearchString(editor);
            assert.strictEqual(searchStringSelectionTwoLines, null);
            // Select end of first line newline and chunk of second
            editor.setSelection(new Range(1, 7, 2, 4));
            const searchStringSelectionSpanLines = getSelectionSearchString(editor);
            assert.strictEqual(searchStringSelectionSpanLines, null);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZmluZC90ZXN0L2Jyb3dzZXIvZmluZC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBR2hGLEtBQUssQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFO0lBRWxCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtRQUN0QyxrQkFBa0IsQ0FBQztZQUNsQixTQUFTO1lBQ1QsVUFBVTtTQUNWLEVBQUUsRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFFakIsK0RBQStEO1lBQy9ELE1BQU0saUJBQWlCLEdBQUcsd0JBQXdCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUU3QyxnQ0FBZ0M7WUFDaEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxNQUFNLG9CQUFvQixHQUFHLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzlELE1BQU0sQ0FBQyxXQUFXLENBQUMsb0JBQW9C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