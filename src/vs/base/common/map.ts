/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';

export function values<V = any>(set: Set<V>): V[];
export function values<K = any, V = any>(map: Map<K, V>): V[];
export function values<V>(forEachable: { forEach(callback: (value: V, ...more: any[]) => any) }): V[] {
	const result: V[] = [];
	forEachable.forEach(value => result.push(value));
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

export interface IKeyIterator {
	reset(key: string): this;
	next(): this;
	join(parts: string[]): string;

	hasNext(): boolean;
	cmp(a: string): number;
	value(): string;
}

export class StringIterator implements IKeyIterator {

	private _value: string = '';
	private _pos: number = 0;

	reset(key: string): this {
		this._value = key;
		this._pos = 0;
		return this;
	}

	next(): this {
		this._pos += 1;
		return this;
	}

	join(parts: string[]): string {
		return parts.join('');
	}

	hasNext(): boolean {
		return this._pos < this._value.length - 1;
	}

	cmp(a: string): number {
		let aCode = a.charCodeAt(0);
		let thisCode = this._value.charCodeAt(this._pos);
		return aCode - thisCode;
	}

	value(): string {
		return this._value[this._pos];
	}
}

export class PathIterator implements IKeyIterator {

	private static readonly _fwd = '/'.charCodeAt(0);
	private static readonly _bwd = '\\'.charCodeAt(0);

	private _value: string;
	private _from: number;
	private _to: number;

	reset(key: string): this {
		this._value = key.replace(/\\$|\/$/, '');
		this._from = 0;
		this._to = 0;
		return this.next();
	}

	hasNext(): boolean {
		return this._to < this._value.length;
	}

	join(parts: string[]): string {
		return parts.join('/');
	}

	next(): this {
		// this._data = key.split(/[\\/]/).filter(s => !!s);
		this._from = this._to;
		let justSeps = true;
		for (; this._to < this._value.length; this._to++) {
			const ch = this._value.charCodeAt(this._to);
			if (ch === PathIterator._fwd || ch === PathIterator._bwd) {
				if (justSeps) {
					this._from++;
				} else {
					break;
				}
			} else {
				justSeps = false;
			}
		}
		return this;
	}

	cmp(a: string): number {

		let aPos = 0;
		let aLen = a.length;
		let thisPos = this._from;

		while (aPos < aLen && thisPos < this._to) {
			let cmp = a.charCodeAt(aPos) - this._value.charCodeAt(thisPos);
			if (cmp !== 0) {
				return cmp;
			}
			aPos += 1;
			thisPos += 1;
		}

		if (aLen === this._to - this._from) {
			return 0;
		} else if (aPos < aLen) {
			return -1;
		} else {
			return 1;
		}
	}

	value(): string {
		return this._value.substring(this._from, this._to);
	}
}

class TernarySearchTreeNode<E> {
	str: string;
	element: E;
	left: TernarySearchTreeNode<E>;
	mid: TernarySearchTreeNode<E>;
	right: TernarySearchTreeNode<E>;

	isEmpty(): boolean {
		return !this.left && !this.mid && !this.right && !this.element;
	}
}

export class TernarySearchTree<E> {

	static forPaths<E>(): TernarySearchTree<E> {
		return new TernarySearchTree<E>(new PathIterator());
	}

	static forStrings<E>(): TernarySearchTree<E> {
		return new TernarySearchTree<E>(new StringIterator());
	}

	private _iter: IKeyIterator;
	private _root: TernarySearchTreeNode<E>;

	constructor(segments: IKeyIterator) {
		this._iter = segments;
	}

	clear(): void {
		this._root = undefined;
	}

	set(key: string, element: E): E {
		let iter = this._iter.reset(key);
		let node: TernarySearchTreeNode<E>;

		if (!this._root) {
			this._root = new TernarySearchTreeNode<E>();
			this._root.str = iter.value();
		}

		node = this._root;
		while (true) {
			let val = iter.cmp(node.str);
			if (val > 0) {
				// left
				if (!node.left) {
					node.left = new TernarySearchTreeNode<E>();
					node.left.str = iter.value();
				}
				node = node.left;

			} else if (val < 0) {
				// right
				if (!node.right) {
					node.right = new TernarySearchTreeNode<E>();
					node.right.str = iter.value();
				}
				node = node.right;

			} else if (iter.hasNext()) {
				// mid
				iter.next();
				if (!node.mid) {
					node.mid = new TernarySearchTreeNode<E>();
					node.mid.str = iter.value();
				}
				node = node.mid;
			} else {
				break;
			}
		}
		const oldElement = node.element;
		node.element = element;
		return oldElement;
	}

	get(key: string): E {
		let iter = this._iter.reset(key);
		let node = this._root;
		while (node) {
			let val = iter.cmp(node.str);
			if (val > 0) {
				// left
				node = node.left;
			} else if (val < 0) {
				// right
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				node = node.mid;
			} else {
				break;
			}
		}
		return node ? node.element : undefined;
	}

	delete(key: string): void {

		let iter = this._iter.reset(key);
		let stack: [-1 | 0 | 1, TernarySearchTreeNode<E>][] = [];
		let node = this._root;

		// find and unset node
		while (node) {
			let val = iter.cmp(node.str);
			if (val > 0) {
				// left
				stack.push([1, node]);
				node = node.left;
			} else if (val < 0) {
				// right
				stack.push([-1, node]);
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				stack.push([0, node]);
				node = node.mid;
			} else {
				// remove element
				node.element = undefined;

				// clean up empty nodes
				while (stack.length > 0 && node.isEmpty()) {
					let [dir, parent] = stack.pop();
					switch (dir) {
						case 1: parent.left = undefined; break;
						case 0: parent.mid = undefined; break;
						case -1: parent.right = undefined; break;
					}
					node = parent;
				}
				break;
			}
		}
	}

	findSubstr(key: string): E {
		let iter = this._iter.reset(key);
		let node = this._root;
		let candidate: E;
		while (node) {
			let val = iter.cmp(node.str);
			if (val > 0) {
				// left
				node = node.left;
			} else if (val < 0) {
				// right
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				candidate = node.element || candidate;
				node = node.mid;
			} else {
				break;
			}
		}
		return node && node.element || candidate;
	}

	findSuperstr(key: string): TernarySearchTree<E> {
		let iter = this._iter.reset(key);
		let node = this._root;
		while (node) {
			let val = iter.cmp(node.str);
			if (val > 0) {
				// left
				node = node.left;
			} else if (val < 0) {
				// right
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				node = node.mid;
			} else {
				// collect
				if (!node.mid) {
					return undefined;
				}
				let ret = new TernarySearchTree<E>(this._iter);
				ret._root = node.mid;
				return ret;
			}
		}
		return undefined;
	}

	forEach(callback: (value: E, index: string) => any) {
		this._forEach(this._root, [], callback);
	}

	private _forEach(node: TernarySearchTreeNode<E>, parts: string[], callback: (value: E, index: string) => any) {
		if (node) {
			// left
			this._forEach(node.left, parts, callback);

			// node
			parts.push(node.str);
			if (node.element) {
				callback(node.element, this._iter.join(parts));
			}
			// mid
			this._forEach(node.mid, parts, callback);
			parts.pop();

			// right
			this._forEach(node.right, parts, callback);
		}
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

export enum Touch {
	None = 0,
	AsOld = 1,
	AsNew = 2
}

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

	public get(key: K, touch: Touch = Touch.None): V | undefined {
		const item = this._map.get(key);
		if (!item) {
			return undefined;
		}
		if (touch !== Touch.None) {
			this.touch(item, touch);
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
		current.previous = void 0;
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
			this._head = void 0;
			this._tail = void 0;
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
				previous!.next = void 0;
				this._tail = previous;
			}
			else {
				// Both next and previous are not undefined since item was neither head nor tail.
				next!.previous = previous;
				previous!.next = next;
			}

			// Insert the node at head
			item.previous = void 0;
			item.next = this._head;
			this._head.previous = item;
			this._head = item;
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
				next!.previous = void 0;
				this._head = next;
			} else {
				// Both next and previous are not undefined since item was neither head nor tail.
				next!.previous = previous;
				previous!.next = next;
			}
			item.next = void 0;
			item.previous = this._tail;
			this._tail.next = item;
			this._tail = item;
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

	public get limit(): number {
		return this._limit;
	}

	public set limit(limit: number) {
		this._limit = limit;
		this.checkTrim();
	}

	public get ratio(): number {
		return this._ratio;
	}

	public set ratio(ratio: number) {
		this._ratio = Math.min(Math.max(0, ratio), 1);
		this.checkTrim();
	}

	public get(key: K): V | undefined {
		return super.get(key, Touch.AsNew);
	}

	public peek(key: K): V | undefined {
		return super.get(key, Touch.None);
	}

	public set(key: K, value: V): void {
		super.set(key, value, Touch.AsNew);
		this.checkTrim();
	}

	private checkTrim() {
		if (this.size > this._limit) {
			this.trimOld(Math.round(this._limit * this._ratio));
		}
	}
}
