/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from '../../../../../base/common/range.js';
import { ListView } from '../../../../../base/browser/ui/list/listView.js';
import { IItem, IRangeMap } from '../../../../../base/browser/ui/list/rangeMap.js';
import { ConstantTimePrefixSumComputer } from '../../../../../editor/common/model/prefixSumComputer.js';

export interface IWhitespace {
	id: string;
	/**
	 * To insert whitespace before the first item, use afterPosition 0.
	 * In other cases, afterPosition is 1-based.
	 */
	afterPosition: number;
	size: number;
	priority: number;
}
export class NotebookCellsLayout implements IRangeMap {
	private _items: IItem[] = [];
	private _whitespace: IWhitespace[] = [];
	protected _prefixSumComputer: ConstantTimePrefixSumComputer = new ConstantTimePrefixSumComputer([]);
	private _size = 0;
	private _paddingTop = 0;

	get paddingTop() {
		return this._paddingTop;
	}

	set paddingTop(paddingTop: number) {
		this._size = this._size + paddingTop - this._paddingTop;
		this._paddingTop = paddingTop;
	}

	get count(): number {
		return this._items.length;
	}

	/**
	 * Returns the sum of the sizes of all items in the range map.
	 */
	get size(): number {
		return this._size;
	}

	constructor(topPadding?: number) {
		this._paddingTop = topPadding ?? 0;
		this._size = this._paddingTop;
	}

	getWhitespaces(): IWhitespace[] {
		return this._whitespace;
	}

	restoreWhitespace(items: IWhitespace[]) {
		this._whitespace = items;
		this._size = this._paddingTop + this._items.reduce((total, item) => total + item.size, 0) + this._whitespace.reduce((total, ws) => total + ws.size, 0);
	}

	/**
	 */
	splice(index: number, deleteCount: number, items?: IItem[] | undefined): void {
		const inserts = items ?? [];
		// Perform the splice operation on the items array.
		this._items.splice(index, deleteCount, ...inserts);

		this._size = this._paddingTop + this._items.reduce((total, item) => total + item.size, 0) + this._whitespace.reduce((total, ws) => total + ws.size, 0);
		this._prefixSumComputer.removeValues(index, deleteCount);

		// inserts should also include whitespaces
		const newSizes = [];
		for (let i = 0; i < inserts.length; i++) {
			const insertIndex = i + index;
			const existingWhitespaces = this._whitespace.filter(ws => ws.afterPosition === insertIndex + 1);


			if (existingWhitespaces.length > 0) {
				newSizes.push(inserts[i].size + existingWhitespaces.reduce((acc, ws) => acc + ws.size, 0));
			} else {
				newSizes.push(inserts[i].size);
			}
		}
		this._prefixSumComputer.insertValues(index, newSizes);

		// Now that the items array has been updated, and the whitespaces are updated elsewhere, if an item is removed/inserted, the accumlated size of the items are all updated.
		// Loop through all items from the index where the splice started, to the end
		for (let i = index; i < this._items.length; i++) {
			const existingWhitespaces = this._whitespace.filter(ws => ws.afterPosition === i + 1);
			if (existingWhitespaces.length > 0) {
				this._prefixSumComputer.setValue(i, this._items[i].size + existingWhitespaces.reduce((acc, ws) => acc + ws.size, 0));
			} else {
				this._prefixSumComputer.setValue(i, this._items[i].size);
			}
		}
	}

	insertWhitespace(id: string, afterPosition: number, size: number): void {
		let priority = 0;
		const existingWhitespaces = this._whitespace.filter(ws => ws.afterPosition === afterPosition);
		if (existingWhitespaces.length > 0) {
			priority = Math.max(...existingWhitespaces.map(ws => ws.priority)) + 1;
		}

		this._whitespace.push({ id, afterPosition: afterPosition, size, priority });
		this._size += size; // Update the total size to include the whitespace
		this._whitespace.sort((a, b) => {
			if (a.afterPosition === b.afterPosition) {
				return a.priority - b.priority;
			}
			return a.afterPosition - b.afterPosition;
		});

		// find item size of index
		if (afterPosition > 0) {
			const index = afterPosition - 1;
			const itemSize = this._items[index].size;
			const accSize = itemSize + size;
			this._prefixSumComputer.setValue(index, accSize);
		}
	}

