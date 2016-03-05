/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IScrollable } from 'vs/base/common/scrollable';
import { Emitter } from 'vs/base/common/event';
import { toObject, assign } from 'vs/base/common/objects';
import { IDisposable, disposeAll } from 'vs/base/common/lifecycle';
import { Gesture } from 'vs/base/browser/touch';
import * as DOM from 'vs/base/browser/dom';
import { IScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElementImpl';
import { RangeMap, IRange } from './rangeMap';
import { IDelegate, IRenderer } from './list';
import { RowCache, IRow } from './rowCache';
import { LcsDiff, ISequence } from 'vs/base/common/diff/diff';

interface IScrollEvent {
	vertical: boolean;
	horizontal: boolean;
}

interface IItemRange<T> {
	item: IItem<T>;
	index: number;
	range: IRange;
}

interface IItem<T> {
	id: string;
	element: T;
	size: number;
	templateId: string;
	row: IRow;
}

function toSequence<T>(itemRanges: IItemRange<T>[]): ISequence {
	return {
		getLength: () => itemRanges.length,
		getElementHash: i => `${ itemRanges[i].item.id }:${ itemRanges[i].range.start }:${ itemRanges[i].range.end }`
	};
}

const MouseEventTypes = ['click',
	'dblclick',
	'mouseup',
	'mousedown',
	'mouseover',
	'mousemove',
	'mouseout',
	'contextmenu'
];

export class ListView<T> implements IScrollable, IDisposable {

	private items: IItem<T>[];
	private itemId: number;
	private rangeMap: RangeMap;
	private cache: RowCache<T>;
	private renderers: { [templateId: string]: IRenderer<T, any>; };

	private renderTop: number;
	private _renderHeight: number;

	private _domNode: HTMLElement;
	private gesture: Gesture;
	private rowsContainer: HTMLElement;
	private scrollableElement: IScrollableElement;

	private _onScroll = new Emitter<IScrollEvent>();

	private toDispose: IDisposable[];

	constructor(
		container: HTMLElement,
		private delegate: IDelegate<T>,
		renderers: IRenderer<T, any>[]
	) {
		this.items = [];
		this.itemId = 0;
		this.rangeMap = new RangeMap();
		this.renderers = toObject<IRenderer<T, any>, IRenderer<T, any>>(renderers, r => r.templateId);
		this.cache = new RowCache(this.renderers);

		this.renderTop = 0;
		this._renderHeight = 0;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-list';
		this._domNode.tabIndex = 0;

		this.rowsContainer = document.createElement('div');
		this.rowsContainer.className = 'monaco-list-rows';
		this.gesture = new Gesture(this.rowsContainer);

		this.scrollableElement = new ScrollableElement(this.rowsContainer, {
			forbidTranslate3dUse: true,
			scrollable: this,
			horizontal: 'hidden',
			vertical: 'auto',
			useShadows: false,
			saveLastScrollTimeOnClassName: 'monaco-list-row'
		});

		this._domNode.appendChild(this.scrollableElement.getDomNode());
		container.appendChild(this._domNode);

		this.toDispose = [this.rangeMap, this.gesture, this.scrollableElement, this._onScroll];

		this.layout();
	}

	get domNode(): HTMLElement {
		return this._domNode;
	}

	splice(start: number, deleteCount: number, ...elements: T[]): T[] {
		const before = this.getRenderedItemRanges();
		const inserted = elements.map<IItem<T>>(element => ({
			id: String(this.itemId++),
			element,
			size: this.delegate.getHeight(element),
			templateId: this.delegate.getTemplateId(element),
			row: null
		}));

		this.rangeMap.splice(start, deleteCount, ...inserted);
		const deleted = this.items.splice(start, deleteCount, ...inserted);

		const after = this.getRenderedItemRanges();
		const lcs = new LcsDiff(toSequence(before), toSequence(after), null);
		const diffs = lcs.ComputeDiff();

		for (const diff of diffs) {
			for (let i = 0; i < diff.originalLength; i++) {
				this.removeItemFromDOM(before[diff.originalStart + i].item);
			}

			for (let i = 0; i < diff.modifiedLength; i++) {
				this.insertItemInDOM(after[diff.modifiedStart + i].item, after[0].index + diff.modifiedStart + i);
			}
		}

		this.rowsContainer.style.height = `${ this.rangeMap.size }px`;
		this.setScrollTop(this.renderTop);
		this.scrollableElement.onElementInternalDimensions();

		return deleted.map(i => i.element);
	}

	get length(): number {
		return this.items.length;
	}

	get renderHeight(): number {
		return this._renderHeight;
	}

	element(index: number): T {
		return this.items[index].element;
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
		this.setRenderHeight(height || DOM.getContentHeight(this._domNode));
		this.setScrollTop(this.renderTop);
		this.scrollableElement.onElementDimensions();
		this.scrollableElement.onElementInternalDimensions();
	}

	// Render

	private setRenderHeight(viewHeight: number) {
		this.render(this.renderTop, viewHeight);
		this._renderHeight = viewHeight;
	}

	private render(renderTop: number, renderHeight: number): void {
		const renderBottom = renderTop + renderHeight;
		const thisRenderBottom = this.renderTop + this._renderHeight;
		let i: number, stop: number;

		// when view scrolls down, start rendering from the renderBottom
		for (i = this.rangeMap.indexAfter(renderBottom) - 1, stop = this.rangeMap.indexAt(Math.max(thisRenderBottom, renderTop)); i >= stop; i--) {
			this.insertItemInDOM(this.items[i], i);
		}

		// when view scrolls up, start rendering from either this.renderTop or renderBottom
		for (i = Math.min(this.rangeMap.indexAt(this.renderTop), this.rangeMap.indexAfter(renderBottom)) - 1, stop = this.rangeMap.indexAt(renderTop); i >= stop; i--) {
			this.insertItemInDOM(this.items[i], i);
		}

		// when view scrolls down, start unrendering from renderTop
		for (i = this.rangeMap.indexAt(this.renderTop), stop = Math.min(this.rangeMap.indexAt(renderTop), this.rangeMap.indexAfter(thisRenderBottom)); i < stop; i++) {
			this.removeItemFromDOM(this.items[i]);
		}

		// when view scrolls up, start unrendering from either renderBottom this.renderTop
		for (i = Math.max(this.rangeMap.indexAfter(renderBottom), this.rangeMap.indexAt(this.renderTop)), stop = this.rangeMap.indexAfter(thisRenderBottom); i < stop; i++) {
			this.removeItemFromDOM(this.items[i]);
		}

		this.rowsContainer.style.transform = `translate3d(0px, -${ renderTop }px, 0px)`;
		this.renderTop = renderTop;
		this._renderHeight = renderBottom - renderTop;
	}

	private getRenderedItemRanges(): IItemRange<T>[] {
		const result: IItemRange<T>[] = [];
		const renderBottom = this.renderTop + this._renderHeight;

		let start = this.renderTop;
		let index = this.rangeMap.indexAt(start);
		let item = this.items[index];
		let end = -1;

		while (item && start <= renderBottom) {
			end = start + item.size;
			result.push({ item, index, range: { start, end }});
			start = end;
			item = this.items[++index];
		}

		return result;
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
		item.row.domNode.style.top = `${ this.elementTop(index) }px`;
		item.row.domNode.style.height = `${ item.size }px`;
		item.row.domNode.setAttribute('data-index', `${index}`);
		renderer.renderElement(item.element, index, item.row.templateData);
	}

	private removeItemFromDOM(item: IItem<T>): void {
		this.cache.release(item.row);
		item.row = null;
	}

	// IScrollable

	getScrollHeight(): number {
		return this.rangeMap.size;
	}

	getScrollWidth(): number {
		return 0;
	}

	getScrollLeft(): number {
		return 0;
	}

	setScrollLeft(scrollLeft: number): void {
		// noop
	}

	getScrollTop(): number {
		return this.renderTop;
	}

	setScrollTop(scrollTop: number): void {
		scrollTop = Math.min(scrollTop, this.getScrollHeight() - this._renderHeight);
		scrollTop = Math.max(scrollTop, 0);

		this.render(scrollTop, this._renderHeight);
		this.renderTop = scrollTop;

		this._onScroll.fire({ vertical: true, horizontal: false });
	}

	addScrollListener(callback: ()=>void): IDisposable {
		return this._onScroll.event(callback);
	}

	// Events

	addListener(type: string, handler: (event:any)=>void, useCapture?: boolean): IDisposable {
		if (MouseEventTypes.indexOf(type) > -1) {
			const userHandler = handler;
			handler = (event: MouseEvent) => {
				const index = this.getItemIndex(event);

				if (index < 0) {
					return;
				}

				const element = this.items[index].element;
				userHandler(assign(event, { element, index }));
			};
		}

		return DOM.addDisposableListener(this.domNode, type, handler, useCapture);
	}

	private getItemIndex(event: MouseEvent): number {
		let target = event.target;

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

	// Dispose

	dispose() {
		this.items = null;

		if (this._domNode && this._domNode.parentElement) {
			this._domNode.parentNode.removeChild(this._domNode);
			this._domNode = null;
		}

		this.toDispose = disposeAll(this.toDispose);
	}
}
