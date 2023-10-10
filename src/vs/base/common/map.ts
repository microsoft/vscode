/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';

export function getOrSet<K, V>(map: Map<K, V>, key: K, value: V): V {
	let result = map.get(key);
	if (result === undefined) {
		result = value;
		map.set(key, result);
	}

	return result;
}

export function mapToString<K, V>(map: Map<K, V>): string {
	const entries: string[] = [];
	map.forEach((value, key) => {
		entries.push(`${key} => ${value}`);
	});

	return `Map(${map.size}) {${entries.join(', ')}}`;
}

export function setToString<K>(set: Set<K>): string {
	const entries: K[] = [];
	set.forEach(value => {
		entries.push(value);
	});

	return `Set(${set.size}) {${entries.join(', ')}}`;
}

interface ResourceMapKeyFn {
	(resource: URI): string;
}

class ResourceMapEntry<T> {
	constructor(readonly uri: URI, readonly value: T) { }
}

function isEntries<T>(arg: ResourceMap<T> | ResourceMapKeyFn | readonly (readonly [URI, T])[] | undefined): arg is readonly (readonly [URI, T])[] {
	return Array.isArray(arg);
}

export class ResourceMap<T> implements Map<URI, T> {

	private static readonly defaultToKey = (resource: URI) => resource.toString();

	readonly [Symbol.toStringTag] = 'ResourceMap';

	private readonly map: Map<string, ResourceMapEntry<T>>;
	private readonly toKey: ResourceMapKeyFn;

	/**
	 *
	 * @param toKey Custom uri identity function, e.g use an existing `IExtUri#getComparison`-util
	 */
	constructor(toKey?: ResourceMapKeyFn);

	/**
	 *
	 * @param other Another resource which this maps is created from
	 * @param toKey Custom uri identity function, e.g use an existing `IExtUri#getComparison`-util
	 */
	constructor(other?: ResourceMap<T>, toKey?: ResourceMapKeyFn);

	/**
	 *
	 * @param other Another resource which this maps is created from
	 * @param toKey Custom uri identity function, e.g use an existing `IExtUri#getComparison`-util
	 */
	constructor(entries?: readonly (readonly [URI, T])[], toKey?: ResourceMapKeyFn);

	constructor(arg?: ResourceMap<T> | ResourceMapKeyFn | readonly (readonly [URI, T])[], toKey?: ResourceMapKeyFn) {
		if (arg instanceof ResourceMap) {
			this.map = new Map(arg.map);
			this.toKey = toKey ?? ResourceMap.defaultToKey;
		} else if (isEntries(arg)) {
			this.map = new Map();
			this.toKey = toKey ?? ResourceMap.defaultToKey;

			for (const [resource, value] of arg) {
				this.set(resource, value);
			}
		} else {
			this.map = new Map();
			this.toKey = arg ?? ResourceMap.defaultToKey;
		}
	}

	set(resource: URI, value: T): this {
		this.map.set(this.toKey(resource), new ResourceMapEntry(resource, value));
		return this;
	}

	get(resource: URI): T | undefined {
		return this.map.get(this.toKey(resource))?.value;
	}

	has(resource: URI): boolean {
		return this.map.has(this.toKey(resource));
	}

	get size(): number {
		return this.map.size;
	}

	clear(): void {
		this.map.clear();
	}

	delete(resource: URI): boolean {
		return this.map.delete(this.toKey(resource));
	}

	forEach(clb: (value: T, key: URI, map: Map<URI, T>) => void, thisArg?: any): void {
		if (typeof thisArg !== 'undefined') {
			clb = clb.bind(thisArg);
		}
		for (const [_, entry] of this.map) {
			clb(entry.value, entry.uri, <any>this);
		}
	}

	*values(): IterableIterator<T> {
		for (const entry of this.map.values()) {
			yield entry.value;
		}
	}

	*keys(): IterableIterator<URI> {
		for (const entry of this.map.values()) {
			yield entry.uri;
		}
	}

	*entries(): IterableIterator<[URI, T]> {
		for (const entry of this.map.values()) {
			yield [entry.uri, entry.value];
		}
	}

	*[Symbol.iterator](): IterableIterator<[URI, T]> {
		for (const [, entry] of this.map) {
			yield [entry.uri, entry.value];
		}
	}
}

export class ResourceSet implements Set<URI> {

	readonly [Symbol.toStringTag]: string = 'ResourceSet';

	private readonly _map: ResourceMap<URI>;

	constructor(toKey?: ResourceMapKeyFn);
	constructor(entries: readonly URI[], toKey?: ResourceMapKeyFn);
	constructor(entriesOrKey?: readonly URI[] | ResourceMapKeyFn, toKey?: ResourceMapKeyFn) {
		if (!entriesOrKey || typeof entriesOrKey === 'function') {
			this._map = new ResourceMap(entriesOrKey);
		} else {
			this._map = new ResourceMap(toKey);
			entriesOrKey.forEach(this.add, this);
		}
	}


	get size(): number {
		return this._map.size;
	}

	add(value: URI): this {
		this._map.set(value, value);
		return this;
	}

	clear(): void {
		this._map.clear();
	}

