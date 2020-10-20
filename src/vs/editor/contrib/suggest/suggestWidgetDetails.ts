/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ICodeEditor, IOverlayWidget } from 'vs/editor/browser/editorBrowser';
import { CompletionItem } from './suggest';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { ResizableHTMLElement } from 'vs/editor/contrib/suggest/resizable';

export function canExpandCompletionItem(item: CompletionItem | undefined): boolean {
	return !!item && Boolean(item.completion.documentation || item.completion.detail && item.completion.detail !== item.completion.label);
}

export class SuggestDetailsWidget extends ResizableHTMLElement {

	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose: Event<void> = this._onDidClose.event;

	private readonly _close: HTMLElement;
	private readonly _scrollbar: DomScrollableElement;
	private readonly _body: HTMLElement;
	private readonly _header: HTMLElement;
	private readonly _type: HTMLElement;
	private readonly _docs: HTMLElement;
	private readonly _disposables = new DisposableStore();

	private _renderDisposeable?: IDisposable;
	private _borderWidth: number = 1;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _markdownRenderer: MarkdownRenderer,
		private readonly _kbToggleDetails: string
	) {
		super();
		this.domNode.classList.add('suggest-details');

		this._body = dom.$('.body');

		this._scrollbar = new DomScrollableElement(this._body, {});
		dom.append(this.domNode, this._scrollbar.getDomNode());
		this._disposables.add(this._scrollbar);

		this._header = dom.append(this._body, dom.$('.header'));
		this._close = dom.append(this._header, dom.$('span' + Codicon.close.cssSelector));
		this._close.title = nls.localize('readLess', "Read Less ({0})", this._kbToggleDetails);
		this._type = dom.append(this._header, dom.$('p.type'));

		this._docs = dom.append(this._body, dom.$('p.docs'));

		this._configureFont();

		this._disposables.add(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._configureFont();
			}
		}));

		// _markdownRenderer.onDidRenderCodeBlock(this.layout, this, this._disposables);
	}

	dispose(): void {
		this._disposables.dispose();
		this._renderDisposeable?.dispose();
		this._renderDisposeable = undefined;
	}

	private _configureFont(): void {
		const options = this._editor.getOptions();
		const fontInfo = options.get(EditorOption.fontInfo);
		const fontFamily = fontInfo.fontFamily;
		const fontSize = options.get(EditorOption.suggestFontSize) || fontInfo.fontSize;
		const lineHeight = options.get(EditorOption.suggestLineHeight) || fontInfo.lineHeight;
		const fontWeight = fontInfo.fontWeight;
		const fontSizePx = `${fontSize}px`;
		const lineHeightPx = `${lineHeight}px`;

		this.domNode.style.fontSize = fontSizePx;
		this.domNode.style.fontWeight = fontWeight;
		this.domNode.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
		this._type.style.fontFamily = fontFamily;
		this._close.style.height = lineHeightPx;
		this._close.style.width = lineHeightPx;
	}

	private _lineHeight(): number {
		return this._editor.getOption(EditorOption.suggestLineHeight) || this._editor.getOption(EditorOption.fontInfo).lineHeight;
	}

	renderLoading(): void {
		this._type.textContent = nls.localize('loading', "Loading...");
		this._docs.textContent = '';
		this.layout(this._lineHeight(), 220);
	}

	renderItem(item: CompletionItem, explainMode: boolean): void {
		this._renderDisposeable?.dispose();
		this._renderDisposeable = undefined;

		let { documentation, detail } = item.completion;
		// --- documentation
		if (explainMode) {
			let md = '';
			md += `score: ${item.score[0]}${item.word ? `, compared '${item.completion.filterText && (item.completion.filterText + ' (filterText)') || item.completion.label}' with '${item.word}'` : ' (no prefix)'}\n`;
			md += `distance: ${item.distance}, see localityBonus-setting\n`;
			md += `index: ${item.idx}, based on ${item.completion.sortText && `sortText: "${item.completion.sortText}"` || 'label'}\n`;
			documentation = new MarkdownString().appendCodeblock('empty', md);
			detail = `Provider: ${item.provider._debugDisplayName}`;
		}

		if (!explainMode && !canExpandCompletionItem(item)) {
			this._type.textContent = '';
			this._docs.textContent = '';
			this.domNode.classList.add('no-docs');
			return;
		}
		this.domNode.classList.remove('no-docs');
		if (typeof documentation === 'string') {
			this._docs.classList.remove('markdown-docs');
			this._docs.textContent = documentation;
		} else {
			this._docs.classList.add('markdown-docs');
			this._docs.innerText = '';
			const renderedContents = this._markdownRenderer.render(documentation);
			this._renderDisposeable = renderedContents;
			this._docs.appendChild(renderedContents.element);
		}

		// --- details
		if (detail) {
			this._type.textContent = detail.length > 100000 ? `${detail.substr(0, 100000)}…` : detail;
			dom.show(this._type);
		} else {
			dom.clearNode(this._type);
			dom.hide(this._type);
		}

		this.domNode.style.userSelect = 'text';
		this.domNode.tabIndex = -1;

		this._close.onmousedown = e => {
			e.preventDefault();
			e.stopPropagation();
		};
		this._close.onclick = e => {
			e.preventDefault();
			e.stopPropagation();
			this._onDidClose.fire();
		};

		this._body.scrollTop = 0;
		this.layout(this._lineHeight() * 7, 430);
	}

	layout(height: number = this.size.height, width: number = this.size.width): void {
		super.layout(height, width);
		this._scrollbar.scanDomNode();
	}

	scrollDown(much = 8): void {
		this._body.scrollTop += much;
	}

	scrollUp(much = 8): void {
		this._body.scrollTop -= much;
	}

	scrollTop(): void {
		this._body.scrollTop = 0;
	}

	scrollBottom(): void {
		this._body.scrollTop = this._body.scrollHeight;
	}

	pageDown(): void {
		this.scrollDown(80);
	}

	pageUp(): void {
		this.scrollUp(80);
	}

	set borderWidth(width: number) {
		this._borderWidth = width;
	}

	get borderWidth() {
		return this._borderWidth;
	}
}

