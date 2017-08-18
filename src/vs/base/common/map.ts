/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';

export interface Key {
	toString(): string;
}

export interface Entry<K, T> {
	key: K;
	value: T;
}

export function values<K, V>(map: Map<K, V>): V[] {
	const result: V[] = [];
	map.forEach(value => result.push(value));

	return result;
}

export function keys<K, V>(map: Map<K, V>): K[] {
	const result: K[] = [];
	map.forEach((value, key) => result.push(key));

	return result;
}

export function getOrSet<K, V>(map: Map<K, V>, key: K, value: V): V {
	let result = map.get(key);
	if (result === void 0) {
		result = value;
		map.set(key, result);
	}

	return result;
}

export interface ISerializedBoundedLinkedMap<T> {
	entries: { key: string; value: T }[];
}

interface LinkedEntry<K, T> extends Entry<K, T> {
	next?: LinkedEntry<K, T>;
	prev?: LinkedEntry<K, T>;
}

/**
 * A simple Map<T> that optionally allows to set a limit of entries to store. Once the limit is hit,
 * the cache will remove the entry that was last recently added. Or, if a ratio is provided below 1,
 * all elements will be removed until the ratio is full filled (e.g. 0.75 to remove 25% of old elements).
 */
export class BoundedMap<T> {
	private map: Map<string, LinkedEntry<string, T>>;

	private head: LinkedEntry<string, T>;
	private tail: LinkedEntry<string, T>;
	private ratio: number;

	constructor(private limit = Number.MAX_VALUE, ratio = 1, value?: ISerializedBoundedLinkedMap<T>) {
		this.map = new Map<string, LinkedEntry<string, T>>();
		this.ratio = limit * ratio;

		if (value) {
			value.entries.forEach(entry => {
				this.set(entry.key, entry.value);
			});
		}
	}

	public setLimit(limit: number): void {
		if (limit < 0) {
			return; // invalid limit
		}

		this.limit = limit;
		while (this.map.size > this.limit) {
			this.trim();
		}
	}

	public serialize(): ISerializedBoundedLinkedMap<T> {
		const serialized: ISerializedBoundedLinkedMap<T> = { entries: [] };

		this.map.forEach(entry => {
			serialized.entries.push({ key: entry.key, value: entry.value });
		});

		return serialized;
	}

	public get size(): number {
		return this.map.size;
	}

	public set(key: string, value: T): boolean {
		if (this.map.has(key)) {
			return false; // already present!
		}

		const entry: LinkedEntry<string, T> = { key, value };
		this.push(entry);

		if (this.size > this.limit) {
			this.trim();
		}

		return true;
	}

	public get(key: string): T {
		const entry = this.map.get(key);

		return entry ? entry.value : null;
	}

	public getOrSet(k: string, t: T): T {
		const res = this.get(k);
		if (res) {
			return res;
		}

		this.set(k, t);

		return t;
	}

	public delete(key: string): T {
		const entry = this.map.get(key);

		if (entry) {
			this.map.delete(key);

			if (entry.next) {
				entry.next.prev = entry.prev; // [A]<-[x]<-[C] = [A]<-[C]
			} else {
				this.head = entry.prev; // [A]-[x] = [A]
			}

			if (entry.prev) {
				entry.prev.next = entry.next; // [A]->[x]->[C] = [A]->[C]
			} else {
				this.tail = entry.next; // [x]-[A] = [A]
			}

			return entry.value;
		}

		return null;
	}

	public has(key: string): boolean {
		return this.map.has(key);
	}

	public clear(): void {
		this.map.clear();
		this.head = null;
		this.tail = null;
	}

	private push(entry: LinkedEntry<string, T>): void {
		if (this.head) {
			// [A]-[B] = [A]-[B]->[X]
			entry.prev = this.head;
			this.head.next = entry;
		}

		if (!this.tail) {
			this.tail = entry;
		}

		this.head = entry;

		this.map.set(entry.key, entry);
	}

