/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


/**
 * This implements the Map interface. Note that in all methods that iterate or return an iterator, a copy of the underlying data is
 * returned so that if you call `get`, `set`, or `delete` while iterating, the iterator will not be invalidated.
 */
export class LRUCacheMap<K, T> implements Map<K, T> {
	private valueMap = new Map<K, T>();
	private sizeLimit: number;

	// constructor
	constructor(size = 10) {
		if (size < 1) {
			throw new Error('Size limit must be at least 1');
		}
		this.sizeLimit = size;
	}

	set(key: K, value: T): this {
		if (this.has(key)) {
			// If key already exists, delete it
			// from the valueMap only so we can re-insert it at the end
			this.valueMap.delete(key);
		} else if (this.valueMap.size >= this.sizeLimit) {
			// least-recently used cache eviction strategy
			// Maps iterate in insertion order
			const oldest = this.valueMap.keys().next().value!;
			this.delete(oldest);
		}

		this.valueMap.set(key, value);
		return this;
	}

	/**
	 * Warning this method makes the key the most recently used. To avoid this, use `peek` instead.
	 * @param key
	 * @returns
	 */
	get(key: K): T | undefined {
		if (this.valueMap.has(key)) {
			const entry = this.valueMap.get(key);
			// Move to the end by deleting and re-inserting
			this.valueMap.delete(key);
			this.valueMap.set(key, entry!);
			return entry!;
		}

		return undefined;
	}

	delete(key: K): boolean {
		return this.valueMap.delete(key);
	}

	clear() {
		this.valueMap.clear();
	}

	get size(): number {
		return this.valueMap.size;
	}

	keys(): IterableIterator<K> {
		return new Map(this.valueMap).keys();
	}

	values(): IterableIterator<T> {
		return new Map(this.valueMap).values();
	}

	entries(): IterableIterator<[K, T]> {
		return new Map(this.valueMap).entries();
	}

	[Symbol.iterator](): IterableIterator<[K, T]> {
		return this.entries();
	}

	has(key: K): boolean {
		return this.valueMap.has(key);
	}

	forEach(callbackfn: (value: T, key: K, map: Map<K, T>) => void, thisArg?: unknown): void {
		new Map(this.valueMap).forEach(callbackfn, thisArg);
	}

	get [Symbol.toStringTag](): string {
		return 'LRUCacheMap';
	}

	peek(key: K): T | undefined {
		return this.valueMap.get(key);
	}
}
