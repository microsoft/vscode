/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { Color } from '../../../../base/common/color.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { CursorColumns } from '../../../common/core/cursorColumns.js';
import { createContentSegmenter } from '../contentSegmenter.js';
import { fullFileRenderStrategyWgsl } from './fullFileRenderStrategy.wgsl.js';
import { GPULifecycle } from '../gpuDisposable.js';
import { quadVertices } from '../gpuUtils.js';
import { ViewGpuContext } from '../viewGpuContext.js';
import { BaseRenderStrategy } from './baseRenderStrategy.js';
var Constants;
(function (Constants) {
    Constants[Constants["IndicesPerCell"] = 6] = "IndicesPerCell";
})(Constants || (Constants = {}));
var CellBufferInfo;
(function (CellBufferInfo) {
    CellBufferInfo[CellBufferInfo["FloatsPerEntry"] = 6] = "FloatsPerEntry";
    CellBufferInfo[CellBufferInfo["BytesPerEntry"] = 24] = "BytesPerEntry";
    CellBufferInfo[CellBufferInfo["Offset_X"] = 0] = "Offset_X";
    CellBufferInfo[CellBufferInfo["Offset_Y"] = 1] = "Offset_Y";
    CellBufferInfo[CellBufferInfo["Offset_Unused1"] = 2] = "Offset_Unused1";
    CellBufferInfo[CellBufferInfo["Offset_Unused2"] = 3] = "Offset_Unused2";
    CellBufferInfo[CellBufferInfo["GlyphIndex"] = 4] = "GlyphIndex";
    CellBufferInfo[CellBufferInfo["TextureIndex"] = 5] = "TextureIndex";
})(CellBufferInfo || (CellBufferInfo = {}));
/**
 * A render strategy that tracks a large buffer, uploading only dirty lines as they change and
 * leveraging heavy caching. This is the most performant strategy but has limitations around long
 * lines and too many lines.
 */
