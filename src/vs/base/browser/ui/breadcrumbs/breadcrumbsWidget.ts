/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./breadcrumbsWidget';
import * as dom from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { Event, Emitter } from 'vs/base/common/event';
import { Color } from 'vs/base/common/color';

export class BreadcrumbsItem {

	constructor(
		readonly node: HTMLElement,
		readonly more: boolean
	) {

	}

	dispose(): void {
		//
	}
}

export class SimpleBreadcrumbsItem extends BreadcrumbsItem {

	constructor(text: string, title: string = text, more: boolean = true) {
		super(document.createElement('div'), more);
		this.node.innerText = text;
		this.node.title = title;
	}
}

export class RenderedBreadcrumbsItem<E> extends BreadcrumbsItem {

	readonly element: E;
	private _disposables: IDisposable[] = [];

	constructor(render: (element: E, container: HTMLDivElement, bucket: IDisposable[]) => any, element: E, more: boolean) {
		super(document.createElement('div'), more);
		this.element = element;
		render(element, this.node as HTMLDivElement, this._disposables);
	}

	dispose() {
		dispose(this._disposables);
		super.dispose();
	}
}

export interface IBreadcrumbsWidgetStyles {
	breadcrumbsBackground?: Color;
	breadcrumbsItemHoverBackground?: Color;
	breadcrumbsItemHoverForeground?: Color;
	breadcrumbsItemFocusBackground?: Color;
	breadcrumbsItemFocusForeground?: Color;
	breadcrumbsActiveItemSelectionBackground?: Color;
	breadcrumbsActiveItemSelectionForeground?: Color;
	breadcrumbsInactiveItemSelectionBackground?: Color;
	breadcrumbsInactiveItemSelectionForeground?: Color;
}

export class BreadcrumbsWidget {

	private readonly _disposables = new Array<IDisposable>();
	private readonly _domNode: HTMLDivElement;
	private readonly _styleElement: HTMLStyleElement;
	private readonly _scrollable: DomScrollableElement;

	private readonly _onDidSelectItem = new Emitter<BreadcrumbsItem>();
	private readonly _onDidFocusItem = new Emitter<BreadcrumbsItem>();
	private readonly _onDidChangeFocus = new Emitter<boolean>();

	readonly onDidSelectItem: Event<BreadcrumbsItem> = this._onDidSelectItem.event;
	readonly onDidFocusItem: Event<BreadcrumbsItem> = this._onDidFocusItem.event;
	readonly onDidChangeFocus: Event<boolean> = this._onDidChangeFocus.event;

	private readonly _items = new Array<BreadcrumbsItem>();
	private readonly _nodes = new Array<HTMLDivElement>();
	private readonly _freeNodes = new Array<HTMLDivElement>();

	private _focusedItemIdx: number = -1;
	private _selectedItemIdx: number = -1;

	constructor(
		container: HTMLElement
	) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-breadcrumbs';
		this._domNode.tabIndex = -1;
		this._scrollable = new DomScrollableElement(this._domNode, {
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Auto,
			horizontalScrollbarSize: 3,
			useShadows: false
		});
		this._disposables.push(this._scrollable);
		this._disposables.push(dom.addStandardDisposableListener(this._domNode, 'click', e => this._onClick(e)));
		container.appendChild(this._scrollable.getDomNode());

		this._styleElement = dom.createStyleSheet(this._domNode);

		let focusTracker = dom.trackFocus(this._domNode);
		this._disposables.push(focusTracker);
		this._disposables.push(focusTracker.onDidBlur(_ => this._onDidChangeFocus.fire(false)));
		this._disposables.push(focusTracker.onDidFocus(_ => this._onDidChangeFocus.fire(true)));
	}

	dispose(): void {
		dispose(this._disposables);
		this._domNode.remove();
		this._disposables.length = 0;
		this._nodes.length = 0;
		this._freeNodes.length = 0;
	}

	layout(dim: dom.Dimension): void {
		if (!dim) {
			this._scrollable.scanDomNode();
		} else {
			this._domNode.style.width = `${dim.width}px`;
			this._domNode.style.height = `${dim.height}px`;
			this._scrollable.scanDomNode();
		}
	}

	style(style: IBreadcrumbsWidgetStyles): void {
		let content = '';
		if (style.breadcrumbsItemFocusForeground) {
			content += `.monaco-breadcrumbs:focus .monaco-breadcrumb-item.focused { color: ${style.breadcrumbsItemFocusForeground}}\n`;
		}
		if (style.breadcrumbsItemFocusBackground) {
			content += `.monaco-breadcrumbs:focus .monaco-breadcrumb-item.focused { background-color: ${style.breadcrumbsItemFocusBackground}}\n`;
		}
		if (style.breadcrumbsItemFocusForeground) {
			content += `.monaco-breadcrumbs .monaco-breadcrumb-item:hover { color: ${style.breadcrumbsItemHoverForeground}}\n`;
		}
		if (style.breadcrumbsItemFocusBackground) {
			content += `.monaco-breadcrumbs .monaco-breadcrumb-item:hover { background-color: ${style.breadcrumbsItemHoverBackground}}\n`;
		}
		if (style.breadcrumbsActiveItemSelectionForeground) {
			content += `.monaco-breadcrumbs:hover .monaco-breadcrumb-item.selected { color: ${style.breadcrumbsActiveItemSelectionForeground}}\n`;
		}
		if (style.breadcrumbsActiveItemSelectionBackground) {
			content += `.monaco-breadcrumbs:hover .monaco-breadcrumb-item.selected { background-color: ${style.breadcrumbsActiveItemSelectionBackground}}\n`;
		}
		if (style.breadcrumbsInactiveItemSelectionForeground) {
			content += `.monaco-breadcrumbs .monaco-breadcrumb-item.selected { color: ${style.breadcrumbsInactiveItemSelectionForeground}}\n`;
		}
		if (style.breadcrumbsInactiveItemSelectionBackground) {
			content += `.monaco-breadcrumbs .monaco-breadcrumb-item.selected { background-color: ${style.breadcrumbsInactiveItemSelectionBackground}}\n`;
		}
		if (this._styleElement.innerHTML !== content) {
			this._styleElement.innerHTML = content;
		}
	}

	focus(): void {
		this._domNode.focus();
	}

	focusPrev(): any {
		this._focus((this._focusedItemIdx - 1 + this._nodes.length) % this._nodes.length);
		this._domNode.focus();
	}

	focusNext(): any {
		this._focus((this._focusedItemIdx + 1) % this._nodes.length);
		this._domNode.focus();
	}

	private _focus(nth: number): boolean {
		if (this._focusedItemIdx >= 0 && this._focusedItemIdx < this._nodes.length) {
			dom.removeClass(this._nodes[this._focusedItemIdx], 'focused');
			this._focusedItemIdx = -1;
		}
		if (nth < 0 || nth >= this._nodes.length) {
			return false;
		}
		this._focusedItemIdx = nth;
		dom.addClass(this._nodes[this._focusedItemIdx], 'focused');
		this._scrollable.setScrollPosition({ scrollLeft: this._nodes[this._focusedItemIdx].offsetLeft });
		this._onDidFocusItem.fire(this._items[this._focusedItemIdx]);
		return true;
	}

	getFocusedItem(): BreadcrumbsItem {
		return this._items[this._focusedItemIdx];
	}

	select(item: BreadcrumbsItem): void {
		this._select(this._items.indexOf(item));
	}

	private _select(nth: number): void {
		if (this._selectedItemIdx >= 0 && this._selectedItemIdx < this._nodes.length) {
			dom.removeClass(this._nodes[this._selectedItemIdx], 'selected');
			this._selectedItemIdx = -1;
		}
		if (nth < 0 || nth >= this._nodes.length) {
			return;
		}
		this._selectedItemIdx = nth;
		dom.addClass(this._nodes[this._selectedItemIdx], 'selected');
		this._onDidSelectItem.fire(this._items[this._selectedItemIdx]);
	}

	append(item: BreadcrumbsItem): void {
		this._items.push(item);
		this._render(this._items.length - 1);
	}

	replace(existing: BreadcrumbsItem, newItems: BreadcrumbsItem[]): void {
		let start = !existing ? 0 : this._items.indexOf(existing);
		let removed = this._items.splice(start, this._items.length - start, ...newItems);
		this._render(start);
		dispose(removed);
	}

	private _render(start: number): void {
		for (; start < this._items.length && start < this._nodes.length; start++) {
			let item = this._items[start];
			let node = this._nodes[start];
			this._renderItem(item, node);
		}
		// case a: more nodes -> remove them
		for (; start < this._nodes.length; start++) {
			this._nodes[start].remove();
			this._freeNodes.push(this._nodes[start]);
		}
		this._nodes.length = this._items.length;

		// case b: more items -> render them
		for (; start < this._items.length; start++) {
			let item = this._items[start];
			let node = this._freeNodes.length > 0 ? this._freeNodes.pop() : document.createElement('div');
			this._renderItem(item, node);
			this._domNode.appendChild(node);
			this._nodes[start] = node;
		}
		this.layout(undefined);
		this._focus(this._nodes.length - 1);
	}

	private _renderItem(item: BreadcrumbsItem, container: HTMLDivElement): void {
		dom.clearNode(container);
		dom.append(container, item.node);
		dom.addClass(container, 'monaco-breadcrumb-item');
		dom.toggleClass(container, 'monaco-breadcrumb-item-more', item.more);
	}

	private _onClick(event: IMouseEvent): void {
		for (let el = event.target; el; el = el.parentElement) {
			let idx = this._nodes.indexOf(el as any);
			if (idx >= 0) {
				this._focus(idx);
				this._select(idx);
				break;
			}
		}
	}
}
