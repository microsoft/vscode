/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./minimap';
import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger } from 'vs/base/browser/globalMouseMoveMonitor';
import { CharCode } from 'vs/base/common/charCode';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { ILine, RenderedLinesCollection } from 'vs/editor/browser/view/viewLayer';
import { PartFingerprint, PartFingerprints, ViewPart } from 'vs/editor/browser/view/viewPart';
import { RenderMinimap, EditorOption, MINIMAP_GUTTER_WIDTH } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { RGBA8 } from 'vs/editor/common/core/rgba';
import { IConfiguration, ScrollType } from 'vs/editor/common/editorCommon';
import { ColorId } from 'vs/editor/common/modes';
import { MinimapCharRenderer } from 'vs/editor/browser/viewParts/minimap/minimapCharRenderer';
import { Constants } from 'vs/editor/browser/viewParts/minimap/minimapCharSheet';
import { MinimapTokensColorTracker } from 'vs/editor/common/viewModel/minimapTokensColorTracker';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { ViewContext, EditorTheme } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { ViewLineData, ViewModelDecoration } from 'vs/editor/common/viewModel/viewModel';
import { minimapSelection, scrollbarShadow, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, minimapBackground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ModelDecorationMinimapOptions } from 'vs/editor/common/model/textModel';
import { Selection } from 'vs/editor/common/core/selection';
import { Color } from 'vs/base/common/color';
import { GestureEvent, EventType, Gesture } from 'vs/base/browser/touch';
import { MinimapCharRendererFactory } from 'vs/editor/browser/viewParts/minimap/minimapCharRendererFactory';
import { MinimapPosition, TextModelResolvedOptions } from 'vs/editor/common/model';
import { once } from 'vs/base/common/functional';

/**
 * The orthogonal distance to the slider at which dragging "resets". This implements "snapping"
 */
const MOUSE_DRAG_RESET_DISTANCE = 140;

const GUTTER_DECORATION_WIDTH = 2;

class MinimapOptions {

	public readonly isSampling: boolean;

	public readonly renderMinimap: RenderMinimap;

	public readonly scrollBeyondLastLine: boolean;

	public readonly showSlider: 'always' | 'mouseover';

	public readonly pixelRatio: number;

	public readonly typicalHalfwidthCharacterWidth: number;

	public readonly lineHeight: number;

	public readonly fontScale: number;

	public readonly charRenderer: () => MinimapCharRenderer;

	/**
	 * container dom node left position (in CSS px)
	 */
	public readonly minimapLeft: number;
	/**
	 * container dom node width (in CSS px)
	 */
	public readonly minimapWidth: number;
	/**
	 * container dom node height (in CSS px)
	 */
	public readonly minimapHeight: number;

	/**
	 * canvas backing store width (in device px)
	 */
	public readonly canvasInnerWidth: number;
	/**
	 * canvas backing store height (in device px)
	 */
	public readonly canvasInnerHeight: number;

	/**
	 * canvas width (in CSS px)
	 */
	public readonly canvasOuterWidth: number;
	/**
	 * canvas height (in CSS px)
	 */
	public readonly canvasOuterHeight: number;

	public readonly backgroundColor: RGBA8;

	public readonly minimapLineHeight: number;
	public readonly minimapCharWidth: number;

	constructor(configuration: IConfiguration, theme: EditorTheme, tokensColorTracker: MinimapTokensColorTracker, isSampling: boolean) {
		const options = configuration.options;
		const pixelRatio = options.get(EditorOption.pixelRatio);
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const fontInfo = options.get(EditorOption.fontInfo);

		this.isSampling = isSampling;
		this.renderMinimap = layoutInfo.renderMinimap | 0;
		this.scrollBeyondLastLine = options.get(EditorOption.scrollBeyondLastLine);
		const minimapOpts = options.get(EditorOption.minimap);
		this.showSlider = minimapOpts.showSlider;
		this.fontScale = (isSampling ? 1 : Math.round(minimapOpts.scale * pixelRatio));
		this.charRenderer = once(() => MinimapCharRendererFactory.create(this.fontScale, fontInfo.fontFamily));
		this.pixelRatio = pixelRatio;
		this.typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
		this.lineHeight = options.get(EditorOption.lineHeight);
		this.minimapLeft = layoutInfo.minimapLeft;
		this.minimapWidth = layoutInfo.minimapWidth;
		this.minimapHeight = layoutInfo.height;

		this.canvasInnerWidth = Math.floor(pixelRatio * this.minimapWidth);
		this.canvasInnerHeight = Math.floor(pixelRatio * this.minimapHeight);

		this.canvasOuterWidth = this.canvasInnerWidth / pixelRatio;
		this.canvasOuterHeight = this.canvasInnerHeight / pixelRatio;

		this.backgroundColor = MinimapOptions._getMinimapBackground(theme, tokensColorTracker);

		const baseCharHeight = (isSampling ? 1 : this.renderMinimap === RenderMinimap.Text ? Constants.BASE_CHAR_HEIGHT : Constants.BASE_CHAR_HEIGHT + 1);
		this.minimapLineHeight = baseCharHeight * this.fontScale;
		this.minimapCharWidth = Constants.BASE_CHAR_WIDTH * this.fontScale;
	}

	private static _getMinimapBackground(theme: EditorTheme, tokensColorTracker: MinimapTokensColorTracker): RGBA8 {
		const themeColor = theme.getColor(minimapBackground);
		if (themeColor) {
			return new RGBA8(themeColor.rgba.r, themeColor.rgba.g, themeColor.rgba.b, themeColor.rgba.a);
		}
		return tokensColorTracker.getColor(ColorId.DefaultBackground);
	}

	public equals(other: MinimapOptions): boolean {
		return (this.isSampling === other.isSampling
			&& this.renderMinimap === other.renderMinimap
			&& this.scrollBeyondLastLine === other.scrollBeyondLastLine
			&& this.showSlider === other.showSlider
			&& this.pixelRatio === other.pixelRatio
			&& this.typicalHalfwidthCharacterWidth === other.typicalHalfwidthCharacterWidth
			&& this.lineHeight === other.lineHeight
			&& this.fontScale === other.fontScale
			&& this.minimapLeft === other.minimapLeft
			&& this.minimapWidth === other.minimapWidth
			&& this.minimapHeight === other.minimapHeight
			&& this.canvasInnerWidth === other.canvasInnerWidth
			&& this.canvasInnerHeight === other.canvasInnerHeight
			&& this.canvasOuterWidth === other.canvasOuterWidth
			&& this.canvasOuterHeight === other.canvasOuterHeight
			&& this.backgroundColor.equals(other.backgroundColor)
		);
	}
}

class MinimapLayout {

	/**
	 * The given editor scrollTop (input).
	 */
	public readonly scrollTop: number;

