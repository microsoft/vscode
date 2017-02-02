/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorCommon from 'vs/editor/common/editorCommon';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/styleMutator';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';

/**
 * Represents a visible line
 */
export interface IVisibleLine {
	getDomNode(): HTMLElement;
	setDomNode(domNode: HTMLElement): void;

	onContentChanged(): void;
	onTokensChanged(): void;

	/**
	 * Return null if the HTML should not be touched.
	 * Return the new HTML otherwise.
	 */
	renderLine(lineNumber: number, deltaTop: number, viewportData: ViewportData): string;

	/**
	 * Layout the line.
	 */
	layoutLine(lineNumber: number, deltaTop: number): void;
}

interface IRendererContext<T extends IVisibleLine> {
	readonly domNode: HTMLElement;
	rendLineNumberStart: number;
	lines: T[];
	linesLength: number;
	readonly viewportData: ViewportData;
	scrollDomNode: HTMLElement;
	scrollDomNodeIsAbove: boolean;
}

export interface ILine {
	onContentChanged(): void;
	onTokensChanged(): void;
}

export class RenderedLinesCollection<T extends ILine> {
	private _lines: T[];
	private _rendLineNumberStart: number;
	private _createLine: () => T;

	constructor(createLine: () => T) {
		this._lines = [];
		this._rendLineNumberStart = 1;
		this._createLine = createLine;
	}

	_set(rendLineNumberStart: number, lines: T[]): void {
		this._lines = lines;
		this._rendLineNumberStart = rendLineNumberStart;
	}

	_get(): { rendLineNumberStart: number; lines: T[]; } {
		return {
			rendLineNumberStart: this._rendLineNumberStart,
			lines: this._lines
		};
	}

	/**
	 * @returns Inclusive line number that is inside this collection
	 */
	public getStartLineNumber(): number {
		return this._rendLineNumberStart;
	}

	/**
	 * @returns Inclusive line number that is inside this collection
	 */
	public getEndLineNumber(): number {
		return this._rendLineNumberStart + this._lines.length - 1;
	}

	public getCount(): number {
		return this._lines.length;
	}

	public getLine(lineNumber: number): T {
		let lineIndex = lineNumber - this._rendLineNumberStart;
		if (lineIndex < 0 || lineIndex >= this._lines.length) {
			throw new Error('Illegal value for lineNumber: ' + lineNumber);
		}
		return this._lines[lineIndex];
	}

	/**
	 * @returns Lines that were removed from this collection
	 */
	public onModelLinesDeleted(deleteFromLineNumber: number, deleteToLineNumber: number): T[] {
		if (this.getCount() === 0) {
			// no lines
			return null;
		}

		let startLineNumber = this.getStartLineNumber();
		let endLineNumber = this.getEndLineNumber();

		// Record what needs to be deleted, notify lines that survive after deletion
		let deleteStartIndex = 0;
		let deleteCount = 0;
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			let lineIndex = lineNumber - this._rendLineNumberStart;

			if (deleteFromLineNumber <= lineNumber && lineNumber <= deleteToLineNumber) {
				// this is a line to be deleted
				if (deleteCount === 0) {
					// this is the first line to be deleted
					deleteStartIndex = lineIndex;
					deleteCount = 1;
				} else {
					deleteCount++;
				}
			}
		}

		// Adjust this._rendLineNumberStart for lines deleted above
		if (deleteFromLineNumber < startLineNumber) {
			// Something was deleted above
			let deleteAboveCount = 0;

			if (deleteToLineNumber < startLineNumber) {
				// the entire deleted lines are above
				deleteAboveCount = deleteToLineNumber - deleteFromLineNumber + 1;
			} else {
				deleteAboveCount = startLineNumber - deleteFromLineNumber;
			}

			this._rendLineNumberStart -= deleteAboveCount;
		}

