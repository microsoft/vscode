/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { OutlineModel, OutlineElement } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken, } from 'vs/base/common/cancellation';
import { ITextModel } from 'vs/editor/common/model';
import * as dom from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { IViewLineTokens } from 'vs/editor/common/tokens/lineTokens';

import * as colors from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';

enum ScrollDirection {
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

	private _ranges: number[][] = [];
	private _outlineModel: OutlineModel | null = null;
	private _lastScrollPositions: number[] = [];
	private _lastScrollPositionsLength: number = 0;
	private _scrollDirection: ScrollDirection = ScrollDirection.Down;
	private _themeService: IThemeService;

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
		@IThemeService _themeService: IThemeService
	) {

		this._editor = editor;
		this._languageFeaturesService = _languageFeaturesService;
		this._themeService = _themeService;
		this.stickyScrollWidget = new StickyScrollWidget(this._editor, this._themeService);

		this._editor.addOverlayWidget(this.stickyScrollWidget);

		this._store.add(this._editor.onDidChangeModel(() => this._update(true)));
		this._store.add(this._editor.onDidScrollChange(() => this._update(false)));
		this._store.add(this._editor.onDidChangeModelContent(() => this._update(true)));
		this._store.add(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				this._update(true);
			} else {
				this.stickyScrollWidget.emptyRootNode();
			}
		}));
		this._languageFeaturesService.documentSymbolProvider.onDidChange(() => this._update(true));
		this._update(true);

		console.log('this editor : ', this._editor);
		console.log('view model', this._editor._getViewModel());
		console.log('layout info', this._editor.getLayoutInfo());
		console.log('layout info', this._editor.getModel());
	}

	private async _update(updateOutline: boolean = false): Promise<void> {
		if (updateOutline) {
			await this._updateOutlineModel();
		}
		const options = this._editor.getOption(EditorOption.stickyScroll);
		if (options.enabled === false) {
			return;
		}
		this._renderStickyScroll();
	}

	async _createOutlineModel(model: ITextModel): Promise<OutlineModel> {
		return await OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, model, CancellationToken.None);
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

	private async _updateOutlineModel() {
		if (this._editor.hasModel()) {
			const model = this._editor.getModel();
			this._lastScrollPositionsLength = 2;
			await this._createOutlineModel(model).then((outlineModel) => {
				this._outlineModel = outlineModel;
				this._ranges = [];
				for (const outline of this._outlineModel?.children.values()) {
					if (outline instanceof OutlineElement) {
						this._findLineRanges(outline, 1);
					}
				}
				this._ranges = this._ranges.sort(function (a, b) {
					return a[0] - b[0];
				});
			});
		}
	}

	private _findScrollDirection(): ScrollDirection {
		for (let i = 1; i <= this._lastScrollPositionsLength; i++) {
			if (this._lastScrollPositions[i] < this._lastScrollPositions[i - 1]) {
				for (let j = 1; j < this._lastScrollPositionsLength; j++) {
					if (this._lastScrollPositions[j] > this._lastScrollPositions[j - 1]) {
						return ScrollDirection.None;
					}
				}
				return ScrollDirection.Up;
			}
		}
		return ScrollDirection.Down;
	}

	private _renderStickyScroll() {


		const lineHeight = this._editor._getViewModel()?.cursorConfig.lineHeight || 0;

		if (this._editor.hasModel()) {
			const model = this._editor.getModel();
			const currentScrollTop: number = this._editor.getScrollTop() + this.stickyScrollWidget.arrayOfCodeLines.length * lineHeight;
			if (this._lastScrollPositions.length === this._lastScrollPositionsLength) {
				this._lastScrollPositions.shift();
			}
			this._lastScrollPositions.push(this._editor.getScrollTop());
			this._scrollDirection = this._findScrollDirection();
			this.stickyScrollWidget.emptyRootNode();

			for (const range of this._ranges) {
				console.log('range : ', range);
				console.log('scroll : ', currentScrollTop);
				console.log('number of lines : ', this.stickyScrollWidget.arrayOfCodeLines.length);
				console.log('second scroll position : ', this._editor.getScrollTop() + range[2] * lineHeight);
				console.log('top pixel of bottom line : ', (range[1] - 1) * lineHeight);
				console.log('bottom pixel of bottom line : ', range[1] * lineHeight);

				// onDidChangeTheme redraw

				if (this._editor.getScrollTop() + range[2] * lineHeight >= range[1] * lineHeight && this._editor.getScrollTop() + range[2] * lineHeight < (range[1] + 1) * lineHeight) {
					console.log('top if loop : ', this._editor.getScrollTop() + range[2] * lineHeight, ' where range[2] is : ', range[2]);
					this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(range[0]), range[0], this._editor, this._themeService, -1, (range[2] - 1) * lineHeight + range[1] * lineHeight - this._editor.getScrollTop() - range[2] * lineHeight));
				} else if (this._editor.getScrollTop() + range[2] * lineHeight >= (range[1] - 1) * lineHeight && this._editor.getScrollTop() + range[2] * lineHeight < range[1] * lineHeight) {
					console.log('second top if loop : ', this._editor.getScrollTop() + range[2] * lineHeight, ' where range[2] is : ', range[2]);
					this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(range[0]), range[0], this._editor, this._themeService, 0));
				} else if (this._scrollDirection === ScrollDirection.Down && currentScrollTop >= (range[0] - 1) * lineHeight && currentScrollTop < (range[1] - 1) * lineHeight) {
					console.log('scroll going down: ', currentScrollTop);
					this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(range[0]), range[0], this._editor, this._themeService, 0));
				} else if (this._scrollDirection === ScrollDirection.Up && currentScrollTop >= range[0] * lineHeight && currentScrollTop < (range[1] - 1) * lineHeight) {
					console.log('scroll going up: ', currentScrollTop);
					this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(model.getLineContent(range[0]), range[0], this._editor, this._themeService, 0));
				}
			}
			this.stickyScrollWidget.updateRootNode();
		}
	}

	dispose(): void {
		this._store.dispose();
	}
}

