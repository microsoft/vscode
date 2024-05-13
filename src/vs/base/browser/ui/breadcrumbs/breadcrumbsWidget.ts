/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { commonPrefixLength } from 'vs/base/common/arrays';
import { ThemeIcon } from 'vs/base/common/themables';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import 'vs/css!./breadcrumbsWidget';

export abstract class BreadcrumbsItem {
	abstract dispose(): void;
	abstract equals(other: BreadcrumbsItem): boolean;
	abstract render(container: HTMLElement): void;
}

export interface IBreadcrumbsWidgetStyles {
	readonly breadcrumbsBackground: string | undefined;
	readonly breadcrumbsForeground: string | undefined;
	readonly breadcrumbsHoverForeground: string | undefined;
	readonly breadcrumbsFocusForeground: string | undefined;
	readonly breadcrumbsFocusAndSelectionForeground: string | undefined;
}

export interface IBreadcrumbsItemEvent {
	type: 'select' | 'focus';
	item: BreadcrumbsItem;
	node: HTMLElement;
	payload: any;
}

export class BreadcrumbsWidget {

	private readonly _disposables = new DisposableStore();
	private readonly _domNode: HTMLDivElement;
	private readonly _scrollable: DomScrollableElement;

	private readonly _onDidSelectItem = new Emitter<IBreadcrumbsItemEvent>();
	private readonly _onDidFocusItem = new Emitter<IBreadcrumbsItemEvent>();
	private readonly _onDidChangeFocus = new Emitter<boolean>();

	readonly onDidSelectItem: Event<IBreadcrumbsItemEvent> = this._onDidSelectItem.event;
	readonly onDidFocusItem: Event<IBreadcrumbsItemEvent> = this._onDidFocusItem.event;
	readonly onDidChangeFocus: Event<boolean> = this._onDidChangeFocus.event;

	private readonly _items = new Array<BreadcrumbsItem>();
	private readonly _nodes = new Array<HTMLDivElement>();
	private readonly _freeNodes = new Array<HTMLDivElement>();
	private readonly _separatorIcon: ThemeIcon;

	private _enabled: boolean = true;
	private _focusedItemIdx: number = -1;
	private _selectedItemIdx: number = -1;

	private _pendingDimLayout: IDisposable | undefined;
	private _pendingLayout: IDisposable | undefined;
	private _dimension: dom.Dimension | undefined;

	constructor(
		container: HTMLElement,
		horizontalScrollbarSize: number,
		separatorIcon: ThemeIcon,
		styles: IBreadcrumbsWidgetStyles
	) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-breadcrumbs';
		this._domNode.tabIndex = 0;
		this._domNode.setAttribute('role', 'list');
		this._scrollable = new DomScrollableElement(this._domNode, {
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Auto,
			horizontalScrollbarSize,
			useShadows: false,
			scrollYToX: true
		});
		this._separatorIcon = separatorIcon;
		this._disposables.add(this._scrollable);
		this._disposables.add(dom.addStandardDisposableListener(this._domNode, 'click', e => this._onClick(e)));
		container.appendChild(this._scrollable.getDomNode());

		const styleElement = dom.createStyleSheet(this._domNode);
		this._style(styleElement, styles);

