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
		super(document.createElement('span'), more);
		this.node.innerText = text;
		this.node.title = title;
	}
}

export class RenderedBreadcrumbsItem<E> extends BreadcrumbsItem {


	private _disposables: IDisposable[] = [];

	constructor(render: (element: E, container: HTMLSpanElement, bucket: IDisposable[]) => any, element: E, more: boolean) {
		super(document.createElement('span'), more);
		render(element, this.node, this._disposables);
	}

	dispose() {
		dispose(this._disposables);
		super.dispose();
	}
}

export class BreadcrumbsWidget {

	private readonly _disposables = new Array<IDisposable>();
	private readonly _domNode: HTMLSpanElement;
	private readonly _scrollable: DomScrollableElement;
	private _cachedWidth: number;

	private readonly _onDidSelectItem = new Emitter<BreadcrumbsItem>();
	readonly onDidSelectItem: Event<BreadcrumbsItem> = this._onDidSelectItem.event;

	private readonly _items = new Array<BreadcrumbsItem>();
	private readonly _nodes = new Array<HTMLSpanElement>();
	private readonly _freeNodes = new Array<HTMLSpanElement>();
	private _activeItem: number;

	constructor(
		container: HTMLElement
	) {
		this._domNode = document.createElement('span');
		this._domNode.className = 'monaco-breadcrumbs';
		this._scrollable = new DomScrollableElement(this._domNode, {
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Auto,
			horizontalScrollbarSize: 3,
			useShadows: false
		});
		this._disposables.push(this._scrollable);
		this._disposables.push(dom.addStandardDisposableListener(this._domNode, 'click', e => this._onClick(e)));
		container.appendChild(this._scrollable.getDomNode());
	}

	dispose(): void {
		dispose(this._disposables);
		this._domNode.remove();
		this._disposables.length = 0;
		this._nodes.length = 0;
		this._freeNodes.length = 0;
	}

	layout(width: number = this._cachedWidth): void {
		if (typeof width === 'number') {
			this._cachedWidth = width;
			this._domNode.style.width = `${this._cachedWidth}px`;
			this._scrollable.scanDomNode();
		}
	}

	focus(): void {
		this._domNode.focus();
	}

	select(nth: number): void {
		if (typeof this._activeItem === 'number') {
			dom.removeClass(this._nodes[this._activeItem], 'active');
		}
		if (nth >= this._nodes.length) {
			this._activeItem = nth;
			let node = this._nodes[this._activeItem];
			dom.addClass(node, 'active');
			this._scrollable.setScrollPosition({ scrollLeft: node.offsetLeft });
		}
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
			let node = this._freeNodes.length > 0 ? this._freeNodes.pop() : document.createElement('span');
			this._renderItem(item, node);
			this._domNode.appendChild(node);
			this._nodes[start] = node;
		}
		this.layout();
		this.select(this._nodes.length - 1);
	}

	private _renderItem(item: BreadcrumbsItem, container: HTMLSpanElement): void {
		dom.clearNode(container);
		dom.append(container, item.node);
		dom.addClass(container, 'monaco-breadcrumb-item');
		dom.toggleClass(container, 'monaco-breadcrumb-item-more', item.more);
	}

	private _onClick(event: IMouseEvent): void {
		for (let el = event.target; el; el = el.parentElement) {
			let idx = this._nodes.indexOf(el as any);
			if (idx >= 0) {
				this._onDidSelectItem.fire(this._items[idx]);
				break;
			}
		}
	}
}