		let deleted = this._lines.splice(deleteStartIndex, deleteCount);
		return deleted;
	}

	public onModelLineChanged(changedLineNumber: number): boolean {
		if (this.getCount() === 0) {
			// no lines
			return false;
		}

		let startLineNumber = this.getStartLineNumber();
		let endLineNumber = this.getEndLineNumber();

		// Notify lines after the change
		let notifiedSomeone = false;
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			let lineIndex = lineNumber - this._rendLineNumberStart;

			if (lineNumber === changedLineNumber) {
				this._lines[lineIndex].onContentChanged();
				notifiedSomeone = true;
			}
		}

		return notifiedSomeone;
	}

	public onModelLinesInserted(insertFromLineNumber: number, insertToLineNumber: number): T[] {
		if (this.getCount() === 0) {
			// no lines
			return null;
		}

		let insertCnt = insertToLineNumber - insertFromLineNumber + 1;
		let startLineNumber = this.getStartLineNumber();
		let endLineNumber = this.getEndLineNumber();

		if (insertFromLineNumber <= startLineNumber) {
			// inserting above the viewport
			this._rendLineNumberStart += insertCnt;
			return null;
		}

		if (insertFromLineNumber > endLineNumber) {
			// inserting below the viewport
			return null;
		}

		if (insertCnt + insertFromLineNumber > endLineNumber) {
			// insert inside the viewport in such a way that all remaining lines are pushed outside
			let deleted = this._lines.splice(insertFromLineNumber - this._rendLineNumberStart, endLineNumber - insertFromLineNumber + 1);
			return deleted;
		}

		// insert inside the viewport, push out some lines, but not all remaining lines
		let newLines: T[] = [];
		for (let i = 0; i < insertCnt; i++) {
			newLines[i] = this._createLine();
		}
		let insertIndex = insertFromLineNumber - this._rendLineNumberStart;
		let beforeLines = this._lines.slice(0, insertIndex);
		let afterLines = this._lines.slice(insertIndex, this._lines.length - insertCnt);
		let deletedLines = this._lines.slice(this._lines.length - insertCnt, this._lines.length);

		this._lines = beforeLines.concat(newLines).concat(afterLines);

		return deletedLines;
	}

	public onModelTokensChanged(ranges: { fromLineNumber: number; toLineNumber: number; }[]): boolean {
		if (this.getCount() === 0) {
			// no lines
			return false;
		}

		let startLineNumber = this.getStartLineNumber();
		let endLineNumber = this.getEndLineNumber();

		let notifiedSomeone = false;
		for (let i = 0, len = ranges.length; i < len; i++) {
			let rng = ranges[i];

			if (rng.toLineNumber < startLineNumber || rng.fromLineNumber > endLineNumber) {
				// range outside viewport
				continue;
			}

			let from = Math.max(startLineNumber, rng.fromLineNumber);
			let to = Math.min(endLineNumber, rng.toLineNumber);

			for (let lineNumber = from; lineNumber <= to; lineNumber++) {
				let lineIndex = lineNumber - this._rendLineNumberStart;
				this._lines[lineIndex].onTokensChanged();
				notifiedSomeone = true;
			}
		}

		return notifiedSomeone;
	}
}

export abstract class ViewLayer<T extends IVisibleLine> extends ViewPart {

	protected domNode: FastDomNode;
	protected _linesCollection: RenderedLinesCollection<T>;
	private _renderer: ViewLayerRenderer<T>;
	private _scrollDomNode: HTMLElement;
	private _scrollDomNodeIsAbove: boolean;

	constructor(context: ViewContext) {
		super(context);

		this.domNode = this._createDomNode();

		this._linesCollection = new RenderedLinesCollection<T>(() => this._createLine());

		this._scrollDomNode = null;
		this._scrollDomNodeIsAbove = false;

		this._renderer = new ViewLayerRenderer<T>(
			() => this._createLine()
		);
	}

	public dispose(): void {
		super.dispose();
		this._linesCollection = null;
	}

