/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
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
import { RunOnceScheduler } from 'vs/base/common/async';
import { IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

class StickyScrollController extends Disposable implements IEditorContribution {

	static readonly ID = 'store.contrib.stickyScrollController';
	private readonly _editor: ICodeEditor;
	private readonly stickyScrollWidget: StickyScrollWidget;
	private readonly _languageFeaturesService: ILanguageFeaturesService;
	private readonly _sessionStore: DisposableStore = new DisposableStore();

	private _ranges: [number, number, number][] = [];
	private _rangesVersionId: number = 0;
	private _cts: CancellationTokenSource | undefined;
	private readonly _updateSoon: RunOnceScheduler;

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this._editor = editor;
		this._languageFeaturesService = _languageFeaturesService;
		this.stickyScrollWidget = new StickyScrollWidget(this._editor);
		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.experimental)) {
				this.onConfigurationChange();
			}
		}));
		this._updateSoon = this._register(new RunOnceScheduler(() => this._update(true), 50));
		this.onConfigurationChange();
	}

	private onConfigurationChange() {
		const options = this._editor.getOption(EditorOption.experimental);
		if (options.stickyScroll.enabled === false) {
			this.stickyScrollWidget.emptyRootNode();
			this._editor.removeOverlayWidget(this.stickyScrollWidget);
			this._sessionStore.clear();
			return;
		} else {
			this._editor.addOverlayWidget(this.stickyScrollWidget);
			this._sessionStore.add(this._editor.onDidChangeModel(() => this._update(true)));
			this._sessionStore.add(this._editor.onDidScrollChange(() => this._update(false)));
			this._sessionStore.add(this._editor.onDidChangeHiddenAreas(() => this._update(true)));
			this._sessionStore.add(this._editor.onDidChangeModelTokens((e) => this._onTokensChange(e)));
			this._sessionStore.add(this._editor.onDidChangeModelContent(() => this._updateSoon.schedule()));
			this._sessionStore.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => this._update(true)));
			this._update(true);
		}
	}

	private _needsUpdate(event: IModelTokensChangedEvent) {
		const stickyLineNumbers = this.stickyScrollWidget.getCurrentLines();
		for (const stickyLineNumber of stickyLineNumbers) {
			for (const range of event.ranges) {
				if (stickyLineNumber >= range.fromLineNumber && stickyLineNumber <= range.toLineNumber) {
					return true;
				}
			}
		}
		return false;
	}

	private _onTokensChange(event: IModelTokensChangedEvent) {
		if (this._needsUpdate(event)) {
			this._update(false);
		}
	}

	private async _update(updateOutline: boolean = false): Promise<void> {
		if (updateOutline) {
			this._cts?.dispose(true);
			this._cts = new CancellationTokenSource();
			await this._updateOutlineModel(this._cts.token);
		}
		const hiddenRanges: Range[] | undefined = this._editor._getViewModel()?.getHiddenAreas();
		if (hiddenRanges) {
			for (const hiddenRange of hiddenRanges) {
				this._ranges = this._ranges.filter(range => { return !(range[0] >= hiddenRange.startLineNumber && range[1] <= hiddenRange.endLineNumber + 1); });
			}
		}
		this._renderStickyScroll();
	}

	private _findLineRanges(outlineElement: OutlineElement, depth: number) {
		if (outlineElement?.children.size) {
			let didRecursion: boolean = false;
			for (const outline of outlineElement?.children.values()) {
				const kind: SymbolKind = outline.symbol.kind;
				if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method || kind === SymbolKind.Module) {
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
			if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method || kind === SymbolKind.Module) {
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
			const modelVersionId = model.getVersionId();
			const outlineModel = await OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, model, token);
			if (token.isCancellationRequested) {
				return;
			}
			this._ranges = [];
			this._rangesVersionId = modelVersionId;
			for (const outline of outlineModel.children.values()) {
				if (outline instanceof OutlineElement) {
					const kind: SymbolKind = outline.symbol.kind;
					if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method || kind === SymbolKind.Module) {
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
		if (this._rangesVersionId !== model.getVersionId()) {
			// Old _ranges not updated yet
			return;
		}
		const scrollTop = this._editor.getScrollTop();

		this.stickyScrollWidget.emptyRootNode();
		const beginningLinesConsidered: Set<number> = new Set<number>();

		for (const [index, arr] of this._ranges.entries()) {
			const [start, end, depth] = arr;
			if (end - start > 0 && model.getLineContent(start) !== '') {
				const topOfElementAtDepth = (depth - 1) * lineHeight;
				const bottomOfElementAtDepth = depth * lineHeight;

				const bottomOfBeginningLine = this._editor.getBottomForLineNumber(start) - scrollTop;
				const topOfEndLine = this._editor.getTopForLineNumber(end) - scrollTop;
				const bottomOfEndLine = this._editor.getBottomForLineNumber(end) - scrollTop;

				if (!beginningLinesConsidered.has(start)) {
					if (topOfElementAtDepth >= topOfEndLine - 1 && topOfElementAtDepth < bottomOfEndLine - 2) {
						beginningLinesConsidered.add(start);
						this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(start, depth, this._editor, -1, bottomOfEndLine - bottomOfElementAtDepth));
						break;
					}
					else if (bottomOfElementAtDepth > bottomOfBeginningLine && bottomOfElementAtDepth < bottomOfEndLine - 1) {
						beginningLinesConsidered.add(start);
						this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(start, depth, this._editor, 0, 0));
					}
				} else {
					this._ranges.splice(index, 1);
				}
			}
		}
		this.stickyScrollWidget.updateRootNode();
	}

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}
}

