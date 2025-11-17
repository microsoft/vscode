/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode, createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { ArrayQueue } from '../../../../base/common/arrays.js';
import './glyphMargin.css';
import { IGlyphMarginWidget, IGlyphMarginWidgetPosition } from '../../editorBrowser.js';
import { DynamicViewOverlay } from '../../view/dynamicViewOverlay.js';
import { RenderingContext, RestrictedRenderingContext } from '../../view/renderingContext.js';
import { ViewPart } from '../../view/viewPart.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { GlyphMarginLane } from '../../../common/model.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';

/**
 * Represents a decoration that should be shown along the lines from `startLineNumber` to `endLineNumber`.
 * This can end up producing multiple `LineDecorationToRender`.
 */
export class DecorationToRender {
	public readonly _decorationToRenderBrand: void = undefined;

	public readonly zIndex: number;

	constructor(
		public readonly startLineNumber: number,
		public readonly endLineNumber: number,
		public readonly className: string,
		public readonly tooltip: string | null,
		zIndex: number | undefined,
	) {
		this.zIndex = zIndex ?? 0;
	}
}

/**
 * A decoration that should be shown along a line.
 */
export class LineDecorationToRender {
	constructor(
		public readonly className: string,
		public readonly zIndex: number,
		public readonly tooltip: string | null,
	) { }
}

/**
 * Decorations to render on a visible line.
 */
export class VisibleLineDecorationsToRender {

	private readonly decorations: LineDecorationToRender[] = [];

	public add(decoration: LineDecorationToRender) {
		this.decorations.push(decoration);
	}

	public getDecorations(): LineDecorationToRender[] {
		return this.decorations;
	}
}

export abstract class DedupOverlay extends DynamicViewOverlay {

	/**
	 * Returns an array with an element for each visible line number.
	 */
	protected _render(visibleStartLineNumber: number, visibleEndLineNumber: number, decorations: DecorationToRender[]): VisibleLineDecorationsToRender[] {

		const output: VisibleLineDecorationsToRender[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;
			output[lineIndex] = new VisibleLineDecorationsToRender();
		}

		if (decorations.length === 0) {
			return output;
		}

		// Sort decorations by className, then by startLineNumber and then by endLineNumber
		decorations.sort((a, b) => {
			if (a.className === b.className) {
				if (a.startLineNumber === b.startLineNumber) {
					return a.endLineNumber - b.endLineNumber;
				}
				return a.startLineNumber - b.startLineNumber;
			}
			return (a.className < b.className ? -1 : 1);
		});

		let prevClassName: string | null = null;
		let prevEndLineIndex = 0;
		for (const d of decorations) {
			const className = d.className;
			const zIndex = d.zIndex;
			let startLineIndex = Math.max(d.startLineNumber, visibleStartLineNumber) - visibleStartLineNumber;
			const endLineIndex = Math.min(d.endLineNumber, visibleEndLineNumber) - visibleStartLineNumber;

			if (prevClassName === className) {
				// Here we avoid rendering the same className multiple times on the same line
				startLineIndex = Math.max(prevEndLineIndex + 1, startLineIndex);
				prevEndLineIndex = Math.max(prevEndLineIndex, endLineIndex);
			} else {
				prevClassName = className;
				prevEndLineIndex = endLineIndex;
			}

			for (let lineIndex = startLineIndex; lineIndex <= prevEndLineIndex; lineIndex++) {
				output[lineIndex].add(new LineDecorationToRender(className, zIndex, d.tooltip));
			}
		}

		return output;
	}
}

export class GlyphMarginWidgets extends ViewPart {

	public domNode: FastDomNode<HTMLElement>;

	private _lineHeight: number;
	private _glyphMargin: boolean;
	private _glyphMarginLeft: number;
	private _glyphMarginWidth: number;
	private _glyphMarginDecorationLaneCount: number;

	private _managedDomNodes: FastDomNode<HTMLElement>[];
	private _decorationGlyphsToRender: DecorationBasedGlyph[];

