/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LRUCache } from '../../../base/common/map.js';
import { extUriIgnorePathCase } from '../../../base/common/resources.js';
/**
 * A cache for web content extraction results.
 */
export class WebContentCache {
    constructor() {
        this._cache = new LRUCache(WebContentCache.MAX_CACHE_SIZE);
    }
    static { this.MAX_CACHE_SIZE = 1000; }
    static { this.SUCCESS_CACHE_DURATION = 1000 * 60 * 60 * 24; } // 24 hours
    static { this.ERROR_CACHE_DURATION = 1000 * 60 * 5; } // 5 minutes
    /**
     * Add a web content extraction result to the cache.
     */
    add(uri, options, result) {
        let expiration;
        switch (result.status) {
            case 'ok':
            case 'redirect':
                expiration = Date.now() + WebContentCache.SUCCESS_CACHE_DURATION;
                break;
            default:
                expiration = Date.now() + WebContentCache.ERROR_CACHE_DURATION;
                break;
        }
        const key = WebContentCache.getKey(uri, options);
        this._cache.set(key, { result, options, expiration });
    }
    /**
     * Try to get a cached web content extraction result for the given URI and options.
     */
    tryGet(uri, options) {
        const key = WebContentCache.getKey(uri, options);
        const entry = this._cache.get(key);
        if (entry === undefined) {
            return undefined;
        }
        if (entry.expiration < Date.now()) {
            this._cache.delete(key);
            return undefined;
        }
        return entry.result;
    }
    static getKey(uri, options) {
        return `${!!options?.followRedirects}${extUriIgnorePathCase.getComparisonKey(uri)}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViQ29udGVudENhY2hlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd2ViQ29udGVudEV4dHJhY3Rvci9lbGVjdHJvbi1tYWluL3dlYkNvbnRlbnRDYWNoZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFVekU7O0dBRUc7QUFDSCxNQUFNLE9BQU8sZUFBZTtJQUE1QjtRQUtrQixXQUFNLEdBQUcsSUFBSSxRQUFRLENBQXFCLGVBQWUsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQTBDNUYsQ0FBQzthQTlDd0IsbUJBQWMsR0FBRyxJQUFJLEFBQVAsQ0FBUTthQUN0QiwyQkFBc0IsR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEFBQXRCLENBQXVCLEdBQUMsV0FBVzthQUN6RCx5QkFBb0IsR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLENBQUMsQUFBaEIsQ0FBaUIsR0FBQyxZQUFZO0lBSTFFOztPQUVHO0lBQ0ksR0FBRyxDQUFDLEdBQVEsRUFBRSxPQUFnRCxFQUFFLE1BQStCO1FBQ3JHLElBQUksVUFBa0IsQ0FBQztRQUN2QixRQUFRLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN2QixLQUFLLElBQUksQ0FBQztZQUNWLEtBQUssVUFBVTtnQkFDZCxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQztnQkFDakUsTUFBTTtZQUNQO2dCQUNDLFVBQVUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsZUFBZSxDQUFDLG9CQUFvQixDQUFDO2dCQUMvRCxNQUFNO1FBQ1IsQ0FBQztRQUVELE1BQU0sR0FBRyxHQUFHLGVBQWUsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQ7O09BRUc7SUFDSSxNQUFNLENBQUMsR0FBUSxFQUFFLE9BQWdEO1FBQ3ZFLE1BQU0sR0FBRyxHQUFHLGVBQWUsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ25DLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3pCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLEtBQUssQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7WUFDbkMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDeEIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDLE1BQU0sQ0FBQztJQUNyQixDQUFDO0lBRU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFRLEVBQUUsT0FBZ0Q7UUFDL0UsT0FBTyxHQUFHLENBQUMsQ0FBQyxPQUFPLEVBQUUsZUFBZSxHQUFHLG9CQUFvQixDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7SUFDckYsQ0FBQyJ9