	/**
	* The given editor scrollHeight (input).
	*/
	public readonly scrollHeight: number;

	private readonly _computedSliderRatio: number;

	/**
	 * slider dom node top (in CSS px)
	 */
	public readonly sliderTop: number;
	/**
	 * slider dom node height (in CSS px)
	 */
	public readonly sliderHeight: number;

	/**
	 * minimap render start line number.
	 */
	public readonly startLineNumber: number;
	/**
	 * minimap render end line number.
	 */
	public readonly endLineNumber: number;

	constructor(
		scrollTop: number,
		scrollHeight: number,
		computedSliderRatio: number,
		sliderTop: number,
		sliderHeight: number,
		startLineNumber: number,
		endLineNumber: number
	) {
		this.scrollTop = scrollTop;
		this.scrollHeight = scrollHeight;
		this._computedSliderRatio = computedSliderRatio;
		this.sliderTop = sliderTop;
		this.sliderHeight = sliderHeight;
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
	}

	/**
	 * Compute a desired `scrollPosition` such that the slider moves by `delta`.
	 */
	public getDesiredScrollTopFromDelta(delta: number): number {
		const desiredSliderPosition = this.sliderTop + delta;
		return Math.round(desiredSliderPosition / this._computedSliderRatio);
	}

	public getDesiredScrollTopFromTouchLocation(pageY: number): number {
		return Math.round((pageY - this.sliderHeight / 2) / this._computedSliderRatio);
	}

	public static create(
		options: MinimapOptions,
		samplingRatio: number,
		viewportStartLineNumber: number,
		viewportEndLineNumber: number,
		viewportHeight: number,
		viewportContainsWhitespaceGaps: boolean,
		lineCount: number,
		scrollTop: number,
		scrollHeight: number,
		previousLayout: MinimapLayout | null
	): MinimapLayout {
		const pixelRatio = options.pixelRatio;
		const minimapLineHeight = options.minimapLineHeight;
		const minimapLinesFitting = Math.floor(options.canvasInnerHeight / minimapLineHeight);
		const lineHeight = options.lineHeight;

		if (options.isSampling) {
			const expectedViewportLineCount = viewportHeight / lineHeight;
			const sliderHeight = Math.max(1, Math.floor(expectedViewportLineCount * minimapLineHeight / pixelRatio / samplingRatio));
			const maxMinimapSliderTop = Math.max(0, options.minimapHeight - sliderHeight);
			// The slider can move from 0 to `maxMinimapSliderTop`
			// in the same way `scrollTop` can move from 0 to `scrollHeight` - `viewportHeight`.
			const computedSliderRatio = (maxMinimapSliderTop) / (scrollHeight - viewportHeight);
			const sliderTop = (scrollTop * computedSliderRatio);
			return new MinimapLayout(scrollTop, scrollHeight, computedSliderRatio, sliderTop, sliderHeight, 1, lineCount);
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
		let sliderHeight: number;
		if (viewportContainsWhitespaceGaps && viewportEndLineNumber !== lineCount) {
			// case b) from above: there are whitespace gaps in the viewport.
			// In this case, the height of the slider directly reflects the visible line count.
			const viewportLineCount = viewportEndLineNumber - viewportStartLineNumber + 1;
			sliderHeight = Math.floor(viewportLineCount * minimapLineHeight / pixelRatio);
		} else {
			// The slider has a stable height
			const expectedViewportLineCount = viewportHeight / lineHeight;
			sliderHeight = Math.floor(expectedViewportLineCount * minimapLineHeight / pixelRatio);
		}

		let maxMinimapSliderTop: number;
		if (options.scrollBeyondLastLine) {
			// The minimap slider, when dragged all the way down, will contain the last line at its top
			maxMinimapSliderTop = (lineCount - 1) * minimapLineHeight / pixelRatio;
		} else {
			// The minimap slider, when dragged all the way down, will contain the last line at its bottom
			maxMinimapSliderTop = Math.max(0, lineCount * minimapLineHeight / pixelRatio - sliderHeight);
		}
		maxMinimapSliderTop = Math.min(options.minimapHeight - sliderHeight, maxMinimapSliderTop);

		// The slider can move from 0 to `maxMinimapSliderTop`
		// in the same way `scrollTop` can move from 0 to `scrollHeight` - `viewportHeight`.
		const computedSliderRatio = (maxMinimapSliderTop) / (scrollHeight - viewportHeight);
		const sliderTop = (scrollTop * computedSliderRatio);

		let extraLinesAtTheBottom = 0;
		if (options.scrollBeyondLastLine) {
			const expectedViewportLineCount = viewportHeight / lineHeight;
			extraLinesAtTheBottom = expectedViewportLineCount;
		}
		if (minimapLinesFitting >= lineCount + extraLinesAtTheBottom) {
			// All lines fit in the minimap
			const startLineNumber = 1;
			const endLineNumber = lineCount;

			return new MinimapLayout(scrollTop, scrollHeight, computedSliderRatio, sliderTop, sliderHeight, startLineNumber, endLineNumber);
		} else {
			let startLineNumber = Math.max(1, Math.floor(viewportStartLineNumber - sliderTop * pixelRatio / minimapLineHeight));

			// Avoid flickering caused by a partial viewport start line
			// by being consistent w.r.t. the previous layout decision
			if (previousLayout && previousLayout.scrollHeight === scrollHeight) {
				if (previousLayout.scrollTop > scrollTop) {
					// Scrolling up => never increase `startLineNumber`
					startLineNumber = Math.min(startLineNumber, previousLayout.startLineNumber);
				}
				if (previousLayout.scrollTop < scrollTop) {
					// Scrolling down => never decrease `startLineNumber`
					startLineNumber = Math.max(startLineNumber, previousLayout.startLineNumber);
				}
			}

			const endLineNumber = Math.min(lineCount, startLineNumber + minimapLinesFitting - 1);

			return new MinimapLayout(scrollTop, scrollHeight, computedSliderRatio, sliderTop, sliderHeight, startLineNumber, endLineNumber);
		}
	}
}

class MinimapLine implements ILine {

	public static readonly INVALID = new MinimapLine(-1);

	dy: number;

	constructor(dy: number) {
		this.dy = dy;
	}

	public onContentChanged(): void {
		this.dy = -1;
	}

	public onTokensChanged(): void {
		this.dy = -1;
	}
}

class RenderData {
	/**
	 * last rendered layout.
	 */
	public readonly renderedLayout: MinimapLayout;
	private readonly _imageData: ImageData;
	private readonly _renderedLines: RenderedLinesCollection<MinimapLine>;

