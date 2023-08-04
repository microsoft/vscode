/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { createTrustedTypesPolicy } from 'vs/base/browser/trustedTypes';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./stickyScroll';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorLayoutInfo, EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { foldingCollapsedIcon, foldingExpandedIcon } from 'vs/editor/contrib/folding/browser/foldingDecorations';
import { FoldingModel, toggleCollapseState } from 'vs/editor/contrib/folding/browser/foldingModel';

export class StickyScrollWidgetState {
	constructor(
		readonly lineNumbers: number[],
		readonly lastLineRelativePosition: number
	) { }
}

const _ttPolicy = createTrustedTypesPolicy('stickyScrollViewLayer', { createHTML: value => value });

export class StickyScrollWidget extends Disposable implements IOverlayWidget {

	private readonly _rootDomNode: HTMLElement = document.createElement('div');
	private readonly _scrollableLinesDomNode: HTMLElement;
	private readonly _lineNumbersDomNode: HTMLElement = document.createElement('div');
	private readonly _linesDomNode: HTMLElement = document.createElement('div');
	private readonly _disposableStore = this._register(new DisposableStore());

	private _lineNumbers: number[] = [];
	private _lastLineRelativePosition: number = 0;
	private _hoverOnLine: number = -1;
	private _hoverOnColumn: number = -1;
	private _bottomMostLine: number | undefined;
	private _minWidthInPixels: number | undefined;
	private _viewZoneId: string | undefined;

	constructor(
		private readonly _editor: ICodeEditor
	) {
		super();

		const layoutInfo = this._editor.getOption(EditorOption.layoutInfo);

		this._lineNumbersDomNode.className = 'sticky-widget-line-numbers';
		this._lineNumbersDomNode.style.width = `${layoutInfo.contentLeft}px`;
		this._lineNumbersDomNode.setAttribute('role', 'list');

		this._linesDomNode.className = 'sticky-widget-lines';
		this._linesDomNode.style.width = `${layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth - layoutInfo.contentLeft}px`;
		this._linesDomNode.setAttribute('role', 'list');

		const scrollbar = this._register(new DomScrollableElement(this._linesDomNode, { vertical: ScrollbarVisibility.Hidden, horizontal: ScrollbarVisibility.Hidden, handleMouseWheel: false }));
		this._scrollableLinesDomNode = scrollbar.getDomNode();
		this._scrollableLinesDomNode.className = 'sticky-widget-scrollable';

		this._rootDomNode.className = 'sticky-widget';
		this._rootDomNode.classList.toggle('peek', _editor instanceof EmbeddedCodeEditorWidget);
		this._rootDomNode.appendChild(this._lineNumbersDomNode);
		this._rootDomNode.appendChild(this._scrollableLinesDomNode);

		this._register(this._editor.onDidScrollChange((e) => {
			scrollbar.scanDomNode();
			scrollbar.setScrollPosition({ scrollLeft: e.scrollLeft });
		}));
		this._register(this._editor.onDidLayoutChange((e) => {
			this._updateWidgetWidth(e);
			scrollbar.scanDomNode();
		}));
		scrollbar.scanDomNode();
	}

	get hoverOnLine(): number {
		return this._hoverOnLine;
	}

	get hoverOnColumn(): number {
		return this._hoverOnColumn;
	}

	get lineNumbers(): number[] {
		return this._lineNumbers;
	}

	get codeLineCount(): number {
		return this._lineNumbers.length;
	}

	getCurrentLines(): readonly number[] {
		return this._lineNumbers;
	}

