/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './decorations.css';
import { DynamicViewOverlay } from '../../view/dynamicViewOverlay.js';
import { HorizontalRange } from '../../view/renderingContext.js';
import { Range } from '../../../common/core/range.js';
export class DecorationsOverlay extends DynamicViewOverlay {
    constructor(context) {
        super();
        this._context = context;
        const options = this._context.configuration.options;
        this._typicalHalfwidthCharacterWidth = options.get(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
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
        this._typicalHalfwidthCharacterWidth = options.get(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
        return true;
    }
    onDecorationsChanged(e) {
        return true;
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
        return e.scrollTopChanged || e.scrollWidthChanged;
    }
    onZonesChanged(e) {
        return true;
    }
    // --- end event handlers
    prepareRender(ctx) {
        const _decorations = ctx.getDecorationsInViewport();
        // Keep only decorations with `className`
        let decorations = [];
        let decorationsLen = 0;
        for (let i = 0, len = _decorations.length; i < len; i++) {
            const d = _decorations[i];
            if (d.options.className) {
                decorations[decorationsLen++] = d;
            }
        }
        // Sort decorations for consistent render output
        decorations = decorations.sort((a, b) => {
            if (a.options.zIndex < b.options.zIndex) {
                return -1;
            }
            if (a.options.zIndex > b.options.zIndex) {
                return 1;
            }
            const aClassName = a.options.className;
            const bClassName = b.options.className;
            if (aClassName < bClassName) {
                return -1;
            }
            if (aClassName > bClassName) {
                return 1;
            }
            return Range.compareRangesUsingStarts(a.range, b.range);
        });
        const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
        const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
        const output = [];
        for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
            const lineIndex = lineNumber - visibleStartLineNumber;
            output[lineIndex] = '';
        }
        // Render first whole line decorations and then regular decorations
        this._renderWholeLineDecorations(ctx, decorations, output);
        this._renderNormalDecorations(ctx, decorations, output);
        this._renderResult = output;
    }
    _renderWholeLineDecorations(ctx, decorations, output) {
        const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
        const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
        for (let i = 0, lenI = decorations.length; i < lenI; i++) {
            const d = decorations[i];
            if (!d.options.isWholeLine) {
                continue;
            }
            const decorationOutput = ('<div class="cdr '
                + d.options.className
                + '" style="left:0;width:100%;"></div>');
            const startLineNumber = Math.max(d.range.startLineNumber, visibleStartLineNumber);
            const endLineNumber = Math.min(d.range.endLineNumber, visibleEndLineNumber);
            for (let j = startLineNumber; j <= endLineNumber; j++) {
                const lineIndex = j - visibleStartLineNumber;
                output[lineIndex] += decorationOutput;
            }
        }
    }
    _renderNormalDecorations(ctx, decorations, output) {
        const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
        let prevClassName = null;
        let prevShowIfCollapsed = false;
        let prevRange = null;
        let prevShouldFillLineOnLineBreak = false;
        for (let i = 0, lenI = decorations.length; i < lenI; i++) {
            const d = decorations[i];
            if (d.options.isWholeLine) {
                continue;
            }
            const className = d.options.className;
            const showIfCollapsed = Boolean(d.options.showIfCollapsed);
            let range = d.range;
            if (showIfCollapsed && range.endColumn === 1 && range.endLineNumber !== range.startLineNumber) {
                range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber - 1, this._context.viewModel.getLineMaxColumn(range.endLineNumber - 1));
            }
            if (prevClassName === className && prevShowIfCollapsed === showIfCollapsed && Range.areIntersectingOrTouching(prevRange, range)) {
                // merge into previous decoration
                prevRange = Range.plusRange(prevRange, range);
                continue;
            }
            // flush previous decoration
            if (prevClassName !== null) {
                this._renderNormalDecoration(ctx, prevRange, prevClassName, prevShouldFillLineOnLineBreak, prevShowIfCollapsed, visibleStartLineNumber, output);
            }
            prevClassName = className;
            prevShowIfCollapsed = showIfCollapsed;
            prevRange = range;
            prevShouldFillLineOnLineBreak = d.options.shouldFillLineOnLineBreak ?? false;
        }
        if (prevClassName !== null) {
            this._renderNormalDecoration(ctx, prevRange, prevClassName, prevShouldFillLineOnLineBreak, prevShowIfCollapsed, visibleStartLineNumber, output);
        }
    }
    _renderNormalDecoration(ctx, range, className, shouldFillLineOnLineBreak, showIfCollapsed, visibleStartLineNumber, output) {
        const linesVisibleRanges = ctx.linesVisibleRangesForRange(range, /*TODO@Alex*/ className === 'findMatch');
        if (!linesVisibleRanges) {
            return;
        }
        for (let j = 0, lenJ = linesVisibleRanges.length; j < lenJ; j++) {
            const lineVisibleRanges = linesVisibleRanges[j];
            if (lineVisibleRanges.outsideRenderedLine) {
                continue;
            }
            const lineIndex = lineVisibleRanges.lineNumber - visibleStartLineNumber;
            if (showIfCollapsed && lineVisibleRanges.ranges.length === 1) {
                const singleVisibleRange = lineVisibleRanges.ranges[0];
                if (singleVisibleRange.width < this._typicalHalfwidthCharacterWidth) {
                    // collapsed/very small range case => make the decoration visible by expanding its width
                    // expand its size on both sides (both to the left and to the right, keeping it centered)
                    const center = Math.round(singleVisibleRange.left + singleVisibleRange.width / 2);
                    const left = Math.max(0, Math.round(center - this._typicalHalfwidthCharacterWidth / 2));
                    lineVisibleRanges.ranges[0] = new HorizontalRange(left, this._typicalHalfwidthCharacterWidth);
                }
            }
            for (let k = 0, lenK = lineVisibleRanges.ranges.length; k < lenK; k++) {
                const expandToLeft = shouldFillLineOnLineBreak && lineVisibleRanges.continuesOnNextLine && lenK === 1;
                const visibleRange = lineVisibleRanges.ranges[k];
                const decorationOutput = ('<div class="cdr '
                    + className
                    + '" style="left:'
                    + String(visibleRange.left)
                    + 'px;width:'
                    + (expandToLeft ?
                        '100%;' :
                        (String(visibleRange.width) + 'px;'))
                    + '"></div>');
                output[lineIndex] += decorationOutput;
            }
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci92aWV3UGFydHMvZGVjb3JhdGlvbnMvZGVjb3JhdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxtQkFBbUIsQ0FBQztBQUMzQixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsZUFBZSxFQUFvQixNQUFNLGdDQUFnQyxDQUFDO0FBRW5GLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUt0RCxNQUFNLE9BQU8sa0JBQW1CLFNBQVEsa0JBQWtCO0lBTXpELFlBQVksT0FBb0I7UUFDL0IsS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztRQUN4QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUM7UUFDcEQsSUFBSSxDQUFDLCtCQUErQixHQUFHLE9BQU8sQ0FBQyxHQUFHLGdDQUF1QixDQUFDLDhCQUE4QixDQUFDO1FBQ3pHLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO1FBRTFCLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFZSxPQUFPO1FBQ3RCLElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDMUIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFFRCwyQkFBMkI7SUFFWCxzQkFBc0IsQ0FBQyxDQUEyQztRQUNqRixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxD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