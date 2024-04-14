/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';

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

/**
 * Uses a LRU cache to make a given parametrized function cached.
 * Caches just the last value.
*/
export class LRUCachedFunction<TArg, TComputed> {
	private lastCache: TComputed | undefined = undefined;
	private lastArgKey: unknown | undefined = undefined;

	constructor(
		private readonly fn: (arg: TArg) => TComputed,
		private readonly _computeKey: (arg: TArg) => unknown = JSON.stringify,
	) {
	}

	public get(arg: TArg): TComputed {
		const key = this._computeKey(arg);
		if (this.lastArgKey !== key) {
			this.lastArgKey = key;
			this.lastCache = this.fn(arg);
		}
		return this.lastCache!;
	}
}

/**
 * Uses an unbounded cache (referential equality) to memoize the results of the given function.
*/
export class CachedFunction<TArg, TValue> {
	private readonly _map = new Map<TArg, TValue>();
	public get cachedValues(): ReadonlyMap<TArg, TValue> {
		return this._map;
	}

	constructor(private readonly fn: (arg: TArg) => TValue) { }

	public get(arg: TArg): TValue {
		if (this._map.has(arg)) {
			return this._map.get(arg)!;
		}
		const value = this.fn(arg);
		this._map.set(arg, value);
		return value;
	}
}
