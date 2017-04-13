/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toObject, assign, getOrDefault } from 'vs/base/common/objects';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Gesture, EventType as TouchEventType, GestureEvent } from 'vs/base/browser/touch';
import * as DOM from 'vs/base/browser/dom';
import { domEvent } from 'vs/base/browser/event';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollEvent, ScrollbarVisibility } from 'vs/base/common/scrollable';
import { RangeMap, IRange, relativeComplement, each } from './rangeMap';
import { IDelegate, IRenderer } from './list';
import { RowCache, IRow } from './rowCache';

interface IItem<T> {
	id: string;
	element: T;
	size: number;
	templateId: string;
	row: IRow;
}

const MouseEventTypes = [
	'click',
	'dblclick',
	'mouseup',
	'mousedown',
	'mouseover',
	'mousemove',
	'mouseout',
	'contextmenu'
];

export interface IListViewOptions {
	useShadows?: boolean;
}

const DefaultOptions: IListViewOptions = {
	useShadows: true
};

export class ListView<T> implements IDisposable {

	private items: IItem<T>[];
	private itemId: number;
	private rangeMap: RangeMap;
	private cache: RowCache<T>;
	private renderers: { [templateId: string]: IRenderer<T, any>; };
	private lastRenderTop: number;
	private lastRenderHeight: number;
	private _domNode: HTMLElement;
	private gesture: Gesture;
	private rowsContainer: HTMLElement;
	private scrollableElement: ScrollableElement;
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
		this.renderers = toObject<IRenderer<T, any>>(renderers, r => r.templateId);
		this.cache = new RowCache(this.renderers);

		this.lastRenderTop = 0;
		this.lastRenderHeight = 0;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-list';

		this.rowsContainer = document.createElement('div');
		this.rowsContainer.className = 'monaco-list-rows';
		this.gesture = new Gesture(this.rowsContainer);

		this.scrollableElement = new ScrollableElement(this.rowsContainer, {
			canUseTranslate3d: false,
			alwaysConsumeMouseWheel: true,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: getOrDefault(options, o => o.useShadows, DefaultOptions.useShadows)
		});

		this._domNode.appendChild(this.scrollableElement.getDomNode());
		container.appendChild(this._domNode);

		this.disposables = [this.rangeMap, this.gesture, this.scrollableElement];

		this.scrollableElement.onScroll(this.onScroll, this, this.disposables);
		domEvent(this.rowsContainer, TouchEventType.Change)(this.onTouchChange, this, this.disposables);

		this.layout();
	}

	get domNode(): HTMLElement {
		return this._domNode;
	}

	splice(start: number, deleteCount: number, elements: T[] = []): T[] {
		const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		each(previousRenderRange, i => this.removeItemFromDOM(this.items[i]));

		const inserted = elements.map<IItem<T>>(element => ({
			id: String(this.itemId++),
			element,
			size: this.delegate.getHeight(element),
			templateId: this.delegate.getTemplateId(element),
			row: null
		}));

		this.rangeMap.splice(start, deleteCount, ...inserted);

		const deleted = this.items.splice(start, deleteCount, ...inserted);

		const renderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		each(renderRange, i => this.insertItemInDOM(this.items[i], i));

		const scrollHeight = this.getContentHeight();
		this.rowsContainer.style.height = `${scrollHeight}px`;
		this.scrollableElement.updateState({ scrollHeight });

		return deleted.map(i => i.element);
	}

	get length(): number {
		return this.items.length;
	}

	get renderHeight(): number {
		const scrollState = this.scrollableElement.getScrollState();
		return scrollState.height;
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
		this.scrollableElement.updateState({
			height: height || DOM.getContentHeight(this._domNode)
		});
	}

	// Render

	private render(renderTop: number, renderHeight: number): void {
		const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		const renderRange = this.getRenderRange(renderTop, renderHeight);

		const rangesToInsert = relativeComplement(renderRange, previousRenderRange);
		const rangesToRemove = relativeComplement(previousRenderRange, renderRange);

		rangesToInsert.forEach(range => each(range, i => this.insertItemInDOM(this.items[i], i)));
		rangesToRemove.forEach(range => each(range, i => this.removeItemFromDOM(this.items[i])));

		const transform = `translate3d(0px, -${renderTop}px, 0px)`;
		this.rowsContainer.style.transform = transform;
		this.rowsContainer.style.webkitTransform = transform;
		this.lastRenderTop = renderTop;
		this.lastRenderHeight = renderHeight;
	}

	// DOM operations

	private insertItemInDOM(item: IItem<T>, index: number): void {
		if (!item.row) {
			item.row = this.cache.alloc(item.templateId);
		}

		if (!item.row.domNode.parentElement) {
			this.rowsContainer.appendChild(item.row.domNode);
		}

		const renderer = this.renderers[item.templateId];
		item.row.domNode.style.top = `${this.elementTop(index)}px`;
		item.row.domNode.style.height = `${item.size}px`;
		item.row.domNode.setAttribute('data-index', `${index}`);
		renderer.renderElement(item.element, index, item.row.templateData);
	}

	private removeItemFromDOM(item: IItem<T>): void {
		this.cache.release(item.row);
		item.row = null;
	}

	getContentHeight(): number {
		return this.rangeMap.size;
	}

	getScrollTop(): number {
		const scrollState = this.scrollableElement.getScrollState();
		return scrollState.scrollTop;
	}

	setScrollTop(scrollTop: number): void {
		this.scrollableElement.updateState({ scrollTop });
	}

	get scrollTop(): number {
		return this.getScrollTop();
	}

	set scrollTop(scrollTop: number) {
		this.setScrollTop(scrollTop);
	}

	// Events

	addListener(type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable {
		const userHandler = handler;
		let domNode = this.domNode;

		if (MouseEventTypes.indexOf(type) > -1) {
			handler = e => this.fireScopedEvent(e, userHandler, this.getItemIndexFromMouseEvent(e));
		} else if (type === TouchEventType.Tap) {
			domNode = this.rowsContainer;
			handler = e => this.fireScopedEvent(e, userHandler, this.getItemIndexFromGestureEvent(e));
		}

		return DOM.addDisposableListener(domNode, type, handler, useCapture);
	}

	private fireScopedEvent(
		event: any,
		handler: (event: any) => void,
		index: number
	) {
		if (index < 0) {
			return;
		}

		const element = this.items[index].element;
		handler(assign(event, { element, index }));
	}

	private onScroll(e: ScrollEvent): void {
		this.render(e.scrollTop, e.height);
	}

	private onTouchChange(event: GestureEvent): void {
		event.preventDefault();
		event.stopPropagation();

		this.scrollTop -= event.translationY;
	}

	// Util

	private getItemIndexFromMouseEvent(event: MouseEvent): number {
		return this.getItemIndexFromEventTarget(event.target);
	}

	private getItemIndexFromGestureEvent(event: GestureEvent): number {
		return this.getItemIndexFromEventTarget(event.initialTarget);
	}

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