	constructor(
		renderedLayout: MinimapLayout,
		imageData: ImageData,
		lines: MinimapLine[]
	) {
		this.renderedLayout = renderedLayout;
		this._imageData = imageData;
		this._renderedLines = new RenderedLinesCollection(
			() => MinimapLine.INVALID
		);
		this._renderedLines._set(renderedLayout.startLineNumber, lines);
	}

	/**
	 * Check if the current RenderData matches accurately the new desired layout and no painting is needed.
	 */
	public linesEquals(layout: MinimapLayout): boolean {
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
	public scrollEquals(layout: MinimapLayout): boolean {
		return this.renderedLayout.startLineNumber === layout.startLineNumber
			&& this.renderedLayout.endLineNumber === layout.endLineNumber;
	}

	_get(): { imageData: ImageData; rendLineNumberStart: number; lines: MinimapLine[]; } {
		const tmp = this._renderedLines._get();
		return {
			imageData: this._imageData,
			rendLineNumberStart: tmp.rendLineNumberStart,
			lines: tmp.lines
		};
	}

	public onLinesChanged(changeFromLineNumber: number, changeToLineNumber: number): boolean {
		return this._renderedLines.onLinesChanged(changeFromLineNumber, changeToLineNumber);
	}
	public onLinesDeleted(deleteFromLineNumber: number, deleteToLineNumber: number): void {
		this._renderedLines.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
	}
	public onLinesInserted(insertFromLineNumber: number, insertToLineNumber: number): void {
		this._renderedLines.onLinesInserted(insertFromLineNumber, insertToLineNumber);
	}
	public onTokensChanged(ranges: { fromLineNumber: number; toLineNumber: number; }[]): boolean {
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

	private readonly _backgroundFillData: Uint8ClampedArray;
	private readonly _buffers: [ImageData, ImageData];
	private _lastUsedBuffer: number;

	constructor(ctx: CanvasRenderingContext2D, WIDTH: number, HEIGHT: number, background: RGBA8) {
		this._backgroundFillData = MinimapBuffers._createBackgroundFillData(WIDTH, HEIGHT, background);
		this._buffers = [
			ctx.createImageData(WIDTH, HEIGHT),
			ctx.createImageData(WIDTH, HEIGHT)
		];
		this._lastUsedBuffer = 0;
	}

	public getBuffer(): ImageData {
		// rotate buffers
		this._lastUsedBuffer = 1 - this._lastUsedBuffer;
		const result = this._buffers[this._lastUsedBuffer];

		// fill with background color
		result.data.set(this._backgroundFillData);

		return result;
	}

	private static _createBackgroundFillData(WIDTH: number, HEIGHT: number, background: RGBA8): Uint8ClampedArray {
		const backgroundR = background.r;
		const backgroundG = background.g;
		const backgroundB = background.b;

		const result = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
		let offset = 0;
		for (let i = 0; i < HEIGHT; i++) {
			for (let j = 0; j < WIDTH; j++) {
				result[offset] = backgroundR;
				result[offset + 1] = backgroundG;
				result[offset + 2] = backgroundB;
				result[offset + 3] = 255;
				offset += 4;
			}
		}

		return result;
	}
}

export interface IMinimapModel {
	readonly tokensColorTracker: MinimapTokensColorTracker;
	readonly options: MinimapOptions;

	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): (ViewLineData | null)[];
	getSelections(): Selection[];
	getMinimapDecorationsInViewport(startLineNumber: number, endLineNumber: number): ViewModelDecoration[];
	getOptions(): TextModelResolvedOptions;
	revealLineNumber(lineNumber: number): void;
	setScrollTop(scrollTop: number): void;
}

export interface IMinimapRenderingContext {
	readonly samplingRatio: number;
	readonly viewportContainsWhitespaceGaps: boolean;

	readonly scrollWidth: number;
	readonly scrollHeight: number;

	readonly viewportStartLineNumber: number;
	readonly viewportEndLineNumber: number;

	readonly scrollTop: number;
	readonly scrollLeft: number;

	readonly viewportWidth: number;
	readonly viewportHeight: number;
}

export class Minimap extends ViewPart implements IMinimapModel {

	private _selections: Selection[];
	private _minimapSelections: Selection[];

	private _samplingRatio: number;
	private _minimapLines: number[];
	private _isSampling = false;
	private _shouldCheckSampling: boolean;

	public readonly tokensColorTracker: MinimapTokensColorTracker;
	public options: MinimapOptions;

	private _actual: InnerMinimap;

	constructor(context: ViewContext) {
		super(context);

		this._selections = [];
		this._minimapSelections = [];

		this._samplingRatio = 1;
		this._minimapLines = [];
		this._shouldCheckSampling = false;
		this._recreateLineSampling(null);

		this.tokensColorTracker = MinimapTokensColorTracker.getInstance();
		this.options = new MinimapOptions(this._context.configuration, this._context.theme, this.tokensColorTracker, this._isSampling);

		this._actual = new InnerMinimap(context.theme, this);
	}

	public dispose(): void {
		this._actual.dispose();
		super.dispose();
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._actual.getDomNode();
	}

