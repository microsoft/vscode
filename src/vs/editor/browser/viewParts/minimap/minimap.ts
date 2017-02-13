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
import { MinimapColors, MinimapTokensColorTracker, Constants } from 'vs/editor/common/view/minimapCharRenderer';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CharCode } from 'vs/base/common/charCode';
import { MinimapLineRenderingData } from 'vs/editor/common/viewModel/viewModel';

// let charRenderer = createMinimapCharRenderer();
let charRenderer2 = createMinimapCharRenderer2();

// interface IWidgetData {
// 	widget: IOverlayWidget;
// 	preference: OverlayWidgetPositionPreference;
// }

// interface IWidgetMap {
// 	[key: string]: IWidgetData;
// }

export class Minimap extends ViewPart {

	// private _widgets: IWidgetMap;
	public domNode: HTMLCanvasElement;

	// private _verticalScrollbarWidth: number;
	// private _horizontalScrollbarHeight: number;
	// private _editorHeight: number;
	// private _editorWidth: number;
	private _minimapWidth: number;
	private _minimapHeight: number;
	private _viewportColumn: number;

	constructor(context: ViewContext) {
		super(context);

		// this._widgets = {};
		// this._verticalScrollbarWidth = 0;
		// this._horizontalScrollbarHeight = 0;
		// this._editorHeight = 0;
		// this._editorWidth = 0;

		this._minimapWidth = this._context.configuration.editor.layoutInfo.minimapWidth;
		this._minimapHeight = this._context.configuration.editor.layoutInfo.height;
		this._viewportColumn = this._context.configuration.editor.layoutInfo.viewportColumn;

		this.domNode = document.createElement('canvas');
		this.domNode.style.position = 'absolute';
		this.domNode.style.right = '0';
		this.domNode.style.width = `${this._minimapWidth}px`;
		this.domNode.style.height = `${this._minimapHeight}px`;
		// PartFingerprints.write(this.domNode, PartFingerprint.OverlayWidgets);
		// this.domNode.className = ClassNames.OVERLAY_WIDGETS;
	}

	public dispose(): void {
		super.dispose();
		// this._widgets = null;
	}

	// ---- begin view event handlers

	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		this._minimapWidth = this._context.configuration.editor.layoutInfo.minimapWidth;
		this._minimapHeight = this._context.configuration.editor.layoutInfo.height;
		this._viewportColumn = this._context.configuration.editor.layoutInfo.viewportColumn;
		this.domNode.style.width = `${this._minimapWidth}px`;
		this.domNode.width = this._minimapWidth;
		this.domNode.style.height = `${this._minimapHeight}px`;
		this.domNode.height = this._minimapHeight;

		// this._verticalScrollbarWidth = layoutInfo.verticalScrollbarWidth;
		// this._horizontalScrollbarHeight = layoutInfo.horizontalScrollbarHeight;
		// this._editorHeight = layoutInfo.height;
		// this._editorWidth = layoutInfo.width;
		return true;
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

	public render(ctx: IRestrictedRenderingContext): void {
		let pixelRatio = browser.getPixelRatio();
		console.log(pixelRatio);
		const WIDTH = pixelRatio * this._minimapWidth;
		const HEIGHT = pixelRatio * this._minimapHeight;
		this.domNode.width = WIDTH;
		this.domNode.height = HEIGHT;

		this.domNode.style.background = '#000';

		let lineCount = Math.floor(HEIGHT / 4);

		// let data = this._context.model.getMinimapLineRenderingData(2);

		const lineLen = (this._viewportColumn - 1);

		// let linePixelData = new Uint8ClampedArray(
		// 	8 * 4 * lineLen
		// );

		let start = performance.now();
		// console.profile();

		let ctx2 = this.domNode.getContext('2d');
		// ctx2.fillStyle='#ffffff';
		// ctx2.fillRect(0, 0, WIDTH, HEIGHT);
		let imageData = ctx2.createImageData(lineLen * 2, 4 * lineCount);

		let colorTracker = MinimapTokensColorTracker.getInstance();
		let colors = colorTracker.getColorMaps();

		let background = colors.getBackgroundColor();
		let backgroundR = background.r;
		let backgroundG = background.g;
		let backgroundB = background.b;
		// set up the background
		let offset = 0;
		for (let i = 0; i < HEIGHT; i++) {
			for (let j = 0; j < WIDTH; j++) {
				imageData.data[offset] = backgroundR;
				imageData.data[offset + 1] = backgroundG;
				imageData.data[offset + 2] = backgroundB;
				imageData.data[offset + 3] = 255;
				offset += 4;
			}
		}

		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			let data = this._context.model.getMinimapLineRenderingData(lineIndex + 1);
			// let length = Math.min(data.content.length, lineLen);

			let dy = lineIndex * Constants.x2_CHAR_HEIGHT;

			Minimap._render2xLine(imageData, colors, dy, this._viewportColumn, data);


			// break;
		}

		// console.log(imageData.data);
		// ctx2.strokeStyle = '#000';
		// for (i = 0; i <)
		// ctx2.fillRect(0, 0, this._minimapWidth, this._minimapHeight);
		ctx2.putImageData(imageData, 0, 0);

		// console.profileEnd();

		let end = performance.now();


		console.log('TOOK ' + (end - start) + 'ms.');

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

	private static _render2xLine(target: ImageData, colors: MinimapColors, dy: number, maxColumn: number, lineData: MinimapLineRenderingData) {
		const content = lineData.content;
		const tokens = lineData.tokens;
		const tabSize = lineData.tabSize;
		const charIndexStop = Math.min(content.length, maxColumn - 1);

		let dx = 0;
		let charIndex = 0;
		let tabsCharDelta = 0;

		for (let tokenIndex = 0, tokensLen = tokens.length; tokenIndex < tokensLen; tokenIndex++) {
			const token = tokens[tokenIndex];
			const tokenEndIndex = token.endIndex;
			const tokenColorId = token.getForeground();
			const tokenColor = colors.getMinimapColor(tokenColorId);

			for (; charIndex < tokenEndIndex; charIndex++) {
				if (charIndex >= charIndexStop) {
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
					charRenderer2.x2RenderChar(target, dx, dy, charCode, tokenColor);
					dx += Constants.x2_CHAR_WIDTH;
				}
			}
		}
	}
}
