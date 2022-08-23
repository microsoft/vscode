/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import * as dom from 'vs/base/browser/dom';
import { EditorLayoutInfo, EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { Position } from 'vs/editor/common/core/position';
import { ClickLinkGesture } from 'vs/editor/contrib/gotoSymbol/browser/link/clickLinkGesture';
import { getDefinitionsAtPosition } from 'vs/editor/contrib/gotoSymbol/browser/goToSymbol';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Location } from 'vs/editor/common/languages';
import { goToDefinitionWithLocation } from 'vs/editor/contrib/inlayHints/browser/inlayHintsLocations';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IRange, Range } from 'vs/editor/common/core/range';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import 'vs/css!./stickyScroll';

interface CustomMouseEvent {
	detail: string;
	element: HTMLElement;
}

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
	private _hoverOnLine: number;
	private _hoverOnColumn: number;
	private _stickyRangeProjectedOnEditor: IRange | null;
	private _candidateDefinitionsLength: number;

	constructor(
		private readonly _editor: ICodeEditor,
		@ILanguageFeaturesService private readonly _languageFeatureService: ILanguageFeaturesService,
		@IInstantiationService private readonly _instaService: IInstantiationService
	) {
		super();
		this._layoutInfo = this._editor.getLayoutInfo();
		this._rootDomNode = document.createElement('div');
		this._rootDomNode.className = 'sticky-widget';
		this._rootDomNode.style.width = `${this._layoutInfo.width - this._layoutInfo.minimap.minimapCanvasOuterWidth - this._layoutInfo.verticalScrollbarWidth}px`;
		this._lineNumbers = [];
		this._lastLineRelativePosition = 0;
		this._hoverOnLine = -1;
		this._hoverOnColumn = -1;
		this._stickyRangeProjectedOnEditor = null;
		this._candidateDefinitionsLength = -1;
		this._lineHeight = this._editor.getOption(EditorOption.lineHeight);
		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.lineHeight)) {
				this._lineHeight = this._editor.getOption(EditorOption.lineHeight);
			}

		}));
		this._register(this.updateLinkGesture());
	}

	private updateLinkGesture(): IDisposable {


		const linkGestureStore = new DisposableStore();
		const sessionStore = new DisposableStore();
		linkGestureStore.add(sessionStore);
		const gesture = new ClickLinkGesture(this._editor, true);
		linkGestureStore.add(gesture);

		linkGestureStore.add(gesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, _keyboardEvent]) => {
			if (!this._editor.hasModel() || !mouseEvent.hasTriggerModifier) {
				sessionStore.clear();
				return;
			}
			const targetMouseEvent = mouseEvent.target as unknown as CustomMouseEvent;
			if (targetMouseEvent.detail === this.getId() && targetMouseEvent.element.innerText === targetMouseEvent.element.innerHTML) {
				const text = targetMouseEvent.element.innerText;
				if (this._hoverOnColumn === -1) {
					return;
				}
				const lineNumber = this._hoverOnLine;
				const column = this._hoverOnColumn;

				const stickyPositionProjectedOnEditor = new Range(lineNumber, column, lineNumber, column + text.length);
				if (!stickyPositionProjectedOnEditor.equalsRange(this._stickyRangeProjectedOnEditor)) {
					this._stickyRangeProjectedOnEditor = stickyPositionProjectedOnEditor;
					sessionStore.clear();
				} else if (targetMouseEvent.element.style.textDecoration === 'underline') {
					return;
				}

				const cancellationToken = new CancellationTokenSource();
				sessionStore.add(toDisposable(() => cancellationToken.dispose(true)));

				let currentHTMLChild: HTMLElement;

				getDefinitionsAtPosition(this._languageFeatureService.definitionProvider, this._editor.getModel(), new Position(lineNumber, column + 1), cancellationToken.token).then((candidateDefinitions => {
					if (cancellationToken.token.isCancellationRequested) {
						return;
					}
					if (candidateDefinitions.length !== 0) {
						this._candidateDefinitionsLength = candidateDefinitions.length;
						const childHTML: HTMLElement = targetMouseEvent.element;
						if (currentHTMLChild !== childHTML) {
							sessionStore.clear();
							currentHTMLChild = childHTML;
							currentHTMLChild.style.textDecoration = 'underline';
							sessionStore.add(toDisposable(() => {
								currentHTMLChild.style.textDecoration = 'none';
							}));
						} else if (!currentHTMLChild) {
							currentHTMLChild = childHTML;
							currentHTMLChild.style.textDecoration = 'underline';
							sessionStore.add(toDisposable(() => {
								currentHTMLChild.style.textDecoration = 'none';
							}));
						}
					} else {
						sessionStore.clear();
					}
				}));
			} else {
				sessionStore.clear();
			}
		}));
		linkGestureStore.add(gesture.onCancel(() => {
			sessionStore.clear();
		}));
		linkGestureStore.add(gesture.onExecute(async e => {
			if ((e.target as unknown as CustomMouseEvent).detail !== this.getId()) {
				return;
			}
			if (e.hasTriggerModifier) {
				// Control click
				if (this._candidateDefinitionsLength > 1) {
					this._editor.revealPosition({ lineNumber: this._hoverOnLine, column: 1 });
				}
				this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor as IActiveCodeEditor, { uri: this._editor.getModel()!.uri, range: this._stickyRangeProjectedOnEditor } as Location);
			} else {
				// Normal click
				this._editor.revealPosition({ lineNumber: this._hoverOnLine, column: 1 });
			}
		}));
		return linkGestureStore;
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
		const viewModel = this._editor._getViewModel();
		const viewLineNumber = viewModel!.coordinatesConverter.convertModelPositionToViewPosition(new Position(line, 1)).lineNumber;
		const lineRenderingData = viewModel!.getViewLineRenderingData(viewLineNumber);
		const layoutInfo = this._editor.getLayoutInfo();
		const width = layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth;
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);

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
		lineHTMLNode.classList.add(`stickyLine${line}`);
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

		this._disposableStore.add(dom.addDisposableListener(child, 'mouseover', (e) => {
			if (this._editor.hasModel()) {
				const mouseOverEvent = new StandardMouseEvent(e);
				const text = mouseOverEvent.target.innerText;
				this._hoverOnLine = line;
				// TODO: workaround to find the column index, perhaps need more solid solution
				this._hoverOnColumn = this._editor.getModel().getLineContent(line).indexOf(text) + 1 || -1;
			}
		}));

		return child;
	}

	private renderRootNode(): void {
		if (!this._editor._getViewModel()) {
			return;
		}
		for (const [index, line] of this._lineNumbers.entries()) {
			this._rootDomNode.appendChild(this.getChildNode(index, line));
		}

		const widgetHeight: number = this._lineNumbers.length * this._lineHeight + this._lastLineRelativePosition;
		this._rootDomNode.style.height = widgetHeight.toString() + 'px';
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;
		if (minimapSide === 'left') {
			this._rootDomNode.style.marginLeft = this._editor.getLayoutInfo().minimap.minimapCanvasOuterWidth + 'px';
		} else if (minimapSide === 'right') {
			this._rootDomNode.style.marginLeft = '0px';
		}
		this._rootDomNode.style.zIndex = '11';
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
	}
}