	private _onOptionsMaybeChanged(): boolean {
		const opts = new MinimapOptions(this._context.configuration, this._context.theme, this.tokensColorTracker, this._isSampling);
		if (this.options.equals(opts)) {
			return false;
		}
		this.options = opts;
		this._actual.onDidChangeOptions();
		return true;
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		return this._onOptionsMaybeChanged();
	}
	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selections = e.selections;
		this._recomputeMinimapSelections();
		return this._actual.onSelectionChanged();
	}
	public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return this._actual.onDecorationsChanged();
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return this._actual.onFlushed();
	}
	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		if (this._isSampling) {
			const minimapLineRange = this._modelLineRangeToMinimapLineRange(e.fromLineNumber, e.toLineNumber);
			if (minimapLineRange) {
				return this._actual.onLinesChanged(minimapLineRange[0], minimapLineRange[1]);
			} else {
				return false;
			}
		} else {
			return this._actual.onLinesChanged(e.fromLineNumber, e.toLineNumber);
		}
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		if (this._isSampling) {
			// have the mapping be sticky
			const deletedLineCount = e.toLineNumber - e.fromLineNumber + 1;
			let changeStartIndex = this._minimapLines.length;
			let changeEndIndex = 0;
			for (let i = this._minimapLines.length - 1; i >= 0; i--) {
				if (this._minimapLines[i] < e.fromLineNumber) {
					break;
				}
				if (this._minimapLines[i] <= e.toLineNumber) {
					// this line got deleted => move to previous available
					this._minimapLines[i] = Math.max(1, e.fromLineNumber - 1);
					changeStartIndex = Math.min(changeStartIndex, i);
					changeEndIndex = Math.max(changeEndIndex, i);
				} else {
					this._minimapLines[i] -= deletedLineCount;
				}
			}
			if (changeStartIndex <= changeEndIndex) {
				this._actual.onLinesChanged(changeStartIndex + 1, changeEndIndex + 1);
			}
			this._shouldCheckSampling = true;
			return true;
		} else {
			return this._actual.onLinesDeleted(e.fromLineNumber, e.toLineNumber);
		}
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		if (this._isSampling) {
			// have the mapping be sticky
			const insertedLineCount = e.toLineNumber - e.fromLineNumber + 1;
			for (let i = this._minimapLines.length - 1; i >= 0; i--) {
				if (this._minimapLines[i] < e.fromLineNumber) {
					break;
				}
				this._minimapLines[i] += insertedLineCount;
			}
			this._shouldCheckSampling = true;
			return true;
		} else {
			return this._actual.onLinesInserted(e.fromLineNumber, e.toLineNumber);
		}
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return this._actual.onScrollChanged();
	}
	public onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		this._context.model.invalidateMinimapColorCache();
		this._actual.onThemeChanged();
		this._onOptionsMaybeChanged();
		return true;
	}
	public onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		if (this._isSampling) {
			let ranges: { fromLineNumber: number; toLineNumber: number; }[] = [];
			for (const range of e.ranges) {
				const minimapLineRange = this._modelLineRangeToMinimapLineRange(range.fromLineNumber, range.toLineNumber);
				if (minimapLineRange) {
					ranges.push({ fromLineNumber: minimapLineRange[0], toLineNumber: minimapLineRange[1] });
				}
			}
			if (ranges.length) {
				return this._actual.onTokensChanged(ranges);
			} else {
				return false;
			}
		} else {
			return this._actual.onTokensChanged(e.ranges);
		}
	}
	public onTokensColorsChanged(e: viewEvents.ViewTokensColorsChangedEvent): boolean {
		return this._actual.onTokensColorsChanged();
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return this._actual.onZonesChanged();
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (this._shouldCheckSampling) {
			this._shouldCheckSampling = false;
			this._recreateLineSampling(this._minimapLines);
		}
	}

	public render(ctx: RestrictedRenderingContext): void {
		let viewportStartLineNumber = ctx.visibleRange.startLineNumber;
		let viewportEndLineNumber = ctx.visibleRange.endLineNumber;

		if (this._isSampling) {
			viewportStartLineNumber = this._modelLineToMinimapLine(viewportStartLineNumber);
			viewportEndLineNumber = this._modelLineToMinimapLine(viewportEndLineNumber);
		}

		const minimapCtx: IMinimapRenderingContext = {
			samplingRatio: this._samplingRatio,
			viewportContainsWhitespaceGaps: (ctx.viewportData.whitespaceViewportData.length > 0),

			scrollWidth: ctx.scrollWidth,
			scrollHeight: ctx.scrollHeight,

			viewportStartLineNumber: viewportStartLineNumber,
			viewportEndLineNumber: viewportEndLineNumber,

			scrollTop: ctx.scrollTop,
			scrollLeft: ctx.scrollLeft,

			viewportWidth: ctx.viewportWidth,
			viewportHeight: ctx.viewportHeight,
		};
		this._actual.render(minimapCtx);
	}

	//#region IMinimapModel

	private _createLineSampling(minimapLineCount: number, modelLineCount: number, ratio: number): number[] {
		let result: number[] = [];
		result[0] = 1;
		if (minimapLineCount > 1) {
			const halfRatio = ratio / 2;
			for (let i = 0, lastIndex = minimapLineCount - 1; i < lastIndex; i++) {
				result[i] = Math.round(i * ratio + halfRatio);
			}
			result[minimapLineCount - 1] = modelLineCount;
		}
		return result;
	}

	private _recreateLineSampling(oldMinimapLines: number[] | null): void {
		// generate at most 10 events, if there are more than 10 changes, just flush all previous data
		const MAX_EVENT_COUNT = 10;

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const pixelRatio = options.get(EditorOption.pixelRatio);
		const lineHeight = options.get(EditorOption.lineHeight);
		const scrollBeyondLastLine = options.get(EditorOption.scrollBeyondLastLine);
		const modelLineCount = this._context.model.getLineCount();

		const extraLinesBeyondLastLine = scrollBeyondLastLine ? (layoutInfo.height / lineHeight - 1) : 0;
		const desiredRatio = (modelLineCount + extraLinesBeyondLastLine) / (pixelRatio * layoutInfo.height);
		const minimapLineCount = Math.floor(modelLineCount / desiredRatio);
		const ratio = modelLineCount / minimapLineCount;

		if (!oldMinimapLines) {
			this._minimapLines = this._createLineSampling(minimapLineCount, modelLineCount, ratio);
			this._samplingRatio = ratio;
			return;
		}

		const halfRatio = ratio / 2;
		const oldLength = oldMinimapLines.length;
		let result: number[] = [];
		let oldIndex = 0;
		let oldDeltaLineCount = 0;
		let minModelLineNumber = 1;
		let eventCount = 0;
		let currentDeleteStart = 0, currentDeleteEnd = 0;
		let currentInsertStart = 0, currentInsertEnd = 0;
		for (let i = 0; i < minimapLineCount; i++) {
			const fromModelLineNumber = Math.max(minModelLineNumber, Math.round(i * ratio));
			const toModelLineNumber = Math.max(fromModelLineNumber, Math.round((i + 1) * ratio));

			while (oldIndex < oldLength && oldMinimapLines[oldIndex] < fromModelLineNumber) {
				if (eventCount < MAX_EVENT_COUNT) {
					if (currentInsertEnd !== 0) {
						// must deliver previous insert event
						this._actual.onLinesInserted(currentInsertStart, currentInsertEnd);
						oldDeltaLineCount += (currentInsertEnd - currentInsertStart + 1);
						currentInsertStart = 0;
						currentInsertEnd = 0;
						eventCount++;
					}

					if (currentDeleteStart === 0) {
						currentDeleteStart = oldIndex + 1 + oldDeltaLineCount;
						currentDeleteEnd = currentDeleteStart;
					} else {
						currentDeleteEnd++;
					}
				}
				oldIndex++;
			}

			let selectedModelLineNumber: number;
			if (oldIndex < oldLength && oldMinimapLines[oldIndex] <= toModelLineNumber) {
				// reuse the old sampled line
				selectedModelLineNumber = oldMinimapLines[oldIndex];
				oldIndex++;
			} else {
				if (i === 0) {
					selectedModelLineNumber = 1;
				} else if (i + 1 === minimapLineCount) {
					selectedModelLineNumber = modelLineCount;
				} else {
					selectedModelLineNumber = Math.round(i * ratio + halfRatio);
				}
				if (eventCount < MAX_EVENT_COUNT) {
					if (currentDeleteEnd !== 0) {
						// must deliver previous delete event
						this._actual.onLinesDeleted(currentDeleteStart, currentDeleteEnd);
						oldDeltaLineCount -= (currentDeleteEnd - currentDeleteStart + 1);
						currentDeleteStart = 0;
						currentDeleteEnd = 0;
						eventCount++;
					}

					if (currentInsertStart === 0) {
						currentInsertStart = oldIndex + 1 + oldDeltaLineCount;
						currentInsertEnd = currentInsertStart;
					} else {
						currentInsertEnd++;
					}
				}
			}

			result[i] = selectedModelLineNumber;
			if (selectedModelLineNumber === modelLineCount) {
				minModelLineNumber = selectedModelLineNumber;
			} else {
				minModelLineNumber = selectedModelLineNumber + 1;
			}
		}

		if (eventCount < MAX_EVENT_COUNT) {
			if (currentInsertEnd !== 0) {
				// must deliver previous insert event
				this._actual.onLinesInserted(currentInsertStart, currentInsertEnd);
				oldDeltaLineCount += (currentInsertEnd - currentInsertStart + 1);
				currentInsertStart = 0;
				currentInsertEnd = 0;
			}
			while (oldIndex < oldLength) {
				if (currentDeleteStart === 0) {
					currentDeleteStart = oldIndex + 1 + oldDeltaLineCount;
					currentDeleteEnd = currentDeleteStart;
				} else {
					currentDeleteEnd++;
				}
				oldIndex++;
			}
			if (currentDeleteEnd !== 0) {
				// must deliver previous delete event
				this._actual.onLinesDeleted(currentDeleteStart, currentDeleteEnd);
				oldDeltaLineCount -= (currentDeleteEnd - currentDeleteStart + 1);
				currentDeleteStart = 0;
				currentDeleteEnd = 0;
			}
		} else {
			// too many events, just give up
			this._actual.onFlushed();
		}

		this._samplingRatio = ratio;
		this._minimapLines = result;
	}

	private _modelLineToMinimapLine(lineNumber: number): number {
		return Math.min(this._minimapLines.length, Math.max(1, Math.round(lineNumber / this._samplingRatio)));
	}

	/**
	 * Will return null if the model line ranges are not intersecting with a sampled model line.
	 */
	private _modelLineRangeToMinimapLineRange(fromLineNumber: number, toLineNumber: number): [number, number] | null {
		let fromLineIndex = this._modelLineToMinimapLine(fromLineNumber) - 1;
		while (fromLineIndex > 0 && this._minimapLines[fromLineIndex - 1] >= fromLineNumber) {
			fromLineIndex--;
		}
		let toLineIndex = this._modelLineToMinimapLine(toLineNumber) - 1;
		while (toLineIndex + 1 < this._minimapLines.length && this._minimapLines[toLineIndex + 1] <= toLineNumber) {
			toLineIndex++;
		}
		if (fromLineIndex === toLineIndex) {
			const sampledLineNumber = this._minimapLines[fromLineIndex];
			if (sampledLineNumber < fromLineNumber || sampledLineNumber > toLineNumber) {
				// This line is not part of the sampled lines ==> nothing to do
				return null;
			}
		}
		return [fromLineIndex + 1, toLineIndex + 1];
	}

	private _recomputeMinimapSelections(): void {
		this._minimapSelections = [];
		for (const selection of this._selections) {
			if (this._isSampling) {
				const isMultiline = (selection.startLineNumber !== selection.endLineNumber);

				let minimapLineStart = this._modelLineToMinimapLine(selection.startLineNumber);
				let minimapLineEnd = this._modelLineToMinimapLine(selection.endLineNumber);
				if (isMultiline && minimapLineEnd === minimapLineStart) {
					if (minimapLineEnd === this._minimapLines.length) {
						if (minimapLineStart > 1) {
							minimapLineStart--;
						}
					} else {
						minimapLineEnd++;
					}
				}

				this._minimapSelections.push(new Selection(minimapLineStart, selection.startColumn, minimapLineEnd, selection.endColumn));
			} else {
				this._minimapSelections.push(selection);
			}
		}
	}

	public getLineCount(): number {
		if (this._isSampling) {
			return this._minimapLines.length;
		}
		return this._context.model.getLineCount();
	}

	public getLineContent(lineNumber: number): string {
		if (this._isSampling) {
			return this._context.model.getLineContent(this._minimapLines[lineNumber - 1]);
		}
		return this._context.model.getLineContent(lineNumber);
	}

	public getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): (ViewLineData | null)[] {
		if (this._isSampling) {
			let result: (ViewLineData | null)[] = [];
			for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
				if (needed[lineIndex]) {
					result[lineIndex] = this._context.model.getViewLineData(this._minimapLines[startLineNumber + lineIndex - 1]);
				} else {
					result[lineIndex] = null;
				}
			}
			return result;
		}
		return this._context.model.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed).data;
	}

	public getSelections(): Selection[] {
		return this._minimapSelections;
	}

	public getMinimapDecorationsInViewport(startLineNumber: number, endLineNumber: number): ViewModelDecoration[] {
		let visibleRange: Range;
		if (this._isSampling) {
			const modelStartLineNumber = this._minimapLines[startLineNumber - 1];
			const modelEndLineNumber = this._minimapLines[endLineNumber - 1];
			visibleRange = new Range(modelStartLineNumber, 1, modelEndLineNumber, this._context.model.getLineMaxColumn(modelEndLineNumber));
		} else {
			visibleRange = new Range(startLineNumber, 1, endLineNumber, this._context.model.getLineMaxColumn(endLineNumber));
		}
		const decorations = this._context.model.getDecorationsInViewport(visibleRange);

		if (this._isSampling) {
			let result: ViewModelDecoration[] = [];
			for (const decoration of decorations) {
				if (!decoration.options.minimap) {
					continue;
				}
				const range = decoration.range;
				const minimapStartLineNumber = this._modelLineToMinimapLine(range.startLineNumber);
				const minimapEndLineNumber = this._modelLineToMinimapLine(range.endLineNumber);
				result.push(new ViewModelDecoration(new Range(minimapStartLineNumber, range.startColumn, minimapEndLineNumber, range.endColumn), decoration.options));
			}
			return result;
		}
		return decorations;
	}

	public getOptions(): TextModelResolvedOptions {
		return this._context.model.getOptions();
	}

	public revealLineNumber(lineNumber: number): void {
		if (this._isSampling) {
			lineNumber = this._minimapLines[lineNumber - 1];
		}
		this._context.privateViewEventBus.emit(new viewEvents.ViewRevealRangeRequestEvent(
			'mouse',
			new Range(lineNumber, 1, lineNumber, 1),
			viewEvents.VerticalRevealType.Center,
			false,
			ScrollType.Smooth
		));
	}

	public setScrollTop(scrollTop: number): void {
		this._context.viewLayout.setScrollPositionNow({
			scrollTop: scrollTop
		});
	}

	//#endregion
}

