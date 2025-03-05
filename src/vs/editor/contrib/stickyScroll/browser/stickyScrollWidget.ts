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

	private readonly _foldingIconStore = new DisposableStore();
	private readonly _rootDomNode: HTMLElement = document.createElement('div');
	private readonly _lineNumbersDomNode: HTMLElement = document.createElement('div');
	private readonly _linesDomNodeScrollable: HTMLElement = document.createElement('div');
	private readonly _linesDomNode: HTMLElement = document.createElement('div');

	private _previousState: StickyScrollWidgetState | undefined;
	private _lineHeight: number = this._editor.getOption(EditorOption.lineHeight);
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
		this._setHeight(0);

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

	getRenderedStickyLine(lineNumber: number): RenderedStickyLine | undefined {
		return this._renderedStickyLines.find(stickyLine => stickyLine.lineNumber === lineNumber);
	}

	getCurrentLines(): readonly number[] {
		return this._lineNumbers;
	}

	setState(_state: StickyScrollWidgetState | undefined, foldingModel: FoldingModel | undefined, _rebuildFromLine?: number): void {
		if (_rebuildFromLine === undefined &&
			((!this._previousState && !_state) || (this._previousState && this._previousState.equals(_state)))
		) {
			return;
		}
		const isWidgetHeightZero = this._isWidgetHeightZero(_state);
		const state = isWidgetHeightZero ? undefined : _state;
		const rebuildFromLine = isWidgetHeightZero ? 0 : this._findLineToRebuildWidgetFrom(_state, _rebuildFromLine);

		this._renderRootNode(state, foldingModel, rebuildFromLine);
		this._previousState = _state;
	}

	private _isWidgetHeightZero(state: StickyScrollWidgetState | undefined): boolean {
		if (!state) {
			return true;
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
		return futureWidgetHeight === 0;
	}

	private _findLineToRebuildWidgetFrom(state: StickyScrollWidgetState | undefined, _rebuildFromLine?: number): number {
		if (!state || !this._previousState) {
			return 0;
		}
		if (_rebuildFromLine !== undefined) {
			return _rebuildFromLine;
		}
		const previousState = this._previousState;
		const indexOfLinesAlreadyRendered = state.startLineNumbers.findIndex(startLineNumber => !previousState.startLineNumbers.includes(startLineNumber));
		return (indexOfLinesAlreadyRendered === -1) ? 0 : indexOfLinesAlreadyRendered;
	}

	private _updateWidgetWidth(): void {
		const layoutInfo = this._editor.getLayoutInfo();
		const lineNumbersWidth = layoutInfo.contentLeft;
		this._lineNumbersDomNode.style.width = `${lineNumbersWidth}px`;
		this._linesDomNodeScrollable.style.setProperty('--vscode-editorStickyScroll-scrollableWidth', `${this._editor.getScrollWidth() - layoutInfo.verticalScrollbarWidth}px`);
		this._rootDomNode.style.width = `${layoutInfo.width - layoutInfo.verticalScrollbarWidth}px`;
	}

	private _clearStickyLinesFromLine(clearFromLine: number) {
		this._foldingIconStore.clear();
		// Removing only the lines that need to be rerendered
		for (let i = clearFromLine; i < this._renderedStickyLines.length; i++) {
			const stickyLine = this._renderedStickyLines[i];
			stickyLine.lineNumberDomNode.remove();
			stickyLine.lineDomNode.remove();
		}
		// Keep the lines that need to be updated
		this._renderedStickyLines = this._renderedStickyLines.slice(0, clearFromLine);
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

	private async _renderRootNode(state: StickyScrollWidgetState | undefined, foldingModel: FoldingModel | undefined, rebuildFromLine: number): Promise<void> {
		this._clearStickyLinesFromLine(rebuildFromLine);
		if (!state) {
			// make sure the dom is 0 height and display:none
			this._setHeight(0);
			return;
		}
		// For existing sticky lines update the top and z-index
		for (const stickyLine of this._renderedStickyLines) {
			this._updateTopAndZIndexOfStickyLine(stickyLine);
		}
		// For new sticky lines
		const layoutInfo = this._editor.getLayoutInfo();
		const linesToRender = this._lineNumbers.slice(rebuildFromLine);
		for (const [index, line] of linesToRender.entries()) {
			const stickyLine = this._renderChildNode(index + rebuildFromLine, line, foldingModel, layoutInfo);
			if (!stickyLine) {
				continue;
			}
			this._linesDomNode.appendChild(stickyLine.lineDomNode);
			this._lineNumbersDomNode.appendChild(stickyLine.lineNumberDomNode);
			this._renderedStickyLines.push(stickyLine);
		}
		if (foldingModel) {
			this._setFoldingHoverListeners();
			this._useFoldingOpacityTransition(!this._isOnGlyphMargin);
		}

		const widgetHeight = this._lineNumbers.length * this._lineHeight + this._lastLineRelativePosition;
		this._setHeight(widgetHeight);

		this._rootDomNode.style.marginLeft = '0px';
		this._minContentWidthInPx = Math.max(...this._renderedStickyLines.map(l => l.scrollWidth)) + layoutInfo.verticalScrollbarWidth;
		this._editor.layoutOverlayWidget(this);
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
		const showFoldingControls: 'mouseover' | 'always' | 'never' = this._editor.getOption(EditorOption.showFoldingControls);
		if (showFoldingControls !== 'mouseover') {
			return;
		}
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

	private _renderChildNode(index: number, line: number, foldingModel: FoldingModel | undefined, layoutInfo: EditorLayoutInfo): RenderedStickyLine | undefined {
		const viewModel = this._editor._getViewModel();
		if (!viewModel) {
			return;
		}
		const viewLineNumber = viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(line, 1)).lineNumber;
		const lineRenderingData = viewModel.getViewLineRenderingData(viewLineNumber);
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
		lineHTMLNode.classList.add(`stickyLine${line}`);
		lineHTMLNode.style.lineHeight = `${this._lineHeight}px`;
		lineHTMLNode.innerHTML = newLine as string;

		const lineNumberHTMLNode = document.createElement('span');
		lineNumberHTMLNode.setAttribute(STICKY_INDEX_ATTR, String(index));
		lineNumberHTMLNode.setAttribute(STICKY_IS_LINE_NUMBER_ATTR, '');
		lineNumberHTMLNode.className = 'sticky-line-number';
		lineNumberHTMLNode.style.lineHeight = `${this._lineHeight}px`;
		const lineNumbersWidth = layoutInfo.contentLeft;
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
		innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft}px`;

		lineNumberHTMLNode.appendChild(innerLineNumberHTML);
		const foldingIcon = this._renderFoldingIconForLine(foldingModel, line);
		if (foldingIcon) {
			lineNumberHTMLNode.appendChild(foldingIcon.domNode);
			foldingIcon.domNode.style.left = `${layoutInfo.lineNumbersWidth + layoutInfo.lineNumbersLeft}px`;
		}

		this._editor.applyFontInfo(lineHTMLNode);
		this._editor.applyFontInfo(lineNumberHTMLNode);


		lineNumberHTMLNode.style.lineHeight = `${this._lineHeight}px`;
		lineHTMLNode.style.lineHeight = `${this._lineHeight}px`;
		lineNumberHTMLNode.style.height = `${this._lineHeight}px`;
		lineHTMLNode.style.height = `${this._lineHeight}px`;

		const renderedLine = new RenderedStickyLine(index, line, lineHTMLNode, lineNumberHTMLNode, foldingIcon, renderOutput.characterMapping, lineHTMLNode.scrollWidth);
		return this._updateTopAndZIndexOfStickyLine(renderedLine);
	}

	private _updateTopAndZIndexOfStickyLine(stickyLine: RenderedStickyLine): RenderedStickyLine {
		const index = stickyLine.index;
		const lineHTMLNode = stickyLine.lineDomNode;
		const lineNumberHTMLNode = stickyLine.lineNumberDomNode;
		const isLastLine = index === this._lineNumbers.length - 1;

		const lastLineZIndex = '0';
		const intermediateLineZIndex = '1';
		lineHTMLNode.style.zIndex = isLastLine ? lastLineZIndex : intermediateLineZIndex;
		lineNumberHTMLNode.style.zIndex = isLastLine ? lastLineZIndex : intermediateLineZIndex;

		const lastLineTop = `${index * this._lineHeight + this._lastLineRelativePosition + (stickyLine.foldingIcon?.isCollapsed ? 1 : 0)}px`;
		const intermediateLineTop = `${index * this._lineHeight}px`;
		lineHTMLNode.style.top = isLastLine ? lastLineTop : intermediateLineTop;
		lineNumberHTMLNode.style.top = isLastLine ? lastLineTop : intermediateLineTop;
		return stickyLine;
	}

	private _renderFoldingIconForLine(foldingModel: FoldingModel | undefined, line: number): StickyFoldingIcon | undefined {
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
		const foldingIcon = new StickyFoldingIcon(isCollapsed, startLineNumber, foldingRegions.getEndLineNumber(indexOfFoldingRegion), this._lineHeight);
		foldingIcon.setVisible(this._isOnGlyphMargin ? true : (isCollapsed || showFoldingControls === 'always'));
		foldingIcon.domNode.setAttribute(STICKY_IS_FOLDING_ICON_ATTR, '');
		return foldingIcon;
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
			stackOridinal: 10,
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
	constructor(
		public readonly index: number,
		public readonly lineNumber: number,
		public readonly lineDomNode: HTMLElement,
		public readonly lineNumberDomNode: HTMLElement,
		public readonly foldingIcon: StickyFoldingIcon | undefined,
		public readonly characterMapping: CharacterMapping,
		public readonly scrollWidth: number,
	) { }
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