const _ttPolicy = window.trustedTypes?.createPolicy('stickyScrollViewLayer', { createHTML: value => value });

class StickyScrollCodeLine {

	public readonly effectiveLineHeight: number = 0;

	constructor(private readonly _lineNumber: number, private readonly _depth: number, private readonly _editor: IActiveCodeEditor,
		private readonly _zIndex: number, private readonly _relativePosition: number) {
		this.effectiveLineHeight = this._editor.getOption(EditorOption.lineHeight) + this._relativePosition;
	}

	get lineNumber() {
		return this._lineNumber;
	}

	getDomNode() {

		const root: HTMLElement = document.createElement('div');
		const viewModel = this._editor._getViewModel();
		const viewLineNumber = viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(this._lineNumber, 1)).lineNumber;
		const lineRenderingData = viewModel.getViewLineRenderingData(viewLineNumber);

		let actualInlineDecorations: LineDecoration[];
		try {
			actualInlineDecorations = LineDecoration.filter(lineRenderingData.inlineDecorations, viewLineNumber, lineRenderingData.minColumn, lineRenderingData.maxColumn);
		} catch (err) {
			actualInlineDecorations = [];
		}

		const renderLineInput: RenderLineInput = new RenderLineInput(true, true, lineRenderingData.content, lineRenderingData.continuesWithWrappedLine,
			lineRenderingData.isBasicASCII, lineRenderingData.containsRTL, 0, lineRenderingData.tokens, actualInlineDecorations, lineRenderingData.tabSize,
			lineRenderingData.startVisibleColumn, 1, 1, 1, 100, 'none', true, true, null);

		const sb = createStringBuilder(400);
		renderViewLine(renderLineInput, sb);

		let newLine;
		if (_ttPolicy) {
			newLine = _ttPolicy.createHTML(sb.build() as string);
		} else {
			newLine = sb.build();
		}

		const lineHTMLNode = document.createElement('span');
		lineHTMLNode.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
		lineHTMLNode.style.overflow = 'hidden';
		lineHTMLNode.style.whiteSpace = 'nowrap';
		lineHTMLNode.style.display = 'inline-block';
		lineHTMLNode.style.lineHeight = this._editor.getOption(EditorOption.lineHeight).toString() + 'px';
		lineHTMLNode.innerHTML = newLine as string;

