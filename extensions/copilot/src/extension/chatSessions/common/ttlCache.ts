/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A simple TTL (time-to-live) cache that stores key-value pairs with expiration.
 * Entries are evicted lazily on access when their TTL has elapsed.
 */
export class TtlCache<V> {
	private readonly _entries = new Map<string, { value: V; timestamp: number; ttlMs?: number }>();

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
		const ttl = entry.ttlMs ?? this._ttlMs;
		if (Date.now() - entry.timestamp >= ttl) {
			this._entries.delete(key);
			return undefined;
		}
		return entry.value;
	}

	/**
	 * Stores a value in the cache with the current timestamp.
	 * @param ttlMs Optional per-entry TTL override in milliseconds. If not provided, the cache-wide TTL is used.
	 */
	set(key: string, value: V, ttlMs?: number): void {
		this._entries.set(key, { value, timestamp: Date.now(), ttlMs });
	}

	/**
	 * Removes all entries from the cache.
	 */
	clear(): void {
		this._entries.clear();
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
}
