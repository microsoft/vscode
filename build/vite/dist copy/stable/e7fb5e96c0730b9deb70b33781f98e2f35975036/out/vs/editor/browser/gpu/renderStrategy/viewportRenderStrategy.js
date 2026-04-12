/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { Color } from '../../../../base/common/color.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { CursorColumns } from '../../../common/core/cursorColumns.js';
import { createContentSegmenter } from '../contentSegmenter.js';
import { GPULifecycle } from '../gpuDisposable.js';
import { quadVertices } from '../gpuUtils.js';
import { ViewGpuContext } from '../viewGpuContext.js';
import { BaseRenderStrategy } from './baseRenderStrategy.js';
import { fullFileRenderStrategyWgsl } from './fullFileRenderStrategy.wgsl.js';
var Constants;
(function (Constants) {
    Constants[Constants["IndicesPerCell"] = 6] = "IndicesPerCell";
    Constants[Constants["CellBindBufferCapacityIncrement"] = 32] = "CellBindBufferCapacityIncrement";
    Constants[Constants["CellBindBufferInitialCapacity"] = 63] = "CellBindBufferInitialCapacity";
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
 * A render strategy that uploads the content of the entire viewport every frame.
 */
export class ViewportRenderStrategy extends BaseRenderStrategy {
    /**
     * The hard cap for line columns that can be rendered by the GPU renderer.
     */
    static { this.maxSupportedColumns = 2000; }
    get bindGroupEntries() {
        return [
            { binding: 1 /* BindingId.Cells */, resource: { buffer: this._cellBindBuffer } },
            { binding: 6 /* BindingId.ScrollOffset */, resource: { buffer: this._scrollOffsetBindBuffer } }
        ];
    }
    constructor(context, viewGpuContext, device, glyphRasterizer) {
        super(context, viewGpuContext, device, glyphRasterizer);
        this.type = 'viewport';
        this.wgsl = fullFileRenderStrategyWgsl;
        this._cellBindBufferLineCapacity = 63 /* Constants.CellBindBufferInitialCapacity */;
        this._activeDoubleBufferIndex = 0;
        this._visibleObjectCount = 0;
        this._lastViewportLineCount = 0;
        this._scrollInitialized = false;
        this._onDidChangeBindGroupEntries = this._register(new Emitter());
        this.onDidChangeBindGroupEntries = this._onDidChangeBindGroupEntries.event;
        this._rebuildCellBuffer(this._cellBindBufferLineCapacity);
        const scrollOffsetBufferSize = 2;
        this._scrollOffsetBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
            label: 'Monaco scroll offset buffer',
            size: scrollOffsetBufferSize * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })).object;
        this._scrollOffsetValueBuffer = new Float32Array(scrollOffsetBufferSize);
    }
    _rebuildCellBuffer(lineCount) {
        this._cellBindBuffer?.destroy();
        // Increase in chunks so resizing a window by hand doesn't keep allocating and throwing away
        const lineCountWithIncrement = (Math.floor(lineCount / 32 /* Constants.CellBindBufferCapacityIncrement */) + 1) * 32 /* Constants.CellBindBufferCapacityIncrement */;
        const bufferSize = lineCountWithIncrement * ViewportRenderStrategy.maxSupportedColumns * 6 /* Constants.IndicesPerCell */ * Float32Array.BYTES_PER_ELEMENT;
        this._cellBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
            label: 'Monaco full file cell buffer',
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        })).object;
        this._cellValueBuffers = [
            new ArrayBuffer(bufferSize),
            new ArrayBuffer(bufferSize),
        ];
        this._cellBindBufferLineCapacity = lineCountWithIncrement;
        this._lastViewportLineCount = 0;
        this._onDidChangeBindGroupEntries.fire();
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
        return true;
    }
    onDecorationsChanged(e) {
        return true;
    }
    onTokensChanged(e) {
        return true;
    }
    onLinesDeleted(e) {
        return true;
    }
    onLinesInserted(e) {
        return true;
    }
    onLinesChanged(e) {
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
        return true;
    }
    onLineMappingChanged(e) {
        return true;
    }
    onZonesChanged(e) {
        return true;
    }
    // #endregion
    reset() {
        for (const bufferIndex of [0, 1]) {
            // Zero out buffer and upload to GPU to prevent stale rows from rendering
            const buffer = new Float32Array(this._cellValueBuffers[bufferIndex]);
            buffer.fill(0, 0, buffer.length);
            this._device.queue.writeBuffer(this._cellBindBuffer, 0, buffer.buffer, 0, buffer.byteLength);
        }
        this._lastViewportLineCount = 0;
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
        // Zero out cell buffer or rebuild if needed
        if (this._cellBindBufferLineCapacity < viewportData.endLineNumber - viewportData.startLineNumber + 1) {
            this._rebuildCellBuffer(viewportData.endLineNumber - viewportData.startLineNumber + 1);
        }
        const cellBuffer = new Float32Array(this._cellValueBuffers[this._activeDoubleBufferIndex]);
        cellBuffer.fill(0);
        const lineIndexCount = ViewportRenderStrategy.maxSupportedColumns * 6 /* Constants.IndicesPerCell */;
        for (y = viewportData.startLineNumber; y <= viewportData.endLineNumber; y++) {
            // Only attempt to render lines that the GPU renderer can handle
            if (!this._viewGpuContext.canRender(viewLineOptions, viewportData, y)) {
                continue;
            }
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
                    if (x > ViewportRenderStrategy.maxSupportedColumns) {
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
                        cellIndex = ((y - 1) * ViewportRenderStrategy.maxSupportedColumns + x) * 6 /* Constants.IndicesPerCell */;
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
                    cellIndex = ((y - viewportData.startLineNumber) * ViewportRenderStrategy.maxSupportedColumns + x) * 6 /* Constants.IndicesPerCell */;
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
            fillStartIndex = ((y - viewportData.startLineNumber) * ViewportRenderStrategy.maxSupportedColumns + tokenEndIndex) * 6 /* Constants.IndicesPerCell */;
            fillEndIndex = ((y - viewportData.startLineNumber) * ViewportRenderStrategy.maxSupportedColumns) * 6 /* Constants.IndicesPerCell */;
            cellBuffer.fill(0, fillStartIndex, fillEndIndex);
        }
        const visibleObjectCount = (viewportData.endLineNumber - viewportData.startLineNumber + 1) * lineIndexCount;
        const viewportLineCount = viewportData.endLineNumber - viewportData.startLineNumber + 1;
        // This render strategy always uploads the whole viewport
        this._device.queue.writeBuffer(this._cellBindBuffer, 0, cellBuffer.buffer, 0, visibleObjectCount * Float32Array.BYTES_PER_ELEMENT);
        // Clear stale lines in GPU buffer if viewport shrunk
        if (viewportLineCount < this._lastViewportLineCount) {
            const staleLineCount = this._lastViewportLineCount - viewportLineCount;
            const staleStartOffset = visibleObjectCount * Float32Array.BYTES_PER_ELEMENT;
            const staleByteCount = staleLineCount * lineIndexCount * Float32Array.BYTES_PER_ELEMENT;
            // Write zeros from the zeroed cellBuffer for the stale region
            this._device.queue.writeBuffer(this._cellBindBuffer, staleStartOffset, cellBuffer.buffer, visibleObjectCount * Float32Array.BYTES_PER_ELEMENT, staleByteCount);
        }
        this._lastViewportLineCount = viewportLineCount;
        this._activeDoubleBufferIndex = this._activeDoubleBufferIndex ? 0 : 1;
        this._visibleObjectCount = visibleObjectCount;
        return visibleObjectCount;
    }
    draw(pass, viewportData) {
        if (this._visibleObjectCount <= 0) {
            throw new BugIndicatingError('Attempt to draw 0 objects');
        }
        pass.draw(quadVertices.length / 2, this._visibleObjectCount);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld3BvcnRSZW5kZXJTdHJhdGVneS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2dwdS9yZW5kZXJTdHJhdGVneS92aWV3cG9ydFJlbmRlclN0cmF0ZWd5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQVN0RSxPQUFPLEVBQUUsc0JBQXNCLEVBQTBCLE1BQU0sd0JBQXdCLENBQUM7QUFFeEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ25ELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDdEQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDN0QsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFOUUsSUFBVyxTQUlWO0FBSkQsV0FBVyxTQUFTO0lBQ25CLDZEQUFrQixDQUFBO0lBQ2xCLGdHQUFvQyxDQUFBO0lBQ3BDLDRGQUFrQyxDQUFBO0FBQ25DLENBQUMsRUFKVSxTQUFTLEtBQVQsU0FBUyxRQUluQjtBQUVELElBQVcsY0FTVjtBQVRELFdBQVcsY0FBYztJQUN4Qix1RUFBa0IsQ0FBQTtJQUNsQixzRUFBaUQsQ0FBQTtJQUNqRCwyREFBWSxD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