		const lineNumberHTMLNode = document.createElement('span');
		lineNumberHTMLNode.style.width = this._editor.getLayoutInfo().contentLeft.toString() + 'px';
		lineNumberHTMLNode.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
		lineNumberHTMLNode.style.color = 'var(--vscode-editorLineNumber-foreground)';
		lineNumberHTMLNode.style.display = 'inline-block';
		lineNumberHTMLNode.style.lineHeight = this._editor.getOption(EditorOption.lineHeight).toString() + 'px';

		const innerLineNumberHTML = document.createElement('span');
		innerLineNumberHTML.innerText = this._lineNumber.toString();
		innerLineNumberHTML.style.paddingLeft = this._editor.getLayoutInfo().lineNumbersLeft.toString() + 'px';
		innerLineNumberHTML.style.width = this._editor.getLayoutInfo().lineNumbersWidth.toString() + 'px';
		innerLineNumberHTML.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
		innerLineNumberHTML.style.textAlign = 'right';
		innerLineNumberHTML.style.float = 'left';
		innerLineNumberHTML.style.lineHeight = this._editor.getOption(EditorOption.lineHeight).toString() + 'px';
		lineNumberHTMLNode.appendChild(innerLineNumberHTML);

		root.onclick = e => {
			e.stopPropagation();
			e.preventDefault();
			this._editor.revealPosition({ lineNumber: this._lineNumber - this._depth + 1, column: 1 });
		};

		root.onmouseover = e => {
			innerLineNumberHTML.style.background = `var(--vscode-editorStickyScrollHover-background)`;
			lineHTMLNode.style.backgroundColor = `var(--vscode-editorStickyScrollHover-background)`;
			lineNumberHTMLNode.style.backgroundColor = `var(--vscode-editorStickyScrollHover-background)`;
			root.style.backgroundColor = `var(--vscode-editorStickyScrollHover-background)`;
			innerLineNumberHTML.style.cursor = `pointer`;
			lineHTMLNode.style.cursor = `pointer`;
			root.style.cursor = `pointer`;
			lineNumberHTMLNode.style.cursor = `pointer`;
		};
		root.onmouseleave = e => {
			innerLineNumberHTML.style.background = `var(--vscode-editorStickyScroll-background)`;
			lineHTMLNode.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
			lineNumberHTMLNode.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
			root.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
		};

		this._editor.applyFontInfo(lineHTMLNode);
		this._editor.applyFontInfo(innerLineNumberHTML);

		root.appendChild(lineNumberHTMLNode);
		root.appendChild(lineHTMLNode);

		root.style.zIndex = this._zIndex.toString();
		root.style.backgroundColor = `var(--vscode-editorStickyScroll-background)`;
		root.style.overflow = 'hidden';
		root.style.whiteSpace = 'nowrap';
		root.style.width = '100%';
		root.style.lineHeight = this._editor.getOption(EditorOption.lineHeight).toString() + 'px';
		root.style.height = this._editor.getOption(EditorOption.lineHeight).toString() + 'px';

		// Special case for last line of sticky scroll
		if (this._relativePosition) {
			root.style.position = 'relative';
			root.style.top = this._relativePosition + 'px';
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
		this.rootDomNode.style.boxShadow = `var(--vscode-scrollbar-shadow) 0 6px 6px -6px`;
	}

	get codeLineCount() {
		return this.arrayOfCodeLines.length;
	}

	getCurrentLines(): number[] {
		const widgetLineRange: number[] = [];
		for (const codeLine of this.arrayOfCodeLines) {
			widgetLineRange.push(codeLine.lineNumber);
		}
		return widgetLineRange;
	}

	pushCodeLine(codeLine: StickyScrollCodeLine) {
		this.arrayOfCodeLines.push(codeLine);
	}

	updateRootNode() {
		let widgetHeight: number = 0;
		for (const line of this.arrayOfCodeLines) {
			widgetHeight += line.effectiveLineHeight;
			this.rootDomNode.appendChild(line.getDomNode());
		}
		this.rootDomNode.style.height = widgetHeight.toString() + 'px';
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