	changeOneWhitespace(id: string, afterPosition: number, size: number): void {
		const whitespaceIndex = this._whitespace.findIndex(ws => ws.id === id);
		if (whitespaceIndex !== -1) {
			const whitespace = this._whitespace[whitespaceIndex];
			const oldAfterPosition = whitespace.afterPosition;
			whitespace.afterPosition = afterPosition;
			const oldSize = whitespace.size;
			const delta = size - oldSize;
			whitespace.size = size;
			this._size += delta;

			if (oldAfterPosition > 0 && oldAfterPosition <= this._items.length) {
				const index = oldAfterPosition - 1;
				const itemSize = this._items[index].size;
				const accSize = itemSize;
				this._prefixSumComputer.setValue(index, accSize);
			}

			if (afterPosition > 0 && afterPosition <= this._items.length) {
				const index = afterPosition - 1;
				const itemSize = this._items[index].size;
				const accSize = itemSize + size;
				this._prefixSumComputer.setValue(index, accSize);
			}
		}
	}

	removeWhitespace(id: string): void {
		const whitespaceIndex = this._whitespace.findIndex(ws => ws.id === id);
		if (whitespaceIndex !== -1) {
			const whitespace = this._whitespace[whitespaceIndex];
			this._whitespace.splice(whitespaceIndex, 1);
			this._size -= whitespace.size; // Reduce the total size by the size of the removed whitespace

			if (whitespace.afterPosition > 0) {
				const index = whitespace.afterPosition - 1;
				const itemSize = this._items[index].size;
				const remainingWhitespaces = this._whitespace.filter(ws => ws.afterPosition === whitespace.afterPosition);
				const accSize = itemSize + remainingWhitespaces.reduce((acc, ws) => acc + ws.size, 0);
				this._prefixSumComputer.setValue(index, accSize);
			}
		}
	}

	/**
	 * find position of whitespace
	 * @param id: id of the whitespace
	 * @returns: position in the list view
	 */
	getWhitespacePosition(id: string): number {
		const whitespace = this._whitespace.find(ws => ws.id === id);
		if (!whitespace) {
			throw new Error('Whitespace not found');
		}

		const afterPosition = whitespace.afterPosition;
		if (afterPosition === 0) {
			// find all whitespaces at the same position but with higher priority (smaller number)
			const whitespaces = this._whitespace.filter(ws => ws.afterPosition === afterPosition && ws.priority < whitespace.priority);
			return whitespaces.reduce((acc, ws) => acc + ws.size, 0) + this.paddingTop;
		}

		const whitespaceBeforeFirstItem = this._whitespace.filter(ws => ws.afterPosition === 0).reduce((acc, ws) => acc + ws.size, 0);

		// previous item index
		const index = afterPosition - 1;
		const previousItemPosition = this._prefixSumComputer.getPrefixSum(index);
		const previousItemSize = this._items[index].size;
		const previousWhitespace = this._whitespace.filter(ws => (ws.afterPosition <= afterPosition - 1 && ws.afterPosition > 0));
		const whitespaceBefore = previousWhitespace.reduce((acc, ws) => acc + ws.size, 0);
		return previousItemPosition + previousItemSize + whitespaceBeforeFirstItem + this.paddingTop + whitespaceBefore;
	}

	indexAt(position: number): number {
		if (position < 0) {
			return -1;
		}

		const whitespaceBeforeFirstItem = this._whitespace.filter(ws => ws.afterPosition === 0).reduce((acc, ws) => acc + ws.size, 0);

		const offset = position - (this._paddingTop + whitespaceBeforeFirstItem);
		if (offset <= 0) {
			return 0;
		}

		if (offset >= (this._size - this._paddingTop - whitespaceBeforeFirstItem)) {
			return this.count;
		}

		return this._prefixSumComputer.getIndexOf(Math.trunc(offset)).index;
	}

	indexAfter(position: number): number {
		const index = this.indexAt(position);
		return Math.min(index + 1, this._items.length);
	}

