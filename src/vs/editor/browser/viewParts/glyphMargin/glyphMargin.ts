/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./glyphMargin';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IGlyphMarginWidget, IGlyphMarginWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';

export class LineRenderedWidgets {

	private readonly lines: GlyphMarginWidget[][] = [];

	public add(line: number, decoration: GlyphMarginWidget) {
		while (line >= this.lines.length) {
			this.lines.push([]);
		}
		this.lines[line].push(decoration);
	}

	public getLineDecorations(lineIndex: number): GlyphMarginWidget[] {
		if (lineIndex < this.lines.length) {
			return this.lines[lineIndex];
		}
		return [];
	}
}

export class GlyphMarginWidget {

	constructor(
		public domNode: FastDomNode<HTMLElement>,
		public className: string,
		public lineNumber: number,
		public left: number,
		public width: number,
		public isManaged: boolean,
	) {
		this.domNode.setPosition('absolute');
		this.domNode.setDisplay('none');
		this.domNode.setVisibility('hidden');
		this.domNode.setMaxWidth(width);
	}
}

export class DecorationToRender {
	_decorationToRenderBrand: void = undefined;

	public startLineNumber: number;
	public endLineNumber: number;
	public className: string;
	public readonly zIndex: number;
	public readonly decorationLane: number;
	public readonly domNode: FastDomNode<HTMLElement> | undefined;

	constructor(startLineNumber: number, endLineNumber: number, className: string, zIndex?: number, decorationLane?: number, domNode?: FastDomNode<HTMLElement>) {
		this.startLineNumber = +startLineNumber;
		this.endLineNumber = +endLineNumber;
		this.className = String(className);
		this.zIndex = zIndex ?? 0;
		this.decorationLane = decorationLane ?? 1;
		this.domNode = domNode;
	}
}

export class RenderedDecoration {
	constructor(
		public readonly className: string,
		public readonly zIndex: number,
		public readonly domNode?: FastDomNode<HTMLElement>,
	) { }
}

export class LineRenderedDecorations {

	private readonly lanes: RenderedDecoration[][] = [];

	public add(lane: number, decoration: RenderedDecoration) {
		while (lane >= this.lanes.length) {
			this.lanes.push([]);
		}
		this.lanes[lane].push(decoration);
	}

	public getLaneDecorations(laneIndex: number): RenderedDecoration[] {
		if (laneIndex < this.lanes.length) {
			return this.lanes[laneIndex];
		}
		return [];
	}

	public isEmpty(): boolean {
		for (const lane of this.lanes) {
			if (lane.length > 0) {
				return false;
			}
		}
		return true;
	}
}

export abstract class DedupOverlay extends DynamicViewOverlay {

	protected _render(visibleStartLineNumber: number, visibleEndLineNumber: number, decorations: DecorationToRender[], decorationLaneCount: number): LineRenderedDecorations[] {

		const output: LineRenderedDecorations[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;
			output[lineIndex] = new LineRenderedDecorations();
		}

		if (decorations.length === 0) {
			return output;
		}

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
		for (let i = 0, len = decorations.length; i < len; i++) {
			const d = decorations[i];
			const className = d.className;
			const zIndex = d.zIndex;
			let startLineIndex = Math.max(d.startLineNumber, visibleStartLineNumber) - visibleStartLineNumber;
			const endLineIndex = Math.min(d.endLineNumber, visibleEndLineNumber) - visibleStartLineNumber;
			const lane = Math.min(d.decorationLane, decorationLaneCount);

			if (prevClassName === className) {
				startLineIndex = Math.max(prevEndLineIndex + 1, startLineIndex);
				prevEndLineIndex = Math.max(prevEndLineIndex, endLineIndex);
			} else {
				prevClassName = className;
				prevEndLineIndex = endLineIndex;
			}

			for (let i = startLineIndex; i <= prevEndLineIndex; i++) {
				output[i].add(lane, new RenderedDecoration(className, zIndex, d.domNode));
			}
		}

		return output;
	}
}

