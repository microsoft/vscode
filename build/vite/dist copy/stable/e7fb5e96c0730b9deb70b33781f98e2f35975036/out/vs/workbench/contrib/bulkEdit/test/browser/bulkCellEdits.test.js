/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { mockObject } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { UndoRedoGroup, UndoRedoSource } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { BulkCellEdits, ResourceNotebookCellEdit } from '../../browser/bulkCellEdits.js';
import { CellUri } from '../../../notebook/common/notebookCommon.js';
import { TestEditorService } from '../../../../test/browser/workbenchTestServices.js';
suite('BulkCellEdits', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    async function runTest(inputUri, resolveUri) {
        const progress = { report: _ => { } };
        const editorService = store.add(new TestEditorService());
        const notebook = mockObject()();
        notebook.uri.returns(URI.file('/project/notebook.ipynb'));
        // eslint-disable-next-line local/code-no-any-casts
        const notebookEditorModel = mockObject()({ notebook: notebook });
        notebookEditorModel.isReadonly.returns(false);
        const notebookService = mockObject()();
        notebookService.resolve.returns({ object: notebookEditorModel, dispose: () => { } });
        const edits = [
            new ResourceNotebookCellEdit(inputUri, { index: 0, count: 1, editType: 1 /* CellEditType.Replace */, cells: [] })
        ];
        // eslint-disable-next-line local/code-no-any-casts
        const bce = new BulkCellEdits(new UndoRedoGroup(), new UndoRedoSource(), progress, CancellationToken.None, edits, editorService, notebookService);
        await bce.apply();
        const resolveArgs = notebookService.resolve.args[0];
        assert.strictEqual(resolveArgs[0].toString(), resolveUri.toString());
    }
    const notebookUri = URI.file('/foo/bar.ipynb');
    test('works with notebook URI', async () => {
        await runTest(notebookUri, notebookUri);
    });
    test('maps cell URI to notebook URI', async () => {
        await runTest(CellUri.generate(notebookUri, 5), notebookUri);
    });
    test('throws for invalid cell URI', async () => {
        const badCellUri = CellUri.generate(notebookUri, 5).with({ fragment: '' });
        await assert.rejects(async () => await runTest(badCellUri, notebookUri));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa0NlbGxFZGl0cy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnVsa0VkaXQvdGVzdC9icm93c2VyL2J1bGtDZWxsRWRpdHMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsYUFBYSxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxhQUFhLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUV6RixPQUFPLEVBQWdCLE9BQU8sRUFBZ0MsTUFBTSw0Q0FBNEMsQ0FBQztBQUVqSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUV0RixLQUFLLENBQUMsZUFBZSxFQUFFO0lBQ3RCLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsS0FBSyxVQUFVLE9BQU8sQ0FBQyxRQUFhLEVBQUUsVUFBZTtRQUNwRCxNQUFNLFFBQVEsR0FBb0IsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUN2RCxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBRXpELE1BQU0sUUFBUSxHQUFHLFVBQVUsRUFBcUIsRUFBRSxDQUFDO1FBQ25ELFFBQVEsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDO1FBRTFELG1EQUFtRDtRQUNuRCxNQUFNLG1CQUFtQixHQUFHLFVBQVUsRUFBZ0MsQ0FBQyxFQUFFLFFBQVEsRUFBRSxRQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQ3RHLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFOUMsTUFBTSxlQUFlLEdBQUcsVUFBVSxFQUF1QyxFQUFFLENBQUM7UUFDNUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxNQUFNLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFckYsTUFBTSxLQUFLLEdBQUc7WUFDYixJQUFJLHdCQUF3QixDQUFDLFFBQVEsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxRQUFRLDhCQUFzQixFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUN6RyxDQUFDO1FBQ0YsbURBQW1EO1FBQ25ELE1BQU0sR0FBRyxHQUFHLElBQUksYUFBYSxDQUFDLElBQUksYUFBYSxFQUFFLEVBQUUsSUFBSSxjQUFjLEVBQUUsRUFBRSxRQUFRLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsZUFBc0IsQ0FBQyxDQUFDO1FBQ3pKLE1BQU0sR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRWxCLE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFFRCxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDL0MsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzFDLE1BQU0sT0FBTyxDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUN6QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNoRCxNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUM5RCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2QkFBNkIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM5QyxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzRSxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQyxNQUFNLE9BQU8sQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUMxRSxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=