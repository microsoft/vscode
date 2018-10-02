/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as winjs from 'vs/base/common/winjs.base';

suite('WinJS and ES6 Promises', function () {

	test('Promise.resolve', () => {
		let resolveTPromise;
		const tPromise = new winjs.Promise((c, e) => {
			resolveTPromise = c;
		});

		const es6Promise = Promise.resolve(tPromise);

		const done = es6Promise.then(function (result) {
			assert.equal(result, 'passed');
		});

		resolveTPromise('passed');

		return done;
	});

	test('new Promise', function () {
		let resolveTPromise;
		const tPromise = new winjs.Promise((c, e) => {
			resolveTPromise = c;
		});

		const es6Promise = new Promise(function (c, e) {
			c(tPromise);
		});

		const done = es6Promise.then(function (result) {
			assert.equal(result, 'passed');
		});

		resolveTPromise('passed');

		return done;
	});

	test('1. Uncaught TypeError: this._state.then is not a function', () => {
		let p1 = winjs.Promise.wrap<number>(new Promise<number>(function (c, e) { c(1); }));
		Promise.all([p1]);
	});

	test('2. Uncaught TypeError: this._state.then is not a function', () => {
		let p1 = winjs.Promise.wrap<number>(new Promise<number>(function (c, e) { c(1); }));
		let thenFunc = p1.then.bind(p1);
		setTimeout(() => {
			thenFunc(() => { });
		}, 0);
	});

	test('3. Uncaught TypeError: this._state.then is not a function', () => {
		let c;
		let p1 = new winjs.Promise(function (_c, e) { c = _c; });
		let thenFunc = p1.then.bind(p1);
		setTimeout(() => {
			c(1);
			thenFunc(() => { });
		}, 0);
	});
});
