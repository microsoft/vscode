/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./glyphMargin';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {IDynamicViewOverlay, IRenderingContext, IViewContext} from 'vs/editor/browser/editorBrowser';

export class DecorationToRender {
	public _decorationToRenderTrait:void;

	public startLineNumber:number;
	public endLineNumber:number;
	public className:string;
	public classNameId:number;

	constructor(startLineNumber:number, endLineNumber:number, className:string) {
		this.startLineNumber = +startLineNumber;
		this.endLineNumber = +endLineNumber;
		this.className = String(className);
		this.classNameId = 0;
	}
}

export abstract class DedupOverlay extends ViewEventHandler {

	protected _render(visibleStartLineNumber:number, visibleEndLineNumber:number, decorations:DecorationToRender[]): string[] {

		if (decorations.length === 0) {
			let output: string[] = [];
			for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
				let lineIndex = lineNumber - visibleStartLineNumber;
				output[lineIndex] = '';
			}
			return output;
		}

		// Give each unique class name a numeric id
		let className2Id: {[className:string]:number;} = Object.create(null);
		let id2Classname: string[] = [null];
		let lastAssignedId = 0;

		for (let i = 0, len = decorations.length; i < len; i++) {
			let d = decorations[i];
			d.startLineNumber = Math.max(d.startLineNumber, visibleStartLineNumber);
			d.endLineNumber = Math.min(d.endLineNumber, visibleEndLineNumber);
			if (d.startLineNumber > d.endLineNumber) {
				continue;
			}

			let className = d.className;
			let classNameId:number;

			let tmp = className2Id[className];
			if (tmp) {
				classNameId = tmp;
			} else {
				classNameId = (++lastAssignedId);
				id2Classname[classNameId] = className;
				className2Id[className] = classNameId;
			}

			d.classNameId = classNameId;
		}

		let uniqueRender: boolean[][] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			let lineIndex = lineNumber - visibleStartLineNumber;

			let uniqueRenderLine:boolean[] = [];
			for (let id = 0; id < lastAssignedId; id++) {
				uniqueRenderLine[id] = false;
			}
			uniqueRender[lineIndex] = uniqueRenderLine;
		}

		for (let i = 0, len = decorations.length; i < len; i++) {
			let r = decorations[i];
			for (let lineNumber = r.startLineNumber; lineNumber <= r.endLineNumber; lineNumber++) {
				let lineIndex = lineNumber - visibleStartLineNumber;
				uniqueRender[lineIndex][r.classNameId] = true;
			}
		}

		let output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			let lineIndex = lineNumber - visibleStartLineNumber;
			let uniqueRenderLine = uniqueRender[lineIndex];

			let allClassNames = '';
			for (let id = 0; id < lastAssignedId; id++) {
				if (uniqueRenderLine[id]) {
					allClassNames += ' ' + id2Classname[id];
				}
			}

			output[lineIndex] = allClassNames;
		}

		return output;
	}
}

export class GlyphMarginOverlay extends DedupOverlay implements IDynamicViewOverlay {

	private _context:IViewContext;
	private _glyphMarginLeft:number;
	private _glyphMarginWidth:number;
	private _renderResult: string[];

	constructor(context:IViewContext) {
		super();
		this._context = context;
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
		return true;
	}
	public onLayoutChanged(layoutInfo:editorCommon.IEditorLayoutInfo): boolean {
		this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
		return true;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		return e.vertical;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	public onScrollWidthChanged(scrollWidth:number): boolean {
		return false;
	}
	public onScrollHeightChanged(scrollHeight:number): boolean {
		return false;
	}

	// --- end event handlers

	protected _getDecorations(ctx:IRenderingContext): DecorationToRender[] {
		let decorations = ctx.getDecorationsInViewport();
		let r:DecorationToRender[] = [];
		for (let i = 0, len = decorations.length; i < len; i++) {
			let d = decorations[i];
			if (d.options.glyphMarginClassName) {
				r.push(new DecorationToRender(d.range.startLineNumber, d.range.endLineNumber, d.options.glyphMarginClassName));
			}
		}
		return r;
	}

	public shouldCallRender2(ctx:IRenderingContext): boolean {
		if (!this.shouldRender) {
			return false;
		}
		this.shouldRender = false;

		if (!this._context.configuration.editor.glyphMargin) {
			this._renderResult = null;
			return false;
		}

		let visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		let visibleEndLineNumber = ctx.visibleRange.endLineNumber;
		let toRender = this._render(visibleStartLineNumber, visibleEndLineNumber, this._getDecorations(ctx));

		let lineHeight = this._context.configuration.editor.lineHeight.toString();
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
					'<div class="cgmr'
					+ classNames
					+ common
				);
			}
		}

		this._renderResult = output;
	}

	public render2(startLineNumber:number, lineNumber:number): string {
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