/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface Item<K, V> {
	previous: Item<K, V> | undefined;
	next: Item<K, V> | undefined;
	key: K;
	value: V;
}

export namespace Touch {
	export const None: 0 = 0;
	export const First: 1 = 1;
	export const Last: 2 = 2;
}

export type Touch = 0 | 1 | 2;

export class LinkedMap<K, V> {

	private _map: Map<K, Item<K, V>>;
	private _head: Item<K, V> | undefined;
	private _tail: Item<K, V> | undefined;
	private _size: number;

	constructor() {
		this._map = new Map<K, Item<K, V>>();
		this._head = undefined;
		this._tail = undefined;
		this._size = 0;
	}

	public clear(): void {
		this._map.clear();
		this._head = undefined;
		this._tail = undefined;
		this._size = 0;
	}

	public isEmpty(): boolean {
		return !this._head && !this._tail;
	}

	public get size(): number {
		return this._size;
	}

	public has(key: K): boolean {
		return this._map.has(key);
	}

	public get(key: K): V | undefined {
		const item = this._map.get(key);
		if (!item) {
			return undefined;
		}
		return item.value;
	}

	public set(key: K, value: V, touch: Touch = Touch.None): void {
		let item = this._map.get(key);
		if (item) {
			item.value = value;
			if (touch !== Touch.None) {
				this.touch(item, touch);
			}
		} else {
			item = { key, value, next: undefined, previous: undefined };
			switch (touch) {
				case Touch.None:
					this.addItemLast(item);
					break;
				case Touch.First:
					this.addItemFirst(item);
					break;
				case Touch.Last:
					this.addItemLast(item);
					break;
				default:
					this.addItemLast(item);
					break;
			}
			this._map.set(key, item);
			this._size++;
		}
	}

	public delete(key: K): boolean {
		const item = this._map.get(key);
		if (!item) {
			return false;
		}
		this._map.delete(key);
		this.removeItem(item);
		this._size--;
		return true;
	}

	public shift(): V | undefined {
		if (!this._head && !this._tail) {
			return undefined;
		}
		if (!this._head || !this._tail) {
			throw new Error('Invalid list');
		}
		const item = this._head;
		this._map.delete(item.key);
		this.removeItem(item);
		this._size--;
		return item.value;
	}

	public forEach(callbackfn: (value: V, key: K, map: LinkedMap<K, V>) => void, thisArg?: any): void {
		let current = this._head;
		while (current) {
			if (thisArg) {
				callbackfn.bind(thisArg)(current.value, current.key, this);
			} else {
				callbackfn(current.value, current.key, this);
			}
			current = current.next;
		}
	}

	public forEachReverse(callbackfn: (value: V, key: K, map: LinkedMap<K, V>) => void, thisArg?: any): void {
		let current = this._tail;
		while (current) {
			if (thisArg) {
				callbackfn.bind(thisArg)(current.value, current.key, this);
			} else {
				callbackfn(current.value, current.key, this);
			}
			current = current.previous;
		}
	}

	public values(): V[] {
		let result: V[] = [];
		let current = this._head;
		while (current) {
			result.push(current.value);
			current = current.next;
		}
		return result;
	}

	public keys(): K[] {
		let result: K[] = [];
		let current = this._head;
		while (current) {
			result.push(current.key);
			current = current.next;
		}
		return result;
	}

	/* VS Code / Monaco editor runs on es5 which has no Symbol.iterator
	public keys(): IterableIterator<K> {
		let current = this._head;
		let iterator: IterableIterator<K> = {
			[Symbol.iterator]() {
				return iterator;
			},
			next():IteratorResult<K> {
				if (current) {
					let result = { value: current.key, done: false };
					current = current.next;
					return result;
				} else {
					return { value: undefined, done: true };
				}
			}
		};
		return iterator;
	}

	public values(): IterableIterator<V> {
		let current = this._head;
		let iterator: IterableIterator<V> = {
			[Symbol.iterator]() {
				return iterator;
			},
			next():IteratorResult<V> {
				if (current) {
					let result = { value: current.value, done: false };
					current = current.next;
					return result;
				} else {
					return { value: undefined, done: true };
				}
			}
		};
		return iterator;
	}
	*/

	private addItemFirst(item: Item<K, V>): void {
		// First time Insert
		if (!this._head && !this._tail) {
			this._tail = item;
		} else if (!this._head) {
			throw new Error('Invalid list');
		} else {
			item.next = this._head;
			this._head.previous = item;
		}
		this._head = item;
	}

	private addItemLast(item: Item<K, V>): void {
		// First time Insert
		if (!this._head && !this._tail) {
			this._head = item;
		} else if (!this._tail) {
			throw new Error('Invalid list');
		} else {
			item.previous = this._tail;
			this._tail.next = item;
		}
		this._tail = item;
	}

	private removeItem(item: Item<K, V>): void {
		if (item === this._head && item === this._tail) {
			this._head = undefined;
			this._tail = undefined;
		}
		else if (item === this._head) {
			this._head = item.next;
		}
		else if (item === this._tail) {
			this._tail = item.previous;
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

	private touch(item: Item<K, V>, touch: Touch): void {
		if (!this._head || !this._tail) {
			throw new Error('Invalid list');
		}
		if ((touch !== Touch.First && touch !== Touch.Last)) {
			return;
		}

		if (touch === Touch.First) {
			if (item === this._head) {
				return;
			}

			const next = item.next;
			const previous = item.previous;

			// Unlink the item
			if (item === this._tail) {
				// previous must be defined since item was not head but is tail
				// So there are more than on item in the map
				previous!.next = undefined;
				this._tail = previous;
			}
			else {
				// Both next and previous are not undefined since item was neither head nor tail.
				next!.previous = previous;
				previous!.next = next;
			}

			// Insert the node at head
			item.previous = undefined;
			item.next = this._head;
			this._head.previous = item;
			this._head = item;
		} else if (touch === Touch.Last) {
			if (item === this._tail) {
				return;
			}

			const next = item.next;
			const previous = item.previous;

			// Unlink the item.
			if (item === this._head) {
				// next must be defined since item was not tail but is head
				// So there are more than on item in the map
				next!.previous = undefined;
				this._head = next;
			} else {
				// Both next and previous are not undefined since item was neither head nor tail.
				next!.previous = previous;
				previous!.next = next;
			}
			item.next = undefined;
			item.previous = this._tail;
			this._tail.next = item;
			this._tail = item;
		}
	}
}