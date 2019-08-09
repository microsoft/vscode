/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ContentWidgetPositionPreference, IContentWidget } from 'vs/editor/browser/editorBrowser';
import { PartFingerprint, PartFingerprints, ViewPart } from 'vs/editor/browser/view/viewPart';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Constants } from 'vs/editor/common/core/uint';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';

class Coordinate {
	_coordinateBrand: void;

	public readonly top: number;
	public readonly left: number;

	constructor(top: number, left: number) {
		this.top = top;
		this.left = left;
	}
}

export class ViewContentWidgets extends ViewPart {

	private readonly _viewDomNode: FastDomNode<HTMLElement>;
	private _widgets: { [key: string]: Widget; };

	public domNode: FastDomNode<HTMLElement>;
	public overflowingContentWidgetsDomNode: FastDomNode<HTMLElement>;

	constructor(context: ViewContext, viewDomNode: FastDomNode<HTMLElement>) {
		super(context);
		this._viewDomNode = viewDomNode;
		this._widgets = {};

		this.domNode = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this.domNode, PartFingerprint.ContentWidgets);
		this.domNode.setClassName('contentWidgets');
		this.domNode.setPosition('absolute');
		this.domNode.setTop(0);

		this.overflowingContentWidgetsDomNode = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this.overflowingContentWidgetsDomNode, PartFingerprint.OverflowingContentWidgets);
		this.overflowingContentWidgetsDomNode.setClassName('overflowingContentWidgets');
	}

	public dispose(): void {
		super.dispose();
		this._widgets = {};
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const keys = Object.keys(this._widgets);
		for (const widgetId of keys) {
			this._widgets[widgetId].onConfigurationChanged(e);
		}
		return true;
	}
	public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return true;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean {
		const keys = Object.keys(this._widgets);
		for (const widgetId of keys) {
			this._widgets[widgetId].onLineMappingChanged(e);
		}
		return true;
	}
	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return true;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// ---- end view event handlers

	public addWidget(_widget: IContentWidget): void {
		const myWidget = new Widget(this._context, this._viewDomNode, _widget);
		this._widgets[myWidget.id] = myWidget;

		if (myWidget.allowEditorOverflow) {
			this.overflowingContentWidgetsDomNode.appendChild(myWidget.domNode);
		} else {
			this.domNode.appendChild(myWidget.domNode);
		}

		this.setShouldRender();
	}

	public setWidgetPosition(widget: IContentWidget, position: IPosition | null, range: IRange | null, preference: ContentWidgetPositionPreference[] | null): void {
		const myWidget = this._widgets[widget.getId()];
		myWidget.setPosition(position, range, preference);

		this.setShouldRender();
	}

	public removeWidget(widget: IContentWidget): void {
		const widgetId = widget.getId();
		if (this._widgets.hasOwnProperty(widgetId)) {
			const myWidget = this._widgets[widgetId];
			delete this._widgets[widgetId];

			const domNode = myWidget.domNode.domNode;
			domNode.parentNode!.removeChild(domNode);
			domNode.removeAttribute('monaco-visible-content-widget');

			this.setShouldRender();
		}
	}

	public shouldSuppressMouseDownOnWidget(widgetId: string): boolean {
		if (this._widgets.hasOwnProperty(widgetId)) {
			return this._widgets[widgetId].suppressMouseDown;
		}
		return false;
	}

	public onBeforeRender(viewportData: ViewportData): void {
		const keys = Object.keys(this._widgets);
		for (const widgetId of keys) {
			this._widgets[widgetId].onBeforeRender(viewportData);
		}
	}

	public prepareRender(ctx: RenderingContext): void {
		const keys = Object.keys(this._widgets);
		for (const widgetId of keys) {
			this._widgets[widgetId].prepareRender(ctx);
		}
	}

	public render(ctx: RestrictedRenderingContext): void {
		const keys = Object.keys(this._widgets);
		for (const widgetId of keys) {
			this._widgets[widgetId].render(ctx);
		}
	}
}

interface IBoxLayoutResult {
	fitsAbove: boolean;
	aboveTop: number;
	aboveLeft: number;

	fitsBelow: boolean;
	belowTop: number;
	belowLeft: number;
}

class Widget {
	private readonly _context: ViewContext;
	private readonly _viewDomNode: FastDomNode<HTMLElement>;
	private readonly _actual: IContentWidget;

	public readonly domNode: FastDomNode<HTMLElement>;
	public readonly id: string;
	public readonly allowEditorOverflow: boolean;
	public readonly suppressMouseDown: boolean;

