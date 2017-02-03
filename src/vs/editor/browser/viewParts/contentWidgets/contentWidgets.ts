/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as dom from 'vs/base/browser/dom';
import { StyleMutator } from 'vs/base/browser/styleMutator';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ClassNames, ContentWidgetPositionPreference, IContentWidget } from 'vs/editor/browser/editorBrowser';
import { ViewPart, PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext, IRestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { Position } from 'vs/editor/common/core/position';

interface IWidgetData {
	allowEditorOverflow: boolean;
	widget: IContentWidget;
	position: editorCommon.IPosition;
	preference: ContentWidgetPositionPreference[];
	isVisible: boolean;
}

interface IWidgetMap {
	[key: string]: IWidgetData;
}

interface IBoxLayoutResult {
	aboveTop: number;
	fitsAbove: boolean;
	belowTop: number;
	fitsBelow: boolean;
	left: number;
}

interface IMyWidgetRenderData {
	top: number;
	left: number;
}

interface IMyRenderData {
	[id: string]: IMyWidgetRenderData;
}

export class ViewContentWidgets extends ViewPart {

	private _widgets: IWidgetMap;
	private _contentWidth: number;
	private _contentLeft: number;
	private _lineHeight: number;
	private _renderData: IMyRenderData;

	public domNode: HTMLElement;
	public overflowingContentWidgetsDomNode: HTMLElement;
	private _viewDomNode: HTMLElement;

	constructor(context: ViewContext, viewDomNode: HTMLElement) {
		super(context);
		this._viewDomNode = viewDomNode;

		this._widgets = {};
		this._contentWidth = 0;
		this._contentLeft = 0;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._renderData = {};

		this.domNode = document.createElement('div');
		PartFingerprints.write(this.domNode, PartFingerprint.ContentWidgets);
		this.domNode.className = ClassNames.CONTENT_WIDGETS;
		this.domNode.style.position = 'absolute';
		this.domNode.style.top = '0';

		this.overflowingContentWidgetsDomNode = document.createElement('div');
		PartFingerprints.write(this.overflowingContentWidgetsDomNode, PartFingerprint.OverflowingContentWidgets);
		this.overflowingContentWidgetsDomNode.className = ClassNames.OVERFLOWING_CONTENT_WIDGETS;
	}

	public dispose(): void {
		super.dispose();
		this._widgets = null;
		this.domNode = null;
	}

	// --- begin event handlers

	public onModelFlushed(): boolean {
		return true;
	}
	public onModelDecorationsChanged(e: editorCommon.IViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return true;//e.inlineDecorationsChanged;
	}
	public onModelLinesDeleted(e: editorCommon.IViewLinesDeletedEvent): boolean {
		return true;
	}
	public onModelLineChanged(e: editorCommon.IViewLineChangedEvent): boolean {
		return true;
	}
	public onModelLinesInserted(e: editorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}
	public onCursorPositionChanged(e: editorCommon.IViewCursorPositionChangedEvent): boolean {
		return false;
	}
	public onCursorSelectionChanged(e: editorCommon.IViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onCursorRevealRange(e: editorCommon.IViewRevealRangeEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		return true;
	}
	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		this._contentLeft = layoutInfo.contentLeft;

		if (this._contentWidth !== layoutInfo.contentWidth) {
			this._contentWidth = layoutInfo.contentWidth;
			// update the maxWidth on widgets nodes, such that `onReadAfterForcedLayout`
			// below can read out the adjusted width/height of widgets
			let keys = Object.keys(this._widgets);
			for (let i = 0, len = keys.length; i < len; i++) {
				const widgetId = keys[i];
				const widgetData = this._widgets[widgetId];
				const widget = widgetData.widget;
				const maxWidth = widgetData.allowEditorOverflow
					? window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth
					: this._contentWidth;

				StyleMutator.setMaxWidth(widget.getDomNode(), maxWidth);
			}
		}

		return true;
	}
	public onScrollChanged(e: editorCommon.IScrollEvent): boolean {
		return true;
	}
	public onZonesChanged(): boolean {
		return true;
	}

	// ---- end view event handlers

	public addWidget(widget: IContentWidget): void {
		let widgetData: IWidgetData = {
			allowEditorOverflow: widget.allowEditorOverflow || false,
			widget: widget,
			position: null,
			preference: null,
			isVisible: false
		};
		this._widgets[widget.getId()] = widgetData;

		let domNode = widget.getDomNode();
		domNode.style.position = (this._context.configuration.editor.viewInfo.fixedOverflowWidgets && widget.allowEditorOverflow) ? 'fixed' : 'absolute';
		StyleMutator.setMaxWidth(domNode, this._contentWidth);
		StyleMutator.setVisibility(domNode, 'hidden');
		domNode.setAttribute('widgetId', widget.getId());

		if (widgetData.allowEditorOverflow) {
			this.overflowingContentWidgetsDomNode.appendChild(domNode);
		} else {
			this.domNode.appendChild(domNode);
		}

		this.setShouldRender();
	}

	public setWidgetPosition(widget: IContentWidget, position: editorCommon.IPosition, preference: ContentWidgetPositionPreference[]): void {
		let widgetData = this._widgets[widget.getId()];

		widgetData.position = position;
		widgetData.preference = preference;

		this.setShouldRender();
	}

	public removeWidget(widget: IContentWidget): void {
		let widgetId = widget.getId();
		if (this._widgets.hasOwnProperty(widgetId)) {
			let widgetData = this._widgets[widgetId];
			delete this._widgets[widgetId];

			let domNode = widgetData.widget.getDomNode();
			domNode.parentNode.removeChild(domNode);
			domNode.removeAttribute('monaco-visible-content-widget');

			this.setShouldRender();
		}
	}

	public shouldSuppressMouseDownOnWidget(widgetId: string): boolean {
		if (this._widgets.hasOwnProperty(widgetId)) {
			let widgetData = this._widgets[widgetId];
			return widgetData.widget.suppressMouseDown;
		}
		return false;
	}

	private _layoutBoxInViewport(position: Position, domNode: HTMLElement, ctx: IRenderingContext): IBoxLayoutResult {

		let visibleRange = ctx.visibleRangeForPosition(position);

		if (!visibleRange) {
			return null;
		}

		let width = domNode.clientWidth;
		let height = domNode.clientHeight;

		// Our visible box is split horizontally by the current line => 2 boxes

		// a) the box above the line
		let aboveLineTop = visibleRange.top;
		let heightAboveLine = aboveLineTop;

		// b) the box under the line
		let underLineTop = visibleRange.top + this._lineHeight;
		let heightUnderLine = ctx.viewportHeight - underLineTop;

		let aboveTop = aboveLineTop - height;
		let fitsAbove = (heightAboveLine >= height);
		let belowTop = underLineTop;
		let fitsBelow = (heightUnderLine >= height);

		// And its left
		let actualLeft = visibleRange.left;
		if (actualLeft + width > ctx.viewportLeft + ctx.viewportWidth) {
			actualLeft = ctx.viewportLeft + ctx.viewportWidth - width;
		}
		if (actualLeft < ctx.viewportLeft) {
			actualLeft = ctx.viewportLeft;
		}

		return {
			aboveTop: aboveTop,
			fitsAbove: fitsAbove,
			belowTop: belowTop,
			fitsBelow: fitsBelow,
			left: actualLeft
		};
	}

	private _layoutBoxInPage(position: Position, domNode: HTMLElement, ctx: IRenderingContext): IBoxLayoutResult {
		let visibleRange = ctx.visibleRangeForPosition(position);

		if (!visibleRange) {
			return null;
		}

		let left0 = visibleRange.left - ctx.viewportLeft;

		let width = domNode.clientWidth,
			height = domNode.clientHeight;

		if (left0 + width < 0 || left0 > this._contentWidth) {
			return null;
		}

		let aboveTop = visibleRange.top - height;
		let belowTop = visibleRange.top + this._lineHeight;
		let left = left0 + this._contentLeft;

		let domNodePosition = dom.getDomNodePagePosition(this._viewDomNode);
		let absoluteAboveTop = domNodePosition.top + aboveTop - dom.StandardWindow.scrollY;
		let absoluteBelowTop = domNodePosition.top + belowTop - dom.StandardWindow.scrollY;
		let absoluteLeft = domNodePosition.left + left - dom.StandardWindow.scrollX;

		let INNER_WIDTH = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
		let INNER_HEIGHT = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

		// Leave some clearance to the bottom
		let TOP_PADDING = 22;
		let BOTTOM_PADDING = 22;

		let fitsAbove = (absoluteAboveTop >= TOP_PADDING),
			fitsBelow = (absoluteBelowTop + height <= INNER_HEIGHT - BOTTOM_PADDING);

		if (absoluteLeft + width + 20 > INNER_WIDTH) {
			let delta = absoluteLeft - (INNER_WIDTH - width - 20);
			absoluteLeft -= delta;
			left -= delta;
		}
		if (absoluteLeft < 0) {
			let delta = absoluteLeft;
			absoluteLeft -= delta;
			left -= delta;
		}

		if (this._context.configuration.editor.viewInfo.fixedOverflowWidgets) {
			aboveTop = absoluteAboveTop;
			belowTop = absoluteBelowTop;
			left = absoluteLeft;
		}

		return { aboveTop, fitsAbove, belowTop, fitsBelow, left };
	}

	private _prepareRenderWidgetAtExactPosition(position: Position, ctx: IRenderingContext): IMyWidgetRenderData {
		let visibleRange = ctx.visibleRangeForPosition(position);

		if (!visibleRange) {
			return null;
		}

		return {
			top: visibleRange.top,
			left: visibleRange.left
		};
	}

	private _prepareRenderWidgetAtExactPositionOverflowing(position: Position, ctx: IRenderingContext): IMyWidgetRenderData {
		let r = this._prepareRenderWidgetAtExactPosition(position, ctx);
		r.left += this._contentLeft;
		return r;
	}

	private _prepareRenderWidget(widgetData: IWidgetData, ctx: IRenderingContext): IMyWidgetRenderData {
		if (!widgetData.position || !widgetData.preference) {
			return null;
		}

		// Do not trust that widgets have a valid position
		let validModelPosition = this._context.model.validateModelPosition(widgetData.position);

		if (!this._context.model.modelPositionIsVisible(validModelPosition)) {
			// this position is hidden by the view model
			return null;
		}

		let position = this._context.model.convertModelPositionToViewPosition(validModelPosition.lineNumber, validModelPosition.column);

		let placement: IBoxLayoutResult = null;
		let fetchPlacement = () => {
			if (placement) {
				return;
			}

			let domNode = widgetData.widget.getDomNode();
			if (widgetData.allowEditorOverflow) {
				placement = this._layoutBoxInPage(position, domNode, ctx);
			} else {
				placement = this._layoutBoxInViewport(position, domNode, ctx);
			}
		};

		// Do two passes, first for perfect fit, second picks first option
		for (let pass = 1; pass <= 2; pass++) {
			for (let i = 0; i < widgetData.preference.length; i++) {
				let pref = widgetData.preference[i];
				if (pref === ContentWidgetPositionPreference.ABOVE) {
					fetchPlacement();
					if (!placement) {
						// Widget outside of viewport
						return null;
					}
					if (pass === 2 || placement.fitsAbove) {
						return {
							top: placement.aboveTop,
							left: placement.left
						};
					}
				} else if (pref === ContentWidgetPositionPreference.BELOW) {
					fetchPlacement();
					if (!placement) {
						// Widget outside of viewport
						return null;
					}
					if (pass === 2 || placement.fitsBelow) {
						return {
							top: placement.belowTop,
							left: placement.left
						};
					}
				} else {
					if (widgetData.allowEditorOverflow) {
						return this._prepareRenderWidgetAtExactPositionOverflowing(position, ctx);
					} else {
						return this._prepareRenderWidgetAtExactPosition(position, ctx);
					}
				}
			}
		}
		return undefined;
	}

	public prepareRender(ctx: IRenderingContext): void {
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}

		let data: IMyRenderData = {};

		let keys = Object.keys(this._widgets);
		for (let i = 0, len = keys.length; i < len; i++) {
			let widgetId = keys[i];
			let renderData = this._prepareRenderWidget(this._widgets[widgetId], ctx);
			if (renderData) {
				data[widgetId] = renderData;
			}
		}

		this._renderData = data;
	}

	public render(ctx: IRestrictedRenderingContext): void {
		let data = this._renderData;

		let keys = Object.keys(this._widgets);
		for (let i = 0, len = keys.length; i < len; i++) {
			let widgetId = keys[i];
			let widget = this._widgets[widgetId];
			let domNode = this._widgets[widgetId].widget.getDomNode();

			if (data.hasOwnProperty(widgetId)) {
				if (widget.allowEditorOverflow) {
					StyleMutator.setTop(domNode, data[widgetId].top);
					StyleMutator.setLeft(domNode, data[widgetId].left);
				} else {
					StyleMutator.setTop(domNode, data[widgetId].top + ctx.viewportTop - ctx.bigNumbersDelta);
					StyleMutator.setLeft(domNode, data[widgetId].left);
				}
				if (!widget.isVisible) {
					StyleMutator.setVisibility(domNode, 'inherit');
					domNode.setAttribute('monaco-visible-content-widget', 'true');
					widget.isVisible = true;
				}
			} else {
				if (widget.isVisible) {
					domNode.removeAttribute('monaco-visible-content-widget');
					widget.isVisible = false;
					StyleMutator.setVisibility(domNode, 'hidden');
				}
			}
		}
	}
}
