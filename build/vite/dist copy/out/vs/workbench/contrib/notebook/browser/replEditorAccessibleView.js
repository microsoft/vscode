/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { isReplEditorControl } from '../../replNotebook/browser/replEditor.js';
import { IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED } from '../common/notebookContextKeys.js';
import { getAllOutputsText } from './viewModel/cellOutputTextHelper.js';
/**
 * The REPL input is already accessible, so we can show a view for the most recent execution output.
 */
export class ReplEditorAccessibleView {
    constructor() {
        this.priority = 100;
        this.name = 'replEditorInput';
        this.type = "view" /* AccessibleViewType.View */;
        this.when = ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED.negate());
    }
    getProvider(accessor) {
        const editorService = accessor.get(IEditorService);
        return getAccessibleOutputProvider(editorService);
    }
}
export function getAccessibleOutputProvider(editorService) {
    const editorControl = editorService.activeEditorPane?.getControl();
    if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
        const notebookEditor = editorControl.notebookEditor;
        const viewModel = notebookEditor?.getViewModel();
        if (notebookEditor && viewModel) {
            // last cell of the viewmodel is the last cell history
            const lastCellIndex = viewModel.length - 1;
            if (lastCellIndex >= 0) {
                const cell = viewModel.viewCells[lastCellIndex];
                const outputContent = getAllOutputsText(viewModel.notebookDocument, cell);
                if (outputContent) {
                    return new AccessibleContentProvider("notebook" /* AccessibleViewProviderId.Notebook */, { type: "view" /* AccessibleViewType.View */ }, () => { return outputContent; }, () => {
                        editorControl.activeCodeEditor?.focus();
                    }, "accessibility.verbosity.replEditor" /* AccessibilityVerbositySettingId.ReplEditor */);
                }
            }
        }
    }
    return;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbEVkaXRvckFjY2Vzc2libGVWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9yZXBsRWRpdG9yQWNjZXNzaWJsZVZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFzQix5QkFBeUIsRUFBNEIsTUFBTSw4REFBOEQsQ0FBQztBQUV2SixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRWxGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXhFOztHQUVHO0FBQ0gsTUFBTSxPQUFPLHdCQUF3QjtJQUFyQztRQUNVLGFBQVEsR0FBRyxHQUFHLENBQUM7UUFDZixTQUFJLEdBQUcsaUJBQWlCLENBQUM7UUFDekIsU0FBSSx3Q0FBMkI7UUFDL0IsU0FBSSxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsMEJBQTBCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUtoRyxDQUFDO0lBSkEsV0FBVyxDQUFDLFFBQTBCO1FBQ3JDLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDbkQsT0FBTywyQkFBMkIsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNuRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLFVBQVUsMkJBQTJCLENBQUMsYUFBNkI7SUFDeEUsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDLGdCQUFnQixFQUFFLFVBQVUsRUFBRSxDQUFDO0lBRW5FLElBQUksYUFBYSxJQUFJLG1CQUFtQixDQUFDLGFBQWEsQ0FBQyxJQUFJLGFBQWEsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN6RixNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsY0FBYyxDQUFDO1FBQ3BELE1BQU0sU0FBUyxHQUFHLGNBQWMsRUFBRSxZQUFZLEVBQUUsQ0FBQztRQUNqRCxJQUFJLGNBQWMsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNqQyxzREFBc0Q7WUFDdEQsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7WUFDM0MsSUFBSSxhQUFhLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQ3hCLE1BQU0sSUFBSSxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ2hELE1BQU0sYUFBYSxHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFFMUUsSUFBSSxhQUFhLEVBQUUsQ0FBQztvQkFDbkIsT0FBTyxJQUFJLHlCQUF5QixxREFFbkMsRUFBRSxJQUFJLHNDQUF5QixFQUFFLEVBQ2pDLEdBQUcsRUFBRSxHQUFHLE9BQU8sYUFBYSxDQUFDLENBQUMsQ0FBQyxFQUMvQixHQUFHLEVBQUU7d0JBQ0osYUFBYSxDQUFDLGdCQUFnQixFQUFFLEtBQUssRUFBRSxDQUFDO29CQUN6QyxDQUFDLHdGQUVELENBQUM7Z0JBQ0gsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU87QUFDUixDQUFDIn0=