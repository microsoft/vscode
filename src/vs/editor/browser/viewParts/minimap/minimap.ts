/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./minimap';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext, IRestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { createMinimapCharRenderer2 } from 'vs/editor/common/view/runtimeMinimapCharRenderer';
import * as browser from 'vs/base/browser/browser';
import { ParsedColor, MinimapTokensColorTracker, Constants } from 'vs/editor/common/view/minimapCharRenderer';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CharCode } from 'vs/base/common/charCode';
import { IViewLayout, MinimapLineRenderingData } from 'vs/editor/common/viewModel/viewModel';
import { ColorId } from 'vs/editor/common/modes';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/styleMutator';
import { IDisposable } from 'vs/base/common/lifecycle';
import { EditorScrollbar } from 'vs/editor/browser/viewParts/editorScrollbar/editorScrollbar';

let charRenderer2 = createMinimapCharRenderer2(); // TODO@minimap

const enum RenderMinimap {
	None = 0,
	Small = 1,
	Large = 2
}

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
		options: MinimapOptions,
		viewportStartLineNumber: number,
		viewportEndLineNumber: number,
		viewportHeight: number,
		lineCount: number,
		scrollbarSliderCenter: number
	) {
		const pixelRatio = options.pixelRatio;
		const minimapLineHeight = (options.renderMinimap === RenderMinimap.Large ? Constants.x2_CHAR_HEIGHT : Constants.x1_CHAR_HEIGHT);
		const minimapLinesFitting = Math.floor(options.canvasOuterHeight / minimapLineHeight);
		const lineHeight = options.lineHeight;

		if (minimapLinesFitting >= lineCount) {
			// All lines fit in the minimap => no minimap scrolling
			this.startLineNumber = 1;
			this.endLineNumber = lineCount;
		} else {
			// The desire is to align (centers) the minimap's slider with the scrollbar's slider
			const viewportLineCount = (viewportEndLineNumber - viewportStartLineNumber + 1);

			// For a resolved this.startLineNumber, we can compute the minimap's slider's center with the following formula:
			// scrollbarSliderCenter = (viewportStartLineNumber - this.startLineNumber + viewportLineCount/2) * minimapLineHeight / pixelRatio;
			// =>
			// scrollbarSliderCenter = (viewportStartLineNumber - this.startLineNumber + viewportLineCount/2) * minimapLineHeight / pixelRatio;
			// scrollbarSliderCenter * pixelRatio / minimapLineHeight = viewportStartLineNumber - this.startLineNumber + viewportLineCount/2
			// this.startLineNumber = viewportStartLineNumber + viewportLineCount/2 - scrollbarSliderCenter * pixelRatio / minimapLineHeight
			let desiredStartLineNumber = Math.floor(viewportStartLineNumber + viewportLineCount / 2 - scrollbarSliderCenter * pixelRatio / minimapLineHeight);
			let desiredEndLineNumber = desiredStartLineNumber + minimapLinesFitting - 1;

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

		// Sometimes, the number of rendered lines varies for a constant viewport height.
		// The reason is that only parts of the viewportStartLineNumber or viewportEndLineNumber are visible.
		// This leads to an apparent tremor in the minimap's slider height.
		// We try here to compensate, making the slider slightly incorrect in these cases, but more pleasing to the eye.
		let visibleLinesCount = viewportEndLineNumber - viewportStartLineNumber + 1;
		const expectedVisibleLineCount = Math.round(viewportHeight / lineHeight);
		if (visibleLinesCount > expectedVisibleLineCount) {
			visibleLinesCount = expectedVisibleLineCount;
		}
		this.sliderHeight = Math.floor(visibleLinesCount * minimapLineHeight / pixelRatio);
	}
}

export class Minimap extends ViewPart {

	private readonly _viewLayout: IViewLayout;
	private readonly _editorScrollbar: EditorScrollbar;

	private readonly _domNode: FastDomNode<HTMLElement>;
	private readonly _canvas: FastDomNode<HTMLCanvasElement>;
	private readonly _slider: FastDomNode<HTMLElement>;
	private readonly _tokensColorTracker: MinimapTokensColorTracker;
	private readonly _tokensColorTrackerListener: IDisposable;

	private _options: MinimapOptions;
	private _backgroundFillData: Uint8ClampedArray;

