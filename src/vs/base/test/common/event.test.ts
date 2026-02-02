/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { stub } from 'sinon';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { errorHandler, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { AsyncEmitter, DebounceEmitter, DynamicListEventMultiplexer, Emitter, Event, EventBufferer, EventMultiplexer, IWaitUntil, MicrotaskEmitter, PauseableEmitter, Relay, createEventDeliveryQueue } from 'vs/base/common/event';
import { DisposableStore, IDisposable, isDisposable, setDisposableTracker, toDisposable, DisposableTracker } from 'vs/base/common/lifecycle';
import { observableValue, transaction } from 'vs/base/common/observable';
import { MicrotaskDelay } from 'vs/base/common/symbols';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

namespace Samples {

	export class EventCounter {

		count = 0;

		reset() {
			this.count = 0;
		}

		onEvent() {
			this.count += 1;
		}
	}

	export class Document3 {

		private readonly _onDidChange = new Emitter<string>();

		onDidChange: Event<string> = this._onDidChange.event;

		setText(value: string) {
			//...
			this._onDidChange.fire(value);
		}

	}
}

suite('Event utils dispose', function () {

	let tracker = new DisposableTracker();

	function assertDisposablesCount(expected: number | Array<IDisposable>) {
		if (Array.isArray(expected)) {
			const instances = new Set(expected);
			const actualInstances = tracker.getTrackedDisposables();
			assert.strictEqual(actualInstances.length, expected.length);

			for (const item of actualInstances) {
				assert.ok(instances.has(item));
			}

		} else {
			assert.strictEqual(tracker.getTrackedDisposables().length, expected);
		}

	}

	setup(() => {
		tracker = new DisposableTracker();
		setDisposableTracker(tracker);
	});

	teardown(function () {
		setDisposableTracker(null);
	});

	test('no leak with snapshot-utils', function () {

		const store = new DisposableStore();
		const emitter = new Emitter<number>();
		const evens = Event.filter(emitter.event, n => n % 2 === 0, store);
		assertDisposablesCount(1); // snaphot only listen when `evens` is being listened on

		let all = 0;
		const leaked = evens(n => all += n);
		assert.ok(isDisposable(leaked));
		assertDisposablesCount(3);

		emitter.dispose();
		store.dispose();
		assertDisposablesCount([leaked]); // leaked is still there
	});

	test('no leak with debounce-util', function () {
		const store = new DisposableStore();
		const emitter = new Emitter<number>();
		const debounced = Event.debounce(emitter.event, (l) => 0, undefined, undefined, undefined, undefined, store);
		assertDisposablesCount(1); // debounce only listens when `debounce` is being listened on

		let all = 0;
		const leaked = debounced(n => all += n);
		assert.ok(isDisposable(leaked));
		assertDisposablesCount(3);

		emitter.dispose();
		store.dispose();

		assertDisposablesCount([leaked]); // leaked is still there
	});
});

suite('Event', function () {

	const counter = new Samples.EventCounter();

	setup(() => counter.reset());

	test('Emitter plain', function () {

		const doc = new Samples.Document3();

		const subscription = doc.onDidChange(counter.onEvent, counter);

		doc.setText('far');
		doc.setText('boo');

		// unhook listener
		subscription.dispose();
		doc.setText('boo');
		assert.strictEqual(counter.count, 2);
	});

	test('Emitter duplicate functions', () => {
		const calls: string[] = [];
		const a = (v: string) => calls.push(`a${v}`);
		const b = (v: string) => calls.push(`b${v}`);

		const emitter = new Emitter<string>();

		emitter.event(a);
		emitter.event(b);
		const s2 = emitter.event(a);

		emitter.fire('1');
		assert.deepStrictEqual(calls, ['a1', 'b1', 'a1']);

		s2.dispose();
		calls.length = 0;
		emitter.fire('2');
		assert.deepStrictEqual(calls, ['a2', 'b2']);
	});

	test('Emitter, dispose listener during emission', () => {
		for (let keepFirstMod = 1; keepFirstMod < 4; keepFirstMod++) {
			const emitter = new Emitter<void>();
			const calls: number[] = [];
			const disposables = Array.from({ length: 25 }, (_, n) => emitter.event(() => {
				if (n % keepFirstMod === 0) {
					disposables[n].dispose();
				}
				calls.push(n);
			}));

			emitter.fire();
			assert.deepStrictEqual(calls, Array.from({ length: 25 }, (_, n) => n));
		}
	});

	test('Emitter, dispose emitter during emission', () => {
		const emitter = new Emitter<void>();
		const calls: number[] = [];
		const disposables = Array.from({ length: 25 }, (_, n) => emitter.event(() => {
			if (n === 10) {
				emitter.dispose();
			}
			calls.push(n);
		}));

		emitter.fire();
		disposables.forEach(d => d.dispose());
		assert.deepStrictEqual(calls, Array.from({ length: 11 }, (_, n) => n));
	});

	test('Emitter, shared delivery queue', () => {
		const deliveryQueue = createEventDeliveryQueue();
		const emitter1 = new Emitter<number>({ deliveryQueue });
		const emitter2 = new Emitter<number>({ deliveryQueue });

		const calls: string[] = [];
		emitter1.event(d => { calls.push(`${d}a`); if (d === 1) { emitter2.fire(2); } });
		emitter1.event(d => { calls.push(`${d}b`); });

		emitter2.event(d => { calls.push(`${d}c`); emitter1.dispose(); });
		emitter2.event(d => { calls.push(`${d}d`); });

		emitter1.fire(1);

		// 1. Check that 2 is not delivered before 1 finishes
		// 2. Check that 2 finishes getting delivered even if one emitter is disposed
		assert.deepStrictEqual(calls, ['1a', '1b', '2c', '2d']);
	});

	test('Emitter, handles removal during 3', () => {
		const fn1 = stub();
		const fn2 = stub();
		const emitter = new Emitter<string>();

		emitter.event(fn1);
		const h = emitter.event(() => {
			h.dispose();
		});
		emitter.event(fn2);
		emitter.fire('foo');

		assert.deepStrictEqual(fn2.args, [['foo']]);
		assert.deepStrictEqual(fn1.args, [['foo']]);
	});

	test('Emitter, handles removal during 2', () => {
		const fn1 = stub();
		const emitter = new Emitter<string>();

		emitter.event(fn1);
		const h = emitter.event(() => {
			h.dispose();
		});
		emitter.fire('foo');

		assert.deepStrictEqual(fn1.args, [['foo']]);
	});

	test('Emitter, bucket', function () {

		const bucket: IDisposable[] = [];
		const doc = new Samples.Document3();
		const subscription = doc.onDidChange(counter.onEvent, counter, bucket);

		doc.setText('far');
		doc.setText('boo');

		// unhook listener
		while (bucket.length) {
			bucket.pop()!.dispose();
		}
		doc.setText('boo');

		// noop
		subscription.dispose();

		doc.setText('boo');
		assert.strictEqual(counter.count, 2);
	});

	test('Emitter, store', function () {

		const bucket = new DisposableStore();
		const doc = new Samples.Document3();
		const subscription = doc.onDidChange(counter.onEvent, counter, bucket);

		doc.setText('far');
		doc.setText('boo');

		// unhook listener
		bucket.clear();
		doc.setText('boo');

		// noop
		subscription.dispose();

		doc.setText('boo');
		assert.strictEqual(counter.count, 2);
	});

	test('onFirstAdd|onLastRemove', () => {

		let firstCount = 0;
		let lastCount = 0;
		const a = new Emitter({
			onWillAddFirstListener() { firstCount += 1; },
			onDidRemoveLastListener() { lastCount += 1; }
		});

		assert.strictEqual(firstCount, 0);
		assert.strictEqual(lastCount, 0);

		let subscription1 = a.event(function () { });
		const subscription2 = a.event(function () { });
		assert.strictEqual(firstCount, 1);
		assert.strictEqual(lastCount, 0);

		subscription1.dispose();
		assert.strictEqual(firstCount, 1);
		assert.strictEqual(lastCount, 0);

		subscription2.dispose();
		assert.strictEqual(firstCount, 1);
		assert.strictEqual(lastCount, 1);

		subscription1 = a.event(function () { });
		assert.strictEqual(firstCount, 2);
		assert.strictEqual(lastCount, 1);
	});

	test('onWillRemoveListener', () => {
		let count = 0;
		const a = new Emitter({
			onWillRemoveListener() { count += 1; }
		});

		assert.strictEqual(count, 0);

		let subscription = a.event(function () { });
		assert.strictEqual(count, 0);

		subscription.dispose();
		assert.strictEqual(count, 1);

		subscription = a.event(function () { });
		assert.strictEqual(count, 1);
	});

	test('throwingListener', () => {
		const origErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => null);

		try {
			const a = new Emitter<undefined>();
			let hit = false;
			a.event(function () {
				// eslint-disable-next-line no-throw-literal
				throw 9;
			});
			a.event(function () {
				hit = true;
			});
			a.fire(undefined);
			assert.strictEqual(hit, true);

		} finally {
			setUnexpectedErrorHandler(origErrorHandler);
		}
	});

	test('throwingListener (custom handler)', () => {

		const allError: any[] = [];

		const a = new Emitter<undefined>({
			onListenerError(e) { allError.push(e); }
		});
		let hit = false;
		a.event(function () {
			// eslint-disable-next-line no-throw-literal
			throw 9;
		});
		a.event(function () {
			hit = true;
		});
		a.fire(undefined);
		assert.strictEqual(hit, true);
		assert.deepStrictEqual(allError, [9]);

	});

	test('reusing event function and context', function () {
		let counter = 0;
		function listener() {
			counter += 1;
		}
		const context = {};

		const emitter = new Emitter<undefined>();
		const reg1 = emitter.event(listener, context);
		const reg2 = emitter.event(listener, context);

		emitter.fire(undefined);
		assert.strictEqual(counter, 2);

		reg1.dispose();
		emitter.fire(undefined);
		assert.strictEqual(counter, 3);

		reg2.dispose();
		emitter.fire(undefined);
		assert.strictEqual(counter, 3);
	});

	test('DebounceEmitter', async function () {
		return runWithFakedTimers({}, async function () {

			let callCount = 0;
			let sum = 0;
			const emitter = new DebounceEmitter<number>({
				merge: arr => {
					callCount += 1;
					return arr.reduce((p, c) => p + c);
				}
			});

			emitter.event(e => { sum = e; });

			const p = Event.toPromise(emitter.event);

			emitter.fire(1);
			emitter.fire(2);

			await p;

			assert.strictEqual(callCount, 1);
			assert.strictEqual(sum, 3);
		});
	});

	test('Microtask Emitter', (done) => {
		let count = 0;
		assert.strictEqual(count, 0);
		const emitter = new MicrotaskEmitter<void>();
		const listener = emitter.event(() => {
			count++;
		});
		emitter.fire();
		assert.strictEqual(count, 0);
		emitter.fire();
		assert.strictEqual(count, 0);
		// Should wait until the event loop ends and therefore be the last thing called
		setTimeout(() => {
			assert.strictEqual(count, 3);
			done();
		}, 0);
		queueMicrotask(() => {
			assert.strictEqual(count, 2);
			count++;
			listener.dispose();
		});
	});

	test('Emitter - In Order Delivery', function () {
		const a = new Emitter<string>();
		const listener2Events: string[] = [];
		a.event(function listener1(event) {
			if (event === 'e1') {
				a.fire('e2');
				// assert that all events are delivered at this point
				assert.deepStrictEqual(listener2Events, ['e1', 'e2']);
			}
		});
		a.event(function listener2(event) {
			listener2Events.push(event);
		});
		a.fire('e1');

		// assert that all events are delivered in order
		assert.deepStrictEqual(listener2Events, ['e1', 'e2']);
	});

	test('Emitter, - In Order Delivery 3x', function () {
		const a = new Emitter<string>();
		const listener2Events: string[] = [];
		a.event(function listener1(event) {
			if (event === 'e2') {
				a.fire('e3');
				// assert that all events are delivered at this point
				assert.deepStrictEqual(listener2Events, ['e1', 'e2', 'e3']);
			}
		});
		a.event(function listener1(event) {
			if (event === 'e1') {
				a.fire('e2');
				// assert that all events are delivered at this point
				assert.deepStrictEqual(listener2Events, ['e1', 'e2', 'e3']);
			}
		});
		a.event(function listener2(event) {
			listener2Events.push(event);
		});
		a.fire('e1');

		// assert that all events are delivered in order
		assert.deepStrictEqual(listener2Events, ['e1', 'e2', 'e3']);
	});

	test('Cannot read property \'_actual\' of undefined #142204', function () {
		const e = new Emitter<number>();
		const dispo = e.event(() => { });
		dispo.dispose.call(undefined);  // assert that disposable can be called with this
	});
});

