/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./minimap';
import { ViewPart, PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { getOrCreateMinimapCharRenderer } from 'vs/editor/common/view/runtimeMinimapCharRenderer';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { MinimapCharRenderer, MinimapTokensColorTracker, Constants } from 'vs/editor/common/view/minimapCharRenderer';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CharCode } from 'vs/base/common/charCode';
import { IViewLayout, ViewLineData } from 'vs/editor/common/viewModel/viewModel';
import { ColorId } from 'vs/editor/common/modes';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IDisposable } from 'vs/base/common/lifecycle';
import { EditorScrollbar } from 'vs/editor/browser/viewParts/editorScrollbar/editorScrollbar';
import { RenderedLinesCollection, ILine } from 'vs/editor/browser/view/viewLayer';
import { Range } from 'vs/editor/common/core/range';
import { RGBA } from 'vs/base/common/color';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger } from 'vs/base/browser/globalMouseMoveMonitor';
import * as platform from 'vs/base/common/platform';

const enum RenderMinimap {
	None = 0,
	Small = 1,
	Large = 2,
	SmallBlocks = 3,
	LargeBlocks = 4,
}

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

	public readonly pixelRatio: number;

	public readonly lineHeight: number;

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

	constructor(configuration: editorCommon.IConfiguration) {
		const pixelRatio = browser.getPixelRatio();
		const layoutInfo = configuration.editor.layoutInfo;

		this.renderMinimap = layoutInfo.renderMinimap | 0;
		this.pixelRatio = pixelRatio;
		this.lineHeight = configuration.editor.lineHeight;
		this.minimapWidth = layoutInfo.minimapWidth;
		this.minimapHeight = layoutInfo.height;

		this.canvasInnerWidth = Math.floor(pixelRatio * this.minimapWidth);
		this.canvasInnerHeight = Math.floor(pixelRatio * this.minimapHeight);

		this.canvasOuterWidth = this.canvasInnerWidth / pixelRatio;
		this.canvasOuterHeight = this.canvasInnerHeight / pixelRatio;
	}

	public equals(other: MinimapOptions): boolean {
		return (this.renderMinimap === other.renderMinimap
			&& this.pixelRatio === other.pixelRatio
			&& this.lineHeight === other.lineHeight
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
		lastRenderData: RenderData,
		options: MinimapOptions,
		viewportStartLineNumber: number,
		viewportEndLineNumber: number,
		viewportHeight: number,
		lineCount: number,
		scrollbarSliderCenter: number
	) {
		const pixelRatio = options.pixelRatio;
		const minimapLineHeight = getMinimapLineHeight(options.renderMinimap);
		const minimapLinesFitting = Math.floor(options.canvasInnerHeight / minimapLineHeight);
		const lineHeight = options.lineHeight;

		// Sometimes, the number of rendered lines varies for a constant viewport height.
		// The reason is that only parts of the viewportStartLineNumber or viewportEndLineNumber are visible.
		// This leads to an apparent tremor in the minimap's slider height.
		// We try here to compensate, making the slider slightly incorrect in these cases, but more pleasing to the eye.
		let viewportLineCount = viewportEndLineNumber - viewportStartLineNumber + 1;
		const expectedViewportLineCount = Math.round(viewportHeight / lineHeight);
		if (viewportLineCount > expectedViewportLineCount) {
			viewportLineCount = expectedViewportLineCount;
		}

		if (minimapLinesFitting >= lineCount) {
			// All lines fit in the minimap => no minimap scrolling
			this.startLineNumber = 1;
			this.endLineNumber = lineCount;
		} else {
			// The desire is to align (centers) the minimap's slider with the scrollbar's slider

			// For a resolved this.startLineNumber, we can compute the minimap's slider's center with the following formula:
			// scrollbarSliderCenter = (viewportStartLineNumber - this.startLineNumber + viewportLineCount/2) * minimapLineHeight / pixelRatio;
			// =>
			// scrollbarSliderCenter = (viewportStartLineNumber - this.startLineNumber + viewportLineCount/2) * minimapLineHeight / pixelRatio;
			// scrollbarSliderCenter * pixelRatio / minimapLineHeight = viewportStartLineNumber - this.startLineNumber + viewportLineCount/2
			// this.startLineNumber = viewportStartLineNumber + viewportLineCount/2 - scrollbarSliderCenter * pixelRatio / minimapLineHeight
			let desiredStartLineNumber = Math.floor(viewportStartLineNumber + viewportLineCount / 2 - scrollbarSliderCenter * pixelRatio / minimapLineHeight);
			let desiredEndLineNumber = desiredStartLineNumber + minimapLinesFitting - 1;

			// Aligning the slider's centers can result (correctly) in tremor.
			// i.e. scrolling down might result in the startLineNumber going up.
			// Avoid this tremor by being consistent w.r.t. the previous computed result
			if (lastRenderData) {
				const lastLayoutDecision = lastRenderData.renderedLayout;
				if (lastLayoutDecision.viewportStartLineNumber <= viewportStartLineNumber) {
					// going down => make sure we don't go above our previous decision
					if (desiredStartLineNumber < lastLayoutDecision.startLineNumber) {
						desiredStartLineNumber = lastLayoutDecision.startLineNumber;
						desiredEndLineNumber = desiredStartLineNumber + minimapLinesFitting - 1;
					}
				}
				if (lastLayoutDecision.viewportStartLineNumber >= viewportStartLineNumber) {
					// going up => make sure we don't go below our previous decision
					if (desiredEndLineNumber > lastLayoutDecision.endLineNumber) {
						desiredEndLineNumber = lastLayoutDecision.endLineNumber;
						desiredStartLineNumber = desiredEndLineNumber - minimapLinesFitting + 1;
					}
				}
			}

			// Aligning the slider's centers is a very good thing, but this would make
			// the minimap never scroll all the way to the top or to the bottom of the file.
			// We therefore check that the viewport lines are in the minimap viewport.

			// (a) validate on start line number
			if (desiredStartLineNumber < 1) {
				// must start after 1
				desiredStartLineNumber = 1;
				desiredEndLineNumber = desiredStartLineNumber + minimapLinesFitting - 1;
			}
			if (desiredStartLineNumber > viewportStartLineNumber) {
				// must contain the viewport's start line number
				desiredStartLineNumber = viewportStartLineNumber;
				desiredEndLineNumber = desiredStartLineNumber + minimapLinesFitting - 1;
			}

			// (b) validate on end line number
			if (desiredEndLineNumber > lineCount) {
				// must end before line count
				desiredEndLineNumber = lineCount;
				desiredStartLineNumber = desiredEndLineNumber - minimapLinesFitting + 1;
			}
			if (desiredEndLineNumber < viewportEndLineNumber) {
				// must contain the viewport's end line number
				desiredEndLineNumber = viewportEndLineNumber;
				desiredStartLineNumber = desiredEndLineNumber - minimapLinesFitting + 1;
			}

			this.startLineNumber = desiredStartLineNumber;
			this.endLineNumber = desiredEndLineNumber;
		}

		this.sliderTop = Math.floor((viewportStartLineNumber - this.startLineNumber) * minimapLineHeight / pixelRatio);
		if (viewportEndLineNumber === lineCount) {
			// The last line is in the viewport => try to extend slider height below the painted lines
			let desiredSliderHeight = Math.floor(expectedViewportLineCount * minimapLineHeight / pixelRatio);
			if (this.sliderTop + desiredSliderHeight > options.minimapHeight) {
				this.sliderHeight = options.minimapHeight - this.sliderTop;
			} else {
				this.sliderHeight = desiredSliderHeight;
			}
		} else {
			this.sliderHeight = Math.floor(viewportLineCount * minimapLineHeight / pixelRatio);
		}
	}
}

