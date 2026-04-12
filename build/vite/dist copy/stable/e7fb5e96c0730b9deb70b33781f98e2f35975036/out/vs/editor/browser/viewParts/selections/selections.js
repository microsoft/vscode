/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './selections.css';
import { DynamicViewOverlay } from '../../view/dynamicViewOverlay.js';
import { editorSelectionForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
var CornerStyle;
(function (CornerStyle) {
    CornerStyle[CornerStyle["EXTERN"] = 0] = "EXTERN";
    CornerStyle[CornerStyle["INTERN"] = 1] = "INTERN";
    CornerStyle[CornerStyle["FLAT"] = 2] = "FLAT";
})(CornerStyle || (CornerStyle = {}));
class HorizontalRangeWithStyle {
    constructor(other) {
        this.left = other.left;
        this.width = other.width;
        this.startStyle = null;
        this.endStyle = null;
    }
}
class LineVisibleRangesWithStyle {
    constructor(lineNumber, ranges) {
        this.lineNumber = lineNumber;
        this.ranges = ranges;
    }
}
function toStyledRange(item) {
    return new HorizontalRangeWithStyle(item);
}
function toStyled(item) {
    return new LineVisibleRangesWithStyle(item.lineNumber, item.ranges.map(toStyledRange));
}
/**
 * This view part displays selected text to the user. Every line has its own selection overlay.
 */
export class SelectionsOverlay extends DynamicViewOverlay {
    static { this.SELECTION_CLASS_NAME = 'selected-text'; }
    static { this.SELECTION_TOP_LEFT = 'top-left-radius'; }
    static { this.SELECTION_BOTTOM_LEFT = 'bottom-left-radius'; }
    static { this.SELECTION_TOP_RIGHT = 'top-right-radius'; }
    static { this.SELECTION_BOTTOM_RIGHT = 'bottom-right-radius'; }
    static { this.EDITOR_BACKGROUND_CLASS_NAME = 'monaco-editor-background'; }
    static { this.ROUNDED_PIECE_WIDTH = 10; }
    constructor(context) {
        super();
        this._previousFrameVisibleRangesWithStyle = [];
        this._context = context;
        const options = this._context.configuration.options;
        this._roundedSelection = options.get(115 /* EditorOption.roundedSelection */);
        this._typicalHalfwidthCharacterWidth = options.get(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
        this._selections = [];
        this._renderResult = null;
        this._context.addEventHandler(this);
    }
    dispose() {
        this._context.removeEventHandler(this);
        this._renderResult = null;
        super.dispose();
    }
    // --- begin event handlers
    onConfigurationChanged(e) {
        const options = this._context.configuration.options;
        this._roundedSelection = options.get(115 /* EditorOption.roundedSelection */);
        this._typicalHalfwidthCharacterWidth = options.get(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
        return true;
    }
    onCursorStateChanged(e) {
        this._selections = e.selections.slice(0);
        return true;
    }
    onDecorationsChanged(e) {
        // true for inline decorations that can end up relayouting text
        return true; //e.inlineDecorationsChanged;
    }
    onFlushed(e) {
        return true;
    }
    onLinesChanged(e) {
        return true;
    }
    onLinesDeleted(e) {
        return true;
    }
    onLinesInserted(e) {
        return true;
    }
    onScrollChanged(e) {
        return e.scrollTopChanged;
    }
    onZonesChanged(e) {
        return true;
    }
    // --- end event handlers
    _visibleRangesHaveGaps(linesVisibleRanges) {
        for (let i = 0, len = linesVisibleRanges.length; i < len; i++) {
            const lineVisibleRanges = linesVisibleRanges[i];
            if (lineVisibleRanges.ranges.length > 1) {
                // There are two ranges on the same line
                return true;
            }
        }
        return false;
    }
    _enrichVisibleRangesWithStyle(viewport, linesVisibleRanges, previousFrame) {
        const epsilon = this._typicalHalfwidthCharacterWidth / 4;
        let previousFrameTop = null;
        let previousFrameBottom = null;
        if (previousFrame && previousFrame.length > 0 && linesVisibleRanges.length > 0) {
            const topLineNumber = linesVisibleRanges[0].lineNumber;
            if (topLineNumber === viewport.startLineNumber) {
                for (let i = 0; !previousFrameTop && i < previousFrame.length; i++) {
                    if (previousFrame[i].lineNumber === topLineNumber) {
                        previousFrameTop = previousFrame[i].ranges[0];
                    }
                }
            }
            const bottomLineNumber = linesVisibleRanges[linesVisibleRanges.length - 1].lineNumber;
            if (bottomLineNumber === viewport.endLineNumber) {
                for (let i = previousFrame.length - 1; !previousFrameBottom && i >= 0; i--) {
                    if (previousFrame[i].lineNumber === bottomLineNumber) {
                        previousFrameBottom = previousFrame[i].ranges[0];
                    }
                }
            }
            if (previousFrameTop && !previousFrameTop.startStyle) {
                previousFrameTop = null;
            }
            if (previousFrameBottom && !previousFrameBottom.startStyle) {
                previousFrameBottom = null;
            }
        }
        for (let i = 0, len = linesVisibleRanges.length; i < len; i++) {
            // We know for a fact that there is precisely one range on each line
            const curLineRange = linesVisibleRanges[i].ranges[0];
            const curLeft = curLineRange.left;
            const curRight = curLineRange.left + curLineRange.width;
            const startStyle = {
                top: 0 /* CornerStyle.EXTERN */,
                bottom: 0 /* CornerStyle.EXTERN */
            };
            const endStyle = {
                top: 0 /* CornerStyle.EXTERN */,
                bottom: 0 /* CornerStyle.EXTERN */
            };
            if (i > 0) {
                // Look above
                const prevLeft = linesVisibleRanges[i - 1].ranges[0].left;
                const prevRight = linesVisibleRanges[i - 1].ranges[0].left + linesVisibleRanges[i - 1].ranges[0].width;
                if (abs(curLeft - prevLeft) < epsilon) {
                    startStyle.top = 2 /* CornerStyle.FLAT */;
                }
                else if (curLeft > prevLeft) {
                    startStyle.top = 1 /* CornerStyle.INTERN */;
                }
                if (abs(curRight - prevRight) < epsilon) {
                    endStyle.top = 2 /* CornerStyle.FLAT */;
                }
                else if (prevLeft < curRight && curRight < prevRight) {
                    endStyle.top = 1 /* CornerStyle.INTERN */;
                }
            }
            else if (previousFrameTop) {
                // Accept some hiccups near the viewport edges to save on repaints
                startStyle.top = previousFrameTop.startStyle.top;
                endStyle.top = previousFrameTop.endStyle.top;
            }
            if (i + 1 < len) {
                // Look below
                const nextLeft = linesVisibleRanges[i + 1].ranges[0].left;
                const nextRight = linesVisibleRanges[i + 1].ranges[0].left + linesVisibleRanges[i + 1].ranges[0].width;
                if (abs(curLeft - nextLeft) < epsilon) {
                    startStyle.bottom = 2 /* CornerStyle.FLAT */;
                }
                else if (nextLeft < curLeft && curLeft < nextRight) {
                    startStyle.bottom = 1 /* CornerStyle.INTERN */;
                }
                if (abs(curRight - nextRight) < epsilon) {
                    endStyle.bottom = 2 /* CornerStyle.FLAT */;
                }
                else if (curRight < nextRight) {
                    endStyle.bottom = 1 /* CornerStyle.INTERN */;
                }
            }
            else if (previousFrameBottom) {
                // Accept some hiccups near the viewport edges to save on repaints
                startStyle.bottom = previousFrameBottom.startStyle.bottom;
                endStyle.bottom = previousFrameBottom.endStyle.bottom;
            }
            curLineRange.startStyle = startStyle;
            curLineRange.endStyle = endStyle;
        }
    }
    _getVisibleRangesWithStyle(selection, ctx, previousFrame) {
        const _linesVisibleRanges = ctx.linesVisibleRangesForRange(selection, true) || [];
        const linesVisibleRanges = _linesVisibleRanges.map(toStyled);
        const visibleRangesHaveGaps = this._visibleRangesHaveGaps(linesVisibleRanges);
        if (!visibleRangesHaveGaps && this._roundedSelection) {
            this._enrichVisibleRangesWithStyle(ctx.visibleRange, linesVisibleRanges, previousFrame);
        }
        // The visible ranges are sorted TOP-BOTTOM and LEFT-RIGHT
        return linesVisibleRanges;
    }
    _createSelectionPiece(top, bottom, className, left, width) {
        return ('<div class="cslr '
            + className
            + '" style="'
            + 'top:' + top.toString() + 'px;'
            + 'bottom:' + bottom.toString() + 'px;'
            + 'left:' + left.toString() + 'px;'
            + 'width:' + width.toString() + 'px;'
            + '"></div>');
    }
    _actualRenderOneSelection(output2, visibleStartLineNumber, hasMultipleSelections, visibleRanges) {
        if (visibleRanges.length === 0) {
            return;
        }
        const visibleRangesHaveStyle = !!visibleRanges[0].ranges[0].startStyle;
        const firstLineNumber = visibleRanges[0].lineNumber;
        const lastLineNumber = visibleRanges[visibleRanges.length - 1].lineNumber;
        for (let i = 0, len = visibleRanges.length; i < len; i++) {
            const lineVisibleRanges = visibleRanges[i];
            const lineNumber = lineVisibleRanges.lineNumber;
            const lineIndex = lineNumber - visibleStartLineNumber;
            const top = hasMultipleSelections ? (lineNumber === firstLineNumber ? 1 : 0) : 0;
            const bottom = hasMultipleSelections ? (lineNumber !== firstLineNumber && lineNumber === lastLineNumber ? 1 : 0) : 0;
            let innerCornerOutput = '';
            let restOfSelectionOutput = '';
            for (let j = 0, lenJ = lineVisibleRanges.ranges.length; j < lenJ; j++) {
                const visibleRange = lineVisibleRanges.ranges[j];
                if (visibleRangesHaveStyle) {
                    const startStyle = visibleRange.startStyle;
                    const endStyle = visibleRange.endStyle;
                    if (startStyle.top === 1 /* CornerStyle.INTERN */ || startStyle.bottom === 1 /* CornerStyle.INTERN */) {
                        // Reverse rounded corner to the left
                        // First comes the selection (blue layer)
                        innerCornerOutput += this._createSelectionPiece(top, bottom, SelectionsOverlay.SELECTION_CLASS_NAME, visibleRange.left - SelectionsOverlay.ROUNDED_PIECE_WIDTH, SelectionsOverlay.ROUNDED_PIECE_WIDTH);
                        // Second comes the background (white layer) with inverse border radius
                        let className = SelectionsOverlay.EDITOR_BACKGROUND_CLASS_NAME;
                        if (startStyle.top === 1 /* CornerStyle.INTERN */) {
                            className += ' ' + SelectionsOverlay.SELECTION_TOP_RIGHT;
                        }
                        if (startStyle.bottom === 1 /* CornerStyle.INTERN */) {
                            className += ' ' + SelectionsOverlay.SELECTION_BOTTOM_RIGHT;
                        }
                        innerCornerOutput += this._createSelectionPiece(top, bottom, className, visibleRange.left - SelectionsOverlay.ROUNDED_PIECE_WIDTH, SelectionsOverlay.ROUNDED_PIECE_WIDTH);
                    }
                    if (endStyle.top === 1 /* CornerStyle.INTERN */ || endStyle.bottom === 1 /* CornerStyle.INTERN */) {
                        // Reverse rounded corner to the right
                        // First comes the selection (blue layer)
                        innerCornerOutput += this._createSelectionPiece(top, bottom, SelectionsOverlay.SELECTION_CLASS_NAME, visibleRange.left + visibleRange.width, SelectionsOverlay.ROUNDED_PIECE_WIDTH);
                        // Second comes the background (white layer) with inverse border radius
                        let className = SelectionsOverlay.EDITOR_BACKGROUND_CLASS_NAME;
                        if (endStyle.top === 1 /* CornerStyle.INTERN */) {
                            className += ' ' + SelectionsOverlay.SELECTION_TOP_LEFT;
                        }
                        if (endStyle.bottom === 1 /* CornerStyle.INTERN */) {
                            className += ' ' + SelectionsOverlay.SELECTION_BOTTOM_LEFT;
                        }
                        innerCornerOutput += this._createSelectionPiece(top, bottom, className, visibleRange.left + visibleRange.width, SelectionsOverlay.ROUNDED_PIECE_WIDTH);
                    }
                }
                let className = SelectionsOverlay.SELECTION_CLASS_NAME;
                if (visibleRangesHaveStyle) {
                    const startStyle = visibleRange.startStyle;
                    const endStyle = visibleRange.endStyle;
                    if (startStyle.top === 0 /* CornerStyle.EXTERN */) {
                        className += ' ' + SelectionsOverlay.SELECTION_TOP_LEFT;
                    }
                    if (startStyle.bottom === 0 /* CornerStyle.EXTERN */) {
                        className += ' ' + SelectionsOverlay.SELECTION_BOTTOM_LEFT;
                    }
                    if (endStyle.top === 0 /* CornerStyle.EXTERN */) {
                        className += ' ' + SelectionsOverlay.SELECTION_TOP_RIGHT;
                    }
                    if (endStyle.bottom === 0 /* CornerStyle.EXTERN */) {
                        className += ' ' + SelectionsOverlay.SELECTION_BOTTOM_RIGHT;
                    }
                }
                restOfSelectionOutput += this._createSelectionPiece(top, bottom, className, visibleRange.left, visibleRange.width);
            }
            output2[lineIndex][0] += innerCornerOutput;
            output2[lineIndex][1] += restOfSelectionOutput;
        }
    }
    prepareRender(ctx) {
        // Build HTML for inner corners separate from HTML for the rest of selections,
        // as the inner corner HTML can interfere with that of other selections.
        // In final render, make sure to place the inner corner HTML before the rest of selection HTML. See issue #77777.
        const output = [];
        const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
        const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
        for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
            const lineIndex = lineNumber - visibleStartLineNumber;
            output[lineIndex] = ['', ''];
        }
        const thisFrameVisibleRangesWithStyle = [];
        for (let i = 0, len = this._selections.length; i < len; i++) {
            const selection = this._selections[i];
            if (selection.isEmpty()) {
                thisFrameVisibleRangesWithStyle[i] = null;
                continue;
            }
            const visibleRangesWithStyle = this._getVisibleRangesWithStyle(selection, ctx, this._previousFrameVisibleRangesWithStyle[i]);
            thisFrameVisibleRangesWithStyle[i] = visibleRangesWithStyle;
            this._actualRenderOneSelection(output, visibleStartLineNumber, this._selections.length > 1, visibleRangesWithStyle);
        }
        this._previousFrameVisibleRangesWithStyle = thisFrameVisibleRangesWithStyle;
        this._renderResult = output.map(([internalCorners, restOfSelection]) => internalCorners + restOfSelection);
    }
    render(startLineNumber, lineNumber) {
        if (!this._renderResult) {
            return '';
        }
        const lineIndex = lineNumber - startLineNumber;
        if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
            return '';
        }
        return this._renderResult[lineIndex];
    }
}
registerThemingParticipant((theme, collector) => {
    const editorSelectionForegroundColor = theme.getColor(editorSelectionForeground);
    if (editorSelectionForegroundColor && !editorSelectionForegroundColor.isTransparent()) {
        collector.addRule(`.monaco-editor .view-line span.inline-selected-text { color: ${editorSelectionForegroundColor}; }`);
    }
});
function abs(n) {
    return n < 0 ? -n : n;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VsZWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9zZWxlY3Rpb25zL3NlbGVjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxrQkFBa0IsQ0FBQztBQUMxQixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUt0RSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUcvRixJQUFXLFdBSVY7QUFKRCxXQUFXLFdBQVc7SUFDckIsaURBQU0sQ0FBQTtJQUNOLGlEQUFNLENBQUE7SUFDTiw2Q0FBSSxDQUFBO0FBQ0wsQ0FBQyxFQUpVLFdBQVcsS0FBWCxXQUFXLFFBSXJCO0FBT0QsTUFBTSx3QkFBd0I7SUFNN0IsWUFBWSxLQUFzQjtRQUNqQyxJQUFJLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDdkIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO0lBQ3RCLENBQUM7Q0FDRDtBQUVELE1BQU0sMEJBQTBCO0lBSS9CLFlBQVksVUFBa0IsRUFBRSxNQUFrQztRQUNqRSxJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUM3QixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN0QixDQUFDO0NBQ0Q7QUFFRCxTQUFTLGFBQWEsQ0FBQyxJQUFxQjtJQUMzQyxPQUFPLElBQUksd0JBQXdCLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDM0MsQ0FBQztBQUVE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