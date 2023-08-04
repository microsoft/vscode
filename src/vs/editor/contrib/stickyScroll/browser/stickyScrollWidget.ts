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
import 'vs/css!./stickyScroll';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';

export class StickyScrollWidgetState {
	constructor(
		readonly lineNumbers: number[],
		readonly lastLineRelativePosition: number
	) { }
}

const _ttPolicy = createTrustedTypesPolicy('stickyScrollViewLayer', { createHTML: value => value });

export class StickyScrollWidget extends Disposable implements IOverlayWidget {

	private readonly _rootDomNode: HTMLElement = document.createElement('div');
	private readonly _lineNumbersDomNode: HTMLElement = document.createElement('div');
	private readonly _linesDomNode: HTMLElement = document.createElement('div');
	private readonly _disposableStore = this._register(new DisposableStore());

	private _lineNumbers: number[] = [];
	private _lastLineRelativePosition: number = 0;
	private _hoverOnLine: number = -1;
	private _hoverOnColumn: number = -1;
	private _minWidthInPixels: number | undefined;
	private _viewZoneId: string | undefined;
	private _scrollableDomNode: HTMLElement;

	constructor(
		private readonly _editor: ICodeEditor
	) {
		super();

		this._lineNumbersDomNode.className = 'sticky-widget-line-numbers';
		const layoutInfo = this._editor.getOption(EditorOption.layoutInfo);
		this._lineNumbersDomNode.style.width = layoutInfo.contentLeft + 'px';

		this._linesDomNode.className = 'sticky-widget-lines';
		this._linesDomNode.classList.toggle('peek', _editor instanceof EmbeddedCodeEditorWidget);
		this._linesDomNode.style.width = `${layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth - layoutInfo.contentLeft}px`;

		const scrollbar = this._register(new DomScrollableElement(this._linesDomNode, { vertical: ScrollbarVisibility.Hidden, horizontal: ScrollbarVisibility.Hidden, handleMouseWheel: false }));
		this._scrollableDomNode = scrollbar.getDomNode();
		this._scrollableDomNode.className = 'sticky-widget-scrollable';

		this._rootDomNode.className = 'sticky-widget';
		this._rootDomNode.appendChild(this._lineNumbersDomNode);
		this._rootDomNode.appendChild(this._scrollableDomNode);

		this._register(this._editor.onDidScrollChange((e) => {
			scrollbar.scanDomNode();
			scrollbar.setScrollPosition({ scrollLeft: e.scrollLeft });
		}));
		this._register(this._editor.onDidLayoutChange((e) => {
			const minimapSide = this._editor.getOption(EditorOption.minimap).side;
			let lineNumbersWidth = 0;
			if (minimapSide === 'left') {
				lineNumbersWidth = e.contentLeft - e.minimap.minimapCanvasOuterWidth;
			} else if (minimapSide === 'right') {
				lineNumbersWidth = e.contentLeft;
			}
			this._linesDomNode.style.width = `${e.width - e.minimap.minimapCanvasOuterWidth - e.verticalScrollbarWidth - lineNumbersWidth}px`;
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

	private _renderRootNode(): void {

		if (!this._editor._getViewModel()) {
			return;
		}

		let maximumLength = 0;
		const array = [];
		for (const [index, line] of this._lineNumbers.entries()) {
			const { lineNumberHTMLNode, lineHTMLNode } = this._renderChildNode(index, line);
			this._lineNumbersDomNode.appendChild(lineNumberHTMLNode);
			this._linesDomNode.appendChild(lineHTMLNode);
			array.push(lineHTMLNode);

			if (lineHTMLNode.scrollWidth > maximumLength) {
				maximumLength = lineHTMLNode.scrollWidth;
			}
		}

		array.forEach(node => {
			node.style.width = maximumLength + 'px';
		});

		const editorLineHeight = this._editor.getOption(EditorOption.lineHeight);
		const widgetHeight: number = this._lineNumbers.length * editorLineHeight + this._lastLineRelativePosition;

		const display = widgetHeight > 0 ? 'inline-block' : 'none';
		this._lineNumbersDomNode.style.display = display;
		this._linesDomNode.style.display = display;

		const height = widgetHeight.toString() + 'px';
		this._lineNumbersDomNode.style.height = height;
		this._linesDomNode.style.height = height;

		this._lineNumbersDomNode.setAttribute('role', 'list');
		this._linesDomNode.setAttribute('role', 'list');
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;

		if (minimapSide === 'left') {
			this._lineNumbersDomNode.style.marginLeft = this._editor.getLayoutInfo().minimap.minimapCanvasOuterWidth + 'px';
			this._linesDomNode.style.marginLeft = this._editor.getLayoutInfo().minimap.minimapCanvasOuterWidth + 'px';
		}

		this._editor.changeViewZones((changeAccessor) => {
			const bottomMostLine = this._editor.getVisibleRangesPlusViewportAboveBelow().pop()?.endLineNumber;

			if (bottomMostLine !== undefined && this._minWidthInPixels !== maximumLength) {
				if (this._viewZoneId) {
					changeAccessor.removeZone(this._viewZoneId);
					this._viewZoneId = undefined;
				}
				const domNode = document.createElement('div');
				this._minWidthInPixels = maximumLength;
				this._viewZoneId = changeAccessor.addZone({
					afterLineNumber: bottomMostLine,
					suppressMouseDown: true,
					showInHiddenAreas: true,
					minWidthInPx: this._minWidthInPixels + 50,
					domNode,
				});
			}
		});

		this._scrollableDomNode.style.height = this._linesDomNode.clientHeight + 'px';
	}

	private _renderChildNode(index: number, line: number): { lineNumberHTMLNode: HTMLSpanElement; lineHTMLNode: HTMLSpanElement } {

		const viewModel = this._editor._getViewModel();
		const viewLineNumber = viewModel!.coordinatesConverter.convertModelPositionToViewPosition(new Position(line, 1)).lineNumber;
		const lineRenderingData = viewModel!.getViewLineRenderingData(viewLineNumber);
		const layoutInfo = this._editor.getLayoutInfo();
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
		lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
		let lineNumbersWidth = 0;
		if (minimapSide === 'left') {
			lineNumbersWidth = layoutInfo.contentLeft - layoutInfo.minimap.minimapCanvasOuterWidth;
		} else if (minimapSide === 'right') {
			lineNumbersWidth = layoutInfo.contentLeft;
		}

		this._lineNumbersDomNode.style.width = `${lineNumbersWidth}px`;
		lineNumberHTMLNode.style.width = `${lineNumbersWidth}px`;
		this._linesDomNode.style.width = `${layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth - lineNumbersWidth}px`;

		const innerLineNumberHTML = document.createElement('span');
		if (lineNumberOption.renderType === RenderLineNumbersType.On || lineNumberOption.renderType === RenderLineNumbersType.Interval && line % 10 === 0) {
			innerLineNumberHTML.innerText = line.toString();
		} else if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
			innerLineNumberHTML.innerText = Math.abs(line - this._editor.getPosition()!.lineNumber).toString();
		}
		innerLineNumberHTML.className = 'sticky-line-number';
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

		lineNumberHTMLNode.setAttribute('role', 'listitem');
		lineNumberHTMLNode.tabIndex = 0;
		lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineNumberHTMLNode.style.height = `${lineHeight}px`;
		lineNumberHTMLNode.style.position = 'absolute';

		lineHTMLNode.className = 'sticky-line-root';
		lineHTMLNode.setAttribute('role', 'listitem');
		lineHTMLNode.tabIndex = 0;
		lineHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineHTMLNode.style.height = `${lineHeight}px`;
		lineHTMLNode.style.position = 'absolute';
		lineHTMLNode.style.width = '100%';

		// Special case for the last line of sticky scroll
		if (index === this._lineNumbers.length - 1) {
			lineNumberHTMLNode.style.zIndex = '0';
			lineNumberHTMLNode.style.top = index * lineHeight + this._lastLineRelativePosition + 'px';

			lineHTMLNode.style.zIndex = '0';
			lineHTMLNode.style.top = index * lineHeight + this._lastLineRelativePosition + 'px';
		} else {
			lineNumberHTMLNode.style.zIndex = '1';
			lineNumberHTMLNode.style.top = `${index * lineHeight}px`;

			lineHTMLNode.style.zIndex = '1';
			lineHTMLNode.style.top = `${index * lineHeight}px`;
		}

		// Each child has a listener which fires when the mouse hovers over the child
		this._disposableStore.add(dom.addDisposableListener(lineNumberHTMLNode, 'mouseover', (e) => {
			this._onMouseOver(e, line);
		}));
		this._disposableStore.add(dom.addDisposableListener(lineHTMLNode, 'mouseover', (e) => {
			this._onMouseOver(e, line);
		}));

		return { lineNumberHTMLNode, lineHTMLNode };
	}

	_onMouseOver(e: MouseEvent, line: number) {
		if (this._editor.hasModel()) {
			const mouseOverEvent = new StandardMouseEvent(e);
			const text = mouseOverEvent.target.innerText;
			// Line and column number of the hover needed for the control clicking feature
			this._hoverOnLine = line;
			// TODO: workaround to find the column index, perhaps need a more solid solution
			this._hoverOnColumn = this._editor.getModel().getLineContent(line).indexOf(text) + 1 || -1;
		}
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
