/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./glyphMargin';
import { DynamicViewOverlay } from 'vs/editor/browser/view/dynamicViewOverlay';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

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
		this._glyphMarginLeft = this._context.configuration.editor.layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = this._context.configuration.editor.layoutInfo.glyphMarginWidth;
		this._renderResult = null;
		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
		this._renderResult = null;
		super.dispose();
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.viewInfo) {
			this._glyphMargin = this._context.configuration.editor.viewInfo.glyphMargin;
		}
		if (e.layoutInfo) {
			this._glyphMarginLeft = this._context.configuration.editor.layoutInfo.glyphMarginLeft;
			this._glyphMarginWidth = this._context.configuration.editor.layoutInfo.glyphMarginWidth;
		}
		return true;
	}
	public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return true;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
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
		return e.scrollTopChanged;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// --- end event handlers

	protected _getDecorations(ctx: RenderingContext): DecorationToRender[] {
		let decorations = ctx.getDecorationsInViewport();
		let r: DecorationToRender[] = [], rLen = 0;
		for (let i = 0, len = decorations.length; i < len; i++) {
			let d = decorations[i];
			let glyphMarginClassName = d.source.options.glyphMarginClassName;
			if (glyphMarginClassName) {
				r[rLen++] = new DecorationToRender(d.range.startLineNumber, d.range.endLineNumber, glyphMarginClassName);
			}
		}
		return r;
	}

	public prepareRender(ctx: RenderingContext): void {
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