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
		eventEmitter.addListener('eventType1', function (e) {
			didCall = true;
		});
		eventEmitter.emit('eventType2', {});
		assert(!didCall, 'Didn\'t expect to be called');
	});

	test('add listener, emit event', function () {
		let didCall = false;
		eventEmitter.addListener('eventType', function (e) {
			didCall = true;
		});
		eventEmitter.emit('eventType', {});
		assert(didCall);
	});

	test('add 2 listeners, emit event', function () {
		let didCallFirst = false;
		eventEmitter.addListener('eventType', function (e) {
			didCallFirst = true;
		});
		let didCallSecond = false;
		eventEmitter.addListener('eventType', function (e) {
			didCallSecond = true;
		});
		eventEmitter.emit('eventType', {});
		assert(didCallFirst);
		assert(didCallSecond);
	});

	test('add 1 listener, remove it, emit event', function () {
		let didCall = false;
		let remove = eventEmitter.addListener('eventType', function (e) {
			didCall = true;
		});
		remove.dispose();
		eventEmitter.emit('eventType', {});
		assert(!didCall);
	});

	test('add 2 listeners, emit event, remove one while processing', function () {
		let firstCallCount = 0;
		let remove1 = eventEmitter.addListener('eventType', function (e) {
			firstCallCount++;
			remove1.dispose();
		});
		let secondCallCount = 0;
		eventEmitter.addListener('eventType', function (e) {
			secondCallCount++;
		});
		eventEmitter.emit('eventType', {});
		eventEmitter.emit('eventType', {});
		assert.equal(firstCallCount, 1);
		assert.equal(secondCallCount, 2);
	});

	test('event object is assert', function () {
		let data: any;
		eventEmitter.addListener('eventType', function (e) {
			data = e.data;
		});
		eventEmitter.emit('eventType', { data: 5 });
		assert.equal(data, 5);
	});

	test('deferred emit', function () {
		let calledCount = 0;
		eventEmitter.addListener('eventType', function (e) {
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
		eventEmitter.addListener('eventType2', function (e) {
			order++;
			assert.equal(order, 1);
		});
		eventEmitter.addListener('eventType1', function (e) {
			order++;
			assert.equal(order, 2);
		});
		eventEmitter.deferredEmit(function () {
			eventEmitter.emit('eventType2', {});
			eventEmitter.emit('eventType1', {});
		});
		assert.equal(order, 2);
	});

	test('EventEmitter makes no order guarantees 1', () => {
		let emitter = new EventEmitter();
		let actualCallOrder: string[] = [];

		emitter.addListener('foo', function () {
			actualCallOrder.push('listener1-foo');
			emitter.emit('bar');
		});


		emitter.addListener('foo', function () {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener('bar', function () {
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

		emitter.addListener('foo', function () {
			actualCallOrder.push('listener1-foo');
			emitter.deferredEmit(() => {
				emitter.emit('bar');
			});
		});


		emitter.addListener('foo', function () {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener('bar', function () {
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

		emitter.addListener('foo', function () {
			actualCallOrder.push('listener1-foo');
			emitter.emit('bar');
		});


		emitter.addListener('foo', function () {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener('bar', function () {
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

		emitter.addListener('foo', function () {
			actualCallOrder.push('listener1-foo');
			emitter.deferredEmit(() => {
				emitter.emit('bar');
			});
		});


		emitter.addListener('foo', function () {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener('bar', function () {
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
