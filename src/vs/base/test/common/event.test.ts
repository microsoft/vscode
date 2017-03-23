/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import Event, { Emitter, fromEventEmitter, debounceEvent, EventBufferer, once, fromPromise, stopwatch, buffer, EventMultiplexer } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import Errors = require('vs/base/common/errors');
import { TPromise } from 'vs/base/common/winjs.base';

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

		private _onDidChange = new Emitter<string>();

		onDidChange: Event<string> = this._onDidChange.event;

		setText(value: string) {
			//...
			this._onDidChange.fire(value);
		}

	}

	// what: like before but expose an existing event emitter as typed events
	export class Document3b /*extends EventEmitter*/ {

		private static _didChange = 'this_is_hidden_from_consumers';

		private _eventBus = new EventEmitter();

		onDidChange = fromEventEmitter<string>(this._eventBus, Document3b._didChange);

		setText(value: string) {
			//...
			this._eventBus.emit(Document3b._didChange, value);
		}
	}
}

suite('Event', function () {

	const counter = new Samples.EventCounter();

	setup(() => counter.reset());

	test('Emitter plain', function () {

		let doc = new Samples.Document3();

		document.createElement('div').onclick = function () { };
		let subscription = doc.onDidChange(counter.onEvent, counter);

		doc.setText('far');
		doc.setText('boo');

		// unhook listener
		subscription.dispose();
		doc.setText('boo');
		assert.equal(counter.count, 2);
	});


	test('wrap legacy EventEmitter', function () {

		let doc = new Samples.Document3b();
		let subscription = doc.onDidChange(counter.onEvent, counter);
		doc.setText('far');
		doc.setText('boo');

		// unhook listener
		subscription.dispose();
		doc.setText('boo');
		assert.equal(counter.count, 2);
	});

	test('Emitter, bucket', function () {

		let bucket: IDisposable[] = [];
		let doc = new Samples.Document3();
		let subscription = doc.onDidChange(counter.onEvent, counter, bucket);

		doc.setText('far');
		doc.setText('boo');

		// unhook listener
		while (bucket.length) {
			bucket.pop().dispose();
		}

		// noop
		subscription.dispose();

		doc.setText('boo');
		assert.equal(counter.count, 2);
	});

	test('wrapEventEmitter, bucket', function () {

		let bucket: IDisposable[] = [];
		let doc = new Samples.Document3b();
		let subscription = doc.onDidChange(counter.onEvent, counter, bucket);

		doc.setText('far');
		doc.setText('boo');

		// unhook listener
		while (bucket.length) {
			bucket.pop().dispose();
		}

		// noop
		subscription.dispose();

		doc.setText('boo');
		assert.equal(counter.count, 2);
	});

	test('onFirstAdd|onLastRemove', function () {

		let firstCount = 0;
		let lastCount = 0;
		let a = new Emitter({
			onFirstListenerAdd() { firstCount += 1; },
			onLastListenerRemove() { lastCount += 1; }
		});

		assert.equal(firstCount, 0);
		assert.equal(lastCount, 0);

		let subscription = a.event(function () { });
		assert.equal(firstCount, 1);
		assert.equal(lastCount, 0);

		subscription.dispose();
		assert.equal(firstCount, 1);
		assert.equal(lastCount, 1);

		subscription = a.event(function () { });
		assert.equal(firstCount, 2);
		assert.equal(lastCount, 1);
	});

	test('throwingListener', function () {
		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => null);

		try {
			let a = new Emitter();
			let hit = false;
			a.event(function () {
				throw 9;
			});
			a.event(function () {
				hit = true;
			});
			a.fire(undefined);
			assert.equal(hit, true);

		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	});

	test('Debounce Event', function (done: () => void) {
		let doc = new Samples.Document3();

		let onDocDidChange = debounceEvent(doc.onDidChange, (prev: string[], cur) => {
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
				assert.deepEqual(keys, ['1', '2', '3']);
			} else if (count === 2) {
				assert.deepEqual(keys, ['4']);
				done();
			}
		});

		doc.setText('1');
		doc.setText('2');
		doc.setText('3');
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

			assert.equal(counter.count, 0);
			emitter.fire();
			assert.equal(counter.count, 1);
			emitter.fire();
			assert.equal(counter.count, 2);
			emitter.fire();
			assert.equal(counter.count, 3);

			listener.dispose();
		});

		test('should buffer when wrapped', () => {
			const bufferer = new EventBufferer();
			const counter = new Samples.EventCounter();
			const emitter = new Emitter<void>();
			const event = bufferer.wrapEvent(emitter.event);
			const listener = event(counter.onEvent, counter);

			assert.equal(counter.count, 0);
			emitter.fire();
			assert.equal(counter.count, 1);

			bufferer.bufferEvents(() => {
				emitter.fire();
				assert.equal(counter.count, 1);
				emitter.fire();
				assert.equal(counter.count, 1);
			});

			assert.equal(counter.count, 3);
			emitter.fire();
			assert.equal(counter.count, 4);

			listener.dispose();
		});

		test('once', () => {
			const emitter = new Emitter<void>();

			let counter1 = 0, counter2 = 0, counter3 = 0;

			const listener1 = emitter.event(() => counter1++);
			const listener2 = once(emitter.event)(() => counter2++);
			const listener3 = once(emitter.event)(() => counter3++);

			assert.equal(counter1, 0);
			assert.equal(counter2, 0);
			assert.equal(counter3, 0);

			listener3.dispose();
			emitter.fire();
			assert.equal(counter1, 1);
			assert.equal(counter2, 1);
			assert.equal(counter3, 0);

			emitter.fire();
			assert.equal(counter1, 2);
			assert.equal(counter2, 1);
			assert.equal(counter3, 0);

			listener1.dispose();
			listener2.dispose();
		});
	});

	suite('fromPromise', () => {

		test('should emit when done', () => {
			let count = 0;

			const event = fromPromise(TPromise.as(null));
			event(() => count++);

			assert.equal(count, 0);

			return TPromise.timeout(10).then(() => {
				assert.equal(count, 1);
			});
		});

		test('should emit when done - setTimeout', () => {
			let count = 0;

			const event = fromPromise(TPromise.timeout(5));
			event(() => count++);

			assert.equal(count, 0);

			return TPromise.timeout(10).then(() => {
				assert.equal(count, 1);
			});
		});

		test('should emit when done - setTimeout', () => {
			let count = 0;

			const event = fromPromise(TPromise.timeout(10));
			event(() => count++);

			assert.equal(count, 0);

			return TPromise.timeout(0).then(() => {
				assert.equal(count, 0);

				return TPromise.timeout(10).then(() => {
					assert.equal(count, 1);
				});
			});
		});
	});

	suite('stopwatch', () => {

		test('should emit', () => {
			const emitter = new Emitter<void>();
			const event = stopwatch(emitter.event);

			return new TPromise((c, e) => {
				event(duration => {
					try {
						assert(duration > 0);
					} catch (err) {
						e(err);
					}

					c(null);
				});

				setTimeout(() => emitter.fire(), 10);
			});
		});
	});

	suite('buffer', () => {

		test('should buffer events', () => {
			const result = [];
			const emitter = new Emitter<number>();
			const event = emitter.event;
			const bufferedEvent = buffer(event);

			emitter.fire(1);
			emitter.fire(2);
			emitter.fire(3);
			assert.deepEqual(result, []);

			const listener = bufferedEvent(num => result.push(num));
			assert.deepEqual(result, [1, 2, 3]);

			emitter.fire(4);
			assert.deepEqual(result, [1, 2, 3, 4]);

			listener.dispose();
			emitter.fire(5);
			assert.deepEqual(result, [1, 2, 3, 4]);
		});

		test('should buffer events on next tick', () => {
			const result = [];
			const emitter = new Emitter<number>();
			const event = emitter.event;
			const bufferedEvent = buffer(event, true);

			emitter.fire(1);
			emitter.fire(2);
			emitter.fire(3);
			assert.deepEqual(result, []);

			const listener = bufferedEvent(num => result.push(num));
			assert.deepEqual(result, []);

			return TPromise.timeout(10).then(() => {
				emitter.fire(4);
				assert.deepEqual(result, [1, 2, 3, 4]);

				listener.dispose();
				emitter.fire(5);
				assert.deepEqual(result, [1, 2, 3, 4]);
			});
		});

		test('should fire initial buffer events', () => {
			const result = [];
			const emitter = new Emitter<number>();
			const event = emitter.event;
			const bufferedEvent = buffer(event, false, [-2, -1, 0]);

			emitter.fire(1);
			emitter.fire(2);
			emitter.fire(3);
			assert.deepEqual(result, []);

			bufferedEvent(num => result.push(num));
			assert.deepEqual(result, [-2, -1, 0, 1, 2, 3]);
		});
	});

	suite('EventMultiplexer', () => {

		test('works', () => {
			const result = [];
			const m = new EventMultiplexer<number>();
			m.event(r => result.push(r));

			const e1 = new Emitter<number>();
			m.add(e1.event);

			assert.deepEqual(result, []);

			e1.fire(0);
			assert.deepEqual(result, [0]);
		});

		test('multiplexer dispose works', () => {
			const result = [];
			const m = new EventMultiplexer<number>();
			m.event(r => result.push(r));

			const e1 = new Emitter<number>();
			m.add(e1.event);

			assert.deepEqual(result, []);

			e1.fire(0);
			assert.deepEqual(result, [0]);

			m.dispose();
			assert.deepEqual(result, [0]);

			e1.fire(0);
			assert.deepEqual(result, [0]);
		});

		test('event dispose works', () => {
			const result = [];
			const m = new EventMultiplexer<number>();
			m.event(r => result.push(r));

			const e1 = new Emitter<number>();
			m.add(e1.event);

			assert.deepEqual(result, []);

			e1.fire(0);
			assert.deepEqual(result, [0]);

			e1.dispose();
			assert.deepEqual(result, [0]);

			e1.fire(0);
			assert.deepEqual(result, [0]);
		});

		test('mutliplexer event dispose works', () => {
			const result = [];
			const m = new EventMultiplexer<number>();
			m.event(r => result.push(r));

			const e1 = new Emitter<number>();
			const l1 = m.add(e1.event);

			assert.deepEqual(result, []);

			e1.fire(0);
			assert.deepEqual(result, [0]);

			l1.dispose();
			assert.deepEqual(result, [0]);

			e1.fire(0);
			assert.deepEqual(result, [0]);
		});

		test('hot start works', () => {
			const result = [];
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
			assert.deepEqual(result, [1, 2, 3]);
		});

		test('cold start works', () => {
			const result = [];
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
			assert.deepEqual(result, [1, 2, 3]);
		});

		test('late add works', () => {
			const result = [];
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

			assert.deepEqual(result, [1, 2, 3]);
		});

		test('add dispose works', () => {
			const result = [];
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
			assert.deepEqual(result, [1, 2, 3]);

			l3.dispose();
			e3.fire(4);
			assert.deepEqual(result, [1, 2, 3]);

			e2.fire(4);
			e1.fire(5);
			assert.deepEqual(result, [1, 2, 3, 4, 5]);
		});
	});
});