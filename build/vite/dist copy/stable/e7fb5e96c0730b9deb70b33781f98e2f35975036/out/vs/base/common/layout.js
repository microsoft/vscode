/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from './range.js';
export var AnchorAlignment;
(function (AnchorAlignment) {
    AnchorAlignment[AnchorAlignment["LEFT"] = 0] = "LEFT";
    AnchorAlignment[AnchorAlignment["RIGHT"] = 1] = "RIGHT";
})(AnchorAlignment || (AnchorAlignment = {}));
export var AnchorPosition;
(function (AnchorPosition) {
    AnchorPosition[AnchorPosition["BELOW"] = 0] = "BELOW";
    AnchorPosition[AnchorPosition["ABOVE"] = 1] = "ABOVE";
})(AnchorPosition || (AnchorPosition = {}));
export var AnchorAxisAlignment;
(function (AnchorAxisAlignment) {
    AnchorAxisAlignment[AnchorAxisAlignment["VERTICAL"] = 0] = "VERTICAL";
    AnchorAxisAlignment[AnchorAxisAlignment["HORIZONTAL"] = 1] = "HORIZONTAL";
})(AnchorAxisAlignment || (AnchorAxisAlignment = {}));
export var LayoutAnchorPosition;
(function (LayoutAnchorPosition) {
    LayoutAnchorPosition[LayoutAnchorPosition["Before"] = 0] = "Before";
    LayoutAnchorPosition[LayoutAnchorPosition["After"] = 1] = "After";
})(LayoutAnchorPosition || (LayoutAnchorPosition = {}));
export var LayoutAnchorMode;
(function (LayoutAnchorMode) {
    LayoutAnchorMode[LayoutAnchorMode["AVOID"] = 0] = "AVOID";
    LayoutAnchorMode[LayoutAnchorMode["ALIGN"] = 1] = "ALIGN";
})(LayoutAnchorMode || (LayoutAnchorMode = {}));
/**
 * Lays out a one dimensional view next to an anchor in a viewport.
 *
 * @returns The view offset within the viewport.
 */
