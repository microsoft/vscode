// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const globalCacheStore = new Map<string, { expiry: number; data: any }>();

// Gets a cache store to be used to store return values of methods or any other.
export function getGlobalCacheStore() {
    return globalCacheStore;
}

export function getCacheKeyFromFunctionArgs(keyPrefix: string, fnArgs: any[]): string {
    const argsKey = fnArgs.map((arg) => `${JSON.stringify(arg)}`).join('-Arg-Separator-');
    return `KeyPrefix=${keyPrefix}-Args=${argsKey}`;
}

export function clearCache() {
    globalCacheStore.clear();
}

type CacheData<T> = {
    value: T;
    expiry: number;
};

/**
 * InMemoryCache caches a single value up until its expiry.
 */
export class InMemoryCache<T> {
    private cacheData?: CacheData<T>;

    constructor(protected readonly expiryDurationMs: number) {}
    public get hasData() {
        if (!this.cacheData || this.hasExpired(this.cacheData.expiry)) {
            this.cacheData = undefined;
            return false;
        }
        return true;
    }
    /**
     * Returns undefined if there is no data.
     * Uses `hasData` to determine whether any cached data exists.
     *
     * @readonly
     * @type {(T | undefined)}
     * @memberof InMemoryCache
     */
    public get data(): T | undefined {
        if (!this.hasData) {
            return;
        }
        return this.cacheData?.value;
    }
    public set data(value: T | undefined) {
        if (value !== undefined) {
            this.cacheData = {
                expiry: this.calculateExpiry(),
                value,
            };
        } else {
            this.cacheData = undefined;
        }
    }
    public clear() {
        this.cacheData = undefined;
    }

    /**
     * Has this data expired?
     * (protected class member to allow for reliable non-data-time-based testing)
     *
     * @param expiry The date to be tested for expiry.
     * @returns true if the data expired, false otherwise.
     */
    protected hasExpired(expiry: number): boolean {
        return expiry <= Date.now();
    }

    /**
     * When should this data item expire?
     * (protected class method to allow for reliable non-data-time-based testing)
     *
     * @returns number representing the expiry time for this item.
     */
    protected calculateExpiry(): number {
        return Date.now() + this.expiryDurationMs;
    }
}
