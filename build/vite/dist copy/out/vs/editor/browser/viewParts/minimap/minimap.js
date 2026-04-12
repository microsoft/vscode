/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './minimap.css';
import * as dom from '../../../../base/browser/dom.js';
import { createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { GlobalPointerMoveMonitor } from '../../../../base/browser/globalPointerMoveMonitor.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as platform from '../../../../base/common/platform.js';
import * as strings from '../../../../base/common/strings.js';
import { RenderedLinesCollection } from '../../view/viewLayer.js';
import { PartFingerprints, ViewPart } from '../../view/viewPart.js';
import { MINIMAP_GUTTER_WIDTH, EditorLayoutInfoComputer } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { RGBA8 } from '../../../common/core/misc/rgba.js';
import { MinimapTokensColorTracker } from '../../../common/viewModel/minimapTokensColorTracker.js';
import { minimapSelection, minimapBackground, minimapForegroundOpacity, editorForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { Selection } from '../../../common/core/selection.js';
import { EventType, Gesture } from '../../../../base/browser/touch.js';
import { MinimapCharRendererFactory } from './minimapCharRendererFactory.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { LRUCache } from '../../../../base/common/map.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { ViewModelDecoration } from '../../../common/viewModel/viewModelDecoration.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
/**
 * The orthogonal distance to the slider at which dragging "resets". This implements "snapping"
 */
const POINTER_DRAG_RESET_DISTANCE = 140;
const GUTTER_DECORATION_WIDTH = 2;
class MinimapOptions {
    constructor(configuration, theme, tokensColorTracker) {
        const options = configuration.options;
        const pixelRatio = options.get(163 /* EditorOption.pixelRatio */);
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        const minimapLayout = layoutInfo.minimap;
        const fontInfo = options.get(59 /* EditorOption.fontInfo */);
        const minimapOpts = options.get(81 /* EditorOption.minimap */);
        this.renderMinimap = minimapLayout.renderMinimap;
        this.size = minimapOpts.size;
        this.minimapHeightIsEditorHeight = minimapLayout.minimapHeightIsEditorHeight;
        this.scrollBeyondLastLine = options.get(119 /* EditorOption.scrollBeyondLastLine */);
        this.paddingTop = options.get(96 /* EditorOption.padding */).top;
        this.paddingBottom = options.get(96 /* EditorOption.padding */).bottom;
        this.showSlider = minimapOpts.showSlider;
        this.autohide = minimapOpts.autohide;
        this.pixelRatio = pixelRatio;
        this.typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
        this.lineHeight = options.get(75 /* EditorOption.lineHeight */);
        this.minimapLeft = minimapLayout.minimapLeft;
        this.minimapWidth = minimapLayout.minimapWidth;
        this.minimapHeight = layoutInfo.height;
        this.canvasInnerWidth = minimapLayout.minimapCanvasInnerWidth;
        this.canvasInnerHeight = minimapLayout.minimapCanvasInnerHeight;
        this.canvasOuterWidth = minimapLayout.minimapCanvasOuterWidth;
        this.canvasOuterHeight = minimapLayout.minimapCanvasOuterHeight;
        this.isSampling = minimapLayout.minimapIsSampling;
        this.editorHeight = layoutInfo.height;
        this.fontScale = minimapLayout.minimapScale;
        this.minimapLineHeight = minimapLayout.minimapLineHeight;
        this.minimapCharWidth = 1 /* Constants.BASE_CHAR_WIDTH */ * this.fontScale;
        this.sectionHeaderFontFamily = DEFAULT_FONT_FAMILY;
        this.sectionHeaderFontSize = minimapOpts.sectionHeaderFontSize * pixelRatio;
        this.sectionHeaderLetterSpacing = minimapOpts.sectionHeaderLetterSpacing; // intentionally not multiplying by pixelRatio
        this.sectionHeaderFontColor = MinimapOptions._getSectionHeaderColor(theme, tokensColorTracker.getColor(1 /* ColorId.DefaultForeground */));
        this.charRenderer = createSingleCallFunction(() => MinimapCharRendererFactory.create(this.fontScale, fontInfo.fontFamily));
        this.defaultBackgroundColor = tokensColorTracker.getColor(2 /* ColorId.DefaultBackground */);
        this.backgroundColor = MinimapOptions._getMinimapBackground(theme, this.defaultBackgroundColor);
        this.foregroundAlpha = MinimapOptions._getMinimapForegroundOpacity(theme);
    }
    static _getMinimapBackground(theme, defaultBackgroundColor) {
        const themeColor = theme.getColor(minimapBackground);
        if (themeColor) {
            return new RGBA8(themeColor.rgba.r, themeColor.rgba.g, themeColor.rgba.b, Math.round(255 * themeColor.rgba.a));
        }
        return defaultBackgroundColor;
    }
    static _getMinimapForegroundOpacity(theme) {
        const themeColor = theme.getColor(minimapForegroundOpacity);
        if (themeColor) {
            return RGBA8._clamp(Math.round(255 * themeColor.rgba.a));
        }
        return 255;
    }
    static _getSectionHeaderColor(theme, defaultForegroundColor) {
        const themeColor = theme.getColor(editorForeground);
        if (themeColor) {
            return new RGBA8(themeColor.rgba.r, themeColor.rgba.g, themeColor.rgba.b, Math.round(255 * themeColor.rgba.a));
        }
        return defaultForegroundColor;
    }
    equals(other) {
        return (this.renderMinimap === other.renderMinimap
            && this.size === other.size
            && this.minimapHeightIsEditorHeight === other.minimapHeightIsEditorHeight
            && this.scrollBeyondLastLine === other.scrollBeyondLastLine
            && this.paddingTop === other.paddingTop
            && this.paddingBottom === other.paddingBottom
            && this.showSlider === other.showSlider
            && this.autohide === other.autohide
            && this.pixelRatio === other.pixelRatio
            && this.typicalHalfwidthCharacterWidth === other.typicalHalfwidthCharacterWidth
            && this.lineHeight === other.lineHeight
            && this.minimapLeft === other.minimapLeft
            && this.minimapWidth === other.minimapWidth
            && this.minimapHeight === other.minimapHeight
            && this.canvasInnerWidth === other.canvasInnerWidth
            && this.canvasInnerHeight === other.canvasInnerHeight
            && this.canvasOuterWidth === other.canvasOuterWidth
            && this.canvasOuterHeight === other.canvasOuterHeight
            && this.isSampling === other.isSampling
            && this.editorHeight === other.editorHeight
            && this.fontScale === other.fontScale
            && this.minimapLineHeight === other.minimapLineHeight
            && this.minimapCharWidth === other.minimapCharWidth
            && this.sectionHeaderFontSize === other.sectionHeaderFontSize
            && this.sectionHeaderLetterSpacing === other.sectionHeaderLetterSpacing
            && this.defaultBackgroundColor && this.defaultBackgroundColor.equals(other.defaultBackgroundColor)
            && this.backgroundColor && this.backgroundColor.equals(other.backgroundColor)
            && this.foregroundAlpha === other.foregroundAlpha);
    }
}
class MinimapLayout {
    constructor(
    /**
     * The given editor scrollTop (input).
     */
    scrollTop, 
    /**
     * The given editor scrollHeight (input).
     */
    scrollHeight, sliderNeeded, _computedSliderRatio, 
    /**
     * slider dom node top (in CSS px)
     */
    sliderTop, 
    /**
     * slider dom node height (in CSS px)
     */
    sliderHeight, 
    /**
     * empty lines to reserve at the top of the minimap.
     */
    topPaddingLineCount, 
    /**
     * minimap render start line number.
     */
    startLineNumber, 
    /**
     * minimap render end line number.
     */
    endLineNumber) {
        this.scrollTop = scrollTop;
        this.scrollHeight = scrollHeight;
        this.sliderNeeded = sliderNeeded;
        this._computedSliderRatio = _computedSliderRatio;
        this.sliderTop = sliderTop;
        this.sliderHeight = sliderHeight;
        this.topPaddingLineCount = topPaddingLineCount;
        this.startLineNumber = startLineNumber;
        this.endLineNumber = endLineNumber;
    }
    /**
     * Compute a desired `scrollPosition` such that the slider moves by `delta`.
     */
    getDesiredScrollTopFromDelta(delta) {
        return Math.round(this.scrollTop + delta / this._computedSliderRatio);
    }
    getDesiredScrollTopFromTouchLocation(pageY) {
        return Math.round((pageY - this.sliderHeight / 2) / this._computedSliderRatio);
    }
    /**
     * Intersect a line range with `this.startLineNumber` and `this.endLineNumber`.
     */
    intersectWithViewport(range) {
        const startLineNumber = Math.max(this.startLineNumber, range.startLineNumber);
        const endLineNumber = Math.min(this.endLineNumber, range.endLineNumber);
        if (startLineNumber > endLineNumber) {
            // entirely outside minimap's viewport
            return null;
        }
        return [startLineNumber, endLineNumber];
    }
    /**
     * Get the inner minimap y coordinate for a line number.
     */
    getYForLineNumber(lineNumber, minimapLineHeight) {
        return +(lineNumber - this.startLineNumber + this.topPaddingLineCount) * minimapLineHeight;
    }
    static create(options, viewportStartLineNumber, viewportEndLineNumber, viewportStartLineNumberVerticalOffset, viewportHeight, viewportContainsWhitespaceGaps, lineCount, realLineCount, scrollTop, scrollHeight, previousLayout) {
        const pixelRatio = options.pixelRatio;
        const minimapLineHeight = options.minimapLineHeight;
        const minimapLinesFitting = Math.floor(options.canvasInnerHeight / minimapLineHeight);
        const lineHeight = options.lineHeight;
        if (options.minimapHeightIsEditorHeight) {
            let logicalScrollHeight = (realLineCount * options.lineHeight
                + options.paddingTop
                + options.paddingBottom);
            if (options.scrollBeyondLastLine) {
                logicalScrollHeight += Math.max(0, viewportHeight - options.lineHeight - options.paddingBottom);
            }
            const sliderHeight = Math.max(1, Math.floor(viewportHeight * viewportHeight / logicalScrollHeight));
            const maxMinimapSliderTop = Math.max(0, options.minimapHeight - sliderHeight);
            // The slider can move from 0 to `maxMinimapSliderTop`
            // in the same way `scrollTop` can move from 0 to `scrollHeight` - `viewportHeight`.
            const computedSliderRatio = (maxMinimapSliderTop) / (scrollHeight - viewportHeight);
            const sliderTop = (scrollTop * computedSliderRatio);
            const sliderNeeded = (maxMinimapSliderTop > 0);
            const maxLinesFitting = Math.floor(options.canvasInnerHeight / options.minimapLineHeight);
            const topPaddingLineCount = Math.floor(options.paddingTop / options.lineHeight);
            return new MinimapLayout(scrollTop, scrollHeight, sliderNeeded, computedSliderRatio, sliderTop, sliderHeight, topPaddingLineCount, 1, Math.min(lineCount, maxLinesFitting));
        }
        // The visible line count in a viewport can change due to a number of reasons:
        //  a) with the same viewport width, different scroll positions can result in partial lines being visible:
        //    e.g. for a line height of 20, and a viewport height of 600
        //          * scrollTop = 0  => visible lines are [1, 30]
        //          * scrollTop = 10 => visible lines are [1, 31] (with lines 1 and 31 partially visible)
        //          * scrollTop = 20 => visible lines are [2, 31]
        //  b) whitespace gaps might make their way in the viewport (which results in a decrease in the visible line count)
        //  c) we could be in the scroll beyond last line case (which also results in a decrease in the visible line count, down to possibly only one line being visible)
        // We must first establish a desirable slider height.
        let sliderHeight;
        if (viewportContainsWhitespaceGaps && viewportEndLineNumber !== lineCount) {
            // case b) from above: there are whitespace gaps in the viewport.
            // In this case, the height of the slider directly reflects the visible line count.
            const viewportLineCount = viewportEndLineNumber - viewportStartLineNumber + 1;
            sliderHeight = Math.floor(viewportLineCount * minimapLineHeight / pixelRatio);
        }
        else {
            // The slider has a stable height
            const expectedViewportLineCount = viewportHeight / lineHeight;
            sliderHeight = Math.floor(expectedViewportLineCount * minimapLineHeight / pixelRatio);
        }
        const extraLinesAtTheTop = Math.floor(options.paddingTop / lineHeight);
        let extraLinesAtTheBottom = Math.floor(options.paddingBottom / lineHeight);
        if (options.scrollBeyondLastLine) {
            const expectedViewportLineCount = viewportHeight / lineHeight;
            extraLinesAtTheBottom = Math.max(extraLinesAtTheBottom, expectedViewportLineCount - 1);
        }
        let maxMinimapSliderTop;
        if (extraLinesAtTheBottom > 0) {
            const expectedViewportLineCount = viewportHeight / lineHeight;
            // The minimap slider, when dragged all the way down, will contain the last line at its top
            maxMinimapSliderTop = (extraLinesAtTheTop + lineCount + extraLinesAtTheBottom - expectedViewportLineCount - 1) * minimapLineHeight / pixelRatio;
        }
        else {
            // The minimap slider, when dragged all the way down, will contain the last line at its bottom
            maxMinimapSliderTop = Math.max(0, (extraLinesAtTheTop + lineCount) * minimapLineHeight / pixelRatio - sliderHeight);
        }
        maxMinimapSliderTop = Math.min(options.minimapHeight - sliderHeight, maxMinimapSliderTop);
        // The slider can move from 0 to `maxMinimapSliderTop`
        // in the same way `scrollTop` can move from 0 to `scrollHeight` - `viewportHeight`.
        const computedSliderRatio = (maxMinimapSliderTop) / (scrollHeight - viewportHeight);
        const sliderTop = (scrollTop * computedSliderRatio);
        if (minimapLinesFitting >= extraLinesAtTheTop + lineCount + extraLinesAtTheBottom) {
            // All lines fit in the minimap
            const sliderNeeded = (maxMinimapSliderTop > 0);
            return new MinimapLayout(scrollTop, scrollHeight, sliderNeeded, computedSliderRatio, sliderTop, sliderHeight, extraLinesAtTheTop, 1, lineCount);
        }
        else {
            let consideringStartLineNumber;
            if (viewportStartLineNumber > 1) {
                consideringStartLineNumber = viewportStartLineNumber + extraLinesAtTheTop;
            }
            else {
                consideringStartLineNumber = Math.max(1, scrollTop / lineHeight);
            }
            let topPaddingLineCount;
            let startLineNumber = Math.max(1, Math.floor(consideringStartLineNumber - sliderTop * pixelRatio / minimapLineHeight));
            if (startLineNumber < extraLinesAtTheTop) {
                topPaddingLineCount = extraLinesAtTheTop - startLineNumber + 1;
                startLineNumber = 1;
            }
            else {
                topPaddingLineCount = 0;
                startLineNumber = Math.max(1, startLineNumber - extraLinesAtTheTop);
            }
            // Avoid flickering caused by a partial viewport start line
            // by being consistent w.r.t. the previous layout decision
            if (previousLayout && previousLayout.scrollHeight === scrollHeight) {
                if (previousLayout.scrollTop > scrollTop) {
                    // Scrolling up => never increase `startLineNumber`
                    startLineNumber = Math.min(startLineNumber, previousLayout.startLineNumber);
                    topPaddingLineCount = Math.max(topPaddingLineCount, previousLayout.topPaddingLineCount);
                }
                if (previousLayout.scrollTop < scrollTop) {
                    // Scrolling down => never decrease `startLineNumber`
                    startLineNumber = Math.max(startLineNumber, previousLayout.startLineNumber);
                    topPaddingLineCount = Math.min(topPaddingLineCount, previousLayout.topPaddingLineCount);
                }
            }
            const endLineNumber = Math.min(lineCount, startLineNumber - topPaddingLineCount + minimapLinesFitting - 1);
            const partialLine = (scrollTop - viewportStartLineNumberVerticalOffset) / lineHeight;
            let sliderTopAligned;
            if (scrollTop >= options.paddingTop) {
                sliderTopAligned = (viewportStartLineNumber - startLineNumber + topPaddingLineCount + partialLine) * minimapLineHeight / pixelRatio;
            }
            else {
                sliderTopAligned = (scrollTop / options.paddingTop) * (topPaddingLineCount + partialLine) * minimapLineHeight / pixelRatio;
            }
            return new MinimapLayout(scrollTop, scrollHeight, true, computedSliderRatio, sliderTopAligned, sliderHeight, topPaddingLineCount, startLineNumber, endLineNumber);
        }
    }
}
class MinimapLine {
    static { this.INVALID = new MinimapLine(-1); }
    constructor(dy) {
        this.dy = dy;
    }
    onContentChanged() {
        this.dy = -1;
    }
    onTokensChanged() {
        this.dy = -1;
    }
}
class RenderData {
    constructor(renderedLayout, imageData, lines) {
        this.renderedLayout = renderedLayout;
        this._imageData = imageData;
        this._renderedLines = new RenderedLinesCollection({
            createLine: () => MinimapLine.INVALID
        });
        this._renderedLines._set(renderedLayout.startLineNumber, lines);
    }
    /**
     * Check if the current RenderData matches accurately the new desired layout and no painting is needed.
     */
    linesEquals(layout) {
        if (!this.scrollEquals(layout)) {
            return false;
        }
        const tmp = this._renderedLines._get();
        const lines = tmp.lines;
        for (let i = 0, len = lines.length; i < len; i++) {
            if (lines[i].dy === -1) {
                // This line is invalid
                return false;
            }
        }
        return true;
    }
    /**
     * Check if the current RenderData matches the new layout's scroll position
     */
    scrollEquals(layout) {
        return this.renderedLayout.startLineNumber === layout.startLineNumber
            && this.renderedLayout.endLineNumber === layout.endLineNumber;
    }
    _get() {
        const tmp = this._renderedLines._get();
        return {
            imageData: this._imageData,
            rendLineNumberStart: tmp.rendLineNumberStart,
            lines: tmp.lines
        };
    }
    onLinesChanged(changeFromLineNumber, changeCount) {
        return this._renderedLines.onLinesChanged(changeFromLineNumber, changeCount);
    }
    onLinesDeleted(deleteFromLineNumber, deleteToLineNumber) {
        this._renderedLines.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
    }
    onLinesInserted(insertFromLineNumber, insertToLineNumber) {
        this._renderedLines.onLinesInserted(insertFromLineNumber, insertToLineNumber);
    }
    onTokensChanged(ranges) {
        return this._renderedLines.onTokensChanged(ranges);
    }
}
/**
 * Some sort of double buffering.
 *
 * Keeps two buffers around that will be rotated for painting.
 * Always gives a buffer that is filled with the background color.
 */
class MinimapBuffers {
    constructor(ctx, WIDTH, HEIGHT, background) {
        this._backgroundFillData = MinimapBuffers._createBackgroundFillData(WIDTH, HEIGHT, background);
        this._buffers = [
            ctx.createImageData(WIDTH, HEIGHT),
            ctx.createImageData(WIDTH, HEIGHT)
        ];
        this._lastUsedBuffer = 0;
    }
    getBuffer() {
        // rotate buffers
        this._lastUsedBuffer = 1 - this._lastUsedBuffer;
        const result = this._buffers[this._lastUsedBuffer];
        // fill with background color
        result.data.set(this._backgroundFillData);
        return result;
    }
    static _createBackgroundFillData(WIDTH, HEIGHT, background) {
        const backgroundR = background.r;
        const backgroundG = background.g;
        const backgroundB = background.b;
        const backgroundA = background.a;
        const result = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
        let offset = 0;
        for (let i = 0; i < HEIGHT; i++) {
            for (let j = 0; j < WIDTH; j++) {
                result[offset] = backgroundR;
                result[offset + 1] = backgroundG;
                result[offset + 2] = backgroundB;
                result[offset + 3] = backgroundA;
                offset += 4;
            }
        }
        return result;
    }
}
class MinimapSamplingState {
    static compute(options, viewLineCount, oldSamplingState) {
        if (options.renderMinimap === 0 /* RenderMinimap.None */ || !options.isSampling) {
            return [null, []];
        }
        // ratio is intentionally not part of the layout to avoid the layout changing all the time
        // so we need to recompute it again...
        const { minimapLineCount } = EditorLayoutInfoComputer.computeContainedMinimapLineCount({
            viewLineCount: viewLineCount,
            scrollBeyondLastLine: options.scrollBeyondLastLine,
            paddingTop: options.paddingTop,
            paddingBottom: options.paddingBottom,
            height: options.editorHeight,
            lineHeight: options.lineHeight,
            pixelRatio: options.pixelRatio
        });
        const ratio = viewLineCount / minimapLineCount;
        const halfRatio = ratio / 2;
        if (!oldSamplingState || oldSamplingState.minimapLines.length === 0) {
            const result = [];
            result[0] = 1;
            if (minimapLineCount > 1) {
                for (let i = 0, lastIndex = minimapLineCount - 1; i < lastIndex; i++) {
                    result[i] = Math.round(i * ratio + halfRatio);
                }
                result[minimapLineCount - 1] = viewLineCount;
            }
            return [new MinimapSamplingState(ratio, result), []];
        }
        const oldMinimapLines = oldSamplingState.minimapLines;
        const oldLength = oldMinimapLines.length;
        const result = [];
        let oldIndex = 0;
        let oldDeltaLineCount = 0;
        let minViewLineNumber = 1;
        const MAX_EVENT_COUNT = 10; // generate at most 10 events, if there are more than 10 changes, just flush all previous data
        let events = [];
        let lastEvent = null;
        for (let i = 0; i < minimapLineCount; i++) {
            const fromViewLineNumber = Math.max(minViewLineNumber, Math.round(i * ratio));
            const toViewLineNumber = Math.max(fromViewLineNumber, Math.round((i + 1) * ratio));
            while (oldIndex < oldLength && oldMinimapLines[oldIndex] < fromViewLineNumber) {
                if (events.length < MAX_EVENT_COUNT) {
                    const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
                    if (lastEvent && lastEvent.type === 'deleted' && lastEvent._oldIndex === oldIndex - 1) {
                        lastEvent.deleteToLineNumber++;
                    }
                    else {
                        lastEvent = { type: 'deleted', _oldIndex: oldIndex, deleteFromLineNumber: oldMinimapLineNumber, deleteToLineNumber: oldMinimapLineNumber };
                        events.push(lastEvent);
                    }
                    oldDeltaLineCount--;
                }
                oldIndex++;
            }
            let selectedViewLineNumber;
            if (oldIndex < oldLength && oldMinimapLines[oldIndex] <= toViewLineNumber) {
                // reuse the old sampled line
                selectedViewLineNumber = oldMinimapLines[oldIndex];
                oldIndex++;
            }
            else {
                if (i === 0) {
                    selectedViewLineNumber = 1;
                }
                else if (i + 1 === minimapLineCount) {
                    selectedViewLineNumber = viewLineCount;
                }
                else {
                    selectedViewLineNumber = Math.round(i * ratio + halfRatio);
                }
                if (events.length < MAX_EVENT_COUNT) {
                    const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
                    if (lastEvent && lastEvent.type === 'inserted' && lastEvent._i === i - 1) {
                        lastEvent.insertToLineNumber++;
                    }
                    else {
                        lastEvent = { type: 'inserted', _i: i, insertFromLineNumber: oldMinimapLineNumber, insertToLineNumber: oldMinimapLineNumber };
                        events.push(lastEvent);
                    }
                    oldDeltaLineCount++;
                }
            }
            result[i] = selectedViewLineNumber;
            minViewLineNumber = selectedViewLineNumber;
        }
        if (events.length < MAX_EVENT_COUNT) {
            while (oldIndex < oldLength) {
                const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
                if (lastEvent && lastEvent.type === 'deleted' && lastEvent._oldIndex === oldIndex - 1) {
                    lastEvent.deleteToLineNumber++;
                }
                else {
                    lastEvent = { type: 'deleted', _oldIndex: oldIndex, deleteFromLineNumber: oldMinimapLineNumber, deleteToLineNumber: oldMinimapLineNumber };
                    events.push(lastEvent);
                }
                oldDeltaLineCount--;
                oldIndex++;
            }
        }
        else {
            // too many events, just give up
            events = [{ type: 'flush' }];
        }
        return [new MinimapSamplingState(ratio, result), events];
    }
    constructor(samplingRatio, minimapLines // a map of 0-based minimap line indexes to 1-based view line numbers
    ) {
        this.samplingRatio = samplingRatio;
        this.minimapLines = minimapLines;
    }
    modelLineToMinimapLine(lineNumber) {
        return Math.min(this.minimapLines.length, Math.max(1, Math.round(lineNumber / this.samplingRatio)));
    }
    /**
     * Will return null if the model line ranges are not intersecting with a sampled model line.
     */
    modelLineRangeToMinimapLineRange(fromLineNumber, toLineNumber) {
        let fromLineIndex = this.modelLineToMinimapLine(fromLineNumber) - 1;
        while (fromLineIndex > 0 && this.minimapLines[fromLineIndex - 1] >= fromLineNumber) {
            fromLineIndex--;
        }
        let toLineIndex = this.modelLineToMinimapLine(toLineNumber) - 1;
        while (toLineIndex + 1 < this.minimapLines.length && this.minimapLines[toLineIndex + 1] <= toLineNumber) {
            toLineIndex++;
        }
        if (fromLineIndex === toLineIndex) {
            const sampledLineNumber = this.minimapLines[fromLineIndex];
            if (sampledLineNumber < fromLineNumber || sampledLineNumber > toLineNumber) {
                // This line is not part of the sampled lines ==> nothing to do
                return null;
            }
        }
        return [fromLineIndex + 1, toLineIndex + 1];
    }
    /**
     * Will always return a range, even if it is not intersecting with a sampled model line.
     */
    decorationLineRangeToMinimapLineRange(startLineNumber, endLineNumber) {
        let minimapLineStart = this.modelLineToMinimapLine(startLineNumber);
        let minimapLineEnd = this.modelLineToMinimapLine(endLineNumber);
        if (startLineNumber !== endLineNumber && minimapLineEnd === minimapLineStart) {
            if (minimapLineEnd === this.minimapLines.length) {
                if (minimapLineStart > 1) {
                    minimapLineStart--;
                }
            }
            else {
                minimapLineEnd++;
            }
        }
        return [minimapLineStart, minimapLineEnd];
    }
    onLinesDeleted(e) {
        // have the mapping be sticky
        const deletedLineCount = e.toLineNumber - e.fromLineNumber + 1;
        let changeStartIndex = this.minimapLines.length;
        let changeEndIndex = 0;
        for (let i = this.minimapLines.length - 1; i >= 0; i--) {
            if (this.minimapLines[i] < e.fromLineNumber) {
                break;
            }
            if (this.minimapLines[i] <= e.toLineNumber) {
                // this line got deleted => move to previous available
                this.minimapLines[i] = Math.max(1, e.fromLineNumber - 1);
                changeStartIndex = Math.min(changeStartIndex, i);
                changeEndIndex = Math.max(changeEndIndex, i);
            }
            else {
                this.minimapLines[i] -= deletedLineCount;
            }
        }
        return [changeStartIndex, changeEndIndex];
    }
    onLinesInserted(e) {
        // have the mapping be sticky
        const insertedLineCount = e.toLineNumber - e.fromLineNumber + 1;
        for (let i = this.minimapLines.length - 1; i >= 0; i--) {
            if (this.minimapLines[i] < e.fromLineNumber) {
                break;
            }
            this.minimapLines[i] += insertedLineCount;
        }
    }
}
/**
 * The minimap appears beside the editor scroll bar and visualizes a zoomed out
 * view of the file.
 */
export class Minimap extends ViewPart {
    constructor(context) {
        super(context);
        this._sectionHeaderCache = new LRUCache(10, 1.5);
        this.tokensColorTracker = MinimapTokensColorTracker.getInstance();
        this._selections = [];
        this._minimapSelections = null;
        this.options = new MinimapOptions(this._context.configuration, this._context.theme, this.tokensColorTracker);
        const [samplingState,] = MinimapSamplingState.compute(this.options, this._context.viewModel.getLineCount(), null);
        this._samplingState = samplingState;
        this._shouldCheckSampling = false;
        this._actual = new InnerMinimap(context.theme, this);
    }
    dispose() {
        this._actual.dispose();
        super.dispose();
    }
    getDomNode() {
        return this._actual.getDomNode();
    }
    _onOptionsMaybeChanged() {
        const opts = new MinimapOptions(this._context.configuration, this._context.theme, this.tokensColorTracker);
        if (this.options.equals(opts)) {
            return false;
        }
        this.options = opts;
        this._recreateLineSampling();
        this._actual.onDidChangeOptions();
        return true;
    }
    // ---- begin view event handlers
    onConfigurationChanged(e) {
        return this._onOptionsMaybeChanged();
    }
    onCursorStateChanged(e) {
        this._selections = e.selections;
        this._minimapSelections = null;
        return this._actual.onSelectionChanged();
    }
    onDecorationsChanged(e) {
        if (e.affectsMinimap) {
            return this._actual.onDecorationsChanged();
        }
        return false;
    }
    onFlushed(e) {
        if (this._samplingState) {
            this._shouldCheckSampling = true;
        }
        return this._actual.onFlushed();
    }
    onLinesChanged(e) {
        if (this._samplingState) {
            const minimapLineRange = this._samplingState.modelLineRangeToMinimapLineRange(e.fromLineNumber, e.fromLineNumber + e.count - 1);
            if (minimapLineRange) {
                return this._actual.onLinesChanged(minimapLineRange[0], minimapLineRange[1] - minimapLineRange[0] + 1);
            }
            else {
                return false;
            }
        }
        else {
            return this._actual.onLinesChanged(e.fromLineNumber, e.count);
        }
    }
    onLinesDeleted(e) {
        if (this._samplingState) {
            const [changeStartIndex, changeEndIndex] = this._samplingState.onLinesDeleted(e);
            if (changeStartIndex <= changeEndIndex) {
                this._actual.onLinesChanged(changeStartIndex + 1, changeEndIndex - changeStartIndex + 1);
            }
            this._shouldCheckSampling = true;
            return true;
        }
        else {
            return this._actual.onLinesDeleted(e.fromLineNumber, e.toLineNumber);
        }
    }
    onLinesInserted(e) {
        if (this._samplingState) {
            this._samplingState.onLinesInserted(e);
            this._shouldCheckSampling = true;
            return true;
        }
        else {
            return this._actual.onLinesInserted(e.fromLineNumber, e.toLineNumber);
        }
    }
    onScrollChanged(e) {
        return this._actual.onScrollChanged(e);
    }
    onThemeChanged(e) {
        this._actual.onThemeChanged();
        this._onOptionsMaybeChanged();
        return true;
    }
    onTokensChanged(e) {
        if (this._samplingState) {
            const ranges = [];
            for (const range of e.ranges) {
                const minimapLineRange = this._samplingState.modelLineRangeToMinimapLineRange(range.fromLineNumber, range.toLineNumber);
                if (minimapLineRange) {
                    ranges.push({ fromLineNumber: minimapLineRange[0], toLineNumber: minimapLineRange[1] });
                }
            }
            if (ranges.length) {
                return this._actual.onTokensChanged(ranges);
            }
            else {
                return false;
            }
        }
        else {
            return this._actual.onTokensChanged(e.ranges);
        }
    }
    onTokensColorsChanged(e) {
        this._onOptionsMaybeChanged();
        return this._actual.onTokensColorsChanged();
    }
    onZonesChanged(e) {
        return this._actual.onZonesChanged();
    }
    // --- end event handlers
    prepareRender(ctx) {
        if (this._shouldCheckSampling) {
            this._shouldCheckSampling = false;
            this._recreateLineSampling();
        }
    }
    render(ctx) {
        let viewportStartLineNumber = ctx.visibleRange.startLineNumber;
        let viewportEndLineNumber = ctx.visibleRange.endLineNumber;
        if (this._samplingState) {
            viewportStartLineNumber = this._samplingState.modelLineToMinimapLine(viewportStartLineNumber);
            viewportEndLineNumber = this._samplingState.modelLineToMinimapLine(viewportEndLineNumber);
        }
        const minimapCtx = {
            viewportContainsWhitespaceGaps: (ctx.viewportData.whitespaceViewportData.length > 0),
            scrollWidth: ctx.scrollWidth,
            scrollHeight: ctx.scrollHeight,
            viewportStartLineNumber: viewportStartLineNumber,
            viewportEndLineNumber: viewportEndLineNumber,
            viewportStartLineNumberVerticalOffset: ctx.getVerticalOffsetForLineNumber(viewportStartLineNumber),
            scrollTop: ctx.scrollTop,
            scrollLeft: ctx.scrollLeft,
            viewportWidth: ctx.viewportWidth,
            viewportHeight: ctx.viewportHeight,
        };
        this._actual.render(minimapCtx);
    }
    //#region IMinimapModel
    _recreateLineSampling() {
        this._minimapSelections = null;
        const wasSampling = Boolean(this._samplingState);
        const [samplingState, events] = MinimapSamplingState.compute(this.options, this._context.viewModel.getLineCount(), this._samplingState);
        this._samplingState = samplingState;
        if (wasSampling && this._samplingState) {
            // was sampling, is sampling
            for (const event of events) {
                switch (event.type) {
                    case 'deleted':
                        this._actual.onLinesDeleted(event.deleteFromLineNumber, event.deleteToLineNumber);
                        break;
                    case 'inserted':
                        this._actual.onLinesInserted(event.insertFromLineNumber, event.insertToLineNumber);
                        break;
                    case 'flush':
                        this._actual.onFlushed();
                        break;
                }
            }
        }
    }
    getLineCount() {
        if (this._samplingState) {
            return this._samplingState.minimapLines.length;
        }
        return this._context.viewModel.getLineCount();
    }
    getRealLineCount() {
        return this._context.viewModel.getLineCount();
    }
    getLineContent(lineNumber) {
        if (this._samplingState) {
            return this._context.viewModel.getLineContent(this._samplingState.minimapLines[lineNumber - 1]);
        }
        return this._context.viewModel.getLineContent(lineNumber);
    }
    getLineMaxColumn(lineNumber) {
        if (this._samplingState) {
            return this._context.viewModel.getLineMaxColumn(this._samplingState.minimapLines[lineNumber - 1]);
        }
        return this._context.viewModel.getLineMaxColumn(lineNumber);
    }
    getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed) {
        if (this._samplingState) {
            const result = [];
            for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
                if (needed[lineIndex]) {
                    result[lineIndex] = this._context.viewModel.getViewLineData(this._samplingState.minimapLines[startLineNumber + lineIndex - 1]);
                }
                else {
                    result[lineIndex] = null;
                }
            }
            return result;
        }
        return this._context.viewModel.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed).data;
    }
    getSelections() {
        if (this._minimapSelections === null) {
            if (this._samplingState) {
                this._minimapSelections = [];
                for (const selection of this._selections) {
                    const [minimapLineStart, minimapLineEnd] = this._samplingState.decorationLineRangeToMinimapLineRange(selection.startLineNumber, selection.endLineNumber);
                    this._minimapSelections.push(new Selection(minimapLineStart, selection.startColumn, minimapLineEnd, selection.endColumn));
                }
            }
            else {
                this._minimapSelections = this._selections;
            }
        }
        return this._minimapSelections;
    }
    getMinimapDecorationsInViewport(startLineNumber, endLineNumber) {
        return this._getMinimapDecorationsInViewport(startLineNumber, endLineNumber)
            .filter(decoration => !decoration.options.minimap?.sectionHeaderStyle);
    }
    getSectionHeaderDecorationsInViewport(startLineNumber, endLineNumber) {
        const headerHeightInMinimapLines = this.options.sectionHeaderFontSize / this.options.minimapLineHeight;
        startLineNumber = Math.floor(Math.max(1, startLineNumber - headerHeightInMinimapLines));
        return this._getMinimapDecorationsInViewport(startLineNumber, endLineNumber)
            .filter(decoration => !!decoration.options.minimap?.sectionHeaderStyle);
    }
    _getMinimapDecorationsInViewport(startLineNumber, endLineNumber) {
        let visibleRange;
        if (this._samplingState) {
            const modelStartLineNumber = this._samplingState.minimapLines[startLineNumber - 1];
            const modelEndLineNumber = this._samplingState.minimapLines[endLineNumber - 1];
            visibleRange = new Range(modelStartLineNumber, 1, modelEndLineNumber, this._context.viewModel.getLineMaxColumn(modelEndLineNumber));
        }
        else {
            visibleRange = new Range(startLineNumber, 1, endLineNumber, this._context.viewModel.getLineMaxColumn(endLineNumber));
        }
        const decorations = this._context.viewModel.getMinimapDecorationsInRange(visibleRange);
        if (this._samplingState) {
            const result = [];
            for (const decoration of decorations) {
                if (!decoration.options.minimap) {
                    continue;
                }
                const range = decoration.range;
                const minimapStartLineNumber = this._samplingState.modelLineToMinimapLine(range.startLineNumber);
                const minimapEndLineNumber = this._samplingState.modelLineToMinimapLine(range.endLineNumber);
                result.push(new ViewModelDecoration(new Range(minimapStartLineNumber, range.startColumn, minimapEndLineNumber, range.endColumn), decoration.options));
            }
            return result;
        }
        return decorations;
    }
    getSectionHeaderText(decoration, fitWidth) {
        const headerText = decoration.options.minimap?.sectionHeaderText;
        if (!headerText) {
            return null;
        }
        const cachedText = this._sectionHeaderCache.get(headerText);
        if (cachedText) {
            return cachedText;
        }
        const fittedText = fitWidth(headerText);
        this._sectionHeaderCache.set(headerText, fittedText);
        return fittedText;
    }
    getOptions() {
        return this._context.viewModel.model.getOptions();
    }
    revealLineNumber(lineNumber) {
        if (this._samplingState) {
            lineNumber = this._samplingState.minimapLines[lineNumber - 1];
        }
        this._context.viewModel.revealRange('mouse', false, new Range(lineNumber, 1, lineNumber, 1), 1 /* viewEvents.VerticalRevealType.Center */, 0 /* ScrollType.Smooth */);
    }
    setScrollTop(scrollTop) {
        this._context.viewModel.viewLayout.setScrollPosition({
            scrollTop: scrollTop
        }, 1 /* ScrollType.Immediate */);
    }
}
class InnerMinimap extends Disposable {
    constructor(theme, model) {
        super();
        this._renderDecorations = false;
        this._gestureInProgress = false;
        this._isMouseOverMinimap = false;
        this._theme = theme;
        this._model = model;
        this._lastRenderData = null;
        this._buffers = null;
        this._selectionColor = this._theme.getColor(minimapSelection);
        this._domNode = createFastDomNode(document.createElement('div'));
        PartFingerprints.write(this._domNode, 9 /* PartFingerprint.Minimap */);
        this._domNode.setClassName(this._getMinimapDomNodeClassName());
        this._domNode.setPosition('absolute');
        this._domNode.setAttribute('role', 'presentation');
        this._domNode.setAttribute('aria-hidden', 'true');
        this._shadow = createFastDomNode(document.createElement('div'));
        this._shadow.setClassName('minimap-shadow-hidden');
        this._domNode.appendChild(this._shadow);
        this._canvas = createFastDomNode(document.createElement('canvas'));
        this._canvas.setPosition('absolute');
        this._canvas.setLeft(0);
        this._domNode.appendChild(this._canvas);
        this._decorationsCanvas = createFastDomNode(document.createElement('canvas'));
        this._decorationsCanvas.setPosition('absolute');
        this._decorationsCanvas.setClassName('minimap-decorations-layer');
        this._decorationsCanvas.setLeft(0);
        this._domNode.appendChild(this._decorationsCanvas);
        this._slider = createFastDomNode(document.createElement('div'));
        this._slider.setPosition('absolute');
        this._slider.setClassName('minimap-slider');
        this._slider.setLayerHinting(true);
        this._slider.setContain('strict');
        this._domNode.appendChild(this._slider);
        this._sliderHorizontal = createFastDomNode(document.createElement('div'));
        this._sliderHorizontal.setPosition('absolute');
        this._sliderHorizontal.setClassName('minimap-slider-horizontal');
        this._slider.appendChild(this._sliderHorizontal);
        this._applyLayout();
        this._hideDelayedScheduler = this._register(new RunOnceScheduler(() => this._hideImmediatelyIfMouseIsOutside(), 500));
        this._register(dom.addStandardDisposableListener(this._domNode.domNode, dom.EventType.MOUSE_OVER, () => {
            this._isMouseOverMinimap = true;
        }));
        this._register(dom.addStandardDisposableListener(this._domNode.domNode, dom.EventType.MOUSE_LEAVE, () => {
            this._isMouseOverMinimap = false;
        }));
        this._pointerDownListener = dom.addStandardDisposableListener(this._domNode.domNode, dom.EventType.POINTER_DOWN, (e) => {
            e.preventDefault();
            const isMouse = (e.pointerType === 'mouse');
            const isLeftClick = (e.button === 0);
            const renderMinimap = this._model.options.renderMinimap;
            if (renderMinimap === 0 /* RenderMinimap.None */) {
                return;
            }
            if (!this._lastRenderData) {
                return;
            }
            if (this._model.options.size !== 'proportional') {
                if (isLeftClick && this._lastRenderData) {
                    // pretend the click occurred in the center of the slider
                    const position = dom.getDomNodePagePosition(this._slider.domNode);
                    const initialPosY = position.top + position.height / 2;
                    this._startSliderDragging(e, initialPosY, this._lastRenderData.renderedLayout);
                }
                return;
            }
            if (isLeftClick || !isMouse) {
                const minimapLineHeight = this._model.options.minimapLineHeight;
                const internalOffsetY = (this._model.options.canvasInnerHeight / this._model.options.canvasOuterHeight) * e.offsetY;
                const lineIndex = Math.floor(internalOffsetY / minimapLineHeight);
                let lineNumber = lineIndex + this._lastRenderData.renderedLayout.startLineNumber - this._lastRenderData.renderedLayout.topPaddingLineCount;
                lineNumber = Math.min(lineNumber, this._model.getLineCount());
                this._model.revealLineNumber(lineNumber);
            }
        });
        this._sliderPointerMoveMonitor = new GlobalPointerMoveMonitor();
        this._sliderPointerDownListener = dom.addStandardDisposableListener(this._slider.domNode, dom.EventType.POINTER_DOWN, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.button === 0 && this._lastRenderData) {
                this._startSliderDragging(e, e.pageY, this._lastRenderData.renderedLayout);
            }
        });
        this._gestureDisposable = Gesture.addTarget(this._domNode.domNode);
        this._sliderTouchStartListener = dom.addDisposableListener(this._domNode.domNode, EventType.Start, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this._lastRenderData) {
                this._slider.toggleClassName('active', true);
                this._gestureInProgress = true;
                this.scrollDueToTouchEvent(e);
            }
        }, { passive: false });
        this._sliderTouchMoveListener = dom.addDisposableListener(this._domNode.domNode, EventType.Change, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this._lastRenderData && this._gestureInProgress) {
                this.scrollDueToTouchEvent(e);
            }
        }, { passive: false });
        this._sliderTouchEndListener = dom.addStandardDisposableListener(this._domNode.domNode, EventType.End, (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._gestureInProgress = false;
            this._slider.toggleClassName('active', false);
        });
    }
    _hideSoon() {
        this._hideDelayedScheduler.cancel();
        this._hideDelayedScheduler.schedule();
    }
    _hideImmediatelyIfMouseIsOutside() {
        if (this._isMouseOverMinimap) {
            this._hideSoon();
            return;
        }
        this._domNode.toggleClassName('active', false);
    }
    _startSliderDragging(e, initialPosY, initialSliderState) {
        if (!e.target || !(e.target instanceof Element)) {
            return;
        }
        const initialPosX = e.pageX;
        this._slider.toggleClassName('active', true);
        const handlePointerMove = (posy, posx) => {
            const minimapPosition = dom.getDomNodePagePosition(this._domNode.domNode);
            const pointerOrthogonalDelta = Math.min(Math.abs(posx - initialPosX), Math.abs(posx - minimapPosition.left), Math.abs(posx - minimapPosition.left - minimapPosition.width));
            if (platform.isWindows && pointerOrthogonalDelta > POINTER_DRAG_RESET_DISTANCE) {
                // The pointer has wondered away from the scrollbar => reset dragging
                this._model.setScrollTop(initialSliderState.scrollTop);
                return;
            }
            const pointerDelta = posy - initialPosY;
            this._model.setScrollTop(initialSliderState.getDesiredScrollTopFromDelta(pointerDelta));
        };
        if (e.pageY !== initialPosY) {
            handlePointerMove(e.pageY, initialPosX);
        }
        this._sliderPointerMoveMonitor.startMonitoring(e.target, e.pointerId, e.buttons, pointerMoveData => handlePointerMove(pointerMoveData.pageY, pointerMoveData.pageX), () => {
            this._slider.toggleClassName('active', false);
        });
    }
    scrollDueToTouchEvent(touch) {
        const startY = this._domNode.domNode.getBoundingClientRect().top;
        const scrollTop = this._lastRenderData.renderedLayout.getDesiredScrollTopFromTouchLocation(touch.pageY - startY);
        this._model.setScrollTop(scrollTop);
    }
    dispose() {
        this._pointerDownListener.dispose();
        this._sliderPointerMoveMonitor.dispose();
        this._sliderPointerDownListener.dispose();
        this._gestureDisposable.dispose();
        this._sliderTouchStartListener.dispose();
        this._sliderTouchMoveListener.dispose();
        this._sliderTouchEndListener.dispose();
        super.dispose();
    }
    _getMinimapDomNodeClassName() {
        const class_ = ['minimap'];
        if (this._model.options.showSlider === 'always') {
            class_.push('slider-always');
        }
        else {
            class_.push('slider-mouseover');
        }
        if (this._model.options.autohide === 'mouseover') {
            class_.push('minimap-autohide-mouseover');
        }
        else if (this._model.options.autohide === 'scroll') {
            class_.push('minimap-autohide-scroll');
        }
        return class_.join(' ');
    }
    getDomNode() {
        return this._domNode;
    }
    _applyLayout() {
        this._domNode.setLeft(this._model.options.minimapLeft);
        this._domNode.setWidth(this._model.options.minimapWidth);
        this._domNode.setHeight(this._model.options.minimapHeight);
        this._shadow.setHeight(this._model.options.minimapHeight);
        this._canvas.setWidth(this._model.options.canvasOuterWidth);
        this._canvas.setHeight(this._model.options.canvasOuterHeight);
        this._canvas.domNode.width = this._model.options.canvasInnerWidth;
        this._canvas.domNode.height = this._model.options.canvasInnerHeight;
        this._decorationsCanvas.setWidth(this._model.options.canvasOuterWidth);
        this._decorationsCanvas.setHeight(this._model.options.canvasOuterHeight);
        this._decorationsCanvas.domNode.width = this._model.options.canvasInnerWidth;
        this._decorationsCanvas.domNode.height = this._model.options.canvasInnerHeight;
        this._slider.setWidth(this._model.options.minimapWidth);
    }
    _getBuffer() {
        if (!this._buffers) {
            if (this._model.options.canvasInnerWidth > 0 && this._model.options.canvasInnerHeight > 0) {
                this._buffers = new MinimapBuffers(this._canvas.domNode.getContext('2d'), this._model.options.canvasInnerWidth, this._model.options.canvasInnerHeight, this._model.options.backgroundColor);
            }
        }
        return this._buffers ? this._buffers.getBuffer() : null;
    }
    // ---- begin view event handlers
    onDidChangeOptions() {
        this._lastRenderData = null;
        this._buffers = null;
        this._applyLayout();
        this._domNode.setClassName(this._getMinimapDomNodeClassName());
    }
    onSelectionChanged() {
        this._renderDecorations = true;
        return true;
    }
    onDecorationsChanged() {
        this._renderDecorations = true;
        return true;
    }
    onFlushed() {
        this._lastRenderData = null;
        return true;
    }
    onLinesChanged(changeFromLineNumber, changeCount) {
        if (this._lastRenderData) {
            return this._lastRenderData.onLinesChanged(changeFromLineNumber, changeCount);
        }
        return false;
    }
    onLinesDeleted(deleteFromLineNumber, deleteToLineNumber) {
        this._lastRenderData?.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
        return true;
    }
    onLinesInserted(insertFromLineNumber, insertToLineNumber) {
        this._lastRenderData?.onLinesInserted(insertFromLineNumber, insertToLineNumber);
        return true;
    }
    onScrollChanged(e) {
        if (this._model.options.autohide === 'scroll' && (e.scrollTopChanged || e.scrollHeightChanged)) {
            this._domNode.toggleClassName('active', true);
            this._hideSoon();
        }
        this._renderDecorations = true;
        return true;
    }
    onThemeChanged() {
        this._selectionColor = this._theme.getColor(minimapSelection);
        this._renderDecorations = true;
        return true;
    }
    onTokensChanged(ranges) {
        if (this._lastRenderData) {
            return this._lastRenderData.onTokensChanged(ranges);
        }
        return false;
    }
    onTokensColorsChanged() {
        this._lastRenderData = null;
        this._buffers = null;
        return true;
    }
    onZonesChanged() {
        this._lastRenderData = null;
        return true;
    }
    // --- end event handlers
    render(renderingCtx) {
        const renderMinimap = this._model.options.renderMinimap;
        if (renderMinimap === 0 /* RenderMinimap.None */) {
            this._shadow.setClassName('minimap-shadow-hidden');
            this._sliderHorizontal.setWidth(0);
            this._sliderHorizontal.setHeight(0);
            return;
        }
        if (renderingCtx.scrollLeft + renderingCtx.viewportWidth >= renderingCtx.scrollWidth) {
            this._shadow.setClassName('minimap-shadow-hidden');
        }
        else {
            this._shadow.setClassName('minimap-shadow-visible');
        }
        const layout = MinimapLayout.create(this._model.options, renderingCtx.viewportStartLineNumber, renderingCtx.viewportEndLineNumber, renderingCtx.viewportStartLineNumberVerticalOffset, renderingCtx.viewportHeight, renderingCtx.viewportContainsWhitespaceGaps, this._model.getLineCount(), this._model.getRealLineCount(), renderingCtx.scrollTop, renderingCtx.scrollHeight, this._lastRenderData ? this._lastRenderData.renderedLayout : null);
        this._slider.setDisplay(layout.sliderNeeded ? 'block' : 'none');
        this._slider.setTop(layout.sliderTop);
        this._slider.setHeight(layout.sliderHeight);
        // Compute horizontal slider coordinates
        this._sliderHorizontal.setLeft(0);
        this._sliderHorizontal.setWidth(this._model.options.minimapWidth);
        this._sliderHorizontal.setTop(0);
        this._sliderHorizontal.setHeight(layout.sliderHeight);
        this.renderDecorations(layout);
        this._lastRenderData = this.renderLines(layout);
    }
    renderDecorations(layout) {
        if (this._renderDecorations) {
            this._renderDecorations = false;
            const selections = this._model.getSelections();
            selections.sort(Range.compareRangesUsingStarts);
            const decorations = this._model.getMinimapDecorationsInViewport(layout.startLineNumber, layout.endLineNumber);
            decorations.sort((a, b) => (a.options.zIndex || 0) - (b.options.zIndex || 0));
            const { canvasInnerWidth, canvasInnerHeight } = this._model.options;
            const minimapLineHeight = this._model.options.minimapLineHeight;
            const minimapCharWidth = this._model.options.minimapCharWidth;
            const tabSize = this._model.getOptions().tabSize;
            const canvasContext = this._decorationsCanvas.domNode.getContext('2d');
            canvasContext.clearRect(0, 0, canvasInnerWidth, canvasInnerHeight);
            // We first need to render line highlights and then render decorations on top of those.
            // But we need to pick a single color for each line, and use that as a line highlight.
            // This needs to be the color of the decoration with the highest `zIndex`, but priority
            // is given to the selection.
            const highlightedLines = new ContiguousLineMap(layout.startLineNumber, layout.endLineNumber, false);
            this._renderSelectionLineHighlights(canvasContext, selections, highlightedLines, layout, minimapLineHeight);
            this._renderDecorationsLineHighlights(canvasContext, decorations, highlightedLines, layout, minimapLineHeight);
            const lineOffsetMap = new ContiguousLineMap(layout.startLineNumber, layout.endLineNumber, null);
            this._renderSelectionsHighlights(canvasContext, selections, lineOffsetMap, layout, minimapLineHeight, tabSize, minimapCharWidth, canvasInnerWidth);
            this._renderDecorationsHighlights(canvasContext, decorations, lineOffsetMap, layout, minimapLineHeight, tabSize, minimapCharWidth, canvasInnerWidth);
            this._renderSectionHeaders(layout);
        }
    }
    _renderSelectionLineHighlights(canvasContext, selections, highlightedLines, layout, minimapLineHeight) {
        if (!this._selectionColor || this._selectionColor.isTransparent()) {
            return;
        }
        canvasContext.fillStyle = this._selectionColor.transparent(0.5).toString();
        let y1 = 0;
        let y2 = 0;
        for (const selection of selections) {
            const intersection = layout.intersectWithViewport(selection);
            if (!intersection) {
                // entirely outside minimap's viewport
                continue;
            }
            const [startLineNumber, endLineNumber] = intersection;
            for (let line = startLineNumber; line <= endLineNumber; line++) {
                highlightedLines.set(line, true);
            }
            const yy1 = layout.getYForLineNumber(startLineNumber, minimapLineHeight);
            const yy2 = layout.getYForLineNumber(endLineNumber, minimapLineHeight);
            if (y2 >= yy1) {
                // merge into previous
                y2 = yy2;
            }
            else {
                if (y2 > y1) {
                    // flush
                    canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y1, canvasContext.canvas.width, y2 - y1);
                }
                y1 = yy1;
                y2 = yy2;
            }
        }
        if (y2 > y1) {
            // flush
            canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y1, canvasContext.canvas.width, y2 - y1);
        }
    }
    _renderDecorationsLineHighlights(canvasContext, decorations, highlightedLines, layout, minimapLineHeight) {
        const highlightColors = new Map();
        // Loop backwards to hit first decorations with higher `zIndex`
        for (let i = decorations.length - 1; i >= 0; i--) {
            const decoration = decorations[i];
            const minimapOptions = decoration.options.minimap;
            if (!minimapOptions || minimapOptions.position !== 1 /* MinimapPosition.Inline */) {
                continue;
            }
            const intersection = layout.intersectWithViewport(decoration.range);
            if (!intersection) {
                // entirely outside minimap's viewport
                continue;
            }
            const [startLineNumber, endLineNumber] = intersection;
            const decorationColor = minimapOptions.getColor(this._theme.value);
            if (!decorationColor || decorationColor.isTransparent()) {
                continue;
            }
            let highlightColor = highlightColors.get(decorationColor.toString());
            if (!highlightColor) {
                highlightColor = decorationColor.transparent(0.5).toString();
                highlightColors.set(decorationColor.toString(), highlightColor);
            }
            canvasContext.fillStyle = highlightColor;
            for (let line = startLineNumber; line <= endLineNumber; line++) {
                if (highlightedLines.has(line)) {
                    continue;
                }
                highlightedLines.set(line, true);
                const y = layout.getYForLineNumber(line, minimapLineHeight);
                canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y, canvasContext.canvas.width, minimapLineHeight);
            }
        }
    }
    _renderSelectionsHighlights(canvasContext, selections, lineOffsetMap, layout, lineHeight, tabSize, characterWidth, canvasInnerWidth) {
        if (!this._selectionColor || this._selectionColor.isTransparent()) {
            return;
        }
        for (const selection of selections) {
            const intersection = layout.intersectWithViewport(selection);
            if (!intersection) {
                // entirely outside minimap's viewport
                continue;
            }
            const [startLineNumber, endLineNumber] = intersection;
            for (let line = startLineNumber; line <= endLineNumber; line++) {
                this.renderDecorationOnLine(canvasContext, lineOffsetMap, selection, this._selectionColor, layout, line, lineHeight, lineHeight, tabSize, characterWidth, canvasInnerWidth);
            }
        }
    }
    _renderDecorationsHighlights(canvasContext, decorations, lineOffsetMap, layout, minimapLineHeight, tabSize, characterWidth, canvasInnerWidth) {
        // Loop forwards to hit first decorations with lower `zIndex`
        for (const decoration of decorations) {
            const minimapOptions = decoration.options.minimap;
            if (!minimapOptions) {
                continue;
            }
            const intersection = layout.intersectWithViewport(decoration.range);
            if (!intersection) {
                // entirely outside minimap's viewport
                continue;
            }
            const [startLineNumber, endLineNumber] = intersection;
            const decorationColor = minimapOptions.getColor(this._theme.value);
            if (!decorationColor || decorationColor.isTransparent()) {
                continue;
            }
            for (let line = startLineNumber; line <= endLineNumber; line++) {
                switch (minimapOptions.position) {
                    case 1 /* MinimapPosition.Inline */:
                        this.renderDecorationOnLine(canvasContext, lineOffsetMap, decoration.range, decorationColor, layout, line, minimapLineHeight, minimapLineHeight, tabSize, characterWidth, canvasInnerWidth);
                        continue;
                    case 2 /* MinimapPosition.Gutter */: {
                        const y = layout.getYForLineNumber(line, minimapLineHeight);
                        const x = 2;
                        this.renderDecoration(canvasContext, decorationColor, x, y, GUTTER_DECORATION_WIDTH, minimapLineHeight);
                        continue;
                    }
                }
            }
        }
    }
    renderDecorationOnLine(canvasContext, lineOffsetMap, decorationRange, decorationColor, layout, lineNumber, height, minimapLineHeight, tabSize, charWidth, canvasInnerWidth) {
        const y = layout.getYForLineNumber(lineNumber, minimapLineHeight);
        // Skip rendering the line if it's vertically outside our viewport
        if (y + height < 0 || y > this._model.options.canvasInnerHeight) {
            return;
        }
        const { startLineNumber, endLineNumber } = decorationRange;
        const startColumn = (startLineNumber === lineNumber ? decorationRange.startColumn : 1);
        const endColumn = (endLineNumber === lineNumber ? decorationRange.endColumn : this._model.getLineMaxColumn(lineNumber));
        const x1 = this.getXOffsetForPosition(lineOffsetMap, lineNumber, startColumn, tabSize, charWidth, canvasInnerWidth);
        const x2 = this.getXOffsetForPosition(lineOffsetMap, lineNumber, endColumn, tabSize, charWidth, canvasInnerWidth);
        this.renderDecoration(canvasContext, decorationColor, x1, y, x2 - x1, height);
    }
    getXOffsetForPosition(lineOffsetMap, lineNumber, column, tabSize, charWidth, canvasInnerWidth) {
        if (column === 1) {
            return MINIMAP_GUTTER_WIDTH;
        }
        const minimumXOffset = (column - 1) * charWidth;
        if (minimumXOffset >= canvasInnerWidth) {
            // there is no need to look at actual characters,
            // as this column is certainly after the minimap width
            return canvasInnerWidth;
        }
        // Cache line offset data so that it is only read once per line
        let lineIndexToXOffset = lineOffsetMap.get(lineNumber);
        if (!lineIndexToXOffset) {
            const lineData = this._model.getLineContent(lineNumber);
            lineIndexToXOffset = [MINIMAP_GUTTER_WIDTH];
            let prevx = MINIMAP_GUTTER_WIDTH;
            for (let i = 1; i < lineData.length + 1; i++) {
                const charCode = lineData.charCodeAt(i - 1);
                const dx = charCode === 9 /* CharCode.Tab */
                    ? tabSize * charWidth
                    : strings.isFullWidthCharacter(charCode)
                        ? 2 * charWidth
                        : charWidth;
                const x = prevx + dx;
                if (x >= canvasInnerWidth) {
                    // no need to keep on going, as we've hit the canvas width
                    lineIndexToXOffset[i] = canvasInnerWidth;
                    break;
                }
                lineIndexToXOffset[i] = x;
                prevx = x;
            }
            lineOffsetMap.set(lineNumber, lineIndexToXOffset);
        }
        if (column - 1 < lineIndexToXOffset.length) {
            return lineIndexToXOffset[column - 1];
        }
        // goes over the canvas width
        return canvasInnerWidth;
    }
    renderDecoration(canvasContext, decorationColor, x, y, width, height) {
        canvasContext.fillStyle = decorationColor && decorationColor.toString() || '';
        canvasContext.fillRect(x, y, width, height);
    }
    _renderSectionHeaders(layout) {
        const minimapLineHeight = this._model.options.minimapLineHeight;
        const sectionHeaderFontSize = this._model.options.sectionHeaderFontSize;
        const sectionHeaderLetterSpacing = this._model.options.sectionHeaderLetterSpacing;
        const backgroundFillHeight = sectionHeaderFontSize * 1.5;
        const { canvasInnerWidth } = this._model.options;
        const backgroundColor = this._model.options.backgroundColor;
        const backgroundFill = `rgb(${backgroundColor.r} ${backgroundColor.g} ${backgroundColor.b} / .7)`;
        const foregroundColor = this._model.options.sectionHeaderFontColor;
        const foregroundFill = `rgb(${foregroundColor.r} ${foregroundColor.g} ${foregroundColor.b})`;
        const separatorStroke = foregroundFill;
        const canvasContext = this._decorationsCanvas.domNode.getContext('2d');
        canvasContext.letterSpacing = sectionHeaderLetterSpacing + 'px';
        canvasContext.font = '500 ' + sectionHeaderFontSize + 'px ' + this._model.options.sectionHeaderFontFamily;
        canvasContext.strokeStyle = separatorStroke;
        canvasContext.lineWidth = 0.4;
        const decorations = this._model.getSectionHeaderDecorationsInViewport(layout.startLineNumber, layout.endLineNumber);
        decorations.sort((a, b) => a.range.startLineNumber - b.range.startLineNumber);
        const fitWidth = InnerMinimap._fitSectionHeader.bind(null, canvasContext, canvasInnerWidth - MINIMAP_GUTTER_WIDTH);
        for (const decoration of decorations) {
            const y = layout.getYForLineNumber(decoration.range.startLineNumber, minimapLineHeight) + sectionHeaderFontSize;
            const backgroundFillY = y - sectionHeaderFontSize;
            const separatorY = backgroundFillY + 2;
            const headerText = this._model.getSectionHeaderText(decoration, fitWidth);
            InnerMinimap._renderSectionLabel(canvasContext, headerText, decoration.options.minimap?.sectionHeaderStyle === 2 /* MinimapSectionHeaderStyle.Underlined */, backgroundFill, foregroundFill, canvasInnerWidth, backgroundFillY, backgroundFillHeight, y, separatorY);
        }
    }
    static _fitSectionHeader(target, maxWidth, headerText) {
        if (!headerText) {
            return headerText;
        }
        const ellipsis = '…';
        const width = target.measureText(headerText).width;
        const ellipsisWidth = target.measureText(ellipsis).width;
        if (width <= maxWidth || width <= ellipsisWidth) {
            return headerText;
        }
        const len = headerText.length;
        const averageCharWidth = width / headerText.length;
        const maxCharCount = Math.floor((maxWidth - ellipsisWidth) / averageCharWidth) - 1;
        // Find a halfway point that isn't after whitespace
        let halfCharCount = Math.ceil(maxCharCount / 2);
        while (halfCharCount > 0 && /\s/.test(headerText[halfCharCount - 1])) {
            --halfCharCount;
        }
        // Split with ellipsis
        return headerText.substring(0, halfCharCount)
            + ellipsis + headerText.substring(len - (maxCharCount - halfCharCount));
    }
    static _renderSectionLabel(target, headerText, hasSeparatorLine, backgroundFill, foregroundFill, minimapWidth, backgroundFillY, backgroundFillHeight, textY, separatorY) {
        if (headerText) {
            target.fillStyle = backgroundFill;
            target.fillRect(0, backgroundFillY, minimapWidth, backgroundFillHeight);
            target.fillStyle = foregroundFill;
            target.fillText(headerText, MINIMAP_GUTTER_WIDTH, textY);
        }
        if (hasSeparatorLine) {
            target.beginPath();
            target.moveTo(0, separatorY);
            target.lineTo(minimapWidth, separatorY);
            target.closePath();
            target.stroke();
        }
    }
    renderLines(layout) {
        const startLineNumber = layout.startLineNumber;
        const endLineNumber = layout.endLineNumber;
        const minimapLineHeight = this._model.options.minimapLineHeight;
        // Check if nothing changed w.r.t. lines from last frame
        if (this._lastRenderData && this._lastRenderData.linesEquals(layout)) {
            const _lastData = this._lastRenderData._get();
            // Nice!! Nothing changed from last frame
            return new RenderData(layout, _lastData.imageData, _lastData.lines);
        }
        // Oh well!! We need to repaint some lines...
        const imageData = this._getBuffer();
        if (!imageData) {
            // 0 width or 0 height canvas, nothing to do
            return null;
        }
        // Render untouched lines by using last rendered data.
        const [_dirtyY1, _dirtyY2, needed] = InnerMinimap._renderUntouchedLines(imageData, layout.topPaddingLineCount, startLineNumber, endLineNumber, minimapLineHeight, this._lastRenderData);
        // Fetch rendering info from view model for rest of lines that need rendering.
        const lineInfo = this._model.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed);
        const tabSize = this._model.getOptions().tabSize;
        const defaultBackground = this._model.options.defaultBackgroundColor;
        const background = this._model.options.backgroundColor;
        const foregroundAlpha = this._model.options.foregroundAlpha;
        const tokensColorTracker = this._model.tokensColorTracker;
        const useLighterFont = tokensColorTracker.backgroundIsLight();
        const renderMinimap = this._model.options.renderMinimap;
        const charRenderer = this._model.options.charRenderer();
        const fontScale = this._model.options.fontScale;
        const minimapCharWidth = this._model.options.minimapCharWidth;
        const baseCharHeight = (renderMinimap === 1 /* RenderMinimap.Text */ ? 2 /* Constants.BASE_CHAR_HEIGHT */ : 2 /* Constants.BASE_CHAR_HEIGHT */ + 1);
        const renderMinimapLineHeight = baseCharHeight * fontScale;
        const innerLinePadding = (minimapLineHeight > renderMinimapLineHeight ? Math.floor((minimapLineHeight - renderMinimapLineHeight) / 2) : 0);
        // Render the rest of lines
        const backgroundA = background.a / 255;
        const renderBackground = new RGBA8(Math.round((background.r - defaultBackground.r) * backgroundA + defaultBackground.r), Math.round((background.g - defaultBackground.g) * backgroundA + defaultBackground.g), Math.round((background.b - defaultBackground.b) * backgroundA + defaultBackground.b), 255);
        let dy = layout.topPaddingLineCount * minimapLineHeight;
        const renderedLines = [];
        for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
            if (needed[lineIndex]) {
                InnerMinimap._renderLine(imageData, renderBackground, background.a, useLighterFont, renderMinimap, minimapCharWidth, tokensColorTracker, foregroundAlpha, charRenderer, dy, innerLinePadding, tabSize, lineInfo[lineIndex], fontScale, minimapLineHeight);
            }
            renderedLines[lineIndex] = new MinimapLine(dy);
            dy += minimapLineHeight;
        }
        const dirtyY1 = (_dirtyY1 === -1 ? 0 : _dirtyY1);
        const dirtyY2 = (_dirtyY2 === -1 ? imageData.height : _dirtyY2);
        const dirtyHeight = dirtyY2 - dirtyY1;
        // Finally, paint to the canvas
        const ctx = this._canvas.domNode.getContext('2d');
        ctx.putImageData(imageData, 0, 0, 0, dirtyY1, imageData.width, dirtyHeight);
        // Save rendered data for reuse on next frame if possible
        return new RenderData(layout, imageData, renderedLines);
    }
    static _renderUntouchedLines(target, topPaddingLineCount, startLineNumber, endLineNumber, minimapLineHeight, lastRenderData) {
        const needed = [];
        if (!lastRenderData) {
            for (let i = 0, len = endLineNumber - startLineNumber + 1; i < len; i++) {
                needed[i] = true;
            }
            return [-1, -1, needed];
        }
        const _lastData = lastRenderData._get();
        const lastTargetData = _lastData.imageData.data;
        const lastStartLineNumber = _lastData.rendLineNumberStart;
        const lastLines = _lastData.lines;
        const lastLinesLength = lastLines.length;
        const WIDTH = target.width;
        const targetData = target.data;
        const maxDestPixel = (endLineNumber - startLineNumber + 1) * minimapLineHeight * WIDTH * 4;
        let dirtyPixel1 = -1; // the pixel offset up to which all the data is equal to the prev frame
        let dirtyPixel2 = -1; // the pixel offset after which all the data is equal to the prev frame
        let copySourceStart = -1;
        let copySourceEnd = -1;
        let copyDestStart = -1;
        let copyDestEnd = -1;
        let dest_dy = topPaddingLineCount * minimapLineHeight;
        for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
            const lineIndex = lineNumber - startLineNumber;
            const lastLineIndex = lineNumber - lastStartLineNumber;
            const source_dy = (lastLineIndex >= 0 && lastLineIndex < lastLinesLength ? lastLines[lastLineIndex].dy : -1);
            if (source_dy === -1) {
                needed[lineIndex] = true;
                dest_dy += minimapLineHeight;
                continue;
            }
            const sourceStart = source_dy * WIDTH * 4;
            const sourceEnd = (source_dy + minimapLineHeight) * WIDTH * 4;
            const destStart = dest_dy * WIDTH * 4;
            const destEnd = (dest_dy + minimapLineHeight) * WIDTH * 4;
            if (copySourceEnd === sourceStart && copyDestEnd === destStart) {
                // contiguous zone => extend copy request
                copySourceEnd = sourceEnd;
                copyDestEnd = destEnd;
            }
            else {
                if (copySourceStart !== -1) {
                    // flush existing copy request
                    targetData.set(lastTargetData.subarray(copySourceStart, copySourceEnd), copyDestStart);
                    if (dirtyPixel1 === -1 && copySourceStart === 0 && copySourceStart === copyDestStart) {
                        dirtyPixel1 = copySourceEnd;
                    }
                    if (dirtyPixel2 === -1 && copySourceEnd === maxDestPixel && copySourceStart === copyDestStart) {
                        dirtyPixel2 = copySourceStart;
                    }
                }
                copySourceStart = sourceStart;
                copySourceEnd = sourceEnd;
                copyDestStart = destStart;
                copyDestEnd = destEnd;
            }
            needed[lineIndex] = false;
            dest_dy += minimapLineHeight;
        }
        if (copySourceStart !== -1) {
            // flush existing copy request
            targetData.set(lastTargetData.subarray(copySourceStart, copySourceEnd), copyDestStart);
            if (dirtyPixel1 === -1 && copySourceStart === 0 && copySourceStart === copyDestStart) {
                dirtyPixel1 = copySourceEnd;
            }
            if (dirtyPixel2 === -1 && copySourceEnd === maxDestPixel && copySourceStart === copyDestStart) {
                dirtyPixel2 = copySourceStart;
            }
        }
        const dirtyY1 = (dirtyPixel1 === -1 ? -1 : dirtyPixel1 / (WIDTH * 4));
        const dirtyY2 = (dirtyPixel2 === -1 ? -1 : dirtyPixel2 / (WIDTH * 4));
        return [dirtyY1, dirtyY2, needed];
    }
    static _renderLine(target, backgroundColor, backgroundAlpha, useLighterFont, renderMinimap, charWidth, colorTracker, foregroundAlpha, minimapCharRenderer, dy, innerLinePadding, tabSize, lineData, fontScale, minimapLineHeight) {
        const content = lineData.content;
        const tokens = lineData.tokens;
        const maxDx = target.width - charWidth;
        const force1pxHeight = (minimapLineHeight === 1);
        let dx = MINIMAP_GUTTER_WIDTH;
        let charIndex = 0;
        let tabsCharDelta = 0;
        for (let tokenIndex = 0, tokensLen = tokens.getCount(); tokenIndex < tokensLen; tokenIndex++) {
            const tokenEndIndex = tokens.getEndOffset(tokenIndex);
            const tokenColorId = tokens.getForeground(tokenIndex);
            const tokenColor = colorTracker.getColor(tokenColorId);
            for (; charIndex < tokenEndIndex; charIndex++) {
                if (dx > maxDx) {
                    // hit edge of minimap
                    return;
                }
                const charCode = content.charCodeAt(charIndex);
                if (charCode === 9 /* CharCode.Tab */) {
                    const insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
                    tabsCharDelta += insertSpacesCount - 1;
                    // No need to render anything since tab is invisible
                    dx += insertSpacesCount * charWidth;
                }
                else if (charCode === 32 /* CharCode.Space */) {
                    // No need to render anything since space is invisible
                    dx += charWidth;
                }
                else {
                    // Render twice for a full width character
                    const count = strings.isFullWidthCharacter(charCode) ? 2 : 1;
                    for (let i = 0; i < count; i++) {
                        if (renderMinimap === 2 /* RenderMinimap.Blocks */) {
                            minimapCharRenderer.blockRenderChar(target, dx, dy + innerLinePadding, tokenColor, foregroundAlpha, backgroundColor, backgroundAlpha, force1pxHeight);
                        }
                        else { // RenderMinimap.Text
                            minimapCharRenderer.renderChar(target, dx, dy + innerLinePadding, charCode, tokenColor, foregroundAlpha, backgroundColor, backgroundAlpha, fontScale, useLighterFont, force1pxHeight);
                        }
                        dx += charWidth;
                        if (dx > maxDx) {
                            // hit edge of minimap
                            return;
                        }
                    }
                }
            }
        }
    }
}
class ContiguousLineMap {
    constructor(startLineNumber, endLineNumber, defaultValue) {
        this._startLineNumber = startLineNumber;
        this._endLineNumber = endLineNumber;
        this._defaultValue = defaultValue;
        this._values = [];
        for (let i = 0, count = this._endLineNumber - this._startLineNumber + 1; i < count; i++) {
            this._values[i] = defaultValue;
        }
    }
    has(lineNumber) {
        return (this.get(lineNumber) !== this._defaultValue);
    }
    set(lineNumber, value) {
        if (lineNumber < this._startLineNumber || lineNumber > this._endLineNumber) {
            return;
        }
        this._values[lineNumber - this._startLineNumber] = value;
    }
    get(lineNumber) {
        if (lineNumber < this._startLineNumber || lineNumber > this._endLineNumber) {
            return this._defaultValue;
        }
        return this._values[lineNumber - this._startLineNumber];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWluaW1hcC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9taW5pbWFwL21pbmltYXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxlQUFlLENBQUM7QUFDdkIsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUVoRyxPQUFPLEVBQWUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxLQUFLLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEtBQUssT0FBTyxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBUyx1QkFBdUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3pFLE9BQU8sRUFBbUIsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDckYsT0FBTyxFQUErQixvQkFBb0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RJLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFNMUQsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFNbkcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLHdCQUF3QixFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFckosT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTlELE9BQU8sRUFBZ0IsU0FBUyxFQUFFLE9BQU8s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