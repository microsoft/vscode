/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INextIterator, ArrayIterator } from 'vs/base/common/iterator';
import { Item } from './treeModel';

export interface IViewItem {
	model: Item;
	top: number;
	height: number;
	width: number;
}

export class HeightMap {

	private heightMap: IViewItem[] = [];
	private indexes: { [item: string]: number; } = {};

	getContentHeight(): number {
		let last = this.heightMap[this.heightMap.length - 1];
		return !last ? 0 : last.top + last.height;
	}

	onInsertItems(iterator: INextIterator<Item>, afterItemId: string | null = null): number | undefined {
		let item: Item | null = null;
		let viewItem: IViewItem;
		let i: number, j: number;
		let totalSize: number;
		let sizeDiff = 0;

		if (afterItemId === null) {
			i = 0;
			totalSize = 0;
		} else {
			i = this.indexes[afterItemId] + 1;
			viewItem = this.heightMap[i - 1];

			if (!viewItem) {
				console.error('view item doesnt exist');
				return undefined;
			}

			totalSize = viewItem.top + viewItem.height;
		}

		let boundSplice = this.heightMap.splice.bind(this.heightMap, i, 0);

		let itemsToInsert: IViewItem[] = [];

		while (item = iterator.next()) {
			viewItem = this.createViewItem(item);
			viewItem.top = totalSize + sizeDiff;

			this.indexes[item.id] = i++;
			itemsToInsert.push(viewItem);
			sizeDiff += viewItem.height;
		}

		boundSplice.apply(this.heightMap, itemsToInsert);

		for (j = i; j < this.heightMap.length; j++) {
			viewItem = this.heightMap[j];
			viewItem.top += sizeDiff;
			this.indexes[viewItem.model.id] = j;
		}

		for (j = itemsToInsert.length - 1; j >= 0; j--) {
			this.onInsertItem(itemsToInsert[j]);
		}

		for (j = this.heightMap.length - 1; j >= i; j--) {
			this.onRefreshItem(this.heightMap[j]);
		}

		return sizeDiff;
	}

	onInsertItem(item: IViewItem): void {
		// noop
	}

	// Contiguous items
	onRemoveItems(iterator: INextIterator<string>): void {
		let itemId: string | null = null;
		let viewItem: IViewItem;
		let startIndex: number | null = null;
		let i = 0;
		let sizeDiff = 0;

		while (itemId = iterator.next()) {
			i = this.indexes[itemId];
			viewItem = this.heightMap[i];

			if (!viewItem) {
				console.error('view item doesnt exist');
				return;
			}

			sizeDiff -= viewItem.height;
			delete this.indexes[itemId];
			this.onRemoveItem(viewItem);

			if (startIndex === null) {
				startIndex = i;
			}
		}

		if (sizeDiff === 0 || startIndex === null) {
			return;
		}

		this.heightMap.splice(startIndex, i - startIndex + 1);

		for (i = startIndex; i < this.heightMap.length; i++) {
			viewItem = this.heightMap[i];
			viewItem.top += sizeDiff;
			this.indexes[viewItem.model.id] = i;
			this.onRefreshItem(viewItem);
		}
	}

	onRemoveItem(item: IViewItem): void {
		// noop
	}

	onRefreshItemSet(items: Item[]): void {
		let sortedItems = items.sort((a, b) => this.indexes[a.id] - this.indexes[b.id]);
		this.onRefreshItems(new ArrayIterator(sortedItems));
	}

	// Ordered, but not necessarily contiguous items
	onRefreshItems(iterator: INextIterator<Item>): void {
		let item: Item | null = null;
		let viewItem: IViewItem;
		let newHeight: number;
		let i: number, j: number | null = null;
		let cummDiff = 0;

		while (item = iterator.next()) {
			i = this.indexes[item.id];

			for (; cummDiff !== 0 && j !== null && j < i; j++) {
				viewItem = this.heightMap[j];
				viewItem.top += cummDiff;
				this.onRefreshItem(viewItem);
			}

			viewItem = this.heightMap[i];
			newHeight = item.getHeight();
			viewItem.top += cummDiff;
			cummDiff += newHeight - viewItem.height;
			viewItem.height = newHeight;
			this.onRefreshItem(viewItem, true);

			j = i + 1;
		}

		if (cummDiff !== 0 && j !== null) {
			for (; j < this.heightMap.length; j++) {
				viewItem = this.heightMap[j];
				viewItem.top += cummDiff;
				this.onRefreshItem(viewItem);
			}
		}
	}

	onRefreshItem(item: IViewItem, needsRender: boolean = false): void {
		// noop
	}

	itemsCount(): number {
		return this.heightMap.length;
	}

	itemAt(position: number): string {
		return this.heightMap[this.indexAt(position)].model.id;
	}

	withItemsInRange(start: number, end: number, fn: (item: string) => void): void {
		start = this.indexAt(start);
		end = this.indexAt(end);
		for (let i = start; i <= end; i++) {
			fn(this.heightMap[i].model.id);
		}
	}

	indexAt(position: number): number {
		let left = 0;
		let right = this.heightMap.length;
		let center: number;
		let item: IViewItem;

		// Binary search
		while (left < right) {
			center = Math.floor((left + right) / 2);
			item = this.heightMap[center];

			if (position < item.top) {
				right = center;
			} else if (position >= item.top + item.height) {
				if (left === center) {
					break;
				}
				left = center;
			} else {
				return center;
			}
		}

		return this.heightMap.length;
	}

	indexAfter(position: number): number {
		return Math.min(this.indexAt(position) + 1, this.heightMap.length);
	}

	itemAtIndex(index: number): IViewItem {
		return this.heightMap[index];
	}

	itemAfter(item: IViewItem): IViewItem {
		return this.heightMap[this.indexes[item.model.id] + 1] || null;
	}

	protected createViewItem(item: Item): IViewItem {
		throw new Error('not implemented');
	}

	dispose(): void {
		this.heightMap = [];
		this.indexes = {};
	}
}
