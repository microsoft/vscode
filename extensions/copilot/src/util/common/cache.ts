/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../vs/base/common/lifecycle';

class Node<T> {
	key: string;
	value: T;
	prev: Node<T> | null = null;
	next: Node<T> | null = null;

	constructor(key: string, value: T) {
		this.key = key;
		this.value = value;
	}
}

export class LRUCache<T> {
	private readonly _capacity: number;
	private readonly _cache: Map<string, Node<T>>;
	private readonly _head: Node<T>;
	private readonly _tail: Node<T>;

	constructor(size = 10) {
		if (size < 1) {
			throw new Error('Cache size must be at least 1');
		}
		this._capacity = size;
		this._cache = new Map<string, Node<T>>();
		this._head = new Node<T>('', null as any);
		this._tail = new Node<T>('', null as any);
		this._head.next = this._tail;
		this._tail.prev = this._head;
	}

	private _addNode(node: Node<T>) {
		node.prev = this._head;
		node.next = this._head.next;
		this._head.next!.prev = node;
		this._head.next = node;
	}

	private _removeNode(node: Node<T>) {
		const prev = node.prev;
		const next = node.next;
		prev!.next = next;
		next!.prev = prev;
	}

	private _moveToHead(node: Node<T>) {
		this._removeNode(node);
		this._addNode(node);
	}

	private _popTail(): Node<T> {
		const res = this._tail.prev!;
		this._removeNode(res);
		return res;
	}

	clear() {
		this._cache.clear();
		this._head.next = this._tail;
		this._tail.prev = this._head;
	}

	/**
	 * Deletes the cache entry for the given key, if it exists.
	 * @param key The key of the cache entry to delete.
	 * @returns The value of the deleted cache entry, or undefined if the key was not found.
	 */
	deleteKey(key: string): T | undefined {
		const node = this._cache.get(key);
		if (!node) {
			return undefined;
		}
		this._removeNode(node);
		this._cache.delete(key);
		return node.value;
	}

	get(key: string): T | undefined {
		const node = this._cache.get(key);
		if (!node) {
			return undefined;
		}
		this._moveToHead(node);
		return node.value;
	}

	/**
	 * Return a copy of all the keys stored in the LRU cache, in LRU order.
	 *
	 * The returned array is safe to modify, as this call allocates a copy of a
	 * private array used to represent those keys.
	 */
	keys(): string[] {
		const keys: string[] = [];
		let current = this._head.next;
		while (current !== this._tail) {
			keys.push(current!.key);
			current = current!.next;
		}
		return keys;
	}

	getValues() {
		const values: T[] = [];
		let current = this._head.next;
		while (current !== this._tail) {
			values.push(current!.value);
			current = current!.next;
		}
		return values;
	}

	/** @returns the evicted [key, value]  */
	put(key: string, value: T): [string, T] | undefined {
		let node = this._cache.get(key);
		if (node) {
			node.value = value;
			this._moveToHead(node);
		} else {
			node = new Node<T>(key, value);
			this._cache.set(key, node);
			this._addNode(node);

			if (this._cache.size > this._capacity) {
				const tail = this._popTail();
				this._cache.delete(tail.key);
				return [tail.key, tail.value] as const;
			}
		}
	}

	entries(): Array<[string, T]> {
		const entries: Array<[string, T]> = [];
		let current = this._head.next;
		while (current !== this._tail) {
			entries.push([current!.key, current!.value]);
			current = current!.next;
		}
		return entries;
	}
}

export class DisposablesLRUCache<T extends IDisposable> implements IDisposable {
	private readonly actual: LRUCache<T>;

	constructor(size?: number) {
		this.actual = new LRUCache<T>(size);
	}

	dispose() {
		this.clear();
	}

	clear() {
		const values = this.actual.getValues();
		for (const value of values) {
			value.dispose();
		}
		this.actual.clear();
	}

	deleteKey(key: string): void {
		const value = this.actual.deleteKey(key);
		if (value) {
			value.dispose();
		}
	}

	get(key: string): T | undefined {
		return this.actual.get(key);
	}

	keys(): string[] {
		return this.actual.keys();
	}

	getValues() {
		return this.actual.getValues();
	}

	put(key: string, value: T): void {
		const evicted = this.actual.put(key, value);
		if (evicted) {
			evicted[1].dispose();
		}
	}
}
