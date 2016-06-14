/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./linesDecorations';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {DecorationToRender, DedupOverlay} from 'vs/editor/browser/viewParts/glyphMargin/glyphMargin';
import {ViewContext} from 'vs/editor/common/view/viewContext';
import {IRenderingContext} from 'vs/editor/common/view/renderingContext';

export class LinesDecorationsOverlay extends DedupOverlay {

	private _context:ViewContext;
	private _lineHeight: number;

	private _decorationsLeft:number;
	private _decorationsWidth:number;
	private _renderResult:string[];

	constructor(context:ViewContext) {
		super();
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
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
	public onModelDecorationsChanged(e:editorCommon.IViewDecorationsChangedEvent): boolean {
		return true;
	}
	public onModelLinesDeleted(e:editorCommon.IViewLinesDeletedEvent): boolean {
		return true;
	}
	public onModelLineChanged(e:editorCommon.IViewLineChangedEvent): boolean {
		return true;
	}
	public onModelLinesInserted(e:editorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}
	public onCursorPositionChanged(e:editorCommon.IViewCursorPositionChangedEvent): boolean {
		return false;
	}
	public onCursorSelectionChanged(e:editorCommon.IViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onCursorRevealRange(e:editorCommon.IViewRevealRangeEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		return true;
	}
	public onLayoutChanged(layoutInfo:editorCommon.EditorLayoutInfo): boolean {
		this._decorationsLeft = layoutInfo.decorationsLeft;
		this._decorationsWidth = layoutInfo.decorationsWidth;
		return true;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		return e.scrollTopChanged;
	}
	public onZonesChanged(): boolean {
		return true;
	}

	// --- end event handlers

	protected _getDecorations(ctx:IRenderingContext): DecorationToRender[] {
		let decorations = ctx.getDecorationsInViewport();
		let r:DecorationToRender[] = [];
		for (let i = 0, len = decorations.length; i < len; i++) {
			let d = decorations[i];
			if (d.options.linesDecorationsClassName) {
				r.push(new DecorationToRender(d.range.startLineNumber, d.range.endLineNumber, d.options.linesDecorationsClassName));
			}
		}
		return r;
	}

	public prepareRender(ctx:IRenderingContext): void {
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}

		let visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		let visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		let toRender = this._render(visibleStartLineNumber, visibleEndLineNumber, this._getDecorations(ctx));

		let lineHeight = this._lineHeight.toString();
		let left = this._decorationsLeft.toString();
		let width = this._decorationsWidth.toString();
		let common = '" style="left:' + left + 'px;width:' + width + 'px' + ';height:' + lineHeight + 'px;"></div>';

		let output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			let lineIndex = lineNumber - visibleStartLineNumber;
			let classNames = toRender[lineIndex];

			if (classNames.length === 0) {
				output[lineIndex] = '';
			} else {
				output[lineIndex] = (
					'<div class="cldr'
					+ classNames
					+ common
				);
			}
		}

		this._renderResult = output;
	}

	public render(startLineNumber:number, lineNumber:number): string {
		if (!this._renderResult) {
			return '';
		}
		let lineIndex = lineNumber - startLineNumber;
		if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
			throw new Error('Unexpected render request');
		}
		return this._renderResult[lineIndex];
	}
}