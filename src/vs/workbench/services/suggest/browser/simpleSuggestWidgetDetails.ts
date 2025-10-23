/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import * as nls from '../../../../nls.js';
import { SimpleCompletionItem } from './simpleCompletionItem.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ISimpleSuggestWidgetFontInfo } from './simpleSuggestWidgetRenderer.js';

export function canExpandCompletionItem(item: SimpleCompletionItem | undefined): boolean {
	return !!item && Boolean(item.completion.documentation || item.completion.detail && item.completion.detail !== item.completion.label);
}

export const SuggestDetailsClassName = 'suggest-details';

export class SimpleSuggestDetailsWidget {

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

	private readonly _renderDisposeable = this._disposables.add(new DisposableStore());
	private _borderWidth: number = 1;
	private _size = new dom.Dimension(330, 0);

	constructor(
		private readonly _getFontInfo: () => ISimpleSuggestWidgetFontInfo,
		onDidFontInfoChange: Event<void>,
		private readonly _getAdvancedExplainModeDetails: () => string | undefined,
		@IInstantiationService instaService: IInstantiationService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		this.domNode = dom.$('.suggest-details');
		this.domNode.classList.add('no-docs');

		this._body = dom.$('.body');

		this._scrollbar = new DomScrollableElement(this._body, {
			alwaysConsumeMouseWheel: true,
		});
		dom.append(this.domNode, this._scrollbar.getDomNode());
		this._disposables.add(this._scrollbar);

		this._header = dom.append(this._body, dom.$('.header'));
		this._close = dom.append(this._header, dom.$('span' + ThemeIcon.asCSSSelector(Codicon.close)));
		this._close.title = nls.localize('details.close', "Close");
		this._close.role = 'button';
		this._close.tabIndex = -1;
		this._type = dom.append(this._header, dom.$('p.type'));

		this._docs = dom.append(this._body, dom.$('p.docs'));

		this._configureFont();

		this._disposables.add(onDidFontInfoChange(() => this._configureFont()));
	}

	private _configureFont(): void {
		const fontInfo = this._getFontInfo();
		const fontFamily = fontInfo.fontFamily;

		const fontSize = fontInfo.fontSize;
		const lineHeight = fontInfo.lineHeight;
		const fontWeight = fontInfo.fontWeight;
		const fontSizePx = `${fontSize}px`;
		const lineHeightPx = `${lineHeight}px`;

		this.domNode.style.fontSize = fontSizePx;
		this.domNode.style.lineHeight = `${lineHeight / fontSize}`;
		this.domNode.style.fontWeight = fontWeight;
		// this.domNode.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
		this._type.style.fontFamily = fontFamily;
		this._close.style.height = lineHeightPx;
		this._close.style.width = lineHeightPx;

	}

	dispose(): void {
		this._disposables.dispose();
		this._onDidClose.dispose();
		this._onDidChangeContents.dispose();
	}

	getLayoutInfo() {
		const lineHeight = this._getFontInfo().lineHeight;
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

	renderItem(item: SimpleCompletionItem, explainMode: boolean): void {
		this._renderDisposeable.clear();

		let { detail, documentation } = item.completion;

		let md = '';

		if (explainMode) {
			md += `score: ${item.score[0]}\n`;
			md += `prefix: ${item.word ?? '(no prefix)'}\n`;
			const vs = item.completion.replacementRange;
			md += `valueSelection: ${vs ? `[${vs[0]}, ${vs[1]}]` : 'undefined'}\\n`;
			md += `index: ${item.idx}\n`;
			if (this._getAdvancedExplainModeDetails) {
				const advancedDetails = this._getAdvancedExplainModeDetails();
				if (advancedDetails) {
					md += `${advancedDetails}\n`;
				}
			}
			detail = `Provider: ${item.completion.provider}`;
			documentation = new MarkdownString().appendCodeblock('empty', md);
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

		// // --- documentation

		dom.clearNode(this._docs);
		if (typeof documentation === 'string') {
			this._docs.classList.remove('markdown-docs');
			this._docs.textContent = documentation;

		} else if (documentation) {
			this._docs.classList.add('markdown-docs');
			dom.clearNode(this._docs);
			const renderedContents = this.markdownRendererService.render(documentation, {
				asyncRenderCallback: () => {
					this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
					this._onDidChangeContents.fire(this);
				}
			});
			this._docs.appendChild(renderedContents.element);
			this._renderDisposeable.add(renderedContents);
		}

		this.domNode.classList.toggle('detail-and-doc', !!detail && !!documentation);

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

		this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight + this.getLayoutInfo().verticalPadding);
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

	focus() {
		this.domNode.focus();
	}
}

export class SimpleSuggestDetailsOverlay {

	private readonly _disposables = new DisposableStore();
	private readonly _resizable: ResizableHTMLElement;

	private _added: boolean = false;
	private _anchorBox?: dom.IDomNodePagePosition;
	// private _preferAlignAtTop: boolean = true;
	private _userSize?: dom.Dimension;
	private _topLeft?: TopLeftPosition;

	constructor(
		readonly widget: SimpleSuggestDetailsWidget,
		private _container: HTMLElement,
	) {

		this._resizable = this._disposables.add(new ResizableHTMLElement());
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
				this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size);
			}
		}));
	}

	dispose(): void {
		this.widget.dispose();
		this._disposables.dispose();
		this.hide();
	}

	getId(): string {
		return 'suggest.details';
	}

	getDomNode(): HTMLElement {
		return this._resizable.domNode;
	}

	show(): void {
		if (!this._added) {
			this._container.appendChild(this._resizable.domNode);
			this._added = true;
		}
	}

	hide(sessionEnded: boolean = false): void {
		this._resizable.clearSashHoverState();

		if (this._added) {
			this._container.removeChild(this._resizable.domNode);
			this._added = false;
			this._anchorBox = undefined;
			// this._topLeft = undefined;
		}
		if (sessionEnded) {
			this._userSize = undefined;
			this.widget.clearContents();
		}
	}

	placeAtAnchor(anchor: HTMLElement) {
		const anchorBox = anchor.getBoundingClientRect();
		this._anchorBox = anchorBox;
		this.widget.layout(this._resizable.size.width, this._resizable.size.height);
		this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size);
	}

	_placeAtAnchor(anchorBox: dom.IDomNodePagePosition, size: dom.Dimension) {
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
		// if (preferAlignAtTop) {
		if (height <= placement.maxSizeTop.height) {
			alignAtTop = true;
			maxSize = placement.maxSizeTop;
		} else {
			alignAtTop = false;
			maxSize = placement.maxSizeBottom;
		}
		// } else {
		// 	if (height <= placement.maxSizeBottom.height) {
		// 		alignAtTop = false;
		// 		maxSize = placement.maxSizeBottom;
		// 	} else {
		// 		alignAtTop = true;
		// 		maxSize = placement.maxSizeTop;
		// 	}
		// }

		let { top, left } = placement;
		if (!alignAtTop && height > anchorBox.height) {
			top = bottom - height;
		}
		const editorDomNode = this._container;
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

	private _applyTopLeft(topLeft: { left: number; top: number }): void {
		this._topLeft = topLeft;
		// this._editor.layoutOverlayWidget(this);
		this._resizable.domNode.style.top = `${topLeft.top}px`;
		this._resizable.domNode.style.left = `${topLeft.left}px`;
		this._resizable.domNode.style.position = 'absolute';
	}
}

interface TopLeftPosition {
	top: number;
	left: number;
}