class RenderedLayout {
	/**
	 * editor viewport start line number.
	 */
	public readonly viewportStartLineNumber: number;
	/**
	 * editor viewport end line number.
	 */
	public readonly viewportEndLineNumber: number;

	/**
	 * minimap rendered start line number.
	 */
	public readonly startLineNumber: number;
	/**
	 * minimap rendered end line number.
	 */
	public readonly endLineNumber: number;

	constructor(
		viewportStartLineNumber: number,
		viewportEndLineNumber: number,
		startLineNumber: number,
		endLineNumber: number
	) {
		this.viewportStartLineNumber = viewportStartLineNumber;
		this.viewportEndLineNumber = viewportEndLineNumber;
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
	}
}

class MinimapLine implements ILine {

	public static INVALID = new MinimapLine(-1);

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
	public readonly renderedLayout: RenderedLayout;
	private readonly _imageData: ImageData;
	private readonly _renderedLines: RenderedLinesCollection<MinimapLine>;

	constructor(
		renderedLayout: RenderedLayout,
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

	_get(): { imageData: ImageData; rendLineNumberStart: number; lines: MinimapLine[]; } {
		let tmp = this._renderedLines._get();
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

	constructor(ctx: CanvasRenderingContext2D, WIDTH: number, HEIGHT: number, background: RGBA) {
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
		let result = this._buffers[this._lastUsedBuffer];

		// fill with background color
		result.data.set(this._backgroundFillData);

		return result;
	}

	private static _createBackgroundFillData(WIDTH: number, HEIGHT: number, background: RGBA): Uint8ClampedArray {
		const backgroundR = background.r;
		const backgroundG = background.g;
		const backgroundB = background.b;

		let result = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
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

	private readonly _viewLayout: IViewLayout;
	private readonly _editorScrollbar: EditorScrollbar;

	private readonly _domNode: FastDomNode<HTMLElement>;
	private readonly _shadow: FastDomNode<HTMLElement>;
	private readonly _canvas: FastDomNode<HTMLCanvasElement>;
	private readonly _slider: FastDomNode<HTMLElement>;
	private readonly _tokensColorTracker: MinimapTokensColorTracker;
	private readonly _mouseDownListener: IDisposable;
	private readonly _sliderMouseMoveMonitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>;
	private readonly _sliderMouseDownListener: IDisposable;

	private readonly _minimapCharRenderer: MinimapCharRenderer;

	private _options: MinimapOptions;
	private _lastRenderData: RenderData;
	private _buffers: MinimapBuffers;

	constructor(context: ViewContext, viewLayout: IViewLayout, editorScrollbar: EditorScrollbar) {
		super(context);
		this._viewLayout = viewLayout;
		this._editorScrollbar = editorScrollbar;

		this._options = new MinimapOptions(this._context.configuration);
		this._lastRenderData = null;
		this._buffers = null;

		this._domNode = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this._domNode.domNode, PartFingerprint.Minimap);
		this._domNode.setClassName('minimap');
		this._domNode.setPosition('absolute');
		this._domNode.setRight(this._context.configuration.editor.layoutInfo.verticalScrollbarWidth);

		this._shadow = createFastDomNode(document.createElement('div'));
		this._shadow.setClassName('minimap-shadow-hidden');
		this._domNode.domNode.appendChild(this._shadow.domNode);

		this._canvas = createFastDomNode(document.createElement('canvas'));
		this._canvas.setPosition('absolute');
		this._canvas.setLeft(0);
		this._domNode.domNode.appendChild(this._canvas.domNode);

		this._slider = createFastDomNode(document.createElement('div'));
		this._slider.setPosition('absolute');
		this._slider.setClassName('minimap-slider');
		this._domNode.domNode.appendChild(this._slider.domNode);

		this._tokensColorTracker = MinimapTokensColorTracker.getInstance();

		this._minimapCharRenderer = getOrCreateMinimapCharRenderer();

		this._applyLayout();

		this._mouseDownListener = dom.addStandardDisposableListener(this._canvas.domNode, 'mousedown', (e) => {
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
				editorCommon.VerticalRevealType.Center,
				false,
				false
			));
		});

		this._sliderMouseMoveMonitor = new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>();

		this._sliderMouseDownListener = dom.addStandardDisposableListener(this._slider.domNode, 'mousedown', (e) => {
			e.preventDefault();

			if (e.leftButton) {
				const initialMouseOrthogonalPosition = e.posx;
				const initialScrollTop = this._viewLayout.getScrollTop();
				const initialSliderCenter = (this._slider.getTop() + this._slider.getHeight() / 2);
				const draggingDeltaCenter = e.posy - initialSliderCenter;
				this._slider.toggleClassName('active', true);

				this._sliderMouseMoveMonitor.startMonitoring(
					standardMouseMoveMerger,
					(mouseMoveData: IStandardMouseMoveEventData) => {
						const mouseOrthogonalPosition = mouseMoveData.posx;
						const mouseOrthogonalDelta = Math.abs(mouseOrthogonalPosition - initialMouseOrthogonalPosition);
						if (platform.isWindows && mouseOrthogonalDelta > MOUSE_DRAG_RESET_DISTANCE) {
							// The mouse has wondered away from the slider => reset dragging
							this._viewLayout.setScrollPosition({
								scrollTop: initialScrollTop
							});
						} else {
							const pixelRatio = this._options.pixelRatio;
							const minimapLineHeight = getMinimapLineHeight(this._options.renderMinimap);
							const entireCanvasOuterHeight = this._context.model.getLineCount() * minimapLineHeight / pixelRatio;
							const representableHeight = Math.min(entireCanvasOuterHeight, this._options.canvasOuterHeight);

							// Account for the fact that the minimap does not render the extra space below the viewport
							let discountScrollHeight = 0;
							if (this._context.configuration.editor.viewInfo.scrollBeyondLastLine) {
								discountScrollHeight = this._canvas.getHeight() - this._context.configuration.editor.lineHeight;
							}
							const scrollHeight = this._viewLayout.getScrollHeight() - discountScrollHeight;

							const desiredSliderCenter = mouseMoveData.posy - draggingDeltaCenter;
							const desiredScrollCenter = desiredSliderCenter * (scrollHeight / representableHeight);
							const desiredScrollTop = desiredScrollCenter - this._canvas.getHeight() / 2;

							this._viewLayout.setScrollPosition({
								scrollTop: desiredScrollTop
							});
						}
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

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	private _applyLayout(): void {
		this._domNode.setWidth(this._options.minimapWidth);
		this._domNode.setHeight(this._options.minimapHeight);
		this._shadow.setHeight(this._options.minimapHeight);
		this._canvas.setWidth(this._options.canvasOuterWidth);
		this._canvas.setHeight(this._options.canvasOuterHeight);
		this._canvas.domNode.width = this._options.canvasInnerWidth;
		this._canvas.domNode.height = this._options.canvasInnerHeight;
		this._slider.setWidth(this._options.minimapWidth);
	}

	private _getBuffer(): ImageData {
		if (!this._buffers) {
			this._buffers = new MinimapBuffers(
				this._canvas.domNode.getContext('2d'),
				this._options.canvasInnerWidth,
				this._options.canvasInnerHeight,
				this._tokensColorTracker.getColor(ColorId.DefaultBackground)
			);
		}
		return this._buffers.getBuffer();
	}

	private _onOptionsMaybeChanged(): boolean {
		let opts = new MinimapOptions(this._context.configuration);
		if (this._options.equals(opts)) {
			return false;
		}
		this._options = opts;
		this._lastRenderData = null;
		this._buffers = null;
		this._applyLayout();
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

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(renderingCtx: RestrictedRenderingContext): void {
		const renderMinimap = this._options.renderMinimap;
		if (renderMinimap === RenderMinimap.None) {
			this._shadow.setClassName('minimap-shadow-hidden');
			return;
		}
		if (renderingCtx.scrollLeft + renderingCtx.viewportWidth >= renderingCtx.scrollWidth) {
			this._shadow.setClassName('minimap-shadow-hidden');
		} else {
			this._shadow.setClassName('minimap-shadow-visible');
		}

		const layout = new MinimapLayout(
			this._lastRenderData,
			this._options,
			renderingCtx.visibleRange.startLineNumber,
			renderingCtx.visibleRange.endLineNumber,
			renderingCtx.viewportHeight,
			this._context.model.getLineCount(),
			this._editorScrollbar.getVerticalSliderVerticalCenter()
		);
		this._slider.setTop(layout.sliderTop);
		this._slider.setHeight(layout.sliderHeight);

		const startLineNumber = layout.startLineNumber;
		const endLineNumber = layout.endLineNumber;
		const minimapLineHeight = getMinimapLineHeight(renderMinimap);

		const imageData = this._getBuffer();

		// Render untouched lines by using last rendered data.
		let needed = Minimap._renderUntouchedLines(
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
		let renderedLines: MinimapLine[] = [];
		for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
			if (needed[lineIndex]) {
				Minimap._renderLine(
					imageData,
					background,
					useLighterFont,
					renderMinimap,
					this._tokensColorTracker,
					this._minimapCharRenderer,
					dy,
					tabSize,
					lineInfo.data[lineIndex]
				);
			}
			renderedLines[lineIndex] = new MinimapLine(dy);
			dy += minimapLineHeight;
		}

		// Save rendered data for reuse on next frame if possible
		this._lastRenderData = new RenderData(
			new RenderedLayout(
				renderingCtx.visibleRange.startLineNumber,
				renderingCtx.visibleRange.endLineNumber,
				startLineNumber,
				endLineNumber
			),
			imageData,
			renderedLines
		);

		// Finally, paint to the canvas
		const ctx = this._canvas.domNode.getContext('2d');
		ctx.putImageData(imageData, 0, 0);
	}

	private static _renderUntouchedLines(
		target: ImageData,
		startLineNumber: number,
		endLineNumber: number,
		minimapLineHeight: number,
		lastRenderData: RenderData,
	): boolean[] {

		let needed: boolean[] = [];
		if (!lastRenderData) {
			for (let i = 0, len = endLineNumber - startLineNumber + 1; i < len; i++) {
				needed[i] = true;
			}
			return needed;
		}

		const _lastData = lastRenderData._get();
		const lastTargetData = _lastData.imageData.data;
		const lastStartLineNumber = _lastData.rendLineNumberStart;
		const lastLines = _lastData.lines;
		const lastLinesLength = lastLines.length;
		const WIDTH = target.width;
		const targetData = target.data;

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

			let sourceStart = source_dy * WIDTH * 4;
			let sourceEnd = (source_dy + minimapLineHeight) * WIDTH * 4;
			let destStart = dest_dy * WIDTH * 4;
			let destEnd = (dest_dy + minimapLineHeight) * WIDTH * 4;

			if (copySourceEnd === sourceStart && copyDestEnd === destStart) {
				// contiguous zone => extend copy request
				copySourceEnd = sourceEnd;
				copyDestEnd = destEnd;
			} else {
				if (copySourceStart !== -1) {
					// flush existing copy request
					targetData.set(lastTargetData.subarray(copySourceStart, copySourceEnd), copyDestStart);
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
		}

		return needed;
	}

	private static _renderLine(
		target: ImageData,
		backgroundColor: RGBA,
		useLighterFont,
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

		for (let tokenIndex = 0, tokensLen = tokens.length; tokenIndex < tokensLen; tokenIndex++) {
			const token = tokens[tokenIndex];
			const tokenEndIndex = token.endIndex;
			const tokenColorId = token.getForeground();
			const tokenColor = colorTracker.getColor(tokenColorId);

			for (; charIndex < tokenEndIndex; charIndex++) {
				if (dx > maxDx) {
					// hit edge of minimap
					return;
				}
				const charCode = content.charCodeAt(charIndex);

				if (charCode === CharCode.Tab) {
					let insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
					tabsCharDelta += insertSpacesCount - 1;
					// No need to render anything since tab is invisible
					dx += insertSpacesCount * charWidth;
				} else if (charCode === CharCode.Space) {
					// No need to render anything since space is invisible
					dx += charWidth;
				} else {
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
				}
			}
		}
	}
}
