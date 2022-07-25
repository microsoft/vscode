/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { OutlineModel, OutlineElement } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken, CancellationTokenSource, } from 'vs/base/common/cancellation';
import * as dom from 'vs/base/browser/dom';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { SymbolKind } from 'vs/editor/common/languages';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';

const enum ScrollDirection {
	Down = 0,
	Up = 1,
	None = 2
}

class StickyScrollController implements IEditorContribution {

	static readonly ID = 'store.contrib.stickyScrollController';
	private readonly _editor: ICodeEditor;
	private readonly stickyScrollWidget: StickyScrollWidget;
	private readonly _languageFeaturesService: ILanguageFeaturesService;

	private readonly _store: DisposableStore = new DisposableStore();
	private readonly _sessionStore: DisposableStore = new DisposableStore();

	private _ranges: [number, number, number][] = [];
	private _cts: CancellationTokenSource | undefined;
	private _lastScrollPosition: number = -1;

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
	) {
		this._editor = editor;
		this._languageFeaturesService = _languageFeaturesService;
		this.stickyScrollWidget = new StickyScrollWidget(this._editor);
		this._store.add(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				this.onConfigurationChange();
			}
		}));
		this.onConfigurationChange();
	}

	private onConfigurationChange() {
		const options = this._editor.getOption(EditorOption.stickyScroll);
		if (options.enabled === false) {
			this.stickyScrollWidget.emptyRootNode();
			this._editor.removeOverlayWidget(this.stickyScrollWidget);
			this._sessionStore.clear();
			return;
		} else {
			this._editor.addOverlayWidget(this.stickyScrollWidget);
			this._sessionStore.add(this._editor.onDidChangeModel(() => this._update(true)));
			this._sessionStore.add(this._editor.onDidScrollChange(() => this._update(false)));
			this._sessionStore.add(this._editor.onDidChangeModelContent(() => this._update(true)));
			this._sessionStore.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => this._update(true)));
			this._update(true);
		}
	}

	private async _update(updateOutline: boolean = false): Promise<void> {
		if (updateOutline) {
			this._cts?.dispose(true);
			this._cts = new CancellationTokenSource();
			await this._updateOutlineModel(this._cts.token);
		}
		this._renderStickyScroll();
	}

	private _findLineRanges(outlineElement: OutlineElement, depth: number) {
		if (outlineElement?.children.size) {
			let didRecursion: boolean = false;
			for (const outline of outlineElement?.children.values()) {
				const kind: SymbolKind = outline.symbol.kind;
				if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method) {
					didRecursion = true;
					this._findLineRanges(outline, depth + 1);
				}
			}
			if (!didRecursion) {
				this._addOutlineRanges(outlineElement, depth);
			}
		} else {
			this._addOutlineRanges(outlineElement, depth);
		}
	}

	private _addOutlineRanges(outlineElement: OutlineElement, depth: number) {
		let currentStartLine: number | undefined = 0;
		let currentEndLine: number | undefined = 0;

		while (outlineElement) {
			const kind: SymbolKind = outlineElement.symbol.kind;
			if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method) {
				currentStartLine = outlineElement?.symbol.range.startLineNumber as number;
				currentEndLine = outlineElement?.symbol.range.endLineNumber as number;
				this._ranges.push([currentStartLine, currentEndLine, depth]);
				depth--;
			}
			if (outlineElement.parent instanceof OutlineElement) {
				outlineElement = outlineElement.parent;
			} else {
				break;
			}
		}
	}

	private async _updateOutlineModel(token: CancellationToken) {
		if (this._editor.hasModel()) {
			const model = this._editor.getModel();
			const outlineModel = await OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, model, token);
			if (token.isCancellationRequested) {
				return;
			}
			this._ranges = [];
			for (const outline of outlineModel.children.values()) {
				if (outline instanceof OutlineElement) {
					const kind: SymbolKind = outline.symbol.kind;
					if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method) {
						this._findLineRanges(outline, 1);
					} else {
						this._findLineRanges(outline, 0);
					}
				}
				this._ranges = this._ranges.sort(function (a, b) {
					if (a[0] !== b[0]) {
						return a[0] - b[0];
					} else if (a[1] !== b[1]) {
						return b[1] - a[1];
					} else {
						return a[2] - b[2];
					}
				});
				let previous: number[] = [];
				for (const [index, arr] of this._ranges.entries()) {
					const [start, end, _depth] = arr;
					if (previous[0] === start && previous[1] === end) {
						this._ranges.splice(index, 1);
					} else {
						previous = arr;
					}
				}
			}
		}
	}
	private _renderStickyScroll() {

		if (!(this._editor.hasModel())) {
			return;
		}

		const lineHeight: number = this._editor.getOption(EditorOption.lineHeight);
		const model = this._editor.getModel();

		const scrollTop = this._editor.getScrollTop();
		let scrollDirection: ScrollDirection;
		if (this._lastScrollPosition < scrollTop) {
			scrollDirection = ScrollDirection.Down;
		} else {
			scrollDirection = ScrollDirection.Up;
		}
		this._lastScrollPosition = scrollTop;

		const scrollToBottomOfWidget = this._editor.getScrollTop() + this.stickyScrollWidget.codeLineCount * lineHeight;
		this.stickyScrollWidget.emptyRootNode();
		const beginningLinesConsidered: Set<number> = new Set<number>();
		let topOfElementAtDepth: number;
		let bottomOfElementAtDepth: number;
		let bottomOfBeginningLine: number;
		let topOfEndLine: number;
		let bottomOfEndLine: number;

		for (const [index, arr] of this._ranges.entries()) {
			const [start, end, depth] = arr;
			topOfElementAtDepth = this._editor.getScrollTop() + (depth - 1) * lineHeight;
			bottomOfElementAtDepth = this._editor.getScrollTop() + depth * lineHeight;
			bottomOfBeginningLine = start * lineHeight;
			topOfEndLine = (end - 1) * lineHeight;
			bottomOfEndLine = end * lineHeight;

			if (!beginningLinesConsidered.has(start)) {
				if (topOfElementAtDepth >= topOfEndLine - 1 && topOfElementAtDepth < bottomOfEndLine - 2) {
					beginningLinesConsidered.add(start);
					this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(start), start, this._editor, -1, (depth - 1) * lineHeight + bottomOfEndLine - bottomOfElementAtDepth));
					break;
				}
				else if (scrollDirection === ScrollDirection.Down && bottomOfElementAtDepth > bottomOfBeginningLine - 1 && bottomOfElementAtDepth < bottomOfEndLine - 1) {
					beginningLinesConsidered.add(start);
					this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(start), start, this._editor, 0));

				} else if (scrollDirection === ScrollDirection.Up && scrollToBottomOfWidget > bottomOfBeginningLine - 1 && scrollToBottomOfWidget < bottomOfEndLine ||
					scrollDirection === ScrollDirection.Up && bottomOfElementAtDepth > bottomOfBeginningLine && bottomOfElementAtDepth < topOfEndLine - 1) {
					beginningLinesConsidered.add(start);
					this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(start), start, this._editor, 0));
				}
			} else {
				this._ranges.splice(index, 1);
			}
		}

		this.stickyScrollWidget.updateRootNode();
	}

	dispose(): void {
		this._store.dispose();
		this._sessionStore.dispose();
	}
}

