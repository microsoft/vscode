/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './minimap.css';
import * as dom from '../../../../base/browser/dom.js';
import { FastDomNode, createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { GlobalPointerMoveMonitor } from '../../../../base/browser/globalPointerMoveMonitor.js';
import { CharCode } from '../../../../base/common/charCode.js';
import { IDisposable, Disposable } from '../../../../base/common/lifecycle.js';
import * as platform from '../../../../base/common/platform.js';
import * as strings from '../../../../base/common/strings.js';
import { ILine, RenderedLinesCollection } from '../../view/viewLayer.js';
import { PartFingerprint, PartFingerprints, ViewPart } from '../../view/viewPart.js';
import { RenderMinimap, EditorOption, MINIMAP_GUTTER_WIDTH, EditorLayoutInfoComputer } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { RGBA8 } from '../../../common/core/misc/rgba.js';
import { ScrollType } from '../../../common/editorCommon.js';
import { IEditorConfiguration } from '../../../common/config/editorConfiguration.js';
import { ColorId } from '../../../common/encodedTokenAttributes.js';
import { MinimapCharRenderer } from './minimapCharRenderer.js';
import { Constants } from './minimapCharSheet.js';
import { MinimapTokensColorTracker } from '../../../common/viewModel/minimapTokensColorTracker.js';
import { RenderingContext, RestrictedRenderingContext } from '../../view/renderingContext.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { EditorTheme } from '../../../common/editorTheme.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { ViewLineData } from '../../../common/viewModel.js';
import { minimapSelection, minimapBackground, minimapForegroundOpacity, editorForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { ModelDecorationMinimapOptions } from '../../../common/model/textModel.js';
import { Selection } from '../../../common/core/selection.js';
import { Color } from '../../../../base/common/color.js';
import { GestureEvent, EventType, Gesture } from '../../../../base/browser/touch.js';
import { MinimapCharRendererFactory } from './minimapCharRendererFactory.js';
import { MinimapPosition, MinimapSectionHeaderStyle, TextModelResolvedOptions } from '../../../common/model.js';
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

	public readonly renderMinimap: RenderMinimap;
	public readonly size: 'proportional' | 'fill' | 'fit';
	public readonly minimapHeightIsEditorHeight: boolean;
	public readonly scrollBeyondLastLine: boolean;
	public readonly paddingTop: number;
	public readonly paddingBottom: number;
	public readonly showSlider: 'always' | 'mouseover';
	public readonly autohide: 'none' | 'mouseover' | 'scroll';
	public readonly pixelRatio: number;
	public readonly typicalHalfwidthCharacterWidth: number;
	public readonly lineHeight: number;
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

	public readonly isSampling: boolean;
	public readonly editorHeight: number;
	public readonly fontScale: number;
	public readonly minimapLineHeight: number;
	public readonly minimapCharWidth: number;
	public readonly sectionHeaderFontFamily: string;
	public readonly sectionHeaderFontSize: number;
	/**
	 * Space in between the characters of the section header (in CSS px)
	 */
	public readonly sectionHeaderLetterSpacing: number;
	public readonly sectionHeaderFontColor: RGBA8;

	public readonly charRenderer: () => MinimapCharRenderer;
	public readonly defaultBackgroundColor: RGBA8;
	public readonly backgroundColor: RGBA8;
	/**
	 * foreground alpha: integer in [0-255]
	 */
	public readonly foregroundAlpha: number;

	constructor(configuration: IEditorConfiguration, theme: EditorTheme, tokensColorTracker: MinimapTokensColorTracker) {
		const options = configuration.options;
		const pixelRatio = options.get(EditorOption.pixelRatio);
		const layoutInfo = options.get(EditorOption.layoutInfo);
		const minimapLayout = layoutInfo.minimap;
		const fontInfo = options.get(EditorOption.fontInfo);
		const minimapOpts = options.get(EditorOption.minimap);

		this.renderMinimap = minimapLayout.renderMinimap;
		this.size = minimapOpts.size;
		this.minimapHeightIsEditorHeight = minimapLayout.minimapHeightIsEditorHeight;
		this.scrollBeyondLastLine = options.get(EditorOption.scrollBeyondLastLine);
		this.paddingTop = options.get(EditorOption.padding).top;
		this.paddingBottom = options.get(EditorOption.padding).bottom;
		this.showSlider = minimapOpts.showSlider;
		this.autohide = minimapOpts.autohide;
		this.pixelRatio = pixelRatio;
		this.typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
		this.lineHeight = options.get(EditorOption.lineHeight);
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
		this.minimapCharWidth = Constants.BASE_CHAR_WIDTH * this.fontScale;
		this.sectionHeaderFontFamily = DEFAULT_FONT_FAMILY;
		this.sectionHeaderFontSize = minimapOpts.sectionHeaderFontSize * pixelRatio;
		this.sectionHeaderLetterSpacing = minimapOpts.sectionHeaderLetterSpacing; // intentionally not multiplying by pixelRatio
		this.sectionHeaderFontColor = MinimapOptions._getSectionHeaderColor(theme, tokensColorTracker.getColor(ColorId.DefaultForeground));

		this.charRenderer = createSingleCallFunction(() => MinimapCharRendererFactory.create(this.fontScale, fontInfo.fontFamily));
		this.defaultBackgroundColor = tokensColorTracker.getColor(ColorId.DefaultBackground);
		this.backgroundColor = MinimapOptions._getMinimapBackground(theme, this.defaultBackgroundColor);
		this.foregroundAlpha = MinimapOptions._getMinimapForegroundOpacity(theme);
	}

	private static _getMinimapBackground(theme: EditorTheme, defaultBackgroundColor: RGBA8): RGBA8 {
		const themeColor = theme.getColor(minimapBackground);
		if (themeColor) {
			return new RGBA8(themeColor.rgba.r, themeColor.rgba.g, themeColor.rgba.b, Math.round(255 * themeColor.rgba.a));
		}
		return defaultBackgroundColor;
	}

	private static _getMinimapForegroundOpacity(theme: EditorTheme): number {
		const themeColor = theme.getColor(minimapForegroundOpacity);
		if (themeColor) {
			return RGBA8._clamp(Math.round(255 * themeColor.rgba.a));
		}
		return 255;
	}

	private static _getSectionHeaderColor(theme: EditorTheme, defaultForegroundColor: RGBA8): RGBA8 {
		const themeColor = theme.getColor(editorForeground);
		if (themeColor) {
			return new RGBA8(themeColor.rgba.r, themeColor.rgba.g, themeColor.rgba.b, Math.round(255 * themeColor.rgba.a));
		}
		return defaultForegroundColor;
	}

	public equals(other: MinimapOptions): boolean {
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
			&& this.foregroundAlpha === other.foregroundAlpha
		);
	}
}

