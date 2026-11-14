/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { CursorColumns } from '../../../../editor/common/core/cursorColumns.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { commentThreadStateColorVar } from './commentColors.js';
import { EDGE_MARGIN, getConnectorPoints, getRowsOutlinePath, IPoint, IRect } from './commentThreadFloatingWidgetLayout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Space between the commented code and its outline. */
const OUTLINE_PADDING = 2;
/** How far the outline and connector may extend to the left of the code area, so that the outline of code at the first column isn't cut off. */
const CONNECTOR_GUTTER_BLEED = OUTLINE_PADDING + 2;

interface ILineExtent {
	/** Where the commented text of the line starts, relative to the start of the line. */
	readonly start: number;
	/** Where the commented text of the line ends, relative to the start of the line. */
	readonly end: number;
	/** The text that was injected into the line when it was measured, such as inlay hints, which moves its text. */
	readonly injectedText: string;
}

/**
 * Where the code that a comment thread is about is shown in an editor.
 *
 * Measuring where the text of a line starts and ends makes the editor render, so each line is measured once, when it
 * is first in view, and the measurement is kept until edits, injected text, or the editor's font or layout change it.
 * Following the code as the editor scrolls only takes the lines' vertical positions, which don't need rendering.
 */
export class CommentedCodeGeometry extends Disposable {

