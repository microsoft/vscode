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

	constructor(startLineNumber: number, endLineNumber: number, className: string, zIndex?: number) {
		this.startLineNumber = +startLineNumber;
		this.endLineNumber = +endLineNumber;
		this.className = String(className);
		this.zIndex = zIndex ?? 0;
	}
}

export abstract class DedupOverlay extends DynamicViewOverlay {

	protected _render(visibleStartLineNumber: number, visibleEndLineNumber: number, decorations: DecorationToRender[]): [string, number][][] {

		const output: [string, number][][] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;
			output[lineIndex] = [];
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

			if (prevClassName === className) {
				startLineIndex = Math.max(prevEndLineIndex + 1, startLineIndex);
				prevEndLineIndex = Math.max(prevEndLineIndex, endLineIndex);
			} else {
				prevClassName = className;
				prevEndLineIndex = endLineIndex;
			}

			for (let i = startLineIndex; i <= prevEndLineIndex; i++) {
				output[i].push([className, zIndex]);
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
			if (glyphMarginClassName) {
				r[rLen++] = new DecorationToRender(d.range.startLineNumber, d.range.endLineNumber, glyphMarginClassName, zIndex);
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
		const toRender = this._render(visibleStartLineNumber, visibleEndLineNumber, decorationsToRender);

		const lineHeight = this._lineHeight.toString();
		const left = this._glyphMarginLeft.toString();
		const width = this._glyphMarginWidth.toString();
		const common = '" style="left:' + left + 'px;width:' + width + 'px' + ';height:' + lineHeight + 'px;"></div>';

		const output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;
			const renderInfo = toRender[lineIndex];

			if (renderInfo.length === 0) {
				output[lineIndex] = '';
			} else {
				// Sort decorations to render in descending order by zIndex
				renderInfo.sort(([_, aIndex], [__, bIndex]) => {
					return bIndex - aIndex;
				});

				output[lineIndex] = (
					'<div class="cgmr codicon '
					+ renderInfo[0][0]
					+ common
				);
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
