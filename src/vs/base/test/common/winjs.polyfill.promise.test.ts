/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { PolyfillPromise } from 'vs/base/common/winjs.polyfill.promise';
import { Promise as WinJSPromise } from 'vs/base/common/winjs.base';

suite('Polyfill Promise', function () {

	test('sync-resolve, NativePromise', function () {
		// native promise behaviour
		const actual: string[] = [];
		const promise = new Promise(resolve => {
			actual.push('inCtor');
			resolve(null);
		}).then(() => actual.push('inThen'));
		actual.push('afterCtor');
		return promise.then(() => {
			assert.deepEqual(actual, ['inCtor', 'afterCtor', 'inThen']);
		});
	});

	test('sync-resolve, WinJSPromise', function () {

		// winjs promise behaviour
		const actual: string[] = [];
		const promise = new WinJSPromise(resolve => {
			actual.push('inCtor');
			resolve(null);
		}).then(() => actual.push('inThen'));
		actual.push('afterCtor');
		return promise.then(() => {
			assert.deepEqual(actual, ['inCtor', 'inThen', 'afterCtor']);
		});
	});

	test('sync-resolve, PolyfillPromise', function () {

		// winjs promise behaviour
		const actual: string[] = [];
		const promise = new PolyfillPromise(resolve => {
			actual.push('inCtor');
			resolve(null);
		}).then(() => actual.push('inThen'));
		actual.push('afterCtor');
		return promise.then(() => {
			assert.deepEqual(actual, ['inCtor', 'afterCtor', 'inThen']);
		});
	});

	test('sync-then, NativePromise', function () {
		const actual: string[] = [];
		const promise = Promise.resolve(123).then(() => actual.push('inThen'));
		actual.push('afterThen');
		return promise.then(() => {
			assert.deepEqual(actual, ['afterThen', 'inThen']);
		});
	});

	test('sync-then, WinJSPromise', function () {
		const actual: string[] = [];
		const promise = WinJSPromise.as(123).then(() => actual.push('inThen'));
		actual.push('afterThen');
		return promise.then(() => {
			assert.deepEqual(actual, ['inThen', 'afterThen']);
		});
	});

	test('sync-then, PolyfillPromise', function () {
		const actual: string[] = [];
		const promise = PolyfillPromise.resolve(123).then(() => actual.push('inThen'));
		actual.push('afterThen');
		return promise.then(() => {
			assert.deepEqual(actual, ['afterThen', 'inThen']);
		});
	});

	test('PolyfillPromise, executor has two params', function () {
		return new PolyfillPromise(function () {
			assert.equal(arguments.length, 2);
			assert.equal(typeof arguments[0], 'function');
			assert.equal(typeof arguments[1], 'function');

			arguments[0]();
		});
	});

	// run the same tests for the native and polyfill promise
	(<any[]>[Promise, PolyfillPromise]).forEach(PromiseCtor => {

		test(PromiseCtor.name + ', resolved value', function () {
			return new PromiseCtor((resolve: Function) => resolve(1)).then((value: number) => assert.equal(value, 1));
		});

		test(PromiseCtor.name + ', rejected value', function () {
			return new PromiseCtor((_: Function, reject: Function) => reject(1)).then(null, (value: number) => assert.equal(value, 1));
		});

		test(PromiseCtor.name + ', catch', function () {
			return new PromiseCtor((_: Function, reject: Function) => reject(1)).catch((value: number) => assert.equal(value, 1));
		});

		test(PromiseCtor.name + ', static-resolve', function () {
			return PromiseCtor.resolve(42).then((value: number) => assert.equal(value, 42));
		});

		test(PromiseCtor.name + ', static-reject', function () {
			return PromiseCtor.reject(42).then(null, (value: number) => assert.equal(value, 42));
		});

		test(PromiseCtor.name + ', static-all, 1', function () {
			return PromiseCtor.all([
				PromiseCtor.resolve(1),
				PromiseCtor.resolve(2)
			]).then((values: number[]) => {
				assert.deepEqual(values, [1, 2]);
			});
		});

		test(PromiseCtor.name + ', static-all, 2', function () {
			return PromiseCtor.all([
				PromiseCtor.resolve(1),
				3,
				PromiseCtor.resolve(2)
			]).then((values: number[]) => {
				assert.deepEqual(values, [1, 3, 2]);
			});
		});

		test(PromiseCtor.name + ', static-all, 3', function () {
			return PromiseCtor.all([
				PromiseCtor.resolve(1),
				PromiseCtor.reject(13),
				PromiseCtor.reject(12),
			]).catch((values: number) => {
				assert.deepEqual(values, 13);
			});
		});

		test(PromiseCtor.name + ', static-race, 1', function () {
			return PromiseCtor.race([
				PromiseCtor.resolve(1),
				PromiseCtor.resolve(2),
			]).then((value: number) => {
				assert.deepEqual(value, 1);
			});
		});

		test(PromiseCtor.name + ', static-race, 2', function () {
			return PromiseCtor.race([
				PromiseCtor.reject(-1),
				PromiseCtor.resolve(2),
			]).catch((value: number) => {
				assert.deepEqual(value, -1);
			});
		});

		test(PromiseCtor.name + ', static-race, 3', function () {
			return PromiseCtor.race([
				PromiseCtor.resolve(1),
				PromiseCtor.reject(2),
			]).then((value: number) => {
				assert.deepEqual(value, 1);
			});
		});

		test(PromiseCtor.name + ', throw in ctor', function () {
			return new PromiseCtor(() => {
				throw new Error('sooo bad');
			}).catch((err: Error) => {
				assert.equal(err.message, 'sooo bad');
			});
		});

	});
});
