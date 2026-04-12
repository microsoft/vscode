"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cache = void 0;
class CacheEntry {
    lastFetch = 0;
    promise = undefined;
    value = undefined;
    isInitialized = false;
    get isFetching() {
        return !!this.promise;
    }
    async fetchSync(run) {
        this.lastFetch = Date.now();
        this.promise = run();
        this.value = await this.promise;
        if (!this.isInitialized) {
            this.isInitialized = true;
        }
        this.promise = undefined;
        return this.value;
    }
    async fetchAsync(run) {
        if (this.isFetching) {
            await this.promise;
            return this.value;
        }
        return this.fetchSync(run);
    }
    async maxAgeCache(run, maxAge) {
        if (Date.now() > maxAge + this.lastFetch) {
            return this.fetchAsync(run);
        }
        return this.value;
    }
    async swrCache(run, maxAge = 0) {
        if (!this.isFetching && Date.now() > this.lastFetch + maxAge) {
            return this.fetchAsync(run);
        }
        return this.value;
    }
    async entry(run, cache) {
        if (!this.isInitialized) {
            return this.fetchAsync(run);
        }
        switch (cache.strategy || 'stale-while-revalidate') {
            case 'max-age':
                return this.maxAgeCache(run, cache.ttl);
            case 'stale-while-revalidate':
                // cache.ttl must be defined when no strategy is specified
                return this.swrCache(run, cache.ttl);
            default:
                return this.fetchAsync(run);
        }
    }
}
class Cache {
    cache = new Map();
    async entry(key, run, cache) {
        if (!this.cache.has(key)) {
            this.cache.set(key, new CacheEntry());
        }
        return this.cache.get(key).entry(run, cache);
    }
    currentValue(key, _cache) {
        if (!this.cache.has(key)) {
            this.cache.set(key, new CacheEntry());
        }
        return this.cache.get(key).value;
    }
    clear() {
        this.cache.clear();
    }
}
exports.Cache = Cache;
//# sourceMappingURL=cache.js.map