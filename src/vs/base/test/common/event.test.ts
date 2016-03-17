/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import Event, {Emitter, fromEventEmitter, EventBufferer} from 'vs/base/common/event';
import {IDisposable} from 'vs/base/common/lifecycle';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import Errors = require('vs/base/common/errors');

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

		setText(value:string) {
			//...
			this._onDidChange.fire(value);
		}

	}

	// what: like before but expose an existing event emitter as typed events
	export class Document3b /*extends EventEmitter*/ {

		private static _didChange = 'this_is_hidden_from_consumers';

		private _eventBus = new EventEmitter();

		onDidChange = fromEventEmitter<string>(this._eventBus, Document3b._didChange);

		setText(value:string) {
			//...
			this._eventBus.emit(Document3b._didChange, value);
		}
	}
}

suite('Event',function(){

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

	test('Emitter, bucket', function(){

		let bucket:IDisposable[] = [];
		let doc = new Samples.Document3();
		let subscription = doc.onDidChange(counter.onEvent, counter, bucket);

		doc.setText('far');
		doc.setText('boo');

		// unhook listener
		while(bucket.length) {
			bucket.pop().dispose();
		}

		// noop
		subscription.dispose();

		doc.setText('boo');
		assert.equal(counter.count, 2);
	});

	test('wrapEventEmitter, bucket', function(){

		let bucket:IDisposable[] = [];
		let doc = new Samples.Document3b();
		let subscription = doc.onDidChange(counter.onEvent, counter, bucket);

		doc.setText('far');
		doc.setText('boo');

		// unhook listener
		while(bucket.length) {
			bucket.pop().dispose();
		}

		// noop
		subscription.dispose();

		doc.setText('boo');
		assert.equal(counter.count, 2);
	});

	test('onFirstAdd|onLastRemove', function(){

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

	test('throwingListener', function() {
		var origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => null);

		try {
			let a = new Emitter();
			let hit = false;
			a.event(function() {
				throw 9;
			});
			a.event(function() {
				hit = true;
			});
			a.fire(undefined);
			assert.equal(hit, true);

		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	});
});

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
});