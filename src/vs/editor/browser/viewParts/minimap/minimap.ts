/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./minimap';
import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger } from 'vs/base/browser/globalMouseMoveMonitor';
import { CharCode } from 'vs/base/common/charCode';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { ILine, RenderedLinesCollection } from 'vs/editor/browser/view/viewLayer';
import { PartFingerprint, PartFingerprints, ViewPart } from 'vs/editor/browser/view/viewPart';
import { RenderMinimap } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { RGBA8 } from 'vs/editor/common/core/rgba';
import { IConfiguration, ScrollType } from 'vs/editor/common/editorCommon';
import { ColorId } from 'vs/editor/common/modes';
import { Constants, MinimapCharRenderer, MinimapTokensColorTracker } from 'vs/editor/common/view/minimapCharRenderer';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { getOrCreateMinimapCharRenderer } from 'vs/editor/common/view/runtimeMinimapCharRenderer';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { ViewLineData, ViewModelDecoration } from 'vs/editor/common/viewModel/viewModel';
import { scrollbarShadow, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ModelDecorationMinimapOptions } from 'vs/editor/common/model/textModel';

function getMinimapLineHeight(renderMinimap: RenderMinimap): number {
	if (renderMinimap === RenderMinimap.Large) {
		return Constants.x2_CHAR_HEIGHT;
	}
	if (renderMinimap === RenderMinimap.LargeBlocks) {
		return Constants.x2_CHAR_HEIGHT + 2;
	}
	if (renderMinimap === RenderMinimap.Small) {
		return Constants.x1_CHAR_HEIGHT;
	}
	// RenderMinimap.SmallBlocks
	return Constants.x1_CHAR_HEIGHT + 1;
}

function getMinimapCharWidth(renderMinimap: RenderMinimap): number {
	if (renderMinimap === RenderMinimap.Large) {
		return Constants.x2_CHAR_WIDTH;
	}
	if (renderMinimap === RenderMinimap.LargeBlocks) {
		return Constants.x2_CHAR_WIDTH;
	}
	if (renderMinimap === RenderMinimap.Small) {
		return Constants.x1_CHAR_WIDTH;
	}
	// RenderMinimap.SmallBlocks
	return Constants.x1_CHAR_WIDTH;
}

/**
 * The orthogonal distance to the slider at which dragging "resets". This implements "snapping"
 */
const MOUSE_DRAG_RESET_DISTANCE = 140;

class MinimapOptions {

	public readonly renderMinimap: RenderMinimap;

	public readonly scrollBeyondLastLine: boolean;

	public readonly showSlider: 'always' | 'mouseover';

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

	constructor(configuration: IConfiguration) {
		const pixelRatio = configuration.editor.pixelRatio;
		const layoutInfo = configuration.editor.layoutInfo;
		const viewInfo = configuration.editor.viewInfo;
		const fontInfo = configuration.editor.fontInfo;

		this.renderMinimap = layoutInfo.renderMinimap | 0;
		this.scrollBeyondLastLine = viewInfo.scrollBeyondLastLine;
		this.showSlider = viewInfo.minimap.showSlider;
		this.pixelRatio = pixelRatio;
		this.typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
		this.lineHeight = configuration.editor.lineHeight;
		this.minimapLeft = layoutInfo.minimapLeft;
		this.minimapWidth = layoutInfo.minimapWidth;
		this.minimapHeight = layoutInfo.height;

		this.canvasInnerWidth = Math.max(1, Math.floor(pixelRatio * this.minimapWidth));
		this.canvasInnerHeight = Math.max(1, Math.floor(pixelRatio * this.minimapHeight));

		this.canvasOuterWidth = this.canvasInnerWidth / pixelRatio;
		this.canvasOuterHeight = this.canvasInnerHeight / pixelRatio;
	}

