/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';

export interface Key {
	toString(): string;
}

export interface Entry<K, T> {
	next?: Entry<K, T>;
	prev?: Entry<K, T>;
	key: K;
	value: T;
}

/**
 * A simple map to store value by a key object. Key can be any object that has toString() function to get
 * string value of the key.
 */
export class LinkedMap<K extends Key, T> {

	protected map: { [key: string]: Entry<K, T> };
	protected _size: number;

	constructor() {
		this.map = Object.create(null);
		this._size = 0;
	}

	public get size(): number {
		return this._size;
	}

	public get(k: K): T {
		const value = this.peek(k);

		return value ? value : null;
	}

	public getOrSet(k: K, t: T): T {
		const res = this.get(k);
		if (res) {
			return res;
		}

		this.set(k, t);

		return t;
	}

	public keys(): K[] {
		const keys: K[] = [];
		for (let key in this.map) {
			keys.push(this.map[key].key);
		}
		return keys;
	}

	public values(): T[] {
		const values: T[] = [];
		for (let key in this.map) {
			values.push(this.map[key].value);
		}
		return values;
	}

	public entries(): Entry<K, T>[] {
		const entries: Entry<K, T>[] = [];
		for (let key in this.map) {
			entries.push(this.map[key]);
		}
		return entries;
	}

	public set(k: K, t: T): boolean {
		if (this.get(k)) {
			return false; // already present!
		}

		this.push(k, t);

		return true;
	}

	public delete(k: K): T {
		let value: T = this.get(k);
		if (value) {
			this.pop(k);
			return value;
		}
		return null;
	}

	public has(k: K): boolean {
		return !!this.get(k);
	}

	public clear(): void {
		this.map = Object.create(null);
		this._size = 0;
	}

	protected push(key: K, value: T): void {
		const entry: Entry<K, T> = { key, value };
		this.map[key.toString()] = entry;
		this._size++;
	}

	protected pop(k: K): void {
		delete this.map[k.toString()];
		this._size--;
	}

	protected peek(k: K): T {
		const entry = this.map[k.toString()];
		return entry ? entry.value : null;
	}
}

/**
 * A simple Map<T> that optionally allows to set a limit of entries to store. Once the limit is hit,
 * the cache will remove the entry that was last recently added. Or, if a ratio is provided below 1,
 * all elements will be removed until the ratio is full filled (e.g. 0.75 to remove 25% of old elements).
 */
export class BoundedLinkedMap<T> {
	protected map: { [key: string]: Entry<string, T> };
	private head: Entry<string, T>;
	private tail: Entry<string, T>;
	private _size: number;
	private ratio: number;

	constructor(private limit = Number.MAX_VALUE, ratio = 1) {
		this.map = Object.create(null);
		this._size = 0;
		this.ratio = limit * ratio;
	}

	public get size(): number {
		return this._size;
	}

	public set(key: string, value: T): boolean {
		if (this.map[key]) {
			return false; // already present!
		}

		const entry: Entry<string, T> = { key, value };
		this.push(entry);

		if (this._size > this.limit) {
			this.trim();
		}

		return true;
	}

	public get(key: string): T {
		const entry = this.map[key];

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
		const entry = this.map[key];

		if (entry) {
			this.map[key] = void 0;
			this._size--;

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
		return !!this.map[key];
	}

	public clear(): void {
		this.map = Object.create(null);
		this._size = 0;
		this.head = null;
		this.tail = null;
	}

	protected push(entry: Entry<string, T>): void {
		if (this.head) {
			// [A]-[B] = [A]-[B]->[X]
			entry.prev = this.head;
			this.head.next = entry;
		}

		if (!this.tail) {
			this.tail = entry;
		}

		this.head = entry;

		this.map[entry.key] = entry;
		this._size++;
	}

	private trim(): void {
		if (this.tail) {

			// Remove all elements until ratio is reached
			if (this.ratio < this.limit) {
				let index = 0;
				let current = this.tail;
				while (current.next) {

					// Remove the entry
					this.map[current.key] = void 0;
					this._size--;

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
				this.map[this.tail.key] = void 0;
				this._size--;

				// [x]-[B] = [B]
				this.tail = this.tail.next;
				this.tail.prev = null;
			}
		}
	}
}

/**
 * A subclass of Map<T> that makes an entry the MRU entry as soon
 * as it is being accessed. In combination with the limit for the
 * maximum number of elements in the cache, it helps to remove those
 * entries from the cache that are LRU.
 */
export class LRUCache<T> extends BoundedLinkedMap<T> {

	constructor(limit: number) {
		super(limit);
	}

	public get(key: string): T {

		// Upon access of an entry, make it the head of
		// the linked map so that it is the MRU element
		const entry = this.map[key];
		if (entry) {
			this.delete(key);
			this.push(entry);

			return entry.value;
		}


		return null;
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

	private _splitter: (s: string) => string[];
	private _root = new Node<E>();

	constructor(splitter: (s: string) => string[]) {
		this._splitter = splitter;
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
	private map: Map<string, T>;

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
		const values: T[] = [];
		this.map.forEach(value => values.push(value));

		return values;
	}

	private toKey(resource: URI): string {
		let key: string;

		if (resource.scheme === Schemas.file) {
			key = resource.fsPath;
		} else {
			key = resource.toString();
		}

		if (this.ignoreCase) {
			key = key.toLowerCase();
		}

		return key;
	}
}