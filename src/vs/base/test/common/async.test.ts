/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import * as Async from 'vs/base/common/async';
import URI from 'vs/base/common/uri';

suite('Async', () => {
	test('Throttler - non async', function () {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let throttler = new Async.Throttler();

		return Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 3); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 5); })
		]);
	});

	test('Throttler', function () {
		let count = 0;
		let factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		let throttler = new Async.Throttler();

		return Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); })
		]).then(() => {
			Promise.join([
				throttler.queue(factory).then((result) => { assert.equal(result, 3); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); })
			]);
		});
	});

	test('Throttler - cancel should not cancel other promises', function () {
		let count = 0;
		let factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		let throttler = new Async.Throttler();
		let p1: Promise;

		const p = Promise.join([
			p1 = throttler.queue(factory).then((result) => { assert(false, 'should not be here, 1'); }, () => { assert(true, 'yes, it was cancelled'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 2'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 3'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 4'); })
		]);

		p1.cancel();

		return p;
	});

	test('Throttler - cancel the first queued promise should not cancel other promises', function () {
		let count = 0;
		let factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		let throttler = new Async.Throttler();
		let p2: Promise;

		const p = Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 1'); }),
			p2 = throttler.queue(factory).then((result) => { assert(false, 'should not be here, 2'); }, () => { assert(true, 'yes, it was cancelled'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 3'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 4'); })
		]);

		p2.cancel();

		return p;
	});

	test('Throttler - cancel in the middle should not cancel other promises', function () {
		let count = 0;
		let factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		let throttler = new Async.Throttler();
		let p3: Promise;

		const p = Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 1'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 2'); }),
			p3 = throttler.queue(factory).then((result) => { assert(false, 'should not be here, 3'); }, () => { assert(true, 'yes, it was cancelled'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 4'); })
		]);

		p3.cancel();

		return p;
	});

	test('Throttler - last factory should be the one getting called', function () {
		let factoryFactory = (n: number) => () => {
			return TPromise.timeout(0).then(() => n);
		};

		let throttler = new Async.Throttler();

		let promises: Promise[] = [];

		promises.push(throttler.queue(factoryFactory(1)).then((n) => { assert.equal(n, 1); }));
		promises.push(throttler.queue(factoryFactory(2)).then((n) => { assert.equal(n, 3); }));
		promises.push(throttler.queue(factoryFactory(3)).then((n) => { assert.equal(n, 3); }));

		return Promise.join(promises);
	});

	test('Throttler - progress should work', function () {
		let order = 0;
		let factory = () => new TPromise((c, e, p) => {
			TPromise.timeout(0).done(() => {
				p(order++);
				c(true);
			});
		});

		let throttler = new Async.Throttler();
		let promises: Promise[] = [];
		let progresses: any[][] = [[], [], []];

		promises.push(throttler.queue(factory).then(null, null, (p) => progresses[0].push(p)));
		promises.push(throttler.queue(factory).then(null, null, (p) => progresses[1].push(p)));
		promises.push(throttler.queue(factory).then(null, null, (p) => progresses[2].push(p)));

		return Promise.join(promises).then(() => {
			assert.deepEqual(progresses[0], [0]);
			assert.deepEqual(progresses[1], [0]);
			assert.deepEqual(progresses[2], [0]);
		});
	});

	test('Delayer', function () {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let delayer = new Async.Delayer(0);
		let promises: Promise[] = [];

		assert(!delayer.isTriggered());

		promises.push(delayer.trigger(factory).then((result) => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
		assert(delayer.isTriggered());

		promises.push(delayer.trigger(factory).then((result) => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
		assert(delayer.isTriggered());

		promises.push(delayer.trigger(factory).then((result) => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
		assert(delayer.isTriggered());

		return Promise.join(promises).then(() => {
			assert(!delayer.isTriggered());
		});
	});

	test('Delayer - simple cancel', function () {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let delayer = new Async.Delayer(0);

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

		let delayer = new Async.Delayer(0);
		let promises: Promise[] = [];

		assert(!delayer.isTriggered());

		promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
		assert(delayer.isTriggered());

		promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
		assert(delayer.isTriggered());

		promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
		assert(delayer.isTriggered());

		delayer.cancel();

		return Promise.join(promises).then(() => {
			assert(!delayer.isTriggered());
		});
	});

	test('Delayer - trigger, cancel, then trigger again', function () {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let delayer = new Async.Delayer(0);
		let promises: Promise[] = [];

		assert(!delayer.isTriggered());

		const p = delayer.trigger(factory).then((result) => {
			assert.equal(result, 1);
			assert(!delayer.isTriggered());

			promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
			assert(delayer.isTriggered());

			promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
			assert(delayer.isTriggered());

			delayer.cancel();

			const p = Promise.join(promises).then(() => {
				promises = [];

				assert(!delayer.isTriggered());

				promises.push(delayer.trigger(factory).then(() => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
				assert(delayer.isTriggered());

				promises.push(delayer.trigger(factory).then(() => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
				assert(delayer.isTriggered());

				const p = Promise.join(promises).then(() => {
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

		let delayer = new Async.Delayer(0);
		let promises: Promise[] = [];

		assert(!delayer.isTriggered());

		promises.push(delayer.trigger(factoryFactory(1)).then((n) => { assert.equal(n, 3); }));
		promises.push(delayer.trigger(factoryFactory(2)).then((n) => { assert.equal(n, 3); }));
		promises.push(delayer.trigger(factoryFactory(3)).then((n) => { assert.equal(n, 3); }));

		const p = Promise.join(promises).then(() => {
			assert(!delayer.isTriggered());
		});

		assert(delayer.isTriggered());

		return p;
	});

	test('Delayer - progress should work', function () {
		let order = 0;
		let factory = () => new TPromise((c, e, p) => {
			TPromise.timeout(0).done(() => {
				p(order++);
				c(true);
			});
		});

		let delayer = new Async.Delayer(0);
		let promises: Promise[] = [];
		let progresses: any[][] = [[], [], []];

		promises.push(delayer.trigger(factory).then(null, null, (p) => progresses[0].push(p)));
		promises.push(delayer.trigger(factory).then(null, null, (p) => progresses[1].push(p)));
		promises.push(delayer.trigger(factory).then(null, null, (p) => progresses[2].push(p)));

		return Promise.join(promises).then(() => {
			assert.deepEqual(progresses[0], [0]);
			assert.deepEqual(progresses[1], [0]);
			assert.deepEqual(progresses[2], [0]);
		});
	});

	test('ThrottledDelayer - progress should work', function () {
		let order = 0;
		let factory = () => new TPromise((c, e, p) => {
			TPromise.timeout(0).done(() => {
				p(order++);
				c(true);
			});
		});

		let delayer = new Async.ThrottledDelayer(0);
		let promises: Promise[] = [];
		let progresses: any[][] = [[], [], []];

		promises.push(delayer.trigger(factory).then(null, null, (p) => progresses[0].push(p)));
		promises.push(delayer.trigger(factory).then(null, null, (p) => progresses[1].push(p)));
		promises.push(delayer.trigger(factory).then(null, null, (p) => progresses[2].push(p)));

		return Promise.join(promises).then(() => {
			assert.deepEqual(progresses[0], [0]);
			assert.deepEqual(progresses[1], [0]);
			assert.deepEqual(progresses[2], [0]);
		});
	});

	test('Sequence', function () {
		let factoryFactory = (n: number) => () => {
			return TPromise.as(n);
		};

		return Async.sequence([
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

		let limiter = new Async.Limiter(1);

		let promises: Promise[] = [];
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

		return Promise.join(promises).then((res) => {
			assert.equal(10, res.length);

			limiter = new Async.Limiter(100);

			promises = [];
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

			return Promise.join(promises).then((res) => {
				assert.equal(10, res.length);
			});
		});
	});

	test('Limiter - async', function () {
		let factoryFactory = (n: number) => () => {
			return TPromise.timeout(0).then(() => n);
		};

		let limiter = new Async.Limiter(1);
		let promises: Promise[] = [];
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

		return Promise.join(promises).then((res) => {
			assert.equal(10, res.length);

			limiter = new Async.Limiter(100);

			promises = [];
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

			return Promise.join(promises).then((res) => {
				assert.equal(10, res.length);
			});
		});
	});

	test('Limiter - assert degree of paralellism', function () {
		let activePromises = 0;
		let factoryFactory = (n: number) => () => {
			activePromises++;
			assert(activePromises < 6);
			return TPromise.timeout(0).then(() => { activePromises--; return n; });
		};

		let limiter = new Async.Limiter(5);

		let promises: Promise[] = [];
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

		return Promise.join(promises).then((res) => {
			assert.equal(10, res.length);
			assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], res);
		});
	});

	test('Queue - simple', function () {
		let queue = new Async.Queue();

		let syncPromise = false;
		let f1 = () => TPromise.as(true).then(() => syncPromise = true);

		let asyncPromise = false;
		let f2 = () => TPromise.timeout(10).then(() => asyncPromise = true);

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
		let queue = new Async.Queue();

		let res: number[] = [];

		let f1 = () => TPromise.as(true).then(() => res.push(1));
		let f2 = () => TPromise.timeout(10).then(() => res.push(2));
		let f3 = () => TPromise.as(true).then(() => res.push(3));
		let f4 = () => TPromise.timeout(20).then(() => res.push(4));
		let f5 = () => TPromise.timeout(0).then(() => res.push(5));

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
		let queue = new Async.Queue();

		let res: number[] = [];
		let error = false;

		let f1 = () => TPromise.as(true).then(() => res.push(1));
		let f2 = () => TPromise.timeout(10).then(() => res.push(2));
		let f3 = () => TPromise.as(true).then(() => TPromise.wrapError(new Error('error')));
		let f4 = () => TPromise.timeout(20).then(() => res.push(4));
		let f5 = () => TPromise.timeout(0).then(() => res.push(5));

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
		let queue = new Async.Queue();

		let res: number[] = [];

		let f1 = () => TPromise.as(true).then(() => res.push(1));
		let f2 = () => TPromise.timeout(10).then(() => res.push(2));
		let f3 = () => TPromise.as(true).then(() => res.push(3));
		let f4 = () => TPromise.timeout(20).then(() => res.push(4));
		let f5 = () => TPromise.timeout(0).then(() => res.push(5));

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
		let queue = new Async.Queue();

		let finished = false;
		queue.onFinished(() => {
			done();
		});

		let res: number[] = [];

		let f1 = () => TPromise.timeout(10).then(() => res.push(2));
		let f2 = () => TPromise.timeout(20).then(() => res.push(4));
		let f3 = () => TPromise.timeout(0).then(() => res.push(5));

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
		let queue = new Async.ResourceQueue();

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

	test('ThrottledEmitter', function () {
		const emitter = new Async.ThrottledEmitter();

		const fnThatEmitsEvent = () => {
			emitter.fire();
		};

		const promiseFn = TPromise.timeout(0).then(() => {
			fnThatEmitsEvent();
			fnThatEmitsEvent();
			fnThatEmitsEvent();
		});

		let count = 0;
		emitter.event(() => {
			count++;
		});

		emitter.throttle(promiseFn);

		promiseFn.then(() => {
			assert.equal(count, 1);
		});
	});
});
