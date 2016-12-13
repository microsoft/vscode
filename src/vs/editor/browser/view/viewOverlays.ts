/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { FastDomNode, createFastDomNode } from 'vs/base/browser/styleMutator';
import { IScrollEvent, IConfigurationChangedEvent, EditorLayoutInfo } from 'vs/editor/common/editorCommon';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { IVisibleLineData, ViewLayer } from 'vs/editor/browser/view/viewLayer';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext, IRestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { ILayoutProvider } from 'vs/editor/browser/viewLayout/layoutProvider';
import { InlineDecoration } from 'vs/editor/common/viewModel/viewModel';

export class ViewOverlays extends ViewLayer<ViewOverlayLine> {

	private _dynamicOverlays: DynamicViewOverlay[];
	private _isFocused: boolean;
	_layoutProvider: ILayoutProvider;

	constructor(context: ViewContext, layoutProvider: ILayoutProvider) {
		super(context);

		this._dynamicOverlays = [];
		this._isFocused = false;
		this._layoutProvider = layoutProvider;

		this.domNode.setClassName('view-overlays');
	}

	public shouldRender(): boolean {
		if (super.shouldRender()) {
			return true;
		}

		for (let i = 0, len = this._dynamicOverlays.length; i < len; i++) {
			let dynamicOverlay = this._dynamicOverlays[i];
			if (dynamicOverlay.shouldRender()) {
				return true;
			}
		}

		return false;
	}

	public dispose(): void {
		super.dispose();
		this._layoutProvider = null;

		for (let i = 0, len = this._dynamicOverlays.length; i < len; i++) {
			let dynamicOverlay = this._dynamicOverlays[i];
			dynamicOverlay.dispose();
		}
		this._dynamicOverlays = null;
	}

	public getDomNode(): HTMLElement {
		return this.domNode.domNode;
	}

	public addDynamicOverlay(overlay: DynamicViewOverlay): void {
		this._dynamicOverlays.push(overlay);
	}

	// ----- event handlers

	public onViewFocusChanged(isFocused: boolean): boolean {
		this._isFocused = isFocused;
		return true;
	}

	// ----- end event handlers

	_createLine(): ViewOverlayLine {
		return new ViewOverlayLine(this._context, this._dynamicOverlays);
	}


	public prepareRender(ctx: IRenderingContext): void {
		let toRender = this._dynamicOverlays.filter(overlay => overlay.shouldRender());

		for (let i = 0, len = toRender.length; i < len; i++) {
			let dynamicOverlay = toRender[i];
			dynamicOverlay.prepareRender(ctx);
			dynamicOverlay.onDidRender();
		}

		return null;
	}

	public render(ctx: IRestrictedRenderingContext): void {
		// Overwriting to bypass `shouldRender` flag
		this._viewOverlaysRender(ctx);

		this.domNode.toggleClassName('focused', this._isFocused);
	}

	_viewOverlaysRender(ctx: IRestrictedRenderingContext): void {
		super._renderLines(ctx.linesViewportData);
	}
}

export class ViewOverlayLine implements IVisibleLineData {

	private _context: ViewContext;
	private _dynamicOverlays: DynamicViewOverlay[];
	private _domNode: FastDomNode;
	private _renderPieces: string;
	private _lineHeight: number;

	constructor(context: ViewContext, dynamicOverlays: DynamicViewOverlay[]) {
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._dynamicOverlays = dynamicOverlays;

		this._domNode = null;
		this._renderPieces = null;
	}

	public getDomNode(): HTMLElement {
		if (!this._domNode) {
			return null;
		}
		return this._domNode.domNode;
	}
	public setDomNode(domNode: HTMLElement): void {
		this._domNode = createFastDomNode(domNode);
	}

	onContentChanged(): void {
		// Nothing
	}
	onTokensChanged(): void {
		// Nothing
	}
	onConfigurationChanged(e: IConfigurationChangedEvent): void {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
	}

