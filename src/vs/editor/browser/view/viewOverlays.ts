/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import {IConfigurationChangedEvent, IEditorLayoutInfo, IModelDecoration, IScrollEvent} from 'vs/editor/common/editorCommon';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import {IVisibleLineData, ViewLayer} from 'vs/editor/browser/view/viewLayer';

export class ViewOverlays extends ViewLayer {
	private _dynamicOverlays:editorBrowser.IDynamicViewOverlay[];

	_layoutProvider:editorBrowser.ILayoutProvider;

	constructor(context:editorBrowser.IViewContext, layoutProvider:editorBrowser.ILayoutProvider) {
		super(context);

		this._layoutProvider = layoutProvider;
		this._dynamicOverlays = [];

		this.domNode.className = 'view-overlays';

	}

	public dispose(): void {
		super.dispose();
		this._layoutProvider = null;

		for(var i = 0; i < this._dynamicOverlays.length; i++) {
			this._dynamicOverlays[i].dispose();
		}
		this._dynamicOverlays = null;
	}

	public getDomNode(): HTMLElement {
		return this.domNode;
	}

	public addDynamicOverlay(overlay:editorBrowser.IDynamicViewOverlay): void {
		this._dynamicOverlays.push(overlay);
	}

	// ----- event handlers

	public onViewFocusChanged(isFocused:boolean): boolean {
		this._requestModificationFrame(() => {
			dom.toggleClass(this.domNode, 'focused', isFocused);
		});
		return false;
	}

	// ----- end event handlers

	_createLine(): IVisibleLineData {
		var r = new ViewOverlayLine(this._context, this._dynamicOverlays);
		return r;
	}


	public onReadAfterForcedLayout(ctx:editorBrowser.IRenderingContext): void {
		// Overwriting to bypass `shouldRender` flag
		for (var i = 0; i < this._dynamicOverlays.length; i++) {
			this._dynamicOverlays[i].shouldCallRender2(ctx);
		}

		this._requestModificationFrame(() => {
			this._viewOverlaysRender(ctx);
		});

		return null;
	}

	_viewOverlaysRender(ctx:editorBrowser.IRestrictedRenderingContext): void {
		super._renderLines(ctx.linesViewportData);
	}

	public onWriteAfterForcedLayout(): void {
		// Overwriting to bypass `shouldRender` flag
		this._executeModificationRunners();
	}
}

class ViewOverlayLine implements IVisibleLineData {

	private _context:editorBrowser.IViewContext;
	private _dynamicOverlays:editorBrowser.IDynamicViewOverlay[];
	private _domNode: HTMLElement;
	private _renderPieces: string[];

	constructor(context:editorBrowser.IViewContext, dynamicOverlays:editorBrowser.IDynamicViewOverlay[]) {
		this._context = context;
		this._dynamicOverlays = dynamicOverlays;

		this._domNode = null;
		this._renderPieces = null;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}
	public setDomNode(domNode:HTMLElement): void {
		this._domNode = domNode;
	}

	onContentChanged(): void {
		// Nothing
	}
	onLinesInsertedAbove(): void {
		// Nothing
	}
	onLinesDeletedAbove(): void {
		// Nothing
	}
	onLineChangedAbove(): void {
		// Nothing
	}
	onTokensChanged(): void {
		// Nothing
	}
	onConfigurationChanged(e:IConfigurationChangedEvent): void {
		// Nothing
	}

	private _piecesEqual(newPieces: string[]): boolean {
		if (!this._renderPieces || this._renderPieces.length !== newPieces.length) {
			return false;
		}
		for (var i = 0, len = newPieces.length; i < len; i++) {
			if (this._renderPieces[i] !== newPieces[i]) {
				return false;
			}
		}
		return true;
	}

	shouldUpdateHTML(lineNumber:number, inlineDecorations:IModelDecoration[]): boolean {
		var newPieces: string[] = [];
		for (var i = 0; i < this._dynamicOverlays.length; i++) {
			var pieces = this._dynamicOverlays[i].render2(lineNumber);
			if (pieces && pieces.length > 0) {
				newPieces = newPieces.concat(pieces);
			}
		}

		var piecesEqual = this._piecesEqual(newPieces);
		if (!piecesEqual) {
			this._renderPieces = newPieces;
		}

		return !piecesEqual;
	}

	getLineOuterHTML(out:string[], lineNumber:number, deltaTop:number): void {
		out.push('<div lineNumber="');
		out.push(lineNumber.toString());
		out.push('" style="top:');
		out.push(deltaTop.toString());
		out.push('px;height:');
		out.push(this._context.configuration.editor.lineHeight.toString());
		out.push('px;" class="');
		out.push(editorBrowser.ClassNames.VIEW_LINE);
		out.push('">');
		out.push(this.getLineInnerHTML(lineNumber));
		out.push('</div>');
	}

