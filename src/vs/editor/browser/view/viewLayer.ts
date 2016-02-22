/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as dom from 'vs/base/browser/dom';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IViewContext} from 'vs/editor/browser/editorBrowser';
import {ViewPart} from 'vs/editor/browser/view/viewPart';

export interface IVisibleLineData {
	getDomNode(): HTMLElement;
	setDomNode(domNode: HTMLElement): void;

	onContentChanged(): void;
	onLinesInsertedAbove(): void;
	onLinesDeletedAbove(): void;
	onLineChangedAbove(): void;
	onTokensChanged(): void;
	onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): void;

	getLineOuterHTML(out:string[], lineNumber: number, deltaTop: number): void;
	getLineInnerHTML(lineNumber: number): string;

	shouldUpdateHTML(lineNumber:number, inlineDecorations:editorCommon.IModelDecoration[]): boolean;
	layoutLine(lineNumber: number, deltaTop:number): void;
}

interface IRendererContext {
	domNode: HTMLElement;
	rendLineNumberStart: number;
	lines: IVisibleLineData[];
	linesLength: number;
	getInlineDecorationsForLineInViewport(lineNumber:number): editorCommon.IModelDecoration[];
	viewportTop: number;
	viewportHeight: number;
	scrollDomNode: HTMLElement;
	scrollDomNodeIsAbove: boolean;
}

export class ViewLayer extends ViewPart {

	public domNode: HTMLElement;

	_lines:IVisibleLineData[];
	_rendLineNumberStart:number;

	private _renderer: ViewLayerRenderer;

	constructor(context:IViewContext) {
		super(context);

		this.domNode = this._createDomNode();

		this._lines = [];
		this._rendLineNumberStart = 1;

		this._renderer = new ViewLayerRenderer(
			() => this._createLine(),
			() => this._extraDomNodeHTML()
		);
	}

	public dispose(): void {
		super.dispose();
		this._lines = null;
	}

	protected _extraDomNodeHTML(): string {
		return '';
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): boolean {
		for (var i = 0; i < this._lines.length; i++) {
			this._lines[i].onConfigurationChanged(e);
		}
		return true;
	}

