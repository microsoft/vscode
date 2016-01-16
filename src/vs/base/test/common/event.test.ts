/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import Event, {Emitter, fromEventEmitter} from 'vs/base/common/event';
import {IDisposable} from 'vs/base/common/lifecycle';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import Errors = require('vs/base/common/errors');

namespace Samples {

	export class EventCounter {

		public count = 0;

		public reset() {
			this.count = 0;
		}

		public onEvent() {
			this.count += 1;
		}
	}

	export class Document3 {

		private _onDidChange = new Emitter<string>();

		public onDidChange: Event<string> = this._onDidChange.event;

		public setText(value:string) {
			//...
			this._onDidChange.fire(value);
		}

	}

	// what: like before but expose an existing event emitter as typed events
	export class Document3b /*extends EventEmitter*/ {

		private static _didChange = 'this_is_hidden_from_consumers';

		private _eventBus = new EventEmitter();

		public onDidChange = fromEventEmitter<string>(this._eventBus, Document3b._didChange);

		public setText(value:string) {
			//...
			this._eventBus.emit(Document3b._didChange, value);
		}
	}
}


let counter = new Samples.EventCounter();

setup(function () {
	counter.reset();
})

suite('Event',function(){

	test('Emitter plain', function () {

		let doc = new Samples.Document3();

		document.createElement('div').onclick = function () { }
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
			})
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