export interface IWidgetData {
	widget: IGlyphMarginWidget;
	preference: IGlyphMarginWidgetPosition;
	domNode: FastDomNode<HTMLElement>;
}

export class GlyphMarginWidgets extends ViewPart {

	public domNode: FastDomNode<HTMLElement>;

	private _lineHeight: number;
	private _glyphMargin: boolean;
	private _glyphMarginLeft: number;
	private _glyphMarginWidth: number;
	private _glyphMarginDecorationLaneCount: number;

	private _previousRenderResult: LineRenderedWidgets | null;
	private _renderResult: LineRenderedWidgets | null;

	private _widgets: { [key: string]: IWidgetData } = {};

	constructor(context: ViewContext) {
		super(context);
		this._context = context;

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName('glyphMarginWidgets');
		this.domNode.setPosition('absolute');
		this.domNode.setTop(0);

		this._lineHeight = options.get(EditorOption.lineHeight);
		this._glyphMargin = options.get(EditorOption.glyphMargin);
		this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
		this._glyphMarginDecorationLaneCount = layoutInfo.glyphMarginDecorationLaneCount;
		this._previousRenderResult = null;
		this._renderResult = null;
	}

	public override dispose(): void {
		this._context.removeEventHandler(this);
		this._renderResult = null;
		this._widgets = {};
		super.dispose();
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
			domNode: domNode
		};

		domNode.setPosition('absolute');
		domNode.setAttribute('widgetId', widget.getId());
		this.domNode.appendChild(domNode);

