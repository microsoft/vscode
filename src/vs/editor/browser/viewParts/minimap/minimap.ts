/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// import 'vs/css!./overlayWidgets';
// import { StyleMutator } from 'vs/base/browser/styleMutator';
// import { EditorLayoutInfo } from 'vs/editor/common/editorCommon';
// import { ClassNames, IOverlayWidget, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { ViewPart/*, PartFingerprint, PartFingerprints*/ } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext, IRestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { /*createMinimapCharRenderer,*/ createMinimapCharRenderer2 } from 'vs/editor/common/view/runtimeMinimapCharRenderer';
import * as browser from 'vs/base/browser/browser';
import { ParsedColor, MinimapColors, MinimapTokensColorTracker, Constants } from 'vs/editor/common/view/minimapCharRenderer';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CharCode } from 'vs/base/common/charCode';
import { MinimapLineRenderingData } from 'vs/editor/common/viewModel/viewModel';
import { ColorId } from 'vs/editor/common/modes';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/styleMutator';
import { IDisposable } from 'vs/base/common/lifecycle';

// let charRenderer = createMinimapCharRenderer();
let charRenderer2 = createMinimapCharRenderer2(); // TODO@minimap

// interface IWidgetData {
// 	widget: IOverlayWidget;
// 	preference: OverlayWidgetPositionPreference;
// }

// interface IWidgetMap {
// 	[key: string]: IWidgetData;
// }

const enum RenderMinimap {
	None = 0,
	Small = 1,
	Large = 2
}

class MinimapOptions {

	public readonly renderMinimap: RenderMinimap;

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
		this.minimapWidth = layoutInfo.minimapWidth;
		this.minimapHeight = layoutInfo.height;

		this.canvasInnerWidth = Math.floor(pixelRatio * this.minimapWidth);
		this.canvasInnerHeight = Math.floor(pixelRatio * this.minimapHeight);

		this.canvasOuterWidth = this.canvasInnerWidth / pixelRatio;
		this.canvasOuterHeight = this.canvasInnerHeight / pixelRatio;
	}

	public equals(other: MinimapOptions): boolean {
		return (this.renderMinimap === other.renderMinimap
			&& this.minimapWidth === other.minimapWidth
			&& this.minimapHeight === other.minimapHeight
			&& this.canvasInnerWidth === other.canvasInnerWidth
			&& this.canvasInnerHeight === other.canvasInnerHeight
			&& this.canvasOuterWidth === other.canvasOuterWidth
			&& this.canvasOuterHeight === other.canvasOuterHeight
		);
	}
}

export class Minimap extends ViewPart {

	private readonly _domNode: FastDomNode;
	private readonly _canvas: FastDomNode;
	private readonly _tokensColorTracker: MinimapTokensColorTracker;
	private readonly _tokensColorTrackerListener: IDisposable;

	private _options: MinimapOptions;
	private _backgroundFillData: Uint8ClampedArray;

	constructor(context: ViewContext) {
		super(context);

		this._options = new MinimapOptions(this._context.configuration);
		this._backgroundFillData = null;

		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setPosition('absolute');
		this._domNode.setRight(0);

		this._canvas = createFastDomNode(document.createElement('canvas'));
		this._canvas.setPosition('absolute');
		this._canvas.setLeft(0);

		this._domNode.domNode.appendChild(this._canvas.domNode);

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
		(<HTMLCanvasElement>this._canvas.domNode).width = this._options.canvasInnerWidth; // TODO@minimap
		(<HTMLCanvasElement>this._canvas.domNode).height = this._options.canvasInnerHeight; // TODO@minimap
		this._backgroundFillData = null;
	}