class InnerMinimap extends Disposable {

	private readonly _theme: EditorTheme;
	private readonly _model: IMinimapModel;

	private readonly _domNode: FastDomNode<HTMLElement>;
	private readonly _shadow: FastDomNode<HTMLElement>;
	private readonly _canvas: FastDomNode<HTMLCanvasElement>;
	private readonly _decorationsCanvas: FastDomNode<HTMLCanvasElement>;
	private readonly _slider: FastDomNode<HTMLElement>;
	private readonly _sliderHorizontal: FastDomNode<HTMLElement>;
	private readonly _mouseDownListener: IDisposable;
	private readonly _sliderMouseMoveMonitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;
	private readonly _sliderMouseDownListener: IDisposable;
	private readonly _gestureDisposable: IDisposable;
	private readonly _sliderTouchStartListener: IDisposable;
	private readonly _sliderTouchMoveListener: IDisposable;
	private readonly _sliderTouchEndListener: IDisposable;

	private _lastRenderData: RenderData | null;
	private _selectionColor: Color | undefined;
	private _renderDecorations: boolean = false;
	private _gestureInProgress: boolean = false;
	private _buffers: MinimapBuffers | null;

	constructor(
		theme: EditorTheme,
		model: IMinimapModel
	) {
		super();

		this._theme = theme;
		this._model = model;

		this._lastRenderData = null;
		this._buffers = null;
		this._selectionColor = this._theme.getColor(minimapSelection);

		this._domNode = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this._domNode, PartFingerprint.Minimap);
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