suite('AsyncEmitter', function () {

	test('event has waitUntil-function', async function () {

		interface E extends IWaitUntil {
			foo: boolean;
			bar: number;
		}

		const emitter = new AsyncEmitter<E>();

		emitter.event(e => {
			assert.strictEqual(e.foo, true);
			assert.strictEqual(e.bar, 1);
			assert.strictEqual(typeof e.waitUntil, 'function');
		});

		emitter.fireAsync({ foo: true, bar: 1, }, CancellationToken.None);
		emitter.dispose();
	});

	test('sequential delivery', async function () {
		return runWithFakedTimers({}, async function () {

			interface E extends IWaitUntil {
				foo: boolean;
			}

			let globalState = 0;
			const emitter = new AsyncEmitter<E>();

			emitter.event(e => {
				e.waitUntil(timeout(10).then(_ => {
					assert.strictEqual(globalState, 0);
					globalState += 1;
				}));
			});

			emitter.event(e => {
				e.waitUntil(timeout(1).then(_ => {
					assert.strictEqual(globalState, 1);
					globalState += 1;
				}));
			});

			await emitter.fireAsync({ foo: true }, CancellationToken.None);
			assert.strictEqual(globalState, 2);
		});
	});

	test('sequential, in-order delivery', async function () {
		return runWithFakedTimers({}, async function () {

			interface E extends IWaitUntil {
				foo: number;
			}
			const events: number[] = [];
			let done = false;
			const emitter = new AsyncEmitter<E>();

			// e1
			emitter.event(e => {
				e.waitUntil(timeout(10).then(async _ => {
					if (e.foo === 1) {
						await emitter.fireAsync({ foo: 2 }, CancellationToken.None);
						assert.deepStrictEqual(events, [1, 2]);
						done = true;
					}
				}));
			});

			// e2
			emitter.event(e => {
				events.push(e.foo);
				e.waitUntil(timeout(7));
			});

			await emitter.fireAsync({ foo: 1 }, CancellationToken.None);
			assert.ok(done);
		});
	});

	test('catch errors', async function () {
		const origErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => null);

		interface E extends IWaitUntil {
			foo: boolean;
		}

		let globalState = 0;
		const emitter = new AsyncEmitter<E>();

		emitter.event(e => {
			globalState += 1;
			e.waitUntil(new Promise((_r, reject) => reject(new Error())));
		});

		emitter.event(e => {
			globalState += 1;
			e.waitUntil(timeout(10));
			e.waitUntil(timeout(20).then(() => globalState++)); // multiple `waitUntil` are supported and awaited on
		});

		await emitter.fireAsync({ foo: true }, CancellationToken.None).then(() => {
			assert.strictEqual(globalState, 3);
		}).catch(e => {
			console.log(e);
			assert.ok(false);
		});

		setUnexpectedErrorHandler(origErrorHandler);
	});
});