	public onLayoutChanged(layoutInfo:editorCommon.IEditorLayoutInfo): boolean {
		return true;
	}

	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		return e.vertical;
	}

	public onZonesChanged(): boolean {
		return true;
	}

	public onModelFlushed(): boolean {
		this._lines = [];
		this._rendLineNumberStart = 1;
		dom.clearNode(this.domNode);
		return true;
	}

	public onModelLinesDeleted(e:editorCommon.IViewLinesDeletedEvent): boolean {
		var from = Math.max(e.fromLineNumber - this._rendLineNumberStart, 0);
		var to = Math.min(e.toLineNumber - this._rendLineNumberStart, this._lines.length - 1);
		var i:number;

		// Adjust this._rendLineNumberStart
		if (e.fromLineNumber < this._rendLineNumberStart) {
			// Deleting lines starting above the viewport

			if (e.toLineNumber < this._rendLineNumberStart) {
				// All deleted lines are above the viewport
				this._rendLineNumberStart -= (e.toLineNumber - e.fromLineNumber + 1);
			} else {
				// Some deleted lines are inside the viewport
				this._rendLineNumberStart = e.fromLineNumber;
			}
		}

		// Remove lines if they fall in the viewport
		if (from <= to) {
			// Remove from DOM
			for (i = from; i <= to; i++) {
				var lineDomNode = this._lines[i].getDomNode();
				if (lineDomNode) {
					this.domNode.removeChild(lineDomNode);
				}
			}
			// Remove from array
			this._lines.splice(from, to - from + 1);
		}

		// Mark the rest of the visible lines as possibly invalid
		for (i = from; i < this._lines.length; i++) {
			this._lines[i].onLinesDeletedAbove();
		}

		return true;
	}

	public onModelLineChanged(e:editorCommon.IViewLineChangedEvent): boolean {
		var lineIndex = e.lineNumber - this._rendLineNumberStart,
			shouldRender = false;

		if (lineIndex >= 0 && lineIndex < this._lines.length) {
			this._lines[lineIndex].onContentChanged();
			shouldRender = true;
		}

		// Mark the rest of the visible lines as possibly invalid
		for (var i = Math.max(lineIndex, 0); i < this._lines.length; i++) {
			this._lines[i].onLineChangedAbove();
			shouldRender = true;
		}

		return shouldRender;
	}

	public onModelLinesInserted(e:editorCommon.IViewLinesInsertedEvent): boolean {
		var i:number;

		if (e.fromLineNumber <= this._rendLineNumberStart) {
			// a. We are inserting lines above the viewport
			this._rendLineNumberStart += (e.toLineNumber - e.fromLineNumber + 1);

			// Mark the visible lines as possibly invalid
			for (i = 0; i < this._lines.length; i++) {
				this._lines[i].onLinesInsertedAbove();
			}

			return true;
		}

		if (e.fromLineNumber >= this._rendLineNumberStart + this._lines.length) {
			// b. We are inserting lines below the viewport
			return false;
		}

		// c. We are inserting lines in the viewport

		var insertFrom = Math.min(e.fromLineNumber - this._rendLineNumberStart, this._lines.length - 1);
		var insertTo = Math.min(e.toLineNumber - this._rendLineNumberStart, this._lines.length - 1);
		if (insertFrom <= insertTo) {
			// Insert lines that fall inside the viewport
			for (i = insertFrom; i <= insertTo; i++) {
				var line:IVisibleLineData = this._createLine();
				this._lines.splice(i, 0, line);
			}

			// We need to remove lines that are pushed outside the viewport by this insertion,
			// due to the Math.min above on `insertTo`. Otherwise, it is possible for the next line
			// after the insertion to be marked `maybeInvalid` when it should be definitely `invalid`.
			var insertCount = insertTo - insertFrom + 1;
			for (i = 0; i < insertCount; i++) {
				// Remove from array
				var lastLine = this._lines.pop();
				// Remove from DOM
				var lineDomNode = lastLine.getDomNode();
				if (lineDomNode) {
					this.domNode.removeChild(lineDomNode);
				}
			}
		}

		// Mark the rest of the lines as possibly invalid
		for (i = insertTo; i < this._lines.length; i++) {
			this._lines[i].onLinesInsertedAbove();
		}

		return true;
	}

	public onModelTokensChanged(e:editorCommon.IViewTokensChangedEvent): boolean {
		var changedFromIndex = e.fromLineNumber - this._rendLineNumberStart;
		var changedToIndex = e.toLineNumber - this._rendLineNumberStart;

		if (changedToIndex < 0 || changedFromIndex >= this._lines.length) {
			return false;
		}

		var fromIndex = Math.min(Math.max(changedFromIndex, 0), this._lines.length - 1);
		var toIndex = Math.min(Math.max(changedToIndex, 0), this._lines.length - 1);

		var somethingMayHaveChanged = false;

		for (var i = fromIndex; i <= toIndex; i++) {
			somethingMayHaveChanged = true;
			this._lines[i].onTokensChanged();
		}

		return somethingMayHaveChanged;
	}


	// ---- end view event handlers
	private _scrollDomNode: HTMLElement = null;
	private _scrollDomNodeIsAbove: boolean = false;
	public _renderLines(linesViewportData:editorCommon.IViewLinesViewportData): void {

		var ctx: IRendererContext = {
			domNode: this.domNode,
			rendLineNumberStart: this._rendLineNumberStart,
			lines: this._lines,
			linesLength: this._lines.length,
			getInlineDecorationsForLineInViewport: (lineNumber:number) => linesViewportData.getInlineDecorationsForLineInViewport(lineNumber),
			viewportTop: linesViewportData.viewportTop,
			viewportHeight: linesViewportData.viewportHeight,
			scrollDomNode: this._scrollDomNode,
			scrollDomNodeIsAbove: this._scrollDomNodeIsAbove
		};

		// Decide if this render will do a single update (single large .innerHTML) or many updates (inserting/removing dom nodes)
		var resCtx = this._renderer.renderWithManyUpdates(ctx, linesViewportData.startLineNumber, linesViewportData.endLineNumber, linesViewportData.relativeVerticalOffset);

		this._rendLineNumberStart = resCtx.rendLineNumberStart;
		this._lines = resCtx.lines;
		this._scrollDomNode = resCtx.scrollDomNode;
		this._scrollDomNodeIsAbove = resCtx.scrollDomNodeIsAbove;
	}

	public _createDomNode(): HTMLElement {
		var domNode = document.createElement('div');
		domNode.className = 'view-layer';
		domNode.style.position = 'absolute';
		domNode.setAttribute('role', 'presentation');
		domNode.setAttribute('aria-hidden', 'true');
		return domNode;
	}

	public _createLine(): IVisibleLineData {
		throw new Error('Implement me!');
	}
}