		const focusTracker = dom.trackFocus(this._domNode);
		this._disposables.add(focusTracker);
		this._disposables.add(focusTracker.onDidBlur(_ => this._onDidChangeFocus.fire(false)));
		this._disposables.add(focusTracker.onDidFocus(_ => this._onDidChangeFocus.fire(true)));
	}

	setHorizontalScrollbarSize(size: number) {
		this._scrollable.updateOptions({
			horizontalScrollbarSize: size
		});
	}

	dispose(): void {
		this._disposables.dispose();
		this._pendingLayout?.dispose();
		this._pendingDimLayout?.dispose();
		this._onDidSelectItem.dispose();
		this._onDidFocusItem.dispose();
		this._onDidChangeFocus.dispose();
		this._domNode.remove();
		this._nodes.length = 0;
		this._freeNodes.length = 0;
	}

	layout(dim: dom.Dimension | undefined): void {
		if (dim && dom.Dimension.equals(dim, this._dimension)) {
			return;
		}
		if (dim) {
			// only measure
			this._pendingDimLayout?.dispose();
			this._pendingDimLayout = this._updateDimensions(dim);
		} else {
			this._pendingLayout?.dispose();
			this._pendingLayout = this._updateScrollbar();
		}
	}

	private _updateDimensions(dim: dom.Dimension): IDisposable {
		const disposables = new DisposableStore();
		disposables.add(dom.modify(dom.getWindow(this._domNode), () => {
			this._dimension = dim;
			this._domNode.style.width = `${dim.width}px`;
			this._domNode.style.height = `${dim.height}px`;
			disposables.add(this._updateScrollbar());
		}));
		return disposables;
	}

	private _updateScrollbar(): IDisposable {
		return dom.measure(dom.getWindow(this._domNode), () => {
			dom.measure(dom.getWindow(this._domNode), () => { // double RAF
				this._scrollable.setRevealOnScroll(false);
				this._scrollable.scanDomNode();
				this._scrollable.setRevealOnScroll(true);
			});
		});
	}

	private _style(styleElement: HTMLStyleElement, style: IBreadcrumbsWidgetStyles): void {
		let content = '';
		if (style.breadcrumbsBackground) {
			content += `.monaco-breadcrumbs { background-color: ${style.breadcrumbsBackground}}`;
		}
		if (style.breadcrumbsForeground) {
			content += `.monaco-breadcrumbs .monaco-breadcrumb-item { color: ${style.breadcrumbsForeground}}\n`;
		}
		if (style.breadcrumbsFocusForeground) {
			content += `.monaco-breadcrumbs .monaco-breadcrumb-item.focused { color: ${style.breadcrumbsFocusForeground}}\n`;
		}
		if (style.breadcrumbsFocusAndSelectionForeground) {
			content += `.monaco-breadcrumbs .monaco-breadcrumb-item.focused.selected { color: ${style.breadcrumbsFocusAndSelectionForeground}}\n`;
		}
		if (style.breadcrumbsHoverForeground) {
			content += `.monaco-breadcrumbs:not(.disabled	) .monaco-breadcrumb-item:hover:not(.focused):not(.selected) { color: ${style.breadcrumbsHoverForeground}}\n`;
		}
		styleElement.innerText = content;
	}

	setEnabled(value: boolean) {
		this._enabled = value;
		this._domNode.classList.toggle('disabled', !this._enabled);
	}

	domFocus(): void {
		const idx = this._focusedItemIdx >= 0 ? this._focusedItemIdx : this._items.length - 1;
		if (idx >= 0 && idx < this._items.length) {
			this._focus(idx, undefined);
		} else {
			this._domNode.focus();
		}
	}

	isDOMFocused(): boolean {
		return dom.isAncestorOfActiveElement(this._domNode);
	}

	getFocused(): BreadcrumbsItem {
		return this._items[this._focusedItemIdx];
	}

	setFocused(item: BreadcrumbsItem | undefined, payload?: any): void {
		this._focus(this._items.indexOf(item!), payload);
	}

	focusPrev(payload?: any): any {
		if (this._focusedItemIdx > 0) {
			this._focus(this._focusedItemIdx - 1, payload);
		}
	}

	focusNext(payload?: any): any {
		if (this._focusedItemIdx + 1 < this._nodes.length) {
			this._focus(this._focusedItemIdx + 1, payload);
		}
	}

	private _focus(nth: number, payload: any): void {
		this._focusedItemIdx = -1;
		for (let i = 0; i < this._nodes.length; i++) {
			const node = this._nodes[i];
			if (i !== nth) {
				node.classList.remove('focused');
			} else {
				this._focusedItemIdx = i;
				node.classList.add('focused');
				node.focus();
			}
		}
		this._reveal(this._focusedItemIdx, true);
		this._onDidFocusItem.fire({ type: 'focus', item: this._items[this._focusedItemIdx], node: this._nodes[this._focusedItemIdx], payload });
	}

	reveal(item: BreadcrumbsItem): void {
		const idx = this._items.indexOf(item);
		if (idx >= 0) {
			this._reveal(idx, false);
		}
	}

	revealLast(): void {
		this._reveal(this._items.length - 1, false);
	}

	private _reveal(nth: number, minimal: boolean): void {
		if (nth < 0 || nth >= this._nodes.length) {
			return;
		}
		const node = this._nodes[nth];
		if (!node) {
			return;
		}
		const { width } = this._scrollable.getScrollDimensions();
		const { scrollLeft } = this._scrollable.getScrollPosition();
		if (!minimal || node.offsetLeft > scrollLeft + width || node.offsetLeft < scrollLeft) {
			this._scrollable.setRevealOnScroll(false);
			this._scrollable.setScrollPosition({ scrollLeft: node.offsetLeft });
			this._scrollable.setRevealOnScroll(true);
		}
	}

	getSelection(): BreadcrumbsItem {
		return this._items[this._selectedItemIdx];
	}

	setSelection(item: BreadcrumbsItem | undefined, payload?: any): void {
		this._select(this._items.indexOf(item!), payload);
	}

	private _select(nth: number, payload: any): void {
		this._selectedItemIdx = -1;
		for (let i = 0; i < this._nodes.length; i++) {
			const node = this._nodes[i];
			if (i !== nth) {
				node.classList.remove('selected');
			} else {
				this._selectedItemIdx = i;
				node.classList.add('selected');
			}
		}
		this._onDidSelectItem.fire({ type: 'select', item: this._items[this._selectedItemIdx], node: this._nodes[this._selectedItemIdx], payload });
	}

	getItems(): readonly BreadcrumbsItem[] {
		return this._items;
	}

	setItems(items: BreadcrumbsItem[]): void {
		let prefix: number | undefined;
		let removed: BreadcrumbsItem[] = [];
		try {
			prefix = commonPrefixLength(this._items, items, (a, b) => a.equals(b));
			removed = this._items.splice(prefix, this._items.length - prefix, ...items.slice(prefix));
			this._render(prefix);
			dispose(removed);
			this._focus(-1, undefined);
		} catch (e) {
			const newError = new Error(`BreadcrumbsItem#setItems: newItems: ${items.length}, prefix: ${prefix}, removed: ${removed.length}`);
			newError.name = e.name;
			newError.stack = e.stack;
			throw newError;
		}
	}

	private _render(start: number): void {
		let didChange = false;
		for (; start < this._items.length && start < this._nodes.length; start++) {
			const item = this._items[start];
			const node = this._nodes[start];
			this._renderItem(item, node);
			didChange = true;
		}
		// case a: more nodes -> remove them
		while (start < this._nodes.length) {
			const free = this._nodes.pop();
			if (free) {
				this._freeNodes.push(free);
				free.remove();
				didChange = true;
			}
		}

		// case b: more items -> render them
		for (; start < this._items.length; start++) {
			const item = this._items[start];
			const node = this._freeNodes.length > 0 ? this._freeNodes.pop() : document.createElement('div');
			if (node) {
				this._renderItem(item, node);
				this._domNode.appendChild(node);
				this._nodes.push(node);
				didChange = true;
			}
		}
		if (didChange) {
			this.layout(undefined);
		}
	}

	private _renderItem(item: BreadcrumbsItem, container: HTMLDivElement): void {
		dom.clearNode(container);
		container.className = '';
		try {
			item.render(container);
		} catch (err) {
			container.innerText = '<<RENDER ERROR>>';
			console.error(err);
		}
		container.tabIndex = -1;
		container.setAttribute('role', 'listitem');
		container.classList.add('monaco-breadcrumb-item');
		const iconContainer = dom.$(ThemeIcon.asCSSSelector(this._separatorIcon));
		container.appendChild(iconContainer);
	}

	private _onClick(event: IMouseEvent): void {
		if (!this._enabled) {
			return;
		}
		for (let el: HTMLElement | null = event.target; el; el = el.parentElement) {
			const idx = this._nodes.indexOf(el as HTMLDivElement);
			if (idx >= 0) {
				this._focus(idx, event);
				this._select(idx, event);
				break;
			}
		}
	}
}
