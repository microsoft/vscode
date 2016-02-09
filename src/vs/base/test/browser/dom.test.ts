/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import dom = require('vs/base/browser/dom');

suite('dom', () => {
	test('hasClass', () => {

		var element = document.createElement('div');
		element.className = 'foobar boo far';

		assert(dom.hasClass(element, 'foobar'));
		assert(dom.hasClass(element, 'boo'));
		assert(dom.hasClass(element, 'far'));
		assert(!dom.hasClass(element, 'bar'));
		assert(!dom.hasClass(element, 'foo'));
		assert(!dom.hasClass(element, ''));
	});

	test('removeClass', () => {

		var element = document.createElement('div');
		element.className = 'foobar boo far';

		dom.removeClass(element, 'boo');
		assert(dom.hasClass(element, 'far'));
		assert(!dom.hasClass(element, 'boo'));
		assert(dom.hasClass(element, 'foobar'));
		assert.equal(element.className, 'foobar far');

		element = document.createElement('div');
		element.className = 'foobar boo far';

		dom.removeClass(element, 'far');
		assert(!dom.hasClass(element, 'far'));
		assert(dom.hasClass(element, 'boo'));
		assert(dom.hasClass(element, 'foobar'));
		assert.equal(element.className, 'foobar boo');

		dom.removeClass(element, 'boo');
		assert(!dom.hasClass(element, 'far'));
		assert(!dom.hasClass(element, 'boo'));
		assert(dom.hasClass(element, 'foobar'));
		assert.equal(element.className, 'foobar');

		dom.removeClass(element, 'foobar');
		assert(!dom.hasClass(element, 'far'));
		assert(!dom.hasClass(element, 'boo'));
		assert(!dom.hasClass(element, 'foobar'));
		assert.equal(element.className, '');
	});

	test('removeClass should consider hyphens', function () {
		var element = document.createElement('div');

		dom.addClass(element, 'foo-bar bar');
		assert(dom.hasClass(element, 'foo-bar'));
		assert(dom.hasClass(element, 'bar'));

		dom.removeClass(element, 'bar');
		assert(dom.hasClass(element, 'foo-bar'));
		assert(!dom.hasClass(element, 'bar'));

		dom.removeClass(element, 'foo-bar');
		assert(!dom.hasClass(element, 'foo-bar'));
		assert(!dom.hasClass(element, 'bar'));
	});

	//test('[perf] hasClass * 100000', () => {
	//
	//	for (var i = 0; i < 100000; i++) {
	//		var element = document.createElement('div');
	//		element.className = 'foobar boo far';
	//
	//		assert(dom.hasClass(element, 'far'));
	//		assert(dom.hasClass(element, 'boo'));
	//		assert(dom.hasClass(element, 'foobar'));
	//	}
	//});

	test('safeStringify', function() {
		var obj1 = {
			friend: null
		};

		var obj2 = {
			friend: null
		};

		obj1.friend = obj2;
		obj2.friend = obj1;

		var arr:any = [1];
		arr.push(arr);

		var circular = {
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

		var result = dom.safeStringifyDOMAware(circular);

		assert.deepEqual(JSON.parse(result), {
			a: 42,
			b: '[Circular]',
			c: [
				{friend: {
					friend: '[Circular]'
				}},
				'[Circular]'
			],
			d: [1, '[Circular]', '[Circular]']
		});
	});

	test('safeStringify2', function() {
		var obj:any = {
			a: null,
			b: document.createElement('div'),
			c: null,
			d: 'string',
			e: 'string',
			f: 42,
			g: 42
		};

		var result = dom.safeStringifyDOMAware(obj);

		assert.deepEqual(JSON.parse(result), {
			a: null,
			b: '[Element]',
			c: null,
			d: 'string',
			e: 'string',
			f: 42,
			g: 42
		});
	});

});