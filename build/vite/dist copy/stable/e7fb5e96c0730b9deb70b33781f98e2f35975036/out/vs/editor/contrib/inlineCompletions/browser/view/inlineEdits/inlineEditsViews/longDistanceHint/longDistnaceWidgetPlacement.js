/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { derived } from '../../../../../../../../base/common/observable.js';
import { Size2D } from '../../../../../../../common/core/2d/size.js';
import { LineRange } from '../../../../../../../common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../../../common/core/ranges/offsetRange.js';
import { getMaxTowerHeightInAvailableArea } from '../../utils/towersLayout.js';
/**
 * Context for computing widget placement within a continuous line range.
 */
export class WidgetPlacementContext {
    constructor(_lineRangeInfo, editorTrueContentWidth, endOfLinePadding) {
        this._lineRangeInfo = _lineRangeInfo;
        this.availableSpaceSizes = _lineRangeInfo.sizes.map((s, idx) => {
            const lineNumber = _lineRangeInfo.lineRange.startLineNumber + idx;
            const linePaddingLeft = endOfLinePadding(lineNumber);
            return new Size2D(Math.max(0, editorTrueContentWidth - s.width - linePaddingLeft), s.height);
        });
        this.availableSpaceHeightPrefixSums = getSums(this.availableSpaceSizes, s => s.height);
        this.availableSpaceSizesTransposed = this.availableSpaceSizes.map(s => s.transpose());
    }
    /**
     * Computes the vertical outline for a widget placed at the given line number.
     */
    getWidgetVerticalOutline(lineNumber, previewEditorHeight, layoutConstants) {
        const sizeIdx = lineNumber - this._lineRangeInfo.lineRange.startLineNumber;
        const top = this._lineRangeInfo.top + this.availableSpaceHeightPrefixSums[sizeIdx];
        const editorRange = OffsetRange.ofStartAndLength(top, previewEditorHeight);
        const { previewEditorMargin, widgetPadding, widgetBorder, lowerBarHeight } = layoutConstants;
        const verticalWidgetRange = editorRange.withMargin(previewEditorMargin + widgetPadding + widgetBorder).withMargin(0, lowerBarHeight);
        return verticalWidgetRange;
    }
    /**
     * Tries to find a valid widget outline within this line range context.
     */
    tryFindWidgetOutline(targetLineNumber, previewEditorHeight, editorTrueContentRight, layoutConstants) {
        if (this._lineRangeInfo.lineRange.length < 3) {
            return undefined;
        }
        return findFirstMinimzeDistance(this._lineRangeInfo.lineRange.addMargin(-1, -1), targetLineNumber, lineNumber => {
            const verticalWidgetRange = this.getWidgetVerticalOutline(lineNumber, previewEditorHeight, layoutConstants);
            const maxWidth = getMaxTowerHeightInAvailableArea(verticalWidgetRange.delta(-this._lineRangeInfo.top), this.availableSpaceSizesTransposed);
            if (maxWidth < layoutConstants.minWidgetWidth) {
                return undefined;
            }
            const horizontalWidgetRange = OffsetRange.ofStartAndLength(editorTrueContentRight - maxWidth, maxWidth);
            return { horizontalWidgetRange, verticalWidgetRange };
        });
    }
}
/**
 * Splits line size information into continuous ranges, breaking at positions where
 * the expected vertical position differs from the actual position (e.g., due to folded regions).
 */
