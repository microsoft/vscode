/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import flow = require('vs/base/node/flow');

const loop = flow.loop;
const parallel = flow.parallel;

suite('Flow', () => {

	test('loopSync', function (done: () => void) {
		const elements = ['1', '2', '3'];
		loop(elements, function (element, callback, index, total) {
			assert.ok(index === 0 || index === 1 || index === 2);
			assert.deepEqual(3, total);
			callback(null, element);
		}, function (error, result) {
			assert.equal(error, null);
			assert.deepEqual(result, elements);

			done();
		});
	});

	test('loopByFunctionSync', function (done: () => void) {
		const elements = function (callback) {
			callback(null, ['1', '2', '3']);
		};

		loop(elements, function (element, callback) {
			callback(null, element);
		}, function (error, result) {
			assert.equal(error, null);
			assert.deepEqual(result, ['1', '2', '3']);

			done();
		});
	});

	test('loopByFunctionAsync', function (done: () => void) {
		const elements = function (callback) {
			process.nextTick(function () {
				callback(null, ['1', '2', '3']);
			});
		};

		loop(elements, function (element, callback) {
			callback(null, element);
		}, function (error, result) {
			assert.equal(error, null);
			assert.deepEqual(result, ['1', '2', '3']);

			done();
		});
	});

	test('loopSyncErrorByThrow', function (done: () => void) {
		const elements = ['1', '2', '3'];
		loop(elements, function (element, callback) {
			if (element === '2') {
				throw new Error('foo');
			} else {
				callback(null, element);
			}
		}, function (error, result) {
			assert.ok(error);
			assert.ok(!result);

			done();
		});
	});

	test('loopSyncErrorByCallback', function (done: () => void) {
		const elements = ['1', '2', '3'];
		loop(elements, function (element, callback) {
			if (element === '2') {
				callback(new Error('foo'), null);
			} else {
				callback(null, element);
			}
		}, function (error, result) {
			assert.ok(error);
			assert.ok(!result);

			done();
		});
	});

	test('loopAsync', function (done: () => void) {
		const elements = ['1', '2', '3'];
		loop(elements, function (element, callback) {
			process.nextTick(function () {
				callback(null, element);
			});
		}, function (error, result) {
			assert.equal(error, null);
			assert.deepEqual(result, elements);

			done();
		});
	});

	test('loopAsyncErrorByCallback', function (done: () => void) {
		const elements = ['1', '2', '3'];
		loop(elements, function (element, callback) {
			process.nextTick(function () {
				if (element === '2') {
					callback(new Error('foo'), null);
				} else {
					callback(null, element);
				}
			});
		}, function (error, result) {
			assert.ok(error);
			assert.ok(!result);

			done();
		});
	});

	test('loopTolerateBooleanResults', function (done: () => void) {
		let elements = ['1', '2', '3'];
		loop(elements, function (element, callback) {
			process.nextTick(function () {
				(<any>callback)(true);
			});
		}, function (error, result) {
			assert.equal(error, null);
			assert.deepEqual(result, [true, true, true]);

			done();
		});
	});

	test('parallel', function (done: () => void) {
		let elements = [1, 2, 3, 4, 5];
		let sum = 0;

		parallel(elements, function (element, callback) {
			sum += element;
			callback(null, element * element);
		}, function (errors, result) {
			assert.ok(!errors);

			assert.deepEqual(sum, 15);
			assert.deepEqual(result, [1, 4, 9, 16, 25]);

			done();
		});
	});

	test('parallel - setTimeout', function (done: () => void) {
		let elements = [1, 2, 3, 4, 5];
		let timeouts = [10, 30, 5, 0, 4];
		let sum = 0;

		parallel(elements, function (element, callback) {
			setTimeout(function () {
				sum += element;
				callback(null, element * element);
			}, timeouts.pop());
		}, function (errors, result) {
			assert.ok(!errors);

			assert.deepEqual(sum, 15);
			assert.deepEqual(result, [1, 4, 9, 16, 25]);

			done();
		});
	});

	test('parallel - with error', function (done: () => void) {
		const elements = [1, 2, 3, 4, 5];
		const timeouts = [10, 30, 5, 0, 4];
		let sum = 0;

		parallel(elements, function (element, callback) {
			setTimeout(function () {
				if (element === 4) {
					callback(new Error('error!'), null);
				} else {
					sum += element;
					callback(null, element * element);
				}
			}, timeouts.pop());
		}, function (errors, result) {
			assert.ok(errors);
			assert.deepEqual(errors, [null, null, null, new Error('error!'), null]);

			assert.deepEqual(sum, 11);
			assert.deepEqual(result, [1, 4, 9, null, 25]);

			done();
		});
	});
});