		this.setShouldRender();
	}

	public setWidgetPosition(widget: IGlyphMarginWidget, preference: IGlyphMarginWidgetPosition): boolean {
		const myWidget = this._widgets[widget.getId()];
		if (myWidget.preference === preference) {
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

			domNode.parentNode?.removeChild(domNode);
			this.setShouldRender();
		}
	}

	// --- end widget management
	protected _getDecorations(ctx: RenderingContext): DecorationToRender[] {
		const decorations = ctx.getDecorationsInViewport();
		const r: DecorationToRender[] = [];
		let rLen = 0;
		for (let i = 0, len = decorations.length; i < len; i++) {
			const d = decorations[i];
			const glyphMarginClassName = d.options.glyphMarginClassName;
			const zIndex = d.options.zIndex;
			const lane = d.options.glyphMargin?.position;
			if (glyphMarginClassName) {
				r[rLen++] = new DecorationToRender(d.range.startLineNumber, d.range.endLineNumber, glyphMarginClassName, zIndex, lane);
			}
		}
		const widgets = Object.values(this._widgets);
		for (let i = 0, len = widgets.length; i < len; i++) {
			const w = widgets[i];
			const glyphMarginClassName = w.widget.className;
			if (glyphMarginClassName) {
				r[rLen++] = new DecorationToRender(w.preference.range.startLineNumber, w.preference.range.endLineNumber, glyphMarginClassName, w.preference.zIndex, w.preference.lane, w.domNode);
			}
		}
		return r;
	}

	protected _render(visibleStartLineNumber: number, visibleEndLineNumber: number, decorations: DecorationToRender[], decorationLaneCount: number): LineRenderedDecorations[] {

		const output: LineRenderedDecorations[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;
			output[lineIndex] = new LineRenderedDecorations();
		}

		if (decorations.length === 0) {
			return output;
		}

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
		for (let i = 0, len = decorations.length; i < len; i++) {
			const d = decorations[i];
			const className = d.className;
			const zIndex = d.zIndex;
			let startLineIndex = Math.max(d.startLineNumber, visibleStartLineNumber) - visibleStartLineNumber;
			const endLineIndex = Math.min(d.endLineNumber, visibleEndLineNumber) - visibleStartLineNumber;
			const lane = Math.min(d.decorationLane, decorationLaneCount);

			if (prevClassName === className) {
				startLineIndex = Math.max(prevEndLineIndex + 1, startLineIndex);
				prevEndLineIndex = Math.max(prevEndLineIndex, endLineIndex);
			} else {
				prevClassName = className;
				prevEndLineIndex = endLineIndex;
			}

			for (let i = startLineIndex; i <= prevEndLineIndex; i++) {
				output[i].add(lane, new RenderedDecoration(className, zIndex, d.domNode));
			}
		}

		return output;
	}

	public prepareRender(ctx: RenderingContext): void {
		if (!this._glyphMargin) {
			this._renderResult = null;
			return;
		}

		const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		const decorationsToRender = this._getDecorations(ctx);
		const toRender = this._render(visibleStartLineNumber, visibleEndLineNumber, decorationsToRender, this._glyphMarginDecorationLaneCount);

		const width = (Math.round(this._glyphMarginWidth / this._glyphMarginDecorationLaneCount));

		const output = new LineRenderedWidgets();
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;
			const renderInfo = toRender[lineIndex];

			if (renderInfo.isEmpty()) {
				continue;
			} else {
				for (let lane = 1; lane <= this._glyphMarginDecorationLaneCount; lane += 1) {
					const decorations = renderInfo.getLaneDecorations(lane);
					if (decorations.length === 0) {
						continue;
					}
					decorations.sort((a, b) => b.zIndex - a.zIndex);
					// Render winning decorations with the same zIndex together
					const winningDecoration: RenderedDecoration = decorations[0];
					const winningDecorationClassNames = [winningDecoration.className];
					for (let i = 1; i < decorations.length; i += 1) {
						const decoration = decorations[i];
						if (decoration.zIndex !== winningDecoration.zIndex) {
							break;
						}
						winningDecorationClassNames.push(decoration.className);
					}
					const left = this._glyphMarginLeft + (lane - 1) * this._lineHeight;
					output.add(lineNumber, new GlyphMarginWidget(winningDecoration.domNode ?? createFastDomNode(document.createElement('div')), winningDecorationClassNames.join(' '), lineNumber, left, width, winningDecoration.domNode !== undefined));
				}
			}
		}
		this._previousRenderResult = this._renderResult;
		this._renderResult = output;
	}

	public render(ctx: RestrictedRenderingContext): void {
		const { startLineNumber, endLineNumber } = ctx.viewportData;

		// Clean up any existing render results
		if (this._previousRenderResult) {
			for (let lineNumber = startLineNumber; lineNumber < endLineNumber; lineNumber += 1) {
				const decorations = this._previousRenderResult.getLineDecorations(lineNumber);
				if (lineNumber < 0 || decorations.length === 0) {
					continue;
				}
				decorations.forEach((widget) => {
					widget.domNode.setDisplay('none');
					if (!widget.isManaged) {
						widget.domNode.domNode.parentNode?.removeChild(widget.domNode.domNode);
					}
				});
			}
		}

		if (!this._renderResult) {
			return;
		}

		// Render new render results
		for (let lineNumber = startLineNumber; lineNumber < endLineNumber; lineNumber += 1) {
			const decorations = this._renderResult.getLineDecorations(lineNumber);
			if (lineNumber < 0 || decorations.length === 0) {
				continue;
			}
			decorations.forEach((widget) => this._renderWidget(ctx, widget));
		}
		return;
	}

	private _renderWidget(ctx: RestrictedRenderingContext, renderedWidget: GlyphMarginWidget): void {
		renderedWidget.domNode.setClassName(`cgmr codicon ${renderedWidget.className}`);
		renderedWidget.domNode.setLeft(renderedWidget.left);
		renderedWidget.domNode.setWidth(renderedWidget.width);
		renderedWidget.domNode.setHeight(this._lineHeight);

		renderedWidget.domNode.setTop(ctx.getVerticalOffsetForLineNumber(renderedWidget.lineNumber, true));
		renderedWidget.domNode.setVisibility('inherit');
		renderedWidget.domNode.setDisplay('block');
		this.domNode.appendChild(renderedWidget.domNode);
	}
}
