/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IDisposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { append, $, hide, show } from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CompletionItem } from './suggest';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';

export function canExpandCompletionItem(item: CompletionItem | null): boolean {
	return !!item && Boolean(item.completion.documentation || item.completion.detail && item.completion.detail !== item.completion.label);
}

export class SuggestionDetails {

	readonly element: HTMLElement;

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
		container: HTMLElement,
		private readonly _editor: ICodeEditor,
		private readonly _markdownRenderer: MarkdownRenderer,
		private readonly _kbToggleDetails: string
	) {
		this.element = append(container, $('.details'));
		this._disposables.add(toDisposable(() => this.element.remove()));

		this._body = $('.body');

		this._scrollbar = new DomScrollableElement(this._body, {});
		append(this.element, this._scrollbar.getDomNode());
		this._disposables.add(this._scrollbar);

		this._header = append(this._body, $('.header'));
		this._close = append(this._header, $('span' + Codicon.close.cssSelector));
		this._close.title = nls.localize('readLess', "Read Less ({0})", this._kbToggleDetails);
		this._type = append(this._header, $('p.type'));

		this._docs = append(this._body, $('p.docs'));

		this._configureFont();

		this._disposables.add(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._configureFont();
			}
		}));

		_markdownRenderer.onDidRenderCodeBlock(() => this._scrollbar.scanDomNode(), this, this._disposables);
	}

	dispose(): void {
		this._disposables.dispose();
		this._renderDisposeable?.dispose();
		this._renderDisposeable = undefined;
	}

	private _configureFont() {
		const options = this._editor.getOptions();
		const fontInfo = options.get(EditorOption.fontInfo);
		const fontFamily = fontInfo.fontFamily;
		const fontSize = options.get(EditorOption.suggestFontSize) || fontInfo.fontSize;
		const lineHeight = options.get(EditorOption.suggestLineHeight) || fontInfo.lineHeight;
		const fontWeight = fontInfo.fontWeight;
		const fontSizePx = `${fontSize}px`;
		const lineHeightPx = `${lineHeight}px`;

		this.element.style.fontSize = fontSizePx;
		this.element.style.fontWeight = fontWeight;
		this.element.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
		this._type.style.fontFamily = fontFamily;
		this._close.style.height = lineHeightPx;
		this._close.style.width = lineHeightPx;
	}

	renderLoading(): void {
		this._type.textContent = nls.localize('loading', "Loading...");
		this._docs.textContent = '';
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
			this.element.classList.add('no-docs');
			return;
		}
		this.element.classList.remove('no-docs');
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
			this._type.innerText = detail.length > 100000 ? `${detail.substr(0, 100000)}…` : detail;
			show(this._type);
		} else {
			this._type.innerText = '';
			hide(this._type);
		}

		this.element.style.height = this._header.offsetHeight + this._docs.offsetHeight + (this._borderWidth * 2) + 'px';
		this.element.style.userSelect = 'text';
		this.element.tabIndex = -1;

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

	setBorderWidth(width: number): void {
		this._borderWidth = width;
	}
}