	private trim(): void {
		if (this.tail) {

			// Remove all elements until ratio is reached
			if (this.ratio < this.limit) {
				let index = 0;
				let current = this.tail;
				while (current.next) {

					// Remove the entry
					this.map.delete(current.key);

					// if we reached the element that overflows our ratio condition
					// make its next element the new tail of the Map and adjust the size
					if (index === this.ratio) {
						this.tail = current.next;
						this.tail.prev = null;

						break;
					}

					// Move on
					current = current.next;
					index++;
				}
			}

			// Just remove the tail element
			else {
				this.map.delete(this.tail.key);

				// [x]-[B] = [B]
				this.tail = this.tail.next;
				if (this.tail) {
					this.tail.prev = null;
				}
			}
		}
	}
}

// --- trie'ish datastructure

class Node<E> {
	element?: E;
	readonly children = new Map<string, Node<E>>();
}

/**
 * A trie map that allows for fast look up when keys are substrings
 * to the actual search keys (dir/subdir-problem).
 */
export class TrieMap<E> {

	static PathSplitter = (s: string) => s.split(/[\\/]/).filter(s => !!s);

	private readonly _splitter: (s: string) => string[];
	private _root = new Node<E>();

	constructor(splitter: (s: string) => string[] = TrieMap.PathSplitter) {
		this._splitter = s => splitter(s).filter(s => Boolean(s));
	}

	insert(path: string, element: E): void {
		const parts = this._splitter(path);
		let i = 0;

		// find insertion node
		let node = this._root;
		for (; i < parts.length; i++) {
			let child = node.children.get(parts[i]);
			if (child) {
				node = child;
				continue;
			}
			break;
		}

		// create new nodes
		let newNode: Node<E>;
		for (; i < parts.length; i++) {
			newNode = new Node<E>();
			node.children.set(parts[i], newNode);
			node = newNode;
		}

		node.element = element;
	}

	lookUp(path: string): E {
		const parts = this._splitter(path);

		let { children } = this._root;
		let node: Node<E>;
		for (const part of parts) {
			node = children.get(part);
			if (!node) {
				return undefined;
			}
			children = node.children;
		}

		return node.element;
	}

	findSubstr(path: string): E {
		const parts = this._splitter(path);

		let lastNode: Node<E>;
		let { children } = this._root;
		for (const part of parts) {
			const node = children.get(part);
			if (!node) {
				break;
			}
			if (node.element) {
				lastNode = node;
			}
			children = node.children;
		}

		// return the last matching node
		// that had an element
		if (lastNode) {
			return lastNode.element;
		}
		return undefined;
	}

	findSuperstr(path: string): TrieMap<E> {
		const parts = this._splitter(path);

		let { children } = this._root;
		let node: Node<E>;
		for (const part of parts) {
			node = children.get(part);
			if (!node) {
				return undefined;
			}
			children = node.children;
		}

		const result = new TrieMap<E>(this._splitter);
		result._root = node;
		return result;
	}
}

export class ResourceMap<T> {

	protected map: Map<string, T>;

	constructor(private ignoreCase?: boolean) {
		this.map = new Map<string, T>();
	}

	public set(resource: URI, value: T): void {
		this.map.set(this.toKey(resource), value);
	}

	public get(resource: URI): T {
		return this.map.get(this.toKey(resource));
	}

	public has(resource: URI): boolean {
		return this.map.has(this.toKey(resource));
	}

	public get size(): number {
		return this.map.size;
	}

	public clear(): void {
		this.map.clear();
	}

	public delete(resource: URI): boolean {
		return this.map.delete(this.toKey(resource));
	}

	public forEach(clb: (value: T) => void): void {
		this.map.forEach(clb);
	}

	public values(): T[] {
		return values(this.map);
	}

	private toKey(resource: URI): string {
		let key = resource.toString();
		if (this.ignoreCase) {
			key = key.toLowerCase();
		}

		return key;
	}
}

export class StrictResourceMap<T> extends ResourceMap<T> {

	constructor() {
		super();
	}

	public keys(): URI[] {
		return keys(this.map).map(key => URI.parse(key));
	}

}

// We should fold BoundedMap and LinkedMap. See https://github.com/Microsoft/vscode/issues/28496

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
		return !!this.remove(key);
	}

	public remove(key: K): V | undefined {
		const item = this._map.get(key);
		if (!item) {
			return undefined;
		}
		this._map.delete(key);
		this.removeItem(item);
		this._size--;
		return item.value;
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
