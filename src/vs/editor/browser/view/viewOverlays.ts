/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode, createFastDomNode } from '../../../base/browser/fastDomNode.js';
import { applyFontInfo } from '../config/domFontInfo.js';
import { DynamicViewOverlay } from './dynamicViewOverlay.js';
import { IVisibleLine, VisibleLinesCollection } from './viewLayer.js';
import { ViewPart } from './viewPart.js';
import { StringBuilder } from '../../common/core/stringBuilder.js';
import { RenderingContext, RestrictedRenderingContext } from './renderingContext.js';
import { ViewContext } from '../../common/viewModel/viewContext.js';
import * as viewEvents from '../../common/viewEvents.js';
import { ViewportData } from '../../common/viewLayout/viewLinesViewportData.js';
import { EditorOption } from '../../common/config/editorOptions.js';

export class ViewOverlays extends ViewPart {
	private readonly _visibleLines: VisibleLinesCollection<ViewOverlayLine>;
	protected readonly domNode: FastDomNode<HTMLElement>;
	private _dynamicOverlays: DynamicViewOverlay[] = [];
	private _isFocused: boolean = false;

	constructor(context: ViewContext) {
		super(context);

		this._visibleLines = new VisibleLinesCollection(this._context, {
			createLine: () => new ViewOverlayLine(this._dynamicOverlays)
		});
		this.domNode = this._visibleLines.domNode;

		const options = this._context.configuration.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		applyFontInfo(this.domNode, fontInfo);

		this.domNode.setClassName('view-overlays');
	}

	public override shouldRender(): boolean {
		if (super.shouldRender()) {
			return true;
		}

		for (let i = 0, len = this._dynamicOverlays.length; i < len; i++) {
			const dynamicOverlay = this._dynamicOverlays[i];
			if (dynamicOverlay.shouldRender()) {
				return true;
			}
		}

		return false;
	}

	public override dispose(): void {
		super.dispose();

		for (let i = 0, len = this._dynamicOverlays.length; i < len; i++) {
			const dynamicOverlay = this._dynamicOverlays[i];
			dynamicOverlay.dispose();
		}
		this._dynamicOverlays = [];
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this.domNode;
	}

	public addDynamicOverlay(overlay: DynamicViewOverlay): void {
		this._dynamicOverlays.push(overlay);
	}

	// ----- event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		this._visibleLines.onConfigurationChanged(e);

		const options = this._context.configuration.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		applyFontInfo(this.domNode, fontInfo);

		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return this._visibleLines.onFlushed(e);
	}
	public override onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
		this._isFocused = e.isFocused;
		return true;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return this._visibleLines.onLinesChanged(e);
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return this._visibleLines.onLinesDeleted(e);
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return this._visibleLines.onLinesInserted(e);
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return this._visibleLines.onScrollChanged(e) || true;
	}
	public override onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		return this._visibleLines.onTokensChanged(e);
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return this._visibleLines.onZonesChanged(e);
	}

	// ----- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		const toRender = this._dynamicOverlays.filter(overlay => overlay.shouldRender());

		for (let i = 0, len = toRender.length; i < len; i++) {
			const dynamicOverlay = toRender[i];
			dynamicOverlay.prepareRender(ctx);
			dynamicOverlay.onDidRender();
		}
	}

	public render(ctx: RestrictedRenderingContext): void {
		// Overwriting to bypass `shouldRender` flag
		this._viewOverlaysRender(ctx);

		this.domNode.toggleClassName('focused', this._isFocused);
	}

	_viewOverlaysRender(ctx: RestrictedRenderingContext): void {
		this._visibleLines.renderLines(ctx.viewportData);
	}
}

export class ViewOverlayLine implements IVisibleLine {

	private readonly _dynamicOverlays: DynamicViewOverlay[];
	private _domNode: FastDomNode<HTMLElement> | null;
	private _renderedContent: string | null;

	constructor(dynamicOverlays: DynamicViewOverlay[]) {
		this._dynamicOverlays = dynamicOverlays;

		this._domNode = null;
		this._renderedContent = null;
	}

	public getDomNode(): HTMLElement | null {
		if (!this._domNode) {
			return null;
		}
		return this._domNode.domNode;
	}
	public setDomNode(domNode: HTMLElement): void {
		this._domNode = createFastDomNode(domNode);
	}

	public onContentChanged(): void {
		// Nothing
	}
	public onTokensChanged(): void {
		// Nothing
	}

	public renderLine(lineNumber: number, deltaTop: number, lineHeight: number, viewportData: ViewportData, sb: StringBuilder): boolean {
		let result = '';
		for (let i = 0, len = this._dynamicOverlays.length; i < len; i++) {
			const dynamicOverlay = this._dynamicOverlays[i];
			result += dynamicOverlay.render(viewportData.startLineNumber, lineNumber);
		}

		if (this._renderedContent === result) {
			// No rendering needed
			return false;
		}

		this._renderedContent = result;

		sb.appendString('<div style="top:');
		sb.appendString(String(deltaTop));
		sb.appendString('px;height:');
		sb.appendString(String(lineHeight));
		sb.appendString('px;line-height:');
		sb.appendString(String(lineHeight));
		sb.appendString('px;">');
		sb.appendString(result);
		sb.appendString('</div>');

		return true;
	}

	public layoutLine(lineNumber: number, deltaTop: number, lineHeight: number): void {
		if (this._domNode) {
			this._domNode.setTop(deltaTop);
			this._domNode.setHeight(lineHeight);
			this._domNode.setLineHeight(lineHeight);
		}
	}
}

export class ContentViewOverlays extends ViewOverlays {

	private _contentWidth: number;

	constructor(context: ViewContext) {
		super(context);
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentWidth = layoutInfo.contentWidth;

		this.domNode.setHeight(0);
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentWidth = layoutInfo.contentWidth;
		return super.onConfigurationChanged(e) || true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return super.onScrollChanged(e) || e.scrollWidthChanged;
	}

	// --- end event handlers

	override _viewOverlaysRender(ctx: RestrictedRenderingContext): void {
		super._viewOverlaysRender(ctx);

		this.domNode.setWidth(Math.max(ctx.scrollWidth, this._contentWidth));
	}
}

export class MarginViewOverlays extends ViewOverlays {

	private _contentLeft: number;

	constructor(context: ViewContext) {
		super(context);

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;

		this.domNode.setClassName('margin-view-overlays');
		this.domNode.setWidth(1);

		applyFontInfo(this.domNode, options.get(EditorOption.fontInfo));
	}

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		applyFontInfo(this.domNode, options.get(EditorOption.fontInfo));
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;
		return super.onConfigurationChanged(e) || true;
	}

	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return super.onScrollChanged(e) || e.scrollHeightChanged;
	}

	override _viewOverlaysRender(ctx: RestrictedRenderingContext): void {
		super._viewOverlaysRender(ctx);
		const height = Math.min(ctx.scrollHeight, 1000000);
		this.domNode.setHeight(height);
		this.domNode.setWidth(this._contentLeft);
	}
}
