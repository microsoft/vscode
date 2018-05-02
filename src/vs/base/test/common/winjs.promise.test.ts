/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as WinJS from 'vs/base/common/winjs.base';

suite('WinJS and ES6 Promises', function () {

	test('Promise.resolve', function () {
		let resolveTPromise;
		const tPromise = new WinJS.Promise(function (c, e, p) {
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
		const tPromise = new WinJS.Promise(function (c, e, p) {
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
});