export function splitIntoContinuousLineRanges(lineRange, sizes, top, editorObs, reader) {
    const result = [];
    let currentRangeStart = lineRange.startLineNumber;
    let currentRangeTop = top;
    let currentSizes = [];
    for (let i = 0; i < sizes.length; i++) {
        const lineNumber = lineRange.startLineNumber + i;
        const expectedTop = currentRangeTop + currentSizes.reduce((p, c) => p + c.height, 0);
        const actualTop = editorObs.editor.getTopForLineNumber(lineNumber);
        if (i > 0 && actualTop !== expectedTop) {
            // Discontinuity detected - push the current range and start a new one
            result.push({
                lineRange: LineRange.ofLength(currentRangeStart, lineNumber - currentRangeStart),
                top: currentRangeTop,
                sizes: currentSizes,
            });
            currentRangeStart = lineNumber;
            currentRangeTop = actualTop;
            currentSizes = [];
        }
        currentSizes.push(sizes[i]);
    }
    // Push the final range
    result.push({
        lineRange: LineRange.ofLength(currentRangeStart, lineRange.endLineNumberExclusive - currentRangeStart),
        top: currentRangeTop,
        sizes: currentSizes,
    });
    // Don't observe each line individually for performance reasons
    derived({ owner: 'splitIntoContinuousLineRanges' }, r => {
        return editorObs.observeTopForLineNumber(lineRange.endLineNumberExclusive - 1).read(r);
    }).read(reader);
    return result;
}
function findFirstMinimzeDistance(range, targetLine, predicate) {
    for (let offset = 0;; offset++) {
        const down = targetLine + offset;
        if (down <= range.endLineNumberExclusive) {
            const result = predicate(down);
            if (result !== undefined) {
                return result;
            }
        }
        const up = targetLine - offset;
        if (up >= range.startLineNumber) {
            const result = predicate(up);
            if (result !== undefined) {
                return result;
            }
        }
        if (up < range.startLineNumber && down > range.endLineNumberExclusive) {
            return undefined;
        }
    }
}
function getSums(array, fn) {
    const result = [0];
    let sum = 0;
    for (const item of array) {
        sum += fn(item);
        result.push(sum);
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9uZ0Rpc3RuYWNlV2lkZ2V0UGxhY2VtZW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlld3MvbG9uZ0Rpc3RhbmNlSGludC9sb25nRGlzdG5hY2VXaWRnZXRQbGFjZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBVyxNQUFNLG1EQUFtRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDakYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBNEIvRTs7R0FFRztBQUNILE1BQU0sT0FBTyxzQkFBc0I7SUFLbEMsWUFDa0IsY0FBbUMsRUFDcEQsc0JBQThCLEVBQzlCLGdCQUFnRDtRQUYvQixtQkFBYyxHQUFkLGNBQWMsQ0FBcUI7UUFJcEQsSUFBSSxDQUFDLG1CQUFtQixHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFO1lBQzlELE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQyxTQUFTLENBQUMsZUFBZSxHQUFHLEdBQUcsQ0FBQztZQUNsRSxNQUFNLGVBQWUsR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNyRCxPQUFPLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLHNCQUFzQixHQUFHLENBQUMsQ0FBQyxLQUFLLEdBQUcsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzlGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDhCQUE4QixHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdkYsSUFBSSxDQUFDLDZCQUE2QixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUN2RixDQUFDO0lBRUQ7O09BRUc7SUFDSSx3QkFBd0IsQ0FDOUIsVUFBa0IsRUFDbEIsbUJBQTJCLEVBQzNCLGVBQXNDO1FBRXRDLE1BQU0sT0FBTyxHQUFHLFVBQVUsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUM7UUFDM0UsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLDhCQUE4QixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ25GLE1BQU0sV0FBVyxHQUFHLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUMzRSxNQUFNLEVBQUUsbUJBQW1CLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsR0FBRyxlQUFlLENBQUM7UUFDN0YsTUFBTSxtQkFBbUIsR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLG1CQUFtQixHQUFHLGFBQWEsR0FBRyxZQUFZLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3JJLE9BQU8sbUJBQW1CLENBQUM7SUFDNUIsQ0FBQztJQUVEOztPQUVHO0lBQ0ksb0JBQW9CLENBQzFCLGdCQUF3QixFQUN4QixtQkFBMkIsRUFDM0Isc0JBQThCLEVBQzlCLGVBQXNDO1FBRXRDLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzlDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLHdCQUF3QixDQUM5QixJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFDL0MsZ0JBQWdCLEVBQ2hCLFVBQVUsQ0FBQyxFQUFFO1lBQ1osTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsVUFBVSxFQUFFLG1CQUFtQixFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQzVHLE1BQU0sUUFBUSxHQUFHLGdDQUFnQyxDQUNoRCxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxFQUNuRCxJQUFJLENBQUMsNkJBQTZCLENBQ2xDLENBQUM7WUFDRixJQUFJLFFBQVEsR0FBRyxlQUFlLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQy9DLE9BQU8sU0FBUyxDQUFDO1lBQ2xCLENBQUM7WUFDRCxNQUFNLHFCQUFxQixHQUFHLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsR0FBRyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDeEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLENBQUM7UUFDdkQsQ0FBQyxDQUNELENBQUM7SUFDSCxDQUFDO0NBQ0Q7QUFDRDs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsNkJBQTZCLENBQzVDLFNBQW9CLEVBQ3BCLEtBQWUsRUFDZixHQUFXLEVBQ1gsU0FBK0IsRUFDL0IsTUFBZTtJQUVmLE1BQU0sTUFBTSxHQUEwQixFQUFFLENBQUM7SUFDekMsSUFBSSxpQkFBaUIsR0FBRyxTQUFTLENBQUMsZUFBZSxDQUFDO0lBQ2xELElBQUksZUFBZSxHQUFHLEdBQUcsQ0FBQztJQUMxQixJQUFJLFlBQVksR0FBYSxFQUFFLENBQUM7SUFFaEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUN2QyxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsZUFBZSxHQUFHLENBQUMsQ0FBQztRQUNqRCxNQUFNLFdBQVcsR0FBRyxlQUFlLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFbkUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLFNBQVMsS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUN4QyxzRUFBc0U7WUFDdEUsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDWCxTQUFTLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxVQUFVLEdBQUcsaUJBQWlCLENBQUM7Z0JBQ2hGLEdBQUcsRUFBRSxlQUFlO2dCQUNwQixLQUFLLEVBQUUsWUFBWTthQUNuQixDQUFDLENBQUM7WUFDSCxpQkFBaUIsR0FBRyxVQUFVLENBQUM7WUFDL0IsZUFBZSxHQUFHLFNBQVMsQ0FBQztZQUM1QixZQUFZLEdBQUcsRUFBRSxDQUFDO1FBQ25CLENBQUM7UUFDRCxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFRCx1QkFBdUI7SUFDdkIsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNYLFNBQVMsRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLFNBQVMsQ0FBQyxzQkFBc0IsR0FBRyxpQkFBaUIsQ0FBQztRQUN0RyxHQUFHLEVBQUUsZUFBZTtRQUNwQixLQUFLLEVBQUUsWUFBWTtLQUNuQixDQUFDLENBQUM7SUFFSCwrREFBK0Q7SUFDL0QsT0FBTyxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUU7UUFDdkQsT0FBTyxTQUFTLENBQUMsdUJBQXVCLENBQUMsU0FBUyxDQUFDLHNCQUFzQixHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4RixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFFaEIsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyx3QkFBd0IsQ0FBSSxLQUFnQixFQUFFLFVBQWtCLEVBQUUsU0FBZ0Q7SUFDMUgsS0FBSyxJQUFJLE1BQU0sR0FBRyxDQUFDLEdBQUksTUFBTSxFQUFFLEVBQUUsQ0FBQztRQUNqQyxNQUFNLElBQUksR0FBRyxVQUFVLEdBQUcsTUFBTSxDQUFDO1FBQ2pDLElBQUksSUFBSSxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1lBQzFDLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMvQixJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDMUIsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO1FBQ0YsQ0FBQztRQUNELE1BQU0sRUFBRSxHQUFHLFVBQVUsR0FBRyxNQUFNLENBQUM7UUFDL0IsSUFBSSxFQUFFLElBQUksS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM3QixJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDMUIsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO1FBQ0YsQ0FBQztRQUNELElBQUksRUFBRSxHQUFHLEtBQUssQ0FBQyxlQUFlLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1lBQ3ZFLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsT0FBTyxDQUFJLEtBQVUsRUFBRSxFQUF1QjtJQUN0RCxNQUFNLE1BQU0sR0FBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdCLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztJQUNaLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7UUFDMUIsR0FBRyxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoQixNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUMifQ==