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
import { Range } from 'vs/editor/common/core/range';
import * as dom from 'vs/base/browser/dom';

class StickyScrollController implements IEditorContribution {

	static readonly ID = 'store.contrib.stickyScrollController';
	private readonly _editor: ICodeEditor;
	private readonly stickyScrollWidget: StickyScrollWidget;
	private readonly _languageFeaturesService: ILanguageFeaturesService;
	private readonly _store: DisposableStore = new DisposableStore();
	private previousEnclosingElementStartLine: number;
	private previousEnclosingElementEndLine: number;

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService
	) {

		this._editor = editor;
		this._languageFeaturesService = _languageFeaturesService;
		this.previousEnclosingElementStartLine = 0;
		this.previousEnclosingElementEndLine = 0;

		this.stickyScrollWidget = new StickyScrollWidget();
		this._editor.addOverlayWidget(this.stickyScrollWidget);

		this._store.add(this._editor.onDidChangeModel((e) => {
			this.renderStickyScroll();
		}));

		this._store.add(this._editor.onDidScrollChange((e) => {
			this.renderStickyScroll();

		}));

		this._store.add(this._editor.onDidChangeModelContent((e) => {
			this.renderStickyScroll();
		}));
	}

	async createOutlineModel(model: ITextModel): Promise<OutlineModel> {
		return await OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, model, CancellationToken.None);
	}

	private renderStickyScroll() {

		const range: Range[] = this._editor.getVisibleRanges();
		let outlineElement: OutlineElement | undefined;
		let line: string;

		if (this._editor.hasModel()) {
			const model = this._editor.getModel();
			this.createOutlineModel(model).then((outlineModel) => {
				outlineElement = outlineModel.getItemEnclosingPosition({ lineNumber: range[0].startLineNumber, column: 1 });
				const currentEnclosingItemStartLine: number | undefined = outlineElement?.symbol.range.startLineNumber;
				const currentEnclosingItemEndLine: number | undefined = outlineElement?.symbol.range.endLineNumber;

				if (outlineElement && currentEnclosingItemStartLine !== this.previousEnclosingElementStartLine && currentEnclosingItemEndLine !== this.previousEnclosingElementEndLine) {
					this.stickyScrollWidget.emptyRootNode();
					while (outlineElement) {
						line = model.getLineContent(outlineElement?.symbol?.range?.startLineNumber);
						this.stickyScrollWidget.pushCodeLine(new StickyScrollCodeLine(line, outlineElement?.symbol.range.startLineNumber));
						if (outlineElement.parent instanceof OutlineElement) {
							outlineElement = outlineElement.parent;
						} else {
							break;
						}
					}
					this.stickyScrollWidget.updateRootNode();
				} else if (!outlineElement) {
					this.stickyScrollWidget.emptyRootNode();
				}
			});
		}
	}
	dispose(): void {
		this._store.dispose();
	}
}

class StickyScrollCodeLine {
	constructor(public readonly line: string, public readonly lineNumber: number) { }

	getDomNode() {
		/* Error with the type checking
		const domTemplate = dom.h('div', [dom.h('span', { $: 'lineNumber' }), dom.h('span', { $: 'lineValue' })]);
		domTemplate.lineNumber.innerText = this.lineNumber.toString();
		domTemplate.lineValue.innerText = this.line;
		return domTemplate.root;
		*/

		const root: HTMLElement = document.createElement('div');
		const lineNumberHTMLNode = document.createElement('span');
		const lineHTMLNode = document.createElement('span');
		lineNumberHTMLNode.innerText = this.lineNumber.toString();
		lineHTMLNode.innerText = this.line;
		root.appendChild(lineNumberHTMLNode);
		root.appendChild(lineHTMLNode);
		return root;
	}
}

class StickyScrollWidget implements IOverlayWidget {

	allowEditorOverflow?: boolean | undefined;
	suppressMouseDown?: boolean | undefined;
	arrayOfCodeLines: StickyScrollCodeLine[] = [];
	readonly rootDomNode: HTMLElement = document.createElement('div');


	constructor() {

		this.rootDomNode = document.createElement('div');
		this.rootDomNode.style.background = 'var(--separator-border)';
		this.rootDomNode.style.width = '100%';
	}

	pushCodeLine(codeLine: StickyScrollCodeLine) {
		this.arrayOfCodeLines.unshift(codeLine);
		// this.rootDomNode.appendChild(codeLine.getDomNode());
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
		return this.rootDomNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: null
		};
	}
}

registerEditorContribution(StickyScrollController.ID, StickyScrollController);

