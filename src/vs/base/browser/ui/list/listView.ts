/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getOrDefault } from 'vs/base/common/objects';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Gesture, EventType as TouchEventType, GestureEvent } from 'vs/base/browser/touch';
import * as DOM from 'vs/base/browser/dom';
import { Event, mapEvent, filterEvent } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollEvent, ScrollbarVisibility } from 'vs/base/common/scrollable';
import { RangeMap, IRange, relativeComplement, intersect, shift } from './rangeMap';
import { IDelegate, IRenderer, IListMouseEvent, IListTouchEvent, IListGestureEvent } from './list';
import { RowCache, IRow } from './rowCache';
import { isWindows } from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import { ISpliceable } from 'vs/base/common/sequence';
import { memoize } from 'vs/base/common/decorators';
import { DragMouseEvent } from 'vs/base/browser/mouseEvent';

function canUseTranslate3d(): boolean {
	if (browser.isFirefox) {
		return false;
	}

	if (browser.getZoomLevel() !== 0) {
		return false;
	}

	// see https://github.com/Microsoft/vscode/issues/24483
	if (browser.isChromev56) {
		const pixelRatio = browser.getPixelRatio();
		if (Math.floor(pixelRatio) !== pixelRatio) {
			// Not an integer
			return false;
		}
	}

	return true;
}


interface IItem<T> {
	id: string;
	element: T;
	size: number;
	templateId: string;
	row: IRow;
}

export interface IListViewOptions {
	useShadows?: boolean;
	verticalScrollMode?: ScrollbarVisibility;
}

const DefaultOptions: IListViewOptions = {
	useShadows: true,
	verticalScrollMode: ScrollbarVisibility.Auto
};

export class ListView<T> implements ISpliceable<T>, IDisposable {

	private items: IItem<T>[];
	private itemId: number;
	private rangeMap: RangeMap;
	private cache: RowCache<T>;
	private renderers = new Map<string, IRenderer<T, any>>();
	private lastRenderTop: number;
	private lastRenderHeight: number;
	private _domNode: HTMLElement;
	private gesture: Gesture;
	private rowsContainer: HTMLElement;
	private scrollableElement: ScrollableElement;
	private splicing = false;
	private dragAndDropScrollInterval: number;
	private dragAndDropScrollTimeout: number;
	private dragAndDropMouseY: number;
	private disposables: IDisposable[];

	constructor(
		container: HTMLElement,
		private delegate: IDelegate<T>,
		renderers: IRenderer<T, any>[],
		options: IListViewOptions = DefaultOptions
	) {
		this.items = [];
		this.itemId = 0;
		this.rangeMap = new RangeMap();

		for (const renderer of renderers) {
			this.renderers.set(renderer.templateId, renderer);
		}

		this.cache = new RowCache(this.renderers);

		this.lastRenderTop = 0;
		this.lastRenderHeight = 0;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-list';

		this.rowsContainer = document.createElement('div');
		this.rowsContainer.className = 'monaco-list-rows';
		Gesture.addTarget(this.rowsContainer);

		this.scrollableElement = new ScrollableElement(this.rowsContainer, {
			alwaysConsumeMouseWheel: true,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: getOrDefault(options, o => o.verticalScrollMode, DefaultOptions.verticalScrollMode),
			useShadows: getOrDefault(options, o => o.useShadows, DefaultOptions.useShadows)
		});

		this._domNode.appendChild(this.scrollableElement.getDomNode());
		container.appendChild(this._domNode);

		this.disposables = [this.rangeMap, this.gesture, this.scrollableElement, this.cache];

		this.scrollableElement.onScroll(this.onScroll, this, this.disposables);
		domEvent(this.rowsContainer, TouchEventType.Change)(this.onTouchChange, this, this.disposables);

		// Prevent the monaco-scrollable-element from scrolling
		// https://github.com/Microsoft/vscode/issues/44181
		domEvent(this.scrollableElement.getDomNode(), 'scroll')
			(e => (e.target as HTMLElement).scrollTop = 0, null, this.disposables);

		const onDragOver = mapEvent(domEvent(this.rowsContainer, 'dragover'), e => new DragMouseEvent(e));
		onDragOver(this.onDragOver, this, this.disposables);

		this.layout();
	}

	get domNode(): HTMLElement {
		return this._domNode;
	}

