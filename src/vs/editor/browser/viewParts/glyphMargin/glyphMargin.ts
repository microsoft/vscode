/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./glyphMargin';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext } from 'vs/editor/common/view/renderingContext';

export class DecorationToRender {
	_decorationToRenderBrand: void;

	public startLineNumber: number;
	public endLineNumber: number;
	public className: string;

	constructor(startLineNumber: number, endLineNumber: number, className: string) {
		this.startLineNumber = +startLineNumber;
		this.endLineNumber = +endLineNumber;
		this.className = String(className);
	}
}

export abstract class DedupOverlay extends DynamicViewOverlay {

	protected _render(visibleStartLineNumber: number, visibleEndLineNumber: number, decorations: DecorationToRender[]): string[][] {

		let output: string[][] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			let lineIndex = lineNumber - visibleStartLineNumber;
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

		let prevClassName: string = null;
		let prevEndLineIndex = 0;
		for (let i = 0, len = decorations.length; i < len; i++) {
			let d = decorations[i];
			let className = d.className;
			let startLineIndex = Math.max(d.startLineNumber, visibleStartLineNumber) - visibleStartLineNumber;
			let endLineIndex = Math.min(d.endLineNumber, visibleEndLineNumber) - visibleStartLineNumber;

			if (prevClassName === className) {
				startLineIndex = Math.max(prevEndLineIndex + 1, startLineIndex);
				prevEndLineIndex = Math.max(prevEndLineIndex, endLineIndex);
			} else {
				prevClassName = className;
				prevEndLineIndex = endLineIndex;
			}

			for (let i = startLineIndex; i <= prevEndLineIndex; i++) {
				output[i].push(prevClassName);
			}
		}

		return output;
	}
}

export class GlyphMarginOverlay extends DedupOverlay {

	private _context: ViewContext;
	private _lineHeight: number;
	private _glyphMargin: boolean;
	private _glyphMarginLeft: number;
	private _glyphMarginWidth: number;
	private _renderResult: string[];

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._glyphMargin = this._context.configuration.editor.viewInfo.glyphMargin;
		this._glyphMarginLeft = 0;
		this._glyphMarginWidth = 0;
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
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.viewInfo.glyphMargin) {
			this._glyphMargin = this._context.configuration.editor.viewInfo.glyphMargin;
		}
		return true;
	}
	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
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
			let glyphMarginClassName = d.source.options.glyphMarginClassName;
			if (glyphMarginClassName) {
				r.push(new DecorationToRender(d.range.startLineNumber, d.range.endLineNumber, glyphMarginClassName));
			}
		}
		return r;
	}

	public prepareRender(ctx: IRenderingContext): void {
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}

		if (!this._glyphMargin) {
			this._renderResult = null;
			return;
		}

		let visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		let visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		let toRender = this._render(visibleStartLineNumber, visibleEndLineNumber, this._getDecorations(ctx));

		let lineHeight = this._lineHeight.toString();
		let left = this._glyphMarginLeft.toString();
		let width = this._glyphMarginWidth.toString();
		let common = '" style="left:' + left + 'px;width:' + width + 'px' + ';height:' + lineHeight + 'px;"></div>';

		let output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			let lineIndex = lineNumber - visibleStartLineNumber;
			let classNames = toRender[lineIndex];

			if (classNames.length === 0) {
				output[lineIndex] = '';
			} else {
				output[lineIndex] = (
					'<div class="cgmr '
					+ classNames.join(' ')
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
		let lineIndex = lineNumber - startLineNumber;
		if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
			throw new Error('Unexpected render request');
		}
		return this._renderResult[lineIndex];
	}
}