const _ttPolicy = window.trustedTypes?.createPolicy('stickyScrollViewLayer', { createHTML: value => value });

class StickyScrollCodeLine {
	constructor(public readonly line: string, public readonly lineNumber: number, public readonly _editor: ICodeEditor, public readonly _themeService: IThemeService, public readonly zIndex: number, public readonly position?: number) { }


	getDomNode() {
		/* --- FOR SOME REASON THROWS AN ERROR
		const domTemplate = dom.h('div', [dom.h('span', { $: 'lineNumber' }), dom.h('span', { $: 'lineValue' })]);
		domTemplate.lineNumber.innerText = this.lineNumber.toString();
		domTemplate.lineValue.innerText = this.line;
		return domTemplate.root;
		---- */

		const root: HTMLElement = document.createElement('div');
		const modifiedLine = this.line.replace(/\s/g, '\xa0');
		const lineRenderingData = this._editor._getViewModel()?.getViewLineRenderingData(this._editor.getVisibleRanges()[0], this.lineNumber);
		// TODO : Parameters need to be tweaked and need to add line decorations for the bracket and brace pairs
		const renderLineInput: RenderLineInput = new RenderLineInput(true, true, modifiedLine, lineRenderingData?.continuesWithWrappedLine as boolean, lineRenderingData?.isBasicASCII as boolean, lineRenderingData?.containsRTL as boolean, 0, lineRenderingData?.tokens as IViewLineTokens, [], lineRenderingData?.tabSize as number, lineRenderingData?.startVisibleColumn as number, 1, 1, 1, 50, 'all', true, false, []);
		const sb = createStringBuilder(100000);
		renderViewLine(renderLineInput, sb);

		let newLine;
		if (_ttPolicy) {
			newLine = _ttPolicy.createHTML(sb.build() as string);
		} else {
			newLine = sb.build();
		}

		const lineHTMLNode = document.createElement('span');
		lineHTMLNode.innerHTML = newLine as string;

		lineHTMLNode.onclick = e => {
			e.stopPropagation();
			e.preventDefault();
			this._editor.revealLine(this.lineNumber);
		};
		this._editor.applyFontInfo(lineHTMLNode);

		const lineNumberHTMLNode = document.createElement('span');
		lineNumberHTMLNode.innerText = this.lineNumber.toString();
		lineNumberHTMLNode.style.width = this._editor.getLayoutInfo().contentLeft.toString() + 'px';
		lineNumberHTMLNode.style.display = 'inline-block';
		lineNumberHTMLNode.style.textAlign = 'center';
		this._editor.applyFontInfo(lineNumberHTMLNode);
		lineNumberHTMLNode.style.color = 'var(--vscode-editorLineNumber-foreground)';

		root.appendChild(lineNumberHTMLNode);
		root.appendChild(lineHTMLNode);
		if (this.position) {
			root.style.position = 'absolute';
			root.style.top = this.position.toString() + 'px';
			root.style.width = '100%';
		}
		root.style.zIndex = this.zIndex.toString();

		root.style.backgroundColor = `var(--vscode-stickyScroll-background)`;

		return root;
	}
}

export interface IStickyScrollWidgetStyles {
	stickyScrollBackground?: Color;
	stickyScrollForeground?: Color;
	stickyScrollHoverForeground?: Color;
	stickyScrollFocusForeground?: Color;
	stickyScrollFocusAndSelectionForeground?: Color;
}

class StickyScrollWidget implements IOverlayWidget {

	allowEditorOverflow?: boolean | undefined;
	suppressMouseDown?: boolean | undefined;
	arrayOfCodeLines: StickyScrollCodeLine[] = [];
	readonly rootDomNode: HTMLElement = document.createElement('div');

	constructor(public readonly _editor: ICodeEditor, public readonly _themeService: IThemeService) {
		this.rootDomNode = document.createElement('div');
		this.rootDomNode.style.width = '100%';
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
		this.arrayOfCodeLines = [];
		dom.clearNode(this.rootDomNode);
	}

	getId(): string {
		return 'editor.contrib.stickyScrollWidget';
	}

	getDomNode(): HTMLElement {
		this.rootDomNode.style.zIndex = '3';
		return this.rootDomNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: null
		};
	}
}

registerEditorContribution(StickyScrollController.ID, StickyScrollController);

