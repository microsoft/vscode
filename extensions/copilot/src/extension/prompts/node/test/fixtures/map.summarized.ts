
class ResourceMapEntry<T> {
	constructor(readonly uri: URI, readonly value: T) { }
}

export class ResourceMap<T> implements Map<URI, T> {

	constructor(mapOrKeyFn?: ResourceMap<T> | ResourceMapKeyFn, toKey?: ResourceMapKeyFn) {…}
}

export class ResourceSet implements Set<URI> {
	constructor(entriesOrKey?: readonly URI[] | ResourceMapKeyFn, toKey?: ResourceMapKeyFn) {…}

	forEach(callbackfn: (value: URI, value2: URI, set: Set<URI>) => void, thisArg?: any): void {…}

	has(value: URI): boolean {…}

	entries(): IterableIterator<[URI, URI]> {…}

	keys(): IterableIterator<URI> {…}

	values(): IterableIterator<URI> {…}

	[Symbol.iterator](): IterableIterator<URI> {…}
}


interface Item<K, V> {
	previous: Item<K, V> | undefined;
	next: Item<K, V> | undefined;
	key: K;
	value: V;
}

export const enum Touch {
	None = 0,
	AsOld = 1,
	AsNew = 2
}

export class LinkedMap<K, V> implements Map<K, V> {

	readonly [Symbol.toStringTag] = 'LinkedMap';

	private _map: Map<K, Item<K, V>>;
	private _head: Item<K, V> | undefined;
	private _tail: Item<K, V> | undefined;
	private _size: number;

	private _state: number;

	constructor() {…}

	clear(): void {…}

	isEmpty(): boolean {…}

	get size(): number {…}

	get first(): V | undefined {…}

	get last(): V | undefined {…}

	has(key: K): boolean {…}

	get(key: K, touch: Touch = Touch.None): V | undefined {
		return item.value;
	}

	set(key: K, value: V, touch: Touch = Touch.None): this {
		let item = this._map.get(key);
		if (item) {…} else {…}
		return this;
	}

	delete(key: K): boolean {
		return !!this.remove(key);
	}

	remove(key: K): V | undefined {
		const item = this._map.get(key);
		if (!item) {…}
		this._map.delete(key);
		this.removeItem(item);
		this._size--;
		return item.value;
	}

	shift(): V | undefined {
		if (!this._head && !this._tail) {…}
		if (!this._head || !this._tail) {…}
		const item = this._head;
		this._map.delete(item.key);
		this.removeItem(item);
		this._size--;
		return item.value;
	}

	forEach(callbackfn: (value: V, key: K, map: LinkedMap<K, V>) => void, thisArg?: any): void {
		const state = this._state;
		let current = this._head;
		while (current) {
			if (thisArg) {…} else {…}
			if (this._state !== state) {…}
			current = current.next;
		}
	}

	keys(): IterableIterator<K> {
		const map = this;
		const state = this._state;
		let current = this._head;
		const iterator: IterableIterator<K> = {
			[Symbol.iterator]() {…},
			next(): IteratorResult<K> {…}
		};
		return iterator;
	}

	values(): IterableIterator<V> {
		const map = this;
		const state = this._state;
		let current = this._head;
		const iterator: IterableIterator<V> = {
			[Symbol.iterator]() {…},
			next(): IteratorResult<V> {…}
		};
		return iterator;
	}

	entries(): IterableIterator<[K, V]> {
		const map = this;
		const state = this._state;
		let current = this._head;
		const iterator: IterableIterator<[K, V]> = {
			[Symbol.iterator]() {…},
			next(): IteratorResult<[K, V]> {
				if (current) {…} else {…}
			}
		};
		return iterator;
	}

	[Symbol.iterator](): IterableIterator<[K, V]> {
		return this.entries();
	}

