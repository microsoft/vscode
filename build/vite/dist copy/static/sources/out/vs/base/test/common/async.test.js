/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as async from '../../common/async.js';
import * as MicrotaskDelay from '../../common/symbols.js';
import { CancellationTokenSource } from '../../common/cancellation.js';
import { isCancellationError } from '../../common/errors.js';
import { Event } from '../../common/event.js';
import { URI } from '../../common/uri.js';
import { runWithFakedTimers } from './timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { DisposableStore } from '../../common/lifecycle.js';
import { Iterable } from '../../common/iterator.js';
suite('Async', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    suite('cancelablePromise', function () {
        test('set token, don\'t wait for inner promise', function () {
            let canceled = 0;
            const promise = async.createCancelablePromise(token => {
                store.add(token.onCancellationRequested(_ => { canceled += 1; }));
                return new Promise(resolve => { });
            });
            const result = promise.then(_ => assert.ok(false), err => {
                assert.strictEqual(canceled, 1);
                assert.ok(isCancellationError(err));
            });
            promise.cancel();
            promise.cancel(); // cancel only once
            return result;
        });
        test('cancel despite inner promise being resolved', function () {
            let canceled = 0;
            const promise = async.createCancelablePromise(token => {
                store.add(token.onCancellationRequested(_ => { canceled += 1; }));
                return Promise.resolve(1234);
            });
            const result = promise.then(_ => assert.ok(false), err => {
                assert.strictEqual(canceled, 1);
                assert.ok(isCancellationError(err));
            });
            promise.cancel();
            return result;
        });
        test('cancel disposes result', function () {
            const store = new DisposableStore();
            const promise = async.createCancelablePromise(async (token) => {
                return store;
            });
            promise.then(_ => assert.ok(false), err => {
                assert.ok(isCancellationError(err));
                assert.ok(store.isDisposed);
            });
            promise.cancel();
        });
        // Cancelling a sync cancelable promise will fire the cancelled token.
        // Also, every `then` callback runs in another execution frame.
        test('execution order (sync)', function () {
            const order = [];
            const cancellablePromise = async.createCancelablePromise(token => {
                order.push('in callback');
                store.add(token.onCancellationRequested(_ => order.push('cancelled')));
                return Promise.resolve(1234);
            });
            order.push('afterCreate');
            const promise = cancellablePromise
                .then(undefined, err => null)
                .then(() => order.push('finally'));
            cancellablePromise.cancel();
            order.push('afterCancel');
            return promise.then(() => assert.deepStrictEqual(order, ['in callback', 'afterCreate', 'cancelled', 'afterCancel', 'finally']));
        });
        // Cancelling an async cancelable promise is just the same as a sync cancellable promise.
        test('execution order (async)', function () {
            const order = [];
            const cancellablePromise = async.createCancelablePromise(token => {
                order.push('in callback');
                store.add(token.onCancellationRequested(_ => order.push('cancelled')));
                return new Promise(c => setTimeout(c.bind(1234), 0));
            });
            order.push('afterCreate');
            const promise = cancellablePromise
                .then(undefined, err => null)
                .then(() => order.push('finally'));
            cancellablePromise.cancel();
            order.push('afterCancel');
            return promise.then(() => assert.deepStrictEqual(order, ['in callback', 'afterCreate', 'cancelled', 'afterCancel', 'finally']));
        });
        test('execution order (async with late listener)', async function () {
            const order = [];
            const cancellablePromise = async.createCancelablePromise(async (token) => {
                order.push('in callback');
                await async.timeout(0);
                store.add(token.onCancellationRequested(_ => order.push('cancelled')));
                cancellablePromise.cancel();
                order.push('afterCancel');
            });
            order.push('afterCreate');
            const promise = cancellablePromise
                .then(undefined, err => null)
                .then(() => order.push('finally'));
            return promise.then(() => assert.deepStrictEqual(order, ['in callback', 'afterCreate', 'cancelled', 'afterCancel', 'finally']));
        });
        test('get inner result', async function () {
            const promise = async.createCancelablePromise(token => {
                return async.timeout(12).then(_ => 1234);
            });
            const result = await promise;
            assert.strictEqual(result, 1234);
        });
    });
    suite('Throttler', function () {
        test('non async', function () {
            let count = 0;
            const factory = () => {
                return Promise.resolve(++count);
            };
            const throttler = new async.Throttler();
            return Promise.all([
                throttler.queue(factory).then((result) => { assert.strictEqual(result, 1); }),
                throttler.queue(factory).then((result) => { assert.strictEqual(result, 2); }),
                throttler.queue(factory).then((result) => { assert.strictEqual(result, 2); }),
                throttler.queue(factory).then((result) => { assert.strictEqual(result, 2); }),
                throttler.queue(factory).then((result) => { assert.strictEqual(result, 2); })
            ]).then(() => assert.strictEqual(count, 2));
        });
        test('async', () => {
            let count = 0;
            const factory = () => async.timeout(0).then(() => ++count);
            const throttler = new async.Throttler();
            return Promise.all([
                throttler.queue(factory).then((result) => { assert.strictEqual(result, 1); }),
                throttler.queue(factory).then((result) => { assert.strictEqual(result, 2); }),
                throttler.queue(factory).then((result) => { assert.strictEqual(result, 2); }),
                throttler.queue(factory).then((result) => { assert.strictEqual(result, 2); }),
                throttler.queue(factory).then((result) => { assert.strictEqual(result, 2); })
            ]).then(() => {
                return Promise.all([
                    throttler.queue(factory).then((result) => { assert.strictEqual(result, 3); }),
                    throttler.queue(factory).then((result) => { assert.strictEqual(result, 4); }),
                    throttler.queue(factory).then((result) => { assert.strictEqual(result, 4); }),
                    throttler.queue(factory).then((result) => { assert.strictEqual(result, 4); }),
                    throttler.queue(factory).then((result) => { assert.strictEqual(result, 4); })
                ]);
            });
        });
        test('last factory should be the one getting called', function () {
            const factoryFactory = (n) => () => {
                return async.timeout(0).then(() => n);
            };
            const throttler = new async.Throttler();
            const promises = [];
            promises.push(throttler.queue(factoryFactory(1)).then((n) => { assert.strictEqual(n, 1); }));
            promises.push(throttler.queue(factoryFactory(2)).then((n) => { assert.strictEqual(n, 3); }));
            promises.push(throttler.queue(factoryFactory(3)).then((n) => { assert.strictEqual(n, 3); }));
            return Promise.all(promises);
        });
        test('disposal after queueing', async () => {
            let factoryCalls = 0;
            const factory = async () => {
                factoryCalls++;
                return async.timeout(0);
            };
            const throttler = new async.Throttler();
            const promises = [];
            promises.push(throttler.queue(factory));
            promises.push(throttler.queue(factory));
            throttler.dispose();
            await Promise.all(promises);
            assert.strictEqual(factoryCalls, 1);
        });
        test('disposal before queueing', async () => {
            let factoryCalls = 0;
            const factory = async () => {
                factoryCalls++;
                return async.timeout(0);
            };
            const throttler = new async.Throttler();
            const promises = [];
            throttler.dispose();
            promises.push(throttler.queue(factory));
            try {
                await Promise.all(promises);
                assert.fail('should fail');
            }
            catch (err) {
                assert.strictEqual(factoryCalls, 0);
            }
        });
    });
    suite('Delayer', function () {
        test('simple', () => {
            let count = 0;
            const factory = () => {
                return Promise.resolve(++count);
            };
            const delayer = new async.Delayer(0);
            const promises = [];
            assert(!delayer.isTriggered());
            promises.push(delayer.trigger(factory).then((result) => { assert.strictEqual(result, 1); assert(!delayer.isTriggered()); }));
            assert(delayer.isTriggered());
            promises.push(delayer.trigger(factory).then((result) => { assert.strictEqual(result, 1); assert(!delayer.isTriggered()); }));
            assert(delayer.isTriggered());
            promises.push(delayer.trigger(factory).then((result) => { assert.strictEqual(result, 1); assert(!delayer.isTriggered()); }));
            assert(delayer.isTriggered());
            return Promise.all(promises).then(() => {
                assert(!delayer.isTriggered());
            });
        });
        test('microtask delay simple', () => {
            let count = 0;
            const factory = () => {
                return Promise.resolve(++count);
            };
            const delayer = new async.Delayer(MicrotaskDelay.MicrotaskDelay);
            const promises = [];
            assert(!delayer.isTriggered());
            promises.push(delayer.trigger(factory).then((result) => { assert.strictEqual(result, 1); assert(!delayer.isTriggered()); }));
            assert(delayer.isTriggered());
            promises.push(delayer.trigger(factory).then((result) => { assert.strictEqual(result, 1); assert(!delayer.isTriggered()); }));
            assert(delayer.isTriggered());
            promises.push(delayer.trigger(factory).then((result) => { assert.strictEqual(result, 1); assert(!delayer.isTriggered()); }));
            assert(delayer.isTriggered());
            return Promise.all(promises).then(() => {
                assert(!delayer.isTriggered());
            });
        });
        suite('ThrottledDelayer', () => {
            test('promise should resolve if disposed', async () => {
                const throttledDelayer = new async.ThrottledDelayer(100);
                const promise = throttledDelayer.trigger(async () => { }, 0);
                throttledDelayer.dispose();
                try {
                    await promise;
                    assert.fail('SHOULD NOT BE HERE');
                }
                catch (err) {
                    // OK
                }
            });
            test('trigger after dispose throws', async () => {
                const throttledDelayer = new async.ThrottledDelayer(100);
                throttledDelayer.dispose();
                await assert.rejects(() => throttledDelayer.trigger(async () => { }, 0));
            });
        });
        test('simple cancel', function () {
            let count = 0;
            const factory = () => {
                return Promise.resolve(++count);
            };
            const delayer = new async.Delayer(0);
            assert(!delayer.isTriggered());
            const p = delayer.trigger(factory).then(() => {
                assert(false);
            }, () => {
                assert(true, 'yes, it was cancelled');
            });
            assert(delayer.isTriggered());
            delayer.cancel();
            assert(!delayer.isTriggered());
            return p;
        });
        test('simple cancel microtask', function () {
            let count = 0;
            const factory = () => {
                return Promise.resolve(++count);
            };
            const delayer = new async.Delayer(MicrotaskDelay.MicrotaskDelay);
            assert(!delayer.isTriggered());
            const p = delayer.trigger(factory).then(() => {
                assert(false);
            }, () => {
                assert(true, 'yes, it was cancelled');
            });
            assert(delayer.isTriggered());
            delayer.cancel();
            assert(!delayer.isTriggered());
            return p;
        });
        test('cancel should cancel all calls to trigger', function () {
            let count = 0;
            const factory = () => {
                return Promise.resolve(++count);
            };
            const delayer = new async.Delayer(0);
            const promises = [];
            assert(!delayer.isTriggered());
            promises.push(delayer.trigger(factory).then(undefined, () => { assert(true, 'yes, it was cancelled'); }));
            assert(delayer.isTriggered());
            promises.push(delayer.trigger(factory).then(undefined, () => { assert(true, 'yes, it was cancelled'); }));
            assert(delayer.isTriggered());
            promises.push(delayer.trigger(factory).then(undefined, () => { assert(true, 'yes, it was cancelled'); }));
            assert(delayer.isTriggered());
            delayer.cancel();
            return Promise.all(promises).then(() => {
                assert(!delayer.isTriggered());
            });
        });
        test('trigger, cancel, then trigger again', function () {
            let count = 0;
            const factory = () => {
                return Promise.resolve(++count);
            };
            const delayer = new async.Delayer(0);
            let promises = [];
            assert(!delayer.isTriggered());
            const p = delayer.trigger(factory).then((result) => {
                assert.strictEqual(result, 1);
                assert(!delayer.isTriggered());
                promises.push(delayer.trigger(factory).then(undefined, () => { assert(true, 'yes, it was cancelled'); }));
                assert(delayer.isTriggered());
                promises.push(delayer.trigger(factory).then(undefined, () => { assert(true, 'yes, it was cancelled'); }));
                assert(delayer.isTriggered());
                delayer.cancel();
                const p = Promise.all(promises).then(() => {
                    promises = [];
                    assert(!delayer.isTriggered());
                    promises.push(delayer.trigger(factory).then(() => { assert.strictEqual(result, 1); assert(!delayer.isTriggered()); }));
                    assert(delayer.isTriggered());
                    promises.push(delayer.trigger(factory).then(() => { assert.strictEqual(result, 1); assert(!delayer.isTriggered()); }));
                    assert(delayer.isTriggered());
                    const p = Promise.all(promises).then(() => {
                        assert(!delayer.isTriggered());
                    });
                    assert(delayer.isTriggered());
                    return p;
                });
                return p;
            });
            assert(delayer.isTriggered());
            return p;
        });
        test('last task should be the one getting called', function () {
            const factoryFactory = (n) => () => {
                return Promise.resolve(n);
            };
            const delayer = new async.Delayer(0);
            const promises = [];
            assert(!delayer.isTriggered());
            promises.push(delayer.trigger(factoryFactory(1)).then((n) => { assert.strictEqual(n, 3); }));
            promises.push(delayer.trigger(factoryFactory(2)).then((n) => { assert.strictEqual(n, 3); }));
            promises.push(delayer.trigger(factoryFactory(3)).then((n) => { assert.strictEqual(n, 3); }));
            const p = Promise.all(promises).then(() => {
                assert(!delayer.isTriggered());
            });
            assert(delayer.isTriggered());
            return p;
        });
    });
    suite('sequence', () => {
        test('simple', () => {
            const factoryFactory = (n) => () => {
                return Promise.resolve(n);
            };
            return async.sequence([
                factoryFactory(1),
                factoryFactory(2),
                factoryFactory(3),
                factoryFactory(4),
                factoryFactory(5),
            ]).then((result) => {
                assert.strictEqual(5, result.length);
                assert.strictEqual(1, result[0]);
                assert.strictEqual(2, result[1]);
                assert.strictEqual(3, result[2]);
                assert.strictEqual(4, result[3]);
                assert.strictEqual(5, result[4]);
            });
        });
    });
    suite('Limiter', () => {
        test('assert degree of paralellism', function () {
            let activePromises = 0;
            const factoryFactory = (n) => () => {
                activePromises++;
                assert(activePromises < 6);
                return async.timeout(0).then(() => { activePromises--; return n; });
            };
            const limiter = new async.Limiter(5);
            const promises = [];
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));
            return Promise.all(promises).then((res) => {
                assert.strictEqual(10, res.length);
                assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], res);
            });
        });
    });
    suite('Queue', () => {
        test('simple', function () {
            const queue = new async.Queue();
            let syncPromise = false;
            const f1 = () => Promise.resolve(true).then(() => syncPromise = true);
            let asyncPromise = false;
            const f2 = () => async.timeout(10).then(() => asyncPromise = true);
            assert.strictEqual(queue.size, 0);
            queue.queue(f1);
            assert.strictEqual(queue.size, 1);
            const p = queue.queue(f2);
            assert.strictEqual(queue.size, 2);
            return p.then(() => {
                assert.strictEqual(queue.size, 0);
                assert.ok(syncPromise);
                assert.ok(asyncPromise);
            });
        });
        test('stop processing on dispose', async function () {
            const queue = new async.Queue();
            let workCounter = 0;
            const task = async () => {
                await async.timeout(0);
                workCounter++;
                queue.dispose(); // DISPOSE HERE
            };
            const p1 = queue.queue(task);
            queue.queue(task);
            queue.queue(task);
            assert.strictEqual(queue.size, 3);
            await p1;
            assert.strictEqual(workCounter, 1);
        });
        test('stop on clear', async function () {
            const queue = new async.Queue();
            let workCounter = 0;
            const task = async () => {
                await async.timeout(0);
                workCounter++;
                queue.clear(); // CLEAR HERE
                assert.strictEqual(queue.size, 1); // THIS task is still running
            };
            const p1 = queue.queue(task);
            queue.queue(task);
            queue.queue(task);
            assert.strictEqual(queue.size, 3);
            await p1;
            assert.strictEqual(workCounter, 1);
            assert.strictEqual(queue.size, 0); // has been cleared
            const p2 = queue.queue(task);
            await p2;
            assert.strictEqual(workCounter, 2);
        });
        test('clear and drain (1)', async function () {
            const queue = new async.Queue();
            let workCounter = 0;
            const task = async () => {
                await async.timeout(0);
                workCounter++;
                queue.clear(); // CLEAR HERE
            };
            const p0 = Event.toPromise(queue.onDrained);
            const p1 = queue.queue(task);
            await p1;
            await p0; // expect drain to fire because a task was running
            assert.strictEqual(workCounter, 1);
            queue.dispose();
        });
        test('clear and drain (2)', async function () {
            const queue = new async.Queue();
            let didFire = false;
            const d = queue.onDrained(() => {
                didFire = true;
            });
            queue.clear();
            assert.strictEqual(didFire, false); // no work, no drain!
            d.dispose();
            queue.dispose();
        });
        test('drain timing', async function () {
            const queue = new async.Queue();
            const logicClock = new class {
                constructor() {
                    this.time = 0;
                }
                tick() {
                    return this.time++;
                }
            };
            let didDrainTime = 0;
            let didFinishTime1 = 0;
            let didFinishTime2 = 0;
            const d = queue.onDrained(() => {
                didDrainTime = logicClock.tick();
            });
            const p1 = queue.queue(() => {
                // await async.timeout(10);
                didFinishTime1 = logicClock.tick();
                return Promise.resolve();
            });
            const p2 = queue.queue(async () => {
                await async.timeout(10);
                didFinishTime2 = logicClock.tick();
            });
            await Promise.all([p1, p2]);
            assert.strictEqual(didFinishTime1, 0);
            assert.strictEqual(didFinishTime2, 1);
            assert.strictEqual(didDrainTime, 2);
            d.dispose();
            queue.dispose();
        });
        test('drain event is send only once', async function () {
            const queue = new async.Queue();
            let drainCount = 0;
            const d = queue.onDrained(() => { drainCount++; });
            queue.queue(async () => { });
            queue.queue(async () => { });
            queue.queue(async () => { });
            queue.queue(async () => { });
            assert.strictEqual(drainCount, 0);
            assert.strictEqual(queue.size, 4);
            await queue.whenIdle();
            assert.strictEqual(drainCount, 1);
            d.dispose();
            queue.dispose();
        });
        test('order is kept', function () {
            return runWithFakedTimers({}, () => {
                const queue = new async.Queue();
                const res = [];
                const f1 = () => Promise.resolve(true).then(() => res.push(1));
                const f2 = () => async.timeout(10).then(() => res.push(2));
                const f3 = () => Promise.resolve(true).then(() => res.push(3));
                const f4 = () => async.timeout(20).then(() => res.push(4));
                const f5 = () => async.timeout(0).then(() => res.push(5));
                queue.queue(f1);
                queue.queue(f2);
                queue.queue(f3);
                queue.queue(f4);
                return queue.queue(f5).then(() => {
                    assert.strictEqual(res[0], 1);
                    assert.strictEqual(res[1], 2);
                    assert.strictEqual(res[2], 3);
                    assert.strictEqual(res[3], 4);
                    assert.strictEqual(res[4], 5);
                });
            });
        });
        test('errors bubble individually but not cause stop', function () {
            const queue = new async.Queue();
            const res = [];
            let error = false;
            const f1 = () => Promise.resolve(true).then(() => res.push(1));
            const f2 = () => async.timeout(10).then(() => res.push(2));
            const f3 = () => Promise.resolve(true).then(() => Promise.reject(new Error('error')));
            const f4 = () => async.timeout(20).then(() => res.push(4));
            const f5 = () => async.timeout(0).then(() => res.push(5));
            queue.queue(f1);
            queue.queue(f2);
            queue.queue(f3).then(undefined, () => error = true);
            queue.queue(f4);
            return queue.queue(f5).then(() => {
                assert.strictEqual(res[0], 1);
                assert.strictEqual(res[1], 2);
                assert.ok(error);
                assert.strictEqual(res[2], 4);
                assert.strictEqual(res[3], 5);
            });
        });
        test('order is kept (chained)', function () {
            const queue = new async.Queue();
            const res = [];
            const f1 = () => Promise.resolve(true).then(() => res.push(1));
            const f2 = () => async.timeout(10).then(() => res.push(2));
            const f3 = () => Promise.resolve(true).then(() => res.push(3));
            const f4 = () => async.timeout(20).then(() => res.push(4));
            const f5 = () => async.timeout(0).then(() => res.push(5));
            return queue.queue(f1).then(() => {
                return queue.queue(f2).then(() => {
                    return queue.queue(f3).then(() => {
                        return queue.queue(f4).then(() => {
                            return queue.queue(f5).then(() => {
                                assert.strictEqual(res[0], 1);
                                assert.strictEqual(res[1], 2);
                                assert.strictEqual(res[2], 3);
                                assert.strictEqual(res[3], 4);
                                assert.strictEqual(res[4], 5);
                            });
                        });
                    });
                });
            });
        });
        test('events', async function () {
            const queue = new async.Queue();
            let drained = false;
            const onDrained = Event.toPromise(queue.onDrained).then(() => drained = true);
            const res = [];
            const f1 = () => async.timeout(10).then(() => res.push(2));
            const f2 = () => async.timeout(20).then(() => res.push(4));
            const f3 = () => async.timeout(0).then(() => res.push(5));
            const q1 = queue.queue(f1);
            const q2 = queue.queue(f2);
            queue.queue(f3);
            q1.then(() => {
                assert.ok(!drained);
                q2.then(() => {
                    assert.ok(!drained);
                });
            });
            await onDrained;
            assert.ok(drained);
        });
    });
    suite('ResourceQueue', () => {
        test('simple', async function () {
            const queue = new async.ResourceQueue();
            await queue.whenDrained(); // returns immediately since empty
            let done1 = false;
            queue.queueFor(URI.file('/some/path'), async () => { done1 = true; });
            await queue.whenDrained(); // returns immediately since no work scheduled
            assert.strictEqual(done1, true);
            let done2 = false;
            queue.queueFor(URI.file('/some/other/path'), async () => { done2 = true; });
            await queue.whenDrained(); // returns immediately since no work scheduled
            assert.strictEqual(done2, true);
            // schedule some work
            const w1 = new async.DeferredPromise();
            queue.queueFor(URI.file('/some/path'), () => w1.p);
            let drained = false;
            queue.whenDrained().then(() => drained = true);
            assert.strictEqual(drained, false);
            await w1.complete();
            await async.timeout(0);
            assert.strictEqual(drained, true);
            // schedule some work
            const w2 = new async.DeferredPromise();
            const w3 = new async.DeferredPromise();
            queue.queueFor(URI.file('/some/path'), () => w2.p);
            queue.queueFor(URI.file('/some/other/path'), () => w3.p);
            drained = false;
            queue.whenDrained().then(() => drained = true);
            queue.dispose();
            await async.timeout(0);
            assert.strictEqual(drained, true);
        });
    });
    suite('retry', () => {
        test('success case', async () => {
            return runWithFakedTimers({ useFakeTimers: true }, async () => {
                let counter = 0;
                const res = await async.retry(() => {
                    counter++;
                    if (counter < 2) {
                        return Promise.reject(new Error('fail'));
                    }
                    return Promise.resolve(true);
                }, 10, 3);
                assert.strictEqual(res, true);
            });
        });
        test('error case', async () => {
            return runWithFakedTimers({ useFakeTimers: true }, async () => {
                const expectedError = new Error('fail');
                try {
                    await async.retry(() => {
                        return Promise.reject(expectedError);
                    }, 10, 3);
                }
                catch (error) {
                    assert.strictEqual(error, error);
                }
            });
        });
    });
    suite('TaskSequentializer', () => {
        test('execution basics', async function () {
            const sequentializer = new async.TaskSequentializer();
            assert.ok(!sequentializer.isRunning());
            assert.ok(!sequentializer.hasQueued());
            assert.ok(!sequentializer.isRunning(2323));
            assert.ok(!sequentializer.running);
            // pending removes itself after done
            await sequentializer.run(1, Promise.resolve());
            assert.ok(!sequentializer.isRunning());
            assert.ok(!sequentializer.isRunning(1));
            assert.ok(!sequentializer.running);
            assert.ok(!sequentializer.hasQueued());
            // pending removes itself after done (use async.timeout)
            sequentializer.run(2, async.timeout(1));
            assert.ok(sequentializer.isRunning());
            assert.ok(sequentializer.isRunning(2));
            assert.ok(!sequentializer.hasQueued());
            assert.strictEqual(sequentializer.isRunning(1), false);
            assert.ok(sequentializer.running);
            await async.timeout(2);
            assert.strictEqual(sequentializer.isRunning(), false);
            assert.strictEqual(sequentializer.isRunning(2), false);
            assert.ok(!sequentializer.running);
        });
        test('executing and queued (finishes instantly)', async function () {
            const sequentializer = new async.TaskSequentializer();
            let pendingDone = false;
            sequentializer.run(1, async.timeout(1).then(() => { pendingDone = true; return; }));
            // queued finishes instantly
            let queuedDone = false;
            const res = sequentializer.queue(() => Promise.resolve(null).then(() => { queuedDone = true; return; }));
            assert.ok(sequentializer.hasQueued());
            await res;
            assert.ok(pendingDone);
            assert.ok(queuedDone);
            assert.ok(!sequentializer.hasQueued());
        });
        test('executing and queued (finishes after timeout)', async function () {
            const sequentializer = new async.TaskSequentializer();
            let pendingDone = false;
            sequentializer.run(1, async.timeout(1).then(() => { pendingDone = true; return; }));
            // queued finishes after async.timeout
            let queuedDone = false;
            const res = sequentializer.queue(() => async.timeout(1).then(() => { queuedDone = true; return; }));
            await res;
            assert.ok(pendingDone);
            assert.ok(queuedDone);
            assert.ok(!sequentializer.hasQueued());
        });
        test('join (without executing or queued)', async function () {
            const sequentializer = new async.TaskSequentializer();
            await sequentializer.join();
            assert.ok(!sequentializer.hasQueued());
        });
        test('join (without queued)', async function () {
            const sequentializer = new async.TaskSequentializer();
            let pendingDone = false;
            sequentializer.run(1, async.timeout(1).then(() => { pendingDone = true; return; }));
            await sequentializer.join();
            assert.ok(pendingDone);
            assert.ok(!sequentializer.isRunning());
        });
        test('join (with executing and queued)', async function () {
            const sequentializer = new async.TaskSequentializer();
            let pendingDone = false;
            sequentializer.run(1, async.timeout(1).then(() => { pendingDone = true; return; }));
            // queued finishes after async.timeout
            let queuedDone = false;
            sequentializer.queue(() => async.timeout(1).then(() => { queuedDone = true; return; }));
            await sequentializer.join();
            assert.ok(pendingDone);
            assert.ok(queuedDone);
            assert.ok(!sequentializer.isRunning());
            assert.ok(!sequentializer.hasQueued());
        });
        test('executing and multiple queued (last one wins)', async function () {
            const sequentializer = new async.TaskSequentializer();
            let pendingDone = false;
            sequentializer.run(1, async.timeout(1).then(() => { pendingDone = true; return; }));
            // queued finishes after async.timeout
            let firstDone = false;
            const firstRes = sequentializer.queue(() => async.timeout(2).then(() => { firstDone = true; return; }));
            let secondDone = false;
            const secondRes = sequentializer.queue(() => async.timeout(3).then(() => { secondDone = true; return; }));
            let thirdDone = false;
            const thirdRes = sequentializer.queue(() => async.timeout(4).then(() => { thirdDone = true; return; }));
            await Promise.all([firstRes, secondRes, thirdRes]);
            assert.ok(pendingDone);
            assert.ok(!firstDone);
            assert.ok(!secondDone);
            assert.ok(thirdDone);
        });
        test('cancel executing', async function () {
            const sequentializer = new async.TaskSequentializer();
            const ctsTimeout = store.add(new CancellationTokenSource());
            let pendingCancelled = false;
            const timeout = async.timeout(1, ctsTimeout.token);
            sequentializer.run(1, timeout, () => pendingCancelled = true);
            sequentializer.cancelRunning();
            assert.ok(pendingCancelled);
            ctsTimeout.cancel();
        });
    });
    suite('disposableTimeout', () => {
        test('handler only success', async () => {
            let cb = false;
            const t = async.disposableTimeout(() => cb = true);
            await async.timeout(0);
            assert.strictEqual(cb, true);
            t.dispose();
        });
        test('handler only cancel', async () => {
            let cb = false;
            const t = async.disposableTimeout(() => cb = true);
            t.dispose();
            await async.timeout(0);
            assert.strictEqual(cb, false);
        });
        test('store managed success', async () => {
            let cb = false;
            const s = new DisposableStore();
            async.disposableTimeout(() => cb = true, 0, s);
            await async.timeout(0);
            assert.strictEqual(cb, true);
            s.dispose();
        });
        test('store managed cancel via disposable', async () => {
            let cb = false;
            const s = new DisposableStore();
            const t = async.disposableTimeout(() => cb = true, 0, s);
            t.dispose();
            await async.timeout(0);
            assert.strictEqual(cb, false);
            s.dispose();
        });
        test('store managed cancel via store', async () => {
            let cb = false;
            const s = new DisposableStore();
            async.disposableTimeout(() => cb = true, 0, s);
            s.dispose();
            await async.timeout(0);
            assert.strictEqual(cb, false);
        });
    });
    test('raceCancellation', async () => {
        const cts = store.add(new CancellationTokenSource());
        const ctsTimeout = store.add(new CancellationTokenSource());
        let triggered = false;
        const timeout = async.timeout(100, ctsTimeout.token);
        const p = async.raceCancellation(timeout.then(() => triggered = true), cts.token);
        cts.cancel();
        await p;
        assert.ok(!triggered);
        ctsTimeout.cancel();
    });
    test('raceTimeout', async () => {
        const cts = store.add(new CancellationTokenSource());
        // timeout wins
        let timedout = false;
        let triggered = false;
        const ctsTimeout1 = store.add(new CancellationTokenSource());
        const timeout1 = async.timeout(100, ctsTimeout1.token);
        const p1 = async.raceTimeout(timeout1.then(() => triggered = true), 1, () => timedout = true);
        cts.cancel();
        await p1;
        assert.ok(!triggered);
        assert.strictEqual(timedout, true);
        ctsTimeout1.cancel();
        // promise wins
        timedout = false;
        const ctsTimeout2 = store.add(new CancellationTokenSource());
        const timeout2 = async.timeout(1, ctsTimeout2.token);
        const p2 = async.raceTimeout(timeout2.then(() => triggered = true), 100, () => timedout = true);
        cts.cancel();
        await p2;
        assert.ok(triggered);
        assert.strictEqual(timedout, false);
        ctsTimeout2.cancel();
    });
    test('SequencerByKey', async () => {
        const s = new async.SequencerByKey();
        const r1 = await s.queue('key1', () => Promise.resolve('hello'));
        assert.strictEqual(r1, 'hello');
        await s.queue('key2', () => Promise.reject(new Error('failed'))).then(() => {
            throw new Error('should not be resolved');
        }, err => {
            // Expected error
            assert.strictEqual(err.message, 'failed');
        });
        // Still works after a queued promise is rejected
        const r3 = await s.queue('key2', () => Promise.resolve('hello'));
        assert.strictEqual(r3, 'hello');
    });
    test('IntervalCounter', async () => {
        let now = 0;
        const counter = new async.IntervalCounter(5, () => now);
        assert.strictEqual(counter.increment(), 1);
        assert.strictEqual(counter.increment(), 2);
        assert.strictEqual(counter.increment(), 3);
        now = 10;
        assert.strictEqual(counter.increment(), 1);
        assert.strictEqual(counter.increment(), 2);
        assert.strictEqual(counter.increment(), 3);
    });
    suite('firstParallel', () => {
        test('simple', async () => {
            const a = await async.firstParallel([
                Promise.resolve(1),
                Promise.resolve(2),
                Promise.resolve(3),
            ], v => v === 2);
            assert.strictEqual(a, 2);
        });
        test('uses null default', async () => {
            assert.strictEqual(await async.firstParallel([Promise.resolve(1)], v => v === 2), null);
        });
        test('uses value default', async () => {
            assert.strictEqual(await async.firstParallel([Promise.resolve(1)], v => v === 2, 4), 4);
        });
        test('empty', async () => {
            assert.strictEqual(await async.firstParallel([], v => v === 2, 4), 4);
        });
        test('cancels', async () => {
            let ct1;
            const p1 = async.createCancelablePromise(async (ct) => {
                ct1 = ct;
                await async.timeout(200, ct);
                return 1;
            });
            let ct2;
            const p2 = async.createCancelablePromise(async (ct) => {
                ct2 = ct;
                await async.timeout(2, ct);
                return 2;
            });
            assert.strictEqual(await async.firstParallel([p1, p2], v => v === 2, 4), 2);
            assert.strictEqual(ct1.isCancellationRequested, true, 'should cancel a');
            assert.strictEqual(ct2.isCancellationRequested, true, 'should cancel b');
        });
        test('rejection handling', async () => {
            let ct1;
            const p1 = async.createCancelablePromise(async (ct) => {
                ct1 = ct;
                await async.timeout(200, ct);
                return 1;
            });
            let ct2;
            const p2 = async.createCancelablePromise(async (ct) => {
                ct2 = ct;
                await async.timeout(2, ct);
                throw new Error('oh no');
            });
            assert.strictEqual(await async.firstParallel([p1, p2], v => v === 2, 4).catch(() => 'ok'), 'ok');
            assert.strictEqual(ct1.isCancellationRequested, true, 'should cancel a');
            assert.strictEqual(ct2.isCancellationRequested, true, 'should cancel b');
        });
    });
    suite('DeferredPromise', () => {
        test('resolves', async () => {
            const deferred = new async.DeferredPromise();
            assert.strictEqual(deferred.isResolved, false);
            deferred.complete(42);
            assert.strictEqual(await deferred.p, 42);
            assert.strictEqual(deferred.isResolved, true);
        });
        test('rejects', async () => {
            const deferred = new async.DeferredPromise();
            assert.strictEqual(deferred.isRejected, false);
            const err = new Error('oh no!');
            deferred.error(err);
            assert.strictEqual(await deferred.p.catch(e => e), err);
            assert.strictEqual(deferred.isRejected, true);
        });
        test('cancels', async () => {
            const deferred = new async.DeferredPromise();
            assert.strictEqual(deferred.isRejected, false);
            deferred.cancel();
            assert.strictEqual((await deferred.p.catch(e => e)).name, 'Canceled');
            assert.strictEqual(deferred.isRejected, true);
        });
        test('retains the original settled value', async () => {
            const deferred = new async.DeferredPromise();
            assert.strictEqual(deferred.isResolved, false);
            assert.strictEqual(deferred.value, undefined);
            deferred.complete(42);
            assert.strictEqual(await deferred.p, 42);
            assert.strictEqual(deferred.value, 42);
            assert.strictEqual(deferred.isResolved, true);
            deferred.complete(-1);
            assert.strictEqual(await deferred.p, 42);
            assert.strictEqual(deferred.value, 42);
            assert.strictEqual(deferred.isResolved, true);
        });
    });
    suite('Promises.settled', () => {
        test('resolves', async () => {
            const p1 = Promise.resolve(1);
            const p2 = async.timeout(1).then(() => 2);
            const p3 = async.timeout(2).then(() => 3);
            const result = await async.Promises.settled([p1, p2, p3]);
            assert.strictEqual(result.length, 3);
            assert.deepStrictEqual(result[0], 1);
            assert.deepStrictEqual(result[1], 2);
            assert.deepStrictEqual(result[2], 3);
        });
        test('resolves in order', async () => {
            const p1 = async.timeout(2).then(() => 1);
            const p2 = async.timeout(1).then(() => 2);
            const p3 = Promise.resolve(3);
            const result = await async.Promises.settled([p1, p2, p3]);
            assert.strictEqual(result.length, 3);
            assert.deepStrictEqual(result[0], 1);
            assert.deepStrictEqual(result[1], 2);
            assert.deepStrictEqual(result[2], 3);
        });
        test('rejects with first error but handles all promises (all errors)', async () => {
            const p1 = Promise.reject(1);
            let p2Handled = false;
            const p2Error = new Error('2');
            const p2 = async.timeout(1).then(() => {
                p2Handled = true;
                throw p2Error;
            });
            let p3Handled = false;
            const p3Error = new Error('3');
            const p3 = async.timeout(2).then(() => {
                p3Handled = true;
                throw p3Error;
            });
            let error = undefined;
            try {
                await async.Promises.settled([p1, p2, p3]);
            }
            catch (e) {
                error = e;
            }
            assert.ok(error);
            assert.notStrictEqual(error, p2Error);
            assert.notStrictEqual(error, p3Error);
            assert.ok(p2Handled);
            assert.ok(p3Handled);
        });
        test('rejects with first error but handles all promises (1 error)', async () => {
            const p1 = Promise.resolve(1);
            let p2Handled = false;
            const p2Error = new Error('2');
            const p2 = async.timeout(1).then(() => {
                p2Handled = true;
                throw p2Error;
            });
            let p3Handled = false;
            const p3 = async.timeout(2).then(() => {
                p3Handled = true;
                return 3;
            });
            let error = undefined;
            try {
                await async.Promises.settled([p1, p2, p3]);
            }
            catch (e) {
                error = e;
            }
            assert.strictEqual(error, p2Error);
            assert.ok(p2Handled);
            assert.ok(p3Handled);
        });
    });
    suite('Promises.withAsyncBody', () => {
        test('basics', async () => {
            const p1 = async.Promises.withAsyncBody(async (resolve, reject) => {
                resolve(1);
            });
            const p2 = async.Promises.withAsyncBody(async (resolve, reject) => {
                reject(new Error('error'));
            });
            const p3 = async.Promises.withAsyncBody(async (resolve, reject) => {
                throw new Error('error');
            });
            const r1 = await p1;
            assert.strictEqual(r1, 1);
            let e2 = undefined;
            try {
                await p2;
            }
            catch (error) {
                e2 = error;
            }
            assert.ok(e2 instanceof Error);
            let e3 = undefined;
            try {
                await p3;
            }
            catch (error) {
                e3 = error;
            }
            assert.ok(e3 instanceof Error);
        });
    });
    suite('ThrottledWorker', () => {
        function assertArrayEquals(actual, expected) {
            assert.strictEqual(actual.length, expected.length);
            for (let i = 0; i < actual.length; i++) {
                assert.strictEqual(actual[i], expected[i]);
            }
        }
        test('basics', async () => {
            let handled = [];
            let handledCallback;
            let handledPromise = new Promise(resolve => handledCallback = resolve);
            let handledCounterToResolve = 1;
            let currentHandledCounter = 0;
            const handler = (units) => {
                handled.push(...units);
                currentHandledCounter++;
                if (currentHandledCounter === handledCounterToResolve) {
                    handledCallback();
                    handledPromise = new Promise(resolve => handledCallback = resolve);
                    currentHandledCounter = 0;
                }
            };
            const worker = store.add(new async.ThrottledWorker({
                maxWorkChunkSize: 5,
                maxBufferedWork: undefined,
                throttleDelay: 1
            }, handler));
            // Work less than chunk size
            let worked = worker.work([1, 2, 3]);
            assertArrayEquals(handled, [1, 2, 3]);
            assert.strictEqual(worker.pending, 0);
            assert.strictEqual(worked, true);
            worker.work([4, 5]);
            worked = worker.work([6]);
            assertArrayEquals(handled, [1, 2, 3, 4, 5, 6]);
            assert.strictEqual(worker.pending, 0);
            assert.strictEqual(worked, true);
            // Work more than chunk size (variant 1)
            handled = [];
            handledCounterToResolve = 2;
            worked = worker.work([1, 2, 3, 4, 5, 6, 7]);
            assertArrayEquals(handled, [1, 2, 3, 4, 5]);
            assert.strictEqual(worker.pending, 2);
            assert.strictEqual(worked, true);
            await handledPromise;
            assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7]);
            handled = [];
            handledCounterToResolve = 4;
            worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
            assertArrayEquals(handled, [1, 2, 3, 4, 5]);
            assert.strictEqual(worker.pending, 14);
            assert.strictEqual(worked, true);
            await handledPromise;
            assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
            // Work more than chunk size (variant 2)
            handled = [];
            handledCounterToResolve = 2;
            worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            assertArrayEquals(handled, [1, 2, 3, 4, 5]);
            assert.strictEqual(worker.pending, 5);
            assert.strictEqual(worked, true);
            await handledPromise;
            assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            // Work more while throttled (variant 1)
            handled = [];
            handledCounterToResolve = 3;
            worked = worker.work([1, 2, 3, 4, 5, 6, 7]);
            assertArrayEquals(handled, [1, 2, 3, 4, 5]);
            assert.strictEqual(worker.pending, 2);
            assert.strictEqual(worked, true);
            worker.work([8]);
            worked = worker.work([9, 10, 11]);
            assertArrayEquals(handled, [1, 2, 3, 4, 5]);
            assert.strictEqual(worker.pending, 6);
            assert.strictEqual(worked, true);
            await handledPromise;
            assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
            assert.strictEqual(worker.pending, 0);
            // Work more while throttled (variant 2)
            handled = [];
            handledCounterToResolve = 2;
            worked = worker.work([1, 2, 3, 4, 5, 6, 7]);
            assertArrayEquals(handled, [1, 2, 3, 4, 5]);
            assert.strictEqual(worked, true);
            worker.work([8]);
            worked = worker.work([9, 10]);
            assertArrayEquals(handled, [1, 2, 3, 4, 5]);
            assert.strictEqual(worked, true);
            await handledPromise;
            assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        });
        test('do not accept too much work', async () => {
            const handled = [];
            const handler = (units) => handled.push(...units);
            const worker = store.add(new async.ThrottledWorker({
                maxWorkChunkSize: 5,
                maxBufferedWork: 5,
                throttleDelay: 1
            }, handler));
            let worked = worker.work([1, 2, 3]);
            assert.strictEqual(worked, true);
            worked = worker.work([1, 2, 3, 4, 5, 6]);
            assert.strictEqual(worked, true);
            assert.strictEqual(worker.pending, 1);
            worked = worker.work([7]);
            assert.strictEqual(worked, true);
            assert.strictEqual(worker.pending, 2);
            worked = worker.work([8, 9, 10, 11]);
            assert.strictEqual(worked, false);
            assert.strictEqual(worker.pending, 2);
        });
        test('do not accept too much work (account for max chunk size', async () => {
            const handled = [];
            const handler = (units) => handled.push(...units);
            const worker = store.add(new async.ThrottledWorker({
                maxWorkChunkSize: 5,
                maxBufferedWork: 5,
                throttleDelay: 1
            }, handler));
            let worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
            assert.strictEqual(worked, false);
            assert.strictEqual(worker.pending, 0);
            worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            assert.strictEqual(worked, true);
            assert.strictEqual(worker.pending, 5);
        });
        test('disposed', async () => {
            const handled = [];
            const handler = (units) => handled.push(...units);
            const worker = store.add(new async.ThrottledWorker({
                maxWorkChunkSize: 5,
                maxBufferedWork: undefined,
                throttleDelay: 1
            }, handler));
            worker.dispose();
            const worked = worker.work([1, 2, 3]);
            assertArrayEquals(handled, []);
            assert.strictEqual(worker.pending, 0);
            assert.strictEqual(worked, false);
        });
        //  https://github.com/microsoft/vscode/issues/230366
        // 	test('waitThrottleDelayBetweenWorkUnits option', async () => {
        // 		const handled: number[] = [];
        // 		let handledCallback: Function;
        // 		let handledPromise = new Promise(resolve => handledCallback = resolve);
        // 		let currentTime = 0;
        // 		const handler = (units: readonly number[]) => {
        // 			handled.push(...units);
        // 			handledCallback();
        // 			handledPromise = new Promise(resolve => handledCallback = resolve);
        // 		};
        // 		const worker = store.add(new async.ThrottledWorker<number>({
        // 			maxWorkChunkSize: 5,
        // 			maxBufferedWork: undefined,
        // 			throttleDelay: 5,
        // 			waitThrottleDelayBetweenWorkUnits: true
        // 		}, handler));
        // 		// Schedule work, it should execute immediately
        // 		currentTime = Date.now();
        // 		let worked = worker.work([1, 2, 3]);
        // 		assert.strictEqual(worked, true);
        // 		assertArrayEquals(handled, [1, 2, 3]);
        // 		assert.strictEqual(Date.now() - currentTime < 5, true);
        // 		// Schedule work again, it should wait at least throttle delay before executing
        // 		currentTime = Date.now();
        // 		worked = worker.work([4, 5]);
        // 		assert.strictEqual(worked, true);
        // 		// Throttle delay hasn't reset so we still must wait
        // 		assertArrayEquals(handled, [1, 2, 3]);
        // 		await handledPromise;
        // 		assert.strictEqual(Date.now() - currentTime >= 5, true);
        // 		assertArrayEquals(handled, [1, 2, 3, 4, 5]);
        // 	});
    });
    suite('LimitedQueue', () => {
        test('basics (with long running task)', async () => {
            const limitedQueue = new async.LimitedQueue();
            let counter = 0;
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(limitedQueue.queue(async () => {
                    counter = i;
                    await async.timeout(1);
                }));
            }
            await Promise.all(promises);
            // only the last task executed
            assert.strictEqual(counter, 4);
        });
        test('basics (with sync running task)', async () => {
            const limitedQueue = new async.LimitedQueue();
            let counter = 0;
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(limitedQueue.queue(async () => {
                    counter = i;
                }));
            }
            await Promise.all(promises);
            // only the last task executed
            assert.strictEqual(counter, 4);
        });
    });
    suite('AsyncIterableObject', function () {
        test('onReturn NOT called', async function () {
            let calledOnReturn = false;
            const iter = new async.AsyncIterableObject(writer => {
                writer.emitMany([1, 2, 3, 4, 5]);
            }, () => {
                calledOnReturn = true;
            });
            for await (const item of iter) {
                assert.strictEqual(typeof item, 'number');
            }
            assert.strictEqual(calledOnReturn, false);
        });
        test('onReturn called on break', async function () {
            let calledOnReturn = false;
            const iter = new async.AsyncIterableObject(writer => {
                writer.emitMany([1, 2, 3, 4, 5]);
            }, () => {
                calledOnReturn = true;
            });
            for await (const item of iter) {
                assert.strictEqual(item, 1);
                break;
            }
            assert.strictEqual(calledOnReturn, true);
        });
        test('onReturn called on return', async function () {
            let calledOnReturn = false;
            const iter = new async.AsyncIterableObject(writer => {
                writer.emitMany([1, 2, 3, 4, 5]);
            }, () => {
                calledOnReturn = true;
            });
            await (async function test() {
                for await (const item of iter) {
                    assert.strictEqual(item, 1);
                    return;
                }
            })();
            assert.strictEqual(calledOnReturn, true);
        });
        test('onReturn called on throwing', async function () {
            let calledOnReturn = false;
            const iter = new async.AsyncIterableObject(writer => {
                writer.emitMany([1, 2, 3, 4, 5]);
            }, () => {
                calledOnReturn = true;
            });
            try {
                for await (const item of iter) {
                    assert.strictEqual(item, 1);
                    throw new Error();
                }
            }
            catch (e) {
            }
            assert.strictEqual(calledOnReturn, true);
        });
    });
    suite('AsyncIterableSource', function () {
        test('onReturn is wired up', async function () {
            let calledOnReturn = false;
            const source = new async.AsyncIterableSource(() => { calledOnReturn = true; });
            source.emitOne(1);
            source.emitOne(2);
            source.emitOne(3);
            source.resolve();
            for await (const item of source.asyncIterable) {
                assert.strictEqual(item, 1);
                break;
            }
            assert.strictEqual(calledOnReturn, true);
        });
        test('onReturn is wired up 2', async function () {
            let calledOnReturn = false;
            const source = new async.AsyncIterableSource(() => { calledOnReturn = true; });
            source.emitOne(1);
            source.emitOne(2);
            source.emitOne(3);
            source.resolve();
            for await (const item of source.asyncIterable) {
                assert.strictEqual(typeof item, 'number');
            }
            assert.strictEqual(calledOnReturn, false);
        });
        test('emitMany emits all items', async function () {
            const source = new async.AsyncIterableSource();
            const values = [10, 20, 30, 40];
            source.emitMany(values);
            source.resolve();
            const result = [];
            for await (const item of source.asyncIterable) {
                result.push(item);
            }
            assert.deepStrictEqual(result, values);
        });
    });
    suite('cancellableIterable', () => {
        let cts;
        setup(() => {
            cts = store.add(new CancellationTokenSource());
        });
        test('should iterate through all values when not canceled', async function () {
            const asyncIterable = {
                async *[Symbol.asyncIterator]() {
                    yield 'a';
                    yield 'b';
                    yield 'c';
                }
            };
            const cancelableIterable = async.cancellableIterable(asyncIterable, cts.token);
            const result = await Iterable.asyncToArray(cancelableIterable);
            assert.deepStrictEqual(result, ['a', 'b', 'c']);
        });
        test('should stop iteration immediately when cancelled before starting', async function () {
            const values = [];
            const asyncIterable = {
                async *[Symbol.asyncIterator]() {
                    values.push('iterator created');
                    yield 'a';
                    values.push('after a');
                    yield 'b';
                    values.push('after b');
                    yield 'c';
                    values.push('after c');
                }
            };
            // Cancel before iteration starts
            cts.cancel();
            const cancelableIterable = async.cancellableIterable(asyncIterable, cts.token);
            const result = await Iterable.asyncToArray(cancelableIterable);
            assert.deepStrictEqual(result, []);
            assert.deepStrictEqual(values, []);
        });
        test('should stop iteration when cancelled during iteration', async function () {
            const cts = new CancellationTokenSource();
            const deferredA = new async.DeferredPromise();
            const deferredB = new async.DeferredPromise();
            const deferredC = new async.DeferredPromise();
            const values = [];
            const asyncIterable = {
                async *[Symbol.asyncIterator]() {
                    values.push('a yielded');
                    yield 'a';
                    await deferredA.p;
                    values.push('b yielded');
                    yield 'b';
                    await deferredB.p;
                    values.push('c yielded');
                    yield 'c';
                    await deferredC.p;
                }
            };
            for await (const value of async.cancellableIterable(asyncIterable, cts.token)) {
                if (value === 'a') {
                    deferredA.complete();
                }
                else if (value === 'b') {
                    cts.cancel();
                    deferredB.complete();
                }
                else {
                    throw new Error('Unexpected value');
                }
            }
            assert.deepStrictEqual(values, ['a yielded', 'b yielded']);
        });
        test('should handle return method correctly', async function () {
            let returnCalled = false;
            let n = 0;
            const asyncIterable = {
                async *[Symbol.asyncIterator]() {
                    try {
                        yield 'a';
                        n++;
                        yield 'b';
                        n++;
                        yield 'c';
                        n++;
                    }
                    finally {
                        returnCalled = true;
                    }
                },
            };
            // Add a return method to the iterator
            const originalIterable = asyncIterable[Symbol.asyncIterator]();
            originalIterable.return = async function () {
                returnCalled = true;
                return Promise.resolve({ done: true, value: undefined });
            };
            // Create a test-specific iterable with our mocked iterator
            const testIterable = {
                [Symbol.asyncIterator]: () => originalIterable
            };
            for await (const value of async.cancellableIterable(testIterable, cts.token)) {
                if (value === 'b') {
                    break;
                }
            }
            assert.strictEqual(returnCalled, true);
            assert.strictEqual(n < 2, true);
        });
    });
    suite('AsyncIterableProducer', () => {
        test('emitOne produces single values', async () => {
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.emitOne(1);
                emitter.emitOne(2);
                emitter.emitOne(3);
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, [1, 2, 3]);
        });
        test('emitMany produces multiple values', async () => {
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.emitMany([1, 2, 3]);
                emitter.emitMany([4, 5]);
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
        });
        test('mixed emitOne and emitMany', async () => {
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.emitOne(1);
                emitter.emitMany([2, 3]);
                emitter.emitOne(4);
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, [1, 2, 3, 4]);
        });
        test('async executor with emitOne', async () => {
            const producer = new async.AsyncIterableProducer(async (emitter) => {
                emitter.emitOne(1);
                await async.timeout(1);
                emitter.emitOne(2);
                await async.timeout(1);
                emitter.emitOne(3);
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, [1, 2, 3]);
        });
        test('async executor with emitMany', async () => {
            const producer = new async.AsyncIterableProducer(async (emitter) => {
                emitter.emitMany([1, 2]);
                await async.timeout(1);
                emitter.emitMany([3, 4]);
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, [1, 2, 3, 4]);
        });
        test('reject with error', async () => {
            const expectedError = new Error('test error');
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.emitOne(1);
                emitter.reject(expectedError);
            });
            const result = [];
            let caughtError;
            try {
                for await (const item of producer) {
                    result.push(item);
                }
            }
            catch (error) {
                caughtError = error;
            }
            assert.deepStrictEqual(result, [1]);
            assert.strictEqual(caughtError, expectedError);
        });
        test('async executor throws error', async () => {
            const expectedError = new Error('executor error');
            const producer = new async.AsyncIterableProducer(async (emitter) => {
                emitter.emitOne(1);
                throw expectedError;
            });
            const result = [];
            let caughtError;
            try {
                for await (const item of producer) {
                    result.push(item);
                }
            }
            catch (error) {
                caughtError = error;
            }
            assert.deepStrictEqual(result, [1]);
            assert.strictEqual(caughtError, expectedError);
        });
        test('empty producer', async () => {
            const producer = new async.AsyncIterableProducer(emitter => {
                // Don't emit anything
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, []);
        });
        test('async executor resolves without emitting', async () => {
            const producer = new async.AsyncIterableProducer(async (emitter) => {
                await async.timeout(1);
                // Don't emit anything
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, []);
        });
        test('multiple iterators on same producer', async () => {
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.emitMany([1, 2, 3]);
            });
            // First iterator should consume all values
            const result1 = [];
            for await (const item of producer) {
                result1.push(item);
            }
            // Second iterator should not see any values (already consumed)
            const result2 = [];
            for await (const item of producer) {
                result2.push(item);
            }
            assert.deepStrictEqual(result1, [1, 2, 3]);
            assert.deepStrictEqual(result2, []);
        });
        test('concurrent iteration', async () => {
            const producer = new async.AsyncIterableProducer(async (emitter) => {
                emitter.emitOne(1);
                await async.timeout(1);
                emitter.emitOne(2);
                await async.timeout(1);
                emitter.emitOne(3);
            });
            const iterator1 = producer[Symbol.asyncIterator]();
            const iterator2 = producer[Symbol.asyncIterator]();
            // Both iterators share the same underlying producer
            const first1 = await iterator1.next();
            const first2 = await iterator2.next();
            const second1 = await iterator1.next();
            const second2 = await iterator2.next();
            // Since they share the same producer, values are consumed in order
            assert.strictEqual(first1.value, 1);
            assert.strictEqual(first2.value, 2);
            assert.strictEqual(second1.value, 3);
            assert.strictEqual(second2.done, true);
        });
        test('executor with promise return value', async () => {
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.emitOne(1);
                emitter.emitOne(2);
                return Promise.resolve();
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, [1, 2]);
        });
        test('executor with non-promise return value', async () => {
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.emitOne(1);
                emitter.emitOne(2);
                return 'some value';
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, [1, 2]);
        });
        test('emitMany with empty array', async () => {
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.emitOne(1);
                emitter.emitMany([]);
                emitter.emitOne(2);
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, [1, 2]);
        });
        test('reject immediately without emitting', async () => {
            const expectedError = new Error('immediate error');
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.reject(expectedError);
            });
            let caughtError;
            try {
                for await (const _item of producer) {
                    assert.fail('Should not iterate when rejected immediately');
                }
            }
            catch (error) {
                caughtError = error;
            }
            assert.strictEqual(caughtError, expectedError);
        });
        test('string values', async () => {
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.emitOne('hello');
                emitter.emitMany(['world', 'test']);
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, ['hello', 'world', 'test']);
        });
        test('object values', async () => {
            const producer = new async.AsyncIterableProducer(emitter => {
                emitter.emitOne({ id: 1, name: 'first' });
                emitter.emitMany([
                    { id: 2, name: 'second' },
                    { id: 3, name: 'third' }
                ]);
            });
            const result = [];
            for await (const item of producer) {
                result.push(item);
            }
            assert.deepStrictEqual(result, [
                { id: 1, name: 'first' },
                { id: 2, name: 'second' },
                { id: 3, name: 'third' }
            ]);
        });
        test('tee - both iterators receive all values', async () => {
            // TODO: Implementation bug - executors don't await start(), causing producers to finalize early
            async function* sourceGenerator() {
                yield 1;
                yield 2;
                yield 3;
                yield 4;
                yield 5;
            }
            const [iter1, iter2] = async.AsyncIterableProducer.tee(sourceGenerator());
            const result1 = [];
            const result2 = [];
            // Consume both iterables concurrently
            await Promise.all([
                (async () => {
                    for await (const item of iter1) {
                        result1.push(item);
                    }
                })(),
                (async () => {
                    for await (const item of iter2) {
                        result2.push(item);
                    }
                })()
            ]);
            assert.deepStrictEqual(result1, [1, 2, 3, 4, 5]);
            assert.deepStrictEqual(result2, [1, 2, 3, 4, 5]);
        });
        test('tee - sequential consumption', async () => {
            // TODO: Implementation bug - executors don't await start(), causing producers to finalize early
            const source = new async.AsyncIterableProducer(emitter => {
                emitter.emitMany([1, 2, 3]);
            });
            const [iter1, iter2] = async.AsyncIterableProducer.tee(source);
            // Consume first iterator completely
            const result1 = [];
            for await (const item of iter1) {
                result1.push(item);
            }
            // Then consume second iterator
            const result2 = [];
            for await (const item of iter2) {
                result2.push(item);
            }
            assert.deepStrictEqual(result1, [1, 2, 3]);
            assert.deepStrictEqual(result2, [1, 2, 3]);
        });
        test.skip('tee - empty source', async () => {
            // TODO: Implementation bug - executors don't await start(), causing producers to finalize early
            const source = new async.AsyncIterableProducer(emitter => {
                // Emit nothing
            });
            const [iter1, iter2] = async.AsyncIterableProducer.tee(source);
            const result1 = [];
            const result2 = [];
            await Promise.all([
                (async () => {
                    for await (const item of iter1) {
                        result1.push(item);
                    }
                })(),
                (async () => {
                    for await (const item of iter2) {
                        result2.push(item);
                    }
                })()
            ]);
            assert.deepStrictEqual(result1, []);
            assert.deepStrictEqual(result2, []);
        });
        test.skip('tee - handles errors in source', async () => {
            // TODO: Implementation bug - executors don't await start(), causing producers to finalize early
            const expectedError = new Error('source error');
            const source = new async.AsyncIterableProducer(async (emitter) => {
                emitter.emitOne(1);
                emitter.emitOne(2);
                throw expectedError;
            });
            const [iter1, iter2] = async.AsyncIterableProducer.tee(source);
            let error1;
            let error2;
            const result1 = [];
            const result2 = [];
            await Promise.all([
                (async () => {
                    try {
                        for await (const item of iter1) {
                            result1.push(item);
                        }
                    }
                    catch (e) {
                        error1 = e;
                    }
                })(),
                (async () => {
                    try {
                        for await (const item of iter2) {
                            result2.push(item);
                        }
                    }
                    catch (e) {
                        error2 = e;
                    }
                })()
            ]);
            // Both iterators should have received the same values before error
            assert.deepStrictEqual(result1, [1, 2]);
            assert.deepStrictEqual(result2, [1, 2]);
            // Both should have received the error
            assert.strictEqual(error1, expectedError);
            assert.strictEqual(error2, expectedError);
        });
    });
    suite('AsyncReader', () => {
        async function* createAsyncIterator(values) {
            for (const value of values) {
                yield value;
            }
        }
        async function* createDelayedAsyncIterator(values, delayMs = 1) {
            for (const value of values) {
                await async.timeout(delayMs);
                yield value;
            }
        }
        test('read - basic functionality', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
            assert.strictEqual(await reader.read(), 1);
            assert.strictEqual(await reader.read(), 2);
            assert.strictEqual(await reader.read(), 3);
            assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
        });
        test('read - empty iterator', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([]));
            assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
            assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
        });
        test('endOfStream property', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1, 2]));
            assert.strictEqual(reader.endOfStream, false);
            await reader.read(); // 1
            assert.strictEqual(reader.endOfStream, false);
            await reader.read(); // 2
            assert.strictEqual(reader.endOfStream, false);
            await reader.read(); // end
            assert.strictEqual(reader.endOfStream, true);
        });
        test('peek - basic functionality', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
            assert.strictEqual(await reader.peek(), 1);
            assert.strictEqual(await reader.peek(), 1); // Should return same value
            assert.strictEqual(await reader.read(), 1); // Should consume the peeked value
            assert.strictEqual(await reader.peek(), 2);
            assert.strictEqual(await reader.read(), 2);
        });
        test('peek - empty iterator', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([]));
            assert.strictEqual(await reader.peek(), async.AsyncReaderEndOfStream);
        });
        test('readSyncOrThrow - throws when no data available', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1]));
            // Read the only item
            await reader.read();
            // Should throw since no more data and not at end yet
            assert.throws(() => reader.readBufferedOrThrow());
        });
        test('readSyncOrThrow - returns end of stream when at end', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([]));
            // Trigger end detection
            await reader.read();
            assert.strictEqual(reader.readBufferedOrThrow(), async.AsyncReaderEndOfStream);
        });
        test('peekSyncOrThrow - with buffered data', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
            // First peek to populate buffer
            await reader.peek();
            // Should be able to peek sync now
            assert.strictEqual(reader.peekBufferedOrThrow(), 1);
            assert.strictEqual(reader.peekBufferedOrThrow(), 1); // Should return same value
        });
        test('peekSyncOrThrow - throws when no data available', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1]));
            // Should throw since buffer is empty and we haven't loaded anything
            assert.throws(() => reader.peekBufferedOrThrow());
        });
        test('peekSyncOrThrow - returns end of stream when at end', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([]));
            // Trigger end detection
            await reader.peek();
            assert.strictEqual(reader.peekBufferedOrThrow(), async.AsyncReaderEndOfStream);
        });
        test('consumeToEnd - consumes all remaining data', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3, 4, 5]));
            // Read some data first
            assert.strictEqual(await reader.read(), 1);
            assert.strictEqual(await reader.read(), 2);
            // Consume the rest
            await reader.consumeToEnd();
            assert.strictEqual(reader.endOfStream, true);
            assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
        });
        test('consumeToEnd - on empty reader', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([]));
            await reader.consumeToEnd();
            assert.strictEqual(reader.endOfStream, true);
        });
        test('readWhile - basic functionality', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3, 4, 5]));
            const collected = [];
            await reader.readWhile(value => value < 4, async (value) => {
                collected.push(value);
            });
            assert.deepStrictEqual(collected, [1, 2, 3]);
            // Next read should return 4
            assert.strictEqual(await reader.read(), 4);
        });
        test('readWhile - stops at end of stream', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
            const collected = [];
            await reader.readWhile(value => value < 10, // Always true
            async (value) => {
                collected.push(value);
            });
            assert.deepStrictEqual(collected, [1, 2, 3]);
            assert.strictEqual(reader.endOfStream, true);
        });
        test('readWhile - empty iterator', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([]));
            const collected = [];
            await reader.readWhile(value => true, async (value) => {
                collected.push(value);
            });
            assert.deepStrictEqual(collected, []);
        });
        test('readWhile - predicate returns false immediately', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
            const collected = [];
            await reader.readWhile(value => false, // Always false
            async (value) => {
                collected.push(value);
            });
            assert.deepStrictEqual(collected, []);
            // First item should still be available
            assert.strictEqual(await reader.read(), 1);
        });
        test('peekTimeout - with immediate data', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
            const result = await reader.peekTimeout(100);
            assert.strictEqual(result, 1);
        });
        test('peekTimeout - with delayed data', async () => {
            const reader = new async.AsyncReader(createDelayedAsyncIterator([1, 2, 3], 10));
            const result = await reader.peekTimeout(50);
            assert.strictEqual(result, 1);
        });
        test('peekTimeout - timeout occurs', async () => {
            return runWithFakedTimers({}, async () => {
                const reader = new async.AsyncReader(createDelayedAsyncIterator([1, 2, 3], 50));
                const result = await reader.peekTimeout(10);
                assert.strictEqual(result, undefined);
                await reader.consumeToEnd();
            });
        });
        test('peekTimeout - empty iterator', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([]));
            const result = await reader.peekTimeout(10);
            assert.strictEqual(result, async.AsyncReaderEndOfStream);
        });
        test('peekTimeout - after consuming all data', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1]));
            await reader.consumeToEnd();
            const result = await reader.peekTimeout(10);
            assert.strictEqual(result, async.AsyncReaderEndOfStream);
        });
        test('mixed operations - complex scenario', async () => {
            const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
            // Peek first
            assert.strictEqual(await reader.peek(), 1);
            // Read some
            assert.strictEqual(await reader.read(), 1);
            assert.strictEqual(await reader.read(), 2);
            // Peek again
            assert.strictEqual(await reader.peek(), 3);
            // Read while
            const collected = [];
            await reader.readWhile(value => value <= 5, async (value) => collected.push(value));
            assert.deepStrictEqual(collected, [3, 4, 5]);
            // Use sync operations
            assert.strictEqual(await reader.peek(), 6);
            assert.strictEqual(reader.peekBufferedOrThrow(), 6);
            assert.strictEqual(reader.readBufferedOrThrow(), 6);
            // Consume rest
            await reader.consumeToEnd();
            assert.strictEqual(reader.endOfStream, true);
        });
        test('string values', async () => {
            const reader = new async.AsyncReader(createAsyncIterator(['hello', 'world', 'test']));
            assert.strictEqual(await reader.read(), 'hello');
            assert.strictEqual(await reader.peek(), 'world');
            assert.strictEqual(await reader.read(), 'world');
            assert.strictEqual(await reader.read(), 'test');
            assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
        });
        test('object values', async () => {
            const objects = [
                { id: 1, name: 'first' },
                { id: 2, name: 'second' },
                { id: 3, name: 'third' }
            ];
            const reader = new async.AsyncReader(createAsyncIterator(objects));
            assert.deepStrictEqual(await reader.read(), { id: 1, name: 'first' });
            assert.deepStrictEqual(await reader.peek(), { id: 2, name: 'second' });
            assert.deepStrictEqual(await reader.read(), { id: 2, name: 'second' });
        });
        test('concurrent operations', async () => {
            const reader = new async.AsyncReader(createDelayedAsyncIterator([1, 2, 3], 5));
            // Start multiple operations concurrently
            const peekPromise = reader.peek();
            const readPromise = reader.read();
            const [peekResult, readResult] = await Promise.all([peekPromise, readPromise]);
            // Both should return the same first value
            assert.strictEqual(peekResult, 1);
            assert.strictEqual(readResult, 1);
            // Next read should get the second value
            assert.strictEqual(await reader.read(), 2);
        });
        test('buffer management - single extend buffer call', async () => {
            let nextCallCount = 0;
            const mockIterator = {
                async next() {
                    nextCallCount++;
                    if (nextCallCount === 1) {
                        await async.timeout(1);
                        return { value: 1, done: false };
                    }
                    return { value: undefined, done: true };
                }
            };
            const reader = new async.AsyncReader(mockIterator);
            // Multiple concurrent operations should only trigger one extend buffer call
            const promises = [
                reader.peek(),
                reader.peek(),
                reader.read()
            ];
            await Promise.all(promises);
            // Should have called next() only once despite multiple concurrent operations
            assert.strictEqual(nextCallCount, 1);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXN5bmMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9jb21tb24vYXN5bmMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxLQUFLLEtBQUssTUFBTSx1QkFBdUIsQ0FBQztBQUMvQyxPQUFPLEtBQUssY0FBYyxNQUFNLHlCQUF5QixDQUFDO0FBQzFELE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMxRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM3RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDOUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzlELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRXBELEtBQUssQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO0lBRW5CLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsS0FBSyxDQUFDLG1CQUFtQixFQUFFO1FBQzFCLElBQUksQ0FBQywwQ0FBMEMsRUFBRTtZQUNoRCxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDakIsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxFQUFFO2dCQUNyRCxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNsRSxPQUFPLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEdBQWEsQ0FBQyxDQUFDLENBQUM7WUFDOUMsQ0FBQyxDQUFDLENBQUM7WUFDSCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRTtnQkFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hDLE1BQU0sQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNyQyxDQUFDLENBQUMsQ0FBQztZQUNILE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqQixPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxtQkFBbUI7WUFDckMsT0FBTyxNQUFNLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw2Q0FBNkMsRUFBRTtZQUNuRCxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDakIsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxFQUFFO2dCQUNyRCxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNsRSxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUIsQ0FBQyxDQUFDLENBQUM7WUFDSCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRTtnQkFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hDLE1BQU0sQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNyQyxDQUFDLENBQUMsQ0FBQztZQUNILE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqQixPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdCQUF3QixFQUFFO1lBRTlCLE1BQU0sS0FBSyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7WUFFcEMsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEtBQUssRUFBQyxLQUFLLEVBQUMsRUFBRTtnQkFDM0QsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDLENBQUMsQ0FBQztZQUNILE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFO2dCQUV6QyxNQUFNLENBQUMsRUFBRSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BDLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzdCLENBQUMsQ0FBQyxDQUFDO1lBRUgsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBRUgsc0VBQXNFO1FBQ3RFLCtEQUErRDtRQUMvRCxJQUFJLENBQUMsd0JBQXdCLEVBQUU7WUFDOUIsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO1lBRTNCLE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxFQUFFO2dCQUNoRSxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUMxQixLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2RSxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUIsQ0FBQyxDQUFDLENBQUM7WUFFSCxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRTFCLE1BQU0sT0FBTyxHQUFHLGtCQUFrQjtpQkFDaEMsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQztpQkFDNUIsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUVwQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM1QixLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRTFCLE9BQU8sT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxDQUFDLGFBQWEsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakksQ0FBQyxDQUFDLENBQUM7UUFFSCx5RkFBeUY7UUFDekYsSUFBSSxDQUFDLHlCQUF5QixFQUFFO1lBQy9CLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztZQUUzQixNQUFNLGtCQUFrQixHQUFHLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsRUFBRTtnQkFDaEUsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDMUIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkUsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEQsQ0FBQyxDQUFDLENBQUM7WUFFSCxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRTFCLE1BQU0sT0FBTyxHQUFHLGtCQUFrQjtpQkFDaEMsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQztpQkFDNUIsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUVwQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM1QixLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRTFCLE9BQU8sT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxDQUFDLGFBQWEsRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakksQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNENBQTRDLEVBQUUsS0FBSztZQUN2RCxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7WUFFM0IsTUFBTSxrQkFBa0IsR0FBRyxLQUFLLENBQUMsdUJBQXVCLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFO2dCQUN0RSxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUUxQixNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZFLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUM1QixLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQzNCLENBQUMsQ0FBQyxDQUFDO1lBRUgsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUUxQixNQUFNLE9BQU8sR0FBRyxrQkFBa0I7aUJBQ2hDLElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUM7aUJBQzVCLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFFcEMsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUMsYUFBYSxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqSSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxrQkFBa0IsRUFBRSxLQUFLO1lBQzdCLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsRUFBRTtnQkFDckQsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzFDLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLENBQUM7WUFDN0IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxXQUFXLEVBQUU7UUFDbEIsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNqQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7WUFDZCxNQUFNLE9BQU8sR0FBRyxHQUFHLEVBQUU7Z0JBQ3BCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLENBQUMsQ0FBQztZQUVGLE1BQU0sU0FBUyxHQUFHLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBRXhDLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQztnQkFDbEIsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM3RSxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdFLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0UsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM3RSxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDN0UsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7WUFDbEIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsTUFBTSxPQUFPLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUUzRCxNQUFNLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUV4QyxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUM7Z0JBQ2xCLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0UsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM3RSxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdFLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0UsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzdFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNaLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQztvQkFDbEIsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUM3RSxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzdFLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDN0UsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUM3RSxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQzdFLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUU7WUFDckQsTUFBTSxjQUFjLEdBQUcsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUFDLEdBQUcsRUFBRTtnQkFDMUMsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxDQUFDLENBQUM7WUFFRixNQUFNLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUV4QyxNQUFNLFFBQVEsR0FBbUIsRUFBRSxDQUFDO1lBRXBDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3RixRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0YsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTdGLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMxQyxJQUFJLFlBQVksR0FBRyxDQUFDLENBQUM7WUFDckIsTUFBTSxPQUFPLEdBQUcsS0FBSyxJQUFJLEVBQUU7Z0JBQzFCLFlBQVksRUFBRSxDQUFDO2dCQUNmLE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QixDQUFDLENBQUM7WUFFRixNQUFNLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN4QyxNQUFNLFFBQVEsR0FBbUIsRUFBRSxDQUFDO1lBRXBDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUVwQixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDNUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDM0MsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO1lBQ3JCLE1BQU0sT0FBTyxHQUFHLEtBQUssSUFBSSxFQUFFO2dCQUMxQixZQUFZLEVBQUUsQ0FBQztnQkFDZixPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekIsQ0FBQyxDQUFDO1lBRUYsTUFBTSxTQUFTLEdBQUcsSUFBSSxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDeEMsTUFBTSxRQUFRLEdBQW1CLEVBQUUsQ0FBQztZQUVwQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDcEIsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFFeEMsSUFBSSxDQUFDO2dCQUNKLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDNUIsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUM1QixDQUFDO1lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztnQkFDZCxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxTQUFTLEVBQUU7UUFDaEIsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUU7WUFDbkIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsTUFBTSxPQUFPLEdBQUcsR0FBRyxFQUFFO2dCQUNwQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNqQyxDQUFDLENBQUM7WUFFRixNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxRQUFRLEdBQW1CLEVBQUUsQ0FBQztZQUVwQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUUvQixRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3SCxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFFOUIsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0gsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBRTlCLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdILE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUU5QixPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDdEMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDaEMsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7WUFDbkMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsTUFBTSxPQUFPLEdBQUcsR0FBRyxFQUFFO2dCQUNwQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNqQyxDQUFDLENBQUM7WUFFRixNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ2pFLE1BQU0sUUFBUSxHQUFtQixFQUFFLENBQUM7WUFFcEMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFFL0IsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0gsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBRTlCLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdILE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUU5QixRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3SCxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFFOUIsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ3RDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQ2hDLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1lBQzlCLElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDckQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBTyxHQUFHLENBQUMsQ0FBQztnQkFDL0QsTUFBTSxPQUFPLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3RCxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFFM0IsSUFBSSxDQUFDO29CQUNKLE1BQU0sT0FBTyxDQUFDO29CQUNkLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztnQkFDbkMsQ0FBQztnQkFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO29CQUNkLEtBQUs7Z0JBQ04sQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUMvQyxNQUFNLGdCQUFnQixHQUFHLElBQUksS0FBSyxDQUFDLGdCQUFnQixDQUFPLEdBQUcsQ0FBQyxDQUFDO2dCQUMvRCxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDM0IsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFFLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZUFBZSxFQUFFO1lBQ3JCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztZQUNkLE1BQU0sT0FBTyxHQUFHLEdBQUcsRUFBRTtnQkFDcEIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDakMsQ0FBQyxDQUFDO1lBRUYsTUFBTSxPQUFPLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXJDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBRS9CLE1BQU0sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDNUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2YsQ0FBQyxFQUFFLEdBQUcsRUFBRTtnQkFDUCxNQUFNLENBQUMsSUFBSSxFQUFFLHVCQUF1QixDQUFDLENBQUM7WUFDdkMsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDOUIsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pCLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBRS9CLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMseUJBQXlCLEVBQUU7WUFDL0IsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsTUFBTSxPQUFPLEdBQUcsR0FBRyxFQUFFO2dCQUNwQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNqQyxDQUFDLENBQUM7WUFFRixNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBRWpFLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBRS9CLE1BQU0sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDNUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2YsQ0FBQyxFQUFFLEdBQUcsRUFBRTtnQkFDUCxNQUFNLENBQUMsSUFBSSxFQUFFLHVCQUF1QixDQUFDLENBQUM7WUFDdkMsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDOUIsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pCLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBRS9CLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMkNBQTJDLEVBQUU7WUFDakQsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsTUFBTSxPQUFPLEdBQUcsR0FBRyxFQUFFO2dCQUNwQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNqQyxDQUFDLENBQUM7WUFFRixNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxRQUFRLEdBQW1CLEVBQUUsQ0FBQztZQUVwQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUUvQixRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUU5QixRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUU5QixRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUU5QixPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7WUFFakIsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ3RDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQ2hDLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMscUNBQXFDLEVBQUU7WUFDM0MsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsTUFBTSxPQUFPLEdBQUcsR0FBRyxFQUFFO2dCQUNwQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNqQyxDQUFDLENBQUM7WUFFRixNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsSUFBSSxRQUFRLEdBQW1CLEVBQUUsQ0FBQztZQUVsQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUUvQixNQUFNLENBQUMsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO2dCQUNsRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDOUIsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBRS9CLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztnQkFFOUIsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFLEdBQUcsTUFBTSxDQUFDLElBQUksRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDMUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO2dCQUU5QixPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBRWpCLE1BQU0sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtvQkFDekMsUUFBUSxHQUFHLEVBQUUsQ0FBQztvQkFFZCxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztvQkFFL0IsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdkgsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO29CQUU5QixRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN2SCxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7b0JBRTlCLE1BQU0sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTt3QkFDekMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7b0JBQ2hDLENBQUMsQ0FBQyxDQUFDO29CQUVILE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztvQkFFOUIsT0FBTyxDQUFDLENBQUM7Z0JBQ1YsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsT0FBTyxDQUFDLENBQUM7WUFDVixDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUU5QixPQUFPLENBQUMsQ0FBQztRQUNWLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFO1lBQ2xELE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUU7Z0JBQzFDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixDQUFDLENBQUM7WUFFRixNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxRQUFRLEdBQW1CLEVBQUUsQ0FBQztZQUVwQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUUvQixRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0YsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdGLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUU3RixNQUFNLENBQUMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ3pDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQ2hDLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBRTlCLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxVQUFVLEVBQUUsR0FBRyxFQUFFO1FBQ3RCLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO1lBQ25CLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUU7Z0JBQzFDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixDQUFDLENBQUM7WUFFRixPQUFPLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0JBQ3JCLGNBQWMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pCLGNBQWMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pCLGNBQWMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pCLGNBQWMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pCLGNBQWMsQ0FBQyxDQUFDLENBQUM7YUFDakIsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO2dCQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNqQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNqQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRTtRQUNyQixJQUFJLENBQUMsOEJBQThCLEVBQUU7WUFDcEMsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO1lBQ3ZCLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUU7Z0JBQzFDLGNBQWMsRUFBRSxDQUFDO2dCQUNqQixNQUFNLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUMzQixPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLGNBQWMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyRSxDQUFDLENBQUM7WUFFRixNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFckMsTUFBTSxRQUFRLEdBQW1CLEVBQUUsQ0FBQztZQUNwQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFN0YsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO2dCQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ25DLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM3RCxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFHSCxLQUFLLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtRQUNuQixJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2QsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFaEMsSUFBSSxXQUFXLEdBQUcsS0FBSyxDQUFDO1lBQ3hCLE1BQU0sRUFBRSxHQUFHLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUV0RSxJQUFJLFlBQVksR0FBRyxLQUFLLENBQUM7WUFDekIsTUFBTSxFQUFFLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxDQUFDO1lBRW5FLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVsQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2hCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVsQyxNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzFCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNsQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xDLE1BQU0sQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDekIsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw0QkFBNEIsRUFBRSxLQUFLO1lBQ3ZDLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRWhDLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztZQUNwQixNQUFNLElBQUksR0FBRyxLQUFLLElBQUksRUFBRTtnQkFDdkIsTUFBTSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixXQUFXLEVBQUUsQ0FBQztnQkFDZCxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxlQUFlO1lBQ2pDLENBQUMsQ0FBQztZQUVGLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDN0IsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsQixLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUdsQyxNQUFNLEVBQUUsQ0FBQztZQUVULE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGVBQWUsRUFBRSxLQUFLO1lBQzFCLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRWhDLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztZQUNwQixNQUFNLElBQUksR0FBRyxLQUFLLElBQUksRUFBRTtnQkFDdkIsTUFBTSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixXQUFXLEVBQUUsQ0FBQztnQkFDZCxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxhQUFhO2dCQUM1QixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyw2QkFBNkI7WUFDakUsQ0FBQyxDQUFDO1lBRUYsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM3QixLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xCLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRWxDLE1BQU0sRUFBRSxDQUFDO1lBQ1QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsbUJBQW1CO1lBR3RELE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDN0IsTUFBTSxFQUFFLENBQUM7WUFDVCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNwQyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxQkFBcUIsRUFBRSxLQUFLO1lBQ2hDLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRWhDLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztZQUNwQixNQUFNLElBQUksR0FBRyxLQUFLLElBQUksRUFBRTtnQkFDdkIsTUFBTSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixXQUFXLEVBQUUsQ0FBQztnQkFDZCxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxhQUFhO1lBQzdCLENBQUMsQ0FBQztZQUVGLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFN0IsTUFBTSxFQUFFLENBQUM7WUFDVCxNQUFNLEVBQUUsQ0FBQyxDQUFDLGtEQUFrRDtZQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNuQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMscUJBQXFCLEVBQUUsS0FBSztZQUNoQyxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUVoQyxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDcEIsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUU7Z0JBQzlCLE9BQU8sR0FBRyxJQUFJLENBQUM7WUFDaEIsQ0FBQyxDQUFDLENBQUM7WUFFSCxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFZCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLHFCQUFxQjtZQUN6RCxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDWixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsY0FBYyxFQUFFLEtBQUs7WUFDekIsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFaEMsTUFBTSxVQUFVLEdBQUcsSUFBSTtnQkFBQTtvQkFDZCxTQUFJLEdBQUcsQ0FBQyxDQUFDO2dCQUlsQixDQUFDO2dCQUhBLElBQUk7b0JBQ0gsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3BCLENBQUM7YUFDRCxDQUFDO1lBRUYsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO1lBQ3JCLElBQUksY0FBYyxHQUFHLENBQUMsQ0FBQztZQUN2QixJQUFJLGNBQWMsR0FBRyxDQUFDLENBQUM7WUFDdkIsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUU7Z0JBQzlCLFlBQVksR0FBRyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbEMsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRTtnQkFDM0IsMkJBQTJCO2dCQUMzQixjQUFjLEdBQUcsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNuQyxPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMxQixDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUU7Z0JBQ2pDLE1BQU0sS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDeEIsY0FBYyxHQUFHLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNwQyxDQUFDLENBQUMsQ0FBQztZQUdILE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRTVCLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3RDLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3RDLE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXBDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNaLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxLQUFLO1lBQzFDLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRWhDLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztZQUNuQixNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxHQUFHLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkQsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzdCLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUM3QixLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDN0IsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzdCLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVsQyxNQUFNLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUV2QixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVsQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDWixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZUFBZSxFQUFFO1lBQ3JCLE9BQU8sa0JBQWtCLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRTtnQkFDbEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBRWhDLE1BQU0sR0FBRyxHQUFhLEVBQUUsQ0FBQztnQkFFekIsTUFBTSxFQUFFLEdBQUcsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMvRCxNQUFNLEVBQUUsR0FBRyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNELE1BQU0sRUFBRSxHQUFHLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDL0QsTUFBTSxFQUFFLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzRCxNQUFNLEVBQUUsR0FBRyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRTFELEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2hCLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2hCLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2hCLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2hCLE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO29CQUNoQyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUM5QixNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQy9CLENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywrQ0FBK0MsRUFBRTtZQUNyRCxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUVoQyxNQUFNLEdBQUcsR0FBYSxFQUFFLENBQUM7WUFDekIsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO1lBRWxCLE1BQU0sRUFBRSxHQUFHLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvRCxNQUFNLEVBQUUsR0FBRyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0QsTUFBTSxFQUFFLEdBQUcsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEYsTUFBTSxFQUFFLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNELE1BQU0sRUFBRSxHQUFHLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUUxRCxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2hCLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDaEIsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQztZQUNwRCxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2hCLE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNoQyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2pCLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM5QixNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHlCQUF5QixFQUFFO1lBQy9CLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRWhDLE1BQU0sR0FBRyxHQUFhLEVBQUUsQ0FBQztZQUV6QixNQUFNLEVBQUUsR0FBRyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0QsTUFBTSxFQUFFLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNELE1BQU0sRUFBRSxHQUFHLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvRCxNQUFNLEVBQUUsR0FBRyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0QsTUFBTSxFQUFFLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTFELE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNoQyxPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtvQkFDaEMsT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7d0JBQ2hDLE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFOzRCQUNoQyxPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQ0FDaEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0NBQzlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dDQUM5QixNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQ0FDOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0NBQzlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDOzRCQUMvQixDQUFDLENBQUMsQ0FBQzt3QkFDSixDQUFDLENBQUMsQ0FBQztvQkFDSixDQUFDLENBQUMsQ0FBQztnQkFDSixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsUUFBUSxFQUFFLEtBQUs7WUFDbkIsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFaEMsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQ3BCLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFFOUUsTUFBTSxHQUFHLEdBQWEsRUFBRSxDQUFDO1lBRXpCLE1BQU0sRUFBRSxHQUFHLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzRCxNQUFNLEVBQUUsR0FBRyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0QsTUFBTSxFQUFFLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTFELE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDM0IsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMzQixLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRWhCLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNaLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDcEIsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7b0JBQ1osTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNyQixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxTQUFTLENBQUM7WUFDaEIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNwQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDM0IsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLO1lBQ25CLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBRXhDLE1BQU0sS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsa0NBQWtDO1lBRTdELElBQUksS0FBSyxHQUFHLEtBQUssQ0FBQztZQUNsQixLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsS0FBSyxJQUFJLEVBQUUsR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEUsTUFBTSxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyw4Q0FBOEM7WUFDekUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFaEMsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO1lBQ2xCLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEtBQUssSUFBSSxFQUFFLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVFLE1BQU0sS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsOENBQThDO1lBQ3pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBRWhDLHFCQUFxQjtZQUNyQixNQUFNLEVBQUUsR0FBRyxJQUFJLEtBQUssQ0FBQyxlQUFlLEVBQVEsQ0FBQztZQUM3QyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRW5ELElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQztZQUNwQixLQUFLLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsQ0FBQztZQUMvQyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNuQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNwQixNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFbEMscUJBQXFCO1lBQ3JCLE1BQU0sRUFBRSxHQUFHLElBQUksS0FBSyxDQUFDLGVBQWUsRUFBUSxDQUFDO1lBQzdDLE1BQU0sRUFBRSxHQUFHLElBQUksS0FBSyxDQUFDLGVBQWUsRUFBUSxDQUFDO1lBQzdDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXpELE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDaEIsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFFL0MsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2hCLE1BQU0sS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7UUFDbkIsSUFBSSxDQUFDLGNBQWMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMvQixPQUFPLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUM3RCxJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7Z0JBRWhCLE1BQU0sR0FBRyxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7b0JBQ2xDLE9BQU8sRUFBRSxDQUFDO29CQUNWLElBQUksT0FBTyxHQUFHLENBQUMsRUFBRSxDQUFDO3dCQUNqQixPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztvQkFDMUMsQ0FBQztvQkFFRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzlCLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBRVYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDL0IsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxZQUFZLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDN0IsT0FBTyxrQkFBa0IsQ0FBQyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDN0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3hDLElBQUksQ0FBQztvQkFDSixNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFO3dCQUN0QixPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7b0JBQ3RDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ1gsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNoQixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDbEMsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7UUFDaEMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEtBQUs7WUFDN0IsTUFBTSxjQUFjLEdBQUcsSUFBSSxLQUFLLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUV0RCxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDM0MsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUVuQyxvQ0FBb0M7WUFDcEMsTUFBTSxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUMvQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUV2Qyx3REFBd0Q7WUFDeEQsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDdEMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2RCxNQUFNLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUVsQyxNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3ZELE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMkNBQTJDLEVBQUUsS0FBSztZQUN0RCxNQUFNLGNBQWMsR0FBRyxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBRXRELElBQUksV0FBVyxHQUFHLEtBQUssQ0FBQztZQUN4QixjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxXQUFXLEdBQUcsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFcEYsNEJBQTRCO1lBQzVCLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQztZQUN2QixNQUFNLEdBQUcsR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFVBQVUsR0FBRyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV6RyxNQUFNLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRXRDLE1BQU0sR0FBRyxDQUFDO1lBQ1YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN2QixNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywrQ0FBK0MsRUFBRSxLQUFLO1lBQzFELE1BQU0sY0FBYyxHQUFHLElBQUksS0FBSyxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFFdEQsSUFBSSxXQUFXLEdBQUcsS0FBSyxDQUFDO1lBQ3hCLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFdBQVcsR0FBRyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVwRixzQ0FBc0M7WUFDdEMsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO1lBQ3ZCLE1BQU0sR0FBRyxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsVUFBVSxHQUFHLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXBHLE1BQU0sR0FBRyxDQUFDO1lBQ1YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN2QixNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLO1lBQy9DLE1BQU0sY0FBYyxHQUFHLElBQUksS0FBSyxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFFdEQsTUFBTSxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDNUIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUs7WUFDbEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxLQUFLLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUV0RCxJQUFJLFdBQVcsR0FBRyxLQUFLLENBQUM7WUFDeEIsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsV0FBVyxHQUFHLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXBGLE1BQU0sY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzVCLE1BQU0sQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGtDQUFrQyxFQUFFLEtBQUs7WUFDN0MsTUFBTSxjQUFjLEdBQUcsSUFBSSxLQUFLLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUV0RCxJQUFJLFdBQVcsR0FBRyxLQUFLLENBQUM7WUFDeEIsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsV0FBVyxHQUFHLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXBGLHNDQUFzQztZQUN0QyxJQUFJLFVBQVUsR0FBRyxLQUFLLENBQUM7WUFDdkIsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxVQUFVLEdBQUcsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFeEYsTUFBTSxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDNUIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN2QixNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUN2QyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDeEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUUsS0FBSztZQUMxRCxNQUFNLGNBQWMsR0FBRyxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBRXRELElBQUksV0FBVyxHQUFHLEtBQUssQ0FBQztZQUN4QixjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxXQUFXLEdBQUcsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFcEYsc0NBQXNDO1lBQ3RDLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQztZQUN0QixNQUFNLFFBQVEsR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFNBQVMsR0FBRyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV4RyxJQUFJLFVBQVUsR0FBRyxLQUFLLENBQUM7WUFDdkIsTUFBTSxTQUFTLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxVQUFVLEdBQUcsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFMUcsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO1lBQ3RCLE1BQU0sUUFBUSxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsU0FBUyxHQUFHLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXhHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3ZCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN0QixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDdkIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN0QixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxrQkFBa0IsRUFBRSxLQUFLO1lBQzdCLE1BQU0sY0FBYyxHQUFHLElBQUksS0FBSyxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDdEQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHVCQUF1QixFQUFFLENBQUMsQ0FBQztZQUU1RCxJQUFJLGdCQUFnQixHQUFHLEtBQUssQ0FBQztZQUM3QixNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbkQsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxDQUFDO1lBQzlELGNBQWMsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUUvQixNQUFNLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDNUIsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO1FBQy9CLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN2QyxJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUM7WUFDZixNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO1lBRW5ELE1BQU0sS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV2QixNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUU3QixDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDYixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN0QyxJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUM7WUFDZixNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO1lBQ25ELENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUVaLE1BQU0sS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV2QixNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMvQixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN4QyxJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUM7WUFDZixNQUFNLENBQUMsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQ2hDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUUvQyxNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFdkIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFN0IsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2IsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMscUNBQXFDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdEQsSUFBSSxFQUFFLEdBQUcsS0FBSyxDQUFDO1lBQ2YsTUFBTSxDQUFDLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUNoQyxNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDekQsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBRVosTUFBTSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXZCLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRTlCLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNiLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2pELElBQUksRUFBRSxHQUFHLEtBQUssQ0FBQztZQUNmLE1BQU0sQ0FBQyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7WUFDaEMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQy9DLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUVaLE1BQU0sS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV2QixNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMvQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ25DLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7UUFDckQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUU1RCxJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdEIsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbEYsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBRWIsTUFBTSxDQUFDLENBQUM7UUFFUixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDdEIsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3JCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGFBQWEsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM5QixNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1FBRXJELGVBQWU7UUFDZixJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDckIsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBRXRCLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7UUFDN0QsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsQ0FBQztRQUM5RixHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7UUFFYixNQUFNLEVBQUUsQ0FBQztRQUVULE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN0QixNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUM7UUFFckIsZUFBZTtRQUNmLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFFakIsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUM3RCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckQsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQ2hHLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUViLE1BQU0sRUFBRSxDQUFDO1FBRVQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNyQixNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDdEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDakMsTUFBTSxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsY0FBYyxFQUFVLENBQUM7UUFFN0MsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDakUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFaEMsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQzFFLE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUMzQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUU7WUFDUixpQkFBaUI7WUFDakIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQyxDQUFDO1FBRUgsaURBQWlEO1FBQ2pELE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2pDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztRQUNaLE1BQU0sT0FBTyxHQUFHLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFM0MsR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUVULE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzVDLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDM0IsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN6QixNQUFNLENBQUMsR0FBRyxNQUFNLEtBQUssQ0FBQyxhQUFhLENBQUM7Z0JBQ25DLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUNsQixPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDbEIsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7YUFDbEIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNqQixNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxtQkFBbUIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNwQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6RixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxvQkFBb0IsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekYsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFCLElBQUksR0FBc0IsQ0FBQztZQUMzQixNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsdUJBQXVCLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxFQUFFO2dCQUNyRCxHQUFHLEdBQUcsRUFBRSxDQUFDO2dCQUNULE1BQU0sS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzdCLE9BQU8sQ0FBQyxDQUFDO1lBQ1YsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLEdBQXNCLENBQUM7WUFDM0IsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsRUFBRTtnQkFDckQsR0FBRyxHQUFHLEVBQUUsQ0FBQztnQkFDVCxNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUMzQixPQUFPLENBQUMsQ0FBQztZQUNWLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVFLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBSSxDQUFDLHVCQUF1QixFQUFFLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1lBQzFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBSSxDQUFDLHVCQUF1QixFQUFFLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQzNFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3JDLElBQUksR0FBc0IsQ0FBQztZQUMzQixNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsdUJBQXVCLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxFQUFFO2dCQUNyRCxHQUFHLEdBQUcsRUFBRSxDQUFDO2dCQUNULE1BQU0sS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzdCLE9BQU8sQ0FBQyxDQUFDO1lBQ1YsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLEdBQXNCLENBQUM7WUFDM0IsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsRUFBRTtnQkFDckQsR0FBRyxHQUFHLEVBQUUsQ0FBQztnQkFDVCxNQUFNLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUMzQixNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzFCLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNqRyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUksQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztZQUMxRSxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUksQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUMzRSxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtRQUM3QixJQUFJLENBQUMsVUFBVSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzNCLE1BQU0sUUFBUSxHQUFHLElBQUksS0FBSyxDQUFDLGVBQWUsRUFBVSxDQUFDO1lBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMvQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxRQUFRLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMvQyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxTQUFTLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDMUIsTUFBTSxRQUFRLEdBQUcsSUFBSSxLQUFLLENBQUMsZUFBZSxFQUFVLENBQUM7WUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQy9DLE1BQU0sR0FBRyxHQUFHLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2hDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQy9DLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMxQixNQUFNLFFBQVEsR0FBRyxJQUFJLEtBQUssQ0FBQyxlQUFlLEVBQVUsQ0FBQztZQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDL0MsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2xCLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDdEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQy9DLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3JELE1BQU0sUUFBUSxHQUFHLElBQUksS0FBSyxDQUFDLGVBQWUsRUFBVSxDQUFDO1lBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMvQyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFOUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN0QixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBRTlDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0QixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQy9DLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1FBQzlCLElBQUksQ0FBQyxVQUFVLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDM0IsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM5QixNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUUxQyxNQUFNLE1BQU0sR0FBRyxNQUFNLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFTLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRWxFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxtQkFBbUIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNwQyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQyxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTlCLE1BQU0sTUFBTSxHQUFHLE1BQU0s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