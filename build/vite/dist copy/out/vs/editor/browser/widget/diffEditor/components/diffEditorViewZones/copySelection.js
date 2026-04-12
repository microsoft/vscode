/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addDisposableListener } from '../../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Range } from '../../../../../common/core/range.js';
export function enableCopySelection(options) {
    const { domNode, renderLinesResult, diffEntry, originalModel, clipboardService } = options;
    const viewZoneDisposable = new DisposableStore();
    viewZoneDisposable.add(addDisposableListener(domNode, 'copy', (e) => {
        e.preventDefault();
        const selection = domNode.ownerDocument.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }
        const domRange = selection.getRangeAt(0);
        if (!domRange || domRange.collapsed) {
            return;
        }
        const startElement = domRange.startContainer.nodeType === Node.TEXT_NODE
            ? domRange.startContainer.parentElement
            : domRange.startContainer;
        const endElement = domRange.endContainer.nodeType === Node.TEXT_NODE
            ? domRange.endContainer.parentElement
            : domRange.endContainer;
        if (!startElement || !endElement) {
            return;
        }
        const startPosition = renderLinesResult.getModelPositionAt(startElement, domRange.startOffset);
        const endPosition = renderLinesResult.getModelPositionAt(endElement, domRange.endOffset);
        if (!startPosition || !endPosition) {
            return;
        }
        const adjustedStart = startPosition.delta(diffEntry.original.startLineNumber - 1);
        const adjustedEnd = endPosition.delta(diffEntry.original.startLineNumber - 1);
        const range = adjustedEnd.isBefore(adjustedStart) ?
            Range.fromPositions(adjustedEnd, adjustedStart) :
            Range.fromPositions(adjustedStart, adjustedEnd);
        const selectedText = originalModel.getValueInRange(range);
        clipboardService.writeText(selectedText);
    }));
    return viewZoneDisposable;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29weVNlbGVjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2NvbXBvbmVudHMvZGlmZkVkaXRvclZpZXdab25lcy9jb3B5U2VsZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUF1QjVELE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxPQUE0QztJQUMvRSxNQUFNLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFDM0YsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBRWpELGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUU7UUFDbkUsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ25CLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDdkQsSUFBSSxDQUFDLFNBQVMsSUFBSSxTQUFTLENBQUMsVUFBVSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzlDLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNyQyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxTQUFTO1lBQ3ZFLENBQUMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLGFBQWE7WUFDdkMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxjQUE2QixDQUFDO1FBQzFDLE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxZQUFZLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxTQUFTO1lBQ25FLENBQUMsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLGFBQWE7WUFDckMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxZQUEyQixDQUFDO1FBRXhDLElBQUksQ0FBQyxZQUFZLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNsQyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLGlCQUFpQixDQUFDLGtCQUFrQixDQUFDLFlBQVksRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDL0YsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUV6RixJQUFJLENBQUMsYUFBYSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDcEMsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sV0FBVyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFOUUsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQ2xELEtBQUssQ0FBQyxhQUFhLENBQUMsV0FBVyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFDakQsS0FBSyxDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFFakQsTUFBTSxZQUFZLEdBQUcsYUFBYSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMxRCxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLE9BQU8sa0JBQWtCLENBQUM7QUFDM0IsQ0FBQyJ9