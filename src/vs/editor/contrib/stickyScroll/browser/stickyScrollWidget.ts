/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import * as dom from 'vs/base/browser/dom';
import { EditorLayoutInfo, EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { Position } from 'vs/editor/common/core/position';
import 'vs/css!./stickyScroll';

export class StickyScrollWidgetState {
	constructor(
		public readonly lineNumbers: number[],
		public readonly lastLineRelativePosition: number
	) { }
}

const _ttPolicy = window.trustedTypes?.createPolicy('stickyScrollViewLayer', { createHTML: value => value });

export class StickyScrollWidget extends Disposable implements IOverlayWidget {

	private readonly _layoutInfo: EditorLayoutInfo;
	private readonly _rootDomNode: HTMLElement = document.createElement('div');
	private readonly _disposableStore = this._register(new DisposableStore());
	private _lineHeight: number;
	private _lineNumbers: number[];
	private _lastLineRelativePosition: number;

	constructor(private readonly editor: ICodeEditor) {
		super();
		this._layoutInfo = this.editor.getLayoutInfo();
		this._rootDomNode = document.createElement('div');
		this._rootDomNode.className = 'sticky-widget';
		this._rootDomNode.style.width = `${this._layoutInfo.width - this._layoutInfo.minimap.minimapCanvasOuterWidth - this._layoutInfo.verticalScrollbarWidth}px`;

		this._lineNumbers = [];
		this._lastLineRelativePosition = 0;

		this._lineHeight = this.editor.getOption(EditorOption.lineHeight);
		this._register(this.editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.lineHeight)) {
				this._lineHeight = this.editor.getOption(EditorOption.lineHeight);
			}
		}));

	}

	public get lineNumbers(): number[] {
		return this._lineNumbers;
	}

	public get codeLineCount(): number {
		return this._lineNumbers.length;
	}

	public getCurrentLines(): readonly number[] {
		return this._lineNumbers;
	}

	public setState(state: StickyScrollWidgetState): void {
		this._disposableStore.clear();
		this._lineNumbers.length = 0;
		dom.clearNode(this._rootDomNode);

		this._lastLineRelativePosition = state.lastLineRelativePosition;
		this._lineNumbers = state.lineNumbers;
		this.renderRootNode();
	}

	private getChildNode(index: number, line: number): HTMLElement {

		const child = document.createElement('div');
		const viewModel = this.editor._getViewModel();
		const viewLineNumber = viewModel!.coordinatesConverter.convertModelPositionToViewPosition(new Position(line, 1)).lineNumber;
		const lineRenderingData = viewModel!.getViewLineRenderingData(viewLineNumber);
		const layoutInfo = this.editor.getLayoutInfo();
		const width = layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth;
		const minimapSide = this.editor.getOption(EditorOption.minimap).side;
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const lineNumberOption = this.editor.getOption(EditorOption.lineNumbers);

		let actualInlineDecorations: LineDecoration[];
		try {
			actualInlineDecorations = LineDecoration.filter(lineRenderingData.inlineDecorations, viewLineNumber, lineRenderingData.minColumn, lineRenderingData.maxColumn);
		} catch (err) {
			actualInlineDecorations = [];
		}

		const renderLineInput: RenderLineInput =
			new RenderLineInput(true, true, lineRenderingData.content,
				lineRenderingData.continuesWithWrappedLine,
				lineRenderingData.isBasicASCII, lineRenderingData.containsRTL, 0,
				lineRenderingData.tokens, actualInlineDecorations,
				lineRenderingData.tabSize, lineRenderingData.startVisibleColumn,
				1, 1, 1, 500, 'none', true, true, null);

		const sb = createStringBuilder(2000);
		renderViewLine(renderLineInput, sb);

		let newLine;
		if (_ttPolicy) {
			newLine = _ttPolicy.createHTML(sb.build() as string);
		} else {
			newLine = sb.build();
		}

		const lineHTMLNode = document.createElement('span');
		lineHTMLNode.className = 'sticky-line';
		lineHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineHTMLNode.innerHTML = newLine as string;

		const lineNumberHTMLNode = document.createElement('span');
		lineNumberHTMLNode.className = 'sticky-line';
		lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
		if (minimapSide === 'left') {
			lineNumberHTMLNode.style.width = `${layoutInfo.contentLeft - layoutInfo.minimap.minimapCanvasOuterWidth}px`;
		} else if (minimapSide === 'right') {
			lineNumberHTMLNode.style.width = `${layoutInfo.contentLeft}px`;
		}

		const innerLineNumberHTML = document.createElement('span');
		if (lineNumberOption.renderType === RenderLineNumbersType.On || lineNumberOption.renderType === RenderLineNumbersType.Interval && line % 10 === 0) {
			innerLineNumberHTML.innerText = line.toString();
		} else if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
			innerLineNumberHTML.innerText = Math.abs(line - this.editor.getPosition()!.lineNumber).toString();
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

		this.editor.applyFontInfo(lineHTMLNode);
		this.editor.applyFontInfo(innerLineNumberHTML);

		child.appendChild(lineNumberHTMLNode);
		child.appendChild(lineHTMLNode);

		child.className = 'sticky-line-root';
		child.style.lineHeight = `${lineHeight}px`;
		child.style.width = `${width}px`;
		child.style.height = `${lineHeight}px`;
		child.style.zIndex = '0';

		// Special case for the last line of sticky scroll
		if (index === this._lineNumbers.length - 1) {
			child.style.position = 'relative';
			child.style.zIndex = '-1';
			child.style.top = this._lastLineRelativePosition + 'px';
		}
		this._disposableStore.add(dom.addDisposableListener(child, 'click', e => {
			e.stopPropagation();
			e.preventDefault();
			this.editor.revealPosition({ lineNumber: line - index, column: 1 });
		}));

		return child;
	}

	private renderRootNode(): void {

		if (!this.editor._getViewModel()) {
			return;
		}
		for (const [index, line] of this._lineNumbers.entries()) {
			this._rootDomNode.appendChild(this.getChildNode(index, line));
		}

		const widgetHeight: number = this._lineNumbers.length * this._lineHeight + this._lastLineRelativePosition;
		this._rootDomNode.style.height = widgetHeight.toString() + 'px';
		const minimapSide = this.editor.getOption(EditorOption.minimap).side;
		if (minimapSide === 'left') {
			this._rootDomNode.style.marginLeft = this.editor.getLayoutInfo().minimap.minimapCanvasOuterWidth + 'px';
		} else if (minimapSide === 'right') {
			this._rootDomNode.style.marginLeft = '0px';
		}
	}

	public getId(): string {
		return 'editor.contrib.stickyScrollWidget';
	}

	public getDomNode(): HTMLElement {
		return this._rootDomNode;
	}

	public getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: null
		};
	}

	override dispose(): void {
		super.dispose();
		this._disposableStore.dispose();
	}
}