suite('PausableEmitter', function () {

	test('basic', function () {
		const data: number[] = [];
		const emitter = new PauseableEmitter<number>();

		emitter.event(e => data.push(e));
		emitter.fire(1);
		emitter.fire(2);

		assert.deepStrictEqual(data, [1, 2]);
	});

	test('pause/resume - no merge', function () {
		const data: number[] = [];
		const emitter = new PauseableEmitter<number>();

		emitter.event(e => data.push(e));
		emitter.fire(1);
		emitter.fire(2);
		assert.deepStrictEqual(data, [1, 2]);

		emitter.pause();
		emitter.fire(3);
		emitter.fire(4);
		assert.deepStrictEqual(data, [1, 2]);

		emitter.resume();
		assert.deepStrictEqual(data, [1, 2, 3, 4]);
		emitter.fire(5);
		assert.deepStrictEqual(data, [1, 2, 3, 4, 5]);
	});

	test('pause/resume - merge', function () {
		const data: number[] = [];
		const emitter = new PauseableEmitter<number>({ merge: (a) => a.reduce((p, c) => p + c, 0) });

		emitter.event(e => data.push(e));
		emitter.fire(1);
		emitter.fire(2);
		assert.deepStrictEqual(data, [1, 2]);

		emitter.pause();
		emitter.fire(3);
		emitter.fire(4);
		assert.deepStrictEqual(data, [1, 2]);

		emitter.resume();
		assert.deepStrictEqual(data, [1, 2, 7]);

		emitter.fire(5);
		assert.deepStrictEqual(data, [1, 2, 7, 5]);
	});

	test('double pause/resume', function () {
		const data: number[] = [];
		const emitter = new PauseableEmitter<number>();

		emitter.event(e => data.push(e));
		emitter.fire(1);
		emitter.fire(2);
		assert.deepStrictEqual(data, [1, 2]);

		emitter.pause();
		emitter.pause();
		emitter.fire(3);
		emitter.fire(4);
		assert.deepStrictEqual(data, [1, 2]);

		emitter.resume();
		assert.deepStrictEqual(data, [1, 2]);

		emitter.resume();
		assert.deepStrictEqual(data, [1, 2, 3, 4]);

		emitter.resume();
		assert.deepStrictEqual(data, [1, 2, 3, 4]);
	});

	test('resume, no pause', function () {
		const data: number[] = [];
		const emitter = new PauseableEmitter<number>();

		emitter.event(e => data.push(e));
		emitter.fire(1);
		emitter.fire(2);
		assert.deepStrictEqual(data, [1, 2]);

		emitter.resume();
		emitter.fire(3);
		assert.deepStrictEqual(data, [1, 2, 3]);
	});

	test('nested pause', function () {
		const data: number[] = [];
		const emitter = new PauseableEmitter<number>();

		let once = true;
		emitter.event(e => {
			data.push(e);

			if (once) {
				emitter.pause();
				once = false;
			}
		});
		emitter.event(e => {
			data.push(e);
		});

		emitter.pause();
		emitter.fire(1);
		emitter.fire(2);
		assert.deepStrictEqual(data, []);

		emitter.resume();
		assert.deepStrictEqual(data, [1, 1]); // paused after first event

		emitter.resume();
		assert.deepStrictEqual(data, [1, 1, 2, 2]); // remaing event delivered

		emitter.fire(3);
		assert.deepStrictEqual(data, [1, 1, 2, 2, 3, 3]);

	});

	test('empty pause with merge', function () {
		const data: number[] = [];
		const emitter = new PauseableEmitter<number>({ merge: a => a[0] });
		emitter.event(e => data.push(1));

		emitter.pause();
		emitter.resume();
		assert.deepStrictEqual(data, []);
	});

});

