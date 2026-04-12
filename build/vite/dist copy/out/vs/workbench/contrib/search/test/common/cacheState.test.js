/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as errors from '../../../../../base/common/errors.js';
import { FileQueryCacheState } from '../../common/cacheState.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('FileQueryCacheState', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('reuse old cacheKey until new cache is loaded', async function () {
        const cache = new MockCache();
        const first = createCacheState(cache);
        const firstKey = first.cacheKey;
        assert.strictEqual(first.isLoaded, false);
        assert.strictEqual(first.isUpdating, false);
        first.load();
        assert.strictEqual(first.isLoaded, false);
        assert.strictEqual(first.isUpdating, true);
        await cache.loading[firstKey].complete(null);
        assert.strictEqual(first.isLoaded, true);
        assert.strictEqual(first.isUpdating, false);
        const second = createCacheState(cache, first);
        second.load();
        assert.strictEqual(second.isLoaded, true);
        assert.strictEqual(second.isUpdating, true);
        await cache.awaitDisposal(0);
        assert.strictEqual(second.cacheKey, firstKey); // still using old cacheKey
        const secondKey = cache.cacheKeys[1];
        await cache.loading[secondKey].complete(null);
        assert.strictEqual(second.isLoaded, true);
        assert.strictEqual(second.isUpdating, false);
        await cache.awaitDisposal(1);
        assert.strictEqual(second.cacheKey, secondKey);
    });
    test('do not spawn additional load if previous is still loading', async function () {
        const cache = new MockCache();
        const first = createCacheState(cache);
        const firstKey = first.cacheKey;
        first.load();
        assert.strictEqual(first.isLoaded, false);
        assert.strictEqual(first.isUpdating, true);
        assert.strictEqual(Object.keys(cache.loading).length, 1);
        const second = createCacheState(cache, first);
        second.load();
        assert.strictEqual(second.isLoaded, false);
        assert.strictEqual(second.isUpdating, true);
        assert.strictEqual(cache.cacheKeys.length, 2);
        assert.strictEqual(Object.keys(cache.loading).length, 1); // still only one loading
        assert.strictEqual(second.cacheKey, firstKey);
        await cache.loading[firstKey].complete(null);
        assert.strictEqual(second.isLoaded, true);
        assert.strictEqual(second.isUpdating, false);
        await cache.awaitDisposal(0);
    });
    test('do not use previous cacheKey if query changed', async function () {
        const cache = new MockCache();
        const first = createCacheState(cache);
        const firstKey = first.cacheKey;
        first.load();
        await cache.loading[firstKey].complete(null);
        assert.strictEqual(first.isLoaded, true);
        assert.strictEqual(first.isUpdating, false);
        await cache.awaitDisposal(0);
        cache.baseQuery.excludePattern = { '**/node_modules': true };
        const second = createCacheState(cache, first);
        assert.strictEqual(second.isLoaded, false);
        assert.strictEqual(second.isUpdating, false);
        await cache.awaitDisposal(1);
        second.load();
        assert.strictEqual(second.isLoaded, false);
        assert.strictEqual(second.isUpdating, true);
        assert.notStrictEqual(second.cacheKey, firstKey); // not using old cacheKey
        const secondKey = cache.cacheKeys[1];
        assert.strictEqual(second.cacheKey, secondKey);
        await cache.loading[secondKey].complete(null);
        assert.strictEqual(second.isLoaded, true);
        assert.strictEqual(second.isUpdating, false);
        await cache.awaitDisposal(1);
    });
    test('dispose propagates', async function () {
        const cache = new MockCache();
        const first = createCacheState(cache);
        const firstKey = first.cacheKey;
        first.load();
        await cache.loading[firstKey].complete(null);
        const second = createCacheState(cache, first);
        assert.strictEqual(second.isLoaded, true);
        assert.strictEqual(second.isUpdating, false);
        await cache.awaitDisposal(0);
        second.dispose();
        assert.strictEqual(second.isLoaded, false);
        assert.strictEqual(second.isUpdating, false);
        await cache.awaitDisposal(1);
        assert.ok(cache.disposing[firstKey]);
    });
    test('keep using old cacheKey when loading fails', async function () {
        const cache = new MockCache();
        const first = createCacheState(cache);
        const firstKey = first.cacheKey;
        first.load();
        await cache.loading[firstKey].complete(null);
        const second = createCacheState(cache, first);
        second.load();
        const secondKey = cache.cacheKeys[1];
        const origErrorHandler = errors.errorHandler.getUnexpectedErrorHandler();
        try {
            errors.setUnexpectedErrorHandler(() => null);
            await cache.loading[secondKey].error('loading failed');
        }
        finally {
            errors.setUnexpectedErrorHandler(origErrorHandler);
        }
        assert.strictEqual(second.isLoaded, true);
        assert.strictEqual(second.isUpdating, false);
        assert.strictEqual(Object.keys(cache.loading).length, 2);
        await cache.awaitDisposal(0);
        assert.strictEqual(second.cacheKey, firstKey); // keep using old cacheKey
        const third = createCacheState(cache, second);
        third.load();
        assert.strictEqual(third.isLoaded, true);
        assert.strictEqual(third.isUpdating, true);
        assert.strictEqual(Object.keys(cache.loading).length, 3);
        await cache.awaitDisposal(0);
        assert.strictEqual(third.cacheKey, firstKey);
        const thirdKey = cache.cacheKeys[2];
        await cache.loading[thirdKey].complete(null);
        assert.strictEqual(third.isLoaded, true);
        assert.strictEqual(third.isUpdating, false);
        assert.strictEqual(Object.keys(cache.loading).length, 3);
        await cache.awaitDisposal(2);
        assert.strictEqual(third.cacheKey, thirdKey); // recover with next successful load
    });
    function createCacheState(cache, previous) {
        return new FileQueryCacheState(cacheKey => cache.query(cacheKey), query => cache.load(query), cacheKey => cache.dispose(cacheKey), previous);
    }
    class MockCache {
        constructor() {
            this.cacheKeys = [];
            this.loading = {};
            this.disposing = {};
            this._awaitDisposal = [];
            this.baseQuery = {
                type: 1 /* QueryType.File */,
                folderQueries: []
            };
        }
        query(cacheKey) {
            this.cacheKeys.push(cacheKey);
            return Object.assign({ cacheKey: cacheKey }, this.baseQuery);
        }
        load(query) {
            const promise = new DeferredPromise();
            this.loading[query.cacheKey] = promise;
            return promise.p;
        }
        dispose(cacheKey) {
            const promise = new DeferredPromise();
            this.disposing[cacheKey] = promise;
            const n = Object.keys(this.disposing).length;
            for (const done of this._awaitDisposal[n] || []) {
                done();
            }
            delete this._awaitDisposal[n];
            return promise.p;
        }
        awaitDisposal(n) {
            return new Promise(resolve => {
                if (n === Object.keys(this.disposing).length) {
                    resolve();
                }
                else {
                    (this._awaitDisposal[n] || (this._awaitDisposal[n] = [])).push(resolve);
                }
            });
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FjaGVTdGF0ZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL3Rlc3QvY29tbW9uL2NhY2hlU3RhdGUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxLQUFLLE1BQU0sTUFBTSxzQ0FBc0MsQ0FBQztBQUUvRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsS0FBSyxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtJQUVqQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxLQUFLO1FBRXpELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxFQUFFLENBQUM7UUFFOUIsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdEMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztRQUNoQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRTVDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNiLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFM0MsTUFBTSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRTVDLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDZCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVDLE1BQU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3QixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQywyQkFBMkI7UUFFMUUsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsTUFBTSxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNoRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyREFBMkQsRUFBRSxLQUFLO1FBRXRFLE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxFQUFFLENBQUM7UUFFOUIsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdEMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztRQUNoQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDYixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXpELE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDZCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyx5QkFBeUI7UUFDbkYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTlDLE1BQU0sS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3QyxNQUFNLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDOUIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUUsS0FBSztRQUUxRCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBRTlCLE1BQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7UUFDaEMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2IsTUFBTSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzVDLE1BQU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU3QixLQUFLLENBQUMsU0FBUyxDQUFDLGNBQWMsR0FBRyxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxDQUFDO1FBQzdELE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdDLE1BQU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU3QixNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDZCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLHlCQUF5QjtRQUMzRSxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUUvQyxNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsTUFBTSxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEtBQUs7UUFFL0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUU5QixNQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN0QyxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO1FBQ2hDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNiLE1BQU0sS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0MsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsTUFBTSxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTdCLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNqQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdDLE1BQU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3QixNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxLQUFLO1FBRXZELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxFQUFFLENBQUM7UUFFOUIsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdEMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztRQUNoQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDYixNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTdDLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDZCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBQ3pFLElBQUksQ0FBQztZQUNKLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM3QyxNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDeEQsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsTUFBTSxDQUFDLHlCQUF5QixDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDcEQsQ0FBQztRQUNELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekQsTUFBTSxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLDBCQUEwQjtRQUV6RSxNQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDOUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6RCxNQUFNLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTdDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEMsTUFBTSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3QixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxvQ0FBb0M7SUFDbkYsQ0FBQyxDQUFDLENBQUM7SUFFSCxTQUFTLGdCQUFnQixDQUFDLEtBQWdCLEVBQUUsUUFBOEI7UUFDekUsT0FBTyxJQUFJLG1CQUFtQixDQUM3QixRQUFRLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQ2pDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFDMUIsUUFBUSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUNuQyxRQUFRLENBQ1IsQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLFNBQVM7UUFBZjtZQUVRLGNBQVMsR0FBYSxFQUFFLENBQUM7WUFDekIsWUFBTyxHQUFpRCxFQUFFLENBQUM7WUFDM0QsY0FBUyxHQUFrRCxFQUFFLENBQUM7WUFFN0QsbUJBQWMsR0FBcUIsRUFBRSxDQUFDO1lBRXZDLGNBQVMsR0FBZTtnQkFDOUIsSUFBSSx3QkFBZ0I7Z0JBQ3BCLGFBQWEsRUFBRSxFQUFFO2FBQ2pCLENBQUM7UUFpQ0gsQ0FBQztRQS9CTyxLQUFLLENBQUMsUUFBZ0I7WUFDNUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDOUIsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM5RCxDQUFDO1FBRU0sSUFBSSxDQUFDLEtBQWlCO1lBQzVCLE1BQU0sT0FBTyxHQUFHLElBQUksZUFBZSxFQUFPLENBQUM7WUFDM0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUyxDQUFDLEdBQUcsT0FBTyxDQUFDO1lBQ3hDLE9BQU8sT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNsQixDQUFDO1FBRU0sT0FBTyxDQUFDLFFBQWdCO1lBQzlCLE1BQU0sT0FBTyxHQUFHLElBQUksZUFBZSxFQUFRLENBQUM7WUFDNUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxPQUFPLENBQUM7WUFDbkMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQzdDLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztnQkFDakQsSUFBSSxFQUFFLENBQUM7WUFDUixDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlCLE9BQU8sT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNsQixDQUFDO1FBRU0sYUFBYSxDQUFDLENBQVM7WUFDN0IsT0FBTyxJQUFJLE9BQU8sQ0FBTyxPQUFPLENBQUMsRUFBRTtnQkFDbEMsSUFBSSxDQUFDLEtBQUssTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQzlDLE9BQU8sRUFBRSxDQUFDO2dCQUNYLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN6RSxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO0tBQ0Q7QUFDRixDQUFDLENBQUMsQ0FBQyJ9