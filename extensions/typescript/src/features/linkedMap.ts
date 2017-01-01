/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface Item<T> {
	previous: Item<T> | undefined;
	next: Item<T> | undefined;
	key: string;
	value: T;
}

export default class LinkedMap<T> {

	private map: ObjectMap<Item<T>>;
	private head: Item<T> | undefined;
	private tail: Item<T> | undefined;
	private _length: number;

	constructor() {
		this.map = Object.create(null);
		this.head = undefined;
		this.tail = undefined;
		this._length = 0;
	}

	public isEmpty(): boolean {
		return !this.head && !this.tail;
	}

	public length(): number {
		return this._length;
	}

	public get(key: string): T | undefined {
		const item = this.map[key];
		if (!item) {
			return undefined;
		}
		return item.value;
	}

	public add(key: string, value: T, touch = false): void {
		let item = this.map[key];
		if (item) {
			item.value = value;
			if (touch) {
				this.touch(item);
			}
		}
		else {
			item = { key, value, next: undefined, previous: undefined };
			if (touch) {
				this.addItemFirst(item);
			}
			else {
				this.addItemLast(item);
			}
			this.map[key] = item;
			this._length++;
		}
	}

	public remove(key: string): T | undefined {
		const item = this.map[key];
		if (!item) {
			return undefined;
		}
		delete this.map[key];
		this.removeItem(item);
		this._length--;
		return item.value;
	}

	public shift(): T | undefined {
		if (!this.head && !this.tail) {
			return undefined;
		}
		if (!this.head || !this.tail) {
			throw new Error('Invalid list');
		}
		const item = this.head;
		delete this.map[item.key];
		this.removeItem(item);
		this._length--;
		return item.value;
	}

	private addItemFirst(item: Item<T>): void {
		// First time Insert
		if (!this.head && !this.tail) {
			this.tail = item;
		} else if (!this.head) {
			throw new Error('Invalid list');
		} else {
			item.next = this.head;
			this.head.previous = item;
		}
		this.head = item;
	}

	private addItemLast(item: Item<T>): void {
		// First time Insert
		if (!this.head && !this.tail) {
			this.head = item;
		} else if (!this.tail) {
			throw new Error('Invalid list');
		} else {
			item.previous = this.tail;
			this.tail.next = item;
		}
		this.tail = item;
	}

	private removeItem(item: Item<T>): void {
		if (item === this.head && item === this.tail) {
			this.head = undefined;
			this.tail = undefined;
		}
		else if (item === this.head) {
			this.head = item.next;
		}
		else if (item === this.tail) {
			this.tail = item.previous;
		}
		else {
			const next = item.next;
			const previous = item.previous;
			if (!next || !previous) {
				throw new Error('Invalid list');
			}
			next.previous = previous;
			previous.next = next;
		}
	}

	private touch(item: Item<T>): void {
		if (item === this.head) {
			return;
		}

		const next = item.next;
		const previous = item.previous;

		// Unlink the item
		if (item === this.tail) {
			this.tail = previous;
		}
		else {
			// Both next and previous are not null since item was neither head nor tail.
			if (next) {
				next.previous = previous;
			}
			if (previous) {
				previous.next = next;
			}
		}

		// Insert the node at head
		item.previous = undefined;
		item.next = this.head;
		if (!this.head) {
			throw new Error('Invalid list');
		}
		this.head.previous = item;
		this.head = item;
	}
}
