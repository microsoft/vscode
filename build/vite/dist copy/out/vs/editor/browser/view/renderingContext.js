/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class RestrictedRenderingContext {
    constructor(viewLayout, viewportData) {
        this._restrictedRenderingContextBrand = undefined;
        this._viewLayout = viewLayout;
        this.viewportData = viewportData;
        this.scrollWidth = this._viewLayout.getScrollWidth();
        this.scrollHeight = this._viewLayout.getScrollHeight();
        this.visibleRange = this.viewportData.visibleRange;
        this.bigNumbersDelta = this.viewportData.bigNumbersDelta;
        const vInfo = this._viewLayout.getCurrentViewport();
        this.scrollTop = vInfo.top;
        this.scrollLeft = vInfo.left;
        this.viewportWidth = vInfo.width;
        this.viewportHeight = vInfo.height;
    }
    getScrolledTopFromAbsoluteTop(absoluteTop) {
        return absoluteTop - this.scrollTop;
    }
    getVerticalOffsetForLineNumber(lineNumber, includeViewZones) {
        return this._viewLayout.getVerticalOffsetForLineNumber(lineNumber, includeViewZones);
    }
    getVerticalOffsetAfterLineNumber(lineNumber, includeViewZones) {
        return this._viewLayout.getVerticalOffsetAfterLineNumber(lineNumber, includeViewZones);
    }
    getLineHeightForLineNumber(lineNumber) {
        return this._viewLayout.getLineHeightForLineNumber(lineNumber);
    }
    getDecorationsInViewport() {
        return this.viewportData.getDecorationsInViewport();
    }
}
export class RenderingContext extends RestrictedRenderingContext {
    constructor(viewLayout, viewportData, viewLines, viewLinesGpu) {
        super(viewLayout, viewportData);
        this._renderingContextBrand = undefined;
        this._viewLines = viewLines;
        this._viewLinesGpu = viewLinesGpu;
    }
    linesVisibleRangesForRange(range, includeNewLines) {
        const domRanges = this._viewLines.linesVisibleRangesForRange(range, includeNewLines);
        if (!this._viewLinesGpu) {
            return domRanges;
        }
        const gpuRanges = this._viewLinesGpu.linesVisibleRangesForRange(range, includeNewLines);
        if (!domRanges) {
            return gpuRanges;
        }
        if (!gpuRanges) {
            return domRanges;
        }
        return domRanges.concat(gpuRanges).sort((a, b) => a.lineNumber - b.lineNumber);
    }
    visibleRangeForPosition(position) {
        return this._viewLines.visibleRangeForPosition(position) ?? this._viewLinesGpu?.visibleRangeForPosition(position) ?? null;
    }
}
export class LineVisibleRanges {
    /**
     * Returns the element with the smallest `lineNumber`.
     */
    static firstLine(ranges) {
        if (!ranges) {
            return null;
        }
        let result = null;
        for (const range of ranges) {
            if (!result || range.lineNumber < result.lineNumber) {
                result = range;
            }
        }
        return result;
    }
    /**
     * Returns the element with the largest `lineNumber`.
     */
    static lastLine(ranges) {
        if (!ranges) {
            return null;
        }
        let result = null;
        for (const range of ranges) {
            if (!result || range.lineNumber > result.lineNumber) {
                result = range;
            }
        }
        return result;
    }
    constructor(outsideRenderedLine, lineNumber, ranges, 
    /**
     * Indicates if the requested range does not end in this line, but continues on the next line.
     */
    continuesOnNextLine) {
        this.outsideRenderedLine = outsideRenderedLine;
        this.lineNumber = lineNumber;
        this.ranges = ranges;
        this.continuesOnNextLine = continuesOnNextLine;
    }
}
export class HorizontalRange {
    static from(ranges) {
        const result = new Array(ranges.length);
        for (let i = 0, len = ranges.length; i < len; i++) {
            const range = ranges[i];
            result[i] = new HorizontalRange(range.left, range.width);
        }
        return result;
    }
    constructor(left, width) {
        this._horizontalRangeBrand = undefined;
        this.left = Math.round(left);
        this.width = Math.round(width);
    }
    toString() {
        return `[${this.left},${this.width}]`;
    }
}
export class FloatHorizontalRange {
    constructor(left, width) {
        this._floatHorizontalRangeBrand = undefined;
        this.left = left;
        this.width = width;
    }
    toString() {
        return `[${this.left},${this.width}]`;
    }
    static compare(a, b) {
        return a.left - b.left;
    }
}
export class HorizontalPosition {
    constructor(outsideRenderedLine, left) {
        this.outsideRenderedLine = outsideRenderedLine;
        this.originalLeft = left;
        this.left = Math.round(this.originalLeft);
    }
}
export class VisibleRanges {
    constructor(outsideRenderedLine, ranges) {
        this.outsideRenderedLine = outsideRenderedLine;
        this.ranges = ranges;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuZGVyaW5nQ29udGV4dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3ZpZXcvcmVuZGVyaW5nQ29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQWFoRyxNQUFNLE9BQWdCLDBCQUEwQjtJQW1CL0MsWUFBWSxVQUF1QixFQUFFLFlBQTBCO1FBbEIvRCxxQ0FBZ0MsR0FBUyxTQUFTLENBQUM7UUFtQmxELElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxDQUFDO1FBQzlCLElBQUksQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDO1FBRWpDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNyRCxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsZUFBZSxFQUFFLENBQUM7UUFFdkQsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQztRQUNuRCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDO1FBRXpELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUNwRCxJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUM7UUFDM0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQzdCLElBQUksQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztRQUNqQyxJQUFJLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7SUFDcEMsQ0FBQztJQUVNLDZCQUE2QixDQUFDLFdBQW1CO1FBQ3ZELE9BQU8sV0FBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7SUFD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