	private _widgets: { [key: string]: IWidgetData } = {};

	constructor(context: ViewContext) {
		super(context);
		this._context = context;

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName('glyph-margin-widgets');
		this.domNode.setPosition('absolute');
		this.domNode.setTop(0);

		this._lineHeight = options.get(EditorOption.lineHeight);
		this._glyphMargin = options.get(EditorOption.glyphMargin);
		this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
		this._glyphMarginDecorationLaneCount = layoutInfo.glyphMarginDecorationLaneCount;
		this._managedDomNodes = [];
		this._decorationGlyphsToRender = [];
	}

	public override dispose(): void {
		this._managedDomNodes = [];
		this._decorationGlyphsToRender = [];
		this._widgets = {};
		super.dispose();
	}

	public getWidgets(): IWidgetData[] {
		return Object.values(this._widgets);
	}

	// --- begin event handlers
	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._lineHeight = options.get(EditorOption.lineHeight);
		this._glyphMargin = options.get(EditorOption.glyphMargin);
		this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
		this._glyphMarginDecorationLaneCount = layoutInfo.glyphMarginDecorationLaneCount;
		return true;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollTopChanged;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// --- end event handlers

	// --- begin widget management

	public addWidget(widget: IGlyphMarginWidget): void {
		const domNode = createFastDomNode(widget.getDomNode());

		this._widgets[widget.getId()] = {
			widget: widget,
			preference: widget.getPosition(),
			domNode: domNode,
			renderInfo: null
		};

		domNode.setPosition('absolute');
		domNode.setDisplay('none');
		domNode.setAttribute('widgetId', widget.getId());
		this.domNode.appendChild(domNode);

		this.setShouldRender();
	}

	public setWidgetPosition(widget: IGlyphMarginWidget, preference: IGlyphMarginWidgetPosition): boolean {
		const myWidget = this._widgets[widget.getId()];
		if (myWidget.preference.lane === preference.lane
			&& myWidget.preference.zIndex === preference.zIndex
			&& Range.equalsRange(myWidget.preference.range, preference.range)) {
			return false;
		}

		myWidget.preference = preference;
		this.setShouldRender();

		return true;
	}

	public removeWidget(widget: IGlyphMarginWidget): void {
		const widgetId = widget.getId();
		if (this._widgets[widgetId]) {
			const widgetData = this._widgets[widgetId];
			const domNode = widgetData.domNode.domNode;
			delete this._widgets[widgetId];

			domNode.remove();
			this.setShouldRender();
		}
	}

	// --- end widget management

