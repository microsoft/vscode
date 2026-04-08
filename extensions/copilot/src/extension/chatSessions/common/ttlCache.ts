/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A simple TTL (time-to-live) cache that stores key-value pairs with expiration.
 * Entries are evicted lazily on access when their TTL has elapsed.
 */
export class TtlCache<V> {
	private readonly _entries = new Map<string, { value: V; timestamp: number }>();

	/**
	 * @param _ttlMs The time-to-live in milliseconds for cache entries.
	 */
	constructor(private readonly _ttlMs: number) { }

	/**
	 * Returns the cached value if it exists and has not expired, otherwise `undefined`.
	 */
	get(key: string): V | undefined {
		const entry = this._entries.get(key);
		if (!entry) {
			return undefined;
		}
		if (Date.now() - entry.timestamp >= this._ttlMs) {
			this._entries.delete(key);
			return undefined;
		}
		return entry.value;
	}

	/**
	 * Stores a value in the cache with the current timestamp.
	 */
	set(key: string, value: V): void {
		this._entries.set(key, { value, timestamp: Date.now() });
	}

	/**
	 * Removes a single entry from the cache.
	 */
	delete(key: string): void {
		this._entries.delete(key);
	}

	/**
	 * Removes all entries from the cache.
	 */
	clear(): void {
		this._entries.clear();
	}

	/**
	 * Returns `true` if the cache has a non-expired entry for the given key.
	 */
	has(key: string): boolean {
		return this.get(key) !== undefined;
	}
}

/**
 * A single-slot TTL cache that stores one value with an associated key and expiration.
 * Useful for caching a computed result (e.g. the full options object for a given repo context).
 */
export class SingleSlotTtlCache<V> {
	private _entry: { value: V; timestamp: number; key: string } | undefined;

	/**
	 * @param _ttlMs The time-to-live in milliseconds for the cached entry.
	 */
	constructor(private readonly _ttlMs: number) { }

	/**
	 * Returns the cached value if the key matches and the TTL has not expired, otherwise `undefined`.
	 */
	get(key: string): V | undefined {
		if (!this._entry || this._entry.key !== key) {
			return undefined;
		}
		if (Date.now() - this._entry.timestamp >= this._ttlMs) {
			this._entry = undefined;
			return undefined;
		}
		return this._entry.value;
	}

	/**
	 * Stores a value in the cache, replacing any previous entry.
	 */
	set(key: string, value: V): void {
		this._entry = { value, timestamp: Date.now(), key };
	}

	/**
	 * Removes the cached entry.
	 */
	clear(): void {
		this._entry = undefined;
	}

	/**
	 * Returns `true` if the cache has a non-expired entry for the given key.
	 */
	has(key: string): boolean {
		return this.get(key) !== undefined;
	}
}
