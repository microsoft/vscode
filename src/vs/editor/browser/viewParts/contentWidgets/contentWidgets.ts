/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ContentWidgetPositionPreference, IContentWidget } from 'vs/editor/browser/editorBrowser';
import { PartFingerprint, PartFingerprints, ViewPart } from 'vs/editor/browser/view/viewPart';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IDimension } from 'vs/editor/common/core/dimension';
import { PositionAffinity } from 'vs/editor/common/model';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IViewModel } from 'vs/editor/common/viewModel';

export class ViewContentWidgets extends ViewPart {

	private readonly _viewDomNode: FastDomNode<HTMLElement>;
	private _widgets: { [key: string]: Widget };

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

	public override dispose(): void {
		super.dispose();
		this._widgets = {};
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const keys = Object.keys(this._widgets);
		for (const widgetId of keys) {
			this._widgets[widgetId].onConfigurationChanged(e);
		}
		return true;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public override onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean {
		this._updateAnchorsViewPositions();
		return true;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		this._updateAnchorsViewPositions();
		return true;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		this._updateAnchorsViewPositions();
		return true;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		this._updateAnchorsViewPositions();
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return true;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// ---- end view event handlers

	private _updateAnchorsViewPositions(): void {
		const keys = Object.keys(this._widgets);
		for (const widgetId of keys) {
			this._widgets[widgetId].updateAnchorViewPosition();
		}
	}

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

	public setWidgetPosition(widget: IContentWidget, primaryAnchor: IPosition | null, secondaryAnchor: IPosition | null, preference: ContentWidgetPositionPreference[] | null, affinity: PositionAffinity | null): void {
		const myWidget = this._widgets[widget.getId()];
		myWidget.setPosition(primaryAnchor, secondaryAnchor, preference, affinity);

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

	fitsBelow: boolean;
	belowTop: number;

	left: number;
}

interface IOffViewportRenderData {
	kind: 'offViewport';
	preserveFocus: boolean;
}

interface IInViewportRenderData {
	kind: 'inViewport';
	coordinate: Coordinate;
	position: ContentWidgetPositionPreference;
}

type IRenderData = IInViewportRenderData | IOffViewportRenderData;

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

	private _primaryAnchor: PositionPair = new PositionPair(null, null);
	private _secondaryAnchor: PositionPair = new PositionPair(null, null);
	private _affinity: PositionAffinity | null;
	private _preference: ContentWidgetPositionPreference[] | null;
	private _cachedDomNodeOffsetWidth: number;
	private _cachedDomNodeOffsetHeight: number;
	private _maxWidth: number;
	private _isVisible: boolean;

	private _renderData: IRenderData | null;

	constructor(context: ViewContext, viewDomNode: FastDomNode<HTMLElement>, actual: IContentWidget) {
		this._context = context;
		this._viewDomNode = viewDomNode;
		this._actual = actual;

		this.domNode = createFastDomNode(this._actual.getDomNode());
		this.id = this._actual.getId();
		this.allowEditorOverflow = this._actual.allowEditorOverflow || false;
		this.suppressMouseDown = this._actual.suppressMouseDown || false;

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._fixedOverflowWidgets = options.get(EditorOption.fixedOverflowWidgets);
		this._contentWidth = layoutInfo.contentWidth;
		this._contentLeft = layoutInfo.contentLeft;
		this._lineHeight = options.get(EditorOption.lineHeight);

		this._affinity = null;
		this._preference = [];
		this._cachedDomNodeOffsetWidth = -1;
		this._cachedDomNodeOffsetHeight = -1;
		this._maxWidth = this._getMaxWidth();
		this._isVisible = false;
		this._renderData = null;

		this.domNode.setPosition((this._fixedOverflowWidgets && this.allowEditorOverflow) ? 'fixed' : 'absolute');
		this.domNode.setDisplay('none');
		this.domNode.setVisibility('hidden');
		this.domNode.setAttribute('widgetId', this.id);
		this.domNode.setMaxWidth(this._maxWidth);
	}

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): void {
		const options = this._context.configuration.options;
		this._lineHeight = options.get(EditorOption.lineHeight);
		if (e.hasChanged(EditorOption.layoutInfo)) {
			const layoutInfo = options.get(EditorOption.layoutInfo);
			this._contentLeft = layoutInfo.contentLeft;
			this._contentWidth = layoutInfo.contentWidth;
			this._maxWidth = this._getMaxWidth();
		}
	}

	public updateAnchorViewPosition(): void {
		this._setPosition(this._affinity, this._primaryAnchor.modelPosition, this._secondaryAnchor.modelPosition);
	}

	private _setPosition(affinity: PositionAffinity | null, primaryAnchor: IPosition | null, secondaryAnchor: IPosition | null): void {
		this._affinity = affinity;
		this._primaryAnchor = getValidPositionPair(primaryAnchor, this._context.viewModel, this._affinity);
		this._secondaryAnchor = getValidPositionPair(secondaryAnchor, this._context.viewModel, this._affinity);

		function getValidPositionPair(position: IPosition | null, viewModel: IViewModel, affinity: PositionAffinity | null): PositionPair {
			if (!position) {
				return new PositionPair(null, null);
			}
			// Do not trust that widgets give a valid position
			const validModelPosition = viewModel.model.validatePosition(position);
			if (viewModel.coordinatesConverter.modelPositionIsVisible(validModelPosition)) {
				const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(validModelPosition, affinity ?? undefined);
				return new PositionPair(position, viewPosition);
			}
			return new PositionPair(position, null);
		}
	}

	private _getMaxWidth(): number {
		const elDocument = this.domNode.domNode.ownerDocument;
		const elWindow = elDocument.defaultView;
		return (
			this.allowEditorOverflow
				? elWindow?.innerWidth || elDocument.documentElement.offsetWidth || elDocument.body.offsetWidth
				: this._contentWidth
		);
	}

	public setPosition(primaryAnchor: IPosition | null, secondaryAnchor: IPosition | null, preference: ContentWidgetPositionPreference[] | null, affinity: PositionAffinity | null): void {
		this._setPosition(affinity, primaryAnchor, secondaryAnchor);
		this._preference = preference;
		if (this._primaryAnchor.viewPosition && this._preference && this._preference.length > 0) {
			// this content widget would like to be visible if possible
			// we change it from `display:none` to `display:block` even if it
			// might be outside the viewport such that we can measure its size
			// in `prepareRender`
			this.domNode.setDisplay('block');
		} else {
			this.domNode.setDisplay('none');
		}
		this._cachedDomNodeOffsetWidth = -1;
		this._cachedDomNodeOffsetHeight = -1;
	}

	private _layoutBoxInViewport(anchor: AnchorCoordinate, width: number, height: number, ctx: RenderingContext): IBoxLayoutResult {
		// Our visible box is split horizontally by the current line => 2 boxes

		// a) the box above the line
		const aboveLineTop = anchor.top;
		const heightAvailableAboveLine = aboveLineTop;

		// b) the box under the line
		const underLineTop = anchor.top + anchor.height;
		const heightAvailableUnderLine = ctx.viewportHeight - underLineTop;

		const aboveTop = aboveLineTop - height;
		const fitsAbove = (heightAvailableAboveLine >= height);
		const belowTop = underLineTop;
		const fitsBelow = (heightAvailableUnderLine >= height);

		// And its left
		let left = anchor.left;
		if (left + width > ctx.scrollLeft + ctx.viewportWidth) {
			left = ctx.scrollLeft + ctx.viewportWidth - width;
		}
		if (left < ctx.scrollLeft) {
			left = ctx.scrollLeft;
		}

		return { fitsAbove, aboveTop, fitsBelow, belowTop, left };
	}

	private _layoutHorizontalSegmentInPage(windowSize: dom.Dimension, domNodePosition: dom.IDomNodePagePosition, left: number, width: number): [number, number] {
		// Leave some clearance to the left/right
		const LEFT_PADDING = 15;
		const RIGHT_PADDING = 15;

		// Initially, the limits are defined as the dom node limits
		const MIN_LIMIT = Math.max(LEFT_PADDING, domNodePosition.left - width);
		const MAX_LIMIT = Math.min(domNodePosition.left + domNodePosition.width + width, windowSize.width - RIGHT_PADDING);

		const elDocument = this._viewDomNode.domNode.ownerDocument;
		const elWindow = elDocument.defaultView;
		let absoluteLeft = domNodePosition.left + left - (elWindow?.scrollX ?? 0);

		if (absoluteLeft + width > MAX_LIMIT) {
			const delta = absoluteLeft - (MAX_LIMIT - width);
			absoluteLeft -= delta;
			left -= delta;
		}

		if (absoluteLeft < MIN_LIMIT) {
			const delta = absoluteLeft - MIN_LIMIT;
			absoluteLeft -= delta;
			left -= delta;
		}

		return [left, absoluteLeft];
	}

	private _layoutBoxInPage(anchor: AnchorCoordinate, width: number, height: number, ctx: RenderingContext): IBoxLayoutResult | null {
		const aboveTop = anchor.top - height;
		const belowTop = anchor.top + anchor.height;

		const domNodePosition = dom.getDomNodePagePosition(this._viewDomNode.domNode);
		const elDocument = this._viewDomNode.domNode.ownerDocument;
		const elWindow = elDocument.defaultView;
		const absoluteAboveTop = domNodePosition.top + aboveTop - (elWindow?.scrollY ?? 0);
		const absoluteBelowTop = domNodePosition.top + belowTop - (elWindow?.scrollY ?? 0);

		const windowSize = dom.getClientArea(elDocument.body);
		const [left, absoluteAboveLeft] = this._layoutHorizontalSegmentInPage(windowSize, domNodePosition, anchor.left - ctx.scrollLeft + this._contentLeft, width);

		// Leave some clearance to the top/bottom
		const TOP_PADDING = 22;
		const BOTTOM_PADDING = 22;

		const fitsAbove = (absoluteAboveTop >= TOP_PADDING);
		const fitsBelow = (absoluteBelowTop + height <= windowSize.height - BOTTOM_PADDING);

		if (this._fixedOverflowWidgets) {
			return {
				fitsAbove,
				aboveTop: Math.max(absoluteAboveTop, TOP_PADDING),
				fitsBelow,
				belowTop: absoluteBelowTop,
				left: absoluteAboveLeft
			};
		}

		return { fitsAbove, aboveTop, fitsBelow, belowTop, left };
	}

	private _prepareRenderWidgetAtExactPositionOverflowing(topLeft: Coordinate): Coordinate {
		return new Coordinate(topLeft.top, topLeft.left + this._contentLeft);
	}

	/**
	 * Compute the coordinates above and below the primary and secondary anchors.
	 * The content widget *must* touch the primary anchor.
	 * The content widget should touch if possible the secondary anchor.
	 */
	private _getAnchorsCoordinates(ctx: RenderingContext): { primary: AnchorCoordinate | null; secondary: AnchorCoordinate | null } {
		const primary = getCoordinates(this._primaryAnchor.viewPosition, this._affinity, this._lineHeight);
		const secondaryViewPosition = (this._secondaryAnchor.viewPosition?.lineNumber === this._primaryAnchor.viewPosition?.lineNumber ? this._secondaryAnchor.viewPosition : null);
		const secondary = getCoordinates(secondaryViewPosition, this._affinity, this._lineHeight);
		return { primary, secondary };

		function getCoordinates(position: Position | null, affinity: PositionAffinity | null, lineHeight: number): AnchorCoordinate | null {
			if (!position) {
				return null;
			}

			const horizontalPosition = ctx.visibleRangeForPosition(position);
			if (!horizontalPosition) {
				return null;
			}

			// Left-align widgets that should appear :before content
			const left = (position.column === 1 && affinity === PositionAffinity.LeftOfInjectedText ? 0 : horizontalPosition.left);
			const top = ctx.getVerticalOffsetForLineNumber(position.lineNumber) - ctx.scrollTop;
			return new AnchorCoordinate(top, left, lineHeight);
		}
	}

	private _reduceAnchorCoordinates(primary: AnchorCoordinate, secondary: AnchorCoordinate | null, width: number): AnchorCoordinate {
		if (!secondary) {
			return primary;
		}

		const fontInfo = this._context.configuration.options.get(EditorOption.fontInfo);

		let left = secondary.left;
		if (left < primary.left) {
			left = Math.max(left, primary.left - width + fontInfo.typicalFullwidthCharacterWidth);
		} else {
			left = Math.min(left, primary.left + width - fontInfo.typicalFullwidthCharacterWidth);
		}
		return new AnchorCoordinate(primary.top, left, primary.height);
	}

	private _prepareRenderWidget(ctx: RenderingContext): IRenderData | null {
		if (!this._preference || this._preference.length === 0) {
			return null;
		}

		const { primary, secondary } = this._getAnchorsCoordinates(ctx);
		if (!primary) {
			return {
				kind: 'offViewport',
				preserveFocus: this.domNode.domNode.contains(this.domNode.domNode.ownerDocument.activeElement)
			};
			// return null;
		}

		if (this._cachedDomNodeOffsetWidth === -1 || this._cachedDomNodeOffsetHeight === -1) {

			let preferredDimensions: IDimension | null = null;
			if (typeof this._actual.beforeRender === 'function') {
				preferredDimensions = safeInvoke(this._actual.beforeRender, this._actual);
			}
			if (preferredDimensions) {
				this._cachedDomNodeOffsetWidth = preferredDimensions.width;
				this._cachedDomNodeOffsetHeight = preferredDimensions.height;
			} else {
				const domNode = this.domNode.domNode;
				const clientRect = domNode.getBoundingClientRect();
				this._cachedDomNodeOffsetWidth = Math.round(clientRect.width);
				this._cachedDomNodeOffsetHeight = Math.round(clientRect.height);
			}
		}

		const anchor = this._reduceAnchorCoordinates(primary, secondary, this._cachedDomNodeOffsetWidth);

		let placement: IBoxLayoutResult | null;
		if (this.allowEditorOverflow) {
			placement = this._layoutBoxInPage(anchor, this._cachedDomNodeOffsetWidth, this._cachedDomNodeOffsetHeight, ctx);
		} else {
			placement = this._layoutBoxInViewport(anchor, this._cachedDomNodeOffsetWidth, this._cachedDomNodeOffsetHeight, ctx);
		}

		// Do two passes, first for perfect fit, second picks first option
		for (let pass = 1; pass <= 2; pass++) {
			for (const pref of this._preference) {
				// placement
				if (pref === ContentWidgetPositionPreference.ABOVE) {
					if (!placement) {
						// Widget outside of viewport
						return null;
					}
					if (pass === 2 || placement.fitsAbove) {
						return {
							kind: 'inViewport',
							coordinate: new Coordinate(placement.aboveTop, placement.left),
							position: ContentWidgetPositionPreference.ABOVE
						};
					}
				} else if (pref === ContentWidgetPositionPreference.BELOW) {
					if (!placement) {
						// Widget outside of viewport
						return null;
					}
					if (pass === 2 || placement.fitsBelow) {
						return {
							kind: 'inViewport',
							coordinate: new Coordinate(placement.belowTop, placement.left),
							position: ContentWidgetPositionPreference.BELOW
						};
					}
				} else {
					if (this.allowEditorOverflow) {
						return {
							kind: 'inViewport',
							coordinate: this._prepareRenderWidgetAtExactPositionOverflowing(new Coordinate(anchor.top, anchor.left)),
							position: ContentWidgetPositionPreference.EXACT
						};
					} else {
						return {
							kind: 'inViewport',
							coordinate: new Coordinate(anchor.top, anchor.left),
							position: ContentWidgetPositionPreference.EXACT
						};
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
		if (!this._primaryAnchor.viewPosition || !this._preference) {
			return;
		}

		if (this._primaryAnchor.viewPosition.lineNumber < viewportData.startLineNumber || this._primaryAnchor.viewPosition.lineNumber > viewportData.endLineNumber) {
			// Outside of viewport
			return;
		}

		this.domNode.setMaxWidth(this._maxWidth);
	}

	public prepareRender(ctx: RenderingContext): void {
		this._renderData = this._prepareRenderWidget(ctx);
	}

	public render(ctx: RestrictedRenderingContext): void {
		if (!this._renderData || this._renderData.kind === 'offViewport') {
			// This widget should be invisible
			if (this._isVisible) {
				this.domNode.removeAttribute('monaco-visible-content-widget');
				this._isVisible = false;

				if (this._renderData?.kind === 'offViewport' && this._renderData.preserveFocus) {
					// widget wants to be shown, but it is outside of the viewport and it
					// has focus which we need to preserve
					this.domNode.setTop(-1000);
				} else {
					this.domNode.setVisibility('hidden');
				}
			}

			if (typeof this._actual.afterRender === 'function') {
				safeInvoke(this._actual.afterRender, this._actual, null);
			}
			return;
		}

		// This widget should be visible
		if (this.allowEditorOverflow) {
			this.domNode.setTop(this._renderData.coordinate.top);
			this.domNode.setLeft(this._renderData.coordinate.left);
		} else {
			this.domNode.setTop(this._renderData.coordinate.top + ctx.scrollTop - ctx.bigNumbersDelta);
			this.domNode.setLeft(this._renderData.coordinate.left);
		}

		if (!this._isVisible) {
			this.domNode.setVisibility('inherit');
			this.domNode.setAttribute('monaco-visible-content-widget', 'true');
			this._isVisible = true;
		}

		if (typeof this._actual.afterRender === 'function') {
			safeInvoke(this._actual.afterRender, this._actual, this._renderData.position);
		}
	}
}

class PositionPair {
	constructor(
		public readonly modelPosition: IPosition | null,
		public readonly viewPosition: Position | null
	) { }
}

class Coordinate {
	_coordinateBrand: void = undefined;

	constructor(
		public readonly top: number,
		public readonly left: number
	) { }
}

class AnchorCoordinate {
	_anchorCoordinateBrand: void = undefined;

	constructor(
		public readonly top: number,
		public readonly left: number,
		public readonly height: number
	) { }
}

function safeInvoke<T extends (...args: any[]) => any>(fn: T, thisArg: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> | null {
	try {
		return fn.call(thisArg, ...args);
	} catch {
		// ignore
		return null;
	}
}
