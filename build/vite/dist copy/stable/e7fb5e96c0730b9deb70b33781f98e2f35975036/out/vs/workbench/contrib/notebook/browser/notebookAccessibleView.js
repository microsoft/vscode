/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { getNotebookEditorFromEditorPane } from './notebookBrowser.js';
import { NOTEBOOK_CELL_LIST_FOCUSED } from '../common/notebookContextKeys.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { InputFocusedContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { getAllOutputsText } from './viewModel/cellOutputTextHelper.js';
export class NotebookAccessibleView {
    constructor() {
        this.priority = 100;
        this.name = 'notebook';
        this.type = "view" /* AccessibleViewType.View */;
        this.when = ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated());
    }
    getProvider(accessor) {
        const editorService = accessor.get(IEditorService);
        return getAccessibleOutputProvider(editorService);
    }
}
export function getAccessibleOutputProvider(editorService) {
    const activePane = editorService.activeEditorPane;
    const notebookEditor = getNotebookEditorFromEditorPane(activePane);
    const notebookViewModel = notebookEditor?.getViewModel();
    const selections = notebookViewModel?.getSelections();
    const notebookDocument = notebookViewModel?.notebookDocument;
    if (!selections || !notebookDocument || !notebookEditor?.textModel) {
        return;
    }
    const viewCell = notebookViewModel.viewCells[selections[0].start];
    const outputContent = getAllOutputsText(notebookDocument, viewCell);
    if (!outputContent) {
        return;
    }
    return new AccessibleContentProvider("notebook" /* AccessibleViewProviderId.Notebook */, { type: "view" /* AccessibleViewType.View */ }, () => { return outputContent; }, () => {
        notebookEditor?.setFocus(selections[0]);
        notebookEditor.focus();
    }, "accessibility.verbosity.notebook" /* AccessibilityVerbositySettingId.Notebook */);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tBY2Nlc3NpYmxlVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tBY2Nlc3NpYmxlVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQWdELHlCQUF5QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFFdkosT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBR3RGLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUV4RSxNQUFNLE9BQU8sc0JBQXNCO0lBQW5DO1FBQ1UsYUFBUSxHQUFHLEdBQUcsQ0FBQztRQUNmLFNBQUksR0FBRyxVQUFVLENBQUM7UUFDbEIsU0FBSSx3Q0FBMkI7UUFDL0IsU0FBSSxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEVBQUUsbUJBQW1CLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUtqRyxDQUFDO0lBSkEsV0FBVyxDQUFDLFFBQTBCO1FBQ3JDLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDbkQsT0FBTywyQkFBMkIsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNuRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLFVBQVUsMkJBQTJCLENBQUMsYUFBNkI7SUFDeEUsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLGdCQUFnQixDQUFDO0lBQ2xELE1BQU0sY0FBYyxHQUFHLCtCQUErQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ25FLE1BQU0saUJBQWlCLEdBQUcsY0FBYyxFQUFFLFlBQVksRUFBRSxDQUFDO0lBQ3pELE1BQU0sVUFBVSxHQUFHLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxDQUFDO0lBQ3RELE1BQU0sZ0JBQWdCLEdBQUcsaUJBQWlCLEVBQUUsZ0JBQWdCLENBQUM7SUFFN0QsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLGdCQUFnQixJQUFJLENBQUMsY0FBYyxFQUFFLFNBQVMsRUFBRSxDQUFDO1FBQ3BFLE9BQU87SUFDUixDQUFDO0lBRUQsTUFBTSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNsRSxNQUFNLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQyxnQkFBZ0IsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUVwRSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDcEIsT0FBTztJQUNSLENBQUM7SUFFRCxPQUFPLElBQUkseUJBQXlCLHFEQUVuQyxFQUFFLElBQUksc0NBQXlCLEVBQUUsRUFDakMsR0FBRyxFQUFFLEdBQUcsT0FBTyxhQUFhLENBQUMsQ0FBQyxDQUFDLEVBQy9CLEdBQUcsRUFBRTtRQUNKLGNBQWMsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEMsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3hCLENBQUMsb0ZBRUQsQ0FBQztBQUNILENBQUMifQ==