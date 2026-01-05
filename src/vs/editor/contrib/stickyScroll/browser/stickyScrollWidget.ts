/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../base/browser/trustedTypes.js';
import { equals } from '../../../../base/common/arrays.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import './stickyScroll.css';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../browser/editorBrowser.js';
import { getColumnOfNodeOffset } from '../../../browser/viewParts/viewLines/viewLine.js';
import { EmbeddedCodeEditorWidget } from '../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorLayoutInfo, EditorOption, RenderLineNumbersType } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { StringBuilder } from '../../../common/core/stringBuilder.js';
import { LineDecoration } from '../../../common/viewLayout/lineDecorations.js';
import { CharacterMapping, RenderLineInput, renderViewLine } from '../../../common/viewLayout/viewLineRenderer.js';
import { foldingCollapsedIcon, foldingExpandedIcon } from '../../folding/browser/foldingDecorations.js';
import { FoldingModel } from '../../folding/browser/foldingModel.js';
import { Emitter } from '../../../../base/common/event.js';
import { IViewModel } from '../../../common/viewModel.js';

export class StickyScrollWidgetState {
	constructor(
		readonly startLineNumbers: number[],
		readonly endLineNumbers: number[],
		readonly lastLineRelativePosition: number,
		readonly showEndForLine: number | null = null
	) { }

	equals(other: StickyScrollWidgetState | undefined): boolean {
		return !!other
			&& this.lastLineRelativePosition === other.lastLineRelativePosition
			&& this.showEndForLine === other.showEndForLine
			&& equals(this.startLineNumbers, other.startLineNumbers)
			&& equals(this.endLineNumbers, other.endLineNumbers);
	}

	static get Empty() {
		return new StickyScrollWidgetState([], [], 0);
	}
}

const _ttPolicy = createTrustedTypesPolicy('stickyScrollViewLayer', { createHTML: value => value });
const STICKY_INDEX_ATTR = 'data-sticky-line-index';
const STICKY_IS_LINE_ATTR = 'data-sticky-is-line';
const STICKY_IS_LINE_NUMBER_ATTR = 'data-sticky-is-line-number';
const STICKY_IS_FOLDING_ICON_ATTR = 'data-sticky-is-folding-icon';

export class StickyScrollWidget extends Disposable implements IOverlayWidget {

	private readonly _foldingIconStore = this._register(new DisposableStore());
	private readonly _rootDomNode: HTMLElement = document.createElement('div');
	private readonly _lineNumbersDomNode: HTMLElement = document.createElement('div');
	private readonly _linesDomNodeScrollable: HTMLElement = document.createElement('div');
	private readonly _linesDomNode: HTMLElement = document.createElement('div');

	private readonly _editor: ICodeEditor;

	private _state: StickyScrollWidgetState | undefined;
	private _renderedStickyLines: RenderedStickyLine[] = [];
	private _lineNumbers: number[] = [];
	private _lastLineRelativePosition: number = 0;
	private _minContentWidthInPx: number = 0;
	private _isOnGlyphMargin: boolean = false;
	private _height: number = -1;

	public get height(): number { return this._height; }

	private readonly _onDidChangeStickyScrollHeight = this._register(new Emitter<{ height: number }>());
	public readonly onDidChangeStickyScrollHeight = this._onDidChangeStickyScrollHeight.event;

