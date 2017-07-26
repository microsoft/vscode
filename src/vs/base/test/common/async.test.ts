/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import Async = require('vs/base/common/async');

suite('Async', () => {
	test('Throttler - non async', function (done) {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let throttler = new Async.Throttler();

		Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 3); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 5); })
		]).done(() => done());
	});

	test('Throttler', function (done) {
		let count = 0;
		let factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		let throttler = new Async.Throttler();

		Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); })
		]).done(() => {
			Promise.join([
				throttler.queue(factory).then((result) => { assert.equal(result, 3); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
				throttler.queue(factory).then((result) => { assert.equal(result, 4); })
			]).done(() => done());
		});
	});

	test('Throttler - cancel should not cancel other promises', function (done) {
		let count = 0;
		let factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		let throttler = new Async.Throttler();
		let p1: Promise;

		Promise.join([
			p1 = throttler.queue(factory).then((result) => { assert(false, 'should not be here, 1'); }, () => { assert(true, 'yes, it was cancelled'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 2'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 3'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 4'); })
		]).done(() => done());

		p1.cancel();
	});

	test('Throttler - cancel the first queued promise should not cancel other promises', function (done) {
		let count = 0;
		let factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		let throttler = new Async.Throttler();
		let p2: Promise;

		Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 1'); }),
			p2 = throttler.queue(factory).then((result) => { assert(false, 'should not be here, 2'); }, () => { assert(true, 'yes, it was cancelled'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 3'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 4'); })
		]).done(() => done());

		p2.cancel();
	});

	test('Throttler - cancel in the middle should not cancel other promises', function (done) {
		let count = 0;
		let factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		let throttler = new Async.Throttler();
		let p3: Promise;

		Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 1'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 2'); }),
			p3 = throttler.queue(factory).then((result) => { assert(false, 'should not be here, 3'); }, () => { assert(true, 'yes, it was cancelled'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 4'); })
		]).done(() => done());

		p3.cancel();
	});

	test('Throttler - last factory should be the one getting called', function (done) {
		let factoryFactory = (n: number) => () => {
			return TPromise.timeout(0).then(() => n);
		};

		let throttler = new Async.Throttler();

		let promises: Promise[] = [];

		promises.push(throttler.queue(factoryFactory(1)).then((n) => { assert.equal(n, 1); }));
		promises.push(throttler.queue(factoryFactory(2)).then((n) => { assert.equal(n, 3); }));
		promises.push(throttler.queue(factoryFactory(3)).then((n) => { assert.equal(n, 3); }));

		Promise.join(promises).done(() => done());
	});

	test('Throttler - progress should work', function (done) {
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

		Promise.join(promises).done(() => {
			assert.deepEqual(progresses[0], [0]);
			assert.deepEqual(progresses[1], [0]);
			assert.deepEqual(progresses[2], [0]);
			done();
		});
	});

	test('Delayer', function (done) {
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

		Promise.join(promises).done(() => {
			assert(!delayer.isTriggered());
			done();
		});
	});

	test('Delayer - simple cancel', function (done) {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let delayer = new Async.Delayer(0);

		assert(!delayer.isTriggered());

		delayer.trigger(factory).then(() => {
			assert(false);
		}, () => {
			assert(true, 'yes, it was cancelled');
		}).done(() => done());

		assert(delayer.isTriggered());
		delayer.cancel();
		assert(!delayer.isTriggered());
	});

	test('Delayer - cancel should cancel all calls to trigger', function (done) {
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

		Promise.join(promises).done(() => {
			assert(!delayer.isTriggered());
			done();
		});
	});

	test('Delayer - trigger, cancel, then trigger again', function (done) {
		let count = 0;
		let factory = () => {
			return TPromise.as(++count);
		};

		let delayer = new Async.Delayer(0);
		let promises: Promise[] = [];

		assert(!delayer.isTriggered());

		delayer.trigger(factory).then((result) => {
			assert.equal(result, 1);
			assert(!delayer.isTriggered());

			promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
			assert(delayer.isTriggered());

			promises.push(delayer.trigger(factory).then(null, () => { assert(true, 'yes, it was cancelled'); }));
			assert(delayer.isTriggered());

			delayer.cancel();

			Promise.join(promises).then(() => {

				promises = [];

				assert(!delayer.isTriggered());

				promises.push(delayer.trigger(factory).then(() => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
				assert(delayer.isTriggered());

				promises.push(delayer.trigger(factory).then(() => { assert.equal(result, 1); assert(!delayer.isTriggered()); }));
				assert(delayer.isTriggered());

				Promise.join(promises).then(() => {
					assert(!delayer.isTriggered());

					done();
				});

				assert(delayer.isTriggered());
			});

			assert(delayer.isTriggered());
		});

		assert(delayer.isTriggered());
	});

	test('Delayer - last task should be the one getting called', function (done) {
		let factoryFactory = (n: number) => () => {
			return TPromise.as(n);
		};

		let delayer = new Async.Delayer(0);
		let promises: Promise[] = [];

		assert(!delayer.isTriggered());

		promises.push(delayer.trigger(factoryFactory(1)).then((n) => { assert.equal(n, 3); }));
		promises.push(delayer.trigger(factoryFactory(2)).then((n) => { assert.equal(n, 3); }));
		promises.push(delayer.trigger(factoryFactory(3)).then((n) => { assert.equal(n, 3); }));

		Promise.join(promises).then(() => {
			assert(!delayer.isTriggered());
			done();
		});

		assert(delayer.isTriggered());
	});

	test('Delayer - progress should work', function (done) {
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

		Promise.join(promises).done(() => {
			assert.deepEqual(progresses[0], [0]);
			assert.deepEqual(progresses[1], [0]);
			assert.deepEqual(progresses[2], [0]);
			done();
		});
	});

	test('ThrottledDelayer - progress should work', function (done) {
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

		Promise.join(promises).done(() => {
			assert.deepEqual(progresses[0], [0]);
			assert.deepEqual(progresses[1], [0]);
			assert.deepEqual(progresses[2], [0]);
			done();
		});
	});

	test('Sequence', function (done) {
		let factoryFactory = (n: number) => () => {
			return TPromise.as(n);
		};

		Async.sequence([
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
			done();
		});
	});

	test('Limiter - sync', function (done) {
		let factoryFactory = (n: number) => () => {
			return TPromise.as(n);
		};

		let limiter = new Async.Limiter(1);

		let promises: Promise[] = [];
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

		Promise.join(promises).then((res) => {
			assert.equal(10, res.length);

			limiter = new Async.Limiter(100);

			promises = [];
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

			return Promise.join(promises).then((res) => {
				assert.equal(10, res.length);
			});
		}).done(() => done());
	});

	test('Limiter - async', function (done) {
		let factoryFactory = (n: number) => () => {
			return TPromise.timeout(0).then(() => n);
		};

		let limiter = new Async.Limiter(1);
		let promises: Promise[] = [];
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

		Promise.join(promises).then((res) => {
			assert.equal(10, res.length);

			limiter = new Async.Limiter(100);

			promises = [];
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

			Promise.join(promises).then((res) => {
				assert.equal(10, res.length);
			});
		}).done(() => done());
	});

	test('Limiter - assert degree of paralellism', function (done) {
		let activePromises = 0;
		let factoryFactory = (n: number) => () => {
			activePromises++;
			assert(activePromises < 6);
			return TPromise.timeout(0).then(() => { activePromises--; return n; });
		};

		let limiter = new Async.Limiter(5);

		let promises: Promise[] = [];
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

		Promise.join(promises).then((res) => {
			assert.equal(10, res.length);
			assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], res);
			done();
		});
	});

	test('Queue - simple', function (done) {
		let queue = new Async.Queue();

		let syncPromise = false;
		let f1 = () => TPromise.as(true).then(() => syncPromise = true);

		let asyncPromise = false;
		let f2 = () => TPromise.timeout(10).then(() => asyncPromise = true);

		queue.queue(f1);
		queue.queue(f2).then(() => {
			assert.ok(syncPromise);
			assert.ok(asyncPromise);

			done();
		});
	});

	test('Queue - order is kept', function (done) {
		let queue = new Async.Queue();

		let res = [];

		let f1 = () => TPromise.as(true).then(() => res.push(1));
		let f2 = () => TPromise.timeout(10).then(() => res.push(2));
		let f3 = () => TPromise.as(true).then(() => res.push(3));
		let f4 = () => TPromise.timeout(20).then(() => res.push(4));
		let f5 = () => TPromise.timeout(0).then(() => res.push(5));

		queue.queue(f1);
		queue.queue(f2);
		queue.queue(f3);
		queue.queue(f4);
		queue.queue(f5).then(() => {
			assert.equal(res[0], 1);
			assert.equal(res[1], 2);
			assert.equal(res[2], 3);
			assert.equal(res[3], 4);
			assert.equal(res[4], 5);

			done();
		});
	});

	test('Queue - errors bubble individually but not cause stop', function (done) {
		let queue = new Async.Queue();

		let res = [];
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
		queue.queue(f5).then(() => {
			assert.equal(res[0], 1);
			assert.equal(res[1], 2);
			assert.ok(error);
			assert.equal(res[2], 4);
			assert.equal(res[3], 5);

			done();
		});
	});

	test('Queue - order is kept (chained)', function (done) {
		let queue = new Async.Queue();

		let res = [];

		let f1 = () => TPromise.as(true).then(() => res.push(1));
		let f2 = () => TPromise.timeout(10).then(() => res.push(2));
		let f3 = () => TPromise.as(true).then(() => res.push(3));
		let f4 = () => TPromise.timeout(20).then(() => res.push(4));
		let f5 = () => TPromise.timeout(0).then(() => res.push(5));

		queue.queue(f1).then(() => {
			queue.queue(f2).then(() => {
				queue.queue(f3).then(() => {
					queue.queue(f4).then(() => {
						queue.queue(f5).then(() => {
							assert.equal(res[0], 1);
							assert.equal(res[1], 2);
							assert.equal(res[2], 3);
							assert.equal(res[3], 4);
							assert.equal(res[4], 5);

							done();
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

		let res = [];

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
});
