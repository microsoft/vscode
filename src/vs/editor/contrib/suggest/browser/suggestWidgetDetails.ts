/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { Emitter, Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';
import * as nls from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CompletionItem } from './suggest';

export function canExpandCompletionItem(item: CompletionItem | undefined): boolean {
	return !!item && Boolean(item.completion.documentation || item.completion.detail && item.completion.detail !== item.completion.label);
}

export class SuggestDetailsWidget {

	readonly domNode: HTMLDivElement;

	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose: Event<void> = this._onDidClose.event;

	private readonly _onDidChangeContents = new Emitter<this>();
	readonly onDidChangeContents: Event<this> = this._onDidChangeContents.event;

	private readonly _close: HTMLElement;
	private readonly _scrollbar: DomScrollableElement;
	private readonly _body: HTMLElement;
	private readonly _header: HTMLElement;
	private readonly _type: HTMLElement;
	private readonly _docs: HTMLElement;
	private readonly _disposables = new DisposableStore();

	private readonly _markdownRenderer: MarkdownRenderer;
	private readonly _renderDisposeable = new DisposableStore();
	private _borderWidth: number = 1;
	private _size = new dom.Dimension(330, 0);

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
	) {
		this.domNode = dom.$('.suggest-details');
		this.domNode.classList.add('no-docs');

		this._markdownRenderer = instaService.createInstance(MarkdownRenderer, { editor: _editor });

		this._body = dom.$('.body');

		this._scrollbar = new DomScrollableElement(this._body, {
			alwaysConsumeMouseWheel: true,
		});
		dom.append(this.domNode, this._scrollbar.getDomNode());
		this._disposables.add(this._scrollbar);

		this._header = dom.append(this._body, dom.$('.header'));
		this._close = dom.append(this._header, dom.$('span' + ThemeIcon.asCSSSelector(Codicon.close)));
		this._close.title = nls.localize('details.close', "Close");
		this._type = dom.append(this._header, dom.$('p.type'));

		this._docs = dom.append(this._body, dom.$('p.docs'));

		this._configureFont();

		this._disposables.add(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._configureFont();
			}
		}));
	}

	dispose(): void {
		this._disposables.dispose();
		this._renderDisposeable.dispose();
	}

	private _configureFont(): void {
		const options = this._editor.getOptions();
		const fontInfo = options.get(EditorOption.fontInfo);
		const fontFamily = fontInfo.getMassagedFontFamily();
		const fontSize = options.get(EditorOption.suggestFontSize) || fontInfo.fontSize;
		const lineHeight = options.get(EditorOption.suggestLineHeight) || fontInfo.lineHeight;
		const fontWeight = fontInfo.fontWeight;
		const fontSizePx = `${fontSize}px`;
		const lineHeightPx = `${lineHeight}px`;

		this.domNode.style.fontSize = fontSizePx;
		this.domNode.style.lineHeight = `${lineHeight / fontSize}`;
		this.domNode.style.fontWeight = fontWeight;
		this.domNode.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
		this._type.style.fontFamily = fontFamily;
		this._close.style.height = lineHeightPx;
		this._close.style.width = lineHeightPx;
	}

	getLayoutInfo() {
		const lineHeight = this._editor.getOption(EditorOption.suggestLineHeight) || this._editor.getOption(EditorOption.fontInfo).lineHeight;
		const borderWidth = this._borderWidth;
		const borderHeight = borderWidth * 2;
		return {
			lineHeight,
			borderWidth,
			borderHeight,
			verticalPadding: 22,
			horizontalPadding: 14
		};
	}


	renderLoading(): void {
		this._type.textContent = nls.localize('loading', "Loading...");
		this._docs.textContent = '';
		this.domNode.classList.remove('no-docs', 'no-type');
		this.layout(this.size.width, this.getLayoutInfo().lineHeight * 2);
		this._onDidChangeContents.fire(this);
	}

	renderItem(item: CompletionItem, explainMode: boolean): void {
		this._renderDisposeable.clear();

		let { detail, documentation } = item.completion;

		if (explainMode) {
			let md = '';
			md += `score: ${item.score[0]}\n`;
			md += `prefix: ${item.word ?? '(no prefix)'}\n`;
			md += `word: ${item.completion.filterText ? item.completion.filterText + ' (filterText)' : item.textLabel}\n`;
			md += `distance: ${item.distance} (localityBonus-setting)\n`;
			md += `index: ${item.idx}, based on ${item.completion.sortText && `sortText: "${item.completion.sortText}"` || 'label'}\n`;
			md += `commit_chars: ${item.completion.commitCharacters?.join('')}\n`;
			documentation = new MarkdownString().appendCodeblock('empty', md);
			detail = `Provider: ${item.provider._debugDisplayName}`;
		}

		if (!explainMode && !canExpandCompletionItem(item)) {
			this.clearContents();
			return;
		}

		this.domNode.classList.remove('no-docs', 'no-type');

		// --- details

		if (detail) {
			const cappedDetail = detail.length > 100000 ? `${detail.substr(0, 100000)}…` : detail;
			this._type.textContent = cappedDetail;
			this._type.title = cappedDetail;
			dom.show(this._type);
			this._type.classList.toggle('auto-wrap', !/\r?\n^\s+/gmi.test(cappedDetail));
		} else {
			dom.clearNode(this._type);
			this._type.title = '';
			dom.hide(this._type);
			this.domNode.classList.add('no-type');
		}

		// --- documentation
		dom.clearNode(this._docs);
		if (typeof documentation === 'string') {
			this._docs.classList.remove('markdown-docs');
			this._docs.textContent = documentation;

		} else if (documentation) {
			this._docs.classList.add('markdown-docs');
			dom.clearNode(this._docs);
			const renderedContents = this._markdownRenderer.render(documentation);
			this._docs.appendChild(renderedContents.element);
			this._renderDisposeable.add(renderedContents);
			this._renderDisposeable.add(this._markdownRenderer.onDidRenderAsync(() => {
				this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
				this._onDidChangeContents.fire(this);
			}));
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

		this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
		this._onDidChangeContents.fire(this);
	}

	clearContents() {
		this.domNode.classList.add('no-docs');
		this._type.textContent = '';
		this._docs.textContent = '';
	}

	get isEmpty(): boolean {
		return this.domNode.classList.contains('no-docs');
	}

	get size() {
		return this._size;
	}

	layout(width: number, height: number): void {
		const newSize = new dom.Dimension(width, height);
		if (!dom.Dimension.equals(newSize, this._size)) {
			this._size = newSize;
			dom.size(this.domNode, width, height);
		}
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

interface TopLeftPosition {
	top: number;
	left: number;
}

export class SuggestDetailsOverlay implements IOverlayWidget {

	readonly allowEditorOverflow = true;

	private readonly _disposables = new DisposableStore();
	private readonly _resizable: ResizableHTMLElement;

	private _added: boolean = false;
	private _anchorBox?: dom.IDomNodePagePosition;
	private _preferAlignAtTop: boolean = true;
	private _userSize?: dom.Dimension;
	private _topLeft?: TopLeftPosition;

	constructor(
		readonly widget: SuggestDetailsWidget,
		private readonly _editor: ICodeEditor
	) {

		this._resizable = new ResizableHTMLElement();
		this._resizable.domNode.classList.add('suggest-details-container');
		this._resizable.domNode.appendChild(widget.domNode);
		this._resizable.enableSashes(false, true, true, false);

		let topLeftNow: TopLeftPosition | undefined;
		let sizeNow: dom.Dimension | undefined;
		let deltaTop: number = 0;
		let deltaLeft: number = 0;
		this._disposables.add(this._resizable.onDidWillResize(() => {
			topLeftNow = this._topLeft;
			sizeNow = this._resizable.size;
		}));

		this._disposables.add(this._resizable.onDidResize(e => {
			if (topLeftNow && sizeNow) {
				this.widget.layout(e.dimension.width, e.dimension.height);

				let updateTopLeft = false;
				if (e.west) {
					deltaLeft = sizeNow.width - e.dimension.width;
					updateTopLeft = true;
				}
				if (e.north) {
					deltaTop = sizeNow.height - e.dimension.height;
					updateTopLeft = true;
				}
				if (updateTopLeft) {
					this._applyTopLeft({
						top: topLeftNow.top + deltaTop,
						left: topLeftNow.left + deltaLeft,
					});
				}
			}
			if (e.done) {
				topLeftNow = undefined;
				sizeNow = undefined;
				deltaTop = 0;
				deltaLeft = 0;
				this._userSize = e.dimension;
			}
		}));

		this._disposables.add(this.widget.onDidChangeContents(() => {
			if (this._anchorBox) {
				this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size, this._preferAlignAtTop);
			}
		}));
	}

	dispose(): void {
		this._resizable.dispose();
		this._disposables.dispose();
		this.hide();
	}

	getId(): string {
		return 'suggest.details';
	}

	getDomNode(): HTMLElement {
		return this._resizable.domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return this._topLeft ? { preference: this._topLeft } : null;
	}

	show(): void {
		if (!this._added) {
			this._editor.addOverlayWidget(this);
			this._added = true;
		}
	}

	hide(sessionEnded: boolean = false): void {
		this._resizable.clearSashHoverState();

		if (this._added) {
			this._editor.removeOverlayWidget(this);
			this._added = false;
			this._anchorBox = undefined;
			this._topLeft = undefined;
		}
		if (sessionEnded) {
			this._userSize = undefined;
			this.widget.clearContents();
		}
	}

	placeAtAnchor(anchor: HTMLElement, preferAlignAtTop: boolean) {
		const anchorBox = anchor.getBoundingClientRect();
		this._anchorBox = anchorBox;
		this._preferAlignAtTop = preferAlignAtTop;
		this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size, preferAlignAtTop);
	}

	_placeAtAnchor(anchorBox: dom.IDomNodePagePosition, size: dom.Dimension, preferAlignAtTop: boolean) {
		const bodyBox = dom.getClientArea(this.getDomNode().ownerDocument.body);

		const info = this.widget.getLayoutInfo();

		const defaultMinSize = new dom.Dimension(220, 2 * info.lineHeight);
		const defaultTop = anchorBox.top;

		type Placement = { top: number; left: number; fit: number; maxSizeTop: dom.Dimension; maxSizeBottom: dom.Dimension; minSize: dom.Dimension };

		// EAST
		const eastPlacement: Placement = (function () {
			const width = bodyBox.width - (anchorBox.left + anchorBox.width + info.borderWidth + info.horizontalPadding);
			const left = -info.borderWidth + anchorBox.left + anchorBox.width;
			const maxSizeTop = new dom.Dimension(width, bodyBox.height - anchorBox.top - info.borderHeight - info.verticalPadding);
			const maxSizeBottom = maxSizeTop.with(undefined, anchorBox.top + anchorBox.height - info.borderHeight - info.verticalPadding);
			return { top: defaultTop, left, fit: width - size.width, maxSizeTop, maxSizeBottom, minSize: defaultMinSize.with(Math.min(width, defaultMinSize.width)) };
		})();

		// WEST
		const westPlacement: Placement = (function () {
			const width = anchorBox.left - info.borderWidth - info.horizontalPadding;
			const left = Math.max(info.horizontalPadding, anchorBox.left - size.width - info.borderWidth);
			const maxSizeTop = new dom.Dimension(width, bodyBox.height - anchorBox.top - info.borderHeight - info.verticalPadding);
			const maxSizeBottom = maxSizeTop.with(undefined, anchorBox.top + anchorBox.height - info.borderHeight - info.verticalPadding);
			return { top: defaultTop, left, fit: width - size.width, maxSizeTop, maxSizeBottom, minSize: defaultMinSize.with(Math.min(width, defaultMinSize.width)) };
		})();

		// SOUTH
		const southPacement: Placement = (function () {
			const left = anchorBox.left;
			const top = -info.borderWidth + anchorBox.top + anchorBox.height;
			const maxSizeBottom = new dom.Dimension(anchorBox.width - info.borderHeight, bodyBox.height - anchorBox.top - anchorBox.height - info.verticalPadding);
			return { top, left, fit: maxSizeBottom.height - size.height, maxSizeBottom, maxSizeTop: maxSizeBottom, minSize: defaultMinSize.with(maxSizeBottom.width) };
		})();

		// take first placement that fits or the first with "least bad" fit
		const placements = [eastPlacement, westPlacement, southPacement];
		const placement = placements.find(p => p.fit >= 0) ?? placements.sort((a, b) => b.fit - a.fit)[0];

		// top/bottom placement
		const bottom = anchorBox.top + anchorBox.height - info.borderHeight;
		let alignAtTop: boolean;
		let height = size.height;
		const maxHeight = Math.max(placement.maxSizeTop.height, placement.maxSizeBottom.height);
		if (height > maxHeight) {
			height = maxHeight;
		}
		let maxSize: dom.Dimension;
		if (preferAlignAtTop) {
			if (height <= placement.maxSizeTop.height) {
				alignAtTop = true;
				maxSize = placement.maxSizeTop;
			} else {
				alignAtTop = false;
				maxSize = placement.maxSizeBottom;
			}
		} else {
			if (height <= placement.maxSizeBottom.height) {
				alignAtTop = false;
				maxSize = placement.maxSizeBottom;
			} else {
				alignAtTop = true;
				maxSize = placement.maxSizeTop;
			}
		}

		let { top, left } = placement;
		if (!alignAtTop && height > anchorBox.height) {
			top = bottom - height;
		}
		const editorDomNode = this._editor.getDomNode();
		if (editorDomNode) {
			// get bounding rectangle of the suggest widget relative to the editor
			const editorBoundingBox = editorDomNode.getBoundingClientRect();
			top -= editorBoundingBox.top;
			left -= editorBoundingBox.left;
		}
		this._applyTopLeft({ left, top });

		this._resizable.enableSashes(!alignAtTop, placement === eastPlacement, alignAtTop, placement !== eastPlacement);

		this._resizable.minSize = placement.minSize;
		this._resizable.maxSize = maxSize;
		this._resizable.layout(height, Math.min(maxSize.width, size.width));
		this.widget.layout(this._resizable.size.width, this._resizable.size.height);
	}

	private _applyTopLeft(topLeft: TopLeftPosition): void {
		this._topLeft = topLeft;
		this._editor.layoutOverlayWidget(this);
	}
}
