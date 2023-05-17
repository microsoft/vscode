/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./glyphMargin';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { RenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { EditorOption } from 'vs/editor/common/config/editorOptions';


export class DecorationToRender {
	_decorationToRenderBrand: void = undefined;

	public startLineNumber: number;
	public endLineNumber: number;
	public className: string;
	public readonly zIndex: number;
	public readonly decorationLane: number;

	constructor(startLineNumber: number, endLineNumber: number, className: string, zIndex?: number, decorationLane?: number) {
		this.startLineNumber = +startLineNumber;
		this.endLineNumber = +endLineNumber;
		this.className = String(className);
		this.zIndex = zIndex ?? 0;
		this.decorationLane = decorationLane ?? 1;
	}
}

export class RenderedDecoration {
	constructor(
		public readonly className: string,
		public readonly zIndex: number,
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
				output[i].add(lane, new RenderedDecoration(className, zIndex));
			}
		}

		return output;
	}
}

export class GlyphMarginOverlay extends DedupOverlay {

	private readonly _context: ViewContext;
	private _lineHeight: number;
	private _glyphMargin: boolean;
	private _glyphMarginLeft: number;
	private _glyphMarginWidth: number;
	private _glyphMarginDecorationLaneCount: number;
	private _renderResult: string[] | null;

	constructor(context: ViewContext) {
		super();
		this._context = context;

		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this._lineHeight = options.get(EditorOption.lineHeight);
		this._glyphMargin = options.get(EditorOption.glyphMargin);
		this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
		this._glyphMarginDecorationLaneCount = layoutInfo.glyphMarginDecorationLaneCount;
		this._renderResult = null;
		this._context.addEventHandler(this);
	}

	public override dispose(): void {
		this._context.removeEventHandler(this);
		this._renderResult = null;
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
		return r;
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

		const lineHeight = this._lineHeight.toString();
		const width = (Math.round(this._glyphMarginWidth / this._glyphMarginDecorationLaneCount)).toString();
		const common = '" style="width:' + width + 'px' + ';height:' + lineHeight + 'px;';

		const output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;
			const renderInfo = toRender[lineIndex];

			if (renderInfo.isEmpty()) {
				output[lineIndex] = '';
			} else {
				let css = '';
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
					const left = (this._glyphMarginLeft + (lane - 1) * this._lineHeight).toString();
					css += (
						'<div class="cgmr codicon '
						+ winningDecorationClassNames.join(' ') // TODO@joyceerhl Implement overflow for remaining decorations
						+ common
						+ 'left:' + left + 'px;"></div>'
					);
				}
				output[lineIndex] = css;
			}
		}

		this._renderResult = output;
	}

	public render(startLineNumber: number, lineNumber: number): string {
		if (!this._renderResult) {
			return '';
		}
		const lineIndex = lineNumber - startLineNumber;
		if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
			return '';
		}
		return this._renderResult[lineIndex];
	}
}