const _ttPolicy = window.trustedTypes?.createPolicy('stickyScrollViewLayer', { createHTML: value => value });

class StickyScrollCodeLine {
	constructor(private readonly _line: string, private readonly _lineNumber: number, private readonly _editor: IActiveCodeEditor,
		private readonly _zIndex: number, private readonly _position?: number) { }


	getDomNode() {

		const root: HTMLElement = document.createElement('div');
		const modifiedLine = this._line.replace(/\s/g, '\xa0');
		const lineRenderingData = this._editor._getViewModel().getViewLineRenderingData(this._editor.getVisibleRangesPlusViewportAboveBelow()[0], this._lineNumber);
		let actualInlineDecorations: LineDecoration[];
		try {
			actualInlineDecorations = LineDecoration.filter(lineRenderingData.inlineDecorations, this._lineNumber, lineRenderingData.minColumn, lineRenderingData.maxColumn);
		} catch (err) {
			console.log(err);
			actualInlineDecorations = [];
		}
		const renderLineInput: RenderLineInput = new RenderLineInput(true, true, modifiedLine, lineRenderingData.continuesWithWrappedLine,
			lineRenderingData.isBasicASCII, lineRenderingData.containsRTL, 0, lineRenderingData.tokens, actualInlineDecorations, lineRenderingData.tabSize,
			lineRenderingData.startVisibleColumn, 1, 1, 1, 100, 'none', true, true, null);

		const sb = createStringBuilder(2000);
		renderViewLine(renderLineInput, sb);

		let newLine;
		if (_ttPolicy) {
			newLine = _ttPolicy.createHTML(sb.build() as string);
		} else {
			newLine = sb.build();
		}

		const lineHTMLNode = document.createElement('div');
		lineHTMLNode.style.paddingLeft = this._editor.getLayoutInfo().contentLeft - this._editor.getLayoutInfo().lineNumbersLeft - this._editor.getLayoutInfo().lineNumbersWidth + 'px';
		lineHTMLNode.style.float = 'left';
		lineHTMLNode.style.width = this._editor.getLayoutInfo().width - this._editor.getLayoutInfo().contentLeft + 'px';
		lineHTMLNode.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
		lineHTMLNode.innerHTML = newLine as string;

		const lineNumberHTMLNode = document.createElement('div');
		lineNumberHTMLNode.style.width = this._editor.getLayoutInfo().contentLeft.toString() + 'px';
		lineNumberHTMLNode.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
		lineNumberHTMLNode.style.color = 'var(--vscode-editorLineNumber-foreground)';

		const innerLineNumberHTML = document.createElement('div');
		innerLineNumberHTML.innerText = this._lineNumber.toString();
		innerLineNumberHTML.style.paddingLeft = this._editor.getLayoutInfo().lineNumbersLeft.toString() + 'px';
		innerLineNumberHTML.style.width = this._editor.getLayoutInfo().lineNumbersWidth.toString() + 'px';
		innerLineNumberHTML.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
		innerLineNumberHTML.style.textAlign = 'right';
		innerLineNumberHTML.style.float = 'left';
		lineNumberHTMLNode.appendChild(innerLineNumberHTML);

		lineHTMLNode.onclick = e => {
			e.stopPropagation();
			e.preventDefault();
			this._editor.revealLine(this._lineNumber);
		};
		lineHTMLNode.onmouseover = e => {
			innerLineNumberHTML.style.background = `var(--vscode-editorStickyScrollHover-background)`;
			lineHTMLNode.style.backgroundColor = `var(--vscode-editorStickyScrollHover-background)`;
			innerLineNumberHTML.style.cursor = `pointer`;
			lineHTMLNode.style.cursor = `pointer`;
		};
		lineHTMLNode.onmouseleave = e => {
			innerLineNumberHTML.style.background = `var(--vscode-editorStickyScroll-background)`;
			lineHTMLNode.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
		};

		this._editor.applyFontInfo(lineHTMLNode);
		this._editor.applyFontInfo(innerLineNumberHTML);

		root.appendChild(lineNumberHTMLNode);
		root.appendChild(lineHTMLNode);

		root.style.zIndex = this._zIndex.toString();
		root.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;

		// Special case for last line of sticky scroll
		if (this._position) {
			root.style.position = 'absolute';
			root.style.top = this._position + 'px';
			root.style.width = '100%';
		}
		return root;
	}
}

class StickyScrollWidget implements IOverlayWidget {

	private readonly arrayOfCodeLines: StickyScrollCodeLine[] = [];
	private readonly rootDomNode: HTMLElement = document.createElement('div');

	constructor(public readonly _editor: ICodeEditor) {
		this.rootDomNode = document.createElement('div');
		this.rootDomNode.style.width = '100%';
	}

	get codeLineCount() {
		return this.arrayOfCodeLines.length;
	}

	pushCodeLine(codeLine: StickyScrollCodeLine) {
		this.arrayOfCodeLines.push(codeLine);
	}

	updateRootNode() {
		for (const line of this.arrayOfCodeLines) {
			this.rootDomNode.appendChild(line.getDomNode());
		}
	}

	emptyRootNode() {
		this.arrayOfCodeLines.length = 0;
		dom.clearNode(this.rootDomNode);
	}

	getId(): string {
		return 'editor.contrib.stickyScrollWidget';
	}

	getDomNode(): HTMLElement {
		this.rootDomNode.style.zIndex = '2';
		this.rootDomNode.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
		return this.rootDomNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: null
		};
	}
}

registerEditorContribution(StickyScrollController.ID, StickyScrollController);