	private readonly _lineExtents = new Map<number, ILineExtent>();

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _getRange: () => IRange | undefined
	) {
		super();
		const invalidate = () => this.invalidate();
		this._register(_editor.onDidChangeModelContent(invalidate));
		// Decorations can change the font of lines.
		this._register(_editor.onDidChangeFont(invalidate));
		this._register(_editor.onDidChangeModelOptions(invalidate));
		this._register(_editor.onDidLayoutChange(invalidate));
		this._register(_editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.wrappingInfo)) {
				invalidate();
			}
		}));
	}

	/**
	 * Forgets the measured lines, such as when the commented range changes.
	 */
	invalidate(): void {
		this._lineExtents.clear();
	}

	/**
	 * The commented range, validated against the model, and the lines it covers. A range that continues onto
	 * a further line only up to that line's start, like a selection of whole lines, doesn't cover that line.
	 */
	getLines(): { range: Range; startLineNumber: number; endLineNumber: number } | undefined {
		const model = this._editor.getModel();
		const commentedRange = this._getRange();
		if (!commentedRange || !model) {
			return undefined;
		}
		const range = model.validateRange(commentedRange);
		const endsAtLineStart = range.endLineNumber > range.startLineNumber && range.endColumn === 1;
		return { range, startLineNumber: range.startLineNumber, endLineNumber: endsAtLineStart ? range.endLineNumber - 1 : range.endLineNumber };
	}

	/**
	 * The vertical extent of the commented lines in document coordinates. Comments on the whole file are
	 * anchored at the top of the document.
	 */
	getVerticalBounds(): { top: number; bottom: number } {
		const lines = this.getLines();
		if (!lines) {
			return { top: 0, bottom: 0 };
		}
		return { top: this._editor.getTopForLineNumber(lines.startLineNumber), bottom: this._editor.getBottomForLineNumber(lines.endLineNumber) };
	}

	/**
	 * The bounding box of the commented code, in editor coordinates.
	 */
	getBoundingRect(): IRect | undefined {
		const lines = this.getLineRects();
		if (!lines) {
			return undefined;
		}
		const vertical = this.getVerticalBounds();
		const left = Math.min(...lines.map(line => line.left));
		const right = Math.max(...lines.map(line => line.left + line.width));
		return { top: vertical.top - this._editor.getScrollTop(), left, width: right - left, height: vertical.bottom - vertical.top };
	}

	/**
	 * The areas of the commented lines that are in view, in editor coordinates, top to bottom and without gaps.
	 * Like the code's background, each line spans from the start of the code to the end of its text. Code that
	 * continues out of view extends beyond the edge of the editor. When none of the code is in view, its
	 * estimated area is returned as a single line.
	 */
	getLineRects(): IRect[] | undefined {
		const code = this.getLines();
		const model = this._editor.getModel();
		if (!code || !model) {
			return undefined;
		}
		const { range, startLineNumber, endLineNumber } = code;
		const layoutInfo = this._editor.getLayoutInfo();
		const scrollTop = this._editor.getScrollTop();
		const contentLeft = layoutInfo.contentLeft - this._editor.getScrollLeft();
		const minWidth = this._editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;

		const lines: IRect[] = [];
		const visibleRanges = this._editor.getVisibleRanges();
		for (const visibleRange of visibleRanges) {
			const from = Math.max(startLineNumber, visibleRange.startLineNumber);
			const to = Math.min(endLineNumber, visibleRange.endLineNumber);
			for (let lineNumber = from; lineNumber <= to; lineNumber++) {
				// An empty range comments on its whole line.
				const startColumn = !range.isEmpty() && lineNumber === range.startLineNumber ? range.startColumn : 1;
				const endColumn = !range.isEmpty() && lineNumber === range.endLineNumber ? range.endColumn : model.getLineMaxColumn(lineNumber);
				const extent = this._getLineExtent(lineNumber, startColumn, endColumn);
				const top = this._editor.getTopForLineNumber(lineNumber);
				const bottom = this._editor.getBottomForLineNumber(lineNumber);
				let end = extent.end;
				if (bottom - top > this._editor.getLineHeightForPosition({ lineNumber, column: 1 })) {
					// The line wraps, so its text reaches the right of the viewport.
					end = Math.max(end, layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth);
				}
				lines.push({ top: top - scrollTop, left: contentLeft + extent.start, width: Math.max(end - extent.start, minWidth), height: bottom - top });
			}
		}

		if (lines.length === 0) {
			// None of the code is in view, so estimate its area for the connector to point to.
			const vertical = this.getVerticalBounds();
			let width = this._estimateOffset(startLineNumber, model.getLineMaxColumn(startLineNumber));
			if (this._lineExtents.size) {
				width = Math.max(...Array.from(this._lineExtents.values(), extent => extent.end));
			}
			return [{ top: vertical.top - scrollTop, left: contentLeft, width: Math.max(width, minWidth), height: vertical.bottom - vertical.top }];
		}

		// Close the gaps that view zones leave between lines.
		for (let i = 0; i < lines.length - 1; i++) {
			lines[i] = { ...lines[i], height: lines[i + 1].top - lines[i].top };
		}
		const first = lines[0];
		if (first.top > -EDGE_MARGIN && startLineNumber < visibleRanges[0].startLineNumber) {
			lines[0] = { ...first, top: -EDGE_MARGIN, height: first.top + first.height + EDGE_MARGIN };
		}
		const last = lines[lines.length - 1];
		const viewportBottom = layoutInfo.height + EDGE_MARGIN;
		if (last.top + last.height < viewportBottom && endLineNumber > visibleRanges[visibleRanges.length - 1].endLineNumber) {
			lines[lines.length - 1] = { ...last, height: viewportBottom - last.top };
		}
		return lines;
	}

	/**
	 * Estimates where the editor's lines between the given vertical positions end, such as the lines next to a widget,
	 * without rendering them. A line with more characters than fit in the editor reaches its right edge anyway, so its
	 * text isn't read: the time this takes depends on the number of lines, rather than on their length.
	 * @param top The top of the area, in document coordinates.
	 * @param bottom The bottom of the area, in document coordinates.
	 * @returns The lines, in document coordinates.
	 */
	estimateLineRects(top: number, bottom: number): IRect[] {
		const viewModel = this._editor._getViewModel();
		const model = this._editor.getModel();
		if (!viewModel || !model) {
			return [];
		}
		const viewLayout = viewModel.viewLayout;
		const layoutInfo = this._editor.getLayoutInfo();
		const left = layoutInfo.contentLeft - this._editor.getScrollLeft();
		const characterWidth = this._editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
		const maxColumns = Math.ceil(layoutInfo.contentWidth / characterWidth);
		const tabSize = model.getOptions().tabSize;
		const lines: IRect[] = [];
		const lineCount = viewModel.getLineCount();
		for (let lineNumber = viewLayout.getLineNumberAtVerticalOffset(Math.max(0, top)); lineNumber <= lineCount; lineNumber++) {
			const lineTop = viewLayout.getVerticalOffsetForLineNumber(lineNumber);
			if (lineTop >= bottom) {
				break;
			}
			const length = viewModel.getLineLength(lineNumber);
			const columns = length > maxColumns ? length : CursorColumns.visibleColumnFromColumn(viewModel.getLineContent(lineNumber), length + 1, tabSize);
			lines.push({ top: lineTop, left, width: columns * characterWidth, height: viewLayout.getLineHeightForLineNumber(lineNumber) });
		}
		return lines;
	}

	/**
	 * Where the commented text of a line in view starts and ends.
	 */
	private _getLineExtent(lineNumber: number, startColumn: number, endColumn: number): ILineExtent {
		const injectedText = this._getInjectedText(lineNumber);
		const cached = this._lineExtents.get(lineNumber);
		if (cached?.injectedText === injectedText) {
			return cached;
		}
		const start = this._editor.getOffsetForColumn(lineNumber, startColumn);
		const end = this._editor.getOffsetForColumn(lineNumber, endColumn);
		if (start < 0 || end < 0) {
			// The line isn't rendered, such as while the editor is hidden.
			return { start: this._estimateOffset(lineNumber, startColumn), end: this._estimateOffset(lineNumber, endColumn), injectedText };
		}
		const extent = { start, end, injectedText };
		this._lineExtents.set(lineNumber, extent);
		return extent;
	}

	/**
	 * Describes the text that decorations inject into a line, which changes far less often than decorations do.
	 */
	private _getInjectedText(lineNumber: number): string {
		return this._editor.getModel()!.getLineInjectedText(lineNumber)
			.map(text => `${text.column}:${text.options.content}:${text.options.widthInEm ?? ''}:${text.options.inlineClassName ?? ''}`)
			.join('|');
	}

	private _estimateOffset(lineNumber: number, column: number): number {
		const model = this._editor.getModel()!;
		const visibleColumn = CursorColumns.visibleColumnFromColumn(model.getLineContent(lineNumber), column, model.getOptions().tabSize);
		return visibleColumn * this._editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
	}
}