	private _collectDecorationBasedGlyphRenderRequest(ctx: RenderingContext, requests: GlyphRenderRequest[]): void {
		const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		const decorations = ctx.getDecorationsInViewport();

		for (const d of decorations) {
			const glyphMarginClassName = d.options.glyphMarginClassName;
			if (!glyphMarginClassName) {
				continue;
			}

			const startLineNumber = Math.max(d.range.startLineNumber, visibleStartLineNumber);
			const endLineNumber = Math.min(d.range.endLineNumber, visibleEndLineNumber);
			const lane = d.options.glyphMargin?.position ?? GlyphMarginLane.Center;
			const zIndex = d.options.zIndex ?? 0;

			for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
				const modelPosition = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber, 0));
				const laneIndex = this._context.viewModel.glyphLanes.getLanesAtLine(modelPosition.lineNumber).indexOf(lane);
				requests.push(new DecorationBasedGlyphRenderRequest(lineNumber, laneIndex, zIndex, glyphMarginClassName));
			}
		}
	}

	private _collectWidgetBasedGlyphRenderRequest(ctx: RenderingContext, requests: GlyphRenderRequest[]): void {
		const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		const visibleEndLineNumber = ctx.visibleRange.endLineNumber;

		for (const widget of Object.values(this._widgets)) {
			const range = widget.preference.range;
			const { startLineNumber, endLineNumber } = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(Range.lift(range));
			if (!startLineNumber || !endLineNumber || endLineNumber < visibleStartLineNumber || startLineNumber > visibleEndLineNumber) {
				// The widget is not in the viewport
				continue;
			}

			// The widget is in the viewport, find a good line for it
			const widgetLineNumber = Math.max(startLineNumber, visibleStartLineNumber);
			const modelPosition = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(widgetLineNumber, 0));
			const laneIndex = this._context.viewModel.glyphLanes.getLanesAtLine(modelPosition.lineNumber).indexOf(widget.preference.lane);
			requests.push(new WidgetBasedGlyphRenderRequest(widgetLineNumber, laneIndex, widget.preference.zIndex, widget));
		}
	}

	private _collectSortedGlyphRenderRequests(ctx: RenderingContext): GlyphRenderRequest[] {

		const requests: GlyphRenderRequest[] = [];

		this._collectDecorationBasedGlyphRenderRequest(ctx, requests);
		this._collectWidgetBasedGlyphRenderRequest(ctx, requests);

		// sort requests by lineNumber ASC, lane  ASC, zIndex DESC, type DESC (widgets first), className ASC
		// don't change this sort unless you understand `prepareRender` below.
		requests.sort((a, b) => {
			if (a.lineNumber === b.lineNumber) {
				if (a.laneIndex === b.laneIndex) {
					if (a.zIndex === b.zIndex) {
						if (b.type === a.type) {
							if (a.type === GlyphRenderRequestType.Decoration && b.type === GlyphRenderRequestType.Decoration) {
								return (a.className < b.className ? -1 : 1);
							}
							return 0;
						}
						return b.type - a.type;
					}
					return b.zIndex - a.zIndex;
				}
				return a.laneIndex - b.laneIndex;
			}
			return a.lineNumber - b.lineNumber;
		});

		return requests;
	}

	/**
	 * Will store render information in each widget's renderInfo and in `_decorationGlyphsToRender`.
	 */
	public prepareRender(ctx: RenderingContext): void {
		if (!this._glyphMargin) {
			this._decorationGlyphsToRender = [];
			return;
		}

		for (const widget of Object.values(this._widgets)) {
			widget.renderInfo = null;
		}

		const requests = new ArrayQueue<GlyphRenderRequest>(this._collectSortedGlyphRenderRequests(ctx));
		const decorationGlyphsToRender: DecorationBasedGlyph[] = [];
		while (requests.length > 0) {
			const first = requests.peek();
			if (!first) {
				// not possible
				break;
			}

			// Requests are sorted by lineNumber and lane, so we read all requests for this particular location
			const requestsAtLocation = requests.takeWhile((el) => el.lineNumber === first.lineNumber && el.laneIndex === first.laneIndex);
			if (!requestsAtLocation || requestsAtLocation.length === 0) {
				// not possible
				break;
			}

			const winner = requestsAtLocation[0];
			if (winner.type === GlyphRenderRequestType.Decoration) {
				// combine all decorations with the same z-index

				const classNames: string[] = [];
				// requests are sorted by zIndex, type, and className so we can dedup className by looking at the previous one
				for (const request of requestsAtLocation) {
					if (request.zIndex !== winner.zIndex || request.type !== winner.type) {
						break;
					}
					if (classNames.length === 0 || classNames[classNames.length - 1] !== request.className) {
						classNames.push(request.className);
					}
				}

				decorationGlyphsToRender.push(winner.accept(classNames.join(' '))); // TODO@joyceerhl Implement overflow for remaining decorations
			} else {
				// widgets cannot be combined
				winner.widget.renderInfo = {
					lineNumber: winner.lineNumber,
					laneIndex: winner.laneIndex,
				};
			}
		}
		this._decorationGlyphsToRender = decorationGlyphsToRender;
	}

	public render(ctx: RestrictedRenderingContext): void {
		if (!this._glyphMargin) {
			for (const widget of Object.values(this._widgets)) {
				widget.domNode.setDisplay('none');
			}
			while (this._managedDomNodes.length > 0) {
				const domNode = this._managedDomNodes.pop();
				domNode?.domNode.remove();
			}
			return;
		}

		const width = (Math.round(this._glyphMarginWidth / this._glyphMarginDecorationLaneCount));

		// Render widgets
		for (const widget of Object.values(this._widgets)) {
			if (!widget.renderInfo) {
				// this widget is not visible
				widget.domNode.setDisplay('none');
			} else {
				const top = ctx.viewportData.relativeVerticalOffset[widget.renderInfo.lineNumber - ctx.viewportData.startLineNumber];
				const left = this._glyphMarginLeft + widget.renderInfo.laneIndex * this._lineHeight;

				widget.domNode.setDisplay('block');
				widget.domNode.setTop(top);
				widget.domNode.setLeft(left);
				widget.domNode.setWidth(width);
				widget.domNode.setHeight(this._lineHeight);
			}
		}

		// Render decorations, reusing previous dom nodes as possible
		for (let i = 0; i < this._decorationGlyphsToRender.length; i++) {
			const dec = this._decorationGlyphsToRender[i];
			const decLineNumber = dec.lineNumber;
			const top = ctx.viewportData.relativeVerticalOffset[decLineNumber - ctx.viewportData.startLineNumber];
			const left = this._glyphMarginLeft + dec.laneIndex * this._lineHeight;

			let domNode: FastDomNode<HTMLElement>;
			if (i < this._managedDomNodes.length) {
				domNode = this._managedDomNodes[i];
			} else {
				domNode = createFastDomNode(document.createElement('div'));
				this._managedDomNodes.push(domNode);
				this.domNode.appendChild(domNode);
			}
			const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(decLineNumber);

			domNode.setClassName(`cgmr codicon ` + dec.combinedClassName);
			domNode.setPosition(`absolute`);
			domNode.setTop(top);
			domNode.setLeft(left);
			domNode.setWidth(width);
			domNode.setHeight(lineHeight);
		}

		// remove extra dom nodes
		while (this._managedDomNodes.length > this._decorationGlyphsToRender.length) {
			const domNode = this._managedDomNodes.pop();
			domNode?.domNode.remove();
		}
	}
}

