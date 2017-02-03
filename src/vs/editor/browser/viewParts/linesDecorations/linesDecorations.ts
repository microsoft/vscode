/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./linesDecorations';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { DecorationToRender, DedupOverlay } from 'vs/editor/browser/viewParts/glyphMargin/glyphMargin';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext } from 'vs/editor/common/view/renderingContext';

export class LinesDecorationsOverlay extends DedupOverlay {

	private _context: ViewContext;

	private _decorationsLeft: number;
	private _decorationsWidth: number;
	private _renderResult: string[];

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._decorationsLeft = 0;
		this._decorationsWidth = 0;
		this._renderResult = null;
		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
		this._renderResult = null;
	}

	// --- begin event handlers

	public onModelFlushed(): boolean {
		return true;
	}
	public onModelDecorationsChanged(e: editorCommon.IViewDecorationsChangedEvent): boolean {
		return true;
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
		return true;
	}
	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		this._decorationsLeft = layoutInfo.decorationsLeft;
		this._decorationsWidth = layoutInfo.decorationsWidth;
		return true;
	}
	public onScrollChanged(e: editorCommon.IScrollEvent): boolean {
		return e.scrollTopChanged;
	}
	public onZonesChanged(): boolean {
		return true;
	}

	// --- end event handlers

	protected _getDecorations(ctx: IRenderingContext): DecorationToRender[] {
		let decorations = ctx.getDecorationsInViewport();
		let r: DecorationToRender[] = [];
		for (let i = 0, len = decorations.length; i < len; i++) {
			let d = decorations[i];
			let linesDecorationsClassName = d.source.options.linesDecorationsClassName;
			if (linesDecorationsClassName) {
				r.push(new DecorationToRender(d.range.startLineNumber, d.range.endLineNumber, linesDecorationsClassName));
			}
		}
		return r;
	}

	public prepareRender(ctx: IRenderingContext): void {
		let visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		let visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		let toRender = this._render(visibleStartLineNumber, visibleEndLineNumber, this._getDecorations(ctx));

		let left = this._decorationsLeft.toString();
		let width = this._decorationsWidth.toString();
		let common = '" style="left:' + left + 'px;width:' + width + 'px;"></div>';

		let output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			let lineIndex = lineNumber - visibleStartLineNumber;
			let classNames = toRender[lineIndex];
			let lineOutput = '';
			for (let i = 0, len = classNames.length; i < len; i++) {
				lineOutput += '<div class="cldr ' + classNames[i] + common;
			}
			output[lineIndex] = lineOutput;
		}

		this._renderResult = output;
	}

	public render(startLineNumber: number, lineNumber: number): string {
		if (!this._renderResult) {
			return '';
		}
		return this._renderResult[lineNumber - startLineNumber];
	}
}