	delete(value: URI): boolean {
		return this._map.delete(value);
	}

	forEach(callbackfn: (value: URI, value2: URI, set: Set<URI>) => void, thisArg?: any): void {
		this._map.forEach((_value, key) => callbackfn.call(thisArg, key, key, this));
	}

	has(value: URI): boolean {
		return this._map.has(value);
	}

	entries(): IterableIterator<[URI, URI]> {
		return this._map.entries();
	}

	keys(): IterableIterator<URI> {
		return this._map.keys();
	}

	values(): IterableIterator<URI> {
		return this._map.keys();
	}

	[Symbol.iterator](): IterableIterator<URI> {
		return this.keys();
	}
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

	constructor() {
		this._map = new Map<K, Item<K, V>>();
		this._head = undefined;
		this._tail = undefined;
		this._size = 0;
		this._state = 0;
	}

	clear(): void {
		this._map.clear();
		this._head = undefined;
		this._tail = undefined;
		this._size = 0;
		this._state++;
	}

	isEmpty(): boolean {
		return !this._head && !this._tail;
	}

	get size(): number {
		return this._size;
	}

	get first(): V | undefined {
		return this._head?.value;
	}

	get last(): V | undefined {
		return this._tail?.value;
	}

	has(key: K): boolean {
		return this._map.has(key);
	}

	get(key: K, touch: Touch = Touch.None): V | undefined {
		const item = this._map.get(key);
		if (!item) {
			return undefined;
		}
		if (touch !== Touch.None) {
			this.touch(item, touch);
		}
		return item.value;
	}

	set(key: K, value: V, touch: Touch = Touch.None): this {
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
				case Touch.AsOld:
					this.addItemFirst(item);
					break;
				case Touch.AsNew:
					this.addItemLast(item);
					break;
				default:
					this.addItemLast(item);
					break;
			}
			this._map.set(key, item);
			this._size++;
		}
		return this;
	}

	delete(key: K): boolean {
		return !!this.remove(key);
	}

	remove(key: K): V | undefined {
		const item = this._map.get(key);
		if (!item) {
			return undefined;
		}
		this._map.delete(key);
		this.removeItem(item);
		this._size--;
		return item.value;
	}

	shift(): V | undefined {
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

	forEach(callbackfn: (value: V, key: K, map: LinkedMap<K, V>) => void, thisArg?: any): void {
		const state = this._state;
		let current = this._head;
		while (current) {
			if (thisArg) {
				callbackfn.bind(thisArg)(current.value, current.key, this);
			} else {
				callbackfn(current.value, current.key, this);
			}
			if (this._state !== state) {
				throw new Error(`LinkedMap got modified during iteration.`);
			}
			current = current.next;
		}
	}

	keys(): IterableIterator<K> {
		const map = this;
		const state = this._state;
		let current = this._head;
		const iterator: IterableIterator<K> = {
			[Symbol.iterator]() {
				return iterator;
			},
			next(): IteratorResult<K> {
				if (map._state !== state) {
					throw new Error(`LinkedMap got modified during iteration.`);
				}
				if (current) {
					const result = { value: current.key, done: false };
					current = current.next;
					return result;
				} else {
					return { value: undefined, done: true };
				}
			}
		};
		return iterator;
	}

	values(): IterableIterator<V> {
		const map = this;
		const state = this._state;
		let current = this._head;
		const iterator: IterableIterator<V> = {
			[Symbol.iterator]() {
				return iterator;
			},
			next(): IteratorResult<V> {
				if (map._state !== state) {
					throw new Error(`LinkedMap got modified during iteration.`);
				}
				if (current) {
					const result = { value: current.value, done: false };
					current = current.next;
					return result;
				} else {
					return { value: undefined, done: true };
				}
			}
		};
		return iterator;
	}

	entries(): IterableIterator<[K, V]> {
		const map = this;
		const state = this._state;
		let current = this._head;
		const iterator: IterableIterator<[K, V]> = {
			[Symbol.iterator]() {
				return iterator;
			},
			next(): IteratorResult<[K, V]> {
				if (map._state !== state) {
					throw new Error(`LinkedMap got modified during iteration.`);
				}
				if (current) {
					const result: IteratorResult<[K, V]> = { value: [current.key, current.value], done: false };
					current = current.next;
					return result;
				} else {
					return { value: undefined, done: true };
				}
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

export class SetMap<K, V> {

	private map = new Map<K, Set<V>>();

	add(key: K, value: V): void {
		let values = this.map.get(key);

		if (!values) {
			values = new Set<V>();
			this.map.set(key, values);
		}

		values.add(value);
	}

	delete(key: K, value: V): void {
		const values = this.map.get(key);

		if (!values) {
			return;
		}

		values.delete(value);

		if (values.size === 0) {
			this.map.delete(key);
		}
	}

	forEach(key: K, fn: (value: V) => void): void {
		const values = this.map.get(key);

		if (!values) {
			return;
		}

		values.forEach(fn);
	}

	get(key: K): ReadonlySet<V> {
		const values = this.map.get(key);
		if (!values) {
			return new Set<V>();
		}
		return values;
	}
}
