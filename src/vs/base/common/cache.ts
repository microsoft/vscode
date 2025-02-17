/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from './cancellation.js';
import { IDisposable } from './lifecycle.js';

export interface CacheResult<T> extends IDisposable {
	promise: Promise<T>;
}

export class Cache<T> {

	private result: CacheResult<T> | null = null;
	constructor(private task: (ct: CancellationToken) => Promise<T>) { }

	get(): CacheResult<T> {
		if (this.result) {
			return this.result;
		}

		const cts = new CancellationTokenSource();
		const promise = this.task(cts.token);

		this.result = {
			promise,
			dispose: () => {
				this.result = null;
				cts.cancel();
				cts.dispose();
			}
		};

		return this.result;
	}
}

export function identity<T>(t: T): T {
	return t;
}

interface ICacheOptions<TArg> {
	/**
	 * The cache key is used to identify the cache entry.
	 * Strict equality is used to compare cache keys.
	*/
	getCacheKey: (arg: TArg) => unknown;
}

/**
 * Uses a LRU cache to make a given parametrized function cached.
 * Caches just the last key/value.
*/
export class LRUCachedFunction<TArg, TComputed> {
	private lastCache: TComputed | undefined = undefined;
	private lastArgKey: unknown | undefined = undefined;

	private readonly _fn: (arg: TArg) => TComputed;
	private readonly _computeKey: (arg: TArg) => unknown;

	constructor(fn: (arg: TArg) => TComputed);
	constructor(options: ICacheOptions<TArg>, fn: (arg: TArg) => TComputed);
	constructor(arg1: ICacheOptions<TArg> | ((arg: TArg) => TComputed), arg2?: (arg: TArg) => TComputed) {
		if (typeof arg1 === 'function') {
			this._fn = arg1;
			this._computeKey = identity;
		} else {
			this._fn = arg2!;
			this._computeKey = arg1.getCacheKey;
		}
	}

	public get(arg: TArg): TComputed {
		const key = this._computeKey(arg);
		if (this.lastArgKey !== key) {
			this.lastArgKey = key;
			this.lastCache = this._fn(arg);
		}
		return this.lastCache!;
	}
}

/**
 * Uses an unbounded cache to memoize the results of the given function.
*/
export class CachedFunction<TArg, TComputed> {
	private readonly _map = new Map<TArg, TComputed>();
	private readonly _map2 = new Map<unknown, TComputed>();
	public get cachedValues(): ReadonlyMap<TArg, TComputed> {
		return this._map;
	}

	private readonly _fn: (arg: TArg) => TComputed;
	private readonly _computeKey: (arg: TArg) => unknown;

	constructor(fn: (arg: TArg) => TComputed);
	constructor(options: ICacheOptions<TArg>, fn: (arg: TArg) => TComputed);
	constructor(arg1: ICacheOptions<TArg> | ((arg: TArg) => TComputed), arg2?: (arg: TArg) => TComputed) {
		if (typeof arg1 === 'function') {
			this._fn = arg1;
			this._computeKey = identity;
		} else {
			this._fn = arg2!;
			this._computeKey = arg1.getCacheKey;
		}
	}

	public get(arg: TArg): TComputed {
		const key = this._computeKey(arg);
		if (this._map2.has(key)) {
			return this._map2.get(key)!;
		}

		const value = this._fn(arg);
		this._map.set(arg, value);
		this._map2.set(key, value);
		return value;
	}
}