suite('Event utils - ensureNoDisposablesAreLeakedInTestSuite', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('fromObservable', function () {

		const obs = observableValue('test', 12);
		const event = Event.fromObservable(obs);

		const values: number[] = [];
		const d = event(n => { values.push(n); });

		obs.set(3, undefined);
		obs.set(13, undefined);
		obs.set(3, undefined);
		obs.set(33, undefined);
		obs.set(1, undefined);

		transaction(tx => {
			obs.set(334, tx);
			obs.set(99, tx);
		});

		assert.deepStrictEqual(values, ([3, 13, 3, 33, 1, 99]));
		d.dispose();
	});
});

suite('Event utils', () => {

	suite('EventBufferer', () => {

		test('should not buffer when not wrapped', () => {
			const bufferer = new EventBufferer();
			const counter = new Samples.EventCounter();
			const emitter = new Emitter<void>();
			const event = bufferer.wrapEvent(emitter.event);
			const listener = event(counter.onEvent, counter);

			assert.strictEqual(counter.count, 0);
			emitter.fire();
			assert.strictEqual(counter.count, 1);
			emitter.fire();
			assert.strictEqual(counter.count, 2);
			emitter.fire();
			assert.strictEqual(counter.count, 3);

			listener.dispose();
		});

		test('should buffer when wrapped', () => {
			const bufferer = new EventBufferer();
			const counter = new Samples.EventCounter();
			const emitter = new Emitter<void>();
			const event = bufferer.wrapEvent(emitter.event);
			const listener = event(counter.onEvent, counter);

			assert.strictEqual(counter.count, 0);
			emitter.fire();
			assert.strictEqual(counter.count, 1);

			bufferer.bufferEvents(() => {
				emitter.fire();
				assert.strictEqual(counter.count, 1);
				emitter.fire();
				assert.strictEqual(counter.count, 1);
			});

			assert.strictEqual(counter.count, 3);
			emitter.fire();
			assert.strictEqual(counter.count, 4);

			listener.dispose();
		});

		test('once', () => {
			const emitter = new Emitter<void>();

			let counter1 = 0, counter2 = 0, counter3 = 0;

			const listener1 = emitter.event(() => counter1++);
			const listener2 = Event.once(emitter.event)(() => counter2++);
			const listener3 = Event.once(emitter.event)(() => counter3++);

			assert.strictEqual(counter1, 0);
			assert.strictEqual(counter2, 0);
			assert.strictEqual(counter3, 0);

			listener3.dispose();
			emitter.fire();
			assert.strictEqual(counter1, 1);
			assert.strictEqual(counter2, 1);
			assert.strictEqual(counter3, 0);

			emitter.fire();
			assert.strictEqual(counter1, 2);
			assert.strictEqual(counter2, 1);
			assert.strictEqual(counter3, 0);

			listener1.dispose();
			listener2.dispose();
		});
	});

	suite('buffer', () => {

		test('should buffer events', () => {
			const result: number[] = [];
			const emitter = new Emitter<number>();
			const event = emitter.event;
			const bufferedEvent = Event.buffer(event);

			emitter.fire(1);
			emitter.fire(2);
			emitter.fire(3);
			assert.deepStrictEqual(result, [] as number[]);

			const listener = bufferedEvent(num => result.push(num));
			assert.deepStrictEqual(result, [1, 2, 3]);

			emitter.fire(4);
			assert.deepStrictEqual(result, [1, 2, 3, 4]);

			listener.dispose();
			emitter.fire(5);
			assert.deepStrictEqual(result, [1, 2, 3, 4]);
		});

		test('should buffer events on next tick', async () => {
			const result: number[] = [];
			const emitter = new Emitter<number>();
			const event = emitter.event;
			const bufferedEvent = Event.buffer(event, true);

			emitter.fire(1);
			emitter.fire(2);
			emitter.fire(3);
			assert.deepStrictEqual(result, [] as number[]);

			const listener = bufferedEvent(num => result.push(num));
			assert.deepStrictEqual(result, []);

			await timeout(10);
			emitter.fire(4);
			assert.deepStrictEqual(result, [1, 2, 3, 4]);
			listener.dispose();
			emitter.fire(5);
			assert.deepStrictEqual(result, [1, 2, 3, 4]);
		});

		test('should fire initial buffer events', () => {
			const result: number[] = [];
			const emitter = new Emitter<number>();
			const event = emitter.event;
			const bufferedEvent = Event.buffer(event, false, [-2, -1, 0]);

			emitter.fire(1);
			emitter.fire(2);
			emitter.fire(3);
			assert.deepStrictEqual(result, [] as number[]);

			bufferedEvent(num => result.push(num));
			assert.deepStrictEqual(result, [-2, -1, 0, 1, 2, 3]);
		});
	});

	suite('EventMultiplexer', () => {

		test('works', () => {
			const result: number[] = [];
			const m = new EventMultiplexer<number>();
			m.event(r => result.push(r));

			const e1 = new Emitter<number>();
			m.add(e1.event);

			assert.deepStrictEqual(result, []);

			e1.fire(0);
			assert.deepStrictEqual(result, [0]);
		});

		test('multiplexer dispose works', () => {
			const result: number[] = [];
			const m = new EventMultiplexer<number>();
			m.event(r => result.push(r));

			const e1 = new Emitter<number>();
			m.add(e1.event);

			assert.deepStrictEqual(result, []);

			e1.fire(0);
			assert.deepStrictEqual(result, [0]);

			m.dispose();
			assert.deepStrictEqual(result, [0]);

			e1.fire(0);
			assert.deepStrictEqual(result, [0]);
		});

		test('event dispose works', () => {
			const result: number[] = [];
			const m = new EventMultiplexer<number>();
			m.event(r => result.push(r));

			const e1 = new Emitter<number>();
			m.add(e1.event);

			assert.deepStrictEqual(result, []);

			e1.fire(0);
			assert.deepStrictEqual(result, [0]);

			e1.dispose();
			assert.deepStrictEqual(result, [0]);

			e1.fire(0);
			assert.deepStrictEqual(result, [0]);
		});

		test('mutliplexer event dispose works', () => {
			const result: number[] = [];
			const m = new EventMultiplexer<number>();
			m.event(r => result.push(r));

			const e1 = new Emitter<number>();
			const l1 = m.add(e1.event);

			assert.deepStrictEqual(result, []);

			e1.fire(0);
			assert.deepStrictEqual(result, [0]);

			l1.dispose();
			assert.deepStrictEqual(result, [0]);

			e1.fire(0);
			assert.deepStrictEqual(result, [0]);
		});

		test('hot start works', () => {
			const result: number[] = [];
			const m = new EventMultiplexer<number>();
			m.event(r => result.push(r));

			const e1 = new Emitter<number>();
			m.add(e1.event);
			const e2 = new Emitter<number>();
			m.add(e2.event);
			const e3 = new Emitter<number>();
			m.add(e3.event);

			e1.fire(1);
			e2.fire(2);
			e3.fire(3);
			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		test('cold start works', () => {
			const result: number[] = [];
			const m = new EventMultiplexer<number>();

			const e1 = new Emitter<number>();
			m.add(e1.event);
			const e2 = new Emitter<number>();
			m.add(e2.event);
			const e3 = new Emitter<number>();
			m.add(e3.event);

			m.event(r => result.push(r));

			e1.fire(1);
			e2.fire(2);
			e3.fire(3);
			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		test('late add works', () => {
			const result: number[] = [];
			const m = new EventMultiplexer<number>();

			const e1 = new Emitter<number>();
			m.add(e1.event);
			const e2 = new Emitter<number>();
			m.add(e2.event);

			m.event(r => result.push(r));

			e1.fire(1);
			e2.fire(2);

			const e3 = new Emitter<number>();
			m.add(e3.event);
			e3.fire(3);

			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		test('add dispose works', () => {
			const result: number[] = [];
			const m = new EventMultiplexer<number>();

			const e1 = new Emitter<number>();
			m.add(e1.event);
			const e2 = new Emitter<number>();
			m.add(e2.event);

			m.event(r => result.push(r));

			e1.fire(1);
			e2.fire(2);

			const e3 = new Emitter<number>();
			const l3 = m.add(e3.event);
			e3.fire(3);
			assert.deepStrictEqual(result, [1, 2, 3]);

			l3.dispose();
			e3.fire(4);
			assert.deepStrictEqual(result, [1, 2, 3]);

			e2.fire(4);
			e1.fire(5);
			assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
		});
	});

	suite('DynamicListEventMultiplexer', () => {
		const recordedEvents: number[] = [];
		const addEmitter = new Emitter<TestItem>();
		const removeEmitter = new Emitter<TestItem>();
		class TestItem {
			readonly onTestEventEmitter = new Emitter<number>();
			readonly onTestEvent = this.onTestEventEmitter.event;
		}
		let items: TestItem[];
		let m: DynamicListEventMultiplexer<TestItem, number>;
		setup(() => {
			items = [new TestItem(), new TestItem()];
			for (const [i, item] of items.entries()) {
				item.onTestEvent(e => `${i}:${e}`);
			}
			m = new DynamicListEventMultiplexer(items, addEmitter.event, removeEmitter.event, e => e.onTestEvent);
			m.event(e => recordedEvents.push(e));
			recordedEvents.length = 0;
		});
		teardown(() => m.dispose());
		test('should fire events for initial items', () => {
			items[0].onTestEventEmitter.fire(1);
			items[1].onTestEventEmitter.fire(2);
			items[0].onTestEventEmitter.fire(3);
			items[1].onTestEventEmitter.fire(4);
			assert.deepStrictEqual(recordedEvents, [1, 2, 3, 4]);
		});
		test('should fire events for added items', () => {
			const addedItem = new TestItem();
			addEmitter.fire(addedItem);
			addedItem.onTestEventEmitter.fire(1);
			items[0].onTestEventEmitter.fire(2);
			items[1].onTestEventEmitter.fire(3);
			addedItem.onTestEventEmitter.fire(4);
			assert.deepStrictEqual(recordedEvents, [1, 2, 3, 4]);
		});
		test('should not fire events for removed items', () => {
			removeEmitter.fire(items[0]);
			items[0].onTestEventEmitter.fire(1);
			items[1].onTestEventEmitter.fire(2);
			items[0].onTestEventEmitter.fire(3);
			items[1].onTestEventEmitter.fire(4);
			assert.deepStrictEqual(recordedEvents, [2, 4]);
		});
	});

	test('latch', () => {
		const emitter = new Emitter<number>();
		const event = Event.latch(emitter.event);

		const result: number[] = [];
		const listener = event(num => result.push(num));

		assert.deepStrictEqual(result, []);

		emitter.fire(1);
		assert.deepStrictEqual(result, [1]);

		emitter.fire(2);
		assert.deepStrictEqual(result, [1, 2]);

		emitter.fire(2);
		assert.deepStrictEqual(result, [1, 2]);

		emitter.fire(1);
		assert.deepStrictEqual(result, [1, 2, 1]);

		emitter.fire(1);
		assert.deepStrictEqual(result, [1, 2, 1]);

		emitter.fire(3);
		assert.deepStrictEqual(result, [1, 2, 1, 3]);

		emitter.fire(3);
		assert.deepStrictEqual(result, [1, 2, 1, 3]);

		emitter.fire(3);
		assert.deepStrictEqual(result, [1, 2, 1, 3]);

		listener.dispose();
	});

	test('dispose is reentrant', () => {
		const emitter = new Emitter<number>({
			onDidRemoveLastListener: () => {
				emitter.dispose();
			}
		});

		const listener = emitter.event(() => undefined);
		listener.dispose(); // should not crash
	});

	suite('fromPromise', () => {

		test('not yet resolved', async function () {
			return new Promise(resolve => {
				let promise = new DeferredPromise<number>();

				Event.fromPromise(promise.p)(e => {
					assert.strictEqual(e, 1);

					promise = new DeferredPromise();

					Event.fromPromise(promise.p)(() => {
						resolve();
					});

					promise.error(undefined);
				});

				promise.complete(1);
			});
		});

		test('already resolved', async function () {
			return new Promise(resolve => {
				let promise = new DeferredPromise<number>();
				promise.complete(1);

				Event.fromPromise(promise.p)(e => {
					assert.strictEqual(e, 1);

					promise = new DeferredPromise();
					promise.error(undefined);

					Event.fromPromise(promise.p)(() => {
						resolve();
					});
				});

			});
		});
	});

	suite('Relay', () => {
		test('should input work', () => {
			const e1 = new Emitter<number>();
			const e2 = new Emitter<number>();
			const relay = new Relay<number>();

			const result: number[] = [];
			const listener = (num: number) => result.push(num);
			const subscription = relay.event(listener);

			e1.fire(1);
			assert.deepStrictEqual(result, []);

			relay.input = e1.event;
			e1.fire(2);
			assert.deepStrictEqual(result, [2]);

			relay.input = e2.event;
			e1.fire(3);
			e2.fire(4);
			assert.deepStrictEqual(result, [2, 4]);

			subscription.dispose();
			e1.fire(5);
			e2.fire(6);
			assert.deepStrictEqual(result, [2, 4]);
		});

		test('should Relay dispose work', () => {
			const e1 = new Emitter<number>();
			const e2 = new Emitter<number>();
			const relay = new Relay<number>();

			const result: number[] = [];
			const listener = (num: number) => result.push(num);
			relay.event(listener);

			e1.fire(1);
			assert.deepStrictEqual(result, []);

			relay.input = e1.event;
			e1.fire(2);
			assert.deepStrictEqual(result, [2]);

			relay.input = e2.event;
			e1.fire(3);
			e2.fire(4);
			assert.deepStrictEqual(result, [2, 4]);

			relay.dispose();
			e1.fire(5);
			e2.fire(6);
			assert.deepStrictEqual(result, [2, 4]);
		});
	});

	test('runAndSubscribeWithStore', () => {
		const eventEmitter = new Emitter();
		const event = eventEmitter.event;

		let i = 0;
		const log = new Array<any>();
		const disposable = Event.runAndSubscribeWithStore(event, (e, disposables) => {
			const idx = i++;
			log.push({ label: 'handleEvent', data: e || null, idx });
			disposables.add(toDisposable(() => {
				log.push({ label: 'dispose', idx });
			}));
		});

		log.push({ label: 'fire' });
		eventEmitter.fire('someEventData');

		log.push({ label: 'disposeAll' });
		disposable.dispose();

		assert.deepStrictEqual(log, [
			{ label: 'handleEvent', data: null, idx: 0 },
			{ label: 'fire' },
			{ label: 'dispose', idx: 0 },
			{ label: 'handleEvent', data: 'someEventData', idx: 1 },
			{ label: 'disposeAll' },
			{ label: 'dispose', idx: 1 },
		]);
	});

	suite('accumulate', () => {
		test('should not fire after a listener is disposed with undefined or []', async () => {
			const eventEmitter = new Emitter<number>();
			const event = eventEmitter.event;
			const accumulated = Event.accumulate(event, 0);

			const calls1: number[][] = [];
			const calls2: number[][] = [];
			const listener1 = accumulated((e) => calls1.push(e));
			accumulated((e) => calls2.push(e));

			eventEmitter.fire(1);
			await timeout(1);
			assert.deepStrictEqual(calls1, [[1]]);
			assert.deepStrictEqual(calls2, [[1]]);

			listener1.dispose();
			await timeout(1);
			assert.deepStrictEqual(calls1, [[1]]);
			assert.deepStrictEqual(calls2, [[1]], 'should not fire after a listener is disposed with undefined or []');
		});
		test('should accumulate a single event', async () => {
			const eventEmitter = new Emitter<number>();
			const event = eventEmitter.event;
			const accumulated = Event.accumulate(event, 0);

			const results1 = await new Promise<number[]>(r => {
				accumulated(r);
				eventEmitter.fire(1);
			});
			assert.deepStrictEqual(results1, [1]);

			const results2 = await new Promise<number[]>(r => {
				accumulated(r);
				eventEmitter.fire(2);
			});
			assert.deepStrictEqual(results2, [2]);
		});
		test('should accumulate multiple events', async () => {
			const eventEmitter = new Emitter<number>();
			const event = eventEmitter.event;
			const accumulated = Event.accumulate(event, 0);

			const results1 = await new Promise<number[]>(r => {
				accumulated(r);
				eventEmitter.fire(1);
				eventEmitter.fire(2);
				eventEmitter.fire(3);
			});
			assert.deepStrictEqual(results1, [1, 2, 3]);

			const results2 = await new Promise<number[]>(r => {
				accumulated(r);
				eventEmitter.fire(4);
				eventEmitter.fire(5);
				eventEmitter.fire(6);
				eventEmitter.fire(7);
				eventEmitter.fire(8);
			});
			assert.deepStrictEqual(results2, [4, 5, 6, 7, 8]);
		});
	});

	suite('debounce', () => {
		test('simple', function (done: () => void) {
			const doc = new Samples.Document3();

			const onDocDidChange = Event.debounce(doc.onDidChange, (prev: string[] | undefined, cur) => {
				if (!prev) {
					prev = [cur];
				} else if (prev.indexOf(cur) < 0) {
					prev.push(cur);
				}
				return prev;
			}, 10);

			let count = 0;

			onDocDidChange(keys => {
				count++;
				assert.ok(keys, 'was not expecting keys.');
				if (count === 1) {
					doc.setText('4');
					assert.deepStrictEqual(keys, ['1', '2', '3']);
				} else if (count === 2) {
					assert.deepStrictEqual(keys, ['4']);
					done();
				}
			});

			doc.setText('1');
			doc.setText('2');
			doc.setText('3');
		});


		test('microtask', function (done: () => void) {
			const doc = new Samples.Document3();

			const onDocDidChange = Event.debounce(doc.onDidChange, (prev: string[] | undefined, cur) => {
				if (!prev) {
					prev = [cur];
				} else if (prev.indexOf(cur) < 0) {
					prev.push(cur);
				}
				return prev;
			}, MicrotaskDelay);

			let count = 0;

			onDocDidChange(keys => {
				count++;
				assert.ok(keys, 'was not expecting keys.');
				if (count === 1) {
					doc.setText('4');
					assert.deepStrictEqual(keys, ['1', '2', '3']);
				} else if (count === 2) {
					assert.deepStrictEqual(keys, ['4']);
					done();
				}
			});

			doc.setText('1');
			doc.setText('2');
			doc.setText('3');
		});


		test('leading', async function () {
			const emitter = new Emitter<void>();
			const debounced = Event.debounce(emitter.event, (l, e) => e, 0, /*leading=*/true);

			let calls = 0;
			debounced(() => {
				calls++;
			});

			// If the source event is fired once, the debounced (on the leading edge) event should be fired only once
			emitter.fire();

			await timeout(1);
			assert.strictEqual(calls, 1);
		});

		test('leading (2)', async function () {
			const emitter = new Emitter<void>();
			const debounced = Event.debounce(emitter.event, (l, e) => e, 0, /*leading=*/true);

			let calls = 0;
			debounced(() => {
				calls++;
			});

			// If the source event is fired multiple times, the debounced (on the leading edge) event should be fired twice
			emitter.fire();
			emitter.fire();
			emitter.fire();
			await timeout(1);
			assert.strictEqual(calls, 2);
		});

		test('leading reset', async function () {
			const emitter = new Emitter<number>();
			const debounced = Event.debounce(emitter.event, (l, e) => l ? l + 1 : 1, 0, /*leading=*/true);

			const calls: number[] = [];
			debounced((e) => calls.push(e));

			emitter.fire(1);
			emitter.fire(1);

			await timeout(1);
			assert.deepStrictEqual(calls, [1, 1]);
		});

		test('should not flush events when a listener is disposed', async () => {
			const emitter = new Emitter<number>();
			const debounced = Event.debounce(emitter.event, (l, e) => l ? l + 1 : 1, 0);

			const calls: number[] = [];
			const listener = debounced((e) => calls.push(e));

			emitter.fire(1);
			listener.dispose();

			emitter.fire(1);

			await timeout(1);
			assert.deepStrictEqual(calls, []);
		});

		test('flushOnListenerRemove - should flush events when a listener is disposed', async () => {
			const emitter = new Emitter<number>();
			const debounced = Event.debounce(emitter.event, (l, e) => l ? l + 1 : 1, 0, undefined, true);

			const calls: number[] = [];
			const listener = debounced((e) => calls.push(e));

			emitter.fire(1);
			listener.dispose();

			emitter.fire(1);

			await timeout(1);
			assert.deepStrictEqual(calls, [1], 'should fire with the first event, not the second (after listener dispose)');
		});

		test('should flush events when the emitter is disposed', async () => {
			const emitter = new Emitter<number>();
			const debounced = Event.debounce(emitter.event, (l, e) => l ? l + 1 : 1, 0);

			const calls: number[] = [];
			debounced((e) => calls.push(e));

			emitter.fire(1);
			emitter.dispose();

			await timeout(1);
			assert.deepStrictEqual(calls, [1]);
		});
	});

	suite('chain2', () => {
		let store: DisposableStore;
		let em: Emitter<number>;
		let calls: number[];

		teardown(() => {
			store.dispose();
		});

		ensureNoDisposablesAreLeakedInTestSuite();

		setup(() => {
			store = new DisposableStore();
			em = new Emitter<number>();
			store.add(em);
			calls = [];
		});

		test('maps', () => {
			const ev = Event.chain(em.event, $ => $.map(v => v * 2));
			store.add(ev(v => calls.push(v)));
			em.fire(1);
			em.fire(2);
			em.fire(3);
			assert.deepStrictEqual(calls, [2, 4, 6]);
		});

		test('filters', () => {
			const ev = Event.chain(em.event, $ => $.filter(v => v % 2 === 0));
			store.add(ev(v => calls.push(v)));
			em.fire(1);
			em.fire(2);
			em.fire(3);
			em.fire(4);
			assert.deepStrictEqual(calls, [2, 4]);
		});

		test('reduces', () => {
			const ev = Event.chain(em.event, $ => $.reduce((acc, v) => acc + v, 0));
			store.add(ev(v => calls.push(v)));
			em.fire(1);
			em.fire(2);
			em.fire(3);
			em.fire(4);
			assert.deepStrictEqual(calls, [1, 3, 6, 10]);
		});

		test('latches', () => {
			const ev = Event.chain(em.event, $ => $.latch());
			store.add(ev(v => calls.push(v)));
			em.fire(1);
			em.fire(1);
			em.fire(2);
			em.fire(2);
			em.fire(3);
			em.fire(3);
			em.fire(1);
			assert.deepStrictEqual(calls, [1, 2, 3, 1]);
		});

		test('does everything', () => {
			const ev = Event.chain(em.event, $ => $
				.filter(v => v % 2 === 0)
				.map(v => v * 2)
				.reduce((acc, v) => acc + v, 0)
				.latch()
			);

			store.add(ev(v => calls.push(v)));
			em.fire(1);
			em.fire(2);
			em.fire(3);
			em.fire(4);
			em.fire(0);
			assert.deepStrictEqual(calls, [4, 12]);
		});
	});
});
