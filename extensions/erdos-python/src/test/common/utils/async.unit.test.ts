// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import { chain, createDeferred, flattenIterator } from '../../../client/common/utils/async';

suite('Deferred', () => {
    test('Resolve', (done) => {
        const valueToSent = new Date().getTime();
        const def = createDeferred<number>();
        def.promise
            .then((value) => {
                assert.strictEqual(value, valueToSent);
                assert.strictEqual(def.resolved, true, 'resolved property value is not `true`');
            })
            .then(done)
            .catch(done);

        assert.strictEqual(def.resolved, false, 'Promise is resolved even when it should not be');
        assert.strictEqual(def.rejected, false, 'Promise is rejected even when it should not be');
        assert.strictEqual(def.completed, false, 'Promise is completed even when it should not be');

        def.resolve(valueToSent);

        assert.strictEqual(def.resolved, true, 'Promise is not resolved even when it should not be');
        assert.strictEqual(def.rejected, false, 'Promise is rejected even when it should not be');
        assert.strictEqual(def.completed, true, 'Promise is not completed even when it should not be');
    });
    test('Reject', (done) => {
        const errorToSend = new Error('Something');
        const def = createDeferred<number>();
        def.promise
            .then((value) => {
                assert.fail(value, 'Error', 'Was expecting promise to get rejected, however it was resolved', '');
                done();
            })
            .catch((reason) => {
                assert.strictEqual(reason, errorToSend, 'Error received is not the same');
                done();
            })
            .catch(done);

        assert.strictEqual(def.resolved, false, 'Promise is resolved even when it should not be');
        assert.strictEqual(def.rejected, false, 'Promise is rejected even when it should not be');
        assert.strictEqual(def.completed, false, 'Promise is completed even when it should not be');

        def.reject(errorToSend);

        assert.strictEqual(def.resolved, false, 'Promise is resolved even when it should not be');
        assert.strictEqual(def.rejected, true, 'Promise is not rejected even when it should not be');
        assert.strictEqual(def.completed, true, 'Promise is not completed even when it should not be');
    });
});

