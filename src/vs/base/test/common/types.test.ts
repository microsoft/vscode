/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as types from '../../common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Types', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('isFunction', () => {
		assert(!types.isFunction(undefined));
		assert(!types.isFunction(null));
		assert(!types.isFunction('foo'));
		assert(!types.isFunction(5));
		assert(!types.isFunction(true));
		assert(!types.isFunction([]));
		assert(!types.isFunction([1, 2, '3']));
		assert(!types.isFunction({}));
		assert(!types.isFunction({ foo: 'bar' }));
		assert(!types.isFunction(/test/));
		assert(!types.isFunction(new RegExp('')));
		assert(!types.isFunction(new Date()));

		assert(types.isFunction(assert));
		assert(types.isFunction(function foo() { /**/ }));
	});

	test('areFunctions', () => {
		assert(!types.areFunctions());
		assert(!types.areFunctions(null));
		assert(!types.areFunctions('foo'));
		assert(!types.areFunctions(5));
		assert(!types.areFunctions(true));
		assert(!types.areFunctions([]));
		assert(!types.areFunctions([1, 2, '3']));
		assert(!types.areFunctions({}));
		assert(!types.areFunctions({ foo: 'bar' }));
		assert(!types.areFunctions(/test/));
		assert(!types.areFunctions(new RegExp('')));
		assert(!types.areFunctions(new Date()));
		assert(!types.areFunctions(assert, ''));

		assert(types.areFunctions(assert));
		assert(types.areFunctions(assert, assert));
		assert(types.areFunctions(function foo() { /**/ }));
	});

	test('isObject', () => {
		assert(!types.isObject(undefined));
		assert(!types.isObject(null));
		assert(!types.isObject('foo'));
		assert(!types.isObject(5));
		assert(!types.isObject(true));
		assert(!types.isObject([]));
		assert(!types.isObject([1, 2, '3']));
		assert(!types.isObject(/test/));
		assert(!types.isObject(new RegExp('')));
		assert(!types.isFunction(new Date()));
		assert.strictEqual(types.isObject(assert), false);
		assert(!types.isObject(function foo() { }));

		assert(types.isObject({}));
		assert(types.isObject({ foo: 'bar' }));
	});

	test('isEmptyObject', () => {
		assert(!types.isEmptyObject(undefined));
		assert(!types.isEmptyObject(null));
		assert(!types.isEmptyObject('foo'));
		assert(!types.isEmptyObject(5));
		assert(!types.isEmptyObject(true));
		assert(!types.isEmptyObject([]));
		assert(!types.isEmptyObject([1, 2, '3']));
		assert(!types.isEmptyObject(/test/));
		assert(!types.isEmptyObject(new RegExp('')));
		assert(!types.isEmptyObject(new Date()));
		assert.strictEqual(types.isEmptyObject(assert), false);
		assert(!types.isEmptyObject(function foo() { /**/ }));
		assert(!types.isEmptyObject({ foo: 'bar' }));

		assert(types.isEmptyObject({}));
	});

	test('isString', () => {
		assert(!types.isString(undefined));
		assert(!types.isString(null));
		assert(!types.isString(5));
		assert(!types.isString([]));
		assert(!types.isString([1, 2, '3']));
		assert(!types.isString(true));
		assert(!types.isString({}));
		assert(!types.isString(/test/));
		assert(!types.isString(new RegExp('')));
		assert(!types.isString(new Date()));
		assert(!types.isString(assert));
		assert(!types.isString(function foo() { /**/ }));
		assert(!types.isString({ foo: 'bar' }));

		assert(types.isString('foo'));
	});

	test('isNumber', () => {
		assert(!types.isNumber(undefined));
		assert(!types.isNumber(null));
		assert(!types.isNumber('foo'));
		assert(!types.isNumber([]));
		assert(!types.isNumber([1, 2, '3']));
		assert(!types.isNumber(true));
		assert(!types.isNumber({}));
		assert(!types.isNumber(/test/));
		assert(!types.isNumber(new RegExp('')));
		assert(!types.isNumber(new Date()));
		assert(!types.isNumber(assert));
		assert(!types.isNumber(function foo() { /**/ }));
		assert(!types.isNumber({ foo: 'bar' }));
		assert(!types.isNumber(parseInt('A', 10)));

		assert(types.isNumber(5));
	});

	test('isUndefined', () => {
		assert(!types.isUndefined(null));
		assert(!types.isUndefined('foo'));
		assert(!types.isUndefined([]));
		assert(!types.isUndefined([1, 2, '3']));
		assert(!types.isUndefined(true));
		assert(!types.isUndefined({}));
		assert(!types.isUndefined(/test/));
		assert(!types.isUndefined(new RegExp('')));
		assert(!types.isUndefined(new Date()));
		assert(!types.isUndefined(assert));
		assert(!types.isUndefined(function foo() { /**/ }));
		assert(!types.isUndefined({ foo: 'bar' }));

		assert(types.isUndefined(undefined));
	});

	test('isUndefinedOrNull', () => {
		assert(!types.isUndefinedOrNull('foo'));
		assert(!types.isUndefinedOrNull([]));
		assert(!types.isUndefinedOrNull([1, 2, '3']));
		assert(!types.isUndefinedOrNull(true));
		assert(!types.isUndefinedOrNull({}));
		assert(!types.isUndefinedOrNull(/test/));
		assert(!types.isUndefinedOrNull(new RegExp('')));
		assert(!types.isUndefinedOrNull(new Date()));
		assert(!types.isUndefinedOrNull(assert));
		assert(!types.isUndefinedOrNull(function foo() { /**/ }));
		assert(!types.isUndefinedOrNull({ foo: 'bar' }));

		assert(types.isUndefinedOrNull(undefined));
		assert(types.isUndefinedOrNull(null));
	});

	test('assertIsDefined / assertAreDefined', () => {
		assert.throws(() => types.assertIsDefined(undefined));
		assert.throws(() => types.assertIsDefined(null));
		assert.throws(() => types.assertAllDefined(null, undefined));
		assert.throws(() => types.assertAllDefined(true, undefined));
		assert.throws(() => types.assertAllDefined(undefined, false));

		assert.strictEqual(types.assertIsDefined(true), true);
		assert.strictEqual(types.assertIsDefined(false), false);
		assert.strictEqual(types.assertIsDefined('Hello'), 'Hello');
		assert.strictEqual(types.assertIsDefined(''), '');

		const res = types.assertAllDefined(1, true, 'Hello');
		assert.strictEqual(res[0], 1);
		assert.strictEqual(res[1], true);
		assert.strictEqual(res[2], 'Hello');
	});

	test('validateConstraints', () => {
		types.validateConstraints([1, 'test', true], [Number, String, Boolean]);
		types.validateConstraints([1, 'test', true], ['number', 'string', 'boolean']);
		types.validateConstraints([console.log], [Function]);
		types.validateConstraints([undefined], [types.isUndefined]);
		types.validateConstraints([1], [types.isNumber]);

		class Foo { }
		types.validateConstraints([new Foo()], [Foo]);

		function isFoo(f: any) { }
		assert.throws(() => types.validateConstraints([new Foo()], [isFoo]));

		function isFoo2(f: any) { return true; }
		types.validateConstraints([new Foo()], [isFoo2]);

		assert.throws(() => types.validateConstraints([1, true], [types.isNumber, types.isString]));
		assert.throws(() => types.validateConstraints(['2'], [types.isNumber]));
		assert.throws(() => types.validateConstraints([1, 'test', true], [Number, String, Number]));
	});
});