	protected trimOld(newSize: number) {
		if (newSize >= this.size) {
			return;
		}
		if (newSize === 0) {
			this.clear();
			return;
		}
		let current = this._head;
		let currentSize = this.size;
		while (current && currentSize > newSize) {
			this._map.delete(current.key);
			current = current.next;
			currentSize--;
		}
		this._head = current;
		this._size = currentSize;
		if (current) {
			current.previous = undefined;
		}
		this._state++;
	}

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
		this._state++;
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
		this._state++;
	}

	private removeItem(item: Item<K, V>): void {
		if (item === this._head && item === this._tail) {
			this._head = undefined;
			this._tail = undefined;
		}
		else if (item === this._head) {
			// This can only happen if size === 1 which is handled
			// by the case above.
			if (!item.next) {
				throw new Error('Invalid list');
			}
			item.next.previous = undefined;
			this._head = item.next;
		}
		else if (item === this._tail) {
			// This can only happen if size === 1 which is handled
			// by the case above.
			if (!item.previous) {
				throw new Error('Invalid list');
			}
			item.previous.next = undefined;
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
		item.next = undefined;
		item.previous = undefined;
		this._state++;
	}

	private touch(item: Item<K, V>, touch: Touch): void {
		if (!this._head || !this._tail) {
			throw new Error('Invalid list');
		}
		if ((touch !== Touch.AsOld && touch !== Touch.AsNew)) {
			return;
		}

		if (touch === Touch.AsOld) {
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
			this._state++;
		} else if (touch === Touch.AsNew) {
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
			this._state++;
		}
	}

	toJSON(): [K, V][] {
		const data: [K, V][] = [];

		this.forEach((value, key) => {
			data.push([key, value]);
		});

		return data;
	}

	fromJSON(data: [K, V][]): void {
		this.clear();

		for (const [key, value] of data) {
			this.set(key, value);
		}
	}
}

export class LRUCache<K, V> extends LinkedMap<K, V> {

	private _limit: number;
	private _ratio: number;

	constructor(limit: number, ratio: number = 1) {
		super();
		this._limit = limit;
		this._ratio = Math.min(Math.max(0, ratio), 1);
	}

	get limit(): number {
		return this._limit;
	}

	set limit(limit: number) {
		this._limit = limit;
		this.checkTrim();
	}

	get ratio(): number {
		return this._ratio;
	}

	set ratio(ratio: number) {
		this._ratio = Math.min(Math.max(0, ratio), 1);
		this.checkTrim();
	}

	override get(key: K, touch: Touch = Touch.AsNew): V | undefined {
		return super.get(key, touch);
	}

	peek(key: K): V | undefined {
		return super.get(key, Touch.None);
	}

	override set(key: K, value: V): this {
		super.set(key, value, Touch.AsNew);
		this.checkTrim();
		return this;
	}

	private checkTrim() {
		if (this.size > this._limit) {
			this.trimOld(Math.round(this._limit * this._ratio));
		}
	}
}

export class CounterSet<T> {

	private map = new Map<T, number>();

	add(value: T): CounterSet<T> {
		this.map.set(value, (this.map.get(value) || 0) + 1);
		return this;
	}

	delete(value: T): boolean {
		let counter = this.map.get(value) || 0;

		if (counter === 0) {
			return false;
		}

		counter--;

		if (counter === 0) {
			this.map.delete(value);
		} else {
			this.map.set(value, counter);
		}

		return true;
	}

	has(value: T): boolean {
		return this.map.has(value);
	}
}

/**
 * A map that allows access both by keys and values.
 * **NOTE**: values need to be unique.
 */
export class BidirectionalMap<K, V> {

	private readonly _m1 = new Map<K, V>();
	private readonly _m2 = new Map<V, K>();

	constructor(entries?: readonly (readonly [K, V])[]) {
		if (entries) {
			for (const [key, value] of entries) {
				this.set(key, value);
			}
		}
	}

	clear(): void {
		this._m1.clear();
		this._m2.clear();
	}

	set(key: K, value: V): void {
		this._m1.set(key, value);
		this._m2.set(value, key);
	}

	get(key: K): V | undefined {
		return this._m1.get(key);
	}

	getKey(value: V): K | undefined {
		return this._m2.get(value);
	}

	delete(key: K): boolean {
		const value = this._m1.get(key);
		if (value === undefined) {
			return false;
		}
		this._m1.delete(key);
		this._m2.delete(value);
		return true;
	}

	forEach(callbackfn: (value: V, key: K, map: BidirectionalMap<K, V>) => void, thisArg?: any): void {
		this._m1.forEach((value, key) => {
			callbackfn.call(thisArg, value, key, this);
		});
	}

	keys(): IterableIterator<K> {
		return this._m1.keys();
	}

	values(): IterableIterator<V> {
		return this._m1.values();
	}
}