	getLineInnerHTML(lineNumber: number): string {
		return this._renderPieces.join('');
	}

	layoutLine(lineNumber: number, deltaTop:number): void {
		var currentLineNumber = this._domNode.getAttribute('lineNumber');
		if (currentLineNumber !== lineNumber.toString()) {
			this._domNode.setAttribute('lineNumber', lineNumber.toString());
		}
		StyleMutator.setTop(this._domNode, deltaTop);
		StyleMutator.setHeight(this._domNode, this._context.configuration.editor.lineHeight);
	}
}

export class ContentViewOverlays extends ViewOverlays {

	constructor(context:editorBrowser.IViewContext, layoutProvider:editorBrowser.ILayoutProvider) {
		super(context, layoutProvider);

		StyleMutator.setWidth(this.domNode, 0);
		StyleMutator.setHeight(this.domNode, 0);
	}

	public onScrollWidthChanged(scrollWidth:number): boolean {
		return true;
	}

	_viewOverlaysRender(ctx:editorBrowser.IRestrictedRenderingContext): void {
		super._viewOverlaysRender(ctx);

		StyleMutator.setWidth(this.domNode, this._layoutProvider.getScrollWidth());
	}
}

export class MarginViewOverlays extends ViewOverlays {

	private _glyphMarginLeft:number;
	private _glyphMarginWidth:number;
	private _scrollHeight:number;

	constructor(context:editorBrowser.IViewContext, layoutProvider:editorBrowser.ILayoutProvider) {
		super(context, layoutProvider);

		this._glyphMarginLeft = 0;
		this._glyphMarginWidth = 0;
		this._scrollHeight = layoutProvider.getScrollHeight();

		this.domNode.className = editorBrowser.ClassNames.MARGIN_VIEW_OVERLAYS + ' monaco-editor-background';
		StyleMutator.setWidth(this.domNode, 1);
		this._hasVerticalScroll = true;
	}

	protected _extraDomNodeHTML(): string {
		return [
			'<div class="',
			editorBrowser.ClassNames.GLYPH_MARGIN,
			'" style="left:',
			String(this._glyphMarginLeft),
			'px;width:',
			String(this._glyphMarginWidth),
			'px;height:',
			String(this._scrollHeight),
			'px;"></div>'
		].join('');
	}

	private _getGlyphMarginDomNode(): HTMLElement {
		return <HTMLElement>this.domNode.children[0];
	}

	public onScrollHeightChanged(scrollHeight:number): boolean {
		this._scrollHeight = scrollHeight;
		this._requestModificationFrame(() => {
			var glyphMargin = this._getGlyphMarginDomNode();
			if (glyphMargin) {
				StyleMutator.setHeight(glyphMargin, this._scrollHeight);
			}
		});
		return super.onScrollHeightChanged(scrollHeight) || true;
	}

	public onLayoutChanged(layoutInfo:IEditorLayoutInfo): boolean {
		this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
		this._scrollHeight = this._layoutProvider.getScrollHeight();

		this._requestModificationFrame(() => {
			StyleMutator.setWidth(this.domNode, layoutInfo.contentLeft);

			var glyphMargin = this._getGlyphMarginDomNode();
			if (glyphMargin) {
				StyleMutator.setLeft(glyphMargin, layoutInfo.glyphMarginLeft);
				StyleMutator.setWidth(glyphMargin, layoutInfo.glyphMarginWidth);
			}
		});
		return super.onLayoutChanged(layoutInfo) || true;
	}

	private _hasVerticalScroll = false;
	public onScrollChanged(e:IScrollEvent): boolean {
		this._hasVerticalScroll = this._hasVerticalScroll || e.vertical;
		return super.onScrollChanged(e);
	}

	_viewOverlaysRender(ctx:editorBrowser.IRestrictedRenderingContext): void {
		super._viewOverlaysRender(ctx);
		if (this._hasVerticalScroll) {
			if (browser.canUseTranslate3d) {
				var transform = 'translate3d(0px, ' + ctx.linesViewportData.visibleRangesDeltaTop + 'px, 0px)';
				StyleMutator.setTransform(this.domNode, transform);
			} else {
				if (this._hasVerticalScroll) {
					StyleMutator.setTop(this.domNode, ctx.linesViewportData.visibleRangesDeltaTop);
				}
			}
			this._hasVerticalScroll = false;
		}
		var height = Math.min(this._layoutProvider.getTotalHeight(), 1000000);
		StyleMutator.setHeight(this.domNode, height);
	}
}