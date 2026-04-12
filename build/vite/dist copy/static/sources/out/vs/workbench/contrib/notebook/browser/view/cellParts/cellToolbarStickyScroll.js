/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { combinedDisposable } from '../../../../../../base/common/lifecycle.js';
import { clamp } from '../../../../../../base/common/numbers.js';
export function registerCellToolbarStickyScroll(notebookEditor, cell, element, opts) {
    const extraOffset = opts?.extraOffset ?? 0;
    const min = opts?.min ?? 0;
    const updateForScroll = () => {
        if (cell.isInputCollapsed) {
            element.style.top = '';
        }
        else {
            const scrollTop = notebookEditor.scrollTop;
            const elementTop = notebookEditor.getAbsoluteTopOfElement(cell);
            const diff = scrollTop - elementTop + extraOffset;
            const maxTop = cell.layoutInfo.editorHeight + cell.layoutInfo.statusBarHeight - 45; // subtract roughly the height of the execution order label plus padding
            const top = maxTop > 20 ? // Don't move the run button if it can only move a very short distance
                clamp(min, diff, maxTop) :
                min;
            element.style.top = `${top}px`;
        }
    };
    updateForScroll();
    const disposables = [];
    disposables.push(notebookEditor.onDidScroll(() => updateForScroll()), notebookEditor.onDidChangeLayout(() => updateForScroll()));
    return combinedDisposable(...disposables);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbFRvb2xiYXJTdGlja3lTY3JvbGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXcvY2VsbFBhcnRzL2NlbGxUb29sYmFyU3RpY2t5U2Nyb2xsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBZSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUdqRSxNQUFNLFVBQVUsK0JBQStCLENBQUMsY0FBK0IsRUFBRSxJQUFvQixFQUFFLE9BQW9CLEVBQUUsSUFBNkM7SUFDekssTUFBTSxXQUFXLEdBQUcsSUFBSSxFQUFFLFdBQVcsSUFBSSxDQUFDLENBQUM7SUFDM0MsTUFBTSxHQUFHLEdBQUcsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFFM0IsTUFBTSxlQUFlLEdBQUcsR0FBRyxFQUFFO1FBQzVCLElBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDM0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDO1FBQ3hCLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxTQUFTLEdBQUcsY0FBYyxDQUFDLFNBQVMsQ0FBQztZQUMzQyxNQUFNLFVBQVUsR0FBRyxjQUFjLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEUsTUFBTSxJQUFJLEdBQUcsU0FBUyxHQUFHLFVBQVUsR0FBRyxXQUFXLENBQUM7WUFDbEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFDLENBQUMsd0VBQXdFO1lBQzVKLE1BQU0sR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLHNFQUFzRTtnQkFDL0YsS0FBSyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDMUIsR0FBRyxDQUFDO1lBQ0wsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQztRQUNoQyxDQUFDO0lBQ0YsQ0FBQyxDQUFDO0lBRUYsZUFBZSxFQUFFLENBQUM7SUFDbEIsTUFBTSxXQUFXLEdBQWtCLEVBQUUsQ0FBQztJQUN0QyxXQUFXLENBQUMsSUFBSSxDQUNmLGNBQWMsQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsZUFBZSxFQUFFLENBQUMsRUFDbkQsY0FBYyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQ3pELENBQUM7SUFFRixPQUFPLGtCQUFrQixDQUFDLEdBQUcsV0FBVyxDQUFDLENBQUM7QUFDM0MsQ0FBQyJ9