	setState(state: StickyScrollWidgetState): void {
		dom.clearNode(this._lineNumbersDomNode);
		dom.clearNode(this._linesDomNode);
		this._disposableStore.clear();
		this._lineNumbers.length = 0;
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

	private _renderLinesAndFindMaximumLineLength(layoutInfo: EditorLayoutInfo, foldingModel: FoldingModel | null): number {
		let maxLength = 0;
		for (const [index, line] of this._lineNumbers.entries()) {
			const { lineNumberHTMLNode, lineHTMLNode } = this._renderChildNode(index, line, layoutInfo, foldingModel);
			this._lineNumbersDomNode.appendChild(lineNumberHTMLNode);
			this._linesDomNode.appendChild(lineHTMLNode);
			if (lineHTMLNode.scrollWidth > maxLength) {
				maxLength = lineHTMLNode.scrollWidth;
			}
		}
		for (const child of this._linesDomNode.children) {
			if (child instanceof HTMLElement) {
				child.style.width = `${maxLength}px`;
			}
		}
		return maxLength;
	}

	private _updateWidgetWidth(layoutInfo: EditorLayoutInfo): void {
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;
		const lineNumbersWidth = minimapSide === 'left' ? layoutInfo.contentLeft - layoutInfo.minimap.minimapCanvasOuterWidth : layoutInfo.contentLeft;
		this._lineNumbersDomNode.style.width = `${lineNumbersWidth}px`;
		this._linesDomNode.style.width = `${layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth - lineNumbersWidth}px`;
	}

	private _updateWidgetHeight(height: number): void {
		const heightPx = `${height}px`;
		this._lineNumbersDomNode.style.height = heightPx;
		this._linesDomNode.style.height = heightPx;
		this._scrollableLinesDomNode.style.height = heightPx;
	}

	private _updateMarginLeft(): void {
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;
		if (minimapSide === 'left') {
			this._rootDomNode.style.marginLeft = this._editor.getLayoutInfo().minimap.minimapCanvasOuterWidth + 'px';
		}
	}

	private _updateViewZone(minWidthInPixels: number): void {
		this._editor.changeViewZones((changeAccessor) => {
			const bottomMostLine = this._editor.getVisibleRangesPlusViewportAboveBelow().pop()?.endLineNumber;
			if (bottomMostLine !== undefined && (this._bottomMostLine !== bottomMostLine || this._minWidthInPixels !== minWidthInPixels)) {
				if (this._viewZoneId) {
					changeAccessor.removeZone(this._viewZoneId);
					this._viewZoneId = undefined;
				}
				const domNode = document.createElement('div');
				this._bottomMostLine = bottomMostLine;
				this._minWidthInPixels = minWidthInPixels;
				this._viewZoneId = changeAccessor.addZone({
					afterLineNumber: bottomMostLine,
					suppressMouseDown: true,
					showInHiddenAreas: true,
					minWidthInPx: this._minWidthInPixels + 30,
					domNode,
				});
			}
		});
	}

	private async _renderRootNode(): Promise<void> {

		if (!this._editor._getViewModel()) {
			return;
		}

		// Folding
		let foldingModel: FoldingModel | null = null;
		const foldingController = FoldingController.get(this._editor);
		if (foldingController) {
			foldingModel = await foldingController.getFoldingModel();
		}
		// Folding

		const layoutInfo = this._editor.getLayoutInfo();
		const maxLineLength = this._renderLinesAndFindMaximumLineLength(layoutInfo, foldingModel);

		const editorLineHeight = this._editor.getOption(EditorOption.lineHeight);
		const widgetHeight: number = this._lineNumbers.length * editorLineHeight + this._lastLineRelativePosition;
		this._rootDomNode.style.display = widgetHeight > 0 ? 'block' : 'none';
		this._updateWidgetWidth(layoutInfo);
		this._updateWidgetHeight(widgetHeight);
		this._updateMarginLeft();
		this._updateViewZone(maxLineLength);
	}

	private _renderChildNode(index: number, line: number, layoutInfo: EditorLayoutInfo, foldingModel: FoldingModel | null): { lineNumberHTMLNode: HTMLSpanElement; lineHTMLNode: HTMLSpanElement } {
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
		renderViewLine(renderLineInput, sb);

		let newLine;
		if (_ttPolicy) {
			newLine = _ttPolicy.createHTML(sb.build() as string);
		} else {
			newLine = sb.build();
		}

		const lineHTMLNode = document.createElement('span');
		lineHTMLNode.className = 'sticky-line';
		lineHTMLNode.classList.add(`stickyLine${line}`);
		lineHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineHTMLNode.innerHTML = newLine as string;

		const lineNumberHTMLNode = document.createElement('span');
		lineNumberHTMLNode.className = 'sticky-line-number';
		lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
		const lineNumbersWidth = minimapSide === 'left' ? layoutInfo.contentLeft - layoutInfo.minimap.minimapCanvasOuterWidth : layoutInfo.contentLeft;
		lineNumberHTMLNode.style.width = `${lineNumbersWidth}px`;

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

		innerLineNumberHTML.style.float = 'left';
		if (foldingModel) {
			const foldingRegions = foldingModel.regions;
			const indexOfLine = foldingRegions.findRange(line);
			const isCollapsed = foldingRegions.isCollapsed(indexOfLine);
			const startLineNumber = foldingRegions.getStartLineNumber(indexOfLine);
			const isFoldingLine = line === startLineNumber;

			if (isFoldingLine) {
				const divToUnfold = document.createElement('div');
				divToUnfold.style.float = 'right';
				if (isCollapsed) {
					divToUnfold.className = ThemeIcon.asClassName(foldingCollapsedIcon);
				} else {
					divToUnfold.className = ThemeIcon.asClassName(foldingExpandedIcon);
				}
				divToUnfold.style.transition = 'opacity 250ms linear';
				divToUnfold.style.opacity = '0';
				divToUnfold.style.height = '0px';
				divToUnfold.style.cursor = 'default';

				divToUnfold.classList.add('unfold-icon');
				lineNumberHTMLNode.append(divToUnfold);

				let collapsed = isCollapsed;

				this._disposableStore.add(dom.addDisposableListener(divToUnfold, dom.EventType.CLICK, () => {
					console.log('line : ', line);

					const scrollTop = this._editor.getTopForLineNumber(line) + 1;
					console.log('scrollTop : ', scrollTop);
					toggleCollapseState(foldingModel, Number.MAX_VALUE, [line]);
					collapsed = !collapsed;
					// TODO: Likely a more complicated mathematical equation that involves finding the position given the new number of lines in the sticky widget
					// there appears to be an error here, doesn't behave exactly as expected
					const newHeight = scrollTop - (collapsed ? 0 : 18);
					console.log('newHeight : ', newHeight);
					this._editor.setScrollTop(newHeight);
				}));

				this._disposableStore.add(dom.addDisposableListener(lineNumberHTMLNode, dom.EventType.MOUSE_OVER, () => {
					divToUnfold.style.opacity = '1';
					divToUnfold.style.height = '18px';
					divToUnfold.style.width = '18px';
					divToUnfold.style.cursor = 'pointer';
				}));
				this._disposableStore.add(dom.addDisposableListener(lineNumberHTMLNode, dom.EventType.MOUSE_OUT, () => {
					divToUnfold.style.transition = 'opacity 250ms linear';
					divToUnfold.style.opacity = '0';
					divToUnfold.style.height = '0px';
					divToUnfold.style.cursor = 'default';
				}));
			}
		}

		this._editor.applyFontInfo(lineHTMLNode);
		this._editor.applyFontInfo(innerLineNumberHTML);

		lineHTMLNode.setAttribute('role', 'listitem');
		lineNumberHTMLNode.setAttribute('role', 'listitem');
		lineHTMLNode.style.height = `${lineHeight}px`;
		lineNumberHTMLNode.style.height = `${lineHeight}px`;

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

		// Each child has a listener which fires when the mouse hovers over the child
		this._disposableStore.add(dom.addDisposableListener(lineHTMLNode, 'mouseover', (e) => {
			if (this._editor.hasModel()) {
				const mouseOverEvent = new StandardMouseEvent(e);
				const text = mouseOverEvent.target.innerText;

				// Line and column number of the hover needed for the control clicking feature
				this._hoverOnLine = line;
				// TODO: workaround to find the column index, perhaps need a more solid solution
				this._hoverOnColumn = this._editor.getModel().getLineContent(line).indexOf(text) + 1 || -1;
			}
		}));

		return { lineNumberHTMLNode, lineHTMLNode };
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
}