class ViewLayerRenderer {

	private _createLine: () => IVisibleLineData;
	private _extraDomNodeHTML: () => string;

	constructor(createLine: () => IVisibleLineData, extraDomNodeHTML: () => string) {
		this._createLine = createLine;
		this._extraDomNodeHTML = extraDomNodeHTML;
	}

	public renderWithManyUpdates(ctx: IRendererContext, startLineNumber: number, stopLineNumber: number, deltaTop:number[]): IRendererContext {
		return this._render(ctx, startLineNumber, stopLineNumber, deltaTop);
	}

	private _render(inContext: IRendererContext, startLineNumber: number, stopLineNumber: number, deltaTop:number[]): IRendererContext {

		var ctx: IRendererContext = {
			domNode: inContext.domNode,
			rendLineNumberStart: inContext.rendLineNumberStart,
			lines: inContext.lines.slice(0),
			linesLength: inContext.linesLength,
			getInlineDecorationsForLineInViewport: inContext.getInlineDecorationsForLineInViewport,
			viewportTop: inContext.viewportTop,
			viewportHeight: inContext.viewportHeight,
			scrollDomNode: inContext.scrollDomNode,
			scrollDomNodeIsAbove: inContext.scrollDomNodeIsAbove
		};

		var canRemoveScrollDomNode = true;
		if (ctx.scrollDomNode) {
			var time = this._getScrollDomNodeTime(ctx.scrollDomNode);
			if ((new Date()).getTime() - time < 1000) {
				canRemoveScrollDomNode = false;
			}
		}

		if (canRemoveScrollDomNode && ((ctx.rendLineNumberStart + ctx.linesLength - 1 < startLineNumber) || (stopLineNumber < ctx.rendLineNumberStart))) {
			// There is no overlap whatsoever
			ctx.rendLineNumberStart = startLineNumber;
			ctx.linesLength = stopLineNumber - startLineNumber + 1;
			ctx.lines = [];
			for (var x = startLineNumber; x <= stopLineNumber; x++) {
				ctx.lines[x - startLineNumber] = this._createLine();
			}
			this._finishRendering(ctx, true, deltaTop);
			ctx.scrollDomNode = null;
			return ctx;
		}

		// Update lines which will remain untouched
		this._renderUntouchedLines(
			ctx,
			Math.max(startLineNumber - ctx.rendLineNumberStart, 0),
			Math.min(stopLineNumber - ctx.rendLineNumberStart, ctx.linesLength - 1),
			deltaTop,
			startLineNumber
		);

		var fromLineNumber: number,
			toLineNumber: number,
			removeCnt: number;

		if (ctx.rendLineNumberStart > startLineNumber) {
			// Insert lines before
			fromLineNumber = startLineNumber;
			toLineNumber = Math.min(stopLineNumber, ctx.rendLineNumberStart - 1);
			if (fromLineNumber <= toLineNumber) {
				this._insertLinesBefore(ctx, fromLineNumber, toLineNumber, deltaTop, startLineNumber);
				ctx.linesLength += toLineNumber - fromLineNumber + 1;

				// Clean garbage above
				if (ctx.scrollDomNode && ctx.scrollDomNodeIsAbove) {
					if (ctx.scrollDomNode.parentNode) {
						ctx.scrollDomNode.parentNode.removeChild(ctx.scrollDomNode);
					}
					ctx.scrollDomNode = null;
				}
			}
		} else if (ctx.rendLineNumberStart < startLineNumber) {
			// Remove lines before
			removeCnt = Math.min(ctx.linesLength, startLineNumber - ctx.rendLineNumberStart);
			if (removeCnt > 0) {
				this._removeLinesBefore(ctx, removeCnt);
				ctx.linesLength -= removeCnt;
			}
		}

		ctx.rendLineNumberStart = startLineNumber;

		if (ctx.rendLineNumberStart + ctx.linesLength - 1 < stopLineNumber) {
			// Insert lines after
			fromLineNumber = ctx.rendLineNumberStart + ctx.linesLength;
			toLineNumber = stopLineNumber;

			if (fromLineNumber <= toLineNumber) {
				this._insertLinesAfter(ctx, fromLineNumber, toLineNumber, deltaTop, startLineNumber);
				ctx.linesLength += toLineNumber - fromLineNumber + 1;

				// Clean garbage below
				if (ctx.scrollDomNode && !ctx.scrollDomNodeIsAbove) {
					if (ctx.scrollDomNode.parentNode) {
						ctx.scrollDomNode.parentNode.removeChild(ctx.scrollDomNode);
					}
					ctx.scrollDomNode = null;
				}
			}

		} else if (ctx.rendLineNumberStart + ctx.linesLength - 1 > stopLineNumber) {
			// Remove lines after
			fromLineNumber = Math.max(0, stopLineNumber - ctx.rendLineNumberStart + 1);
			toLineNumber = ctx.linesLength - 1;
			removeCnt = toLineNumber - fromLineNumber + 1;

			if (removeCnt > 0) {
				this._removeLinesAfter(ctx, removeCnt);
				ctx.linesLength -= removeCnt;
			}
		}

		this._finishRendering(ctx, false, deltaTop);

		return ctx;
	}

