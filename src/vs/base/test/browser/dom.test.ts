/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as dom from 'vs/base/browser/dom';
const $ = dom.$;

suite('dom', () => {
	test('hasClass', () => {

		let element = document.createElement('div');
		element.className = 'foobar boo far';

		assert(element.classList.contains('foobar'));
		assert(element.classList.contains('boo'));
		assert(element.classList.contains('far'));
		assert(!element.classList.contains('bar'));
		assert(!element.classList.contains('foo'));
		assert(!element.classList.contains(''));
	});

	test('removeClass', () => {

		let element = document.createElement('div');
		element.className = 'foobar boo far';

		element.classList.remove('boo');
		assert(element.classList.contains('far'));
		assert(!element.classList.contains('boo'));
		assert(element.classList.contains('foobar'));
		assert.equal(element.className, 'foobar far');

		element = document.createElement('div');
		element.className = 'foobar boo far';

		element.classList.remove('far');
		assert(!element.classList.contains('far'));
		assert(element.classList.contains('boo'));
		assert(element.classList.contains('foobar'));
		assert.equal(element.className, 'foobar boo');

		element.classList.remove('boo');
		assert(!element.classList.contains('far'));
		assert(!element.classList.contains('boo'));
		assert(element.classList.contains('foobar'));
		assert.equal(element.className, 'foobar');

		element.classList.remove('foobar');
		assert(!element.classList.contains('far'));
		assert(!element.classList.contains('boo'));
		assert(!element.classList.contains('foobar'));
		assert.equal(element.className, '');
	});

	test('removeClass should consider hyphens', function () {
		let element = document.createElement('div');

		element.classList.add('foo-bar');
		element.classList.add('bar');

		assert(element.classList.contains('foo-bar'));
		assert(element.classList.contains('bar'));

		element.classList.remove('bar');
		assert(element.classList.contains('foo-bar'));
		assert(!element.classList.contains('bar'));

		element.classList.remove('foo-bar');
		assert(!element.classList.contains('foo-bar'));
		assert(!element.classList.contains('bar'));
	});

	test('multibyteAwareBtoa', () => {
		assert.equal(dom.multibyteAwareBtoa('hello world'), dom.multibyteAwareBtoa('hello world'));
		assert.ok(dom.multibyteAwareBtoa('平仮名'));
	});

	suite('$', () => {
		test('should build simple nodes', () => {
			const div = $('div');
			assert(div);
			assert(div instanceof HTMLElement);
			assert.equal(div.tagName, 'DIV');
			assert(!div.firstChild);
		});

		test('should buld nodes with id', () => {
			const div = $('div#foo');
			assert(div);
			assert(div instanceof HTMLElement);
			assert.equal(div.tagName, 'DIV');
			assert.equal(div.id, 'foo');
		});

		test('should buld nodes with class-name', () => {
			const div = $('div.foo');
			assert(div);
			assert(div instanceof HTMLElement);
			assert.equal(div.tagName, 'DIV');
			assert.equal(div.className, 'foo');
		});

		test('should build nodes with attributes', () => {
			let div = $('div', { class: 'test' });
			assert.equal(div.className, 'test');

			div = $('div', undefined);
			assert.equal(div.className, '');
		});

		test('should build nodes with children', () => {
			let div = $('div', undefined, $('span', { id: 'demospan' }));
			let firstChild = div.firstChild as HTMLElement;
			assert.equal(firstChild.tagName, 'SPAN');
			assert.equal(firstChild.id, 'demospan');

			div = $('div', undefined, 'hello');

			assert.equal(div.firstChild && div.firstChild.textContent, 'hello');
		});

		test('should build nodes with text children', () => {
			let div = $('div', undefined, 'foobar');
			let firstChild = div.firstChild as HTMLElement;
			assert.equal(firstChild.tagName, undefined);
			assert.equal(firstChild.textContent, 'foobar');
		});
	});
});