	shouldUpdateHTML(startLineNumber: number, lineNumber: number, inlineDecorations: InlineDecoration[]): boolean {
		let newPieces = '';
		for (let i = 0, len = this._dynamicOverlays.length; i < len; i++) {
			let dynamicOverlay = this._dynamicOverlays[i];
			newPieces += dynamicOverlay.render(startLineNumber, lineNumber);
		}

		let piecesEqual = (this._renderPieces === newPieces);

		if (!piecesEqual) {
			this._renderPieces = newPieces;
		}

		return !piecesEqual;
	}

	getLineOuterHTML(out: string[], lineNumber: number, deltaTop: number): void {
		out.push('<div lineNumber="');
		out.push(lineNumber.toString());
		out.push('" style="top:');
		out.push(deltaTop.toString());
		out.push('px;height:');
		out.push(this._lineHeight.toString());
		out.push('px;" class="');
		out.push(editorBrowser.ClassNames.VIEW_LINE);
		out.push('">');
		out.push(this.getLineInnerHTML(lineNumber));
		out.push('</div>');
	}

	getLineInnerHTML(lineNumber: number): string {
		return this._renderPieces;
	}

	layoutLine(lineNumber: number, deltaTop: number): void {
		this._domNode.setLineNumber(String(lineNumber));
		this._domNode.setTop(deltaTop);
		this._domNode.setHeight(this._lineHeight);
	}
}

export class ContentViewOverlays extends ViewOverlays {

	private _scrollWidth: number;
	private _contentWidth: number;

	constructor(context: ViewContext, layoutProvider: ILayoutProvider) {
		super(context, layoutProvider);

		this._scrollWidth = this._layoutProvider.getScrollWidth();
		this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;

		this.domNode.setWidth(this._scrollWidth);
		this.domNode.setHeight(0);
	}

	public onConfigurationChanged(e: IConfigurationChangedEvent): boolean {
		if (e.layoutInfo) {
			this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
		}
		return super.onConfigurationChanged(e);
	}
	public onScrollChanged(e: IScrollEvent): boolean {
		this._scrollWidth = e.scrollWidth;
		return super.onScrollChanged(e) || e.scrollWidthChanged;
	}

	_viewOverlaysRender(ctx: IRestrictedRenderingContext): void {
		super._viewOverlaysRender(ctx);

		this.domNode.setWidth(Math.max(this._scrollWidth, this._contentWidth));
	}
}

export class MarginViewOverlays extends ViewOverlays {

	private _contentLeft: number;
	private _canUseTranslate3d: boolean;

	constructor(context: ViewContext, layoutProvider: ILayoutProvider) {
		super(context, layoutProvider);

		this._contentLeft = context.configuration.editor.layoutInfo.contentLeft;
		this._canUseTranslate3d = context.configuration.editor.viewInfo.canUseTranslate3d;

		this.domNode.setClassName(editorBrowser.ClassNames.MARGIN_VIEW_OVERLAYS);
		this.domNode.setWidth(1);

		Configuration.applyFontInfo(this.domNode, this._context.configuration.editor.fontInfo);
	}

	public onScrollChanged(e: IScrollEvent): boolean {
		return super.onScrollChanged(e) || e.scrollHeightChanged;
	}

	public onLayoutChanged(layoutInfo: EditorLayoutInfo): boolean {
		this._contentLeft = layoutInfo.contentLeft;
		return super.onLayoutChanged(layoutInfo) || true;
	}

	public onConfigurationChanged(e: IConfigurationChangedEvent): boolean {
		if (e.fontInfo) {
			Configuration.applyFontInfo(this.domNode, this._context.configuration.editor.fontInfo);
		}
		if (e.viewInfo.canUseTranslate3d) {
			this._canUseTranslate3d = this._context.configuration.editor.viewInfo.canUseTranslate3d;
		}
		return super.onConfigurationChanged(e);
	}


	_viewOverlaysRender(ctx: IRestrictedRenderingContext): void {
		super._viewOverlaysRender(ctx);
		let height = Math.min(this._layoutProvider.getTotalHeight(), 1000000);
		this.domNode.setHeight(height);
		this.domNode.setWidth(this._contentLeft);
	}
}