/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as async from 'vs/base/common/async';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';

suite('Async', () => {

	test('cancelablePromise - set token, don\'t wait for inner promise', function () {
		let canceled = 0;
		let promise = async.createCancelablePromise(token => {
			token.onCancellationRequested(_ => { canceled += 1; });
			return new Promise(resolve => { /*never*/ });
		});
		let result = promise.then(_ => assert.ok(false), err => {
			assert.equal(canceled, 1);
			assert.ok(isPromiseCanceledError(err));
		});
		promise.cancel();
		promise.cancel(); // cancel only once
		return result;
	});

	test('cancelablePromise - cancel despite inner promise being resolved', function () {
		let canceled = 0;
		let promise = async.createCancelablePromise(token => {
			token.onCancellationRequested(_ => { canceled += 1; });
			return Promise.resolve(1234);
		});
		let result = promise.then(_ => assert.ok(false), err => {
			assert.equal(canceled, 1);
			assert.ok(isPromiseCanceledError(err));
		});
		promise.cancel();
		return result;
	});

	// test('Cancel callback behaviour', async function () {
	// 	let withCancelCallback = new WinJsPromise(() => { }, () => { });
	// 	let withoutCancelCallback = new TPromise(() => { });

	// 	withCancelCallback.cancel();
	// 	(withoutCancelCallback as WinJsPromise).cancel();

	// 	await withCancelCallback.then(undefined, err => { assert.ok(isPromiseCanceledError(err)); });
	// 	await withoutCancelCallback.then(undefined, err => { assert.ok(isPromiseCanceledError(err)); });
	// });

	// Cancelling a sync cancelable promise will fire the cancelled token.
	// Also, every `then` callback runs in another execution frame.
	test('CancelablePromise execution order (sync)', function () {
		const order: string[] = [];

		const cancellablePromise = async.createCancelablePromise(token => {
			order.push('in callback');
			token.onCancellationRequested(_ => order.push('cancelled'));
			return Promise.resolve(1234);
		});

		order.push('afterCreate');

		const promise = cancellablePromise
			.then(null, err => null)
			.then(() => order.push('finally'));

		cancellablePromise.cancel();
		order.push('afterCancel');

		return promise.then(() => assert.deepEqual(order, ['in callback', 'afterCreate', 'cancelled', 'afterCancel', 'finally']));
	});

	// Cancelling an async cancelable promise is just the same as a sync cancellable promise.
	test('CancelablePromise execution order (async)', function () {
		const order: string[] = [];

		const cancellablePromise = async.createCancelablePromise(token => {
			order.push('in callback');
			token.onCancellationRequested(_ => order.push('cancelled'));
			return new Promise(c => setTimeout(c.bind(1234), 0));
		});

		order.push('afterCreate');

		const promise = cancellablePromise
			.then(null, err => null)
			.then(() => order.push('finally'));

		cancellablePromise.cancel();
		order.push('afterCancel');

		return promise.then(() => assert.deepEqual(order, ['in callback', 'afterCreate', 'cancelled', 'afterCancel', 'finally']));
	});

	// // Cancelling a sync tpromise will NOT cancel the promise, since it has resolved already.
	// // Every `then` callback runs sync in the same execution frame, thus `finally` executes
	// // before `afterCancel`.
	// test('TPromise execution order (sync)', function () {
	// 	const order = [];
	// 	let promise = new WinJsPromise(resolve => {
	// 		order.push('in executor');
	// 		resolve(1234);
	// 	}, () => order.push('cancelled'));

	// 	order.push('afterCreate');

	// 	promise = promise
	// 		.then(null, err => null)
	// 		.then(() => order.push('finally'));

	// 	promise.cancel();
	// 	order.push('afterCancel');

	// 	return promise.then(() => assert.deepEqual(order, ['in executor', 'afterCreate', 'finally', 'afterCancel']));
	// });

	// // Cancelling an async tpromise will cancel the promise.
	// // Every `then` callback runs sync on the same execution frame as the `cancel` call,
	// // so finally still executes before `afterCancel`.
	// test('TPromise execution order (async)', function () {
	// 	const order = [];
	// 	let promise = new WinJsPromise(resolve => {
	// 		order.push('in executor');
	// 		setTimeout(() => resolve(1234));
	// 	}, () => order.push('cancelled'));

	// 	order.push('afterCreate');

	// 	promise = promise
	// 		.then(null, err => null)
	// 		.then(() => order.push('finally'));

	// 	promise.cancel();
	// 	order.push('afterCancel');

	// 	return promise.then(() => assert.deepEqual(order, ['in executor', 'afterCreate', 'cancelled', 'finally', 'afterCancel']));
	// });

	test('cancelablePromise - get inner result', async function () {
		let promise = async.createCancelablePromise(token => {
			return async.timeout(12).then(_ => 1234);
		});

		let result = await promise;
		assert.equal(result, 1234);
	});

	test('Throttler - non async', function () {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let throttler = new async.Throttler();

		return TPromise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 3); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 5); })
		]);
	});

	test('Throttler', () => {
		let count = 0;
		let factory = () => TPromise.wrap(async.timeout(0)).then(() => ++count);

		let throttler = new async.Throttler();

		return TPromise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); })
		]).then(() => {
			TPromise.join([
				throttler.queue(factory).then((result) => { assert.equal(result, 3); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); })
			]);
		});
	});

	test('Throttler - last factory should be the one getting called', function () {
		let factoryFactory = (n: number) => () => {
			return TPromise.wrap(async.timeout(0)).then(() => n);
		};

		let throttler = new async.Throttler();

		let promises: TPromise[] = [];

		promises.push(throttler.queue(factoryFactory(1)).then((n) => { assert.equal(n, 1); }));
		promises.push(throttler.queue(factoryFactory(2)).then((n) => { assert.equal(n, 3); }));
		promises.push(throttler.queue(factoryFactory(3)).then((n) => { assert.equal(n, 3); }));

		return TPromise.join(promises);
	});

	test('Delayer', () => {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let delayer = new async.Delayer(0);
		let promises: TPromise[] = [];

		assert(!delayer.isTriggered());

		promises.push(delayer.trigger(factory).then((result) => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
		assert(delayer.isTriggered());

		promises.push(delayer.trigger(factory).then((result) => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
		assert(delayer.isTriggered());

		promises.push(delayer.trigger(factory).then((result) => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
		assert(delayer.isTriggered());

		return TPromise.join(promises).then(() => {
			assert(!delayer.isTriggered());
		});
	});

	test('Delayer - simple cancel', function () {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let delayer = new async.Delayer(0);

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

	test('Delayer - cancel should cancel all calls to trigger', function () {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let delayer = new async.Delayer(0);
		let promises: TPromise[] = [];

		assert(!delayer.isTriggered());

		promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
		assert(delayer.isTriggered());

		promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
		assert(delayer.isTriggered());

		promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
		assert(delayer.isTriggered());

		delayer.cancel();

		return TPromise.join(promises).then(() => {
			assert(!delayer.isTriggered());
		});
	});

	test('Delayer - trigger, cancel, then trigger again', function () {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let delayer = new async.Delayer(0);
		let promises: TPromise[] = [];

		assert(!delayer.isTriggered());

		const p = delayer.trigger(factory).then((result) => {
			assert.equal(result, 1);
			assert(!delayer.isTriggered());

			promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
			assert(delayer.isTriggered());

			promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
			assert(delayer.isTriggered());

			delayer.cancel();

			const p = TPromise.join(promises).then(() => {
				promises = [];

				assert(!delayer.isTriggered());

				promises.push(delayer.trigger(factory).then(() => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
				assert(delayer.isTriggered());

				promises.push(delayer.trigger(factory).then(() => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
				assert(delayer.isTriggered());

				const p = TPromise.join(promises).then(() => {
					assert(!delayer.isTriggered());
				});

				assert(delayer.isTriggered());

				return p;
			});

			assert(delayer.isTriggered());

			return p;
		});

		assert(delayer.isTriggered());

		return p;
	});

	test('Delayer - last task should be the one getting called', function () {
		let factoryFactory = (n: number) => () => {
			return TPromise.as(n);
		};

		let delayer = new async.Delayer(0);
		let promises: TPromise[] = [];

		assert(!delayer.isTriggered());

		promises.push(delayer.trigger(factoryFactory(1)).then((n) => { assert.equal(n, 3); }));
		promises.push(delayer.trigger(factoryFactory(2)).then((n) => { assert.equal(n, 3); }));
		promises.push(delayer.trigger(factoryFactory(3)).then((n) => { assert.equal(n, 3); }));

		const p = TPromise.join(promises).then(() => {
			assert(!delayer.isTriggered());
		});

		assert(delayer.isTriggered());

		return p;
	});

	test('Sequence', () => {
		let factoryFactory = (n: number) => () => {
			return TPromise.as(n);
		};

		return async.sequence([
			factoryFactory(1),
			factoryFactory(2),
			factoryFactory(3),
			factoryFactory(4),
			factoryFactory(5),
		]).then((result) => {
			assert.equal(5, result.length);
			assert.equal(1, result[0]);
			assert.equal(2, result[1]);
			assert.equal(3, result[2]);
			assert.equal(4, result[3]);
			assert.equal(5, result[4]);
		});
	});

	test('Limiter - sync', function () {
		let factoryFactory = (n: number) => () => {
			return TPromise.as(n);
		};

		let limiter = new async.Limiter(1);

		let promises: TPromise[] = [];
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

		return TPromise.join(promises).then((res) => {
			assert.equal(10, res.length);

			limiter = new async.Limiter(100);

			promises = [];
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

			return TPromise.join(promises).then((res) => {
				assert.equal(10, res.length);
			});
		});
	});

	test('Limiter - async', function () {
		let factoryFactory = (n: number) => () => TPromise.wrap(async.timeout(0)).then(() => n);

		let limiter = new async.Limiter(1);
		let promises: TPromise[] = [];
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

		return TPromise.join(promises).then((res) => {
			assert.equal(10, res.length);

			limiter = new async.Limiter(100);

			promises = [];
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

			return TPromise.join(promises).then((res) => {
				assert.equal(10, res.length);
			});
		});
	});

	test('Limiter - assert degree of paralellism', function () {
		let activePromises = 0;
		let factoryFactory = (n: number) => () => {
			activePromises++;
			assert(activePromises < 6);
			return TPromise.wrap(async.timeout(0)).then(() => { activePromises--; return n; });
		};

		let limiter = new async.Limiter(5);

		let promises: TPromise[] = [];
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

		return TPromise.join(promises).then((res) => {
			assert.equal(10, res.length);
			assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], res);
		});
	});

	test('Queue - simple', function () {
		let queue = new async.Queue();

		let syncPromise = false;
		let f1 = () => TPromise.as(true).then(() => syncPromise = true);

		let asyncPromise = false;
		let f2 = () => TPromise.wrap(async.timeout(10)).then(() => asyncPromise = true);

		assert.equal(queue.size, 0);

		queue.queue(f1);
		assert.equal(queue.size, 0); // sync promise is already done

		const p = queue.queue(f2);
		assert.equal(queue.size, 1);
		return p.then(() => {
			assert.equal(queue.size, 1);
			assert.ok(syncPromise);
			assert.ok(asyncPromise);
		});
	});

	test('Queue - order is kept', function () {
		let queue = new async.Queue();

		let res: number[] = [];

		let f1 = () => TPromise.as(true).then(() => res.push(1));
		let f2 = () => TPromise.wrap(async.timeout(10)).then(() => res.push(2));
		let f3 = () => TPromise.as(true).then(() => res.push(3));
		let f4 = () => TPromise.wrap(async.timeout(20)).then(() => res.push(4));
		let f5 = () => TPromise.wrap(async.timeout(0)).then(() => res.push(5));

		queue.queue(f1);
		queue.queue(f2);
		queue.queue(f3);
		queue.queue(f4);
		return queue.queue(f5).then(() => {
			assert.equal(res[0], 1);
			assert.equal(res[1], 2);
			assert.equal(res[2], 3);
			assert.equal(res[3], 4);
			assert.equal(res[4], 5);
		});
	});

	test('Queue - errors bubble individually but not cause stop', function () {
		let queue = new async.Queue();

		let res: number[] = [];
		let error = false;

		let f1 = () => TPromise.as(true).then(() => res.push(1));
		let f2 = () => TPromise.wrap(async.timeout(10)).then(() => res.push(2));
		let f3 = () => TPromise.as(true).then(() => TPromise.wrapError(new Error('error')));
		let f4 = () => TPromise.wrap(async.timeout(20)).then(() => res.push(4));
		let f5 = () => TPromise.wrap(async.timeout(0)).then(() => res.push(5));

		queue.queue(f1);
		queue.queue(f2);
		queue.queue(f3).then(null, () => error = true);
		queue.queue(f4);
		return queue.queue(f5).then(() => {
			assert.equal(res[0], 1);
			assert.equal(res[1], 2);
			assert.ok(error);
			assert.equal(res[2], 4);
			assert.equal(res[3], 5);
		});
	});

	test('Queue - order is kept (chained)', function () {
		let queue = new async.Queue();

		let res: number[] = [];

		let f1 = () => TPromise.as(true).then(() => res.push(1));
		let f2 = () => TPromise.wrap(async.timeout(10)).then(() => res.push(2));
		let f3 = () => TPromise.as(true).then(() => res.push(3));
		let f4 = () => TPromise.wrap(async.timeout(20)).then(() => res.push(4));
		let f5 = () => TPromise.wrap(async.timeout(0)).then(() => res.push(5));

		return queue.queue(f1).then(() => {
			return queue.queue(f2).then(() => {
				return queue.queue(f3).then(() => {
					return queue.queue(f4).then(() => {
						return queue.queue(f5).then(() => {
							assert.equal(res[0], 1);
							assert.equal(res[1], 2);
							assert.equal(res[2], 3);
							assert.equal(res[3], 4);
							assert.equal(res[4], 5);
						});
					});
				});
			});
		});
	});

	test('Queue - events', function (done) {
		let queue = new async.Queue();

		let finished = false;
		queue.onFinished(() => {
			done();
		});

		let res: number[] = [];

		let f1 = () => TPromise.wrap(async.timeout(10)).then(() => res.push(2));
		let f2 = () => TPromise.wrap(async.timeout(20)).then(() => res.push(4));
		let f3 = () => TPromise.wrap(async.timeout(0)).then(() => res.push(5));

		const q1 = queue.queue(f1);
		const q2 = queue.queue(f2);
		queue.queue(f3);

		q1.then(() => {
			assert.ok(!finished);
			q2.then(() => {
				assert.ok(!finished);
			});
		});
	});

	test('ResourceQueue - simple', function () {
		let queue = new async.ResourceQueue();

		const r1Queue = queue.queueFor(URI.file('/some/path'));
		const r2Queue = queue.queueFor(URI.file('/some/other/path'));

		assert.ok(r1Queue);
		assert.ok(r2Queue);
		assert.equal(r1Queue, queue.queueFor(URI.file('/some/path'))); // same queue returned

		let syncPromiseFactory = () => TPromise.as(true);

		r1Queue.queue(syncPromiseFactory);

		const r1Queue2 = queue.queueFor(URI.file('/some/path'));
		assert.notEqual(r1Queue, r1Queue2); // previous one got disposed after finishing
	});
});