	private _renderUntouchedLines(ctx: IRendererContext, startIndex: number, endIndex: number, deltaTop:number[], deltaLN:number): void {
		var i: number,
			lineNumber: number;

		for (i = startIndex; i <= endIndex; i++) {
			lineNumber = ctx.rendLineNumberStart + i;
			var lineDomNode = ctx.lines[i].getDomNode();
			if (lineDomNode) {
				ctx.lines[i].layoutLine(lineNumber, deltaTop[lineNumber - deltaLN]);
			}
		}
	}

	private _insertLinesBefore(ctx: IRendererContext, fromLineNumber: number, toLineNumber: number, deltaTop:number[], deltaLN:number): void {
		var newLines:IVisibleLineData[] = [],
			line:IVisibleLineData,
			lineNumber: number;

		for (lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
			line = this._createLine();
			newLines.push(line);
		}
		ctx.lines = newLines.concat(ctx.lines);
	}

	private _getScrollDomNodeTime(domNode: HTMLElement): number {
		var lastScrollTime = domNode.getAttribute('last-scroll-time');
		if (lastScrollTime) {
			return parseInt(lastScrollTime, 10);
		}
		return 0;
	}

	private _removeIfNotScrollDomNode(ctx: IRendererContext, domNode: HTMLElement, isAbove: boolean) {
		var time = this._getScrollDomNodeTime(domNode);
		if (!time) {
			ctx.domNode.removeChild(domNode);
			return;
		}

		if (ctx.scrollDomNode) {
			var otherTime = this._getScrollDomNodeTime(ctx.scrollDomNode);
			if (otherTime > time) {
				// The other is the real scroll dom node
				ctx.domNode.removeChild(domNode);
				return;
			}

			if (ctx.scrollDomNode.parentNode) {
				ctx.scrollDomNode.parentNode.removeChild(ctx.scrollDomNode);
			}

			ctx.scrollDomNode = null;
		}

		ctx.scrollDomNode = domNode;
		ctx.scrollDomNodeIsAbove = isAbove;
	}

