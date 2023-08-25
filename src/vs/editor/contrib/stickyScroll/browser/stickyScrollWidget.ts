/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { createTrustedTypesPolicy } from 'vs/base/browser/trustedTypes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./stickyScroll';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { getColumnOfNodeOffset } from 'vs/editor/browser/viewParts/lines/viewLine';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorLayoutInfo, EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { CharacterMapping, RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { foldingCollapsedIcon, foldingExpandedIcon } from 'vs/editor/contrib/folding/browser/foldingDecorations';
import { FoldingModel, toggleCollapseState } from 'vs/editor/contrib/folding/browser/foldingModel';

export class StickyScrollWidgetState {
	constructor(
		readonly startLineNumbers: number[],
		readonly endLineNumbers: number[],
		readonly lastLineRelativePosition: number,
		readonly showEndForLine: number | null = null
	) { }
}

const _ttPolicy = createTrustedTypesPolicy('stickyScrollViewLayer', { createHTML: value => value });
const STICKY_LINE_INDEX_ATTR = 'data-sticky-line-index';

export class StickyScrollWidget extends Disposable implements IOverlayWidget {

	private readonly _foldingIconStore = new DisposableStore();
	private readonly _rootDomNode: HTMLElement = document.createElement('div');
	private readonly _lineNumbersDomNode: HTMLElement = document.createElement('div');
	private readonly _linesDomNodeScrollable: HTMLElement = document.createElement('div');
	private readonly _linesDomNode: HTMLElement = document.createElement('div');

	private _lineHeight: number = this._editor.getOption(EditorOption.lineHeight);
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
			if (e.hasChanged(EditorOption.lineHeight)) {
				this._lineHeight = this._editor.getOption(EditorOption.lineHeight);
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
		this._register(this._editor.onDidChangeModel(() => {
			updateScrollLeftPosition();
			this._updateWidgetWidth();
		}));
		this._register(this._foldingIconStore);
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

	setState(state: StickyScrollWidgetState | undefined): void {
		this._clearStickyWidget();
		if (!state || !this._editor._getViewModel()) {
			return;
		}
		const futureWidgetHeight = state.startLineNumbers.length * this._lineHeight + state.lastLineRelativePosition;

		if (futureWidgetHeight > 0) {
			this._lastLineRelativePosition = state.lastLineRelativePosition;
			const lineNumbers = [...state.startLineNumbers];
			if (state.showEndForLine !== null) {
				lineNumbers[state.showEndForLine] = state.endLineNumbers[state.showEndForLine];
			}
			this._lineNumbers = lineNumbers;
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

	private _clearStickyWidget() {
		this._stickyLines = [];
		this._foldingIconStore.clear();
		dom.clearNode(this._lineNumbersDomNode);
		dom.clearNode(this._linesDomNode);
		this._rootDomNode.style.display = 'none';
	}

	private async _renderRootNode(): Promise<void> {

		const foldingModel = await FoldingController.get(this._editor)?.getFoldingModel();
		const layoutInfo = this._editor.getLayoutInfo();
		for (const [index, line] of this._lineNumbers.entries()) {
			const renderedStickyLine = this._renderChildNode(index, line, layoutInfo, foldingModel);
			this._linesDomNode.appendChild(renderedStickyLine.lineDomNode);
			this._lineNumbersDomNode.appendChild(renderedStickyLine.lineNumberDomNode);
			this._stickyLines.push(renderedStickyLine);
		}
		if (foldingModel) {
			this._setFoldingHoverListeners();
		}

		const widgetHeight: number = this._lineNumbers.length * this._lineHeight + this._lastLineRelativePosition;
		if (widgetHeight === 0) {
			this._clearStickyWidget();
			return;
		}
		this._rootDomNode.style.display = 'block';
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

	private _setFoldingHoverListeners(): void {
		const showFoldingControls: 'mouseover' | 'always' | 'never' = this._editor.getOption(EditorOption.showFoldingControls);
		if (showFoldingControls !== 'mouseover') {
			return;
		}
		this._foldingIconStore.add(dom.addDisposableListener(this._lineNumbersDomNode, dom.EventType.MOUSE_ENTER, (e) => {
			const mouseEventTriggerredByClick =
				'fromElement' in e
				&& e.fromElement instanceof HTMLElement
				&& e.fromElement.classList.contains('codicon');

			for (const line of this._stickyLines) {
				const foldingIcon = line.foldingIcon;
				if (!foldingIcon) {
					continue;
				}
				if (mouseEventTriggerredByClick) {
					foldingIcon.setTransitionRequired(false);
					foldingIcon.setVisible(true);
					setTimeout(() => { foldingIcon.setTransitionRequired(true); }, 300);
				} else {
					foldingIcon.setVisible(true);
				}
			}
		}));
		this._foldingIconStore.add(dom.addDisposableListener(this._lineNumbersDomNode, dom.EventType.MOUSE_LEAVE, () => {
			for (const line of this._stickyLines) {
				const foldingIcon = line.foldingIcon;
				foldingIcon?.setVisible(foldingIcon.isCollapsed);
			}
		}));
	}

	private _renderChildNode(index: number, line: number, layoutInfo: EditorLayoutInfo, foldingModel: FoldingModel | null | undefined): RenderedStickyLine {
		const viewModel = this._editor._getViewModel();
		const viewLineNumber = viewModel!.coordinatesConverter.convertModelPositionToViewPosition(new Position(line, 1)).lineNumber;
		const lineRenderingData = viewModel!.getViewLineRenderingData(viewLineNumber);
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;
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
		lineHTMLNode.style.lineHeight = `${this._lineHeight}px`;
		lineHTMLNode.innerHTML = newLine as string;

		const lineNumberHTMLNode = document.createElement('span');
		lineNumberHTMLNode.className = 'sticky-line-number';
		lineNumberHTMLNode.style.lineHeight = `${this._lineHeight}px`;
		const lineNumbersWidth = minimapSide === 'left' ? layoutInfo.contentLeft - layoutInfo.minimap.minimapCanvasOuterWidth : layoutInfo.contentLeft;
		lineNumberHTMLNode.style.width = `${lineNumbersWidth}px`;

		const innerLineNumberHTML = document.createElement('span');
		if (lineNumberOption.renderType === RenderLineNumbersType.On || lineNumberOption.renderType === RenderLineNumbersType.Interval && line % 10 === 0) {
			innerLineNumberHTML.innerText = line.toString();
		} else if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
			innerLineNumberHTML.innerText = Math.abs(line - this._editor.getPosition()!.lineNumber).toString();
		}
		innerLineNumberHTML.className = 'sticky-line-number-inner';
		innerLineNumberHTML.style.lineHeight = `${this._lineHeight}px`;
		innerLineNumberHTML.style.width = `${layoutInfo.lineNumbersWidth}px`;
		innerLineNumberHTML.style.float = 'left';
		if (minimapSide === 'left') {
			innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft - layoutInfo.minimap.minimapCanvasOuterWidth}px`;
		} else if (minimapSide === 'right') {
			innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft}px`;
		}
		lineNumberHTMLNode.appendChild(innerLineNumberHTML);
		const foldingIcon = this._renderFoldingIconForLine(lineNumberHTMLNode, foldingModel, index, line);

		this._editor.applyFontInfo(lineHTMLNode);
		this._editor.applyFontInfo(innerLineNumberHTML);

		lineHTMLNode.setAttribute('role', 'listitem');
		lineHTMLNode.setAttribute(STICKY_LINE_INDEX_ATTR, String(index));
		lineHTMLNode.tabIndex = 0;

		lineNumberHTMLNode.style.lineHeight = `${this._lineHeight}px`;
		lineHTMLNode.style.lineHeight = `${this._lineHeight}px`;
		lineNumberHTMLNode.style.height = `${this._lineHeight}px`;
		lineHTMLNode.style.height = `${this._lineHeight}px`;

		// Special case for the last line of sticky scroll
		const isLastLine = index === this._lineNumbers.length - 1;

		const lastLineZIndex = '0';
		const intermediateLineZIndex = '1';
		lineHTMLNode.style.zIndex = isLastLine ? lastLineZIndex : intermediateLineZIndex;
		lineNumberHTMLNode.style.zIndex = isLastLine ? lastLineZIndex : intermediateLineZIndex;

		const lastLineTop = `${index * this._lineHeight + this._lastLineRelativePosition + (foldingIcon?.isCollapsed ? 1 : 0)}px`;
		const intermediateLineTop = `${index * this._lineHeight}px`;
		lineHTMLNode.style.top = isLastLine ? lastLineTop : intermediateLineTop;
		lineNumberHTMLNode.style.top = isLastLine ? lastLineTop : intermediateLineTop;
		return new RenderedStickyLine(line, lineHTMLNode, lineNumberHTMLNode, foldingIcon, renderOutput.characterMapping);
	}

	private _renderFoldingIconForLine(container: HTMLSpanElement, foldingModel: FoldingModel | null | undefined, index: number, line: number): StickyFoldingIcon | undefined {
		const showFoldingControls: 'mouseover' | 'always' | 'never' = this._editor.getOption(EditorOption.showFoldingControls);
		if (!foldingModel || showFoldingControls === 'never') {
			return;
		}
		const foldingRegions = foldingModel.regions;
		const indexOfFoldingRegion = foldingRegions.findRange(line);
		const startLineNumber = foldingRegions.getStartLineNumber(indexOfFoldingRegion);
		const isFoldingScope = line === startLineNumber;
		if (!isFoldingScope) {
			return;
		}
		const isCollapsed = foldingRegions.isCollapsed(indexOfFoldingRegion);
		const foldingIcon = new StickyFoldingIcon(isCollapsed, this._lineHeight);
		container.append(foldingIcon.domNode);
		foldingIcon.setVisible(isCollapsed || showFoldingControls === 'always');
		foldingIcon.setTransitionRequired(true);

		this._foldingIconStore.add(dom.addDisposableListener(foldingIcon.domNode, dom.EventType.CLICK, () => {
			toggleCollapseState(foldingModel, Number.MAX_VALUE, [line]);
			foldingIcon.isCollapsed = !isCollapsed;
			const scrollTop =
				(isCollapsed ?
					this._editor.getTopForLineNumber(startLineNumber)
					: this._editor.getTopForLineNumber(foldingRegions.getEndLineNumber(indexOfFoldingRegion)))
				- this._lineHeight * index + 1;
			this._editor.setScrollTop(scrollTop);
		}));
		return foldingIcon;
	}

	private _updateMinContentWidth() {
		this._minContentWidthInPx = 0;
		for (const stickyLine of this._stickyLines) {
			if (stickyLine.lineDomNode.scrollWidth > this._minContentWidthInPx) {
				this._minContentWidthInPx = stickyLine.lineDomNode.scrollWidth;
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
			this._stickyLines[index].lineDomNode.focus();
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
		const index = this.getStickyLineIndexFromChildDomNode(domNode);
		if (index === null || index < 0 || index >= this._stickyLines.length) {
			return null;
		}
		return this._stickyLines[index];
	}

	/**
	 * Given a child dom node, tries to find the line number attribute
	 * that was stored in the node. Returns null if none is found.
	 */
	getStickyLineIndexFromChildDomNode(domNode: HTMLElement | null): number | null {
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
		public readonly lineDomNode: HTMLElement,
		public readonly lineNumberDomNode: HTMLElement,
		public readonly foldingIcon: StickyFoldingIcon | undefined,
		public readonly characterMapping: CharacterMapping
	) { }
}

class StickyFoldingIcon {

	public domNode: HTMLElement;

	constructor(
		public isCollapsed: boolean,
		public dimension: number
	) {
		this.domNode = document.createElement('div');
		this.domNode.style.width = `${dimension}px`;
		this.domNode.style.height = `${dimension}px`;
		this.domNode.className = ThemeIcon.asClassName(isCollapsed ? foldingCollapsedIcon : foldingExpandedIcon);
	}

	public setVisible(visible: boolean) {
		this.domNode.style.cursor = visible ? 'pointer' : 'default';
		this.domNode.style.opacity = visible ? '1' : '0';
	}

	public setTransitionRequired(transitionRequired: boolean) {
		this.domNode.style.transition = `opacity ${transitionRequired ? 0.5 : 0}s`;
	}
}