	// ---- begin view event handlers

	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		return true;
	}

	public onScrollChanged(e: editorCommon.IScrollEvent): boolean {
		return e.scrollTopChanged;
	}

	public onZonesChanged(): boolean {
		return true;
	}

	public onModelFlushed(): boolean {
		this._linesCollection = new RenderedLinesCollection<T>(() => this._createLine());
		this._scrollDomNode = null;
		// No need to clear the dom node because a full .innerHTML will occur in ViewLayerRenderer._render
		return true;
	}

	public onModelLinesDeleted(e: editorCommon.IViewLinesDeletedEvent): boolean {
		let deleted = this._linesCollection.onModelLinesDeleted(e.fromLineNumber, e.toLineNumber);
		if (deleted) {
			// Remove from DOM
			for (let i = 0, len = deleted.length; i < len; i++) {
				let lineDomNode = deleted[i].getDomNode();
				if (lineDomNode) {
					this.domNode.domNode.removeChild(lineDomNode);
				}
			}
		}

		return true;
	}

	public onModelLineChanged(e: editorCommon.IViewLineChangedEvent): boolean {
		return this._linesCollection.onModelLineChanged(e.lineNumber);
	}

	public onModelLinesInserted(e: editorCommon.IViewLinesInsertedEvent): boolean {
		let deleted = this._linesCollection.onModelLinesInserted(e.fromLineNumber, e.toLineNumber);
		if (deleted) {
			// Remove from DOM
			for (let i = 0, len = deleted.length; i < len; i++) {
				let lineDomNode = deleted[i].getDomNode();
				if (lineDomNode) {
					this.domNode.domNode.removeChild(lineDomNode);
				}
			}
		}

		return true;
	}

	public onModelTokensChanged(e: editorCommon.IViewTokensChangedEvent): boolean {
		return this._linesCollection.onModelTokensChanged(e.ranges);
	}


	// ---- end view event handlers
	public _renderLines(viewportData: ViewportData): void {

		let inp = this._linesCollection._get();

		let ctx: IRendererContext<T> = {
			domNode: this.domNode.domNode,
			rendLineNumberStart: inp.rendLineNumberStart,
			lines: inp.lines,
			linesLength: inp.lines.length,
			viewportData: viewportData,
			scrollDomNode: this._scrollDomNode,
			scrollDomNodeIsAbove: this._scrollDomNodeIsAbove
		};

		// Decide if this render will do a single update (single large .innerHTML) or many updates (inserting/removing dom nodes)
		let resCtx = this._renderer.renderWithManyUpdates(ctx, viewportData.startLineNumber, viewportData.endLineNumber, viewportData.relativeVerticalOffset);

		this._linesCollection._set(resCtx.rendLineNumberStart, resCtx.lines);
		this._scrollDomNode = resCtx.scrollDomNode;
		this._scrollDomNodeIsAbove = resCtx.scrollDomNodeIsAbove;
	}

	private _createDomNode(): FastDomNode {
		let domNode = createFastDomNode(document.createElement('div'));
		domNode.setClassName('view-layer');
		domNode.setPosition('absolute');
		domNode.domNode.setAttribute('role', 'presentation');
		domNode.domNode.setAttribute('aria-hidden', 'true');
		return domNode;
	}

	protected abstract _createLine(): T;
}

class ViewLayerRenderer<T extends IVisibleLine> {

	private _createLine: () => T;

	constructor(createLine: () => T) {
		this._createLine = createLine;
	}

	public renderWithManyUpdates(ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): IRendererContext<T> {
		return this._render(ctx, startLineNumber, stopLineNumber, deltaTop);
	}