	positionAt(index: number): number {
		if (index < 0) {
			return -1;
		}

		if (this.count === 0) {
			return -1;
		}

		// index is zero based, if index+1 > this.count, then it points to the fictitious element after the last element of this array.
		if (index >= this.count) {
			return -1;
		}

		const whitespaceBeforeFirstItem = this._whitespace.filter(ws => ws.afterPosition === 0).reduce((acc, ws) => acc + ws.size, 0);
		return this._prefixSumComputer.getPrefixSum(index/** count */) + this._paddingTop + whitespaceBeforeFirstItem;
	}
}

export class NotebookCellListView<T> extends ListView<T> {
	private _lastWhitespaceId: number = 0;
	private _renderingStack = 0;

	get inRenderingTransaction(): boolean {
		return this._renderingStack > 0;
	}

	get notebookRangeMap(): NotebookCellsLayout {
		return this.rangeMap as NotebookCellsLayout;
	}

	protected override render(previousRenderRange: IRange, renderTop: number, renderHeight: number, renderLeft: number | undefined, scrollWidth: number | undefined, updateItemsInDOM?: boolean): void {
		this._renderingStack++;
		super.render(previousRenderRange, renderTop, renderHeight, renderLeft, scrollWidth, updateItemsInDOM);
		this._renderingStack--;
	}

	protected override _rerender(renderTop: number, renderHeight: number, inSmoothScrolling?: boolean | undefined): void {
		this._renderingStack++;
		super._rerender(renderTop, renderHeight, inSmoothScrolling);
		this._renderingStack--;
	}

	protected override createRangeMap(paddingTop: number): IRangeMap {
		const existingMap = this.rangeMap as NotebookCellsLayout | undefined;
		if (existingMap) {
			const layout = new NotebookCellsLayout(paddingTop);
			layout.restoreWhitespace(existingMap.getWhitespaces());
			return layout;
		} else {
			return new NotebookCellsLayout(paddingTop);
		}

	}

	insertWhitespace(afterPosition: number, size: number): string {
		const scrollTop = this.scrollTop;
		const id = `${++this._lastWhitespaceId}`;
		const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		const elementPosition = this.elementTop(afterPosition);
		const aboveScrollTop = scrollTop > elementPosition;
		this.notebookRangeMap.insertWhitespace(id, afterPosition, size);

		const newScrolltop = aboveScrollTop ? scrollTop + size : scrollTop;
		this.render(previousRenderRange, newScrolltop, this.lastRenderHeight, undefined, undefined, false);
		this._rerender(newScrolltop, this.renderHeight, false);
		this.eventuallyUpdateScrollDimensions();

		return id;
	}

	changeOneWhitespace(id: string, newAfterPosition: number, newSize: number) {
		const scrollTop = this.scrollTop;
		const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		const currentPosition = this.notebookRangeMap.getWhitespacePosition(id);

		if (currentPosition > scrollTop) {
			this.notebookRangeMap.changeOneWhitespace(id, newAfterPosition, newSize);
			this.render(previousRenderRange, scrollTop, this.lastRenderHeight, undefined, undefined, false);
			this._rerender(scrollTop, this.renderHeight, false);
			this.eventuallyUpdateScrollDimensions();
		} else {
			this.notebookRangeMap.changeOneWhitespace(id, newAfterPosition, newSize);
			this.eventuallyUpdateScrollDimensions();
		}
	}

	removeWhitespace(id: string): void {
		const scrollTop = this.scrollTop;
		const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		const currentPosition = this.notebookRangeMap.getWhitespacePosition(id);

		if (currentPosition > scrollTop) {
			this.notebookRangeMap.removeWhitespace(id);
			this.render(previousRenderRange, scrollTop, this.lastRenderHeight, undefined, undefined, false);
			this._rerender(scrollTop, this.renderHeight, false);
			this.eventuallyUpdateScrollDimensions();
		} else {
			this.notebookRangeMap.removeWhitespace(id);
			this.eventuallyUpdateScrollDimensions();
		}

	}

	getWhitespacePosition(id: string): number {
		return this.notebookRangeMap.getWhitespacePosition(id);
	}
}