	private readonly _fixedOverflowWidgets: boolean;
	private _contentWidth: number;
	private _contentLeft: number;
	private _lineHeight: number;

	private _position: IPosition | null;
	private _viewPosition: Position | null;
	private _range: IRange | null;
	private _viewRange: Range | null;
	private _preference: ContentWidgetPositionPreference[] | null;
	private _cachedDomNodeClientWidth: number;
	private _cachedDomNodeClientHeight: number;
	private _maxWidth: number;
	private _isVisible: boolean;

	private _renderData: Coordinate | null;

	constructor(context: ViewContext, viewDomNode: FastDomNode<HTMLElement>, actual: IContentWidget) {
		this._context = context;
		this._viewDomNode = viewDomNode;
		this._actual = actual;

		this.domNode = createFastDomNode(this._actual.getDomNode());
		this.id = this._actual.getId();
		this.allowEditorOverflow = this._actual.allowEditorOverflow || false;
		this.suppressMouseDown = this._actual.suppressMouseDown || false;

		this._fixedOverflowWidgets = this._context.configuration.editor.viewInfo.fixedOverflowWidgets;
		this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
		this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
		this._lineHeight = this._context.configuration.editor.lineHeight;

		this._position = null;
		this._range = null;
		this._viewPosition = null;
		this._viewRange = null;
		this._preference = [];
		this._cachedDomNodeClientWidth = -1;
		this._cachedDomNodeClientHeight = -1;
		this._maxWidth = this._getMaxWidth();
		this._isVisible = false;
		this._renderData = null;

		this.domNode.setPosition((this._fixedOverflowWidgets && this.allowEditorOverflow) ? 'fixed' : 'absolute');
		this.domNode.setVisibility('hidden');
		this.domNode.setAttribute('widgetId', this.id);
		this.domNode.setMaxWidth(this._maxWidth);
	}

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): void {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.layoutInfo) {
			this._contentLeft = this._context.configuration.editor.layoutInfo.contentLeft;
			this._contentWidth = this._context.configuration.editor.layoutInfo.contentWidth;
			this._maxWidth = this._getMaxWidth();
		}
	}

	public onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): void {
		this._setPosition(this._position, this._range);
	}

	private _setPosition(position: IPosition | null, range: IRange | null): void {
		this._position = position;
		this._range = range;
		this._viewPosition = null;
		this._viewRange = null;

		if (this._position) {
			// Do not trust that widgets give a valid position
			const validModelPosition = this._context.model.validateModelPosition(this._position);
			if (this._context.model.coordinatesConverter.modelPositionIsVisible(validModelPosition)) {
				this._viewPosition = this._context.model.coordinatesConverter.convertModelPositionToViewPosition(validModelPosition);
			}
		}
		if (this._range) {
			// Do not trust that widgets give a valid position
			const validModelRange = this._context.model.validateModelRange(this._range);
			this._viewRange = this._context.model.coordinatesConverter.convertModelRangeToViewRange(validModelRange);
		}
	}

	private _getMaxWidth(): number {
		return (
			this.allowEditorOverflow
				? window.innerWidth || document.documentElement!.clientWidth || document.body.clientWidth
				: this._contentWidth
		);
	}

	public setPosition(position: IPosition | null, range: IRange | null, preference: ContentWidgetPositionPreference[] | null): void {
		this._setPosition(position, range);
		this._preference = preference;
		this._cachedDomNodeClientWidth = -1;
		this._cachedDomNodeClientHeight = -1;
	}

	private _layoutBoxInViewport(topLeft: Coordinate, bottomLeft: Coordinate, width: number, height: number, ctx: RenderingContext): IBoxLayoutResult {
		// Our visible box is split horizontally by the current line => 2 boxes

		// a) the box above the line
		const aboveLineTop = topLeft.top;
		const heightAboveLine = aboveLineTop;

		// b) the box under the line
		const underLineTop = bottomLeft.top + this._lineHeight;
		const heightUnderLine = ctx.viewportHeight - underLineTop;

		const aboveTop = aboveLineTop - height;
		const fitsAbove = (heightAboveLine >= height);
		const belowTop = underLineTop;
		const fitsBelow = (heightUnderLine >= height);

		// And its left
		let actualAboveLeft = topLeft.left;
		let actualBelowLeft = bottomLeft.left;
		if (actualAboveLeft + width > ctx.scrollLeft + ctx.viewportWidth) {
			actualAboveLeft = ctx.scrollLeft + ctx.viewportWidth - width;
		}
		if (actualBelowLeft + width > ctx.scrollLeft + ctx.viewportWidth) {
			actualBelowLeft = ctx.scrollLeft + ctx.viewportWidth - width;
		}
		if (actualAboveLeft < ctx.scrollLeft) {
			actualAboveLeft = ctx.scrollLeft;
		}
		if (actualBelowLeft < ctx.scrollLeft) {
			actualBelowLeft = ctx.scrollLeft;
		}

		return {
			fitsAbove: fitsAbove,
			aboveTop: aboveTop,
			aboveLeft: actualAboveLeft,

			fitsBelow: fitsBelow,
			belowTop: belowTop,
			belowLeft: actualBelowLeft,
		};
	}

	private _layoutBoxInPage(topLeft: Coordinate, bottomLeft: Coordinate, width: number, height: number, ctx: RenderingContext): IBoxLayoutResult | null {
		const aboveLeft0 = topLeft.left - ctx.scrollLeft;
		const belowLeft0 = bottomLeft.left - ctx.scrollLeft;

		let aboveTop = topLeft.top - height;
		let belowTop = bottomLeft.top + this._lineHeight;
		let aboveLeft = aboveLeft0 + this._contentLeft;
		let belowLeft = belowLeft0 + this._contentLeft;

		const domNodePosition = dom.getDomNodePagePosition(this._viewDomNode.domNode);
		const absoluteAboveTop = domNodePosition.top + aboveTop - dom.StandardWindow.scrollY;
		const absoluteBelowTop = domNodePosition.top + belowTop - dom.StandardWindow.scrollY;
		let absoluteAboveLeft = domNodePosition.left + aboveLeft - dom.StandardWindow.scrollX;
		let absoluteBelowLeft = domNodePosition.left + belowLeft - dom.StandardWindow.scrollX;

		const INNER_WIDTH = window.innerWidth || document.documentElement!.clientWidth || document.body.clientWidth;
		const INNER_HEIGHT = window.innerHeight || document.documentElement!.clientHeight || document.body.clientHeight;

		// Leave some clearance to the bottom
		const TOP_PADDING = 22;
		const BOTTOM_PADDING = 22;

		const fitsAbove = (absoluteAboveTop >= TOP_PADDING),
			fitsBelow = (absoluteBelowTop + height <= INNER_HEIGHT - BOTTOM_PADDING);

		if (absoluteAboveLeft + width + 20 > INNER_WIDTH) {
			const delta = absoluteAboveLeft - (INNER_WIDTH - width - 20);
			absoluteAboveLeft -= delta;
			aboveLeft -= delta;
		}
		if (absoluteBelowLeft + width + 20 > INNER_WIDTH) {
			const delta = absoluteBelowLeft - (INNER_WIDTH - width - 20);
			absoluteBelowLeft -= delta;
			belowLeft -= delta;
		}
		if (absoluteAboveLeft < 0) {
			const delta = absoluteAboveLeft;
			absoluteAboveLeft -= delta;
			aboveLeft -= delta;
		}
		if (absoluteBelowLeft < 0) {
			const delta = absoluteBelowLeft;
			absoluteBelowLeft -= delta;
			belowLeft -= delta;
		}

		if (this._fixedOverflowWidgets) {
			aboveTop = absoluteAboveTop;
			belowTop = absoluteBelowTop;
			aboveLeft = absoluteAboveLeft;
			belowLeft = absoluteBelowLeft;
		}

		return { fitsAbove, aboveTop, aboveLeft, fitsBelow, belowTop, belowLeft };
	}

	private _prepareRenderWidgetAtExactPositionOverflowing(topLeft: Coordinate): Coordinate {
		return new Coordinate(topLeft.top, topLeft.left + this._contentLeft);
	}

	/**
	 * Compute `this._topLeft`
	 */
	private _getTopAndBottomLeft(ctx: RenderingContext): [Coordinate, Coordinate] | [null, null] {
		if (!this._viewPosition) {
			return [null, null];
		}

		const visibleRangeForPosition = ctx.visibleRangeForPosition(this._viewPosition);
		if (!visibleRangeForPosition) {
			return [null, null];
		}

		const topForPosition = ctx.getVerticalOffsetForLineNumber(this._viewPosition.lineNumber) - ctx.scrollTop;
		const topLeft = new Coordinate(topForPosition, visibleRangeForPosition.left);

		let largestLineNumber = this._viewPosition.lineNumber;
		let smallestLeft = visibleRangeForPosition.left;

		if (this._viewRange) {
			const visibleRangesForRange = ctx.linesVisibleRangesForRange(this._viewRange, false);
			if (visibleRangesForRange && visibleRangesForRange.length > 0) {
				for (let i = visibleRangesForRange.length - 1; i >= 0; i--) {
					const visibleRangesForLine = visibleRangesForRange[i];
					if (visibleRangesForLine.lineNumber >= largestLineNumber) {
						if (visibleRangesForLine.lineNumber > largestLineNumber) {
							largestLineNumber = visibleRangesForLine.lineNumber;
							smallestLeft = Constants.MAX_SAFE_SMALL_INTEGER;
						}
						for (let j = 0, lenJ = visibleRangesForLine.ranges.length; j < lenJ; j++) {
							const visibleRange = visibleRangesForLine.ranges[j];

							if (visibleRange.left < smallestLeft) {
								smallestLeft = visibleRange.left;
							}
						}
					}
				}
			}
		}

		const topForBottomLine = ctx.getVerticalOffsetForLineNumber(largestLineNumber) - ctx.scrollTop;
		const bottomLeft = new Coordinate(topForBottomLine, smallestLeft);

		return [topLeft, bottomLeft];
	}

	private _prepareRenderWidget(ctx: RenderingContext): Coordinate | null {
		const [topLeft, bottomLeft] = this._getTopAndBottomLeft(ctx);
		if (!topLeft || !bottomLeft) {
			return null;
		}

		if (this._cachedDomNodeClientWidth === -1 || this._cachedDomNodeClientHeight === -1) {
			const domNode = this.domNode.domNode;
			this._cachedDomNodeClientWidth = domNode.clientWidth;
			this._cachedDomNodeClientHeight = domNode.clientHeight;
		}

		let placement: IBoxLayoutResult | null;
		if (this.allowEditorOverflow) {
			placement = this._layoutBoxInPage(topLeft, bottomLeft, this._cachedDomNodeClientWidth, this._cachedDomNodeClientHeight, ctx);
		} else {
			placement = this._layoutBoxInViewport(topLeft, bottomLeft, this._cachedDomNodeClientWidth, this._cachedDomNodeClientHeight, ctx);
		}

		// Do two passes, first for perfect fit, second picks first option
		if (this._preference) {
			for (let pass = 1; pass <= 2; pass++) {
				for (const pref of this._preference) {
					// placement
					if (pref === ContentWidgetPositionPreference.ABOVE) {
						if (!placement) {
							// Widget outside of viewport
							return null;
						}
						if (pass === 2 || placement.fitsAbove) {
							return new Coordinate(placement.aboveTop, placement.aboveLeft);
						}
					} else if (pref === ContentWidgetPositionPreference.BELOW) {
						if (!placement) {
							// Widget outside of viewport
							return null;
						}
						if (pass === 2 || placement.fitsBelow) {
							return new Coordinate(placement.belowTop, placement.belowLeft);
						}
					} else {
						if (this.allowEditorOverflow) {
							return this._prepareRenderWidgetAtExactPositionOverflowing(topLeft);
						} else {
							return topLeft;
						}
					}
				}
			}
		}
		return null;
	}

	/**
	 * On this first pass, we ensure that the content widget (if it is in the viewport) has the max width set correctly.
	 */
	public onBeforeRender(viewportData: ViewportData): void {
		if (!this._viewPosition || !this._preference) {
			return;
		}

		if (this._viewPosition.lineNumber < viewportData.startLineNumber || this._viewPosition.lineNumber > viewportData.endLineNumber) {
			// Outside of viewport
			return;
		}

		this.domNode.setMaxWidth(this._maxWidth);
	}

	public prepareRender(ctx: RenderingContext): void {
		this._renderData = this._prepareRenderWidget(ctx);
	}

	public render(ctx: RestrictedRenderingContext): void {
		if (!this._renderData) {
			// This widget should be invisible
			if (this._isVisible) {
				this.domNode.removeAttribute('monaco-visible-content-widget');
				this._isVisible = false;
				this.domNode.setVisibility('hidden');
			}
			return;
		}

		// This widget should be visible
		if (this.allowEditorOverflow) {
			this.domNode.setTop(this._renderData.top);
			this.domNode.setLeft(this._renderData.left);
		} else {
			this.domNode.setTop(this._renderData.top + ctx.scrollTop - ctx.bigNumbersDelta);
			this.domNode.setLeft(this._renderData.left);
		}

		if (!this._isVisible) {
			this.domNode.setVisibility('inherit');
			this.domNode.setAttribute('monaco-visible-content-widget', 'true');
			this._isVisible = true;
		}
	}
}
