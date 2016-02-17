/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import Async = require('vs/base/common/async');

suite('Async', () => {
	test('Throttler - non async', function(done) {
		var count = 0;
		var factory = () => {
			return TPromise.as(++count);
		};

		var throttler = new Async.Throttler();

		Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 3); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 4); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 5); })
		]).done(() => done());
	});

	test('Throttler', function(done) {
		var count = 0;
		var factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		var throttler = new Async.Throttler();

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

	test('Throttler - cancel should not cancel other promises', function(done) {
		var count = 0;
		var factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		var throttler = new Async.Throttler();
		var p1: Promise;

		Promise.join([
			p1 = throttler.queue(factory).then((result) => { assert(false, 'should not be here, 1'); }, () => { assert(true, 'yes, it was cancelled'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 2'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 3'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 4'); })
		]).done(() => done());

		p1.cancel();
	});

	test('Throttler - cancel the first queued promise should not cancel other promises', function(done) {
		var count = 0;
		var factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		var throttler = new Async.Throttler();
		var p2: Promise;

		Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 1'); }),
			p2 = throttler.queue(factory).then((result) => { assert(false, 'should not be here, 2'); }, () => { assert(true, 'yes, it was cancelled'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 3'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 4'); })
		]).done(() => done());

		p2.cancel();
	});

	test('Throttler - cancel in the middle should not cancel other promises', function(done) {
		var count = 0;
		var factory = () => {
			return TPromise.timeout(0).then(() => {
				return ++count;
			});
		};

		var throttler = new Async.Throttler();
		var p3: Promise;

		Promise.join([
			throttler.queue(factory).then((result) => { assert.equal(result, 1); }, () => { assert(false, 'should not be here, 1'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 2'); }),
			p3 = throttler.queue(factory).then((result) => { assert(false, 'should not be here, 3'); }, () => { assert(true, 'yes, it was cancelled'); }),
			throttler.queue(factory).then((result) => { assert.equal(result, 2); }, () => { assert(false, 'should not be here, 4'); })
		]).done(() => done());

		p3.cancel();
	});

	test('Throttler - last factory should be the one getting called', function(done) {
		var factoryFactory = (n: number) => () => {
			return TPromise.timeout(0).then(() => n);
		};

		var throttler = new Async.Throttler();

		var promises: Promise[] = [];

		promises.push(throttler.queue(factoryFactory(1)).then((n) => { assert.equal(n, 1); }));
		promises.push(throttler.queue(factoryFactory(2)).then((n) => { assert.equal(n, 3); }));
		promises.push(throttler.queue(factoryFactory(3)).then((n) => { assert.equal(n, 3); }));

		Promise.join(promises).done(() => done());
	});

	test('Throttler - progress should work', function(done) {
		var order = 0;
		var factory = () => new Promise((c, e, p) => {
			TPromise.timeout(0).done(() => {
				p(order++);
				c(true);
			});
		});

		var throttler = new Async.Throttler();
		var promises: Promise[] = [];
		var progresses: any[][] = [[], [], []];

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

	test('Delayer', function(done) {
		var count = 0;
		var factory = () => {
			return TPromise.as(++count);
		};

		var delayer = new Async.Delayer(0);
		var promises: Promise[] = [];

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

	test('Delayer - simple cancel', function(done) {
		var count = 0;
		var factory = () => {
			return TPromise.as(++count);
		};

		var delayer = new Async.Delayer(0);
		var promises: Promise[] = [];

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

	test('Delayer - cancel should cancel all calls to trigger', function(done) {
		var count = 0;
		var factory = () => {
			return TPromise.as(++count);
		};

		var delayer = new Async.Delayer(0);
		var promises: Promise[] = [];

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

	test('Delayer - trigger, cancel, then trigger again', function(done) {
		var count = 0;
		var factory = () => {
			return TPromise.as(++count);
		};

		var delayer = new Async.Delayer(0);
		var promises: Promise[] = [];

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

	test('Delayer - last task should be the one getting called', function(done) {
		var factoryFactory = (n: number) => () => {
			return TPromise.as(n);
		};

		var delayer = new Async.Delayer(0);
		var promises: Promise[] = [];

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

	test('Delayer - progress should work', function(done) {
		var order = 0;
		var factory = () => new Promise((c, e, p) => {
			TPromise.timeout(0).done(() => {
				p(order++);
				c(true);
			});
		});

		var delayer = new Async.Delayer(0);
		var promises: Promise[] = [];
		var progresses: any[][] = [[], [], []];

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

	test('ThrottledDelayer - progress should work', function(done) {
		var order = 0;
		var factory = () => new Promise((c, e, p) => {
			TPromise.timeout(0).done(() => {
				p(order++);
				c(true);
			});
		});

		var delayer = new Async.ThrottledDelayer(0);
		var promises: Promise[] = [];
		var progresses: any[][] = [[], [], []];

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

	test('Sequence', function(done) {
		var factoryFactory = (n: number) => () => {
			return TPromise.as(n);
		};

		Async.sequence([
			factoryFactory(1),
			factoryFactory(2),
			factoryFactory(3),
			factoryFactory(4),
			factoryFactory(5),
		]).then((result)=>{
			assert.equal(5, result.length);
			assert.equal(1, result[0]);
			assert.equal(2, result[1]);
			assert.equal(3, result[2]);
			assert.equal(4, result[3]);
			assert.equal(5, result[4]);
			done();
		});
	});

	test('Limiter - sync', function(done) {
		var factoryFactory = (n: number) => () => {
			return TPromise.as(n);
		};

		var limiter = new Async.Limiter(1);

		var promises:Promise[] = [];
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

	test('Limiter - async', function(done) {
		var factoryFactory = (n: number) => () => {
			return TPromise.timeout(0).then(() => n);
		};

		var limiter = new Async.Limiter(1);
		var promises:Promise[] = [];
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

	test('Limiter - assert degree of paralellism', function(done) {
		var activePromises = 0;
		var factoryFactory = (n: number) => () => {
			activePromises++;
			assert(activePromises < 6);
			return TPromise.timeout(0).then(() => { activePromises--; return n; });
		};

		var limiter = new Async.Limiter(5);

		var promises:Promise[] = [];
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(n => promises.push(limiter.queue(factoryFactory(n))));

		Promise.join(promises).then((res) => {
			assert.equal(10, res.length);
			assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], res);
			done();
		});
	});
});
