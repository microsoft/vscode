/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./list';
import { IScrollable } from 'vs/base/common/scrollable';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Gesture } from 'vs/base/browser/touch';
import * as DOM from 'vs/base/browser/dom';
import { IScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/impl/scrollableElement';
import { RangeMap, IRange } from './rangeMap';
import { IScrollEvent, IDelegate, IRendererMap } from './list';
import { RowCache, IRow } from './rowCache';
import { LcsDiff, ISequence } from 'vs/base/common/diff/diff';

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

export class List<T> implements IScrollable {

	private items: IItem<T>[];
	private itemId: number;
	private rangeMap: RangeMap;
	private cache: RowCache<T>;

	private renderTop: number;
	private renderHeight: number;

	private domNode: HTMLElement;
	private wrapper: HTMLElement;
	private gesture: Gesture;
	private rowsContainer: HTMLElement;
	private onScroll: Emitter<IScrollEvent>;
	private scrollableElement: IScrollableElement;

	constructor(
		container: HTMLElement,
		private delegate: IDelegate<T>,
		private renderers: IRendererMap<T>
	) {
		this.items = [];
		this.itemId = 0;
		this.rangeMap = new RangeMap();
		this.cache = new RowCache(renderers);

		this.renderTop = 0;
		this.renderHeight = 0;

		this.domNode = document.createElement('div');
		this.domNode.className = 'monaco-list';
		this.domNode.tabIndex = 0;

		this.wrapper = document.createElement('div');
		this.wrapper.className = 'monaco-list-wrapper';

		this.onScroll = new Emitter<IScrollEvent>();
		this.scrollableElement = new ScrollableElement(this.wrapper, {
			forbidTranslate3dUse: true,
			scrollable: this,
			horizontal: 'hidden',
			vertical: 'auto',
			useShadows: true,
			saveLastScrollTimeOnClassName: 'monaco-list-row'
		});

		this.gesture = new Gesture(this.wrapper);
		this.rowsContainer = document.createElement('div');
		this.rowsContainer.className = 'monaco-list-rows';

		this.wrapper.appendChild(this.rowsContainer);
		this.domNode.appendChild(this.scrollableElement.getDomNode());
		container.appendChild(this.domNode);

		this.layout();
	}

	splice(start: number, deleteCount: number, ...elements: T[]): void {
		const before = this.getRenderedItemRanges();
		const inserted = elements.map<IItem<T>>(element => ({
			id: String(this.itemId++),
			element,
			size: this.delegate.getHeight(element),
			templateId: this.delegate.getTemplateId(element),
			row: null
		}));

		this.rangeMap.splice(start, deleteCount, ...inserted);
		this.items.splice(start, deleteCount, ...inserted);

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
	}

	get length(): number {
		return this.items.length;
	}

	layout(height?: number): void {
		this.setRenderHeight(height || DOM.getContentHeight(this.wrapper));
		this.setScrollTop(this.renderTop);
		this.scrollableElement.onElementDimensions();
		this.scrollableElement.onElementInternalDimensions();
	}

	// Render

	private setRenderHeight(viewHeight: number) {
		this.render(this.renderTop, viewHeight);
		this.renderHeight = viewHeight;
	}

	private render(renderTop: number, renderHeight: number): void {
		const renderBottom = renderTop + renderHeight;
		const thisRenderBottom = this.renderTop + this.renderHeight;
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
		this.renderHeight = renderBottom - renderTop;
	}

	private getRenderedItemRanges(): IItemRange<T>[] {
		const result: IItemRange<T>[] = [];
		const renderBottom = this.renderTop + this.renderHeight;

		let start = this.renderTop;
		let index = this.rangeMap.indexAt(start);
		let item = this.items[index];
		let end = -1;

		while (item && start < renderBottom) {
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
		item.row.domNode.style.top = `${ this.rangeMap.positionAt(index) }px`;
		item.row.domNode.style.height = `${ item.size }px`;
		renderer.renderElement(item.element, item.row.templateData);
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
		scrollTop = Math.min(scrollTop, this.getScrollHeight() - this.renderHeight);
		scrollTop = Math.max(scrollTop, 0);

		this.render(scrollTop, this.renderHeight);
		this.renderTop = scrollTop;

		this.onScroll.fire({ vertical: true, horizontal: false });
	}

	addScrollListener(callback: ()=>void): IDisposable {
		return this.onScroll.event(callback);
	}

	dispose() {
		this.items = null;

		if (this.domNode && this.domNode.parentElement) {
			this.domNode.parentNode.removeChild(this.domNode);
			this.domNode = null;
		}

		this.rangeMap = dispose(this.rangeMap);
		this.gesture = dispose(this.gesture);
		this.scrollableElement = dispose(this.scrollableElement);
		this.onScroll = dispose(this.onScroll);
	}
}
