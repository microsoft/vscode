/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./linesDecorations';
import { DecorationToRender, DedupOverlay } from 'vs/editor/browser/viewParts/glyphMargin/glyphMargin';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { RenderingContext } from 'vs/editor/common/view/renderingContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export class LinesDecorationsOverlay extends DedupOverlay {

	private _context: ViewContext;

	private _decorationsLeft: number;
	private _decorationsWidth: number;
	private _renderResult: string[];

	constructor(context: ViewContext) {
		super();
		this._context = context;
		this._decorationsLeft = this._context.configuration.editor.layoutInfo.decorationsLeft;
		this._decorationsWidth = this._context.configuration.editor.layoutInfo.decorationsWidth;
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
		if (e.layoutInfo) {
			this._decorationsLeft = this._context.configuration.editor.layoutInfo.decorationsLeft;
			this._decorationsWidth = this._context.configuration.editor.layoutInfo.decorationsWidth;
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
			let linesDecorationsClassName = d.source.options.linesDecorationsClassName;
			if (linesDecorationsClassName) {
				r[rLen++] = new DecorationToRender(d.range.startLineNumber, d.range.endLineNumber, linesDecorationsClassName);
			}
		}
		return r;
	}

	public prepareRender(ctx: RenderingContext): void {
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