	private _render(inContext: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): IRendererContext<T> {

		let ctx: IRendererContext<T> = {
			domNode: inContext.domNode,
			rendLineNumberStart: inContext.rendLineNumberStart,
			lines: inContext.lines.slice(0),
			linesLength: inContext.linesLength,
			viewportData: inContext.viewportData,
			scrollDomNode: inContext.scrollDomNode,
			scrollDomNodeIsAbove: inContext.scrollDomNodeIsAbove
		};

		let canRemoveScrollDomNode = true;
		if (ctx.scrollDomNode) {
			let time = this._getScrollDomNodeTime(ctx.scrollDomNode);
			if ((new Date()).getTime() - time < 1000) {
				canRemoveScrollDomNode = false;
			}
		}

		if (canRemoveScrollDomNode && ((ctx.rendLineNumberStart + ctx.linesLength - 1 < startLineNumber) || (stopLineNumber < ctx.rendLineNumberStart))) {
			// There is no overlap whatsoever
			ctx.rendLineNumberStart = startLineNumber;
			ctx.linesLength = stopLineNumber - startLineNumber + 1;
			ctx.lines = [];
			for (let x = startLineNumber; x <= stopLineNumber; x++) {
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

		if (ctx.rendLineNumberStart > startLineNumber) {
			// Insert lines before
			let fromLineNumber = startLineNumber;
			let toLineNumber = Math.min(stopLineNumber, ctx.rendLineNumberStart - 1);
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
			let removeCnt = Math.min(ctx.linesLength, startLineNumber - ctx.rendLineNumberStart);
			if (removeCnt > 0) {
				this._removeLinesBefore(ctx, removeCnt);
				ctx.linesLength -= removeCnt;
			}
		}

		ctx.rendLineNumberStart = startLineNumber;

		if (ctx.rendLineNumberStart + ctx.linesLength - 1 < stopLineNumber) {
			// Insert lines after
			let fromLineNumber = ctx.rendLineNumberStart + ctx.linesLength;
			let toLineNumber = stopLineNumber;

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
			let fromLineNumber = Math.max(0, stopLineNumber - ctx.rendLineNumberStart + 1);
			let toLineNumber = ctx.linesLength - 1;
			let removeCnt = toLineNumber - fromLineNumber + 1;

			if (removeCnt > 0) {
				this._removeLinesAfter(ctx, removeCnt);
				ctx.linesLength -= removeCnt;
			}
		}

		this._finishRendering(ctx, false, deltaTop);

		return ctx;
	}

	private _renderUntouchedLines(ctx: IRendererContext<T>, startIndex: number, endIndex: number, deltaTop: number[], deltaLN: number): void {
		const rendLineNumberStart = ctx.rendLineNumberStart;
		const lines = ctx.lines;

		for (let i = startIndex; i <= endIndex; i++) {
			let lineNumber = rendLineNumberStart + i;
			lines[i].layoutLine(lineNumber, deltaTop[lineNumber - deltaLN]);
		}
	}

	private _insertLinesBefore(ctx: IRendererContext<T>, fromLineNumber: number, toLineNumber: number, deltaTop: number[], deltaLN: number): void {
		let newLines: T[] = [];
		let newLinesLen = 0;
		for (let lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
			newLines[newLinesLen++] = this._createLine();
		}
		ctx.lines = newLines.concat(ctx.lines);
	}

	private _getScrollDomNodeTime(domNode: HTMLElement): number {
		let lastScrollTime = domNode.getAttribute('last-scroll-time');
		if (lastScrollTime) {
			return parseInt(lastScrollTime, 10);
		}
		return 0;
	}

	private _removeIfNotScrollDomNode(ctx: IRendererContext<T>, domNode: HTMLElement, isAbove: boolean) {
		let time = this._getScrollDomNodeTime(domNode);
		if (!time) {
			ctx.domNode.removeChild(domNode);
			return;
		}

		if (ctx.scrollDomNode) {
			let otherTime = this._getScrollDomNodeTime(ctx.scrollDomNode);
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

	private _removeLinesBefore(ctx: IRendererContext<T>, removeCount: number): void {
		for (let i = 0; i < removeCount; i++) {
			let lineDomNode = ctx.lines[i].getDomNode();
			if (lineDomNode) {
				this._removeIfNotScrollDomNode(ctx, lineDomNode, true);
			}
		}
		ctx.lines.splice(0, removeCount);
	}

	private _insertLinesAfter(ctx: IRendererContext<T>, fromLineNumber: number, toLineNumber: number, deltaTop: number[], deltaLN: number): void {
		let newLines: T[] = [];
		let newLinesLen = 0;
		for (let lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
			newLines[newLinesLen++] = this._createLine();
		}
		ctx.lines = ctx.lines.concat(newLines);
	}

	private _removeLinesAfter(ctx: IRendererContext<T>, removeCount: number): void {
		let removeIndex = ctx.linesLength - removeCount;

		for (let i = 0; i < removeCount; i++) {
			let lineDomNode = ctx.lines[removeIndex + i].getDomNode();
			if (lineDomNode) {
				this._removeIfNotScrollDomNode(ctx, lineDomNode, false);
			}
		}
		ctx.lines.splice(removeIndex, removeCount);
	}

	private _finishRenderingNewLines(ctx: IRendererContext<T>, domNodeIsEmpty: boolean, newLinesHTML: string[], wasNew: boolean[]): void {
		let lastChild = <HTMLElement>ctx.domNode.lastChild;
		if (domNodeIsEmpty || !lastChild) {
			ctx.domNode.innerHTML = newLinesHTML.join('');
		} else {
			lastChild.insertAdjacentHTML('afterend', newLinesHTML.join(''));
		}

		let currChild = <HTMLElement>ctx.domNode.lastChild;
		for (let i = ctx.linesLength - 1; i >= 0; i--) {
			let line = ctx.lines[i];
			if (wasNew[i]) {
				line.setDomNode(currChild);
				currChild = <HTMLElement>currChild.previousSibling;
			}
		}
	}

	private _finishRenderingInvalidLines(ctx: IRendererContext<T>, invalidLinesHTML: string[], wasInvalid: boolean[]): void {
		let hugeDomNode = document.createElement('div');

		hugeDomNode.innerHTML = invalidLinesHTML.join('');

		for (let i = 0; i < ctx.linesLength; i++) {
			let line = ctx.lines[i];
			if (wasInvalid[i]) {
				let source = <HTMLElement>hugeDomNode.firstChild;
				let lineDomNode = line.getDomNode();
				lineDomNode.parentNode.replaceChild(source, lineDomNode);
				line.setDomNode(source);
			}
		}
	}

	private _finishRendering(ctx: IRendererContext<T>, domNodeIsEmpty: boolean, deltaTop: number[]): void {

		let hadNewLine = false;
		let wasNew: boolean[] = [];
		let newLinesHTML: string[] = [];
		let hadInvalidLine = false;
		let wasInvalid: boolean[] = [];
		let invalidLinesHTML: string[] = [];

		for (let i = 0, len = ctx.linesLength; i < len; i++) {
			let line = ctx.lines[i];
			let lineNumber = i + ctx.rendLineNumberStart;

			wasNew[i] = false;
			wasInvalid[i] = false;

			let renderResult = line.renderLine(lineNumber, deltaTop[i], ctx.viewportData);

			if (renderResult !== null) {
				// Line needs rendering
				let lineDomNode = line.getDomNode();
				if (!lineDomNode) {
					// Line is new
					newLinesHTML.push(renderResult);
					wasNew[i] = true;
					hadNewLine = true;
				} else {
					// Line is invalid
					invalidLinesHTML.push(renderResult);
					wasInvalid[i] = true;
					hadInvalidLine = true;
				}
			}
		}

		if (hadNewLine) {
			this._finishRenderingNewLines(ctx, domNodeIsEmpty, newLinesHTML, wasNew);
		}

		if (hadInvalidLine) {
			this._finishRenderingInvalidLines(ctx, invalidLinesHTML, wasInvalid);
		}
	}
}

