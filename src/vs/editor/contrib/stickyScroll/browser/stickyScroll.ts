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

	private _ranges: number[][] = [];
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
			for (const outline of outlineElement?.children.values()) {
				depth++;
				this._findLineRanges(outline, depth);
			}
		} else {
			let currentStartLine: number | undefined = 0;
			let currentEndLine: number | undefined = 0;
			while (outlineElement) {
				currentStartLine = outlineElement?.symbol.range.startLineNumber as number;
				currentEndLine = outlineElement?.symbol.range.endLineNumber as number;
				this._ranges.push([currentStartLine, currentEndLine, depth]);
				depth--;
				if (outlineElement.parent instanceof OutlineElement) {
					outlineElement = outlineElement.parent;
				} else {
					break;
				}
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
					this._findLineRanges(outline, 1);
				}
			}
			this._ranges = this._ranges.sort(function (a, b) {
				return a[0] - b[0];
			});
		}
	}

	private _renderStickyScroll() {

		if (!(this._editor.hasModel())) {
			return;
		}

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const model = this._editor.getModel();
		const currentScrollTop: number = this._editor.getScrollTop() + this.stickyScrollWidget.codeLineCount * lineHeight;

		const scrollTop = this._editor.getScrollTop();
		let scrollDirection: ScrollDirection;
		if (this._lastScrollPosition < scrollTop) {
			scrollDirection = ScrollDirection.Down;
		} else {
			scrollDirection = ScrollDirection.Up;
		}
		this._lastScrollPosition = scrollTop;

		this.stickyScrollWidget.emptyRootNode();
		// TODO @Aiday: Find a way to iterate over only the ranges of interest, the position at which you start, use binary search
		for (const [start, end, depth] of this._ranges) {
			if (this._editor.getScrollTop() + depth * lineHeight >= end * lineHeight && this._editor.getScrollTop() + depth * lineHeight < (end + 1) * lineHeight) {
				this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(start), start, this._editor, -1, (depth - 1) * lineHeight + end * lineHeight - this._editor.getScrollTop() - depth * lineHeight));
			} else if (this._editor.getScrollTop() + depth * lineHeight >= (end - 1) * lineHeight && this._editor.getScrollTop() + depth * lineHeight < end * lineHeight) {
				this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(start), start, this._editor, 0));
			} else if (scrollDirection === ScrollDirection.Down && currentScrollTop >= (start - 1) * lineHeight && currentScrollTop < (end - 1) * lineHeight) {
				this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(start), start, this._editor, 0));
			} else if (scrollDirection === ScrollDirection.Up && currentScrollTop >= start * lineHeight && currentScrollTop < (end - 1) * lineHeight) {
				this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(start), start, this._editor, 0));
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
		// TODO @Aiday: use _getViewModel() or other method
		// TODO @Aiday: bracket decorations in RenderLineInput
		const lineRenderingData = this._editor._getViewModel().getViewLineRenderingData(this._editor.getVisibleRanges()[0], this._lineNumber);

		const renderLineInput: RenderLineInput = new RenderLineInput(true, true, modifiedLine, lineRenderingData.continuesWithWrappedLine,
			lineRenderingData.isBasicASCII, lineRenderingData.containsRTL, 0, lineRenderingData.tokens, [], lineRenderingData.tabSize,
			lineRenderingData.startVisibleColumn, 1, 1, 1, 500, 'none', true, true, null);

		const sb = createStringBuilder(2000);
		renderViewLine(renderLineInput, sb);

		let newLine;
		if (_ttPolicy) {
			newLine = _ttPolicy.createHTML(sb.build() as string);
		} else {
			newLine = sb.build();
		}

		const lineHTMLNode = document.createElement('span');
		lineHTMLNode.innerHTML = newLine as string;

		// TODO @Aiday: needs to be disposed, add one listener to sticky scroll widget, e has property target with direct element or child of the element
		lineHTMLNode.onclick = e => {
			e.stopPropagation();
			e.preventDefault();
			this._editor.revealLine(this._lineNumber);
		};
		this._editor.applyFontInfo(lineHTMLNode);

		const lineNumberHTMLNode = document.createElement('span');
		lineNumberHTMLNode.innerText = this._lineNumber.toString();
		lineNumberHTMLNode.style.width = this._editor.getLayoutInfo().contentLeft.toString() + 'px';
		lineNumberHTMLNode.style.display = 'inline-block';
		lineNumberHTMLNode.style.textAlign = 'center';
		lineNumberHTMLNode.style.color = 'var(--vscode-editorLineNumber-foreground)';
		this._editor.applyFontInfo(lineNumberHTMLNode);

		root.appendChild(lineNumberHTMLNode);
		root.appendChild(lineHTMLNode);

		root.style.zIndex = this._zIndex.toString();
		root.style.backgroundColor = `var(--vscode-stickyScroll-background)`;

		// Last line of sticky scroll
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
		return this.rootDomNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: null
		};
	}
}

registerEditorContribution(StickyScrollController.ID, StickyScrollController);

