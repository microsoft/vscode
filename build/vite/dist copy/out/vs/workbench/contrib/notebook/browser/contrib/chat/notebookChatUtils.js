/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { normalizeDriveLetter } from '../../../../../../base/common/labels.js';
import { basenameOrAuthority } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { CellUri } from '../../../common/notebookCommon.js';
export const NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST = [
    'text/plain',
    'text/html',
    'application/vnd.code.notebook.error',
    'application/vnd.code.notebook.stdout',
    'application/x.notebook.stdout',
    'application/x.notebook.stream',
    'application/vnd.code.notebook.stderr',
    'application/x.notebook.stderr',
    'image/png',
    'image/jpeg',
    'image/svg',
];
export function createNotebookOutputVariableEntry(outputViewModel, mimeType, notebookEditor) {
    // get the cell index
    const cellFromViewModelHandle = outputViewModel.cellViewModel.handle;
    const notebookModel = notebookEditor.textModel;
    const cell = notebookEditor.getCellByHandle(cellFromViewModelHandle);
    if (!cell || cell.outputsViewModels.length === 0 || !notebookModel) {
        return;
    }
    // uri of the cell
    const notebookUri = notebookModel.uri;
    const cellUri = cell.uri;
    const cellIndex = notebookModel.cells.indexOf(cell.model);
    // get the output index
    const outputId = outputViewModel?.model.outputId;
    let outputIndex = 0;
    if (outputId !== undefined) {
        // find the output index
        outputIndex = cell.outputsViewModels.findIndex(output => {
            return output.model.outputId === outputId;
        });
    }
    // construct the URI using the cell uri and output index
    const outputCellUri = CellUri.generateCellOutputUriWithIndex(notebookUri, cellUri, outputIndex);
    const fileName = normalizeDriveLetter(basenameOrAuthority(notebookUri));
    const l = {
        value: outputCellUri,
        id: outputCellUri.toString(),
        name: localize('notebookOutputCellLabel', "{0} • Cell {1} • Output {2}", fileName, `${cellIndex + 1}`, `${outputIndex + 1}`),
        icon: mimeType === 'application/vnd.code.notebook.error' ? ThemeIcon.fromId('error') : undefined,
        kind: 'notebookOutput',
        outputIndex,
        mimeType
    };
    return l;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDaGF0VXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvY2hhdC9ub3RlYm9va0NoYXRVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNqRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRXBELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUc1RCxNQUFNLENBQUMsTUFBTSxrREFBa0QsR0FBRztJQUNqRSxZQUFZO0lBQ1osV0FBVztJQUNYLHFDQUFxQztJQUNyQyxzQ0FBc0M7SUFDdEMsK0JBQStCO0lBQy9CLCtCQUErQjtJQUMvQixzQ0FBc0M7SUFDdEMsK0JBQStCO0lBQy9CLFdBQVc7SUFDWCxZQUFZO0lBQ1osV0FBVztDQUNYLENBQUM7QUFFRixNQUFNLFVBQVUsaUNBQWlDLENBQUMsZUFBcUMsRUFBRSxRQUFnQixFQUFFLGNBQStCO0lBRXpJLHFCQUFxQjtJQUNyQixNQUFNLHVCQUF1QixHQUFHLGVBQWUsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDO0lBQ3JFLE1BQU0sYUFBYSxHQUFHLGNBQWMsQ0FBQyxTQUFTLENBQUM7SUFDL0MsTUFBTSxJQUFJLEdBQUcsY0FBYyxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ3JFLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNwRSxPQUFPO0lBQ1IsQ0FBQztJQUNELGtCQUFrQjtJQUNsQixNQUFNLFdBQVcsR0FBRyxhQUFhLENBQUMsR0FBRyxDQUFDO0lBQ3RDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7SUFDekIsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBRTFELHVCQUF1QjtJQUN2QixNQUFNLFFBQVEsR0FBRyxlQUFlLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQztJQUNqRCxJQUFJLFdBQVcsR0FBVyxDQUFDLENBQUM7SUFDNUIsSUFBSSxRQUFRLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDNUIsd0JBQXdCO1FBQ3hCLFdBQVcsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ3ZELE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDO1FBQzNDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELHdEQUF3RDtJQUN4RCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsOEJBQThCLENBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQztJQUNoRyxNQUFNLFFBQVEsR0FBRyxvQkFBb0IsQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBRXhFLE1BQU0sQ0FBQyxHQUFpQztRQUN2QyxLQUFLLEVBQUUsYUFBYTtRQUNwQixFQUFFLEVBQUUsYUFBYSxDQUFDLFFBQVEsRUFBRTtRQUM1QixJQUFJLEVBQUUsUUFBUSxDQUFDLHlCQUF5QixFQUFFLDZCQUE2QixFQUFFLFFBQVEsRUFBRSxHQUFHLFNBQVMsR0FBRyxDQUFDLEVBQUUsRUFBRSxHQUFHLFdBQVcsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUM1SCxJQUFJLEVBQUUsUUFBUSxLQUFLLHFDQUFxQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ2hHLElBQUksRUFBRSxnQkFBZ0I7UUFDdEIsV0FBVztRQUNYLFFBQVE7S0FDUixDQUFDO0lBRUYsT0FBTyxDQUFDLENBQUM7QUFDVixDQUFDIn0=