	public equals(other: MinimapOptions): boolean {
		return (this.renderMinimap === other.renderMinimap
			&& this.scrollBeyondLastLine === other.scrollBeyondLastLine
			&& this.showSlider === other.showSlider
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

	public static create(
		options: MinimapOptions,
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
		const minimapLineHeight = getMinimapLineHeight(options.renderMinimap);
		const minimapLinesFitting = Math.floor(options.canvasInnerHeight / minimapLineHeight);
		const lineHeight = options.lineHeight;

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

	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return this._renderedLines.onLinesChanged(e.fromLineNumber, e.toLineNumber);
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): void {
		this._renderedLines.onLinesDeleted(e.fromLineNumber, e.toLineNumber);
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): void {
		this._renderedLines.onLinesInserted(e.fromLineNumber, e.toLineNumber);
	}
	public onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		return this._renderedLines.onTokensChanged(e.ranges);
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

export class Minimap extends ViewPart {

	private readonly _domNode: FastDomNode<HTMLElement>;
	private readonly _shadow: FastDomNode<HTMLElement>;
	private readonly _canvas: FastDomNode<HTMLCanvasElement>;
	private readonly _decorationsCanvas: FastDomNode<HTMLCanvasElement>;
	private readonly _slider: FastDomNode<HTMLElement>;
	private readonly _sliderHorizontal: FastDomNode<HTMLElement>;
	private readonly _tokensColorTracker: MinimapTokensColorTracker;
	private readonly _mouseDownListener: IDisposable;
	private readonly _sliderMouseMoveMonitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;
	private readonly _sliderMouseDownListener: IDisposable;

	private _options: MinimapOptions;
	private _lastRenderData: RenderData | null;
	private _lastDecorations: ViewModelDecoration[] | undefined;
	private _renderDecorations: boolean = false;
	private _buffers: MinimapBuffers | null;

	constructor(context: ViewContext) {
		super(context);

		this._options = new MinimapOptions(this._context.configuration);
		this._lastRenderData = null;
		this._buffers = null;

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
		this._domNode.appendChild(this._slider);

		this._sliderHorizontal = createFastDomNode(document.createElement('div'));
		this._sliderHorizontal.setPosition('absolute');
		this._sliderHorizontal.setClassName('minimap-slider-horizontal');
		this._slider.appendChild(this._sliderHorizontal);

		this._tokensColorTracker = MinimapTokensColorTracker.getInstance();

		this._applyLayout();

		this._mouseDownListener = dom.addStandardDisposableListener(this._domNode.domNode, 'mousedown', (e) => {
			e.preventDefault();

			const renderMinimap = this._options.renderMinimap;
			if (renderMinimap === RenderMinimap.None) {
				return;
			}
			if (!this._lastRenderData) {
				return;
			}
			const minimapLineHeight = getMinimapLineHeight(renderMinimap);
			const internalOffsetY = this._options.pixelRatio * e.browserEvent.offsetY;
			const lineIndex = Math.floor(internalOffsetY / minimapLineHeight);

			let lineNumber = lineIndex + this._lastRenderData.renderedLayout.startLineNumber;
			lineNumber = Math.min(lineNumber, this._context.model.getLineCount());

			this._context.privateViewEventBus.emit(new viewEvents.ViewRevealRangeRequestEvent(
				new Range(lineNumber, 1, lineNumber, 1),
				viewEvents.VerticalRevealType.Center,
				false,
				ScrollType.Smooth
			));
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
					standardMouseMoveMerger,
					(mouseMoveData: IStandardMouseMoveEventData) => {
						const mouseOrthogonalDelta = Math.abs(mouseMoveData.posx - initialMouseOrthogonalPosition);

						if (platform.isWindows && mouseOrthogonalDelta > MOUSE_DRAG_RESET_DISTANCE) {
							// The mouse has wondered away from the scrollbar => reset dragging
							this._context.viewLayout.setScrollPositionNow({
								scrollTop: initialSliderState.scrollTop
							});
							return;
						}

						const mouseDelta = mouseMoveData.posy - initialMousePosition;
						this._context.viewLayout.setScrollPositionNow({
							scrollTop: initialSliderState.getDesiredScrollTopFromDelta(mouseDelta)
						});
					},
					() => {
						this._slider.toggleClassName('active', false);
					}
				);
			}
		});
	}

	public dispose(): void {
		this._mouseDownListener.dispose();
		this._sliderMouseMoveMonitor.dispose();
		this._sliderMouseDownListener.dispose();
		super.dispose();
	}

	private _getMinimapDomNodeClassName(): string {
		if (this._options.showSlider === 'always') {
			return 'minimap slider-always';
		}
		return 'minimap slider-mouseover';
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._domNode;
	}

	private _applyLayout(): void {
		this._domNode.setLeft(this._options.minimapLeft);
		this._domNode.setWidth(this._options.minimapWidth);
		this._domNode.setHeight(this._options.minimapHeight);
		this._shadow.setHeight(this._options.minimapHeight);

		this._canvas.setWidth(this._options.canvasOuterWidth);
		this._canvas.setHeight(this._options.canvasOuterHeight);
		this._canvas.domNode.width = this._options.canvasInnerWidth;
		this._canvas.domNode.height = this._options.canvasInnerHeight;

		this._decorationsCanvas.setWidth(this._options.canvasOuterWidth);
		this._decorationsCanvas.setHeight(this._options.canvasOuterHeight);
		this._decorationsCanvas.domNode.width = this._options.canvasInnerWidth;
		this._decorationsCanvas.domNode.height = this._options.canvasInnerHeight;

		this._slider.setWidth(this._options.minimapWidth);
	}

	private _getBuffer(): ImageData {
		if (!this._buffers) {
			this._buffers = new MinimapBuffers(
				this._canvas.domNode.getContext('2d')!,
				this._options.canvasInnerWidth,
				this._options.canvasInnerHeight,
				this._tokensColorTracker.getColor(ColorId.DefaultBackground)
			);
		}
		return this._buffers!.getBuffer();
	}

	private _onOptionsMaybeChanged(): boolean {
		const opts = new MinimapOptions(this._context.configuration);
		if (this._options.equals(opts)) {
			return false;
		}
		this._options = opts;
		this._lastRenderData = null;
		this._buffers = null;
		this._applyLayout();
		this._domNode.setClassName(this._getMinimapDomNodeClassName());
		return true;
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		return this._onOptionsMaybeChanged();
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		this._lastRenderData = null;
		return true;
	}
	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		if (this._lastRenderData) {
			return this._lastRenderData.onLinesChanged(e);
		}
		return false;
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		if (this._lastRenderData) {
			this._lastRenderData.onLinesDeleted(e);
		}
		return true;
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		if (this._lastRenderData) {
			this._lastRenderData.onLinesInserted(e);
		}
		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._renderDecorations = true;
		return true;
	}
	public onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		if (this._lastRenderData) {
			return this._lastRenderData.onTokensChanged(e);
		}
		return false;
	}
	public onTokensColorsChanged(e: viewEvents.ViewTokensColorsChangedEvent): boolean {
		this._lastRenderData = null;
		this._buffers = null;
		return true;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		this._lastRenderData = null;
		return true;
	}

	public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		this._renderDecorations = true;
		return true;
	}

	public onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		this._context.model.invalidateMinimapColorCache();
		// Only bother calling render if decorations are currently shown
		this._renderDecorations = !!this._lastDecorations;
		return !!this._lastDecorations;
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(renderingCtx: RestrictedRenderingContext): void {
		const renderMinimap = this._options.renderMinimap;
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
			this._options,
			renderingCtx.visibleRange.startLineNumber,
			renderingCtx.visibleRange.endLineNumber,
			renderingCtx.viewportHeight,
			(renderingCtx.viewportData.whitespaceViewportData.length > 0),
			this._context.model.getLineCount(),
			renderingCtx.scrollTop,
			renderingCtx.scrollHeight,
			this._lastRenderData ? this._lastRenderData.renderedLayout : null
		);
		this._slider.setTop(layout.sliderTop);
		this._slider.setHeight(layout.sliderHeight);

		// Compute horizontal slider coordinates
		const scrollLeftChars = renderingCtx.scrollLeft / this._options.typicalHalfwidthCharacterWidth;
		const horizontalSliderLeft = Math.min(this._options.minimapWidth, Math.round(scrollLeftChars * getMinimapCharWidth(this._options.renderMinimap) / this._options.pixelRatio));
		this._sliderHorizontal.setLeft(horizontalSliderLeft);
		this._sliderHorizontal.setWidth(this._options.minimapWidth - horizontalSliderLeft);
		this._sliderHorizontal.setTop(0);
		this._sliderHorizontal.setHeight(layout.sliderHeight);

		this.renderDecorations(layout);
		this._lastRenderData = this.renderLines(layout);
	}

	private renderDecorations(layout: MinimapLayout) {
		if (this._renderDecorations) {
			this._renderDecorations = false;
			const decorations = this._context.model.getDecorationsInViewport(new Range(layout.startLineNumber, 1, layout.endLineNumber, this._context.model.getLineMaxColumn(layout.endLineNumber)));

			const { renderMinimap, canvasInnerWidth, canvasInnerHeight } = this._options;
			const lineHeight = getMinimapLineHeight(renderMinimap);
			const characterWidth = getMinimapCharWidth(renderMinimap);
			const tabSize = this._context.model.getOptions().tabSize;
			const canvasContext = this._decorationsCanvas.domNode.getContext('2d')!;

			canvasContext.clearRect(0, 0, canvasInnerWidth, canvasInnerHeight);

			// Loop over decorations, ignoring those that don't have the minimap property set and rendering rectangles for each line the decoration spans
			const lineOffsetMap = new Map<number, number[]>();
			for (let i = 0; i < decorations.length; i++) {
				const decoration = decorations[i];

				if (!decoration.options.minimap) {
					continue;
				}

				for (let line = decoration.range.startLineNumber; line <= decoration.range.endLineNumber; line++) {
					this.renderDecorationOnLine(canvasContext, lineOffsetMap, decoration, layout, line, lineHeight, lineHeight, tabSize, characterWidth);
				}
			}

			this._lastDecorations = decorations;
		}
	}

	private renderDecorationOnLine(canvasContext: CanvasRenderingContext2D,
		lineOffsetMap: Map<number, number[]>,
		decoration: ViewModelDecoration,
		layout: MinimapLayout,
		lineNumber: number,
		height: number,
		lineHeight: number,
		tabSize: number,
		charWidth: number): void {
		const y = (lineNumber - layout.startLineNumber) * lineHeight;

		// Cache line offset data so that it is only read once per line
		let lineIndexToXOffset = lineOffsetMap.get(lineNumber);
		const isFirstDecorationForLine = !lineIndexToXOffset;
		if (!lineIndexToXOffset) {
			const lineData = this._context.model.getLineContent(lineNumber);
			lineIndexToXOffset = [0];
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

		const { startColumn, endColumn, startLineNumber, endLineNumber } = decoration.range;
		const x = startLineNumber === lineNumber ? lineIndexToXOffset[startColumn - 1] : 0;

		const endColumnForLine = endLineNumber > lineNumber ? lineIndexToXOffset.length - 1 : endColumn - 1;

		if (endColumnForLine > 0) {
			// If the decoration starts at the last character of the column and spans over it, ensure it has a width
			const width = lineIndexToXOffset[endColumnForLine] - x || 2;

			this.renderDecoration(canvasContext, <ModelDecorationMinimapOptions>decoration.options.minimap, x, y, width, height);
		}

		if (isFirstDecorationForLine) {
			this.renderLineHighlight(canvasContext, <ModelDecorationMinimapOptions>decoration.options.minimap, y, height);
		}

	}

	private renderLineHighlight(canvasContext: CanvasRenderingContext2D, minimapOptions: ModelDecorationMinimapOptions, y: number, height: number): void {
		const decorationColor = minimapOptions.getColor(this._context.theme);
		canvasContext.fillStyle = decorationColor && decorationColor.transparent(0.5).toString() || '';
		canvasContext.fillRect(0, y, canvasContext.canvas.width, height);
	}

	private renderDecoration(canvasContext: CanvasRenderingContext2D, minimapOptions: ModelDecorationMinimapOptions, x: number, y: number, width: number, height: number) {
		const decorationColor = minimapOptions.getColor(this._context.theme);

		canvasContext.fillStyle = decorationColor && decorationColor.toString() || '';
		canvasContext.fillRect(x, y, width, height);
	}

	private renderLines(layout: MinimapLayout): RenderData {
		const renderMinimap = this._options.renderMinimap;
		const startLineNumber = layout.startLineNumber;
		const endLineNumber = layout.endLineNumber;
		const minimapLineHeight = getMinimapLineHeight(renderMinimap);

		// Check if nothing changed w.r.t. lines from last frame
		if (this._lastRenderData && this._lastRenderData.linesEquals(layout)) {
			const _lastData = this._lastRenderData._get();
			// Nice!! Nothing changed from last frame
			return new RenderData(layout, _lastData.imageData, _lastData.lines);
		}

		// Oh well!! We need to repaint some lines...

		const imageData = this._getBuffer();

		// Render untouched lines by using last rendered data.
		let [_dirtyY1, _dirtyY2, needed] = Minimap._renderUntouchedLines(
			imageData,
			startLineNumber,
			endLineNumber,
			minimapLineHeight,
			this._lastRenderData
		);

		// Fetch rendering info from view model for rest of lines that need rendering.
		const lineInfo = this._context.model.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed);
		const tabSize = lineInfo.tabSize;
		const background = this._tokensColorTracker.getColor(ColorId.DefaultBackground);
		const useLighterFont = this._tokensColorTracker.backgroundIsLight();

		// Render the rest of lines
		let dy = 0;
		const renderedLines: MinimapLine[] = [];
		for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
			if (needed[lineIndex]) {
				Minimap._renderLine(
					imageData,
					background,
					useLighterFont,
					renderMinimap,
					this._tokensColorTracker,
					getOrCreateMinimapCharRenderer(),
					dy,
					tabSize,
					lineInfo.data[lineIndex]!
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
		colorTracker: MinimapTokensColorTracker,
		minimapCharRenderer: MinimapCharRenderer,
		dy: number,
		tabSize: number,
		lineData: ViewLineData
	): void {
		const content = lineData.content;
		const tokens = lineData.tokens;
		const charWidth = getMinimapCharWidth(renderMinimap);
		const maxDx = target.width - charWidth;

		let dx = 0;
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
						if (renderMinimap === RenderMinimap.Large) {
							minimapCharRenderer.x2RenderChar(target, dx, dy, charCode, tokenColor, backgroundColor, useLighterFont);
						} else if (renderMinimap === RenderMinimap.Small) {
							minimapCharRenderer.x1RenderChar(target, dx, dy, charCode, tokenColor, backgroundColor, useLighterFont);
						} else if (renderMinimap === RenderMinimap.LargeBlocks) {
							minimapCharRenderer.x2BlockRenderChar(target, dx, dy, tokenColor, backgroundColor, useLighterFont);
						} else {
							// RenderMinimap.SmallBlocks
							minimapCharRenderer.x1BlockRenderChar(target, dx, dy, tokenColor, backgroundColor, useLighterFont);
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
