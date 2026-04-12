/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CoreEditingCommands, CoreNavigationCommands } from '../../../../browser/coreCommands.js';
import { Selection } from '../../../../common/core/selection.js';
import { CursorUndo, CursorUndoRedoController } from '../../browser/cursorUndo.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
suite('FindController', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const cursorUndoAction = new CursorUndo();
    test('issue #82535: Edge case with cursorUndo', () => {
        withTestCodeEditor('', {}, (editor) => {
            editor.registerAndInstantiateContribution(CursorUndoRedoController.ID, CursorUndoRedoController);
            // type hello
            editor.trigger('test', "type" /* Handler.Type */, { text: 'hello' });
            // press left
            editor.runCommand(CoreNavigationCommands.CursorLeft, {});
            // press Delete
            editor.runCommand(CoreEditingCommands.DeleteRight, {});
            assert.deepStrictEqual(editor.getValue(), 'hell');
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 5, 1, 5)]);
            // press left
            editor.runCommand(CoreNavigationCommands.CursorLeft, {});
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 4)]);
            // press Ctrl+U
            cursorUndoAction.run(null, editor, {});
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 5, 1, 5)]);
        });
    });
    test('issue #82535: Edge case with cursorUndo (reverse)', () => {
        withTestCodeEditor('', {}, (editor) => {
            editor.registerAndInstantiateContribution(CursorUndoRedoController.ID, CursorUndoRedoController);
            // type hello
            editor.trigger('test', "type" /* Handler.Type */, { text: 'hell' });
            editor.trigger('test', "type" /* Handler.Type */, { text: 'o' });
            assert.deepStrictEqual(editor.getValue(), 'hello');
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 6, 1, 6)]);
            // press Ctrl+U
            cursorUndoAction.run(null, editor, {});
            assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 6, 1, 6)]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3Vyc29yVW5kby50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY3Vyc29yVW5kby90ZXN0L2Jyb3dzZXIvY3Vyc29yVW5kby50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsT0FBTyxFQUFFLFVBQVUsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ25GLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRWhGLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7SUFFNUIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxNQUFNLGdCQUFnQixHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEdBQUcsRUFBRTtRQUNwRCxrQkFBa0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFFckMsTUFBTSxDQUFDLGtDQUFrQyxDQUFDLHdCQUF3QixDQUFDLEVBQUUsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1lBRWpHLGFBQWE7WUFDYixNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sNkJBQWdCLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFFeEQsYUFBYTtZQUNiLE1BQU0sQ0FBQyxVQUFVLENBQUMsc0JBQXNCLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRXpELGVBQWU7WUFDZixNQUFNLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN2RCxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNsRCxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUU1RSxhQUFhO1lBQ2IsTUFBTSxDQUFDLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDekQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFNUUsZUFBZTtZQUNmLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxJQUFLLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsSUFBSSxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbURBQW1ELEVBQUUsR0FBRyxFQUFFO1FBQzlELGtCQUFrQixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUVyQyxNQUFNLENBQUMsa0NBQWtDLENBQUMsd0JBQXdCLENBQUMsRUFBRSxFQUFFLHdCQUF3QixDQUFDLENBQUM7WUFFakcsYUFBYTtZQUNiLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSw2QkFBZ0IsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztZQUN2RCxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sNkJBQWdCLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7WUFDcEQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbkQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFNUUsZUFBZTtZQUNmLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxJQUFLLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsSUFBSSxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9