export const enum SuggestDetailsPosition {
	East,
	South,
	West
}

export class SuggestDetailsOverlay implements IOverlayWidget {

	private _added = false;

	constructor(
		readonly widget: SuggestDetailsWidget,
		private readonly _editor: ICodeEditor
	) { }

	dispose(): void {
		this.hide();
	}

	getId(): string {
		return 'suggest.details';
	}

	getDomNode(): HTMLElement {
		return this.widget.domNode;
	}

	getPosition(): null {
		return null;
	}

	show(): void {
		if (!this._added) {
			this._editor.addOverlayWidget(this);
			this.getDomNode().style.position = 'fixed';
			this._added = true;
		}
	}

	hide(): void {
		if (this._added) {
			this._editor.removeOverlayWidget(this);
			this._added = false;
		}
	}

	placeAtAnchor(anchor: HTMLElement) {
		const bodyBox = dom.getClientArea(document.body);
		const anchorBox = dom.getDomNodePagePosition(anchor);

		let size = this.widget.size;
		let maxSize: dom.Dimension;
		let minSize = new dom.Dimension(220, this._editor.getOption(EditorOption.suggestLineHeight) || this._editor.getOption(EditorOption.fontInfo).lineHeight);

		// position: east, west, south
		let pos = SuggestDetailsPosition.East;
		let width = bodyBox.width - (anchorBox.left + anchorBox.width); // east width

		if (anchorBox.left > width) {
			pos = SuggestDetailsPosition.West;
			width = anchorBox.left;
		}

		if (anchorBox.width > width * 1.3 && bodyBox.height - (anchorBox.top + anchorBox.height) > anchorBox.height) {
			pos = SuggestDetailsPosition.South;
			width = anchorBox.width;
		}

		let left = 0;
		let top = anchorBox.top;

		if (pos === SuggestDetailsPosition.East) {
			left = -this.widget.borderWidth + anchorBox.left + anchorBox.width;
			maxSize = new dom.Dimension(bodyBox.width - (anchorBox.left + anchorBox.width), bodyBox.height - anchorBox.top);

		} else if (pos === SuggestDetailsPosition.West) {
			left = Math.max(0, anchorBox.left - (size.width + this.widget.borderWidth));
			maxSize = new dom.Dimension(anchorBox.left, bodyBox.height - anchorBox.top);

		} else {
			left = anchorBox.left;
			top = -this.widget.borderWidth + anchorBox.top + anchorBox.height;
			maxSize = new dom.Dimension(anchorBox.width - (this.widget.borderWidth * 2), bodyBox.height - (anchorBox.top + anchorBox.height));
			minSize = minSize.with(maxSize.width);
		}

		this.widget.minSize = minSize;
		this.widget.maxSize = maxSize;
		this.widget.layout();

		this.getDomNode().style.position = 'fixed';
		this.getDomNode().style.left = left + 'px';
		this.getDomNode().style.top = top + 'px';
	}
}