	constructor(context: ViewContext, viewLayout: IViewLayout, editorScrollbar: EditorScrollbar) {
		super(context);
		this._viewLayout = viewLayout;
		this._editorScrollbar = editorScrollbar;

		this._options = new MinimapOptions(this._context.configuration);
		this._backgroundFillData = null;

		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setPosition('absolute');
		this._domNode.setRight(0);

		this._canvas = createFastDomNode(document.createElement('canvas'));
		this._canvas.setPosition('absolute');
		this._canvas.setLeft(0);
		this._domNode.domNode.appendChild(this._canvas.domNode);

		this._slider = createFastDomNode(document.createElement('div'));
		this._slider.setPosition('absolute');
		this._slider.setClassName('minimap-slider');
		this._domNode.domNode.appendChild(this._slider.domNode);

		this._tokensColorTracker = MinimapTokensColorTracker.getInstance();
		this._tokensColorTrackerListener = this._tokensColorTracker.onDidChange(() => this._backgroundFillData = null);

		this._applyLayout();
	}

	public dispose(): void {
		super.dispose();
	}

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	private _applyLayout(): void {
		this._domNode.setWidth(this._options.minimapWidth);
		this._domNode.setHeight(this._options.minimapHeight);
		this._canvas.setWidth(this._options.canvasOuterWidth);
		this._canvas.setHeight(this._options.canvasOuterHeight);
		this._canvas.domNode.width = this._options.canvasInnerWidth;
		this._canvas.domNode.height = this._options.canvasInnerHeight;
		this._slider.setWidth(this._options.minimapWidth);
		this._backgroundFillData = null;
	}

	private _getBackgroundFillData(): Uint8ClampedArray {
		if (this._backgroundFillData === null) {
			const WIDTH = this._options.canvasInnerWidth;
			const HEIGHT = this._options.canvasInnerHeight;

			const background = this._tokensColorTracker.getColor(ColorId.DefaultBackground);
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

			this._backgroundFillData = result;
		}
		return this._backgroundFillData;
	}

	// ---- begin view event handlers

	private _onOptionsMaybeChanged(): boolean {
		let opts = new MinimapOptions(this._context.configuration);
		if (this._options.equals(opts)) {
			return false;
		}
		this._options = opts;
		this._applyLayout();
		return true;
	}
	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		return this._onOptionsMaybeChanged();
	}
	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		return this._onOptionsMaybeChanged();
	}
	public onModelTokensChanged(e: editorCommon.IViewTokensChangedEvent): boolean {
		// TODO@minimap
		return true;
	}
	public onScrollChanged(e: editorCommon.IScrollEvent): boolean {
		// TODO@minimap
		return true;
	}

	// ---- end view event handlers

	public prepareRender(ctx: IRenderingContext): void {
		// Nothing to read
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}
	}

	public render(renderingCtx: IRestrictedRenderingContext): void {
		const renderMinimap = this._options.renderMinimap;
		if (renderMinimap === RenderMinimap.None) {
			return;
		}

		const WIDTH = this._options.canvasInnerWidth;
		const HEIGHT = this._options.canvasInnerHeight;
		const ctx = this._canvas.domNode.getContext('2d');
		const minimapLineHeight = (renderMinimap === RenderMinimap.Large ? Constants.x2_CHAR_HEIGHT : Constants.x1_CHAR_HEIGHT);
		const charWidth = (renderMinimap === RenderMinimap.Large ? Constants.x2_CHAR_WIDTH : Constants.x1_CHAR_WIDTH);

		const layout = new MinimapLayout(
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


		// Prepare image data (fill with background color)
		let imageData = ctx.createImageData(WIDTH, HEIGHT);
		imageData.data.set(this._getBackgroundFillData());

		let background = this._tokensColorTracker.getColor(ColorId.DefaultBackground);

		let data: MinimapLineRenderingData[] = [];
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			data[lineNumber - startLineNumber] = this._context.model.getMinimapLineRenderingData(lineNumber);
		}

		// let start = performance.now();
		let dy = 0;
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			Minimap._renderLine(imageData, background, renderMinimap, charWidth, this._tokensColorTracker, dy, data[lineNumber - startLineNumber]);
			dy += minimapLineHeight;
		}
		// let end = performance.now();
		// console.log(`INNER LOOP TOOK ${end - start} ms.`);

		ctx.putImageData(imageData, 0, 0);
	}

	private static _renderLine(target: ImageData, backgroundColor: ParsedColor, renderMinimap: RenderMinimap, charWidth: number, colorTracker: MinimapTokensColorTracker, dy: number, lineData: MinimapLineRenderingData) {
		const content = lineData.content;
		const tokens = lineData.tokens;
		const tabSize = lineData.tabSize;
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
						charRenderer2.x2RenderChar(target, dx, dy, charCode, tokenColor, backgroundColor);
					} else {
						charRenderer2.x1RenderChar(target, dx, dy, charCode, tokenColor, backgroundColor);
					}
					dx += charWidth;
				}
			}
		}
	}
}