	splice(start: number, deleteCount: number, elements: T[] = []): T[] {
		if (this.splicing) {
			throw new Error('Can\'t run recursive splices.');
		}

		this.splicing = true;

		try {
			return this._splice(start, deleteCount, elements);
		} finally {
			this.splicing = false;
		}
	}

	private _splice(start: number, deleteCount: number, elements: T[] = []): T[] {
		const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		const deleteRange = { start, end: start + deleteCount };
		const removeRange = intersect(previousRenderRange, deleteRange);

		for (let i = removeRange.start; i < removeRange.end; i++) {
			this.removeItemFromDOM(i);
		}

		const previousRestRange: IRange = { start: start + deleteCount, end: this.items.length };
		const previousRenderedRestRange = intersect(previousRestRange, previousRenderRange);
		const previousUnrenderedRestRanges = relativeComplement(previousRestRange, previousRenderRange);

		const inserted = elements.map<IItem<T>>(element => ({
			id: String(this.itemId++),
			element,
			size: this.delegate.getHeight(element),
			templateId: this.delegate.getTemplateId(element),
			row: null
		}));

		this.rangeMap.splice(start, deleteCount, ...inserted);
		const deleted = this.items.splice(start, deleteCount, ...inserted);

		const delta = elements.length - deleteCount;
		const renderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		const renderedRestRange = shift(previousRenderedRestRange, delta);
		const updateRange = intersect(renderRange, renderedRestRange);

		for (let i = updateRange.start; i < updateRange.end; i++) {
			this.updateItemInDOM(this.items[i], i);
		}

		const removeRanges = relativeComplement(renderedRestRange, renderRange);

		for (let r = 0; r < removeRanges.length; r++) {
			const removeRange = removeRanges[r];

			for (let i = removeRange.start; i < removeRange.end; i++) {
				this.removeItemFromDOM(i);
			}
		}

		const unrenderedRestRanges = previousUnrenderedRestRanges.map(r => shift(r, delta));
		const elementsRange = { start, end: start + elements.length };
		const insertRanges = [elementsRange, ...unrenderedRestRanges].map(r => intersect(renderRange, r));
		const beforeElement = this.getNextToLastElement(insertRanges);

		for (let r = 0; r < insertRanges.length; r++) {
			const insertRange = insertRanges[r];

			for (let i = insertRange.start; i < insertRange.end; i++) {
				this.insertItemInDOM(i, beforeElement);
			}
		}

		const scrollHeight = this.getContentHeight();
		this.rowsContainer.style.height = `${scrollHeight}px`;
		this.scrollableElement.setScrollDimensions({ scrollHeight });

		return deleted.map(i => i.element);
	}

	get length(): number {
		return this.items.length;
	}

	get renderHeight(): number {
		const scrollDimensions = this.scrollableElement.getScrollDimensions();
		return scrollDimensions.height;
	}

	element(index: number): T {
		return this.items[index].element;
	}

	domElement(index: number): HTMLElement {
		const row = this.items[index].row;
		return row && row.domNode;
	}

	elementHeight(index: number): number {
		return this.items[index].size;
	}

	elementTop(index: number): number {
		return this.rangeMap.positionAt(index);
	}

	indexAt(position: number): number {
		return this.rangeMap.indexAt(position);
	}

	indexAfter(position: number): number {
		return this.rangeMap.indexAfter(position);
	}

	layout(height?: number): void {
		this.scrollableElement.setScrollDimensions({
			height: height || DOM.getContentHeight(this._domNode)
		});
	}

	// Render

	private render(renderTop: number, renderHeight: number): void {
		const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		const renderRange = this.getRenderRange(renderTop, renderHeight);

		const rangesToInsert = relativeComplement(renderRange, previousRenderRange);
		const rangesToRemove = relativeComplement(previousRenderRange, renderRange);
		const beforeElement = this.getNextToLastElement(rangesToInsert);

		for (const range of rangesToInsert) {
			for (let i = range.start; i < range.end; i++) {
				this.insertItemInDOM(i, beforeElement);
			}
		}

		for (const range of rangesToRemove) {
			for (let i = range.start; i < range.end; i++) {
				this.removeItemFromDOM(i);
			}
		}

		if (canUseTranslate3d() && !isWindows /* Windows: translate3d breaks subpixel-antialias (ClearType) unless a background is defined */) {
			const transform = `translate3d(0px, -${renderTop}px, 0px)`;
			this.rowsContainer.style.transform = transform;
			this.rowsContainer.style.webkitTransform = transform;
		} else {
			this.rowsContainer.style.top = `-${renderTop}px`;
		}

		this.lastRenderTop = renderTop;
		this.lastRenderHeight = renderHeight;
	}

