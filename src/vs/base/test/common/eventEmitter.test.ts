/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { EventEmitter, OrderGuaranteeEventEmitter } from 'vs/base/common/eventEmitter';

suite('EventEmitter', () => {
	let eventEmitter: EventEmitter;

	setup(() => {
		eventEmitter = new EventEmitter();
	});

	teardown(() => {
		eventEmitter.dispose();
		eventEmitter = null;
	});

	test('add listener, emit other event type', function () {
		let didCall = false;
		eventEmitter.addListener2('eventType1', function (e) {
			didCall = true;
		});
		eventEmitter.emit('eventType2', {});
		assert(!didCall, 'Didn\'t expect to be called');
	});

	test('add listener, emit event', function () {
		let didCall = false;
		eventEmitter.addListener2('eventType', function (e) {
			didCall = true;
		});
		eventEmitter.emit('eventType', {});
		assert(didCall);
	});

	test('add 2 listeners, emit event', function () {
		let didCallFirst = false;
		eventEmitter.addListener2('eventType', function (e) {
			didCallFirst = true;
		});
		let didCallSecond = false;
		eventEmitter.addListener2('eventType', function (e) {
			didCallSecond = true;
		});
		eventEmitter.emit('eventType', {});
		assert(didCallFirst);
		assert(didCallSecond);
	});

	test('add 1 listener, remove it, emit event', function () {
		let didCall = false;
		let remove = eventEmitter.addListener2('eventType', function (e) {
			didCall = true;
		});
		remove.dispose();
		eventEmitter.emit('eventType', {});
		assert(!didCall);
	});

	test('add 2 listeners, emit event, remove one while processing', function () {
		let firstCallCount = 0;
		let remove1 = eventEmitter.addListener2('eventType', function (e) {
			firstCallCount++;
			remove1.dispose();
		});
		let secondCallCount = 0;
		eventEmitter.addListener2('eventType', function (e) {
			secondCallCount++;
		});
		eventEmitter.emit('eventType', {});
		eventEmitter.emit('eventType', {});
		assert.equal(firstCallCount, 1);
		assert.equal(secondCallCount, 2);
	});

	test('event object is assert', function () {
		let data: any;
		eventEmitter.addListener2('eventType', function (e) {
			data = e.data;
		});
		eventEmitter.emit('eventType', { data: 5 });
		assert.equal(data, 5);
	});

	test('deferred emit', function () {
		let calledCount = 0;
		eventEmitter.addListener2('eventType', function (e) {
			calledCount++;
		});
		eventEmitter.deferredEmit(function () {
			assert.equal(calledCount, 0);
			eventEmitter.emit('eventType', {});
			assert.equal(calledCount, 0);
			eventEmitter.emit('eventType', {});
			assert.equal(calledCount, 0);
		});
		assert.equal(calledCount, 2);
	});

	test('deferred emit maintains events order', function () {
		let order = 0;
		eventEmitter.addListener2('eventType2', function (e) {
			order++;
			assert.equal(order, 1);
		});
		eventEmitter.addListener2('eventType1', function (e) {
			order++;
			assert.equal(order, 2);
		});
		eventEmitter.deferredEmit(function () {
			eventEmitter.emit('eventType2', {});
			eventEmitter.emit('eventType1', {});
		});
		assert.equal(order, 2);
	});

	test('deferred emit maintains events order for bulk listeners', function () {
		let count = 0;
		eventEmitter.addBulkListener2(function (events) {
			assert.equal(events[0].getType(), 'eventType2');
			assert.equal(events[1].getType(), 'eventType1');
			count++;
		});
		eventEmitter.deferredEmit(function () {
			eventEmitter.emit('eventType2', {});
			eventEmitter.emit('eventType1', {});
		});
		assert.equal(count, 1);
	});

	test('emit notifies bulk listeners', function () {
		let count = 0;
		eventEmitter.addBulkListener2(function (events) {
			count++;
		});
		eventEmitter.emit('eventType', {});
		assert.equal(count, 1);
	});

	test('one event emitter, one listener', function () {
		let emitter = new EventEmitter();
		let eventBus = new EventEmitter();

		eventBus.addEmitter2(emitter);
		let didCallFirst = false;
		eventBus.addListener2('eventType', function (e) {
			didCallFirst = true;
		});
		let didCallSecond = false;
		eventBus.addListener2('eventType', function (e) {
			didCallSecond = true;
		});

		emitter.emit('eventType', {});
		assert(didCallFirst);
		assert(didCallSecond);
	});

	test('two event emitters, two listeners, deferred emit', function () {
		let callCnt = 0;
		let emitter1 = new EventEmitter();
		let emitter2 = new EventEmitter();
		let eventBus = new EventEmitter();

		eventBus.addEmitter2(emitter1);
		eventBus.addEmitter2(emitter2);
		eventBus.addListener2('eventType1', function (e) {
			assert(true);
			callCnt++;
		});
		eventBus.addListener2('eventType1', function (e) {
			assert(true);
			callCnt++;
		});

		eventBus.deferredEmit(function () {
			assert.equal(callCnt, 0);
			emitter1.emit('eventType1', {});
			emitter2.emit('eventType1', {});
			assert.equal(callCnt, 0);
		});
		assert.equal(callCnt, 4);
	});

	test('cascading emitters', function () {
		let emitter1 = new EventEmitter();
		let emitter2 = new EventEmitter();
		let emitter3 = new EventEmitter();
		let emitter4 = new EventEmitter();

		emitter2.addEmitter2(emitter1);
		emitter3.addEmitter2(emitter2);
		emitter4.addEmitter2(emitter3);

		let didCall = false;
		emitter4.addListener2('eventType', function (e) {
			didCall = true;
		});

		emitter1.emit('eventType', {});
		assert(didCall);
	});

	test('EventEmitter makes no order guarantees 1', () => {
		let emitter = new EventEmitter();
		let actualCallOrder: string[] = [];

		emitter.addListener2('foo', function () {
			actualCallOrder.push('listener1-foo');
			emitter.emit('bar');
		});


		emitter.addListener2('foo', function () {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener2('bar', function () {
			actualCallOrder.push('listener2-bar');
		});

		emitter.emit('foo');

		assert.deepEqual(actualCallOrder, [
			'listener1-foo',
			'listener2-bar',
			'listener2-foo'
		]);
	});

	test('EventEmitter makes no order guarantees 2', () => {
		let emitter = new EventEmitter();
		let actualCallOrder: string[] = [];

		emitter.addListener2('foo', function () {
			actualCallOrder.push('listener1-foo');
			emitter.deferredEmit(() => {
				emitter.emit('bar');
			});
		});


		emitter.addListener2('foo', function () {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener2('bar', function () {
			actualCallOrder.push('listener2-bar');
		});

		emitter.deferredEmit(() => {
			emitter.emit('foo');
		});

		assert.deepEqual(actualCallOrder, [
			'listener1-foo',
			'listener2-bar',
			'listener2-foo'
		]);
	});

	test('OrderGuaranteeEventEmitter makes order guarantees 1', () => {
		let emitter = new OrderGuaranteeEventEmitter();
		let actualCallOrder: string[] = [];

		emitter.addListener2('foo', function () {
			actualCallOrder.push('listener1-foo');
			emitter.emit('bar');
		});


		emitter.addListener2('foo', function () {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener2('bar', function () {
			actualCallOrder.push('listener2-bar');
		});

		emitter.emit('foo');

		assert.deepEqual(actualCallOrder, [
			'listener1-foo',
			'listener2-foo',
			'listener2-bar'
		]);
	});

	test('OrderGuaranteeEventEmitter makes order guarantees 2', () => {
		let emitter = new OrderGuaranteeEventEmitter();
		let actualCallOrder: string[] = [];

		emitter.addListener2('foo', function () {
			actualCallOrder.push('listener1-foo');
			emitter.deferredEmit(() => {
				emitter.emit('bar');
			});
		});


		emitter.addListener2('foo', function () {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener2('bar', function () {
			actualCallOrder.push('listener2-bar');
		});

		emitter.deferredEmit(() => {
			emitter.emit('foo');
		});

		assert.deepEqual(actualCallOrder, [
			'listener1-foo',
			'listener2-foo',
			'listener2-bar'
		]);
	});
});
