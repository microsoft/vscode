/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getWindow, h, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { SmoothScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { compareBy, numberComparator } from '../../../../base/common/arrays.js';
import { findFirstMax } from '../../../../base/common/arraysFind.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, globalTransaction, IObservable, IReader, observableFromEvent } from '../../../../base/common/observable.js';
import { INewScrollPosition, IScrollPosition, Scrollable, ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { ObservableElementSizeObserver } from '../diffEditor/utils.js';
import { computeCompressedVirtualizedScrollLayout, ICompressedVirtualizedScrollLayout } from './compressedVirtualizedScrollLayout.js';

export interface ICompressedVirtualizedScrollItemVerticalState {
	/** Complete item height in outer scroll coordinates. */
	readonly contentHeight: number;
	/**
	 * Item-local scroll coordinates reported by the rendered item:
	 *
	 *     0 ---------------------------- maxScrollOffset
	 *     item begins                    item end is aligned
	 */
	readonly itemViewportOffset: number;
}

export interface ICompressedVirtualizedScrollItem {
	readonly verticalState: IObservable<ICompressedVirtualizedScrollItemVerticalState>;
	readonly maxScroll: IObservable<{ readonly maxScroll: number }>;
	render(renderedRange: OffsetRange, scrollOffset: number, width: number, renderedViewport: OffsetRange): void;
	hide(): void;
}

export interface ICompressedVirtualizedScrollViewContext {
	readonly contentDomNode: HTMLElement;
	readonly overflowWidgetsDomNode: HTMLElement;
	readonly scrollLeft: IObservable<number>;
}

/**
 * Virtualizes complete-height items into viewport-capped rows whose removed height is represented by item-local scrolling.
 */
export class CompressedVirtualizedScrollView<TItem extends ICompressedVirtualizedScrollItem> extends Disposable {
	private readonly _scrollableElements;
	private readonly _scrollable;
	private readonly _scrollableElement;
	private readonly _sizeObserver;
	private readonly _items;
	private readonly _itemViewportPositions = new Map<TItem, number>();
	private _anchorItem: TItem | undefined;

	readonly domNode: HTMLElement;
	readonly scrollTop: IObservable<number>;
	readonly scrollLeft: IObservable<number>;
	readonly layout: IObservable<ICompressedVirtualizedScrollLayout>;
	readonly scrollDimensions: IObservable<{ readonly width: number; readonly height: number; readonly scrollWidth: number; readonly scrollHeight: number }>;

	constructor(
		elementToObserve: HTMLElement,
		dimension: IObservable<Dimension | undefined>,
		itemGap: IObservable<number>,
		createItems: (context: ICompressedVirtualizedScrollViewContext) => IObservable<readonly TItem[]>,
	) {
		super();
		this._scrollableElements = h('div.scrollContent', [
			h('div@content', {
				style: {
					overflow: 'hidden',
					position: 'relative',
				}
			}),
			h('div.monaco-editor@overflowWidgetsDomNode'),
		]);
		this._scrollable = this._register(new Scrollable({
			forceIntegerValues: false,
			scheduleAtNextAnimationFrame: callback => scheduleAtNextAnimationFrame(getWindow(elementToObserve), callback),
			smoothScrollDuration: 100,
		}));
		this._scrollableElement = this._register(new SmoothScrollableElement(this._scrollableElements.root, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Auto,
			useShadows: false,
		}, this._scrollable));
		this.domNode = h('div', {}, [this._scrollableElement.getDomNode()]).root;
		this._sizeObserver = this._register(new ObservableElementSizeObserver(elementToObserve, undefined));
		this.scrollTop = observableFromEvent(this, this._scrollableElement.onScroll, () => /** @description scrollTop */ this._scrollableElement.getScrollPosition().scrollTop);
		this.scrollLeft = observableFromEvent(this, this._scrollableElement.onScroll, () => /** @description scrollLeft */ this._scrollableElement.getScrollPosition().scrollLeft);
		this._items = createItems({
			contentDomNode: this._scrollableElements.content,
			overflowWidgetsDomNode: this._scrollableElements.overflowWidgetsDomNode,
			scrollLeft: this.scrollLeft,
		});
		this.layout = derived(this, reader => computeCompressedVirtualizedScrollLayout({
			scrollTop: this.scrollTop.read(reader),
			viewportHeight: this._sizeObserver.height.read(reader),
			itemGap: itemGap.read(reader),
			itemHeights: this._items.read(reader).map(item => item.verticalState.read(reader).contentHeight),
		}));
		this.scrollDimensions = derived(this, reader => {
			const width = this._sizeObserver.width.read(reader);
			const items = this._items.read(reader);
			const max = findFirstMax(items, compareBy(item => item.maxScroll.read(reader).maxScroll, numberComparator));
			const maxScroll = max?.maxScroll.read(reader).maxScroll ?? 0;
			return {
				width,
				height: this._sizeObserver.height.read(reader),
				scrollWidth: width + maxScroll,
				scrollHeight: this.layout.read(reader).scrollHeight,
			};
		});

		this._register(autorun(reader => {
			this._sizeObserver.observe(dimension.read(reader));
		}));
		this._register(autorun(reader => {
			const dimensions = this.scrollDimensions.read(reader);
			this._scrollableElements.root.style.height = `${dimensions.height}px`;
			this._scrollableElements.content.style.height = `${dimensions.scrollHeight}px`;
			this._scrollableElement.setScrollDimensions(dimensions);
		}));
		this._register(autorun(reader => {
			globalTransaction(() => this._render(reader));
		}));
	}

	setScrollPosition(position: INewScrollPosition, smooth = false): void {
		this._scrollableElement.setScrollPosition({
			...position,
			reuseAnimation: smooth,
		});
	}

	getScrollPosition(): IScrollPosition {
		return this._scrollableElement.getScrollPosition();
	}

	private _deltaScrollVertical(delta: number): boolean {
		const scrollTop = this.getScrollPosition().scrollTop;
		this.setScrollPosition({ scrollTop: scrollTop + delta });
		return this.getScrollPosition().scrollTop !== scrollTop;
	}

	private _render(reader: IReader): void {
		const layout = this.layout.read(reader);
		const width = this._sizeObserver.width.read(reader);
		const items = this._items.read(reader);
		const verticalStates = items.map(item => item.verticalState.read(reader));
		const currentItems = new Set(items);
		for (const item of this._itemViewportPositions.keys()) {
			if (!currentItems.has(item)) {
				this._itemViewportPositions.delete(item);
			}
		}

		let anchorIndex = this._anchorItem ? items.indexOf(this._anchorItem) : -1;
		let itemViewportDelta = anchorIndex >= 0 ? this._getItemViewportDelta(items[anchorIndex], layout, verticalStates, anchorIndex) : 0;
		if (itemViewportDelta === 0) {
			anchorIndex = layout.items.findIndex((itemLayout, index) =>
				itemLayout.visibility === 'visible'
				&& items[index] !== this._anchorItem
				&& this._getItemViewportDelta(items[index], layout, verticalStates, index) !== 0
			);
			if (anchorIndex >= 0) {
				itemViewportDelta = this._getItemViewportDelta(items[anchorIndex], layout, verticalStates, anchorIndex);
			}
		}
		for (let index = 0; index < items.length; index++) {
			this._itemViewportPositions.set(items[index], layout.items[index].contentRange.start + verticalStates[index].itemViewportOffset);
		}
		if (itemViewportDelta !== 0) {
			if (anchorIndex >= 0) {
				this._anchorItem = items[anchorIndex];
			}
			if (this._deltaScrollVertical(itemViewportDelta)) {
				return;
			}
		}

		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			const itemLayout = layout.items[index];
			if (itemLayout.visibility !== 'visible') {
				item.hide();
			} else {
				item.render(itemLayout.renderedRange, itemLayout.scrollOffset, width, layout.renderedViewport);
			}
			this._itemViewportPositions.set(item, itemLayout.contentRange.start + item.verticalState.get().itemViewportOffset);
		}
		const currentAnchorIndex = this._anchorItem ? items.indexOf(this._anchorItem) : -1;
		if (currentAnchorIndex < 0 || layout.items[currentAnchorIndex].visibility !== 'visible') {
			const firstVisibleItemIndex = layout.items.findIndex(itemLayout => itemLayout.visibility === 'visible');
			this._anchorItem = firstVisibleItemIndex >= 0 ? items[firstVisibleItemIndex] : undefined;
		}

		this._scrollableElements.content.style.transform = `translateY(${-layout.renderedViewport.start}px)`;
	}

	private _getItemViewportDelta(
		item: TItem,
		layout: ICompressedVirtualizedScrollLayout,
		verticalStates: readonly ICompressedVirtualizedScrollItemVerticalState[],
		index: number,
	): number {
		const previousPosition = this._itemViewportPositions.get(item);
		if (previousPosition === undefined) {
			return 0;
		}
		const position = layout.items[index].contentRange.start + verticalStates[index].itemViewportOffset;
		return position - previousPosition;
	}
}