suite('chain async iterators', () => {
    const flatten = flattenIterator;

    test('no iterators', async () => {
        const expected: string[] = [];

        const results = await flatten(chain([]));

        assert.deepEqual(results, expected);
    });

    test('one iterator, one item', async () => {
        const expected = ['foo'];
        const it = (async function* () {
            yield 'foo';
        })();

        const results = await flatten(chain([it]));

        assert.deepEqual(results, expected);
    });

    test('one iterator, many items', async () => {
        const expected = ['foo', 'bar', 'baz'];
        const it = (async function* () {
            yield* expected;
        })();

        const results = await flatten(chain([it]));

        assert.deepEqual(results, expected);
    });

    test('one iterator, no items', async () => {
        const deferred = createDeferred<void>();
        // eslint-disable-next-line require-yield
        const it = (async function* () {
            deferred.resolve();
        })();

        const results = await flatten(chain([it]));

        assert.deepEqual(results, []);
        // Make sure chain() actually used up the iterator,
        // even through it didn't yield anything.
        assert.ok(deferred.resolved);
    });

    test('many iterators, one item each', async () => {
        // For deterministic results we must control when each iterator starts.
        const deferred12 = createDeferred<void>();
        const deferred23 = createDeferred<void>();
        const expected = ['a', 'b', 'c'];
        const it1 = (async function* () {
            yield 'a';
            deferred12.resolve();
        })();
        const it2 = (async function* () {
            await deferred12.promise;
            yield 'b';
            deferred23.resolve();
        })();
        const it3 = (async function* () {
            await deferred23.promise;
            yield 'c';
        })();

        const results = await flatten(chain([it1, it2, it3]));

        assert.deepEqual(results, expected);
    });

    test('many iterators, many items each', async () => {
        // For deterministic results we must control when each iterator starts.
        const deferred12 = createDeferred<void>();
        const deferred23 = createDeferred<void>();
        const expected = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'];
        const it1 = (async function* () {
            yield 'a1';
            yield 'a2';
            yield 'a3';
            deferred12.resolve();
        })();
        const it2 = (async function* () {
            await deferred12.promise;
            yield 'b1';
            yield 'b2';
            yield 'b3';
            deferred23.resolve();
        })();
        const it3 = (async function* () {
            await deferred23.promise;
            yield 'c1';
            yield 'c2';
            yield 'c3';
        })();

        const results = await flatten(chain([it1, it2, it3]));

        assert.deepEqual(results, expected);
    });

    test('many iterators, one empty', async () => {
        // For deterministic results we must control when each iterator starts.
        const deferred12 = createDeferred<void>();
        const deferred23 = createDeferred<void>();
        const expected = ['a', 'c'];
        const it1 = (async function* () {
            yield 'a';
            deferred12.resolve();
        })();
        // eslint-disable-next-line require-yield
        const it2 = (async function* () {
            await deferred12.promise;
            // We do not yield anything.
            deferred23.resolve();
        })();
        const it3 = (async function* () {
            await deferred23.promise;
            yield 'c';
        })();
        const empty = it2;

        const results = await flatten(chain([it1, empty, it3]));

        assert.deepEqual(results, expected);
    });

    test('Results are yielded as soon as ready, regardless of source iterator.', async () => {
        // For deterministic results we must control when each iterator starts.
        const deferred24 = createDeferred<void>();
        const deferred41 = createDeferred<void>();
        const deferred13 = createDeferred<void>();
        const deferred35 = createDeferred<void>();
        const deferred56 = createDeferred<void>();
        const expected = ['b', 'd', 'a', 'c', 'e', 'f'];
        const it1 = (async function* () {
            await deferred41.promise;
            yield 'a';
            deferred13.resolve();
        })();
        const it2 = (async function* () {
            yield 'b';
            deferred24.resolve();
        })();
        const it3 = (async function* () {
            await deferred13.promise;
            yield 'c';
            deferred35.resolve();
        })();
        const it4 = (async function* () {
            await deferred24.promise;
            yield 'd';
            deferred41.resolve();
        })();
        const it5 = (async function* () {
            await deferred35.promise;
            yield 'e';
            deferred56.resolve();
        })();
        const it6 = (async function* () {
            await deferred56.promise;
            yield 'f';
        })();

        const results = await flatten(chain([it1, it2, it3, it4, it5, it6]));

        assert.deepEqual(results, expected);
    });

    test('A failed iterator does not block the others, with onError.', async () => {
        // For deterministic results we must control when each iterator starts.
        const deferred12 = createDeferred<void>();
        const deferred23 = createDeferred<void>();
        const expected = ['a', 'b', 'c'];
        const it1 = (async function* () {
            yield 'a';
            deferred12.resolve();
        })();
        const failure = new Error('uh-oh!');
        const it2 = (async function* () {
            await deferred12.promise;
            yield 'b';
            throw failure;
        })();
        const it3 = (async function* () {
            await deferred23.promise;
            yield 'c';
        })();
        const fails = it2;
        let gotErr: { err: Error; index: number } | undefined;
        async function onError(err: Error, index: number) {
            gotErr = { err, index };
            deferred23.resolve();
        }

        const results = await flatten(chain([it1, fails, it3], onError));

        assert.deepEqual(results, expected);
        assert.deepEqual(gotErr, { err: failure, index: 1 });
    });

    test('A failed iterator does not block the others, without onError.', async () => {
        // If this test fails then it will likely fail intermittently.
        // For (mostly) deterministic results we must control when each iterator starts.
        const deferred12 = createDeferred<void>();
        const deferred23 = createDeferred<void>();
        const expected = ['a', 'b', 'c'];
        const it1 = (async function* () {
            yield 'a';
            deferred12.resolve();
        })();
        const failure = new Error('uh-oh!');
        const it2 = (async function* () {
            await deferred12.promise;
            yield 'b';
            deferred23.resolve();
            // This is ignored by chain() since we did not provide onError().
            throw failure;
        })();
        const it3 = (async function* () {
            await deferred23.promise;
            yield 'c';
        })();
        const fails = it2;

        const results = await flatten(chain([it1, fails, it3]));

        assert.deepEqual(results, expected);
    });

    test('A failed iterator does not block the others, if throwing before yielding.', async () => {
        // If this test fails then it will likely fail intermittently.
        // For (mostly) deterministic results we must control when each iterator starts.
        const deferred12 = createDeferred<void>();
        const deferred23 = createDeferred<void>();
        const expected = ['a', 'c'];
        const it1 = (async function* () {
            yield 'a';
            deferred12.resolve();
        })();
        const failure = new Error('uh-oh!');
        const it2 = (async function* () {
            await deferred12.promise;
            deferred23.resolve();
            throw failure;
            yield 'b';
        })();
        const it3 = (async function* () {
            await deferred23.promise;
            yield 'c';
        })();
        const fails = it2;

        const results = await flatten(chain([it1, fails, it3]));

        assert.deepEqual(results, expected);
    });

    test('int results', async () => {
        const expected = [42, 7, 11, 13];
        const it = (async function* () {
            yield 42;
            yield* [7, 11, 13];
        })();

        const results = await flatten(chain([it]));

        assert.deepEqual(results, expected);
    });

    test('object results', async () => {
        type Result = {
            value: string;
        };
        const expected: Result[] = [
            // We don't need anything special here.
            { value: 'foo' },
            { value: 'bar' },
            { value: 'baz' },
        ];
        const it = (async function* () {
            yield* expected;
        })();

        const results = await flatten(chain([it]));

        assert.deepEqual(results, expected);
    });
});
