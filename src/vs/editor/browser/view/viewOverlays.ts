/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Browser = require('vs/base/browser/browser');
import DomUtils = require('vs/base/browser/dom');
import Lifecycle = require('vs/base/common/lifecycle');

import {ViewLayer, IVisibleLineData} from 'vs/editor/browser/view/viewLayer';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

export class ViewOverlays extends ViewLayer {
	private _dynamicOverlays:EditorBrowser.IDynamicViewOverlay[];

	_layoutProvider:EditorBrowser.ILayoutProvider;

	constructor(context:EditorBrowser.IViewContext, layoutProvider:EditorBrowser.ILayoutProvider) {
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

	public addDynamicOverlay(overlay:EditorBrowser.IDynamicViewOverlay): void {
		this._dynamicOverlays.push(overlay);
	}

	// ----- event handlers

	public onViewFocusChanged(isFocused:boolean): boolean {
		this._requestModificationFrame(() => {
			DomUtils.toggleClass(this.domNode, 'focused', isFocused);
		});
		return false;
	}

	// ----- end event handlers

	_createLine(): IVisibleLineData {
		var r = new ViewOverlayLine(this._context, this._dynamicOverlays);
		return r;
	}


	public onReadAfterForcedLayout(ctx:EditorBrowser.IRenderingContext): void {
		// Overwriting to bypass `shouldRender` flag
		for (var i = 0; i < this._dynamicOverlays.length; i++) {
			this._dynamicOverlays[i].shouldCallRender2(ctx);
		}

		this._requestModificationFrame(() => {
			this._viewOverlaysRender(ctx);
		});

		return null;
	}

	_viewOverlaysRender(ctx:EditorBrowser.IRestrictedRenderingContext): void {
		super._renderLines(ctx.linesViewportData);
	}

	public onWriteAfterForcedLayout(): void {
		// Overwriting to bypass `shouldRender` flag
		this._executeModificationRunners();
	}
}

class ViewOverlayLine implements IVisibleLineData {

	private _context:EditorBrowser.IViewContext;
	private _dynamicOverlays:EditorBrowser.IDynamicViewOverlay[];
	private _domNode: HTMLElement;
	private _renderPieces: string[];

	constructor(context:EditorBrowser.IViewContext, dynamicOverlays:EditorBrowser.IDynamicViewOverlay[]) {
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
	onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): void {
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

	shouldUpdateHTML(lineNumber:number, inlineDecorations:EditorCommon.IModelDecoration[]): boolean {
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
		out.push(EditorBrowser.ClassNames.VIEW_LINE);
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
		DomUtils.StyleMutator.setTop(this._domNode, deltaTop);
		DomUtils.StyleMutator.setHeight(this._domNode, this._context.configuration.editor.lineHeight);
	}
}

export class ContentViewOverlays extends ViewOverlays {

	constructor(context:EditorBrowser.IViewContext, layoutProvider:EditorBrowser.ILayoutProvider) {
		super(context, layoutProvider);

		DomUtils.StyleMutator.setWidth(this.domNode, 0);
		DomUtils.StyleMutator.setHeight(this.domNode, 0);
	}

	public onScrollWidthChanged(scrollWidth:number): boolean {
		return true;
	}

	_viewOverlaysRender(ctx:EditorBrowser.IRestrictedRenderingContext): void {
		super._viewOverlaysRender(ctx);

		DomUtils.StyleMutator.setWidth(this.domNode, this._layoutProvider.getScrollWidth());
	}
}

export class MarginViewOverlays extends ViewOverlays {

	private _glyphMarginLeft:number;
	private _glyphMarginWidth:number;
	private _scrollHeight:number;

	constructor(context:EditorBrowser.IViewContext, layoutProvider:EditorBrowser.ILayoutProvider) {
		super(context, layoutProvider);

		this._glyphMarginLeft = 0;
		this._glyphMarginWidth = 0;
		this._scrollHeight = layoutProvider.getScrollHeight();

		this.domNode.className = EditorBrowser.ClassNames.MARGIN_VIEW_OVERLAYS + ' monaco-editor-background';
		DomUtils.StyleMutator.setWidth(this.domNode, 1);
		this._hasVerticalScroll = true;
	}

	protected _extraDomNodeHTML(): string {
		return [
			'<div class="',
			EditorBrowser.ClassNames.GLYPH_MARGIN,
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
				DomUtils.StyleMutator.setHeight(glyphMargin, this._scrollHeight);
			}
		});
		return super.onScrollHeightChanged(scrollHeight) || true;
	}

	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
		this._scrollHeight = this._layoutProvider.getScrollHeight();

		this._requestModificationFrame(() => {
			DomUtils.StyleMutator.setWidth(this.domNode, layoutInfo.contentLeft);

			var glyphMargin = this._getGlyphMarginDomNode();
			if (glyphMargin) {
				DomUtils.StyleMutator.setLeft(glyphMargin, layoutInfo.glyphMarginLeft);
				DomUtils.StyleMutator.setWidth(glyphMargin, layoutInfo.glyphMarginWidth);
			}
		});
		return super.onLayoutChanged(layoutInfo) || true;
	}

	private _hasVerticalScroll = false;
	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		this._hasVerticalScroll = this._hasVerticalScroll || e.vertical;
		return super.onScrollChanged(e);
	}

	_viewOverlaysRender(ctx:EditorBrowser.IRestrictedRenderingContext): void {
		super._viewOverlaysRender(ctx);
		if (this._hasVerticalScroll) {
			if (Browser.canUseTranslate3d) {
				var transform = 'translate3d(0px, ' + ctx.linesViewportData.visibleRangesDeltaTop + 'px, 0px)';
				DomUtils.StyleMutator.setTransform(this.domNode, transform);
			} else {
				if (this._hasVerticalScroll) {
					DomUtils.StyleMutator.setTop(this.domNode, ctx.linesViewportData.visibleRangesDeltaTop);
				}
			}
			this._hasVerticalScroll = false;
		}
		var height = Math.min(this._layoutProvider.getTotalHeight(), 1000000);
		DomUtils.StyleMutator.setHeight(this.domNode, height);
	}
}