	// DOM operations

	private insertItemInDOM(index: number, beforeElement: HTMLElement | null): void {
		const item = this.items[index];

		if (!item.row) {
			item.row = this.cache.alloc(item.templateId);
		}

		if (!item.row.domNode.parentElement) {
			if (beforeElement) {
				this.rowsContainer.insertBefore(item.row.domNode, beforeElement);
			} else {
				this.rowsContainer.appendChild(item.row.domNode);
			}
		}

		item.row.domNode.style.height = `${item.size}px`;
		this.updateItemInDOM(item, index);

		const renderer = this.renderers.get(item.templateId);
		renderer.renderElement(item.element, index, item.row.templateData);
	}

	private updateItemInDOM(item: IItem<T>, index: number): void {
		item.row.domNode.style.top = `${this.elementTop(index)}px`;
		item.row.domNode.setAttribute('data-index', `${index}`);
		item.row.domNode.setAttribute('data-last-element', index === this.length - 1 ? 'true' : 'false');
		item.row.domNode.setAttribute('aria-setsize', `${this.length}`);
		item.row.domNode.setAttribute('aria-posinset', `${index + 1}`);
	}

	private removeItemFromDOM(index: number): void {
		const item = this.items[index];
		this.cache.release(item.row);
		item.row = null;
	}

	getContentHeight(): number {
		return this.rangeMap.size;
	}

	getScrollTop(): number {
		const scrollPosition = this.scrollableElement.getScrollPosition();
		return scrollPosition.scrollTop;
	}

	setScrollTop(scrollTop: number): void {
		this.scrollableElement.setScrollPosition({ scrollTop });
	}

	get scrollTop(): number {
		return this.getScrollTop();
	}

	set scrollTop(scrollTop: number) {
		this.setScrollTop(scrollTop);
	}

	// Events

	@memoize get onMouseClick(): Event<IListMouseEvent<T>> { return filterEvent(mapEvent(domEvent(this.domNode, 'click'), e => this.toMouseEvent(e)), e => e.index >= 0); }
	@memoize get onMouseDblClick(): Event<IListMouseEvent<T>> { return filterEvent(mapEvent(domEvent(this.domNode, 'dblclick'), e => this.toMouseEvent(e)), e => e.index >= 0); }
	@memoize get onMouseUp(): Event<IListMouseEvent<T>> { return filterEvent(mapEvent(domEvent(this.domNode, 'mouseup'), e => this.toMouseEvent(e)), e => e.index >= 0); }
	@memoize get onMouseDown(): Event<IListMouseEvent<T>> { return filterEvent(mapEvent(domEvent(this.domNode, 'mousedown'), e => this.toMouseEvent(e)), e => e.index >= 0); }
	@memoize get onMouseOver(): Event<IListMouseEvent<T>> { return filterEvent(mapEvent(domEvent(this.domNode, 'mouseover'), e => this.toMouseEvent(e)), e => e.index >= 0); }
	@memoize get onMouseMove(): Event<IListMouseEvent<T>> { return filterEvent(mapEvent(domEvent(this.domNode, 'mousemove'), e => this.toMouseEvent(e)), e => e.index >= 0); }
	@memoize get onMouseOut(): Event<IListMouseEvent<T>> { return filterEvent(mapEvent(domEvent(this.domNode, 'mouseout'), e => this.toMouseEvent(e)), e => e.index >= 0); }
	@memoize get onContextMenu(): Event<IListMouseEvent<T>> { return filterEvent(mapEvent(domEvent(this.domNode, 'contextmenu'), e => this.toMouseEvent(e)), e => e.index >= 0); }
	@memoize get onTouchStart(): Event<IListTouchEvent<T>> { return filterEvent(mapEvent(domEvent(this.domNode, 'touchstart'), e => this.toTouchEvent(e)), e => e.index >= 0); }
	@memoize get onTap(): Event<IListGestureEvent<T>> { return filterEvent(mapEvent(domEvent(this.rowsContainer, TouchEventType.Tap), e => this.toGestureEvent(e)), e => e.index >= 0); }