		this._mouseDownListener = dom.addStandardDisposableListener(this._domNode.domNode, 'mousedown', (e) => {
			e.preventDefault();

			const renderMinimap = this._model.options.renderMinimap;
			if (renderMinimap === RenderMinimap.None) {
				return;
			}
			if (!this._lastRenderData) {
				return;
			}
			const minimapLineHeight = this._model.options.minimapLineHeight;
			const internalOffsetY = this._model.options.pixelRatio * e.browserEvent.offsetY;
			const lineIndex = Math.floor(internalOffsetY / minimapLineHeight);

			let lineNumber = lineIndex + this._lastRenderData.renderedLayout.startLineNumber;
			lineNumber = Math.min(lineNumber, this._model.getLineCount());

			this._model.revealLineNumber(lineNumber);
		});

		this._sliderMouseMoveMonitor = new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>();

		this._sliderMouseDownListener = dom.addStandardDisposableListener(this._slider.domNode, 'mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.leftButton && this._lastRenderData) {

				const initialMousePosition = e.posy;
				const initialMouseOrthogonalPosition = e.posx;
				const initialSliderState = this._lastRenderData.renderedLayout;
				this._slider.toggleClassName('active', true);

				this._sliderMouseMoveMonitor.startMonitoring(
					e.target,
					e.buttons,
					standardMouseMoveMerger,
					(mouseMoveData: IStandardMouseMoveEventData) => {
						const mouseOrthogonalDelta = Math.abs(mouseMoveData.posx - initialMouseOrthogonalPosition);

						if (platform.isWindows && mouseOrthogonalDelta > MOUSE_DRAG_RESET_DISTANCE) {
							// The mouse has wondered away from the scrollbar => reset dragging
							this._model.setScrollTop(initialSliderState.scrollTop);
							return;
						}

						const mouseDelta = mouseMoveData.posy - initialMousePosition;
						this._model.setScrollTop(initialSliderState.getDesiredScrollTopFromDelta(mouseDelta));
					},
					() => {
						this._slider.toggleClassName('active', false);
					}
				);
			}
		});

		this._gestureDisposable = Gesture.addTarget(this._domNode.domNode);
		this._sliderTouchStartListener = dom.addDisposableListener(this._domNode.domNode, EventType.Start, (e: GestureEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (this._lastRenderData) {
				this._slider.toggleClassName('active', true);
				this._gestureInProgress = true;
				this.scrollDueToTouchEvent(e);
			}
		});

		this._sliderTouchMoveListener = dom.addStandardDisposableListener(this._domNode.domNode, EventType.Change, (e: GestureEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (this._lastRenderData && this._gestureInProgress) {
				this.scrollDueToTouchEvent(e);
			}
		});

		this._sliderTouchEndListener = dom.addStandardDisposableListener(this._domNode.domNode, EventType.End, (e: GestureEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this._gestureInProgress = false;
			this._slider.toggleClassName('active', false);
		});
	}

	private scrollDueToTouchEvent(touch: GestureEvent) {
		const startY = this._domNode.domNode.getBoundingClientRect().top;
		const scrollTop = this._lastRenderData!.renderedLayout.getDesiredScrollTopFromTouchLocation(touch.pageY - startY);
		this._model.setScrollTop(scrollTop);
	}

	public dispose(): void {
		this._mouseDownListener.dispose();
		this._sliderMouseMoveMonitor.dispose();
		this._sliderMouseDownListener.dispose();
		this._gestureDisposable.dispose();
		this._sliderTouchStartListener.dispose();
		this._sliderTouchMoveListener.dispose();
		this._sliderTouchEndListener.dispose();
		super.dispose();
	}

	private _getMinimapDomNodeClassName(): string {
		if (this._model.options.showSlider === 'always') {
			return 'minimap slider-always';
		}
		return 'minimap slider-mouseover';
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._domNode;
	}

	private _applyLayout(): void {
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

	private _getBuffer(): ImageData | null {
		if (!this._buffers) {
			if (this._model.options.canvasInnerWidth > 0 && this._model.options.canvasInnerHeight > 0) {
				this._buffers = new MinimapBuffers(
					this._canvas.domNode.getContext('2d')!,
					this._model.options.canvasInnerWidth,
					this._model.options.canvasInnerHeight,
					this._model.options.backgroundColor
				);
			}
		}
		return this._buffers ? this._buffers.getBuffer() : null;
	}

	// ---- begin view event handlers

	public onDidChangeOptions(): void {
		this._lastRenderData = null;
		this._buffers = null;
		this._applyLayout();
		this._domNode.setClassName(this._getMinimapDomNodeClassName());
	}
	public onSelectionChanged(): boolean {
		this._renderDecorations = true;
		return true;
	}
	public onDecorationsChanged(): boolean {
		this._renderDecorations = true;
		return true;
	}
	public onFlushed(): boolean {
		this._lastRenderData = null;
		return true;
	}
	public onLinesChanged(changeFromLineNumber: number, changeToLineNumber: number): boolean {
		if (this._lastRenderData) {
			return this._lastRenderData.onLinesChanged(changeFromLineNumber, changeToLineNumber);
		}
		return false;
	}
	public onLinesDeleted(deleteFromLineNumber: number, deleteToLineNumber: number): boolean {
		if (this._lastRenderData) {
			this._lastRenderData.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
		}
		return true;
	}
	public onLinesInserted(insertFromLineNumber: number, insertToLineNumber: number): boolean {
		if (this._lastRenderData) {
			this._lastRenderData.onLinesInserted(insertFromLineNumber, insertToLineNumber);
		}
		return true;
	}
	public onScrollChanged(): boolean {
		this._renderDecorations = true;
		return true;
	}
	public onThemeChanged(): boolean {
		this._selectionColor = this._theme.getColor(minimapSelection);
		this._renderDecorations = true;
		return true;
	}
	public onTokensChanged(ranges: { fromLineNumber: number; toLineNumber: number; }[]): boolean {
		if (this._lastRenderData) {
			return this._lastRenderData.onTokensChanged(ranges);
		}
		return false;
	}
	public onTokensColorsChanged(): boolean {
		this._lastRenderData = null;
		this._buffers = null;
		return true;
	}
	public onZonesChanged(): boolean {
		this._lastRenderData = null;
		return true;
	}

	// --- end event handlers

	public render(renderingCtx: IMinimapRenderingContext): void {
		const renderMinimap = this._model.options.renderMinimap;
		if (renderMinimap === RenderMinimap.None) {
			this._shadow.setClassName('minimap-shadow-hidden');
			this._sliderHorizontal.setWidth(0);
			this._sliderHorizontal.setHeight(0);
			return;
		}
		if (renderingCtx.scrollLeft + renderingCtx.viewportWidth >= renderingCtx.scrollWidth) {
			this._shadow.setClassName('minimap-shadow-hidden');
		} else {
			this._shadow.setClassName('minimap-shadow-visible');
		}

		const layout = MinimapLayout.create(
			this._model.options,
			renderingCtx.samplingRatio,
			renderingCtx.viewportStartLineNumber,
			renderingCtx.viewportEndLineNumber,
			renderingCtx.viewportHeight,
			renderingCtx.viewportContainsWhitespaceGaps,
			this._model.getLineCount(),
			renderingCtx.scrollTop,
			renderingCtx.scrollHeight,
			this._lastRenderData ? this._lastRenderData.renderedLayout : null
		);
		this._slider.setTop(layout.sliderTop);
		this._slider.setHeight(layout.sliderHeight);

		// Compute horizontal slider coordinates
		const scrollLeftChars = renderingCtx.scrollLeft / this._model.options.typicalHalfwidthCharacterWidth;
		const horizontalSliderLeft = Math.min(this._model.options.minimapWidth, Math.round(scrollLeftChars * this._model.options.minimapCharWidth / this._model.options.pixelRatio));
		this._sliderHorizontal.setLeft(horizontalSliderLeft);
		this._sliderHorizontal.setWidth(this._model.options.minimapWidth - horizontalSliderLeft);
		this._sliderHorizontal.setTop(0);
		this._sliderHorizontal.setHeight(layout.sliderHeight);

		this.renderDecorations(layout);
		this._lastRenderData = this.renderLines(layout);
	}

	private renderDecorations(layout: MinimapLayout) {
		if (this._renderDecorations) {
			this._renderDecorations = false;
			const selections = this._model.getSelections();
			const decorations = this._model.getMinimapDecorationsInViewport(layout.startLineNumber, layout.endLineNumber);

			const { canvasInnerWidth, canvasInnerHeight } = this._model.options;
			const lineHeight = this._model.options.minimapLineHeight;
			const characterWidth = this._model.options.minimapCharWidth;
			const tabSize = this._model.getOptions().tabSize;
			const canvasContext = this._decorationsCanvas.domNode.getContext('2d')!;

			canvasContext.clearRect(0, 0, canvasInnerWidth, canvasInnerHeight);

			const lineOffsetMap = new Map<number, number[]>();
			for (let i = 0; i < selections.length; i++) {
				const selection = selections[i];

				for (let line = selection.startLineNumber; line <= selection.endLineNumber; line++) {
					this.renderDecorationOnLine(canvasContext, lineOffsetMap, selection, this._selectionColor, layout, line, lineHeight, lineHeight, tabSize, characterWidth);
				}
			}

			// Loop over decorations, ignoring those that don't have the minimap property set and rendering rectangles for each line the decoration spans
			for (let i = 0; i < decorations.length; i++) {
				const decoration = decorations[i];

				if (!decoration.options.minimap) {
					continue;
				}

				const decorationColor = (<ModelDecorationMinimapOptions>decoration.options.minimap).getColor(this._theme);
				for (let line = decoration.range.startLineNumber; line <= decoration.range.endLineNumber; line++) {
					switch (decoration.options.minimap.position) {

						case MinimapPosition.Inline:
							this.renderDecorationOnLine(canvasContext, lineOffsetMap, decoration.range, decorationColor, layout, line, lineHeight, lineHeight, tabSize, characterWidth);
							continue;

						case MinimapPosition.Gutter:
							const y = (line - layout.startLineNumber) * lineHeight;
							const x = 2;
							this.renderDecoration(canvasContext, decorationColor, x, y, GUTTER_DECORATION_WIDTH, lineHeight);
							continue;
					}
				}
			}
		}
	}

	private renderDecorationOnLine(canvasContext: CanvasRenderingContext2D,
		lineOffsetMap: Map<number, number[]>,
		decorationRange: Range,
		decorationColor: Color | undefined,
		layout: MinimapLayout,
		lineNumber: number,
		height: number,
		lineHeight: number,
		tabSize: number,
		charWidth: number): void {
		const y = (lineNumber - layout.startLineNumber) * lineHeight;

		// Skip rendering the line if it's vertically outside our viewport
		if (y + height < 0 || y > this._model.options.canvasInnerHeight) {
			return;
		}

		// Cache line offset data so that it is only read once per line
		let lineIndexToXOffset = lineOffsetMap.get(lineNumber);
		const isFirstDecorationForLine = !lineIndexToXOffset;
		if (!lineIndexToXOffset) {
			const lineData = this._model.getLineContent(lineNumber);
			lineIndexToXOffset = [MINIMAP_GUTTER_WIDTH];
			for (let i = 1; i < lineData.length + 1; i++) {
				const charCode = lineData.charCodeAt(i - 1);
				const dx = charCode === CharCode.Tab
					? tabSize * charWidth
					: strings.isFullWidthCharacter(charCode)
						? 2 * charWidth
						: charWidth;

				lineIndexToXOffset[i] = lineIndexToXOffset[i - 1] + dx;
			}

			lineOffsetMap.set(lineNumber, lineIndexToXOffset);
		}

		const { startColumn, endColumn, startLineNumber, endLineNumber } = decorationRange;
		const x = startLineNumber === lineNumber ? lineIndexToXOffset[startColumn - 1] : MINIMAP_GUTTER_WIDTH;

		const endColumnForLine = endLineNumber > lineNumber ? lineIndexToXOffset.length - 1 : endColumn - 1;

		if (endColumnForLine > 0) {
			// If the decoration starts at the last character of the column and spans over it, ensure it has a width
			const width = lineIndexToXOffset[endColumnForLine] - x || 2;

			this.renderDecoration(canvasContext, decorationColor, x, y, width, height);
		}

		if (isFirstDecorationForLine) {
			this.renderLineHighlight(canvasContext, decorationColor, y, height);
		}

	}

	private renderLineHighlight(canvasContext: CanvasRenderingContext2D, decorationColor: Color | undefined, y: number, height: number): void {
		canvasContext.fillStyle = decorationColor && decorationColor.transparent(0.5).toString() || '';
		canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y, canvasContext.canvas.width, height);
	}

	private renderDecoration(canvasContext: CanvasRenderingContext2D, decorationColor: Color | undefined, x: number, y: number, width: number, height: number) {
		canvasContext.fillStyle = decorationColor && decorationColor.toString() || '';
		canvasContext.fillRect(x, y, width, height);
	}

	private renderLines(layout: MinimapLayout): RenderData | null {
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
		let [_dirtyY1, _dirtyY2, needed] = InnerMinimap._renderUntouchedLines(
			imageData,
			startLineNumber,
			endLineNumber,
			minimapLineHeight,
			this._lastRenderData
		);

		// Fetch rendering info from view model for rest of lines that need rendering.
		const lineInfo = this._model.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed);
		const tabSize = this._model.getOptions().tabSize;
		const background = this._model.options.backgroundColor;
		const tokensColorTracker = this._model.tokensColorTracker;
		const useLighterFont = tokensColorTracker.backgroundIsLight();
		const renderMinimap = this._model.options.renderMinimap;
		const charRenderer = this._model.options.charRenderer();
		const isSampling = this._model.options.isSampling;
		const fontScale = this._model.options.fontScale;
		const minimapCharWidth = this._model.options.minimapCharWidth;

		// Render the rest of lines
		let dy = 0;
		const renderedLines: MinimapLine[] = [];
		for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
			if (needed[lineIndex]) {
				InnerMinimap._renderLine(
					imageData,
					background,
					useLighterFont,
					renderMinimap,
					minimapCharWidth,
					tokensColorTracker,
					charRenderer,
					dy,
					tabSize,
					lineInfo[lineIndex]!,
					fontScale,
					isSampling
				);
			}
			renderedLines[lineIndex] = new MinimapLine(dy);
			dy += minimapLineHeight;
		}

		const dirtyY1 = (_dirtyY1 === -1 ? 0 : _dirtyY1);
		const dirtyY2 = (_dirtyY2 === -1 ? imageData.height : _dirtyY2);
		const dirtyHeight = dirtyY2 - dirtyY1;

		// Finally, paint to the canvas
		const ctx = this._canvas.domNode.getContext('2d')!;
		ctx.putImageData(imageData, 0, 0, 0, dirtyY1, imageData.width, dirtyHeight);

		// Save rendered data for reuse on next frame if possible
		return new RenderData(
			layout,
			imageData,
			renderedLines
		);
	}

	private static _renderUntouchedLines(
		target: ImageData,
		startLineNumber: number,
		endLineNumber: number,
		minimapLineHeight: number,
		lastRenderData: RenderData | null,
	): [number, number, boolean[]] {

		const needed: boolean[] = [];
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

		let dest_dy = 0;
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
			} else {
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

	private static _renderLine(
		target: ImageData,
		backgroundColor: RGBA8,
		useLighterFont: boolean,
		renderMinimap: RenderMinimap,
		charWidth: number,
		colorTracker: MinimapTokensColorTracker,
		minimapCharRenderer: MinimapCharRenderer,
		dy: number,
		tabSize: number,
		lineData: ViewLineData,
		fontScale: number,
		isSampling: boolean
	): void {
		const content = lineData.content;
		const tokens = lineData.tokens;
		const maxDx = target.width - charWidth;

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

				if (charCode === CharCode.Tab) {
					const insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
					tabsCharDelta += insertSpacesCount - 1;
					// No need to render anything since tab is invisible
					dx += insertSpacesCount * charWidth;
				} else if (charCode === CharCode.Space) {
					// No need to render anything since space is invisible
					dx += charWidth;
				} else {
					// Render twice for a full width character
					const count = strings.isFullWidthCharacter(charCode) ? 2 : 1;

					for (let i = 0; i < count; i++) {
						if (renderMinimap === RenderMinimap.Blocks) {
							minimapCharRenderer.blockRenderChar(target, dx, dy, tokenColor, backgroundColor, useLighterFont);
						} else { // RenderMinimap.Text
							minimapCharRenderer.renderChar(target, dx, dy, charCode, tokenColor, backgroundColor, fontScale, useLighterFont, isSampling);
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

registerThemingParticipant((theme, collector) => {
	const minimapBackgroundValue = theme.getColor(minimapBackground);
	if (minimapBackgroundValue) {
		collector.addRule(`.monaco-editor .minimap > canvas { opacity: ${minimapBackgroundValue.rgba.a}; will-change: opacity; }`);
	}
	const sliderBackground = theme.getColor(scrollbarSliderBackground);
	if (sliderBackground) {
		const halfSliderBackground = sliderBackground.transparent(0.5);
		collector.addRule(`.monaco-editor .minimap-slider, .monaco-editor .minimap-slider .minimap-slider-horizontal { background: ${halfSliderBackground}; }`);
	}
	const sliderHoverBackground = theme.getColor(scrollbarSliderHoverBackground);
	if (sliderHoverBackground) {
		const halfSliderHoverBackground = sliderHoverBackground.transparent(0.5);
		collector.addRule(`.monaco-editor .minimap-slider:hover, .monaco-editor .minimap-slider:hover .minimap-slider-horizontal { background: ${halfSliderHoverBackground}; }`);
	}
	const sliderActiveBackground = theme.getColor(scrollbarSliderActiveBackground);
	if (sliderActiveBackground) {
		const halfSliderActiveBackground = sliderActiveBackground.transparent(0.5);
		collector.addRule(`.monaco-editor .minimap-slider.active, .monaco-editor .minimap-slider.active .minimap-slider-horizontal { background: ${halfSliderActiveBackground}; }`);
	}
	const shadow = theme.getColor(scrollbarShadow);
	if (shadow) {
		collector.addRule(`.monaco-editor .minimap-shadow-visible { box-shadow: ${shadow} -6px 0 6px -6px inset; }`);
	}
});
