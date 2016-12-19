/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import objects = require('vs/base/common/objects');

let check = (one, other, msg) => {
	assert(objects.equals(one, other), msg);
	assert(objects.equals(other, one), '[reverse] ' + msg);
};

let checkNot = (one, other, msg) => {
	assert(!objects.equals(one, other), msg);
	assert(!objects.equals(other, one), '[reverse] ' + msg);
};

suite('Objects', () => {

	test('equals', function () {
		check(null, null, 'null');
		check(undefined, undefined, 'undefined');
		check(1234, 1234, 'numbers');
		check('', '', 'empty strings');
		check('1234', '1234', 'strings');
		check([], [], 'empty arrays');
		// check(['', 123], ['', 123], 'arrays');
		check([[1, 2, 3], [4, 5, 6]], [[1, 2, 3], [4, 5, 6]], 'nested arrays');
		check({}, {}, 'empty objects');
		check({ a: 1, b: '123' }, { a: 1, b: '123' }, 'objects');
		check({ a: 1, b: '123' }, { b: '123', a: 1 }, 'objects (key order)');
		check({ a: { b: 1, c: 2 }, b: 3 }, { a: { b: 1, c: 2 }, b: 3 }, 'nested objects');

		checkNot(null, undefined, 'null != undefined');
		checkNot(null, '', 'null != empty string');
		checkNot(null, [], 'null != empty array');
		checkNot(null, {}, 'null != empty object');
		checkNot(null, 0, 'null != zero');
		checkNot(undefined, '', 'undefined != empty string');
		checkNot(undefined, [], 'undefined != empty array');
		checkNot(undefined, {}, 'undefined != empty object');
		checkNot(undefined, 0, 'undefined != zero');
		checkNot('', [], 'empty string != empty array');
		checkNot('', {}, 'empty string != empty object');
		checkNot('', 0, 'empty string != zero');
		checkNot([], {}, 'empty array != empty object');
		checkNot([], 0, 'empty array != zero');
		checkNot(0, [], 'zero != empty array');

		checkNot('1234', 1234, 'string !== number');

		checkNot([[1, 2, 3], [4, 5, 6]], [[1, 2, 3], [4, 5, 6000]], 'arrays');
		checkNot({ a: { b: 1, c: 2 }, b: 3 }, { b: 3, a: { b: 9, c: 2 } }, 'objects');
	});

	test('mixin - array', function () {

		let foo: any = {};
		objects.mixin(foo, { bar: [1, 2, 3] });

		assert(foo.bar);
		assert(Array.isArray(foo.bar));
		assert.equal(foo.bar.length, 3);
		assert.equal(foo.bar[0], 1);
		assert.equal(foo.bar[1], 2);
		assert.equal(foo.bar[2], 3);
	});

	test('mixin - no overwrite', function () {
		let foo: any = {
			bar: '123'
		};

		let bar: any = {
			bar: '456'
		};

		objects.mixin(foo, bar, false);

		assert.equal(foo.bar, '123');
	});

	test('cloneAndChange', () => {
		let o1 = { something: 'hello' };
		let o = {
			o1: o1,
			o2: o1
		};
		assert.deepEqual(objects.cloneAndChange(o, () => { }), o);
	});

	test('safeStringify', function () {
		let obj1 = {
			friend: null
		};

		let obj2 = {
			friend: null
		};

		obj1.friend = obj2;
		obj2.friend = obj1;

		let arr: any = [1];
		arr.push(arr);

		let circular = {
			a: 42,
			b: null,
			c: [
				obj1, obj2
			],
			d: null
		};

		arr.push(circular);


		circular.b = circular;
		circular.d = arr;

		let result = objects.safeStringify(circular);

		assert.deepEqual(JSON.parse(result), {
			a: 42,
			b: '[Circular]',
			c: [
				{
					friend: {
						friend: '[Circular]'
					}
				},
				'[Circular]'
			],
			d: [1, '[Circular]', '[Circular]']
		});
	});

	test('derive', function () {

		let someValue = 2;

		function Base(): void {
			//example
		}
		(<any>Base).favoriteColor = 'blue';
		Base.prototype.test = function () { return 42; };

		function Child(): void {
			//example
		}
		Child.prototype.test2 = function () { return 43; };
		Object.defineProperty(Child.prototype, 'getter', {
			get: function () { return someValue; },
			enumerable: true,
			configurable: true
		});

		objects.derive(Base, Child);

		let base = new Base();
		let child = new Child();

		assert(base instanceof Base);
		assert(child instanceof Child);

		assert.strictEqual(base.test, child.test);
		assert.strictEqual(base.test(), 42);
		assert.strictEqual(child.test2(), 43);
		assert.strictEqual((<any>Child).favoriteColor, 'blue');
		someValue = 4;
		assert.strictEqual(child.getter, 4);
	});
});