	private toMouseEvent(browserEvent: MouseEvent): IListMouseEvent<T> {
		const index = this.getItemIndexFromEventTarget(browserEvent.target);
		const element = index < 0 ? undefined : this.items[index].element;
		return { browserEvent, index, element };
	}

	private toTouchEvent(browserEvent: TouchEvent): IListTouchEvent<T> {
		const index = this.getItemIndexFromEventTarget(browserEvent.target);
		const element = index < 0 ? undefined : this.items[index].element;
		return { browserEvent, index, element };
	}

	private toGestureEvent(browserEvent: GestureEvent): IListGestureEvent<T> {
		const index = this.getItemIndexFromEventTarget(browserEvent.initialTarget);
		const element = index < 0 ? undefined : this.items[index].element;
		return { browserEvent, index, element };
	}

	private onScroll(e: ScrollEvent): void {
		this.render(e.scrollTop, e.height);
	}

	private onTouchChange(event: GestureEvent): void {
		event.preventDefault();
		event.stopPropagation();

		this.scrollTop -= event.translationY;
	}

	private onDragOver(event: DragMouseEvent): void {
		this.setupDragAndDropScrollInterval();
		this.dragAndDropMouseY = event.posy;
	}

	private setupDragAndDropScrollInterval(): void {
		var viewTop = DOM.getTopLeftOffset(this._domNode).top;

		if (!this.dragAndDropScrollInterval) {
			this.dragAndDropScrollInterval = window.setInterval(() => {
				if (this.dragAndDropMouseY === undefined) {
					return;
				}

				var diff = this.dragAndDropMouseY - viewTop;
				var scrollDiff = 0;
				var upperLimit = this.renderHeight - 35;

				if (diff < 35) {
					scrollDiff = Math.max(-14, 0.2 * (diff - 35));
				} else if (diff > upperLimit) {
					scrollDiff = Math.min(14, 0.2 * (diff - upperLimit));
				}

				this.scrollTop += scrollDiff;
			}, 10);

			this.cancelDragAndDropScrollTimeout();

			this.dragAndDropScrollTimeout = window.setTimeout(() => {
				this.cancelDragAndDropScrollInterval();
				this.dragAndDropScrollTimeout = null;
			}, 1000);
		}
	}

	private cancelDragAndDropScrollInterval(): void {
		if (this.dragAndDropScrollInterval) {
			window.clearInterval(this.dragAndDropScrollInterval);
			this.dragAndDropScrollInterval = null;
		}

		this.cancelDragAndDropScrollTimeout();
	}

	private cancelDragAndDropScrollTimeout(): void {
		if (this.dragAndDropScrollTimeout) {
			window.clearTimeout(this.dragAndDropScrollTimeout);
			this.dragAndDropScrollTimeout = null;
		}
	}

	// Util

	private getItemIndexFromEventTarget(target: EventTarget): number {
		while (target instanceof HTMLElement && target !== this.rowsContainer) {
			const element = target as HTMLElement;
			const rawIndex = element.getAttribute('data-index');

			if (rawIndex) {
				const index = Number(rawIndex);

				if (!isNaN(index)) {
					return index;
				}
			}

			target = element.parentElement;
		}

		return -1;
	}

	private getRenderRange(renderTop: number, renderHeight: number): IRange {
		return {
			start: this.rangeMap.indexAt(renderTop),
			end: this.rangeMap.indexAfter(renderTop + renderHeight - 1)
		};
	}

	private getNextToLastElement(ranges: IRange[]): HTMLElement | null {
		const lastRange = ranges[ranges.length - 1];

		if (!lastRange) {
			return null;
		}

		const nextToLastItem = this.items[lastRange.end];

		if (!nextToLastItem) {
			return null;
		}

		if (!nextToLastItem.row) {
			return null;
		}

		return nextToLastItem.row.domNode;
	}

	// Dispose

	dispose() {
		this.items = null;

		if (this._domNode && this._domNode.parentElement) {
			this._domNode.parentNode.removeChild(this._domNode);
			this._domNode = null;
		}

		this.disposables = dispose(this.disposables);
	}
}