	private _removeLinesBefore(ctx: IRendererContext, removeCount: number): void {
		var i: number;

		for (i = 0; i < removeCount; i++) {
			var lineDomNode = ctx.lines[i].getDomNode();
			if (lineDomNode) {
				this._removeIfNotScrollDomNode(ctx, lineDomNode, true);
			}
		}
		ctx.lines.splice(0, removeCount);
	}

	private _insertLinesAfter(ctx: IRendererContext, fromLineNumber: number, toLineNumber: number, deltaTop:number[], deltaLN:number): void {
		var newLines:IVisibleLineData[] = [],
			line:IVisibleLineData,
			lineNumber: number;

		for (lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
			line = this._createLine();
			newLines.push(line);
		}
		ctx.lines = ctx.lines.concat(newLines);
	}

	private _removeLinesAfter(ctx: IRendererContext, removeCount: number): void {
		var i: number,
			removeIndex = ctx.linesLength - removeCount;

		for (i = 0; i < removeCount; i++) {
			var lineDomNode = ctx.lines[removeIndex + i].getDomNode();
			if (lineDomNode) {
				this._removeIfNotScrollDomNode(ctx, lineDomNode, false);
			}
		}
		ctx.lines.splice(removeIndex, removeCount);
	}

	private _finishRendering(ctx: IRendererContext, domNodeIsEmpty:boolean, deltaTop:number[]): void {

		var i: number,
			len: number,
			line: IVisibleLineData,
			lineNumber: number,
			hadNewLine = false,
			wasNew: boolean[] = [],
			newLinesHTML: string[] = [],
			hadInvalidLine = false,
			wasInvalid: boolean[] = [],
			invalidLinesHTML: string[] = [];

		for (i = 0, len = ctx.linesLength; i < len; i++) {
			line = ctx.lines[i];
			lineNumber = i + ctx.rendLineNumberStart;

			if (line.shouldUpdateHTML(lineNumber, ctx.getInlineDecorationsForLineInViewport(lineNumber))) {
				var lineDomNode = line.getDomNode();
				if (!lineDomNode) {
					// Line is new
					line.getLineOuterHTML(newLinesHTML, lineNumber, deltaTop[i]);
					wasNew[i] = true;
					hadNewLine = true;
				} else {
					// Line is invalid
					line.getLineOuterHTML(invalidLinesHTML, lineNumber, deltaTop[i]);
					wasInvalid[i] = true;
					hadInvalidLine = true;
//					lineDomNode.innerHTML = line.getLineInnerHTML(lineNumber);
				}
			}
		}

		if (hadNewLine) {
			var lastChild = <HTMLElement>ctx.domNode.lastChild;
			if (domNodeIsEmpty || !lastChild) {
				ctx.domNode.innerHTML = this._extraDomNodeHTML() + newLinesHTML.join('');
			} else {
				lastChild.insertAdjacentHTML('afterend', newLinesHTML.join(''));
			}

			var currChild = <HTMLElement>ctx.domNode.lastChild;
			for (i = ctx.linesLength - 1; i >= 0; i--) {
				line = ctx.lines[i];
				if (wasNew[i]) {
					line.setDomNode(currChild);
					currChild = <HTMLElement>currChild.previousSibling;
				}
			}
		}

		if (hadInvalidLine) {

			var hugeDomNode = document.createElement('div');

			hugeDomNode.innerHTML = invalidLinesHTML.join('');

			var lineDomNode:HTMLElement,
				source:HTMLElement;
			for (i = 0; i < ctx.linesLength; i++) {
				line = ctx.lines[i];
				if (wasInvalid[i]) {
					source = <HTMLElement>hugeDomNode.firstChild;
					lineDomNode = line.getDomNode();
					lineDomNode.parentNode.replaceChild(source, lineDomNode);
					line.setDomNode(source);
				}
			}
		}
	}
}