class MinimapLayout {

	constructor(
		/**
		 * The given editor scrollTop (input).
		 */
		public readonly scrollTop: number,
		/**
		 * The given editor scrollHeight (input).
		 */
		public readonly scrollHeight: number,
		public readonly sliderNeeded: boolean,
		private readonly _computedSliderRatio: number,
		/**
		 * slider dom node top (in CSS px)
		 */
		public readonly sliderTop: number,
		/**
		 * slider dom node height (in CSS px)
		 */
		public readonly sliderHeight: number,
		/**
		 * empty lines to reserve at the top of the minimap.
		 */
		public readonly topPaddingLineCount: number,
		/**
		 * minimap render start line number.
		 */
		public readonly startLineNumber: number,
		/**
		 * minimap render end line number.
		 */
		public readonly endLineNumber: number
	) { }

	/**
	 * Compute a desired `scrollPosition` such that the slider moves by `delta`.
	 */
	public getDesiredScrollTopFromDelta(delta: number): number {
		return Math.round(this.scrollTop + delta / this._computedSliderRatio);
	}

	public getDesiredScrollTopFromTouchLocation(pageY: number): number {
		return Math.round((pageY - this.sliderHeight / 2) / this._computedSliderRatio);
	}

	/**
	 * Intersect a line range with `this.startLineNumber` and `this.endLineNumber`.
	 */
	public intersectWithViewport(range: Range): [number, number] | null {
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
	public getYForLineNumber(lineNumber: number, minimapLineHeight: number): number {
		return + (lineNumber - this.startLineNumber + this.topPaddingLineCount) * minimapLineHeight;
	}

	public static create(
		options: MinimapOptions,
		viewportStartLineNumber: number,
		viewportEndLineNumber: number,
		viewportStartLineNumberVerticalOffset: number,
		viewportHeight: number,
		viewportContainsWhitespaceGaps: boolean,
		lineCount: number,
		realLineCount: number,
		scrollTop: number,
		scrollHeight: number,
		previousLayout: MinimapLayout | null
	): MinimapLayout {
		const pixelRatio = options.pixelRatio;
		const minimapLineHeight = options.minimapLineHeight;
		const minimapLinesFitting = Math.floor(options.canvasInnerHeight / minimapLineHeight);
		const lineHeight = options.lineHeight;

		if (options.minimapHeightIsEditorHeight) {
			let logicalScrollHeight = (
				realLineCount * options.lineHeight
				+ options.paddingTop
				+ options.paddingBottom
			);
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

		const extraLinesAtTheTop = Math.floor(options.paddingTop / lineHeight);
		let extraLinesAtTheBottom = Math.floor(options.paddingBottom / lineHeight);
		if (options.scrollBeyondLastLine) {
			const expectedViewportLineCount = viewportHeight / lineHeight;
			extraLinesAtTheBottom = Math.max(extraLinesAtTheBottom, expectedViewportLineCount - 1);
		}

		let maxMinimapSliderTop: number;
		if (extraLinesAtTheBottom > 0) {
			const expectedViewportLineCount = viewportHeight / lineHeight;
			// The minimap slider, when dragged all the way down, will contain the last line at its top
			maxMinimapSliderTop = (extraLinesAtTheTop + lineCount + extraLinesAtTheBottom - expectedViewportLineCount - 1) * minimapLineHeight / pixelRatio;
		} else {
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
		} else {
			let consideringStartLineNumber: number;
			if (viewportStartLineNumber > 1) {
				consideringStartLineNumber = viewportStartLineNumber + extraLinesAtTheTop;
			} else {
				consideringStartLineNumber = Math.max(1, scrollTop / lineHeight);
			}

			let topPaddingLineCount: number;
			let startLineNumber = Math.max(1, Math.floor(consideringStartLineNumber - sliderTop * pixelRatio / minimapLineHeight));
			if (startLineNumber < extraLinesAtTheTop) {
				topPaddingLineCount = extraLinesAtTheTop - startLineNumber + 1;
				startLineNumber = 1;
			} else {
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

			let sliderTopAligned: number;
			if (scrollTop >= options.paddingTop) {
				sliderTopAligned = (viewportStartLineNumber - startLineNumber + topPaddingLineCount + partialLine) * minimapLineHeight / pixelRatio;
			} else {
				sliderTopAligned = (scrollTop / options.paddingTop) * (topPaddingLineCount + partialLine) * minimapLineHeight / pixelRatio;
			}

			return new MinimapLayout(scrollTop, scrollHeight, true, computedSliderRatio, sliderTopAligned, sliderHeight, topPaddingLineCount, startLineNumber, endLineNumber);
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
		this._renderedLines = new RenderedLinesCollection({
			createLine: () => MinimapLine.INVALID
		});
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

	_get(): { imageData: ImageData; rendLineNumberStart: number; lines: MinimapLine[] } {
		const tmp = this._renderedLines._get();
		return {
			imageData: this._imageData,
			rendLineNumberStart: tmp.rendLineNumberStart,
			lines: tmp.lines
		};
	}

	public onLinesChanged(changeFromLineNumber: number, changeCount: number): boolean {
		return this._renderedLines.onLinesChanged(changeFromLineNumber, changeCount);
	}
	public onLinesDeleted(deleteFromLineNumber: number, deleteToLineNumber: number): void {
		this._renderedLines.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
	}
	public onLinesInserted(insertFromLineNumber: number, insertToLineNumber: number): void {
		this._renderedLines.onLinesInserted(insertFromLineNumber, insertToLineNumber);
	}
	public onTokensChanged(ranges: { fromLineNumber: number; toLineNumber: number }[]): boolean {
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

export interface IMinimapModel {
	readonly tokensColorTracker: MinimapTokensColorTracker;
	readonly options: MinimapOptions;

	getLineCount(): number;
	getRealLineCount(): number;
	getLineContent(lineNumber: number): string;
	getLineMaxColumn(lineNumber: number): number;
	getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): (ViewLineData | null)[];
	getSelections(): Selection[];
	getMinimapDecorationsInViewport(startLineNumber: number, endLineNumber: number): ViewModelDecoration[];
	getSectionHeaderDecorationsInViewport(startLineNumber: number, endLineNumber: number): ViewModelDecoration[];
	getSectionHeaderText(decoration: ViewModelDecoration, fitWidth: (s: string) => string): string | null;
	getOptions(): TextModelResolvedOptions;
	revealLineNumber(lineNumber: number): void;
	setScrollTop(scrollTop: number): void;
}

interface IMinimapRenderingContext {
	readonly viewportContainsWhitespaceGaps: boolean;

	readonly scrollWidth: number;
	readonly scrollHeight: number;

	readonly viewportStartLineNumber: number;
	readonly viewportEndLineNumber: number;
	readonly viewportStartLineNumberVerticalOffset: number;

	readonly scrollTop: number;
	readonly scrollLeft: number;

	readonly viewportWidth: number;
	readonly viewportHeight: number;
}

interface SamplingStateLinesDeletedEvent {
	type: 'deleted';
	_oldIndex: number;
	deleteFromLineNumber: number;
	deleteToLineNumber: number;
}

interface SamplingStateLinesInsertedEvent {
	type: 'inserted';
	_i: number;
	insertFromLineNumber: number;
	insertToLineNumber: number;
}

interface SamplingStateFlushEvent {
	type: 'flush';
}

type SamplingStateEvent = SamplingStateLinesInsertedEvent | SamplingStateLinesDeletedEvent | SamplingStateFlushEvent;

class MinimapSamplingState {

	public static compute(options: MinimapOptions, viewLineCount: number, oldSamplingState: MinimapSamplingState | null): [MinimapSamplingState | null, SamplingStateEvent[]] {
		if (options.renderMinimap === RenderMinimap.None || !options.isSampling) {
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
			const result: number[] = [];
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
		const result: number[] = [];
		let oldIndex = 0;
		let oldDeltaLineCount = 0;
		let minViewLineNumber = 1;
		const MAX_EVENT_COUNT = 10; // generate at most 10 events, if there are more than 10 changes, just flush all previous data
		let events: SamplingStateEvent[] = [];
		let lastEvent: SamplingStateEvent | null = null;
		for (let i = 0; i < minimapLineCount; i++) {
			const fromViewLineNumber = Math.max(minViewLineNumber, Math.round(i * ratio));
			const toViewLineNumber = Math.max(fromViewLineNumber, Math.round((i + 1) * ratio));

			while (oldIndex < oldLength && oldMinimapLines[oldIndex] < fromViewLineNumber) {
				if (events.length < MAX_EVENT_COUNT) {
					const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
					if (lastEvent && lastEvent.type === 'deleted' && lastEvent._oldIndex === oldIndex - 1) {
						lastEvent.deleteToLineNumber++;
					} else {
						lastEvent = { type: 'deleted', _oldIndex: oldIndex, deleteFromLineNumber: oldMinimapLineNumber, deleteToLineNumber: oldMinimapLineNumber };
						events.push(lastEvent);
					}
					oldDeltaLineCount--;
				}
				oldIndex++;
			}

			let selectedViewLineNumber: number;
			if (oldIndex < oldLength && oldMinimapLines[oldIndex] <= toViewLineNumber) {
				// reuse the old sampled line
				selectedViewLineNumber = oldMinimapLines[oldIndex];
				oldIndex++;
			} else {
				if (i === 0) {
					selectedViewLineNumber = 1;
				} else if (i + 1 === minimapLineCount) {
					selectedViewLineNumber = viewLineCount;
				} else {
					selectedViewLineNumber = Math.round(i * ratio + halfRatio);
				}
				if (events.length < MAX_EVENT_COUNT) {
					const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
					if (lastEvent && lastEvent.type === 'inserted' && lastEvent._i === i - 1) {
						lastEvent.insertToLineNumber++;
					} else {
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
				} else {
					lastEvent = { type: 'deleted', _oldIndex: oldIndex, deleteFromLineNumber: oldMinimapLineNumber, deleteToLineNumber: oldMinimapLineNumber };
					events.push(lastEvent);
				}
				oldDeltaLineCount--;
				oldIndex++;
			}
		} else {
			// too many events, just give up
			events = [{ type: 'flush' }];
		}

		return [new MinimapSamplingState(ratio, result), events];
	}

	constructor(
		public readonly samplingRatio: number,
		public readonly minimapLines: number[]	// a map of 0-based minimap line indexes to 1-based view line numbers
	) {
	}

	public modelLineToMinimapLine(lineNumber: number): number {
		return Math.min(this.minimapLines.length, Math.max(1, Math.round(lineNumber / this.samplingRatio)));
	}

	/**
	 * Will return null if the model line ranges are not intersecting with a sampled model line.
	 */
	public modelLineRangeToMinimapLineRange(fromLineNumber: number, toLineNumber: number): [number, number] | null {
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
	public decorationLineRangeToMinimapLineRange(startLineNumber: number, endLineNumber: number): [number, number] {
		let minimapLineStart = this.modelLineToMinimapLine(startLineNumber);
		let minimapLineEnd = this.modelLineToMinimapLine(endLineNumber);
		if (startLineNumber !== endLineNumber && minimapLineEnd === minimapLineStart) {
			if (minimapLineEnd === this.minimapLines.length) {
				if (minimapLineStart > 1) {
					minimapLineStart--;
				}
			} else {
				minimapLineEnd++;
			}
		}
		return [minimapLineStart, minimapLineEnd];
	}

	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): [number, number] {
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
			} else {
				this.minimapLines[i] -= deletedLineCount;
			}
		}
		return [changeStartIndex, changeEndIndex];
	}

	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): void {
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
export class Minimap extends ViewPart implements IMinimapModel {

	public readonly tokensColorTracker: MinimapTokensColorTracker;

	private _selections: Selection[];
	private _minimapSelections: Selection[] | null;

	public options: MinimapOptions;

	private _samplingState: MinimapSamplingState | null;
	private _shouldCheckSampling: boolean;

	private _sectionHeaderCache = new LRUCache<string, string>(10, 1.5);

	private _actual: InnerMinimap;

	constructor(context: ViewContext) {
		super(context);

		this.tokensColorTracker = MinimapTokensColorTracker.getInstance();

		this._selections = [];
		this._minimapSelections = null;

		this.options = new MinimapOptions(this._context.configuration, this._context.theme, this.tokensColorTracker);
		const [samplingState,] = MinimapSamplingState.compute(this.options, this._context.viewModel.getLineCount(), null);
		this._samplingState = samplingState;
		this._shouldCheckSampling = false;

		this._actual = new InnerMinimap(context.theme, this);
	}

	public override dispose(): void {
		this._actual.dispose();
		super.dispose();
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._actual.getDomNode();
	}

	private _onOptionsMaybeChanged(): boolean {
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

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		return this._onOptionsMaybeChanged();
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selections = e.selections;
		this._minimapSelections = null;
		return this._actual.onSelectionChanged();
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		if (e.affectsMinimap) {
			return this._actual.onDecorationsChanged();
		}
		return false;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		if (this._samplingState) {
			this._shouldCheckSampling = true;
		}
		return this._actual.onFlushed();
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		if (this._samplingState) {
			const minimapLineRange = this._samplingState.modelLineRangeToMinimapLineRange(e.fromLineNumber, e.fromLineNumber + e.count - 1);
			if (minimapLineRange) {
				return this._actual.onLinesChanged(minimapLineRange[0], minimapLineRange[1] - minimapLineRange[0] + 1);
			} else {
				return false;
			}
		} else {
			return this._actual.onLinesChanged(e.fromLineNumber, e.count);
		}
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		if (this._samplingState) {
			const [changeStartIndex, changeEndIndex] = this._samplingState.onLinesDeleted(e);
			if (changeStartIndex <= changeEndIndex) {
				this._actual.onLinesChanged(changeStartIndex + 1, changeEndIndex - changeStartIndex + 1);
			}
			this._shouldCheckSampling = true;
			return true;
		} else {
			return this._actual.onLinesDeleted(e.fromLineNumber, e.toLineNumber);
		}
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		if (this._samplingState) {
			this._samplingState.onLinesInserted(e);
			this._shouldCheckSampling = true;
			return true;
		} else {
			return this._actual.onLinesInserted(e.fromLineNumber, e.toLineNumber);
		}
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return this._actual.onScrollChanged(e);
	}
	public override onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		this._actual.onThemeChanged();
		this._onOptionsMaybeChanged();
		return true;
	}
	public override onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		if (this._samplingState) {
			const ranges: { fromLineNumber: number; toLineNumber: number }[] = [];
			for (const range of e.ranges) {
				const minimapLineRange = this._samplingState.modelLineRangeToMinimapLineRange(range.fromLineNumber, range.toLineNumber);
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
	public override onTokensColorsChanged(e: viewEvents.ViewTokensColorsChangedEvent): boolean {
		this._onOptionsMaybeChanged();
		return this._actual.onTokensColorsChanged();
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return this._actual.onZonesChanged();
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		if (this._shouldCheckSampling) {
			this._shouldCheckSampling = false;
			this._recreateLineSampling();
		}
	}

	public render(ctx: RestrictedRenderingContext): void {
		let viewportStartLineNumber = ctx.visibleRange.startLineNumber;
		let viewportEndLineNumber = ctx.visibleRange.endLineNumber;

		if (this._samplingState) {
			viewportStartLineNumber = this._samplingState.modelLineToMinimapLine(viewportStartLineNumber);
			viewportEndLineNumber = this._samplingState.modelLineToMinimapLine(viewportEndLineNumber);
		}

		const minimapCtx: IMinimapRenderingContext = {
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

	private _recreateLineSampling(): void {
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

	public getLineCount(): number {
		if (this._samplingState) {
			return this._samplingState.minimapLines.length;
		}
		return this._context.viewModel.getLineCount();
	}

	public getRealLineCount(): number {
		return this._context.viewModel.getLineCount();
	}

	public getLineContent(lineNumber: number): string {
		if (this._samplingState) {
			return this._context.viewModel.getLineContent(this._samplingState.minimapLines[lineNumber - 1]);
		}
		return this._context.viewModel.getLineContent(lineNumber);
	}

	public getLineMaxColumn(lineNumber: number): number {
		if (this._samplingState) {
			return this._context.viewModel.getLineMaxColumn(this._samplingState.minimapLines[lineNumber - 1]);
		}
		return this._context.viewModel.getLineMaxColumn(lineNumber);
	}

	public getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): (ViewLineData | null)[] {
		if (this._samplingState) {
			const result: (ViewLineData | null)[] = [];
			for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
				if (needed[lineIndex]) {
					result[lineIndex] = this._context.viewModel.getViewLineData(this._samplingState.minimapLines[startLineNumber + lineIndex - 1]);
				} else {
					result[lineIndex] = null;
				}
			}
			return result;
		}
		return this._context.viewModel.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed).data;
	}

	public getSelections(): Selection[] {
		if (this._minimapSelections === null) {
			if (this._samplingState) {
				this._minimapSelections = [];
				for (const selection of this._selections) {
					const [minimapLineStart, minimapLineEnd] = this._samplingState.decorationLineRangeToMinimapLineRange(selection.startLineNumber, selection.endLineNumber);
					this._minimapSelections.push(new Selection(minimapLineStart, selection.startColumn, minimapLineEnd, selection.endColumn));
				}
			} else {
				this._minimapSelections = this._selections;
			}
		}
		return this._minimapSelections;
	}

	public getMinimapDecorationsInViewport(startLineNumber: number, endLineNumber: number): ViewModelDecoration[] {
		return this._getMinimapDecorationsInViewport(startLineNumber, endLineNumber)
			.filter(decoration => !decoration.options.minimap?.sectionHeaderStyle);
	}

	public getSectionHeaderDecorationsInViewport(startLineNumber: number, endLineNumber: number): ViewModelDecoration[] {
		const headerHeightInMinimapLines = this.options.sectionHeaderFontSize / this.options.minimapLineHeight;
		startLineNumber = Math.floor(Math.max(1, startLineNumber - headerHeightInMinimapLines));
		return this._getMinimapDecorationsInViewport(startLineNumber, endLineNumber)
			.filter(decoration => !!decoration.options.minimap?.sectionHeaderStyle);
	}

	private _getMinimapDecorationsInViewport(startLineNumber: number, endLineNumber: number) {
		let visibleRange: Range;
		if (this._samplingState) {
			const modelStartLineNumber = this._samplingState.minimapLines[startLineNumber - 1];
			const modelEndLineNumber = this._samplingState.minimapLines[endLineNumber - 1];
			visibleRange = new Range(modelStartLineNumber, 1, modelEndLineNumber, this._context.viewModel.getLineMaxColumn(modelEndLineNumber));
		} else {
			visibleRange = new Range(startLineNumber, 1, endLineNumber, this._context.viewModel.getLineMaxColumn(endLineNumber));
		}
		const decorations = this._context.viewModel.getMinimapDecorationsInRange(visibleRange);

		if (this._samplingState) {
			const result: ViewModelDecoration[] = [];
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

	public getSectionHeaderText(decoration: ViewModelDecoration, fitWidth: (s: string) => string): string | null {
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

	public getOptions(): TextModelResolvedOptions {
		return this._context.viewModel.model.getOptions();
	}

	public revealLineNumber(lineNumber: number): void {
		if (this._samplingState) {
			lineNumber = this._samplingState.minimapLines[lineNumber - 1];
		}
		this._context.viewModel.revealRange(
			'mouse',
			false,
			new Range(lineNumber, 1, lineNumber, 1),
			viewEvents.VerticalRevealType.Center,
			ScrollType.Smooth
		);
	}

	public setScrollTop(scrollTop: number): void {
		this._context.viewModel.viewLayout.setScrollPosition({
			scrollTop: scrollTop
		}, ScrollType.Immediate);
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
	private readonly _pointerDownListener: IDisposable;
	private readonly _sliderPointerMoveMonitor: GlobalPointerMoveMonitor;
	private readonly _sliderPointerDownListener: IDisposable;
	private readonly _gestureDisposable: IDisposable;
	private readonly _sliderTouchStartListener: IDisposable;
	private readonly _sliderTouchMoveListener: IDisposable;
	private readonly _sliderTouchEndListener: IDisposable;

	private _lastRenderData: RenderData | null;
	private _selectionColor: Color | undefined;
	private _renderDecorations: boolean = false;
	private _gestureInProgress: boolean = false;
	private _buffers: MinimapBuffers | null;
	private _isMouseOverMinimap: boolean = false;
	private _hideDelayedScheduler: RunOnceScheduler;

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
			if (renderMinimap === RenderMinimap.None) {
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
		this._sliderTouchStartListener = dom.addDisposableListener(this._domNode.domNode, EventType.Start, (e: GestureEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (this._lastRenderData) {
				this._slider.toggleClassName('active', true);
				this._gestureInProgress = true;
				this.scrollDueToTouchEvent(e);
			}
		}, { passive: false });

		this._sliderTouchMoveListener = dom.addDisposableListener(this._domNode.domNode, EventType.Change, (e: GestureEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (this._lastRenderData && this._gestureInProgress) {
				this.scrollDueToTouchEvent(e);
			}
		}, { passive: false });

		this._sliderTouchEndListener = dom.addStandardDisposableListener(this._domNode.domNode, EventType.End, (e: GestureEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this._gestureInProgress = false;
			this._slider.toggleClassName('active', false);
		});
	}

	private _hideSoon() {
		this._hideDelayedScheduler.cancel();
		this._hideDelayedScheduler.schedule();
	}

	private _hideImmediatelyIfMouseIsOutside() {
		if (this._isMouseOverMinimap) {
			this._hideSoon();
			return;
		}
		this._domNode.toggleClassName('active', false);
	}

	private _startSliderDragging(e: PointerEvent, initialPosY: number, initialSliderState: MinimapLayout): void {
		if (!e.target || !(e.target instanceof Element)) {
			return;
		}
		const initialPosX = e.pageX;

		this._slider.toggleClassName('active', true);

		const handlePointerMove = (posy: number, posx: number) => {
			const minimapPosition = dom.getDomNodePagePosition(this._domNode.domNode);
			const pointerOrthogonalDelta = Math.min(
				Math.abs(posx - initialPosX),
				Math.abs(posx - minimapPosition.left),
				Math.abs(posx - minimapPosition.left - minimapPosition.width)
			);

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

		this._sliderPointerMoveMonitor.startMonitoring(
			e.target,
			e.pointerId,
			e.buttons,
			pointerMoveData => handlePointerMove(pointerMoveData.pageY, pointerMoveData.pageX),
			() => {
				this._slider.toggleClassName('active', false);
			}
		);
	}

	private scrollDueToTouchEvent(touch: GestureEvent) {
		const startY = this._domNode.domNode.getBoundingClientRect().top;
		const scrollTop = this._lastRenderData!.renderedLayout.getDesiredScrollTopFromTouchLocation(touch.pageY - startY);
		this._model.setScrollTop(scrollTop);
	}

	public override dispose(): void {
		this._pointerDownListener.dispose();
		this._sliderPointerMoveMonitor.dispose();
		this._sliderPointerDownListener.dispose();
		this._gestureDisposable.dispose();
		this._sliderTouchStartListener.dispose();
		this._sliderTouchMoveListener.dispose();
		this._sliderTouchEndListener.dispose();
		super.dispose();
	}

	private _getMinimapDomNodeClassName(): string {
		const class_ = ['minimap'];
		if (this._model.options.showSlider === 'always') {
			class_.push('slider-always');
		} else {
			class_.push('slider-mouseover');
		}

		if (this._model.options.autohide === 'mouseover') {
			class_.push('minimap-autohide-mouseover');
		} else if (this._model.options.autohide === 'scroll') {
			class_.push('minimap-autohide-scroll');
		}

		return class_.join(' ');
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
	public onLinesChanged(changeFromLineNumber: number, changeCount: number): boolean {
		if (this._lastRenderData) {
			return this._lastRenderData.onLinesChanged(changeFromLineNumber, changeCount);
		}
		return false;
	}
	public onLinesDeleted(deleteFromLineNumber: number, deleteToLineNumber: number): boolean {
		this._lastRenderData?.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
		return true;
	}
	public onLinesInserted(insertFromLineNumber: number, insertToLineNumber: number): boolean {
		this._lastRenderData?.onLinesInserted(insertFromLineNumber, insertToLineNumber);
		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		if (this._model.options.autohide === 'scroll' && (e.scrollTopChanged || e.scrollHeightChanged)) {
			this._domNode.toggleClassName('active', true);
			this._hideSoon();
		}
		this._renderDecorations = true;
		return true;
	}
	public onThemeChanged(): boolean {
		this._selectionColor = this._theme.getColor(minimapSelection);
		this._renderDecorations = true;
		return true;
	}
	public onTokensChanged(ranges: { fromLineNumber: number; toLineNumber: number }[]): boolean {
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
			renderingCtx.viewportStartLineNumber,
			renderingCtx.viewportEndLineNumber,
			renderingCtx.viewportStartLineNumberVerticalOffset,
			renderingCtx.viewportHeight,
			renderingCtx.viewportContainsWhitespaceGaps,
			this._model.getLineCount(),
			this._model.getRealLineCount(),
			renderingCtx.scrollTop,
			renderingCtx.scrollHeight,
			this._lastRenderData ? this._lastRenderData.renderedLayout : null
		);
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

	private renderDecorations(layout: MinimapLayout) {
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
			const canvasContext = this._decorationsCanvas.domNode.getContext('2d')!;

			canvasContext.clearRect(0, 0, canvasInnerWidth, canvasInnerHeight);

			// We first need to render line highlights and then render decorations on top of those.
			// But we need to pick a single color for each line, and use that as a line highlight.
			// This needs to be the color of the decoration with the highest `zIndex`, but priority
			// is given to the selection.

			const highlightedLines = new ContiguousLineMap<boolean>(layout.startLineNumber, layout.endLineNumber, false);
			this._renderSelectionLineHighlights(canvasContext, selections, highlightedLines, layout, minimapLineHeight);
			this._renderDecorationsLineHighlights(canvasContext, decorations, highlightedLines, layout, minimapLineHeight);

			const lineOffsetMap = new ContiguousLineMap<number[] | null>(layout.startLineNumber, layout.endLineNumber, null);
			this._renderSelectionsHighlights(canvasContext, selections, lineOffsetMap, layout, minimapLineHeight, tabSize, minimapCharWidth, canvasInnerWidth);
			this._renderDecorationsHighlights(canvasContext, decorations, lineOffsetMap, layout, minimapLineHeight, tabSize, minimapCharWidth, canvasInnerWidth);
			this._renderSectionHeaders(layout);
		}
	}

	private _renderSelectionLineHighlights(
		canvasContext: CanvasRenderingContext2D,
		selections: Selection[],
		highlightedLines: ContiguousLineMap<boolean>,
		layout: MinimapLayout,
		minimapLineHeight: number
	): void {
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
			} else {
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

	private _renderDecorationsLineHighlights(
		canvasContext: CanvasRenderingContext2D,
		decorations: ViewModelDecoration[],
		highlightedLines: ContiguousLineMap<boolean>,
		layout: MinimapLayout,
		minimapLineHeight: number
	): void {

		const highlightColors = new Map<string, string>();

		// Loop backwards to hit first decorations with higher `zIndex`
		for (let i = decorations.length - 1; i >= 0; i--) {
			const decoration = decorations[i];

			const minimapOptions = <ModelDecorationMinimapOptions | null | undefined>decoration.options.minimap;
			if (!minimapOptions || minimapOptions.position !== MinimapPosition.Inline) {
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
				const y = layout.getYForLineNumber(startLineNumber, minimapLineHeight);
				canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y, canvasContext.canvas.width, minimapLineHeight);
			}
		}
	}

	private _renderSelectionsHighlights(
		canvasContext: CanvasRenderingContext2D,
		selections: Selection[],
		lineOffsetMap: ContiguousLineMap<number[] | null>,
		layout: MinimapLayout,
		lineHeight: number,
		tabSize: number,
		characterWidth: number,
		canvasInnerWidth: number
	): void {
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

	private _renderDecorationsHighlights(
		canvasContext: CanvasRenderingContext2D,
		decorations: ViewModelDecoration[],
		lineOffsetMap: ContiguousLineMap<number[] | null>,
		layout: MinimapLayout,
		minimapLineHeight: number,
		tabSize: number,
		characterWidth: number,
		canvasInnerWidth: number
	): void {
		// Loop forwards to hit first decorations with lower `zIndex`
		for (const decoration of decorations) {

			const minimapOptions = <ModelDecorationMinimapOptions | null | undefined>decoration.options.minimap;
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

					case MinimapPosition.Inline:
						this.renderDecorationOnLine(canvasContext, lineOffsetMap, decoration.range, decorationColor, layout, line, minimapLineHeight, minimapLineHeight, tabSize, characterWidth, canvasInnerWidth);
						continue;

					case MinimapPosition.Gutter: {
						const y = layout.getYForLineNumber(line, minimapLineHeight);
						const x = 2;
						this.renderDecoration(canvasContext, decorationColor, x, y, GUTTER_DECORATION_WIDTH, minimapLineHeight);
						continue;
					}
				}
			}
		}
	}

	private renderDecorationOnLine(
		canvasContext: CanvasRenderingContext2D,
		lineOffsetMap: ContiguousLineMap<number[] | null>,
		decorationRange: Range,
		decorationColor: Color | undefined,
		layout: MinimapLayout,
		lineNumber: number,
		height: number,
		minimapLineHeight: number,
		tabSize: number,
		charWidth: number,
		canvasInnerWidth: number
	): void {
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

	private getXOffsetForPosition(
		lineOffsetMap: ContiguousLineMap<number[] | null>,
		lineNumber: number,
		column: number,
		tabSize: number,
		charWidth: number,
		canvasInnerWidth: number
	): number {
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
				const dx = charCode === CharCode.Tab
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

	private renderDecoration(canvasContext: CanvasRenderingContext2D, decorationColor: Color | undefined, x: number, y: number, width: number, height: number) {
		canvasContext.fillStyle = decorationColor && decorationColor.toString() || '';
		canvasContext.fillRect(x, y, width, height);
	}

	private _renderSectionHeaders(layout: MinimapLayout) {
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

		const canvasContext = this._decorationsCanvas.domNode.getContext('2d')!;
		canvasContext.letterSpacing = sectionHeaderLetterSpacing + 'px';
		canvasContext.font = '500 ' + sectionHeaderFontSize + 'px ' + this._model.options.sectionHeaderFontFamily;
		canvasContext.strokeStyle = separatorStroke;
		canvasContext.lineWidth = 0.4;

		const decorations = this._model.getSectionHeaderDecorationsInViewport(layout.startLineNumber, layout.endLineNumber);
		decorations.sort((a, b) => a.range.startLineNumber - b.range.startLineNumber);

		const fitWidth = InnerMinimap._fitSectionHeader.bind(null, canvasContext,
			canvasInnerWidth - MINIMAP_GUTTER_WIDTH);

		for (const decoration of decorations) {
			const y = layout.getYForLineNumber(decoration.range.startLineNumber, minimapLineHeight) + sectionHeaderFontSize;
			const backgroundFillY = y - sectionHeaderFontSize;
			const separatorY = backgroundFillY + 2;
			const headerText = this._model.getSectionHeaderText(decoration, fitWidth);

			InnerMinimap._renderSectionLabel(
				canvasContext,
				headerText,
				decoration.options.minimap?.sectionHeaderStyle === MinimapSectionHeaderStyle.Underlined,
				backgroundFill,
				foregroundFill,
				canvasInnerWidth,
				backgroundFillY,
				backgroundFillHeight,
				y,
				separatorY);
		}
	}

	private static _fitSectionHeader(
		target: CanvasRenderingContext2D,
		maxWidth: number,
		headerText: string,
	): string {
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

	private static _renderSectionLabel(
		target: CanvasRenderingContext2D,
		headerText: string | null,
		hasSeparatorLine: boolean,
		backgroundFill: string,
		foregroundFill: string,
		minimapWidth: number,
		backgroundFillY: number,
		backgroundFillHeight: number,
		textY: number,
		separatorY: number
	): void {
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
		const [_dirtyY1, _dirtyY2, needed] = InnerMinimap._renderUntouchedLines(
			imageData,
			layout.topPaddingLineCount,
			startLineNumber,
			endLineNumber,
			minimapLineHeight,
			this._lastRenderData
		);

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

		const baseCharHeight = (renderMinimap === RenderMinimap.Text ? Constants.BASE_CHAR_HEIGHT : Constants.BASE_CHAR_HEIGHT + 1);
		const renderMinimapLineHeight = baseCharHeight * fontScale;
		const innerLinePadding = (minimapLineHeight > renderMinimapLineHeight ? Math.floor((minimapLineHeight - renderMinimapLineHeight) / 2) : 0);

		// Render the rest of lines
		const backgroundA = background.a / 255;
		const renderBackground = new RGBA8(
			Math.round((background.r - defaultBackground.r) * backgroundA + defaultBackground.r),
			Math.round((background.g - defaultBackground.g) * backgroundA + defaultBackground.g),
			Math.round((background.b - defaultBackground.b) * backgroundA + defaultBackground.b),
			255
		);
		let dy = layout.topPaddingLineCount * minimapLineHeight;
		const renderedLines: MinimapLine[] = [];
		for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
			if (needed[lineIndex]) {
				InnerMinimap._renderLine(
					imageData,
					renderBackground,
					background.a,
					useLighterFont,
					renderMinimap,
					minimapCharWidth,
					tokensColorTracker,
					foregroundAlpha,
					charRenderer,
					dy,
					innerLinePadding,
					tabSize,
					lineInfo[lineIndex]!,
					fontScale,
					minimapLineHeight
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
		topPaddingLineCount: number,
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
		backgroundAlpha: number,
		useLighterFont: boolean,
		renderMinimap: RenderMinimap,
		charWidth: number,
		colorTracker: MinimapTokensColorTracker,
		foregroundAlpha: number,
		minimapCharRenderer: MinimapCharRenderer,
		dy: number,
		innerLinePadding: number,
		tabSize: number,
		lineData: ViewLineData,
		fontScale: number,
		minimapLineHeight: number
	): void {
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
							minimapCharRenderer.blockRenderChar(target, dx, dy + innerLinePadding, tokenColor, foregroundAlpha, backgroundColor, backgroundAlpha, force1pxHeight);
						} else { // RenderMinimap.Text
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

class ContiguousLineMap<T> {

	private readonly _startLineNumber: number;
	private readonly _endLineNumber: number;
	private readonly _defaultValue: T;
	private readonly _values: T[];

	constructor(startLineNumber: number, endLineNumber: number, defaultValue: T) {
		this._startLineNumber = startLineNumber;
		this._endLineNumber = endLineNumber;
		this._defaultValue = defaultValue;
		this._values = [];
		for (let i = 0, count = this._endLineNumber - this._startLineNumber + 1; i < count; i++) {
			this._values[i] = defaultValue;
		}
	}

	public has(lineNumber: number): boolean {
		return (this.get(lineNumber) !== this._defaultValue);
	}

	public set(lineNumber: number, value: T): void {
		if (lineNumber < this._startLineNumber || lineNumber > this._endLineNumber) {
			return;
		}
		this._values[lineNumber - this._startLineNumber] = value;
	}

	public get(lineNumber: number): T {
		if (lineNumber < this._startLineNumber || lineNumber > this._endLineNumber) {
			return this._defaultValue;
		}
		return this._values[lineNumber - this._startLineNumber];
	}
}