	private _getBackgroundFillData(): Uint8ClampedArray {
		if (this._backgroundFillData === null) {
			const WIDTH = this._options.canvasInnerWidth;
			const HEIGHT = this._options.canvasInnerHeight;

			const background = this._tokensColorTracker.getColorMaps().getColor(ColorId.DefaultBackground);
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
		return true;
	}

	// ---- end view event handlers

	// public addWidget(widget: IOverlayWidget): void {
	// 	this._widgets[widget.getId()] = {
	// 		widget: widget,
	// 		preference: null
	// 	};

	// 	// This is sync because a widget wants to be in the dom
	// 	let domNode = widget.getDomNode();
	// 	domNode.style.position = 'absolute';
	// 	domNode.setAttribute('widgetId', widget.getId());
	// 	this.domNode.appendChild(domNode);

	// 	this.setShouldRender();
	// }

	// public setWidgetPosition(widget: IOverlayWidget, preference: OverlayWidgetPositionPreference): boolean {
	// 	let widgetData = this._widgets[widget.getId()];
	// 	if (widgetData.preference === preference) {
	// 		return false;
	// 	}

	// 	widgetData.preference = preference;
	// 	this.setShouldRender();

	// 	return true;
	// }

	// public removeWidget(widget: IOverlayWidget): void {
	// 	let widgetId = widget.getId();
	// 	if (this._widgets.hasOwnProperty(widgetId)) {
	// 		let widgetData = this._widgets[widgetId];
	// 		let domNode = widgetData.widget.getDomNode();
	// 		delete this._widgets[widgetId];

	// 		domNode.parentNode.removeChild(domNode);
	// 		this.setShouldRender();
	// 	}
	// }

	// private _renderWidget(widgetData: IWidgetData): void {
	// 	let _RESTORE_STYLE_TOP = 'data-editor-restoreStyleTop';
	// 	let domNode = widgetData.widget.getDomNode();

	// 	if (widgetData.preference === null) {
	// 		if (domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
	// 			let previousTop = domNode.getAttribute(_RESTORE_STYLE_TOP);
	// 			domNode.removeAttribute(_RESTORE_STYLE_TOP);
	// 			domNode.style.top = previousTop;
	// 		}
	// 		return;
	// 	}

	// 	if (widgetData.preference === OverlayWidgetPositionPreference.TOP_RIGHT_CORNER) {
	// 		if (!domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
	// 			domNode.setAttribute(_RESTORE_STYLE_TOP, domNode.style.top);
	// 		}
	// 		StyleMutator.setTop(domNode, 0);
	// 		StyleMutator.setRight(domNode, (2 * this._verticalScrollbarWidth));
	// 	} else if (widgetData.preference === OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER) {
	// 		if (!domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
	// 			domNode.setAttribute(_RESTORE_STYLE_TOP, domNode.style.top);
	// 		}
	// 		let widgetHeight = domNode.clientHeight;
	// 		StyleMutator.setTop(domNode, (this._editorHeight - widgetHeight - 2 * this._horizontalScrollbarHeight));
	// 		StyleMutator.setRight(domNode, (2 * this._verticalScrollbarWidth));
	// 	} else if (widgetData.preference === OverlayWidgetPositionPreference.TOP_CENTER) {
	// 		if (!domNode.hasAttribute(_RESTORE_STYLE_TOP)) {
	// 			domNode.setAttribute(_RESTORE_STYLE_TOP, domNode.style.top);
	// 		}
	// 		StyleMutator.setTop(domNode, 0);
	// 		domNode.style.right = '50%';
	// 	}
	// }

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
		const ctx = (<HTMLCanvasElement>this._canvas.domNode).getContext('2d'); // TODO@minimap

		// Prepare image data (fill with background color)
		let imageData = ctx.createImageData(WIDTH, HEIGHT);
		imageData.data.set(this._getBackgroundFillData());



		// let pixelRatio = browser.getPixelRatio();
		// console.log(`pixelRatio: ${pixelRatio}, devicePixelRatio: ${devicePixelRatio}`);//here: ' + pixelRatio);
		// const WIDTH = pixelRatio * this._minimapWidth;
		// const HEIGHT = pixelRatio * this._minimapHeight;
		// this.domNode.width = WIDTH;
		// this.domNode.height = HEIGHT;

		// this.domNode.style.background = '#000';

		// let lineCount = Math.floor(HEIGHT / 4);

		// let data = this._context.model.getMinimapLineRenderingData(2);

		// const lineLen = (this._viewportColumn - 1);

		// let linePixelData = new Uint8ClampedArray(
		// 	8 * 4 * lineLen
		// );

		// let start = performance.now();
		// console.profile();

		// let ctx2 = this.domNode.getContext('2d');
		// ctx2.fillStyle='#ffffff';
		// ctx2.fillRect(0, 0, WIDTH, HEIGHT);
		// let imageData = ctx2.createImageData(lineLen * 2, 4 * lineCount);

		// let colorTracker = MinimapTokensColorTracker.getInstance();
		let colors = this._tokensColorTracker.getColorMaps();

		let background = colors.getColor(ColorId.DefaultBackground);
		// // getBackgroundColor();
		// let backgroundR = background.r;
		// let backgroundG = background.g;
		// let backgroundB = background.b;
		// // set up the background
		// let offset = 0;
		// for (let i = 0; i < HEIGHT; i++) {
		// 	for (let j = 0; j < WIDTH; j++) {
		// 		imageData.data[offset] = backgroundR;
		// 		imageData.data[offset + 1] = backgroundG;
		// 		imageData.data[offset + 2] = backgroundB;
		// 		imageData.data[offset + 3] = 255;
		// 		offset += 4;
		// 	}
		// }

		const charHeight = (renderMinimap === RenderMinimap.Large ? Constants.x2_CHAR_HEIGHT : Constants.x1_CHAR_HEIGHT);
		const lineCount = Math.floor(HEIGHT / charHeight);

		// let lineCount = Math.floor((renderMinimap === RenderMinimap.Large ? (HEIGHT / Constants.x2_CHAR_HEIGHT))
		let data: MinimapLineRenderingData[] = [];
		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			data[lineIndex] = this._context.model.getMinimapLineRenderingData(lineIndex + 1);
		}

