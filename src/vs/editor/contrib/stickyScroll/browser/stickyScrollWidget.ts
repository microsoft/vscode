/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { createTrustedTypesPolicy } from 'vs/base/browser/trustedTypes';
import { Disposable } from 'vs/base/common/lifecycle';
import 'vs/css!./stickyScroll';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { getColumnOfNodeOffset } from 'vs/editor/browser/viewParts/lines/viewLine';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorLayoutInfo, EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { CharacterMapping, RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';

export class StickyScrollWidgetState {
	constructor(
		readonly lineNumbers: number[],
		readonly lastLineRelativePosition: number
	) { }
}

const _ttPolicy = createTrustedTypesPolicy('stickyScrollViewLayer', { createHTML: value => value });
const STICKY_LINE_INDEX_ATTR = 'data-sticky-line-index';

export class StickyScrollWidget extends Disposable implements IOverlayWidget {

	private readonly _rootDomNode: HTMLElement = document.createElement('div');
	private readonly _lineNumbersDomNode: HTMLElement = document.createElement('div');
	private readonly _linesDomNodeScrollable: HTMLElement = document.createElement('div');
	private readonly _linesDomNode: HTMLElement = document.createElement('div');

	private _stickyLines: RenderedStickyLine[] = [];
	private _lineNumbers: number[] = [];
	private _lastLineRelativePosition: number = 0;
	private _minContentWidthInPx: number = 0;

	constructor(
		private readonly _editor: ICodeEditor
	) {
		super();

		this._lineNumbersDomNode.className = 'sticky-widget-line-numbers';
		this._lineNumbersDomNode.setAttribute('role', 'none');

		this._linesDomNode.className = 'sticky-widget-lines';
		this._linesDomNode.setAttribute('role', 'list');

		this._linesDomNodeScrollable.className = 'sticky-widget-lines-scrollable';
		this._linesDomNodeScrollable.appendChild(this._linesDomNode);

		this._rootDomNode.className = 'sticky-widget';
		this._rootDomNode.classList.toggle('peek', _editor instanceof EmbeddedCodeEditorWidget);
		this._rootDomNode.appendChild(this._lineNumbersDomNode);
		this._rootDomNode.appendChild(this._linesDomNodeScrollable);

		const updateScrollLeftPosition = () => {
			this._linesDomNode.style.left = this._editor.getOption(EditorOption.stickyScroll).scrollWithEditor ? `-${this._editor.getScrollLeft()}px` : '0px';
		};
		this._register(this._editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				updateScrollLeftPosition();
			}
		}));
		this._register(this._editor.onDidScrollChange((e) => {
			if (e.scrollLeftChanged) {
				updateScrollLeftPosition();
			}
			if (e.scrollWidthChanged) {
				this._updateWidgetWidth();
			}
		}));
		updateScrollLeftPosition();

		this._register(this._editor.onDidLayoutChange((e) => {
			this._updateWidgetWidth();
		}));
		this._updateWidgetWidth();
	}

	get lineNumbers(): number[] {
		return this._lineNumbers;
	}

	get lineNumberCount(): number {
		return this._lineNumbers.length;
	}

	getCurrentLines(): readonly number[] {
		return this._lineNumbers;
	}

	setState(state: StickyScrollWidgetState): void {
		dom.clearNode(this._lineNumbersDomNode);
		dom.clearNode(this._linesDomNode);
		this._stickyLines = [];
		const editorLineHeight = this._editor.getOption(EditorOption.lineHeight);
		const futureWidgetHeight = state.lineNumbers.length * editorLineHeight + state.lastLineRelativePosition;

		if (futureWidgetHeight > 0) {
			this._lastLineRelativePosition = state.lastLineRelativePosition;
			this._lineNumbers = state.lineNumbers;
		} else {
			this._lastLineRelativePosition = 0;
			this._lineNumbers = [];
		}
		this._renderRootNode();
	}

	private _updateWidgetWidth(): void {
		const layoutInfo = this._editor.getLayoutInfo();
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;
		const lineNumbersWidth = minimapSide === 'left' ? layoutInfo.contentLeft - layoutInfo.minimap.minimapCanvasOuterWidth : layoutInfo.contentLeft;
		this._lineNumbersDomNode.style.width = `${lineNumbersWidth}px`;
		this._linesDomNodeScrollable.style.setProperty('--vscode-editorStickyScroll-scrollableWidth', `${this._editor.getScrollWidth() - layoutInfo.verticalScrollbarWidth}px`);
		this._rootDomNode.style.width = `${layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth}px`;
	}

	private _renderRootNode(): void {

		if (!this._editor._getViewModel()) {
			return;
		}

		const layoutInfo = this._editor.getLayoutInfo();
		for (const [index, line] of this._lineNumbers.entries()) {
			const { lineNumberHTMLNode, renderedStickyLine } = this._renderChildNode(index, line, layoutInfo);
			this._lineNumbersDomNode.appendChild(lineNumberHTMLNode);
			this._linesDomNode.appendChild(renderedStickyLine.domNode);
			this._stickyLines.push(renderedStickyLine);
		}

		const editorLineHeight = this._editor.getOption(EditorOption.lineHeight);
		const widgetHeight: number = this._lineNumbers.length * editorLineHeight + this._lastLineRelativePosition;
		this._rootDomNode.style.display = widgetHeight > 0 ? 'block' : 'none';
		this._lineNumbersDomNode.style.height = `${widgetHeight}px`;
		this._linesDomNodeScrollable.style.height = `${widgetHeight}px`;
		this._rootDomNode.style.height = `${widgetHeight}px`;
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;

		if (minimapSide === 'left') {
			this._rootDomNode.style.marginLeft = layoutInfo.minimap.minimapCanvasOuterWidth + 'px';
		} else {
			this._rootDomNode.style.marginLeft = '0px';
		}
		this._updateMinContentWidth();
		this._editor.layoutOverlayWidget(this);
	}

	private _renderChildNode(index: number, line: number, layoutInfo: EditorLayoutInfo): { lineNumberHTMLNode: HTMLSpanElement; renderedStickyLine: RenderedStickyLine } {
		const viewModel = this._editor._getViewModel();
		const viewLineNumber = viewModel!.coordinatesConverter.convertModelPositionToViewPosition(new Position(line, 1)).lineNumber;
		const lineRenderingData = viewModel!.getViewLineRenderingData(viewLineNumber);
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);

		let actualInlineDecorations: LineDecoration[];
		try {
			actualInlineDecorations = LineDecoration.filter(lineRenderingData.inlineDecorations, viewLineNumber, lineRenderingData.minColumn, lineRenderingData.maxColumn);
		} catch (err) {
			actualInlineDecorations = [];
		}

		const renderLineInput: RenderLineInput = new RenderLineInput(true, true, lineRenderingData.content,
			lineRenderingData.continuesWithWrappedLine,
			lineRenderingData.isBasicASCII, lineRenderingData.containsRTL, 0,
			lineRenderingData.tokens, actualInlineDecorations,
			lineRenderingData.tabSize, lineRenderingData.startVisibleColumn,
			1, 1, 1, 500, 'none', true, true, null
		);

		const sb = new StringBuilder(2000);
		const renderOutput = renderViewLine(renderLineInput, sb);

		let newLine;
		if (_ttPolicy) {
			newLine = _ttPolicy.createHTML(sb.build() as string);
		} else {
			newLine = sb.build();
		}

		const lineHTMLNode = document.createElement('span');
		lineHTMLNode.className = 'sticky-line-content';
		lineHTMLNode.classList.add(`stickyLine${line}`);
		lineHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineHTMLNode.innerHTML = newLine as string;

		const lineNumberHTMLNode = document.createElement('span');
		lineNumberHTMLNode.className = 'sticky-line-number';
		lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;

		const innerLineNumberHTML = document.createElement('span');
		if (lineNumberOption.renderType === RenderLineNumbersType.On || lineNumberOption.renderType === RenderLineNumbersType.Interval && line % 10 === 0) {
			innerLineNumberHTML.innerText = line.toString();
		} else if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
			innerLineNumberHTML.innerText = Math.abs(line - this._editor.getPosition()!.lineNumber).toString();
		}
		innerLineNumberHTML.className = 'sticky-line-number-inner';
		innerLineNumberHTML.style.lineHeight = `${lineHeight}px`;
		innerLineNumberHTML.style.width = `${layoutInfo.lineNumbersWidth}px`;
		if (minimapSide === 'left') {
			innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft - layoutInfo.minimap.minimapCanvasOuterWidth}px`;
		} else if (minimapSide === 'right') {
			innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft}px`;
		}
		lineNumberHTMLNode.appendChild(innerLineNumberHTML);

		this._editor.applyFontInfo(lineHTMLNode);
		this._editor.applyFontInfo(innerLineNumberHTML);

		lineHTMLNode.setAttribute('role', 'listitem');
		lineHTMLNode.setAttribute(STICKY_LINE_INDEX_ATTR, String(index));
		lineHTMLNode.tabIndex = 0;

		lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineNumberHTMLNode.style.height = `${lineHeight}px`;
		lineHTMLNode.style.height = `${lineHeight}px`;

		// Special case for the last line of sticky scroll
		const isLastLine = index === this._lineNumbers.length - 1;

		const lastLineZIndex = '0';
		const intermediateLineZIndex = '1';
		lineHTMLNode.style.zIndex = isLastLine ? lastLineZIndex : intermediateLineZIndex;
		lineNumberHTMLNode.style.zIndex = isLastLine ? lastLineZIndex : intermediateLineZIndex;

		const lastLineTop = `${index * lineHeight + this._lastLineRelativePosition}px`;
		const intermediateLineTop = `${index * lineHeight}px`;
		lineHTMLNode.style.top = isLastLine ? lastLineTop : intermediateLineTop;
		lineNumberHTMLNode.style.top = isLastLine ? lastLineTop : intermediateLineTop;

		return {
			lineNumberHTMLNode,
			renderedStickyLine: new RenderedStickyLine(line, lineHTMLNode, renderOutput.characterMapping)
		};
	}

	private _updateMinContentWidth() {
		this._minContentWidthInPx = 0;
		for (const stickyLine of this._stickyLines) {
			if (stickyLine.domNode.scrollWidth > this._minContentWidthInPx) {
				this._minContentWidthInPx = stickyLine.domNode.scrollWidth;
			}
		}
		this._minContentWidthInPx += this._editor.getLayoutInfo().verticalScrollbarWidth;
	}

	getId(): string {
		return 'editor.contrib.stickyScrollWidget';
	}

	getDomNode(): HTMLElement {
		return this._rootDomNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: null
		};
	}

	getMinContentWidthInPx(): number {
		return this._minContentWidthInPx;
	}

	focusLineWithIndex(index: number) {
		if (0 <= index && index < this._stickyLines.length) {
			this._stickyLines[index].domNode.focus();
		}
	}

	/**
	 * Given a leaf dom node, tries to find the editor position.
	 */
	getEditorPositionFromNode(spanDomNode: HTMLElement | null): Position | null {
		if (!spanDomNode || spanDomNode.children.length > 0) {
			// This is not a leaf node
			return null;
		}
		const renderedStickyLine = this._getRenderedStickyLineFromChildDomNode(spanDomNode);
		if (!renderedStickyLine) {
			return null;
		}
		const column = getColumnOfNodeOffset(renderedStickyLine.characterMapping, spanDomNode, 0);
		return new Position(renderedStickyLine.lineNumber, column);
	}

	getLineNumberFromChildDomNode(domNode: HTMLElement | null): number | null {
		return this._getRenderedStickyLineFromChildDomNode(domNode)?.lineNumber ?? null;
	}

	private _getRenderedStickyLineFromChildDomNode(domNode: HTMLElement | null): RenderedStickyLine | null {
		const index = this._getStickyLineIndexFromChildDomNode(domNode);
		if (index === null || index < 0 || index >= this._stickyLines.length) {
			return null;
		}
		return this._stickyLines[index];
	}

	/**
	 * Given a child dom node, tries to find the line number attribute
	 * that was stored in the node. Returns null if none is found.
	 */
	private _getStickyLineIndexFromChildDomNode(domNode: HTMLElement | null): number | null {
		while (domNode && domNode !== this._rootDomNode) {
			const line = domNode.getAttribute(STICKY_LINE_INDEX_ATTR);
			if (line) {
				return parseInt(line, 10);
			}
			domNode = domNode.parentElement;
		}
		return null;
	}
}

class RenderedStickyLine {
	constructor(
		public readonly lineNumber: number,
		public readonly domNode: HTMLElement,
		public readonly characterMapping: CharacterMapping
	) { }
}