export interface IWidgetData {
	widget: IGlyphMarginWidget;
	preference: IGlyphMarginWidgetPosition;
	domNode: FastDomNode<HTMLElement>;
	/**
	 * it will contain the location where to render the widget
	 * or null if the widget is not visible
	 */
	renderInfo: IRenderInfo | null;
}

export interface IRenderInfo {
	lineNumber: number;
	laneIndex: number;
}

const enum GlyphRenderRequestType {
	Decoration = 0,
	Widget = 1
}

/**
 * A request to render a decoration in the glyph margin at a certain location.
 */
class DecorationBasedGlyphRenderRequest {
	public readonly type = GlyphRenderRequestType.Decoration;

	constructor(
		public readonly lineNumber: number,
		public readonly laneIndex: number,
		public readonly zIndex: number,
		public readonly className: string,
	) { }

	accept(combinedClassName: string): DecorationBasedGlyph {
		return new DecorationBasedGlyph(this.lineNumber, this.laneIndex, combinedClassName);
	}
}

/**
 * A request to render a widget in the glyph margin at a certain location.
 */
class WidgetBasedGlyphRenderRequest {
	public readonly type = GlyphRenderRequestType.Widget;

	constructor(
		public readonly lineNumber: number,
		public readonly laneIndex: number,
		public readonly zIndex: number,
		public readonly widget: IWidgetData,
	) { }
}

type GlyphRenderRequest = DecorationBasedGlyphRenderRequest | WidgetBasedGlyphRenderRequest;

class DecorationBasedGlyph {
	constructor(
		public readonly lineNumber: number,
		public readonly laneIndex: number,
		public readonly combinedClassName: string
	) { }
}
