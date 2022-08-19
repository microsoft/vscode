/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import * as dom from 'vs/base/browser/dom';
import { EditorLayoutInfo, EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { Position } from 'vs/editor/common/core/position';
import 'vs/css!./stickyScroll';
import { ClickLinkGesture } from 'vs/editor/contrib/gotoSymbol/browser/link/clickLinkGesture';
import { getDefinitionsAtPosition } from 'vs/editor/contrib/gotoSymbol/browser/goToSymbol';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Location } from 'vs/editor/common/languages';
import { goToDefinitionWithLocation } from 'vs/editor/contrib/inlayHints/browser/inlayHintsLocations';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CancellationTokenSource, } from 'vs/base/common/cancellation';
import { IRange } from 'vs/editor/common/core/range';

export class StickyScrollWidgetState {
	constructor(
		public readonly lineNumbers: number[],
		public readonly lastLineRelativePosition: number
	) { }
}

const _ttPolicy = window.trustedTypes?.createPolicy('stickyScrollViewLayer', { createHTML: value => value });

export class StickyScrollWidget extends Disposable implements IOverlayWidget {

	private readonly layoutInfo: EditorLayoutInfo;
	private readonly rootDomNode: HTMLElement = document.createElement('div');
	private readonly disposableStore = this._register(new DisposableStore());
	private readonly linkGestureStore = this._register(new DisposableStore());
	private lineHeight: number;
	private lineNumbers: number[];
	private lastLineRelativePosition: number;
	private hoverOnLine: number;
	private positionOfDefinitionToJumpTo: Location;
	private lastChildDecorated: HTMLElement | undefined;
	private stickyPositionProjectedOnEditor: Position;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _languageFeatureService: ILanguageFeaturesService,
		@IInstantiationService private readonly _instaService: IInstantiationService
	) {
		super();
		this.layoutInfo = this._editor.getLayoutInfo();
		this.rootDomNode = document.createElement('div');
		this.rootDomNode.className = 'sticky-widget';
		this.rootDomNode.style.width = `${this.layoutInfo.width - this.layoutInfo.minimap.minimapCanvasOuterWidth - this.layoutInfo.verticalScrollbarWidth}px`;

		this.lineNumbers = [];
		this.lastLineRelativePosition = 0;

		this.hoverOnLine = -1;
		this.positionOfDefinitionToJumpTo = { uri: {}, range: {} } as Location;
		this.lastChildDecorated = undefined;
		this.stickyPositionProjectedOnEditor = new Position(-1, -1);

		this.lineHeight = this._editor.getOption(EditorOption.lineHeight);
		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.lineHeight)) {
				this.lineHeight = this._editor.getOption(EditorOption.lineHeight);
			}
		}));
		this._register(this.updateLinkGesture());
	}

	private updateLinkGesture(): IDisposable {
		const gesture = this.linkGestureStore.add(new ClickLinkGesture(this._editor));
		const cancellationToken = new CancellationTokenSource();
		const sessionStore = new DisposableStore();
		sessionStore.add(cancellationToken);
		this.linkGestureStore.add(sessionStore);
		this.linkGestureStore.add(gesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, _keyboardEvent]) => {
			if (!this._editor.hasModel()) {
				return;
			}
			if (!mouseEvent.hasTriggerModifier) {
				if (this.lastChildDecorated) {
					this.lastChildDecorated.style.textDecoration = 'none';
					this.lastChildDecorated = undefined;
				}
				return;
			}
			const targetMouseEvent = mouseEvent.target as any;
			if (targetMouseEvent.detail === 'editor.contrib.stickyScrollWidget' && this.hoverOnLine !== -1 && targetMouseEvent.element.innerText === targetMouseEvent.element.innerHTML) {
				const text = targetMouseEvent.element.innerText;
				const lineNumber = this.hoverOnLine;
				const column = this._editor.getModel()?.getLineContent(lineNumber).indexOf(text);
				if (!column || column === -1) {
					return;
				}
				const stickyPositionProjectedOnEditor = new Position(lineNumber, column + 1);
				if (this.stickyPositionProjectedOnEditor !== stickyPositionProjectedOnEditor) {
					this.stickyPositionProjectedOnEditor = stickyPositionProjectedOnEditor;
					cancellationToken.cancel();
				}
				getDefinitionsAtPosition(this._languageFeatureService.definitionProvider, this._editor.getModel(), stickyPositionProjectedOnEditor, cancellationToken.token).then((candidateDefinitions => {
					if (cancellationToken.token.isCancellationRequested) {
						return;
					}
					if (candidateDefinitions.length !== 0) {
						// TODO: Currently only taking the first definition but there could be other ones of interest
						this.positionOfDefinitionToJumpTo.uri = candidateDefinitions[0]?.uri;
						this.positionOfDefinitionToJumpTo.range = candidateDefinitions[0]?.targetSelectionRange as IRange;

						const lineToDecorate = this.getDomNode().getElementsByClassName(`stickyLine${lineNumber}`)[0].children[0] as HTMLElement;
						let currentHTMLChild: HTMLElement | undefined = undefined;

						for (const childElement of lineToDecorate.children) {
							const childAsHTMLElement = childElement as HTMLElement;
							if (childAsHTMLElement.innerText === text) {
								currentHTMLChild = childAsHTMLElement;
								break;
							}
						}
						if (!currentHTMLChild) {
							return;
						}
						if (this.lastChildDecorated && this.lastChildDecorated !== currentHTMLChild) {
							this.lastChildDecorated.style.textDecoration = 'none';
							this.lastChildDecorated = currentHTMLChild;
							this.lastChildDecorated.style.textDecoration = 'underline';
						} else if (!this.lastChildDecorated) {
							this.lastChildDecorated = currentHTMLChild;
							this.lastChildDecorated.style.textDecoration = 'underline';
						}
					} else if (this.lastChildDecorated) {
						this.lastChildDecorated.style.textDecoration = 'none';
						this.lastChildDecorated = undefined;
					}
				}));
			} else if (this.lastChildDecorated) {
				this.lastChildDecorated.style.textDecoration = 'none';
				this.lastChildDecorated = undefined;
			}
		}));
		this.linkGestureStore.add(gesture.onCancel(() => {
			sessionStore.clear();
		}));
		this.linkGestureStore.add(gesture.onExecute(async e => {
			if (this.hoverOnLine !== -1) {
				if (e.hasTriggerModifier) {
					// Control click
					this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor as IActiveCodeEditor, this.positionOfDefinitionToJumpTo);
				} else {
					// Normal click
					this._editor.revealPosition({ lineNumber: this.hoverOnLine, column: 1 });
				}
			}

		}));
		return this.linkGestureStore;
	}

	public get codeLineCount(): number {
		return this.lineNumbers.length;
	}

	public getCurrentLines(): readonly number[] {
		return this.lineNumbers;
	}

	public setState(state: StickyScrollWidgetState): void {
		this.disposableStore.clear();
		this.lineNumbers.length = 0;
		dom.clearNode(this.rootDomNode);

		this.lastLineRelativePosition = state.lastLineRelativePosition;
		this.lineNumbers = state.lineNumbers;
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
		if (index === this.lineNumbers.length - 1) {
			child.style.position = 'relative';
			child.style.zIndex = '-1';
			child.style.top = this.lastLineRelativePosition + 'px';
		}

		this.disposableStore.add(dom.addDisposableListener(child, 'mouseover', () => {
			this.hoverOnLine = line;
		}));

		return child;
	}

	private renderRootNode(): void {

		if (!this._editor._getViewModel()) {
			return;
		}
		for (const [index, line] of this.lineNumbers.entries()) {
			this.rootDomNode.appendChild(this.getChildNode(index, line));
		}

		const widgetHeight: number = this.lineNumbers.length * this.lineHeight + this.lastLineRelativePosition;
		this.rootDomNode.style.height = widgetHeight.toString() + 'px';
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;
		if (minimapSide === 'left') {
			this.rootDomNode.style.marginLeft = this._editor.getLayoutInfo().minimap.minimapCanvasOuterWidth + 'px';
		} else if (minimapSide === 'right') {
			this.rootDomNode.style.marginLeft = '0px';
		}

		this.disposableStore.add(dom.addDisposableListener(this.rootDomNode, 'mouseout', () => {
			this.hoverOnLine = -1;
		}));
	}

	public getId(): string {
		return 'editor.contrib.stickyScrollWidget';
	}

	public getDomNode(): HTMLElement {
		return this.rootDomNode;
	}

	public getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: null
		};
	}

	override dispose(): void {
		super.dispose();
		this.linkGestureStore.dispose();
		this.disposableStore.dispose();
	}
}