	constructor(
		editor: ICodeEditor
	) {
		super();

		this._editor = editor;
		this._lineNumbersDomNode.className = 'sticky-widget-line-numbers';
		this._lineNumbersDomNode.setAttribute('role', 'none');

		this._linesDomNode.className = 'sticky-widget-lines';
		this._linesDomNode.setAttribute('role', 'list');

		this._linesDomNodeScrollable.className = 'sticky-widget-lines-scrollable';
		this._linesDomNodeScrollable.appendChild(this._linesDomNode);

		this._rootDomNode.className = 'sticky-widget';
		this._rootDomNode.classList.toggle('peek', editor instanceof EmbeddedCodeEditorWidget);
		this._rootDomNode.appendChild(this._lineNumbersDomNode);
		this._rootDomNode.appendChild(this._linesDomNodeScrollable);
		this._setHeight(0);

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
		this._register(this._editor.onDidChangeModel(() => {
			updateScrollLeftPosition();
			this._updateWidgetWidth();
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

	getRenderedStickyLine(lineNumber: number): RenderedStickyLine | undefined {
		return this._renderedStickyLines.find(stickyLine => stickyLine.lineNumber === lineNumber);
	}

	getCurrentLines(): readonly number[] {
		return this._lineNumbers;
	}

	setState(state: StickyScrollWidgetState | undefined, foldingModel: FoldingModel | undefined, rebuildFromIndexCandidate?: number): void {
		const currentStateAndPreviousStateUndefined = !this._state && !state;
		const currentStateDefinedAndEqualsPreviousState = this._state && this._state.equals(state);
		if (rebuildFromIndexCandidate === undefined && (currentStateAndPreviousStateUndefined || currentStateDefinedAndEqualsPreviousState)) {
			return;
		}
		const data = this._findRenderingData(state);
		const previousLineNumbers = this._lineNumbers;
		this._lineNumbers = data.lineNumbers;
		this._lastLineRelativePosition = data.lastLineRelativePosition;
		const rebuildFromIndex = this._findIndexToRebuildFrom(previousLineNumbers, this._lineNumbers, rebuildFromIndexCandidate);
		this._renderRootNode(this._lineNumbers, this._lastLineRelativePosition, foldingModel, rebuildFromIndex);
		this._state = state;
	}

	private _findRenderingData(state: StickyScrollWidgetState | undefined): { lineNumbers: number[]; lastLineRelativePosition: number } {
		if (!state) {
			return { lineNumbers: [], lastLineRelativePosition: 0 };
		}
		const candidateLineNumbers = [...state.startLineNumbers];
		if (state.showEndForLine !== null) {
			candidateLineNumbers[state.showEndForLine] = state.endLineNumbers[state.showEndForLine];
		}
		let totalHeight = 0;
		for (let i = 0; i < candidateLineNumbers.length; i++) {
			totalHeight += this._editor.getLineHeightForPosition(new Position(candidateLineNumbers[i], 1));
		}
		if (totalHeight === 0) {
			return { lineNumbers: [], lastLineRelativePosition: 0 };
		}
		return { lineNumbers: candidateLineNumbers, lastLineRelativePosition: state.lastLineRelativePosition };
	}

	private _findIndexToRebuildFrom(previousLineNumbers: number[], newLineNumbers: number[], rebuildFromIndexCandidate?: number): number {
		if (newLineNumbers.length === 0) {
			return 0;
		}
		if (rebuildFromIndexCandidate !== undefined) {
			return rebuildFromIndexCandidate;
		}
		const validIndex = newLineNumbers.findIndex(startLineNumber => !previousLineNumbers.includes(startLineNumber));
		return validIndex === -1 ? 0 : validIndex;
	}

	private _updateWidgetWidth(): void {
		const layoutInfo = this._editor.getLayoutInfo();
		const lineNumbersWidth = layoutInfo.contentLeft;
		this._lineNumbersDomNode.style.width = `${lineNumbersWidth}px`;
		this._linesDomNodeScrollable.style.setProperty('--vscode-editorStickyScroll-scrollableWidth', `${this._editor.getScrollWidth() - layoutInfo.verticalScrollbarWidth}px`);
		this._rootDomNode.style.width = `${layoutInfo.width - layoutInfo.verticalScrollbarWidth}px`;
	}

	private _useFoldingOpacityTransition(requireTransitions: boolean) {
		this._lineNumbersDomNode.style.setProperty('--vscode-editorStickyScroll-foldingOpacityTransition', `opacity ${requireTransitions ? 0.5 : 0}s`);
	}

	private _setFoldingIconsVisibility(allVisible: boolean) {
		for (const line of this._renderedStickyLines) {
			const foldingIcon = line.foldingIcon;
			if (!foldingIcon) {
				continue;
			}
			foldingIcon.setVisible(allVisible ? true : foldingIcon.isCollapsed);
		}
	}

	private async _renderRootNode(lineNumbers: number[], lastLineRelativePosition: number, foldingModel: FoldingModel | undefined, rebuildFromIndex: number): Promise<void> {
		const viewModel = this._editor._getViewModel();
		if (!viewModel) {
			this._clearWidget();
			return;
		}
		if (lineNumbers.length === 0) {
			this._clearWidget();
			return;
		}
		const renderedStickyLines: RenderedStickyLine[] = [];
		const lastLineNumber = lineNumbers[lineNumbers.length - 1];
		let top: number = 0;
		for (let i = 0; i < this._renderedStickyLines.length; i++) {
			if (i < rebuildFromIndex) {
				const renderedLine = this._renderedStickyLines[i];
				renderedStickyLines.push(this._updatePosition(renderedLine, top, renderedLine.lineNumber === lastLineNumber));
				top += renderedLine.height;
			} else {
				const renderedLine = this._renderedStickyLines[i];
				renderedLine.lineNumberDomNode.remove();
				renderedLine.lineDomNode.remove();
			}
		}
		const layoutInfo = this._editor.getLayoutInfo();
		for (let i = rebuildFromIndex; i < lineNumbers.length; i++) {
			const stickyLine = this._renderChildNode(viewModel, i, lineNumbers[i], top, lastLineNumber === lineNumbers[i], foldingModel, layoutInfo);
			top += stickyLine.height;
			this._linesDomNode.appendChild(stickyLine.lineDomNode);
			this._lineNumbersDomNode.appendChild(stickyLine.lineNumberDomNode);
			renderedStickyLines.push(stickyLine);
		}
		if (foldingModel) {
			this._setFoldingHoverListeners();
			this._useFoldingOpacityTransition(!this._isOnGlyphMargin);
		}
		this._minContentWidthInPx = Math.max(...this._renderedStickyLines.map(l => l.scrollWidth)) + layoutInfo.verticalScrollbarWidth;
		this._renderedStickyLines = renderedStickyLines;
		this._setHeight(top + lastLineRelativePosition);
		this._editor.layoutOverlayWidget(this);
	}

	private _clearWidget(): void {
		for (let i = 0; i < this._renderedStickyLines.length; i++) {
			const stickyLine = this._renderedStickyLines[i];
			stickyLine.lineNumberDomNode.remove();
			stickyLine.lineDomNode.remove();
		}
		this._setHeight(0);
	}

	private _setHeight(height: number): void {
		if (this._height === height) {
			return;
		}
		this._height = height;

		if (this._height === 0) {
			this._rootDomNode.style.display = 'none';
		} else {
			this._rootDomNode.style.display = 'block';
			this._lineNumbersDomNode.style.height = `${this._height}px`;
			this._linesDomNodeScrollable.style.height = `${this._height}px`;
			this._rootDomNode.style.height = `${this._height}px`;
		}

		this._onDidChangeStickyScrollHeight.fire({ height: this._height });
	}

	private _setFoldingHoverListeners(): void {
		this._foldingIconStore.clear();
		const showFoldingControls: 'mouseover' | 'always' | 'never' = this._editor.getOption(EditorOption.showFoldingControls);
		if (showFoldingControls !== 'mouseover') {
			return;
		}
		this._foldingIconStore.clear();
		this._foldingIconStore.add(dom.addDisposableListener(this._lineNumbersDomNode, dom.EventType.MOUSE_ENTER, () => {
			this._isOnGlyphMargin = true;
			this._setFoldingIconsVisibility(true);
		}));
		this._foldingIconStore.add(dom.addDisposableListener(this._lineNumbersDomNode, dom.EventType.MOUSE_LEAVE, () => {
			this._isOnGlyphMargin = false;
			this._useFoldingOpacityTransition(true);
			this._setFoldingIconsVisibility(false);
		}));
	}

	private _renderChildNode(viewModel: IViewModel, index: number, line: number, top: number, isLastLine: boolean, foldingModel: FoldingModel | undefined, layoutInfo: EditorLayoutInfo): RenderedStickyLine {

		const renderedLine = new RenderedStickyLine(
			this._editor,
			viewModel,
			layoutInfo,
			foldingModel,
			this._isOnGlyphMargin,
			index,
			line
		);
		return this._updatePosition(renderedLine, top, isLastLine);
	}

	private _updatePosition(stickyLine: RenderedStickyLine, top: number, isLastLine: boolean): RenderedStickyLine {
		const lineHTMLNode = stickyLine.lineDomNode;
		const lineNumberHTMLNode = stickyLine.lineNumberDomNode;
		if (isLastLine) {
			const zIndex = '0';
			lineHTMLNode.style.zIndex = zIndex;
			lineNumberHTMLNode.style.zIndex = zIndex;
			const updatedTop = `${top + this._lastLineRelativePosition + (stickyLine.foldingIcon?.isCollapsed ? 1 : 0)}px`;
			lineHTMLNode.style.top = updatedTop;
			lineNumberHTMLNode.style.top = updatedTop;
		} else {
			const zIndex = '1';
			lineHTMLNode.style.zIndex = zIndex;
			lineNumberHTMLNode.style.zIndex = zIndex;
			lineHTMLNode.style.top = `${top}px`;
			lineNumberHTMLNode.style.top = `${top}px`;
		}
		return stickyLine;
	}

	getId(): string {
		return 'editor.contrib.stickyScrollWidget';
	}

	getDomNode(): HTMLElement {
		return this._rootDomNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: OverlayWidgetPositionPreference.TOP_CENTER,
			stackOrdinal: 10,
		};
	}

	getMinContentWidthInPx(): number {
		return this._minContentWidthInPx;
	}

	focusLineWithIndex(index: number) {
		if (0 <= index && index < this._renderedStickyLines.length) {
			this._renderedStickyLines[index].lineDomNode.focus();
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
		const index = this.getLineIndexFromChildDomNode(domNode);
		if (index === null || index < 0 || index >= this._renderedStickyLines.length) {
			return null;
		}
		return this._renderedStickyLines[index];
	}

	/**
	 * Given a child dom node, tries to find the line number attribute that was stored in the node.
	 * @returns the attribute value or null if none is found.
	 */
	getLineIndexFromChildDomNode(domNode: HTMLElement | null): number | null {
		const lineIndex = this._getAttributeValue(domNode, STICKY_INDEX_ATTR);
		return lineIndex ? parseInt(lineIndex, 10) : null;
	}

	/**
	 * Given a child dom node, tries to find if it is (contained in) a sticky line.
	 * @returns a boolean.
	 */
	isInStickyLine(domNode: HTMLElement | null): boolean {
		const isInLine = this._getAttributeValue(domNode, STICKY_IS_LINE_ATTR);
		return isInLine !== undefined;
	}

	/**
	 * Given a child dom node, tries to find if this dom node is (contained in) a sticky folding icon.
	 * @returns a boolean.
	 */
	isInFoldingIconDomNode(domNode: HTMLElement | null): boolean {
		const isInFoldingIcon = this._getAttributeValue(domNode, STICKY_IS_FOLDING_ICON_ATTR);
		return isInFoldingIcon !== undefined;
	}

	/**
	 * Given the dom node, finds if it or its parent sequence contains the given attribute.
	 * @returns the attribute value or undefined.
	 */
	private _getAttributeValue(domNode: HTMLElement | null, attribute: string): string | undefined {
		while (domNode && domNode !== this._rootDomNode) {
			const line = domNode.getAttribute(attribute);
			if (line !== null) {
				return line;
			}
			domNode = domNode.parentElement;
		}
		return;
	}
}

class RenderedStickyLine {

	public readonly lineDomNode: HTMLElement;
	public readonly lineNumberDomNode: HTMLElement;

	public readonly foldingIcon: StickyFoldingIcon | undefined;
	public readonly characterMapping: CharacterMapping;

	public readonly scrollWidth: number;
	public readonly height: number;

	constructor(
		editor: ICodeEditor,
		viewModel: IViewModel,
		layoutInfo: EditorLayoutInfo,
		foldingModel: FoldingModel | undefined,
		isOnGlyphMargin: boolean,
		public readonly index: number,
		public readonly lineNumber: number,
	) {
		const viewLineNumber = viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(lineNumber, 1)).lineNumber;
		const lineRenderingData = viewModel.getViewLineRenderingData(viewLineNumber);
		const lineNumberOption = editor.getOption(EditorOption.lineNumbers);
		const verticalScrollbarSize = editor.getOption(EditorOption.scrollbar).verticalScrollbarSize;

		let actualInlineDecorations: LineDecoration[];
		try {
			actualInlineDecorations = LineDecoration.filter(lineRenderingData.inlineDecorations, viewLineNumber, lineRenderingData.minColumn, lineRenderingData.maxColumn);
		} catch (err) {
			actualInlineDecorations = [];
		}

		const lineHeight = editor.getLineHeightForPosition(new Position(lineNumber, 1));
		const textDirection = viewModel.getTextDirection(lineNumber);
		const renderLineInput: RenderLineInput = new RenderLineInput(true, true, lineRenderingData.content,
			lineRenderingData.continuesWithWrappedLine,
			lineRenderingData.isBasicASCII, lineRenderingData.containsRTL, 0,
			lineRenderingData.tokens, actualInlineDecorations,
			lineRenderingData.tabSize, lineRenderingData.startVisibleColumn,
			1, 1, 1, 500, 'none', true, true, null,
			textDirection, verticalScrollbarSize
		);

		const sb = new StringBuilder(2000);
		const renderOutput = renderViewLine(renderLineInput, sb);
		this.characterMapping = renderOutput.characterMapping;

		let newLine;
		if (_ttPolicy) {
			newLine = _ttPolicy.createHTML(sb.build());
		} else {
			newLine = sb.build();
		}

		const lineHTMLNode = document.createElement('span');
		lineHTMLNode.setAttribute(STICKY_INDEX_ATTR, String(index));
		lineHTMLNode.setAttribute(STICKY_IS_LINE_ATTR, '');
		lineHTMLNode.setAttribute('role', 'listitem');
		lineHTMLNode.tabIndex = 0;
		lineHTMLNode.className = 'sticky-line-content';
		lineHTMLNode.classList.add(`stickyLine${lineNumber}`);
		lineHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineHTMLNode.innerHTML = newLine as string;

		const lineNumberHTMLNode = document.createElement('span');
		lineNumberHTMLNode.setAttribute(STICKY_INDEX_ATTR, String(index));
		lineNumberHTMLNode.setAttribute(STICKY_IS_LINE_NUMBER_ATTR, '');
		lineNumberHTMLNode.className = 'sticky-line-number';
		lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
		const lineNumbersWidth = layoutInfo.contentLeft;
		lineNumberHTMLNode.style.width = `${lineNumbersWidth}px`;

		const innerLineNumberHTML = document.createElement('span');
		if (lineNumberOption.renderType === RenderLineNumbersType.On || lineNumberOption.renderType === RenderLineNumbersType.Interval && lineNumber % 10 === 0) {
			innerLineNumberHTML.innerText = lineNumber.toString();
		} else if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
			innerLineNumberHTML.innerText = Math.abs(lineNumber - editor.getPosition()!.lineNumber).toString();
		}
		innerLineNumberHTML.className = 'sticky-line-number-inner';
		innerLineNumberHTML.style.width = `${layoutInfo.lineNumbersWidth}px`;
		innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft}px`;

		lineNumberHTMLNode.appendChild(innerLineNumberHTML);
		const foldingIcon = this._renderFoldingIconForLine(editor, foldingModel, lineNumber, lineHeight, isOnGlyphMargin);
		if (foldingIcon) {
			lineNumberHTMLNode.appendChild(foldingIcon.domNode);
			foldingIcon.domNode.style.left = `${layoutInfo.lineNumbersWidth + layoutInfo.lineNumbersLeft}px`;
			foldingIcon.domNode.style.lineHeight = `${lineHeight}px`;
		}

		editor.applyFontInfo(lineHTMLNode);
		editor.applyFontInfo(lineNumberHTMLNode);

		lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineNumberHTMLNode.style.height = `${lineHeight}px`;
		lineHTMLNode.style.height = `${lineHeight}px`;

		this.scrollWidth = lineHTMLNode.scrollWidth;
		this.lineDomNode = lineHTMLNode;
		this.lineNumberDomNode = lineNumberHTMLNode;
		this.height = lineHeight;
	}

	private _renderFoldingIconForLine(editor: ICodeEditor, foldingModel: FoldingModel | undefined, line: number, lineHeight: number, isOnGlyphMargin: boolean): StickyFoldingIcon | undefined {
		const showFoldingControls: 'mouseover' | 'always' | 'never' = editor.getOption(EditorOption.showFoldingControls);
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
		const foldingIcon = new StickyFoldingIcon(isCollapsed, startLineNumber, foldingRegions.getEndLineNumber(indexOfFoldingRegion), lineHeight);
		foldingIcon.setVisible(isOnGlyphMargin ? true : (isCollapsed || showFoldingControls === 'always'));
		foldingIcon.domNode.setAttribute(STICKY_IS_FOLDING_ICON_ATTR, '');
		return foldingIcon;
	}
}

class StickyFoldingIcon {

	public domNode: HTMLElement;

	constructor(
		public isCollapsed: boolean,
		public foldingStartLine: number,
		public foldingEndLine: number,
		public dimension: number
	) {
		this.domNode = document.createElement('div');
		this.domNode.style.width = `26px`;
		this.domNode.style.height = `${dimension}px`;
		this.domNode.style.lineHeight = `${dimension}px`;
		this.domNode.className = ThemeIcon.asClassName(isCollapsed ? foldingCollapsedIcon : foldingExpandedIcon);
	}

	public setVisible(visible: boolean) {
		this.domNode.style.cursor = visible ? 'pointer' : 'default';
		this.domNode.style.opacity = visible ? '1' : '0';
	}
}
