/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getWindow, h, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { SmoothScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { compareBy, numberComparator } from '../../../../base/common/arrays.js';
import { findFirstMax } from '../../../../base/common/arraysFind.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, globalTransaction, IObservable, ITransaction, observableFromEvent, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { INewScrollPosition, IScrollPosition, Scrollable, ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { ObservableElementSizeObserver } from '../diffEditor/utils.js';
import { asLayoutRevision, computeCompressedVirtualizedScrollHeight, computeCompressedVirtualizedScrollLayout, computeItemRanges, createAnchoredSizeEditBatch, ICompressedVirtualizedScrollLayout, ILogicalPosition, ISizeEdit, LayoutRevision, mapLogicalPosition } from './compressedVirtualizedScrollLayout.js';

export interface ICompressedVirtualizedScrollItem {
	readonly size: IObservable<number>;
	readonly maxScroll: IObservable<{ readonly maxScroll: number }>;
	render(renderedRange: OffsetRange, scrollOffset: number, width: number, renderedViewport: OffsetRange, context: ICompressedVirtualizedScrollItemContext): void;
	hide(): void;
}

export interface ICompressedVirtualizedScrollViewContext {
	readonly contentDomNode: HTMLElement;
	readonly overflowWidgetsDomNode: HTMLElement;
	readonly scrollLeft: IObservable<number>;
}

export interface ICompressedVirtualizedScrollItemContext {
	runWithScrollAnchor(getItemOffset: () => number, update: (tx: ITransaction) => void): void;
}

export interface ICompressedVirtualizedGeometryEdit {
	readonly fromRevision: LayoutRevision;
	readonly toRevision: LayoutRevision;
	readonly edits: readonly ISizeEdit[];
	readonly anchorKind: 'viewportTop' | 'viewportBottom' | 'logical' | 'item';
	readonly anchorOffset: number;
	readonly mappedAnchorOffset: number;
	readonly anchorViewportOffset: number;
	readonly desiredScrollTop: number;
	readonly appliedScrollTop: number;
	readonly leadingScrollSlack: number;
	readonly trailingScrollSlack: number;
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
	private readonly _layout;
	private readonly _scrollDimensions;
	private readonly _lastGeometryEdit = observableValue<ICompressedVirtualizedGeometryEdit | undefined>(this, undefined);
	private readonly _itemAnchorEditSignal = observableSignal(this);
	private _revision = asLayoutRevision(0);
	private _leadingScrollSlack = 0;
	private _trailingScrollSlack = 0;
	private _previousItems: readonly TItem[] | undefined;
	private _previousItemHeights: readonly number[] | undefined;
	private _previousItemGap = 0;
	private _lastScrollTop = 0;
	private _isUpdating = false;
	private _pendingAnchor: {
		readonly position: ILogicalPosition;
		readonly viewportOffset: number;
		readonly item?: ICompressedVirtualizedScrollItem;
		readonly getItemOffset?: () => number;
	} | undefined;

	readonly domNode: HTMLElement;
	readonly scrollTop: IObservable<number>;
	readonly scrollLeft: IObservable<number>;
	readonly layout: IObservable<ICompressedVirtualizedScrollLayout>;
	readonly scrollDimensions: IObservable<{ readonly width: number; readonly height: number; readonly scrollWidth: number; readonly scrollHeight: number }>;
	readonly lastGeometryEdit: IObservable<ICompressedVirtualizedGeometryEdit | undefined> = this._lastGeometryEdit;

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
		this._layout = observableValue(this, computeCompressedVirtualizedScrollLayout({
			revision: this._revision,
			scrollTop: 0,
			viewportHeight: 0,
			itemGap: 0,
			itemHeights: [],
		}));
		this.layout = this._layout;
		this._scrollDimensions = observableValue(this, { width: 0, height: 0, scrollWidth: 0, scrollHeight: 0 });
		this.scrollDimensions = this._scrollDimensions;

		this._register(autorun(reader => {
			this._sizeObserver.observe(dimension.read(reader));
		}));
		this._register(autorun(reader => {
			this._itemAnchorEditSignal.read(reader);
			const width = this._sizeObserver.width.read(reader);
			const height = this._sizeObserver.height.read(reader);
			const items = this._items.read(reader);
			const itemHeights = items.map(item => item.size.read(reader));
			const max = findFirstMax(items, compareBy(item => item.maxScroll.read(reader).maxScroll, numberComparator));
			const maxScroll = max?.maxScroll.read(reader).maxScroll ?? 0;
			const gap = itemGap.read(reader);
			const requestedScrollTop = this.scrollTop.read(reader);
			globalTransaction(tx => this._update(items, itemHeights, gap, width, height, width + maxScroll, requestedScrollTop, tx));
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

	runWithScrollAnchor(anchor: ILogicalPosition, update: (tx: ITransaction) => void): void {
		if (anchor.revision !== this._revision) {
			throw new BugIndicatingError(`Cannot use layout revision ${anchor.revision} as an anchor for revision ${this._revision}`);
		}
		const logicalScrollHeight = this._layout.get().logicalScrollHeight;
		if (!Number.isFinite(anchor.offset) || anchor.offset < 0 || anchor.offset > logicalScrollHeight) {
			throw new BugIndicatingError(`Logical anchor ${anchor.offset} is outside layout revision ${this._revision}`);
		}
		const logicalViewportTop = this.getScrollPosition().scrollTop - this._leadingScrollSlack;
		this._runWithPendingAnchor({
			position: anchor,
			viewportOffset: anchor.offset - logicalViewportTop,
		}, update);
	}

	private _runWithItemScrollAnchor(item: ICompressedVirtualizedScrollItem, getItemOffset: () => number, update: (tx: ITransaction) => void): void {
		const items = this._items.get();
		const itemIndex = items.findIndex(candidate => candidate === item);
		if (itemIndex === -1) {
			throw new BugIndicatingError('Cannot anchor an item that is not in the compacted virtualized scroll view');
		}
		const itemRange = this._layout.get().items[itemIndex].contentRange;
		const itemOffset = getItemOffset();
		if (!Number.isFinite(itemOffset) || itemOffset < 0 || itemOffset > itemRange.length) {
			throw new BugIndicatingError(`Item anchor ${itemOffset} is outside item range ${itemRange}`);
		}
		const position = {
			revision: this._revision,
			offset: itemRange.start + itemOffset,
		};
		const logicalViewportTop = this.getScrollPosition().scrollTop - this._leadingScrollSlack;
		this._runWithPendingAnchor({
			position,
			viewportOffset: position.offset - logicalViewportTop,
			item,
			getItemOffset,
		}, tx => {
			update(tx);
			if (getItemOffset() !== itemOffset) {
				this._itemAnchorEditSignal.trigger(tx);
			}
		});
	}

	private _runWithPendingAnchor(pendingAnchor: NonNullable<typeof this._pendingAnchor>, update: (tx: ITransaction) => void): void {
		if (this._pendingAnchor) {
			throw new BugIndicatingError('Cannot nest compacted virtualized scroll anchors');
		}
		this._pendingAnchor = pendingAnchor;
		try {
			globalTransaction(update);
		} finally {
			if (this._pendingAnchor === pendingAnchor) {
				this._pendingAnchor = undefined;
			}
		}
	}

	private _update(
		items: readonly TItem[],
		itemHeights: readonly number[],
		itemGap: number,
		width: number,
		height: number,
		scrollWidth: number,
		requestedScrollTop: number,
		tx: ITransaction,
	): void {
		if (this._isUpdating) {
			return;
		}
		this._isUpdating = true;
		try {
			let targetScrollTop = requestedScrollTop;
			const scrollDelta = requestedScrollTop - this._lastScrollTop;
			const previousItemHeights = this._previousItemHeights;
			const geometryChanged = previousItemHeights !== undefined
				&& (itemGap !== this._previousItemGap || !arrayEquals(previousItemHeights, itemHeights));
			const hasStableItems = this._previousItems !== undefined
				&& this._previousItems.length === items.length
				&& this._previousItems.every((item, index) => item === items[index]);
			let didApplyAnchor = false;

			const appliesPendingAnchor = !!this._pendingAnchor && hasStableItems;
			if (previousItemHeights && (geometryChanged || appliesPendingAnchor) && hasStableItems) {
				const oldLogicalScrollHeight = computeCompressedVirtualizedScrollHeight(previousItemHeights, this._previousItemGap);
				const oldLogicalViewportTop = requestedScrollTop - this._leadingScrollSlack;
				const pendingAnchor = this._pendingAnchor;
				const futureScrollTop = this._scrollable.getFutureScrollPosition().scrollTop;
				const isActivelyScrollingUp = this._scrollable.hasPendingScrollAnimation() && futureScrollTop < requestedScrollTop;
				const defaultAnchorViewportOffset = isActivelyScrollingUp ? height : 0;
				const anchorKind = pendingAnchor?.item ? 'item' : pendingAnchor ? 'logical' : isActivelyScrollingUp ? 'viewportBottom' : 'viewportTop';
				const anchorOffset = pendingAnchor?.position.offset ?? Math.max(0, Math.min(oldLogicalViewportTop + defaultAnchorViewportOffset, oldLogicalScrollHeight));
				const anchorViewportOffset = pendingAnchor?.viewportOffset ?? anchorOffset - oldLogicalViewportTop;
				const fromRevision = this._revision;
				const toRevision = geometryChanged ? asLayoutRevision(fromRevision + 1) : fromRevision;
				const edit = createAnchoredSizeEditBatch(fromRevision, toRevision, previousItemHeights, itemHeights, this._previousItemGap, itemGap, anchorOffset);
				let mappedAnchor = mapLogicalPosition(edit.anchor, edit);
				if (pendingAnchor?.item && pendingAnchor.getItemOffset) {
					const itemIndex = items.findIndex(item => item === pendingAnchor.item);
					if (itemIndex === -1) {
						throw new BugIndicatingError('Compacted virtualized scroll anchor item was removed during its edit');
					}
					const itemRange = computeItemRanges(itemHeights, itemGap)[itemIndex];
					const itemOffset = pendingAnchor.getItemOffset();
					if (!Number.isFinite(itemOffset) || itemOffset < 0 || itemOffset > itemRange.length) {
						throw new BugIndicatingError(`Mapped item anchor ${itemOffset} is outside item range ${itemRange}`);
					}
					mappedAnchor = {
						revision: toRevision,
						offset: itemRange.start + itemOffset,
					};
				}
				const newLogicalScrollHeight = computeCompressedVirtualizedScrollHeight(itemHeights, itemGap);
				const desiredLogicalScrollTop = mappedAnchor.offset - anchorViewportOffset;
				const naturalMaxScrollTop = Math.max(0, newLogicalScrollHeight - height);

				this._leadingScrollSlack = Math.max(0, -desiredLogicalScrollTop);
				this._trailingScrollSlack = Math.max(0, desiredLogicalScrollTop - naturalMaxScrollTop);
				targetScrollTop = this._leadingScrollSlack + desiredLogicalScrollTop;
				this._revision = toRevision;
				this._pendingAnchor = undefined;
				didApplyAnchor = true;
				this._lastGeometryEdit.set({
					fromRevision,
					toRevision,
					edits: edit.edits,
					anchorKind,
					anchorOffset,
					mappedAnchorOffset: mappedAnchor.offset,
					anchorViewportOffset,
					desiredScrollTop: targetScrollTop,
					appliedScrollTop: targetScrollTop,
					leadingScrollSlack: this._leadingScrollSlack,
					trailingScrollSlack: this._trailingScrollSlack,
				}, tx);
			} else if (geometryChanged) {
				this._revision = asLayoutRevision(this._revision + 1);
				this._leadingScrollSlack = 0;
				this._trailingScrollSlack = 0;
				this._lastGeometryEdit.set(undefined, tx);
			} else {
				if (scrollDelta > 0 && this._leadingScrollSlack > 0) {
					const consumedSlack = Math.min(scrollDelta, this._leadingScrollSlack);
					this._leadingScrollSlack -= consumedSlack;
					targetScrollTop -= consumedSlack;
				} else if (scrollDelta < 0 && this._trailingScrollSlack > 0) {
					const logicalScrollHeight = computeCompressedVirtualizedScrollHeight(itemHeights, itemGap);
					const naturalMaxScrollTop = this._leadingScrollSlack + Math.max(0, logicalScrollHeight - height);
					this._trailingScrollSlack = Math.max(0, targetScrollTop - naturalMaxScrollTop);
				}
			}

			let layout = computeCompressedVirtualizedScrollLayout({
				revision: this._revision,
				scrollTop: targetScrollTop,
				viewportHeight: height,
				itemGap,
				itemHeights,
				leadingScrollSlack: this._leadingScrollSlack,
				trailingScrollSlack: this._trailingScrollSlack,
			});
			const dimensions = { width, height, scrollWidth, scrollHeight: layout.scrollHeight };
			this._scrollableElements.root.style.height = `${height}px`;
			this._scrollableElements.content.style.height = `${layout.scrollHeight}px`;
			this._scrollable.setScrollDimensions(dimensions, true);
			const needsImmediateScrollCorrection = geometryChanged || targetScrollTop !== requestedScrollTop;
			if (needsImmediateScrollCorrection) {
				this._scrollable.setScrollPositionNow({ scrollTop: layout.scrollTop });
			}
			const appliedScrollTop = this._scrollableElement.getScrollPosition().scrollTop;
			if (appliedScrollTop !== layout.scrollTop) {
				layout = computeCompressedVirtualizedScrollLayout({
					revision: this._revision,
					scrollTop: appliedScrollTop,
					viewportHeight: height,
					itemGap,
					itemHeights,
					leadingScrollSlack: this._leadingScrollSlack,
					trailingScrollSlack: this._trailingScrollSlack,
				});
			}
			const geometryEdit = this._lastGeometryEdit.get();
			if (didApplyAnchor && geometryEdit) {
				this._lastGeometryEdit.set({ ...geometryEdit, appliedScrollTop }, tx);
			}
			this._layout.set(layout, tx);
			this._scrollDimensions.set(dimensions, tx);
			this._render(items, layout, width);
			this._previousItems = items;
			this._previousItemHeights = itemHeights;
			this._previousItemGap = itemGap;
			this._lastScrollTop = layout.scrollTop;
		} finally {
			this._isUpdating = false;
		}
	}

	private _render(items: readonly TItem[], layout: ICompressedVirtualizedScrollLayout, width: number): void {
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			const itemLayout = layout.items[index];
			if (itemLayout.visibility !== 'visible') {
				item.hide();
			} else {
				item.render(itemLayout.renderedRange, itemLayout.scrollOffset, width, layout.renderedViewport, {
					runWithScrollAnchor: (getItemOffset, update) => this._runWithItemScrollAnchor(item, getItemOffset, update),
				});
			}
		}

		this._scrollableElements.content.style.transform = `translateY(${-layout.renderedViewport.start}px)`;
	}
}

function arrayEquals(a: readonly number[], b: readonly number[]): boolean {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}