export class FullFileRenderStrategy extends BaseRenderStrategy {
    /**
     * The hard cap for line count that can be rendered by the GPU renderer.
     */
    static { this.maxSupportedLines = 3000; }
    /**
     * The hard cap for line columns that can be rendered by the GPU renderer.
     */
    static { this.maxSupportedColumns = 200; }
    get bindGroupEntries() {
        return [
            { binding: 1 /* BindingId.Cells */, resource: { buffer: this._cellBindBuffer } },
            { binding: 6 /* BindingId.ScrollOffset */, resource: { buffer: this._scrollOffsetBindBuffer } }
        ];
    }
    constructor(context, viewGpuContext, device, glyphRasterizer) {
        super(context, viewGpuContext, device, glyphRasterizer);
        this.type = 'fullfile';
        this.wgsl = fullFileRenderStrategyWgsl;
        this._activeDoubleBufferIndex = 0;
        this._upToDateLines = [new Set(), new Set()];
        this._visibleObjectCount = 0;
        this._finalRenderedLine = 0;
        this._scrollInitialized = false;
        this._queuedBufferUpdates = [[], []];
        const bufferSize = FullFileRenderStrategy.maxSupportedLines * FullFileRenderStrategy.maxSupportedColumns * 6 /* Constants.IndicesPerCell */ * Float32Array.BYTES_PER_ELEMENT;
        this._cellBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
            label: 'Monaco full file cell buffer',
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        })).object;
        this._cellValueBuffers = [
            new ArrayBuffer(bufferSize),
            new ArrayBuffer(bufferSize),
        ];
        const scrollOffsetBufferSize = 2;
        this._scrollOffsetBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
            label: 'Monaco scroll offset buffer',
            size: scrollOffsetBufferSize * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })).object;
        this._scrollOffsetValueBuffer = new Float32Array(scrollOffsetBufferSize);
    }
    // #region Event handlers
    // The primary job of these handlers is to:
    // 1. Invalidate the up to date line cache, which will cause the line to be re-rendered when
    //    it's _within the viewport_.
    // 2. Pass relevant events on to the render function so it can force certain line ranges to be
    //    re-rendered even if they're not in the viewport. For example when a view zone is added,
    //    there are lines that used to be visible but are no longer, so those ranges must be
    //    cleared and uploaded to the GPU.
    onConfigurationChanged(e) {
        this._invalidateAllLines();
        this._queueBufferUpdate(e);
        return true;
    }
    onDecorationsChanged(e) {
        this._invalidateAllLines();
        return true;
    }
    onTokensChanged(e) {
        // TODO: This currently fires for the entire viewport whenever scrolling stops
        //       https://github.com/microsoft/vscode/issues/233942
        for (const range of e.ranges) {
            this._invalidateLineRange(range.fromLineNumber, range.toLineNumber);
        }
        return true;
    }
    onLinesDeleted(e) {
        // TODO: This currently invalidates everything after the deleted line, it could shift the
        //       line data up to retain some up to date lines
        // TODO: This does not invalidate lines that are no longer in the file
        this._invalidateLinesFrom(e.fromLineNumber);
        this._queueBufferUpdate(e);
        return true;
    }
    onLinesInserted(e) {
        // TODO: This currently invalidates everything after the deleted line, it could shift the
        //       line data up to retain some up to date lines
        this._invalidateLinesFrom(e.fromLineNumber);
        return true;
    }
    onLinesChanged(e) {
        this._invalidateLineRange(e.fromLineNumber, e.fromLineNumber + e.count);
        return true;
    }
    onScrollChanged(e) {
        if (this._store.isDisposed) {
            return false;
        }
        const dpr = getActiveWindow().devicePixelRatio;
        this._scrollOffsetValueBuffer[0] = (e?.scrollLeft ?? this._context.viewLayout.getCurrentScrollLeft()) * dpr;
        this._scrollOffsetValueBuffer[1] = (e?.scrollTop ?? this._context.viewLayout.getCurrentScrollTop()) * dpr;
        this._device.queue.writeBuffer(this._scrollOffsetBindBuffer, 0, this._scrollOffsetValueBuffer);
        return true;
    }
    onThemeChanged(e) {
        this._invalidateAllLines();
        return true;
    }
    onLineMappingChanged(e) {
        this._invalidateAllLines();
        this._queueBufferUpdate(e);
        return true;
    }
    onZonesChanged(e) {
        this._invalidateAllLines();
        this._queueBufferUpdate(e);
        return true;
    }
    // #endregion
    _invalidateAllLines() {
        this._upToDateLines[0].clear();
        this._upToDateLines[1].clear();
    }
    _invalidateLinesFrom(lineNumber) {
        for (const i of [0, 1]) {
            const upToDateLines = this._upToDateLines[i];
            for (const upToDateLine of upToDateLines) {
                if (upToDateLine >= lineNumber) {
                    upToDateLines.delete(upToDateLine);
                }
            }
        }
    }
    _invalidateLineRange(fromLineNumber, toLineNumber) {
        for (let i = fromLineNumber; i <= toLineNumber; i++) {
            this._upToDateLines[0].delete(i);
            this._upToDateLines[1].delete(i);
        }
    }
    reset() {
        this._invalidateAllLines();
        for (const bufferIndex of [0, 1]) {
            // Zero out buffer and upload to GPU to prevent stale rows from rendering
            const buffer = new Float32Array(this._cellValueBuffers[bufferIndex]);
            buffer.fill(0, 0, buffer.length);
            this._device.queue.writeBuffer(this._cellBindBuffer, 0, buffer.buffer, 0, buffer.byteLength);
        }
        this._finalRenderedLine = 0;
    }
    update(viewportData, viewLineOptions) {
        // IMPORTANT: This is a hot function. Variables are pre-allocated and shared within the
        // loop. This is done so we don't need to trust the JIT compiler to do this optimization to
        // avoid potential additional blocking time in garbage collector which is a common cause of
        // dropped frames.
        let chars = '';
        let segment;
        let charWidth = 0;
        let y = 0;
        let x = 0;
        let absoluteOffsetX = 0;
        let absoluteOffsetY = 0;
        let tabXOffset = 0;
        let glyph;
        let cellIndex = 0;
        let tokenStartIndex = 0;
        let tokenEndIndex = 0;
        let tokenMetadata = 0;
        let decorationStyleSetBold;
        let decorationStyleSetColor;
        let decorationStyleSetOpacity;
        let decorationStyleSetStrikethrough;
        let decorationStyleSetStrikethroughThickness;
        let decorationStyleSetStrikethroughColor;
        let lineData;
        let decoration;
        let fillStartIndex = 0;
        let fillEndIndex = 0;
        let tokens;
        const dpr = getActiveWindow().devicePixelRatio;
        let contentSegmenter;
        if (!this._scrollInitialized) {
            this.onScrollChanged();
            this._scrollInitialized = true;
        }
        // Update cell data
        const cellBuffer = new Float32Array(this._cellValueBuffers[this._activeDoubleBufferIndex]);
        const lineIndexCount = FullFileRenderStrategy.maxSupportedColumns * 6 /* Constants.IndicesPerCell */;
        const upToDateLines = this._upToDateLines[this._activeDoubleBufferIndex];
        let dirtyLineStart = 3000;
        let dirtyLineEnd = 0;
        // Handle any queued buffer updates
        const queuedBufferUpdates = this._queuedBufferUpdates[this._activeDoubleBufferIndex];
        while (queuedBufferUpdates.length) {
            const e = queuedBufferUpdates.shift();
            switch (e.type) {
                // TODO: Refine these cases so we're not throwing away everything
                case 2 /* ViewEventType.ViewConfigurationChanged */:
                case 8 /* ViewEventType.ViewLineMappingChanged */:
                case 17 /* ViewEventType.ViewZonesChanged */: {
                    cellBuffer.fill(0);
                    dirtyLineStart = 1;
                    dirtyLineEnd = Math.max(dirtyLineEnd, this._finalRenderedLine);
                    this._finalRenderedLine = 0;
                    break;
                }
                case 10 /* ViewEventType.ViewLinesDeleted */: {
                    // Shift content below deleted line up
                    const deletedLineContentStartIndex = (e.fromLineNumber - 1) * FullFileRenderStrategy.maxSupportedColumns * 6 /* Constants.IndicesPerCell */;
                    const deletedLineContentEndIndex = (e.toLineNumber) * FullFileRenderStrategy.maxSupportedColumns * 6 /* Constants.IndicesPerCell */;
                    const nullContentStartIndex = (this._finalRenderedLine - (e.toLineNumber - e.fromLineNumber + 1)) * FullFileRenderStrategy.maxSupportedColumns * 6 /* Constants.IndicesPerCell */;
                    cellBuffer.set(cellBuffer.subarray(deletedLineContentEndIndex), deletedLineContentStartIndex);
                    // Zero out content on lines that are no longer valid
                    cellBuffer.fill(0, nullContentStartIndex);
                    // Update dirty lines and final rendered line
                    dirtyLineStart = Math.min(dirtyLineStart, e.fromLineNumber);
                    dirtyLineEnd = Math.max(dirtyLineEnd, this._finalRenderedLine);
                    this._finalRenderedLine -= e.toLineNumber - e.fromLineNumber + 1;
                    break;
                }
            }
        }
        for (y = viewportData.startLineNumber; y <= viewportData.endLineNumber; y++) {
            // Only attempt to render lines that the GPU renderer can handle
            if (!this._viewGpuContext.canRender(viewLineOptions, viewportData, y)) {
                fillStartIndex = ((y - 1) * FullFileRenderStrategy.maxSupportedColumns) * 6 /* Constants.IndicesPerCell */;
                fillEndIndex = (y * FullFileRenderStrategy.maxSupportedColumns) * 6 /* Constants.IndicesPerCell */;
                cellBuffer.fill(0, fillStartIndex, fillEndIndex);
                dirtyLineStart = Math.min(dirtyLineStart, y);
                dirtyLineEnd = Math.max(dirtyLineEnd, y);
                continue;
            }
            // Skip updating the line if it's already up to date
            if (upToDateLines.has(y)) {
                continue;
            }
            dirtyLineStart = Math.min(dirtyLineStart, y);
            dirtyLineEnd = Math.max(dirtyLineEnd, y);
            lineData = viewportData.getViewLineRenderingData(y);
            tabXOffset = 0;
            contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
            charWidth = viewLineOptions.spaceWidth * dpr;
            absoluteOffsetX = (lineData.minColumn - 1) * charWidth;
            tokens = lineData.tokens;
            tokenStartIndex = lineData.minColumn - 1;
            tokenEndIndex = 0;
            for (let tokenIndex = 0, tokensLen = tokens.getCount(); tokenIndex < tokensLen; tokenIndex++) {
                tokenEndIndex = tokens.getEndOffset(tokenIndex);
                if (tokenEndIndex <= tokenStartIndex) {
                    // The faux indent part of the line should have no token type
                    continue;
                }
                tokenMetadata = tokens.getMetadata(tokenIndex);
                for (x = tokenStartIndex; x < tokenEndIndex; x++) {
                    // Only render lines that do not exceed maximum columns
                    if (x > FullFileRenderStrategy.maxSupportedColumns) {
                        break;
                    }
                    segment = contentSegmenter.getSegmentAtIndex(x);
                    if (segment === undefined) {
                        continue;
                    }
                    chars = segment;
                    if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
                        charWidth = this.glyphRasterizer.getTextMetrics(chars).width;
                    }
                    decorationStyleSetColor = undefined;
                    decorationStyleSetBold = undefined;
                    decorationStyleSetOpacity = undefined;
                    decorationStyleSetStrikethrough = undefined;
                    decorationStyleSetStrikethroughThickness = undefined;
                    decorationStyleSetStrikethroughColor = undefined;
                    // Apply supported inline decoration styles to the cell metadata
                    for (decoration of lineData.inlineDecorations) {
                        // This is Range.strictContainsPosition except it works at the cell level,
                        // it's also inlined to avoid overhead.
                        if ((y < decoration.range.startLineNumber || y > decoration.range.endLineNumber) ||
                            (y === decoration.range.startLineNumber && x < decoration.range.startColumn - 1) ||
                            (y === decoration.range.endLineNumber && x >= decoration.range.endColumn - 1)) {
                            continue;
                        }
                        const rules = ViewGpuContext.decorationCssRuleExtractor.getStyleRules(this._viewGpuContext.canvas.domNode, decoration.inlineClassName);
                        for (const rule of rules) {
                            for (const r of rule.style) {
                                const value = rule.styleMap.get(r)?.toString() ?? '';
                                switch (r) {
                                    case 'color': {
                                        // TODO: This parsing and error handling should move into canRender so fallback
                                        //       to DOM works
                                        const parsedColor = Color.Format.CSS.parse(value);
                                        if (!parsedColor) {
                                            throw new BugIndicatingError('Invalid color format ' + value);
                                        }
                                        decorationStyleSetColor = parsedColor.toNumber32Bit();
                                        break;
                                    }
                                    case 'font-weight': {
                                        const parsedValue = parseCssFontWeight(value);
                                        if (parsedValue >= 400) {
                                            decorationStyleSetBold = true;
                                            // TODO: Set bold (https://github.com/microsoft/vscode/issues/237584)
                                        }
                                        else {
                                            decorationStyleSetBold = false;
                                            // TODO: Set normal (https://github.com/microsoft/vscode/issues/237584)
                                        }
                                        break;
                                    }
                                    case 'opacity': {
                                        const parsedValue = parseCssOpacity(value);
                                        decorationStyleSetOpacity = parsedValue;
                                        break;
                                    }
                                    case 'text-decoration':
                                    case 'text-decoration-line': {
                                        if (value === 'line-through') {
                                            decorationStyleSetStrikethrough = true;
                                        }
                                        break;
                                    }
                                    case 'text-decoration-thickness': {
                                        const match = value.match(/^(\d+(?:\.\d+)?)px$/);
                                        if (match) {
                                            decorationStyleSetStrikethroughThickness = parseFloat(match[1]);
                                        }
                                        break;
                                    }
                                    case 'text-decoration-color': {
                                        let colorValue = value;
                                        const varMatch = value.match(/^var\((--[^,]+),\s*(?:initial|inherit)\)$/);
                                        if (varMatch) {
                                            colorValue = ViewGpuContext.decorationCssRuleExtractor.resolveCssVariable(this._viewGpuContext.canvas.domNode, varMatch[1]);
                                        }
                                        const parsedColor = Color.Format.CSS.parse(colorValue);
                                        if (parsedColor) {
                                            decorationStyleSetStrikethroughColor = parsedColor.toNumber32Bit();
                                        }
                                        break;
                                    }
                                    case 'text-decoration-style': {
                                        // These are validated in canRender and use default behavior
                                        break;
                                    }
                                    default: throw new BugIndicatingError('Unexpected inline decoration style');
                                }
                            }
                        }
                    }
                    if (chars === ' ' || chars === '\t') {
                        // Zero out glyph to ensure it doesn't get rendered
                        cellIndex = ((y - 1) * FullFileRenderStrategy.maxSupportedColumns + x) * 6 /* Constants.IndicesPerCell */;
                        cellBuffer.fill(0, cellIndex, cellIndex + 6 /* CellBufferInfo.FloatsPerEntry */);
                        // Adjust xOffset for tab stops
                        if (chars === '\t') {
                            // Find the pixel offset between the current position and the next tab stop
                            const offsetBefore = x + tabXOffset;
                            tabXOffset = CursorColumns.nextRenderTabStop(x + tabXOffset, lineData.tabSize);
                            absoluteOffsetX += charWidth * (tabXOffset - offsetBefore);
                            // Convert back to offset excluding x and the current character
                            tabXOffset -= x + 1;
                        }
                        else {
                            absoluteOffsetX += charWidth;
                        }
                        continue;
                    }
                    const decorationStyleSetId = ViewGpuContext.decorationStyleCache.getOrCreateEntry(decorationStyleSetColor, decorationStyleSetBold, decorationStyleSetOpacity, decorationStyleSetStrikethrough, decorationStyleSetStrikethroughThickness, decorationStyleSetStrikethroughColor);
                    glyph = this._viewGpuContext.atlas.getGlyph(this.glyphRasterizer, chars, tokenMetadata, decorationStyleSetId, absoluteOffsetX);
                    absoluteOffsetY = Math.round(
                    // Top of layout box (includes line height)
                    viewportData.relativeVerticalOffset[y - viewportData.startLineNumber] * dpr +
                        // Delta from top of layout box (includes line height) to top of the inline box (no line height)
                        Math.floor((viewportData.lineHeight * dpr - (glyph.fontBoundingBoxAscent + glyph.fontBoundingBoxDescent)) / 2) +
                        // Delta from top of inline box (no line height) to top of glyph origin. If the glyph was drawn
                        // with a top baseline for example, this ends up drawing the glyph correctly using the alphabetical
                        // baseline.
                        glyph.fontBoundingBoxAscent);
                    cellIndex = ((y - 1) * FullFileRenderStrategy.maxSupportedColumns + x) * 6 /* Constants.IndicesPerCell */;
                    cellBuffer[cellIndex + 0 /* CellBufferInfo.Offset_X */] = Math.floor(absoluteOffsetX);
                    cellBuffer[cellIndex + 1 /* CellBufferInfo.Offset_Y */] = absoluteOffsetY;
                    cellBuffer[cellIndex + 4 /* CellBufferInfo.GlyphIndex */] = glyph.glyphIndex;
                    cellBuffer[cellIndex + 5 /* CellBufferInfo.TextureIndex */] = glyph.pageIndex;
                    // Adjust the x pixel offset for the next character
                    absoluteOffsetX += charWidth;
                }
                tokenStartIndex = tokenEndIndex;
            }
            // Clear to end of line
            fillStartIndex = ((y - 1) * FullFileRenderStrategy.maxSupportedColumns + tokenEndIndex) * 6 /* Constants.IndicesPerCell */;
            fillEndIndex = (y * FullFileRenderStrategy.maxSupportedColumns) * 6 /* Constants.IndicesPerCell */;
            cellBuffer.fill(0, fillStartIndex, fillEndIndex);
            upToDateLines.add(y);
        }
        const visibleObjectCount = (viewportData.endLineNumber - viewportData.startLineNumber + 1) * lineIndexCount;
        // Only write when there is changed data
        dirtyLineStart = Math.min(dirtyLineStart, FullFileRenderStrategy.maxSupportedLines);
        dirtyLineEnd = Math.min(dirtyLineEnd, FullFileRenderStrategy.maxSupportedLines);
        if (dirtyLineStart <= dirtyLineEnd) {
            // Write buffer and swap it out to unblock writes
            this._device.queue.writeBuffer(this._cellBindBuffer, (dirtyLineStart - 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT, cellBuffer.buffer, (dirtyLineStart - 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT, (dirtyLineEnd - dirtyLineStart + 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT);
        }
        this._finalRenderedLine = Math.max(this._finalRenderedLine, dirtyLineEnd);
        this._activeDoubleBufferIndex = this._activeDoubleBufferIndex ? 0 : 1;
        this._visibleObjectCount = visibleObjectCount;
        return visibleObjectCount;
    }
    draw(pass, viewportData) {
        if (this._visibleObjectCount <= 0) {
            throw new BugIndicatingError('Attempt to draw 0 objects');
        }
        pass.draw(quadVertices.length / 2, this._visibleObjectCount, undefined, (viewportData.startLineNumber - 1) * FullFileRenderStrategy.maxSupportedColumns);
    }
    /**
     * Queue updates that need to happen on the active buffer, not just the cache. This will be
     * deferred to when the actual cell buffer is changed since the active buffer could be locked by
     * the GPU which would block the main thread.
     */
    _queueBufferUpdate(e) {
        this._queuedBufferUpdates[0].push(e);
        this._queuedBufferUpdates[1].push(e);
    }
}
function parseCssFontWeight(value) {
    switch (value) {
        case 'lighter':
        case 'normal': return 400;
        case 'bolder':
        case 'bold': return 700;
    }
    return parseInt(value);
}
function parseCssOpacity(value) {
    if (value.endsWith('%')) {
        return parseFloat(value.substring(0, value.length - 1)) / 100;
    }
    if (value.match(/^\d+(?:\.\d*)/)) {
        return parseFloat(value);
    }
    return 1;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnVsbEZpbGVSZW5kZXJTdHJhdGVneS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2dwdS9yZW5kZXJTdHJhdGVneS9mdWxsRmlsZVJlbmRlclN0cmF0ZWd5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBUXRFLE9BQU8sRUFBRSxzQkFBc0IsRUFBMEIsTUFBTSx3QkFBd0IsQ0FBQztBQUN4RixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU5RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDbkQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRTlDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUc3RCxJQUFXLFNBRVY7QUFGRCxXQUFXLFNBQVM7SUFDbkIsNkRBQWtCLENBQUE7QUFDbkIsQ0FBQyxFQUZVLFNBQVMsS0FBVCxTQUFTLFFBRW5CO0FBRUQsSUFBVyxjQVNWO0FBVEQsV0FBVyxjQUFjO0lBQ3hCLHVFQUFrQixDQUFBO0lBQ2xCLHNFQUFpRCxDQUFBO0lBQ2pELDJEQUFZLENBQUE7SUFDWiwyREFBWSxDQUFBO0lBQ1osdUVBQWtCLENBQUE7SUFDbEIsdUVBQWtCLENBQUE7SUFDbEIsK0RBQWMsQ0FBQTtJQUNkLG1FQUFnQixDQUFBO0FBQ2pCLENBQUMsRUFUVSxjQUFjLEtBQWQsY0FBYyxRQVN4QjtBQVNEOzs7O0dBSUc7QUFDSCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsa0JBQWtCO0lBRTdEOztPQUVHO2FBQ2Esc0JBQWlCLEdBQUcsSUFBSSxBQUFQLENBQVE7SUFFekM7O09BRUc7YUFDYSx3QkFBbUIsR0FBRyxHQUFHLEFBQU4sQ0FBTztJQXdCMUMsSUFBSSxnQkFBZ0I7UUFDbkIsT0FBTztZQUNOLEVBQUUsT0FBTyx5QkFBaUIsRUFBRSxRQUFRLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFO1lBQ3hFLEVBQUUsT0FBTyxnQ0FBd0IsRUFBRSxRQUFRLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEVBQUU7U0FDdkYsQ0FBQztJQUNILENBQUM7SUFFRCxZQUNDLE9BQW9CLEVBQ3BCLGNBQThCLEVBQzlCLE1BQWlCLEVBQ2pCLGVBQTJDO1FBRTNDLEtBQUssQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxlQUFlLENBQUMsQ0FBQztRQW5DaEQsU0FBSSxHQUFHLFVBQVUsQ0FBQztRQUNsQixTQUFJLEdBQVcsMEJBQTBCLENBQUM7UUFTM0MsNkJBQXdCLEdBQVUsQ0FBQyxDQUFDO1FBRTNCLG1CQUFjLEdBQStCLENBQUMsSUFBSSxHQUFHLEVBQUUsRUFBRSxJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDN0Usd0JBQW1CLEdBQVcsQ0FBQyxDQUFDO1FBQ2hDLHVCQUFrQixHQUFXLENBQUMsQ0FBQztRQUkvQix1QkFBa0IsR0FBWSxLQUFLLENBQUM7UUFFM0IseUJBQW9CLEdBQStDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBaUI1RixNQUFNLFVBQVUsR0FBRyxzQkFBc0IsQ0FBQyxpQkFBaUIsR0FBRyxzQkFBc0IsQ0FBQyxtQkFBbUIsbUNBQTJCLEdBQUcsWUFBWSxDQUFDLGlCQUFpQixDQUFDO1FBQ3JLLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDN0UsS0FBSyxFQUFFLDhCQUE4QjtZQUNyQyxJQUFJLEVBQUUsVUFBVTtZQUNoQixLQUFLLEVBQUUsY0FBYyxDQUFDLE9BQU8sR0FBRyxjQUFjLENBQUMsUUFBUTtTQUN2RCxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDWCxJQUFJLENBQUMsaUJBQWlCLEdBQUc7WUFDeEIsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDO1lBQzNCLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQztTQUMzQixDQUFDO1FBRUYsTUFBTSxzQkFBc0IsR0FBRyxDQUFDLENBQUM7UUFDakMsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ3JGLEtBQUssRUFBRSw2QkFBNkI7WUFDcEMsSUFBSSxFQUFFLHNCQUFzQixHQUFHLFlBQVksQ0FBQyxpQkFBaUI7WUFDN0QsS0FBSyxFQUFFLGNBQWMsQ0FBQyxPQUFPLEdBQUcsY0FBYyxDQUFDLFFBQVE7U0FDdkQsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ1gsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksWUFBWSxDQUFDLHNCQUFzQixDQUFDLENBQUM7SUFDMUUsQ0FBQztJQUVELHlCQUF5QjtJQUV6QiwyQ0FBMkM7SUFDM0MsNEZBQTRGO0lBQzVGLGlDQUFpQztJQUNqQyw4RkFBOEY7SUFDOUYsNkZBQTZGO0lBQzdGLHdGQUF3RjtJQUN4RixzQ0FBc0M7SUFFdEIsc0JBQXNCLENBQUMsQ0FBZ0M7UUFDdEUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVlLG9CQUFvQixDQUFDLENBQThCO1FBQ2xFLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQzNCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVlLGVBQWUsQ0FBQyxDQUF5QjtRQUN4RCw4RUFBOEU7UUFDOUUsMERBQTBEO1FBQzFELEtBQUssTUFBTSxLQUFLLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNyRSxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRWUsY0FBYyxDQUFDLENBQXdCO1FBQ3RELHlGQUF5RjtRQUN6RixxREFBcUQ7UUFDckQsc0VBQXNFO1FBQ3RFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVlLGVBQWUsQ0FBQyxDQUF5QjtRQUN4RCx5RkFBeUY7UUFDekYscURBQXFEO1FBQ3JELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDNUMsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRWUsY0FBYyxDQUFDLENBQXdCO1FBQ3RELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3hFLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVlLGVBQWUsQ0FBQyxDQUEwQjtRQUN6RCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDNUIsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsTUFBTSxHQUFHLEdBQUcsZUFBZSxFQUFFLENBQUMsZ0JBQWdCLENBQUM7UUFDL0MsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLFVBQVUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDO1FBQzVHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxTQUFTLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUMxRyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsd0JBQXFELENBQUMsQ0FBQztRQUM1SCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFZSxjQUFjLENBQUMsQ0FBd0I7UUFDdEQsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDM0IsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRWUsb0JBQW9CLENBQUMsQ0FBOEI7UUFDbEUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVlLGNBQWMsQ0FBQyxDQUF3QjtRQUN0RCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUMzQixJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFM0IsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsYUFBYTtJQUVMLG1CQUFtQjtRQUMxQixJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFVBQWtCO1FBQzlDLEtBQUssTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN4QixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdDLEtBQUssTUFBTSxZQUFZLElBQUksYUFBYSxFQUFFLENBQUM7Z0JBQzFDLElBQUksWUFBWSxJQUFJLFVBQVUsRUFBRSxDQUFDO29CQUNoQyxhQUFhLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUNwQyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sb0JBQW9CLENBQUMsY0FBc0IsRUFBRSxZQUFvQjtRQUN4RSxLQUFLLElBQUksQ0FBQyxHQUFHLGNBQWMsRUFBRSxDQUFDLElBQUksWUFBWSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDckQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDakMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEMsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLO1FBQ0osSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDM0IsS0FBSyxNQUFNLFdBQVcsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2xDLHlFQUF5RTtZQUN6RSxNQUFNLE1BQU0sR0FBRyxJQUFJLFlBQVksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztZQUNyRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDOUYsQ0FBQztRQUNELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVELE1BQU0sQ0FBQyxZQUEwQixFQUFFLGVBQWdDO1FBQ2xFLHVGQUF1RjtRQUN2RiwyRkFBMkY7UUFDM0YsMkZBQTJGO1FBQzNGLGtCQUFrQjtRQUVsQixJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDZixJQUFJLE9BQTJCLENBQUM7UUFDaEMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNWLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNWLElBQUksZUFBZSxHQUFHLENBQUMsQ0FBQztRQUN4QixJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUM7UUFDeEIsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLElBQUksS0FBdUMsQ0FBQztRQUM1QyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFFbEIsSUFBSSxlQUFlLEdBQUcsQ0FBQyxDQUFDO1FBQ3hCLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztRQUN0QixJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUM7UUFFdEIsSUFBSSxzQkFBMkMsQ0FBQztRQUNoRCxJQUFJLHVCQUEyQyxDQUFDO1FBQ2hELElBQUkseUJBQTZDLENBQUM7UUFDbEQsSUFBSSwrQkFBb0QsQ0FBQztRQUN6RCxJQUFJLHdDQUE0RCxDQUFDO1FBQ2pFLElBQUksb0NBQXdELENBQUM7UUFFN0QsSUFBSSxRQUErQixDQUFDO1FBQ3BDLElBQUksVUFBNEIsQ0FBQztRQUNqQyxJQUFJLGNBQWMsR0FBRyxDQUFDLENBQUM7UUFDdkIsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO1FBRXJCLElBQUksTUFBdUIsQ0FBQztRQUU1QixNQUFNLEdBQUcsR0FBRyxlQUFlLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQztRQUMvQyxJQUFJLGdCQUFtQyxDQUFDO1FBRXhDLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUM5QixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQztRQUNoQyxDQUFDO1FBRUQsbUJBQW1CO1FBQ25CLE1BQU0sVUFBVSxHQUFHLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sY0FBYyxHQUFHLHNCQUFzQixDQUFDLG1CQUFtQixtQ0FBMkIsQ0FBQztRQUU3RixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQ3pFLElBQUksY0FBYyxHQUFHLElBQUksQ0FBQztRQUMxQixJQUFJLFlBQVksR0FBRyxDQUFDLENBQUM7UUFFckIsbUNBQW1DO1FBQ25DLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQ3JGLE9BQU8sbUJBQW1CLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbkMsTUFBTSxDQUFDLEdBQUcsbUJBQW1CLENBQUMsS0FBSyxFQUFHLENBQUM7WUFDdkMsUUFBUSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2hCLGlFQUFpRTtnQkFDakUsb0RBQTRDO2dCQUM1QyxrREFBMEM7Z0JBQzFDLDRDQUFtQyxDQUFDLENBQUMsQ0FBQztvQkFDckMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFFbkIsY0FBYyxHQUFHLENBQUMsQ0FBQztvQkFDbkIsWUFBWSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO29CQUMvRCxJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDO29CQUM1QixNQUFNO2dCQUNQLENBQUM7Z0JBQ0QsNENBQW1DLENBQUMsQ0FBQyxDQUFDO29CQUNyQyxzQ0FBc0M7b0JBQ3RDLE1BQU0sNEJBQTRCLEdBQUcsQ0FBQyxDQUFDLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxHQUFHLHNCQUFzQixDQUFDLG1CQUFtQixtQ0FBMkIsQ0FBQztvQkFDcEksTUFBTSwwQkFBMEIsR0FBRyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsR0FBRyxzQkFBc0IsQ0FBQyxtQkFBbUIsbUNBQTJCLENBQUM7b0JBQzVILE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxzQkFBc0IsQ0FBQyxtQkFBbUIsbUNBQTJCLENBQUM7b0JBQzFLLFVBQVUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxFQUFFLDRCQUE0QixDQUFDLENBQUM7b0JBRTlGLHFEQUFxRDtvQkFDckQsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztvQkFFMUMsNkNBQTZDO29CQUM3QyxjQUFjLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDO29CQUM1RCxZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7b0JBQy9ELElBQUksQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDO29CQUNqRSxNQUFNO2dCQUNQLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELEtBQUssQ0FBQyxHQUFHLFlBQVksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxJQUFJLFlBQVksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUU3RSxnRUFBZ0U7WUFDaEUsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDdkUsY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsc0JBQXNCLENBQUMsbUJBQW1CLENBQUMsbUNBQTJCLENBQUM7Z0JBQ25HLFlBQVksR0FBRyxDQUFDLENBQUMsR0FBRyxzQkFBc0IsQ0FBQyxtQkFBbUIsQ0FBQyxtQ0FBMkIsQ0FBQztnQkFDM0YsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsY0FBYyxFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUVqRCxjQUFjLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQzdDLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFFekMsU0FBUztZQUNWLENBQUM7WUFFRCxvREFBb0Q7WUFDcEQsSUFBSSxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQzFCLFNBQVM7WUFDVixDQUFDO1lBRUQsY0FBYyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdDLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUV6QyxRQUFRLEdBQUcsWUFBWSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BELFVBQVUsR0FBRyxDQUFDLENBQUM7WUFFZixnQkFBZ0IsR0FBRyxzQkFBc0IsQ0FBQyxRQUFRLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDckUsU0FBUyxHQUFHLGVBQWUsQ0FBQyxVQUFVLEdBQUcsR0FBRyxDQUFDO1lBQzdDLGVBQWUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLEdBQUcsU0FBUyxDQUFDO1lBRXZELE1BQU0sR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1lBQ3pCLGVBQWUsR0FBRyxRQUFRLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztZQUN6QyxhQUFhLEdBQUcsQ0FBQyxDQUFDO1lBQ2xCLEtBQUssSUFBSSxVQUFVLEdBQUcsQ0FBQyxFQUFFLFNBQVMsR0FBRyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsVUFBVSxHQUFHLFNBQVMsRUFBRSxVQUFVLEVBQUUsRUFBRSxDQUFDO2dCQUM5RixhQUFhLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDaEQsSUFBSSxhQUFhLElBQUksZUFBZSxFQUFFLENBQUM7b0JBQ3RDLDZEQUE2RDtvQkFDN0QsU0FBUztnQkFDVixDQUFDO2dCQUVELGFBQWEsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUUvQyxLQUFLLENBQUMsR0FBRyxlQUFlLEVBQUUsQ0FBQyxHQUFHLGFBQWEsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO29CQUNsRCx1REFBdUQ7b0JBQ3ZELElBQUksQ0FBQyxHQUFHLHNCQUFzQixDQUFDLG1CQUFtQixFQUFFLENBQUM7d0JBQ3BELE1BQU07b0JBQ1AsQ0FBQztvQkFDRCxPQUFPLEdBQUcsZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2hELElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRSxDQUFDO3dCQUMzQixTQUFTO29CQUNWLENBQUM7b0JBQ0QsS0FBSyxHQUFHLE9BQU8sQ0FBQztvQkFFaEIsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLFlBQVksSUFBSSxlQUFlLENBQUMseUJBQXlCLENBQUMsRUFBRSxDQUFDO3dCQUMzRSxTQUFTLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDO29CQUM5RCxDQUFDO29CQUVELHVCQUF1QixHQUFHLFNBQVMsQ0FBQztvQkFDcEMsc0JBQXNCLEdBQUcsU0FBUyxDQUFDO29CQUNuQyx5QkFBeUIsR0FBRyxTQUFTLENBQUM7b0JBQ3RDLCtCQUErQixHQUFHLFNBQVMsQ0FBQztvQkFDNUMsd0NBQXdDLEdBQUcsU0FBUyxDQUFDO29CQUNyRCxvQ0FBb0MsR0FBRyxTQUFTLENBQUM7b0JBRWpELGdFQUFnRTtvQkFDaEUsS0FBSyxVQUFVLElBQUksUUFBUSxDQUFDLGlCQUFpQixFQUFFLENBQUM7d0JBQy9DLDBFQUEwRTt3QkFDMUUsdUNBQXVDO3dCQUN2QyxJQUNDLENBQUMsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsZUFBZSxJQUFJLENBQUMsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQzs0QkFDNUUsQ0FBQyxDQUFDLEtBQUssVUFBVSxDQUFDLEtBQUssQ0FBQyxlQUFlLElBQUksQ0FBQyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQzs0QkFDaEYsQ0FBQyxDQUFDLEtBQUssVUFBVSxDQUFDLEtBQUssQ0FBQyxhQUFhLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxFQUM1RSxDQUFDOzRCQUNGLFNBQVM7d0JBQ1YsQ0FBQzt3QkFFRCxNQUFNLEtBQUssR0FBRyxjQUFjLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUMsZUFBZSxDQUFDLENBQUM7d0JBQ3ZJLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7NEJBQzFCLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dDQUM1QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7Z0NBQ3JELFFBQVEsQ0FBQyxFQUFFLENBQUM7b0NBQ1gsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO3dDQUNkLCtFQUErRTt3Q0FDL0UscUJBQXFCO3dDQUNyQixNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7d0NBQ2xELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQzs0Q0FDbEIsTUFBTSxJQUFJLGtCQUFrQixDQUFDLHVCQUF1QixHQUFHLEtBQUssQ0FBQyxDQUFDO3dDQUMvRCxDQUFDO3dDQUNELHVCQUF1QixHQUFHLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQzt3Q0FDdEQsTUFBTTtvQ0FDUCxDQUFDO29DQUNELEtBQUssYUFBYSxDQUFDLENBQUMsQ0FBQzt3Q0FDcEIsTUFBTSxXQUFXLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxDQUFDLENBQUM7d0NBQzlDLElBQUksV0FBVyxJQUFJLEdBQUcsRUFBRSxDQUFDOzRDQUN4QixzQkFBc0IsR0FBRyxJQUFJLENBQUM7NENBQzlCLHFFQUFxRTt3Q0FDdEUsQ0FBQzs2Q0FBTSxDQUFDOzRDQUNQLHNCQUFzQixHQUFHLEtBQUssQ0FBQzs0Q0FDL0IsdUVBQXVFO3dDQUN4RSxDQUFDO3dDQUNELE1BQU07b0NBQ1AsQ0FBQztvQ0FDRCxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7d0NBQ2hCLE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQzt3Q0FDM0MseUJBQXlCLEdBQUcsV0FBVyxDQUFDO3dDQUN4QyxNQUFNO29DQUNQLENBQUM7b0NBQ0QsS0FBSyxpQkFBaUIsQ0FBQztvQ0FDdkIsS0FBSyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7d0NBQzdCLElBQUksS0FBSyxLQUFLLGNBQWMsRUFBRSxDQUFDOzRDQUM5QiwrQkFBK0IsR0FBRyxJQUFJLENBQUM7d0NBQ3hDLENBQUM7d0NBQ0QsTUFBTTtvQ0FDUCxDQUFDO29DQUNELEtBQUssMkJBQTJCLENBQUMsQ0FBQyxDQUFDO3dDQUNsQyxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUM7d0NBQ2pELElBQUksS0FBSyxFQUFFLENBQUM7NENBQ1gsd0NBQXdDLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dDQUNqRSxDQUFDO3dDQUNELE1BQU07b0NBQ1AsQ0FBQztvQ0FDRCxLQUFLLHVCQUF1QixDQUFDLENBQUMsQ0FBQzt3Q0FDOUIsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO3dDQUN2QixNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxDQUFDLENBQUM7d0NBQzFFLElBQUksUUFBUSxFQUFFLENBQUM7NENBQ2QsVUFBVSxHQUFHLGNBQWMsQ0FBQywwQkFBMEIsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0NBQzdILENBQUM7d0NBQ0QsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO3dDQUN2RCxJQUFJLFdBQVcsRUFBRSxDQUFDOzRDQUNqQixvQ0FBb0MsR0FBRyxXQUFXLENBQUMsYUFBYSxFQUFFLENBQUM7d0NBQ3BFLENBQUM7d0NBQ0QsTUFBTTtvQ0FDUCxDQUFDO29DQUNELEtBQUssdUJBQXVCLENBQUMsQ0FBQyxDQUFDO3dDQUM5Qiw0REFBNEQ7d0NBQzVELE1BQU07b0NBQ1AsQ0FBQztvQ0FDRCxPQUFPLENBQUMsQ0FBQyxNQUFNLElBQUksa0JBQWtCLENBQUMsb0NBQW9DLENBQUMsQ0FBQztnQ0FDN0UsQ0FBQzs0QkFDRixDQUFDO3dCQUNGLENBQUM7b0JBQ0YsQ0FBQztvQkFFRCxJQUFJLEtBQUssS0FBSyxHQUFHLElBQUksS0FBSyxLQUFLLElBQUksRUFBRSxDQUFDO3dCQUNyQyxtREFBbUQ7d0JBQ25ELFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLHNCQUFzQixDQUFDLG1CQUFtQixHQUFHLENBQUMsQ0FBQyxtQ0FBMkIsQ0FBQzt3QkFDbEcsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsd0NBQWdDLENBQUMsQ0FBQzt3QkFDekUsK0JBQStCO3dCQUMvQixJQUFJLEtBQUssS0FBSyxJQUFJLEVBQUUsQ0FBQzs0QkFDcEIsMkVBQTJFOzRCQUMzRSxNQUFNLFlBQVksR0FBRyxDQUFDLEdBQUcsVUFBVSxDQUFDOzRCQUNwQyxVQUFVLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixDQUFDLENBQUMsR0FBRyxVQUFVLEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDOzRCQUMvRSxlQUFlLElBQUksU0FBUyxHQUFHLENBQUMsVUFBVSxHQUFHLFlBQVksQ0FBQyxDQUFDOzRCQUMzRCwrREFBK0Q7NEJBQy9ELFVBQVUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO3dCQUNyQixDQUFDOzZCQUFNLENBQUM7NEJBQ1AsZUFBZSxJQUFJLFNBQVMsQ0FBQzt3QkFDOUIsQ0FBQzt3QkFDRCxTQUFTO29CQUNWLENBQUM7b0JBRUQsTUFBTSxvQkFBb0IsR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUMsZ0JBQWdCLENBQUMsdUJBQXVCLEVBQUUsc0JBQXNCLEVBQUUseUJBQXlCLEVBQUUsK0JBQStCLEVBQUUsd0NBQXdDLEVBQUUsb0NBQW9DLENBQUMsQ0FBQztvQkFDL1EsS0FBSyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsb0JBQW9CLEVBQUUsZUFBZSxDQUFDLENBQUM7b0JBRS9ILGVBQWUsR0FBRyxJQUFJLENBQUMsS0FBSztvQkFDM0IsMkNBQTJDO29CQUMzQyxZQUFZLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxHQUFHLFlBQVksQ0FBQyxlQUFlLENBQUMsR0FBRyxHQUFHO3dCQUUzRSxnR0FBZ0c7d0JBQ2hHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxZQUFZLENBQUMsVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsR0FBRyxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFFOUcsK0ZBQStGO3dCQUMvRixtR0FBbUc7d0JBQ25HLFlBQVk7d0JBQ1osS0FBSyxDQUFDLHFCQUFxQixDQUMzQixDQUFDO29CQUVGLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLHNCQUFzQixDQUFDLG1CQUFtQixHQUFHLENBQUMsQ0FBQyxtQ0FBMkIsQ0FBQztvQkFDbEcsVUFBVSxDQUFDLFNBQVMsa0NBQTBCLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO29CQUM5RSxVQUFVLENBQUMsU0FBUyxrQ0FBMEIsQ0FBQyxHQUFHLGVBQWUsQ0FBQztvQkFDbEUsVUFBVSxDQUFDLFNBQVMsb0NBQTRCLENBQUMsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDO29CQUNyRSxVQUFVLENBQUMsU0FBUyxzQ0FBOEIsQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7b0JBRXRFLG1EQUFtRDtvQkFDbkQsZUFBZSxJQUFJLFNBQVMsQ0FBQztnQkFDOUIsQ0FBQztnQkFFRCxlQUFlLEdBQUcsYUFBYSxDQUFDO1lBQ2pDLENBQUM7WUFFRCx1QkFBdUI7WUFDdkIsY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsc0JBQXNCLENBQUMsbUJBQW1CLEdBQUcsYUFBYSxDQUFDLG1DQUEyQixDQUFDO1lBQ25ILFlBQVksR0FBRyxDQUFDLENBQUMsR0FBRyxzQkFBc0IsQ0FBQyxtQkFBbUIsQ0FBQyxtQ0FBMkIsQ0FBQztZQUMzRixVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxjQUFjLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFFakQsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0QixDQUFDO1FBRUQsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFlBQVksQ0FBQyxhQUFhLEdBQUcsWUFBWSxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUMsR0FBRyxjQUFjLENBQUM7UUFFNUcsd0NBQXdDO1FBQ3hDLGNBQWMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxzQkFBc0IsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3BGLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxzQkFBc0IsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ2hGLElBQUksY0FBYyxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ3BDLGlEQUFpRDtZQUNqRCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQzdCLElBQUksQ0FBQyxlQUFlLEVBQ3BCLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxHQUFHLGNBQWMsR0FBRyxZQUFZLENBQUMsaUJBQWlCLEVBQ3RFLFVBQVUsQ0FBQyxNQUFNLEVBQ2pCLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxHQUFHLGNBQWMsR0FBRyxZQUFZLENBQUMsaUJBQWlCLEVBQ3RFLENBQUMsWUFBWSxHQUFHLGNBQWMsR0FBRyxDQUFDLENBQUMsR0FBRyxjQUFjLEdBQUcsWUFBWSxDQUFDLGlCQUFpQixDQUNyRixDQUFDO1FBQ0gsQ0FBQztRQUVELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUUxRSxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV0RSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsa0JBQWtCLENBQUM7UUFFOUMsT0FBTyxrQkFBa0IsQ0FBQztJQUMzQixDQUFDO0lBRUQsSUFBSSxDQUFDLElBQTBCLEVBQUUsWUFBMEI7UUFDMUQsSUFBSSxJQUFJLENBQUMsbUJBQW1CLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDbkMsTUFBTSxJQUFJLGtCQUFrQixDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFDM0QsQ0FBQztRQUNELElBQUksQ0FBQyxJQUFJLENBQ1IsWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQ3ZCLElBQUksQ0FBQyxtQkFBbUIsRUFDeEIsU0FBUyxFQUNULENBQUMsWUFBWSxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUMsR0FBRyxzQkFBc0IsQ0FBQyxtQkFBbUIsQ0FDL0UsQ0FBQztJQUNILENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssa0JBQWtCLENBQUMsQ0FBb0I7UUFDOUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7O0FBR0YsU0FBUyxrQkFBa0IsQ0FBQyxLQUFhO0lBQ3hDLFFBQVEsS0FBSyxFQUFFLENBQUM7UUFDZixLQUFLLFNBQVMsQ0FBQztRQUNmLEtBQUssUUFBUSxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUM7UUFDMUIsS0FBSyxRQUFRLENBQUM7UUFDZCxLQUFLLE1BQU0sQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDO0lBQ3pCLENBQUM7SUFDRCxPQUFPLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN4QixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsS0FBYTtJQUNyQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUN6QixPQUFPLFVBQVUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDO0lBQy9ELENBQUM7SUFDRCxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztRQUNsQyxPQUFPLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMxQixDQUFDO0lBQ0QsT0FBTyxDQUFDLENBQUM7QUFDVixDQUFDIn0=