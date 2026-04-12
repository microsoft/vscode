/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isTextEditorViewState } from '../editor.js';
export function applyTextEditorOptions(options, editor, scrollType) {
    let applied = false;
    // Restore view state if any
    const viewState = massageEditorViewState(options);
    if (isTextEditorViewState(viewState)) {
        editor.restoreViewState(viewState);
        applied = true;
    }
    // Restore selection if any
    if (options.selection) {
        const range = {
            startLineNumber: options.selection.startLineNumber,
            startColumn: options.selection.startColumn,
            endLineNumber: options.selection.endLineNumber ?? options.selection.startLineNumber,
            endColumn: options.selection.endColumn ?? options.selection.startColumn
        };
        // Apply selection with a source so that listeners can
        // distinguish this selection change from others.
        // If no source is provided, set a default source to
        // signal this navigation.
        editor.setSelection(range, options.selectionSource ?? "code.navigation" /* TextEditorSelectionSource.NAVIGATION */);
        // Reveal selection
        if (options.selectionRevealType === 2 /* TextEditorSelectionRevealType.NearTop */) {
            editor.revealRangeNearTop(range, scrollType);
        }
        else if (options.selectionRevealType === 3 /* TextEditorSelectionRevealType.NearTopIfOutsideViewport */) {
            editor.revealRangeNearTopIfOutsideViewport(range, scrollType);
        }
        else if (options.selectionRevealType === 1 /* TextEditorSelectionRevealType.CenterIfOutsideViewport */) {
            editor.revealRangeInCenterIfOutsideViewport(range, scrollType);
        }
        else {
            editor.revealRangeInCenter(range, scrollType);
        }
        applied = true;
    }
    return applied;
}
function massageEditorViewState(options) {
    // Without a selection or view state, just return immediately
    if (!options.selection || !options.viewState) {
        return options.viewState;
    }
    // Diff editor: since we have an explicit selection, clear the
    // cursor state from the modified side where the selection
    // applies. This avoids a redundant selection change event.
    const candidateDiffViewState = options.viewState;
    if (candidateDiffViewState.modified) {
        candidateDiffViewState.modified.cursorState = [];
        return candidateDiffViewState;
    }
    // Code editor: since we have an explicit selection, clear the
    // cursor state. This avoids a redundant selection change event.
    const candidateEditorViewState = options.viewState;
    if (candidateEditorViewState.cursorState) {
        candidateEditorViewState.cursorState = [];
    }
    return candidateEditorViewState;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yT3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2VkaXRvck9wdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRXJELE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxPQUEyQixFQUFFLE1BQWUsRUFBRSxVQUFzQjtJQUMxRyxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7SUFFcEIsNEJBQTRCO0lBQzVCLE1BQU0sU0FBUyxHQUFHLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2xELElBQUkscUJBQXFCLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUN0QyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFbkMsT0FBTyxHQUFHLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQsMkJBQTJCO0lBQzNCLElBQUksT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3ZCLE1BQU0sS0FBSyxHQUFXO1lBQ3JCLGVBQWUsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLGVBQWU7WUFDbEQsV0FBVyxFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVztZQUMxQyxhQUFhLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxhQUFhLElBQUksT0FBTyxDQUFDLFNBQVMsQ0FBQyxlQUFlO1lBQ25GLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLFNBQVMsSUFBSSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVc7U0FDdkUsQ0FBQztRQUVGLHNEQUFzRDtRQUN0RCxpREFBaUQ7UUFDakQsb0RBQW9EO1FBQ3BELDBCQUEwQjtRQUMxQixNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsZUFBZSxnRUFBd0MsQ0FBQyxDQUFDO1FBRTVGLG1CQUFtQjtRQUNuQixJQUFJLE9BQU8sQ0FBQyxtQkFBbUIsa0RBQTBDLEVBQUUsQ0FBQztZQUMzRSxNQUFNLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzlDLENBQUM7YUFBTSxJQUFJLE9BQU8sQ0FBQyxtQkFBbUIsbUVBQTJELEVBQUUsQ0FBQztZQUNuRyxNQUFNLENBQUMsbUNBQW1DLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7YUFBTSxJQUFJLE9BQU8sQ0FBQyxtQkFBbUIsa0VBQTBELEVBQUUsQ0FBQztZQUNsRyxNQUFNLENBQUMsb0NBQW9DLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ2hFLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztRQUMvQyxDQUFDO1FBRUQsT0FBTyxHQUFHLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQsT0FBTyxPQUFPLENBQUM7QUFDaEIsQ0FBQztBQUVELFNBQVMsc0JBQXNCLENBQUMsT0FBMkI7SUFFMUQsNkRBQTZEO0lBQzdELElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQzlDLE9BQU8sT0FBTyxDQUFDLFNBQVMsQ0FBQztJQUMxQixDQUFDO0lBRUQsOERBQThEO0lBQzlELDBEQUEwRDtJQUMxRCwyREFBMkQ7SUFDM0QsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUMsU0FBaUMsQ0FBQztJQUN6RSxJQUFJLHNCQUFzQixDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3JDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1FBRWpELE9BQU8sc0JBQXNCLENBQUM7SUFDL0IsQ0FBQztJQUVELDhEQUE4RDtJQUM5RCxnRUFBZ0U7SUFDaEUsTUFBTSx3QkFBd0IsR0FBRyxPQUFPLENBQUMsU0FBaUMsQ0FBQztJQUMzRSxJQUFJLHdCQUF3QixDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQzFDLHdCQUF3QixDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUM7SUFDM0MsQ0FBQztJQUVELE9BQU8sd0JBQXdCLENBQUM7QUFDakMsQ0FBQyJ9