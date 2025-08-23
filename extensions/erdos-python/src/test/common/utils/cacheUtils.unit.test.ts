// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert } from 'chai';
import * as sinon from 'sinon';
import { InMemoryCache } from '../../../client/common/utils/cacheUtils';

suite('Common Utils - CacheUtils', () => {
    suite('InMemory Cache', () => {
        let clock: sinon.SinonFakeTimers;
        setup(() => {
            clock = sinon.useFakeTimers();
        });
        teardown(() => clock.restore());
        test('Cached item should exist', () => {
            const cache = new InMemoryCache(5_000);
            cache.data = 'Hello World';

            assert.strictEqual(cache.data, 'Hello World');
            assert.isOk(cache.hasData);
        });
        test('Cached item can be updated and should exist', () => {
            const cache = new InMemoryCache(5_000);
            cache.data = 'Hello World';

            assert.strictEqual(cache.data, 'Hello World');
            assert.isOk(cache.hasData);

            cache.data = 'Bye';

            assert.strictEqual(cache.data, 'Bye');
            assert.isOk(cache.hasData);
        });
        test('Cached item should not exist after time expires', () => {
            const cache = new InMemoryCache(5_000);
            cache.data = 'Hello World';

            assert.strictEqual(cache.data, 'Hello World');
            assert.isTrue(cache.hasData);

            // Should not expire after 4.999s.
            clock.tick(4_999);

            assert.strictEqual(cache.data, 'Hello World');
            assert.isTrue(cache.hasData);

            // Should expire after 5s (previous 4999ms + 1ms).
            clock.tick(1);

            assert.strictEqual(cache.data, undefined);
            assert.isFalse(cache.hasData);
        });
    });
});
