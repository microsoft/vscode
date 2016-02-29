/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { EventEmitter, OrderGuaranteeEventEmitter } from 'vs/base/common/eventEmitter';

suite('EventEmitter', () => {
	var eventEmitter: EventEmitter;

	setup(() => {
		eventEmitter = new EventEmitter();
	});

	teardown(() => {
		eventEmitter.dispose();
		eventEmitter = null;
	});

	test('add listener, emit other event type', function () {
		var didCall = false;
		eventEmitter.addListener('eventType1', function (e) {
			didCall = true;
		});
		eventEmitter.emit('eventType2', {});
		assert(!didCall, 'Didn\'t expect to be called');
	});

	test('add listener, emit event', function () {
		var didCall = false;
		eventEmitter.addListener('eventType', function (e) {
			didCall = true;
		});
		eventEmitter.emit('eventType', {});
		assert(didCall);
	});

	test('add 2 listeners, emit event', function () {
		var didCallFirst = false;
		eventEmitter.addListener('eventType', function (e) {
			didCallFirst = true;
		});
		var didCallSecond = false;
		eventEmitter.addListener('eventType', function (e) {
			didCallSecond = true;
		});
		eventEmitter.emit('eventType', {});
		assert(didCallFirst);
		assert(didCallSecond);
	});

	test('add 1 listener, remove it, emit event', function () {
		var didCall = false;
		var remove = eventEmitter.addListener('eventType', function (e) {
			didCall = true;
		});
		remove();
		eventEmitter.emit('eventType', {});
		assert(!didCall);
	});

	test('add 2 listeners, emit event, remove one while processing', function () {
		var firstCallCount = 0;
		var remove1 = eventEmitter.addListener('eventType', function (e) {
			firstCallCount++;
			remove1();
		});
		var secondCallCount = 0;
		eventEmitter.addListener('eventType', function (e) {
			secondCallCount++;
		});
		eventEmitter.emit('eventType', {});
		eventEmitter.emit('eventType', {});
		assert.equal(firstCallCount, 1);
		assert.equal(secondCallCount, 2);
	});

	test('event object is assert', function () {
		var data: any;
		eventEmitter.addListener('eventType', function (e) {
			data = e.data;
		});
		eventEmitter.emit('eventType', { data: 5 });
		assert.equal(data, 5);
	});

	test('deferred emit', function () {
		var calledCount = 0;
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
		var order = 0;
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

	test('deferred emit maintains events order for bulk listeners', function () {
		var count = 0;
		eventEmitter.addBulkListener(function (events) {
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
		var count = 0;
		eventEmitter.addBulkListener(function (events) {
			count++;
		});
		eventEmitter.emit('eventType', {});
		assert.equal(count, 1);
	});

	test('one event emitter, one listener', function () {
		var emitter = new EventEmitter();
		var eventBus = new EventEmitter();

		eventBus.addEmitter(emitter, 'emitter1');
		var didCallFirst = false;
		eventBus.addListener('eventType', function (e) {
			didCallFirst = true;
		});
		var didCallSecond = false;
		eventBus.addListener('eventType/emitter1', function (e) {
			didCallSecond = true;
		});

		emitter.emit('eventType', {});
		assert(didCallFirst);
		assert(didCallSecond);
	});

	test('two event emitters, two listeners, deferred emit', function () {
		var callCnt = 0;
		var emitter1 = new EventEmitter();
		var emitter2 = new EventEmitter();
		var eventBus = new EventEmitter();

		eventBus.addEmitter(emitter1, 'emitter1');
		eventBus.addEmitter(emitter2, 'emitter2');
		eventBus.addListener('eventType1', function (e) {
			assert(true);
			callCnt++;
		});
		eventBus.addListener('eventType1/emitter1', function (e) {
			assert(true);
			callCnt++;
		});
		eventBus.addEmitterTypeListener('eventType1', 'emitter1', function (e) {
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
		var emitter1 = new EventEmitter();
		var emitter2 = new EventEmitter();
		var emitter3 = new EventEmitter();
		var emitter4 = new EventEmitter();

		emitter2.addEmitter(emitter1);
		emitter3.addEmitter(emitter2);
		emitter4.addEmitter(emitter3);

		var didCall = false;
		emitter4.addListener('eventType', function (e) {
			didCall = true;
		});

		emitter1.emit('eventType', {});
		assert(didCall);
	});

	test('EventEmitter makes no order guarantees 1', () => {
		var emitter = new EventEmitter();
		var actualCallOrder: string[] = [];

		emitter.addListener('foo', function() {
			actualCallOrder.push('listener1-foo');
			emitter.emit('bar');
		});


		emitter.addListener('foo', function() {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener('bar', function() {
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
		var emitter = new EventEmitter();
		var actualCallOrder: string[] = [];

		emitter.addListener('foo', function() {
			actualCallOrder.push('listener1-foo');
			emitter.deferredEmit(() => {
				emitter.emit('bar');
			});
		});


		emitter.addListener('foo', function() {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener('bar', function() {
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
		var emitter = new OrderGuaranteeEventEmitter();
		var actualCallOrder: string[] = [];

		emitter.addListener('foo', function() {
			actualCallOrder.push('listener1-foo');
			emitter.emit('bar');
		});


		emitter.addListener('foo', function() {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener('bar', function() {
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
		var emitter = new OrderGuaranteeEventEmitter();
		var actualCallOrder: string[] = [];

		emitter.addListener('foo', function() {
			actualCallOrder.push('listener1-foo');
			emitter.deferredEmit(() => {
				emitter.emit('bar');
			});
		});


		emitter.addListener('foo', function() {
			actualCallOrder.push('listener2-foo');
		});
		emitter.addListener('bar', function() {
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