function setSvgAttributes(element: SVGElement, attributes: Record<string, number>): void {
	for (const [name, value] of Object.entries(attributes)) {
		element.setAttribute(name, String(value));
	}
}

function setSvgVisibility(visible: boolean, ...elements: SVGElement[]): void {
	for (const element of elements) {
		element.style.display = visible ? '' : 'none';
	}
}

/**
 * Draws an outline that follows the lines of the code that a floating comment thread is about, and a line from the
 * code to the thread's widget. Both are drawn on an overlay that covers the code area of the editor.
 */
export class CommentThreadConnector extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly _outline: SVGPathElement;
	private readonly _line: SVGLineElement;
	private readonly _anchor: SVGCircleElement;
	private readonly _overlay: IOverlayWidget;
	private _position: IOverlayWidgetPosition | null = null;
	private _renderedBounds: { left: number; width: number; height: number } | undefined;
	private _renderedOutline: string | undefined;
	/** The radius of the corners of the outline around the code. */
	private _outlineCornerRadius = 0;

	constructor(
		private readonly _editor: ICodeEditor,
		id: string
	) {
		super();
		this._domNode = dom.$('.comment-thread-floating-connector');
		this._domNode.setAttribute('aria-hidden', 'true');
		const svg = document.createElementNS(SVG_NS, 'svg');
		this._outline = document.createElementNS(SVG_NS, 'path');
		this._outline.classList.add('code-outline');
		this._line = document.createElementNS(SVG_NS, 'line');
		this._line.classList.add('connector-line');
		this._anchor = document.createElementNS(SVG_NS, 'circle');
		this._anchor.classList.add('connector-anchor');
		this._anchor.setAttribute('r', '2');
		svg.append(this._outline, this._line, this._anchor);
		this._domNode.appendChild(svg);

		this._overlay = {
			getId: () => id,
			getDomNode: () => this._domNode,
			getPosition: () => this._position
		};
	}

	attach(): void {
		this._editor.addOverlayWidget(this._overlay);
		this._outlineCornerRadius = parseFloat(dom.getWindow(this._domNode).getComputedStyle(this._domNode).getPropertyValue('--vscode-cornerRadius-small')) || 0;
	}

	detach(): void {
		this._editor.removeOverlayWidget(this._overlay);
		this._position = null;
		this._renderedBounds = undefined;
	}

	setColor(color: string): void {
		this._domNode.style.setProperty(commentThreadStateColorVar, color);
	}

	/**
	 * The outline and connector are subtle at rest and become prominent while focus is in the widget.
	 */
	setActive(active: boolean): void {
		this._domNode.classList.toggle('active', active);
	}

	/**
	 * Draws the outline around the given lines of code and the connector from the code to the anchor point, all in
	 * editor coordinates. The connector isn't drawn when the anchor is within the outline.
	 * @param bounds The horizontal extent of the editor's code area.
	 */
	render(codeLines: readonly IRect[] | undefined, anchor: IPoint, bounds: { left: number; right: number }): void {
		// The outline of code that starts at the first column extends slightly into the gutter.
		const originX = bounds.left - CONNECTOR_GUTTER_BLEED;
		const width = bounds.right - originX;
		const height = this._editor.getLayoutInfo().height;
		if (this._renderedBounds?.left !== originX || this._renderedBounds.width !== width || this._renderedBounds.height !== height) {
			this._renderedBounds = { left: originX, width, height };
			this._position = { preference: { top: 0, left: originX } };
			this._domNode.style.width = `${width}px`;
			this._domNode.style.height = `${height}px`;
			this._editor.layoutOverlayWidget(this._overlay);
		}

		if (!codeLines) {
			setSvgVisibility(false, this._outline, this._line, this._anchor);
			return;
		}

		const outlineRows = codeLines.map(line => ({
			top: line.top,
			left: line.left - OUTLINE_PADDING - originX,
			width: line.width + 2 * OUTLINE_PADDING,
			height: line.height
		}));
		const outline = getRowsOutlinePath(outlineRows, this._outlineCornerRadius);
		if (outline !== this._renderedOutline) {
			this._renderedOutline = outline;
			this._outline.setAttribute('d', outline);
		}
		setSvgVisibility(true, this._outline);

		const points = getConnectorPoints(outlineRows, { x: anchor.x - originX, y: anchor.y });
		if (!points) {
			setSvgVisibility(false, this._line, this._anchor);
			return;
		}
		setSvgAttributes(this._line, { x1: points.from.x, y1: points.from.y, x2: points.to.x, y2: points.to.y });
		setSvgAttributes(this._anchor, { cx: points.from.x, cy: points.from.y });
		setSvgVisibility(true, this._line, this._anchor);
	}
}