		let start2 = performance.now();
		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			let dy = lineIndex * Constants.x2_CHAR_HEIGHT;
			Minimap._x2RenderLine(imageData, background, colors, dy, data[lineIndex]);
		}
		let end2 = performance.now();
		console.log(`INNER LOOP TOOK ${end2 - start2} ms.`);

		// console.log(imageData.data);
		// ctx2.strokeStyle = '#000';
		// for (i = 0; i <)
		// ctx2.fillRect(0, 0, this._minimapWidth, this._minimapHeight);
		ctx.putImageData(imageData, 0, 0);

		// console.profileEnd();

		// let end = performance.now();
		// console.log('TOOK ' + (end - start) + 'ms.');

		// let data = this._context.model.getViewLineRenderingData(null, 1);

		// console.log(data);
		// let dest =
		// StyleMutator.setWidth(this.domNode, this._editorWidth);

		// let keys = Object.keys(this._widgets);
		// for (let i = 0, len = keys.length; i < len; i++) {
		// 	let widgetId = keys[i];
		// 	this._renderWidget(this._widgets[widgetId]);
		// }
	}

	private static _x2RenderLine(target: ImageData, backgroundColor: ParsedColor, colors: MinimapColors, dy: number, lineData: MinimapLineRenderingData) {
		const content = lineData.content;
		const tokens = lineData.tokens;
		const tabSize = lineData.tabSize;
		const maxDx = target.width - Constants.x2_CHAR_WIDTH;

		let dx = 0;
		let charIndex = 0;
		let tabsCharDelta = 0;

		for (let tokenIndex = 0, tokensLen = tokens.length; tokenIndex < tokensLen; tokenIndex++) {
			const token = tokens[tokenIndex];
			const tokenEndIndex = token.endIndex;
			const tokenColorId = token.getForeground();
			const tokenColor = colors.getColor(tokenColorId);

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
					dx += insertSpacesCount * Constants.x2_CHAR_WIDTH;
				} else if (charCode === CharCode.Space) {
					// No need to render anything since space is invisible
					dx += Constants.x2_CHAR_WIDTH;
				} else {
					charRenderer2.x2RenderChar(target, dx, dy, charCode, tokenColor, backgroundColor);
					dx += Constants.x2_CHAR_WIDTH;
				}
			}
		}
	}
}
