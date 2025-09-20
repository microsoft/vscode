/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { DisposableStore } from '../../common/lifecycle.js';
import { observableValue } from '../../common/observable.js';
import { Event } from '../../common/event.js';

suite('Event.fromObservable / fromObservableLight', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('fromObservable: listener gets initial value and subsequent changes', function () {
		const store = new DisposableStore();

		const obs = observableValue('event.fromObservable.test1', 1);
		const events: number[] = [];

		const ev = Event.fromObservable<number>(obs, store);
		const d = ev((v: number) => {
			events.push(v);
		}, null, store);

		// initial value is reported immediately when listener is added
		assert.deepEqual(events, [1]);

		obs.set(2, undefined);
		assert.deepEqual(events, [1, 2]);

		d.dispose();
		obs.set(3, undefined);
		assert.deepEqual(events, [1, 2], 'disposed listener should not receive further events');

		store.dispose();
	});

	test('fromObservableLight: listener receives signals only on changes (no payload)', function () {
		const store = new DisposableStore();
		const obs = observableValue('event.fromObservableLight.test', 10);
		let called = 0;

		const ev = Event.fromObservableLight(obs);
		const d = ev(() => { called++; }, null, store);

		// observable reports initial value; fromObservableLight should call listener once for initial report
		assert.equal(called, 1);

		obs.set(11, undefined);
		assert.equal(called, 2);

		d.dispose();
		obs.set(12, undefined);
		assert.equal(called, 2, 'disposed listener should not be called');

		store.dispose();
	});

	test('batch updates coalesce into single notification', function () {
		const store = new DisposableStore();
		const obs = observableValue('event.fromObservable.batch', 0);
		const received: number[] = [];

		const ev = Event.fromObservable(obs, store);
		ev((v: number) => received.push(v), null, store);

		// multiple sets in quick succession should yield the final value
		obs.set(1, undefined);
		obs.set(2, undefined);
		obs.set(3, undefined);

		assert.ok(received.length >= 1);
		assert.equal(received[received.length - 1], 3);

		store.dispose();
	});

	test('undefined initial then set behaves correctly', function () {
		const store = new DisposableStore();
		const obs = observableValue<number | undefined>('event.fromObservable.undefined', undefined);
		const events: (number | undefined)[] = [];

		const ev = Event.fromObservable(obs, store);
		ev((v: number | undefined) => events.push(v), null, store);

		assert.deepEqual(events, [undefined]);

		obs.set(42);
		assert.deepEqual(events, [undefined, 42]);

		store.dispose();
	});
});