export function layout(viewportSize, viewSize, anchor) {
    const layoutAfterAnchorBoundary = anchor.mode === LayoutAnchorMode.ALIGN ? anchor.offset : anchor.offset + anchor.size;
    const layoutBeforeAnchorBoundary = anchor.mode === LayoutAnchorMode.ALIGN ? anchor.offset + anchor.size : anchor.offset;
    if (anchor.position === 0 /* LayoutAnchorPosition.Before */) {
        if (viewSize <= viewportSize - layoutAfterAnchorBoundary) {
            return { position: layoutAfterAnchorBoundary, result: 'ok' }; // happy case, lay it out after the anchor
        }
        if (viewSize <= layoutBeforeAnchorBoundary) {
            return { position: layoutBeforeAnchorBoundary - viewSize, result: 'flipped' }; // ok case, lay it out before the anchor
        }
        return { position: Math.max(viewportSize - viewSize, 0), result: 'overlap' }; // sad case, lay it over the anchor
    }
    else {
        if (viewSize <= layoutBeforeAnchorBoundary) {
            return { position: layoutBeforeAnchorBoundary - viewSize, result: 'ok' }; // happy case, lay it out before the anchor
        }
        if (viewSize <= viewportSize - layoutAfterAnchorBoundary && layoutBeforeAnchorBoundary < viewSize / 2) {
            return { position: layoutAfterAnchorBoundary, result: 'flipped' }; // ok case, lay it out after the anchor
        }
        return { position: 0, result: 'overlap' }; // sad case, lay it over the anchor
    }
}
export function layout2d(viewport, view, anchor, options) {
    let anchorAlignment = options?.anchorAlignment ?? 0 /* AnchorAlignment.LEFT */;
    let anchorPosition = options?.anchorPosition ?? 0 /* AnchorPosition.BELOW */;
    const anchorAxisAlignment = options?.anchorAxisAlignment ?? 0 /* AnchorAxisAlignment.VERTICAL */;
    let top;
    let left;
    if (anchorAxisAlignment === 0 /* AnchorAxisAlignment.VERTICAL */) {
        const verticalAnchor = { offset: anchor.top - viewport.top, size: anchor.height, position: anchorPosition === 0 /* AnchorPosition.BELOW */ ? 0 /* LayoutAnchorPosition.Before */ : 1 /* LayoutAnchorPosition.After */ };
        const horizontalAnchor = { offset: anchor.left, size: anchor.width, position: anchorAlignment === 0 /* AnchorAlignment.LEFT */ ? 0 /* LayoutAnchorPosition.Before */ : 1 /* LayoutAnchorPosition.After */, mode: LayoutAnchorMode.ALIGN };
        const verticalLayoutResult = layout(viewport.height, view.height, verticalAnchor);
        top = verticalLayoutResult.position + viewport.top;
        if (verticalLayoutResult.result === 'flipped') {
            anchorPosition = anchorPosition === 0 /* AnchorPosition.BELOW */ ? 1 /* AnchorPosition.ABOVE */ : 0 /* AnchorPosition.BELOW */;
        }
        // if view intersects vertically with anchor, we must avoid the anchor
        if (Range.intersects({ start: top, end: top + view.height }, { start: verticalAnchor.offset, end: verticalAnchor.offset + verticalAnchor.size })) {
            horizontalAnchor.mode = LayoutAnchorMode.AVOID;
        }
        const horizontalLayoutResult = layout(viewport.width, view.width, horizontalAnchor);
        left = horizontalLayoutResult.position;
        if (horizontalLayoutResult.result === 'flipped') {
            anchorAlignment = anchorAlignment === 0 /* AnchorAlignment.LEFT */ ? 1 /* AnchorAlignment.RIGHT */ : 0 /* AnchorAlignment.LEFT */;
        }
    }
    else {
        const horizontalAnchor = { offset: anchor.left, size: anchor.width, position: anchorAlignment === 0 /* AnchorAlignment.LEFT */ ? 0 /* LayoutAnchorPosition.Before */ : 1 /* LayoutAnchorPosition.After */ };
        const verticalAnchor = { offset: anchor.top, size: anchor.height, position: anchorPosition === 0 /* AnchorPosition.BELOW */ ? 0 /* LayoutAnchorPosition.Before */ : 1 /* LayoutAnchorPosition.After */, mode: LayoutAnchorMode.ALIGN };
        const horizontalLayoutResult = layout(viewport.width, view.width, horizontalAnchor);
        left = horizontalLayoutResult.position;
        if (horizontalLayoutResult.result === 'flipped') {
            anchorAlignment = anchorAlignment === 0 /* AnchorAlignment.LEFT */ ? 1 /* AnchorAlignment.RIGHT */ : 0 /* AnchorAlignment.LEFT */;
        }
        // if view intersects horizontally with anchor, we must avoid the anchor
        if (Range.intersects({ start: left, end: left + view.width }, { start: horizontalAnchor.offset, end: horizontalAnchor.offset + horizontalAnchor.size })) {
            verticalAnchor.mode = LayoutAnchorMode.AVOID;
        }
        const verticalLayoutResult = layout(viewport.height, view.height, verticalAnchor);
        top = verticalLayoutResult.position + viewport.top;
        if (verticalLayoutResult.result === 'flipped') {
            anchorPosition = anchorPosition === 0 /* AnchorPosition.BELOW */ ? 1 /* AnchorPosition.ABOVE */ : 0 /* AnchorPosition.BELOW */;
        }
    }
    const right = viewport.width - (left + view.width);
    const bottom = viewport.height - (top + view.height);
    return { top, left, bottom, right, anchorAlignment, anchorPosition };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vbGF5b3V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFTbkMsTUFBTSxDQUFOLElBQWtCLGVBRWpCO0FBRkQsV0FBa0IsZUFBZTtJQUNoQyxxREFBSSxDQUFBO0lBQUUsdURBQUssQ0FBQTtBQUNaLENBQUMsRUFGaUIsZUFBZSxLQUFmLGVBQWUsUUFFaEM7QUFFRCxNQUFNLENBQU4sSUFBa0IsY0FFakI7QUFGRCxXQUFrQixjQUFjO0lBQy9CLHFEQUFLLENBQUE7SUFBRSxxREFBSyxDQUFBO0FBQ2IsQ0FBQyxFQUZpQixjQUFjLEtBQWQsY0FBYyxRQUUvQjtBQUVELE1BQU0sQ0FBTixJQUFrQixtQkFFakI7QUFGRCxXQUFrQixtQkFBbUI7SUFDcEMscUVBQVEsQ0FBQTtJQUFFLHlFQUFVLENBQUE7QUFDckIsQ0FBQyxFQUZpQixtQkFBbUIsS0FBbkIsbUJBQW1CLFFBRXBDO0FBY0QsTUFBTSxDQUFOLElBQWtCLG9CQUdqQjtBQUhELFdBQWtCLG9CQUFvQjtJQUNyQyxtRUFBTSxDQUFBO0lBQ04saUVBQUssQ0FBQTtBQUNOLENBQUMsRUFIaUIsb0JBQW9CLEtBQXBCLG9CQUFvQixRQUdyQztBQUVELE1BQU0sQ0FBTixJQUFZLGdCQUdYO0FBSEQsV0FBWSxnQkFBZ0I7SUFDM0IseURBQUssQ0FBQTtJQUNMLHlEQUFLLENBQUE7QUFDTixDQUFDLEVBSFcsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQUczQjtBQWNEOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUsTUFBTSxDQUFDLFlBQW9CLEVBQUUsUUFBZ0IsRUFBRSxNQUFxQjtJQUNuRixNQUFNLHlCQUF5QixHQUFHLE1BQU0sQ0FBQyxJQUFJLEtBQUss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