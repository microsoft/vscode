/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { $, asCssValueWithDefault, h, multibyteAwareBtoa, trackAttributes, copyAttributes, disposableWindowInterval, getWindows, getWindowsCount, getWindowId, getWindowById, hasWindow, getWindow, getDocument, isHTMLElement } from 'vs/base/browser/dom';
import { ensureCodeWindow, isAuxiliaryWindow, mainWindow } from 'vs/base/browser/window';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('dom', () => {
	test('hasClass', () => {

		const element = document.createElement('div');
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
		assert.strictEqual(element.className, 'foobar far');

		element = document.createElement('div');
		element.className = 'foobar boo far';

		element.classList.remove('far');
		assert(!element.classList.contains('far'));
		assert(element.classList.contains('boo'));
		assert(element.classList.contains('foobar'));
		assert.strictEqual(element.className, 'foobar boo');

		element.classList.remove('boo');
		assert(!element.classList.contains('far'));
		assert(!element.classList.contains('boo'));
		assert(element.classList.contains('foobar'));
		assert.strictEqual(element.className, 'foobar');

		element.classList.remove('foobar');
		assert(!element.classList.contains('far'));
		assert(!element.classList.contains('boo'));
		assert(!element.classList.contains('foobar'));
		assert.strictEqual(element.className, '');
	});

	test('removeClass should consider hyphens', function () {
		const element = document.createElement('div');

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
		assert.ok(multibyteAwareBtoa('hello world').length > 0);
		assert.ok(multibyteAwareBtoa('平仮名').length > 0);
		assert.ok(multibyteAwareBtoa(new Array(100000).fill('vs').join('')).length > 0); // https://github.com/microsoft/vscode/issues/112013
	});

	suite('$', () => {
		test('should build simple nodes', () => {
			const div = $('div');
			assert(div);
			assert(isHTMLElement(div));
			assert.strictEqual(div.tagName, 'DIV');
			assert(!div.firstChild);
		});

		test('should build nodes with id', () => {
			const div = $('div#foo');
			assert(div);
			assert(isHTMLElement(div));
			assert.strictEqual(div.tagName, 'DIV');
			assert.strictEqual(div.id, 'foo');
		});

		test('should build nodes with class-name', () => {
			const div = $('div.foo');
			assert(div);
			assert(isHTMLElement(div));
			assert.strictEqual(div.tagName, 'DIV');
			assert.strictEqual(div.className, 'foo');
		});

		test('should build nodes with attributes', () => {
			let div = $('div', { class: 'test' });
			assert.strictEqual(div.className, 'test');

			div = $('div', undefined);
			assert.strictEqual(div.className, '');
		});

		test('should build nodes with children', () => {
			let div = $('div', undefined, $('span', { id: 'demospan' }));
			const firstChild = div.firstChild as HTMLElement;
			assert.strictEqual(firstChild.tagName, 'SPAN');
			assert.strictEqual(firstChild.id, 'demospan');

			div = $('div', undefined, 'hello');

			assert.strictEqual(div.firstChild && div.firstChild.textContent, 'hello');
		});

		test('should build nodes with text children', () => {
			const div = $('div', undefined, 'foobar');
			const firstChild = div.firstChild as HTMLElement;
			assert.strictEqual(firstChild.tagName, undefined);
			assert.strictEqual(firstChild.textContent, 'foobar');
		});
	});

	suite('h', () => {
		test('should build simple nodes', () => {
			const div = h('div');
			assert(isHTMLElement(div.root));
			assert.strictEqual(div.root.tagName, 'DIV');

			const span = h('span');
			assert(isHTMLElement(span.root));
			assert.strictEqual(span.root.tagName, 'SPAN');

			const img = h('img');
			assert(isHTMLElement(img.root));
			assert.strictEqual(img.root.tagName, 'IMG');
		});

		test('should handle ids and classes', () => {
			const divId = h('div#myid');
			assert.strictEqual(divId.root.tagName, 'DIV');
			assert.strictEqual(divId.root.id, 'myid');

			const divClass = h('div.a');
			assert.strictEqual(divClass.root.tagName, 'DIV');
			assert.strictEqual(divClass.root.classList.length, 1);
			assert(divClass.root.classList.contains('a'));

			const divClasses = h('div.a.b.c');
			assert.strictEqual(divClasses.root.tagName, 'DIV');
			assert.strictEqual(divClasses.root.classList.length, 3);
			assert(divClasses.root.classList.contains('a'));
			assert(divClasses.root.classList.contains('b'));
			assert(divClasses.root.classList.contains('c'));

			const divAll = h('div#myid.a.b.c');
			assert.strictEqual(divAll.root.tagName, 'DIV');
			assert.strictEqual(divAll.root.id, 'myid');
			assert.strictEqual(divAll.root.classList.length, 3);
			assert(divAll.root.classList.contains('a'));
			assert(divAll.root.classList.contains('b'));
			assert(divAll.root.classList.contains('c'));

			const spanId = h('span#myid');
			assert.strictEqual(spanId.root.tagName, 'SPAN');
			assert.strictEqual(spanId.root.id, 'myid');

			const spanClass = h('span.a');
			assert.strictEqual(spanClass.root.tagName, 'SPAN');
			assert.strictEqual(spanClass.root.classList.length, 1);
			assert(spanClass.root.classList.contains('a'));

			const spanClasses = h('span.a.b.c');
			assert.strictEqual(spanClasses.root.tagName, 'SPAN');
			assert.strictEqual(spanClasses.root.classList.length, 3);
			assert(spanClasses.root.classList.contains('a'));
			assert(spanClasses.root.classList.contains('b'));
			assert(spanClasses.root.classList.contains('c'));

			const spanAll = h('span#myid.a.b.c');
			assert.strictEqual(spanAll.root.tagName, 'SPAN');
			assert.strictEqual(spanAll.root.id, 'myid');
			assert.strictEqual(spanAll.root.classList.length, 3);
			assert(spanAll.root.classList.contains('a'));
			assert(spanAll.root.classList.contains('b'));
			assert(spanAll.root.classList.contains('c'));
		});

		test('should implicitly handle ids and classes', () => {
			const divId = h('#myid');
			assert.strictEqual(divId.root.tagName, 'DIV');
			assert.strictEqual(divId.root.id, 'myid');

			const divClass = h('.a');
			assert.strictEqual(divClass.root.tagName, 'DIV');
			assert.strictEqual(divClass.root.classList.length, 1);
			assert(divClass.root.classList.contains('a'));

			const divClasses = h('.a.b.c');
			assert.strictEqual(divClasses.root.tagName, 'DIV');
			assert.strictEqual(divClasses.root.classList.length, 3);
			assert(divClasses.root.classList.contains('a'));
			assert(divClasses.root.classList.contains('b'));
			assert(divClasses.root.classList.contains('c'));

			const divAll = h('#myid.a.b.c');
			assert.strictEqual(divAll.root.tagName, 'DIV');
			assert.strictEqual(divAll.root.id, 'myid');
			assert.strictEqual(divAll.root.classList.length, 3);
			assert(divAll.root.classList.contains('a'));
			assert(divAll.root.classList.contains('b'));
			assert(divAll.root.classList.contains('c'));
		});

		test('should handle @ identifiers', () => {
			const implicit = h('@el');
			assert.strictEqual(implicit.root, implicit.el);
			assert.strictEqual(implicit.el.tagName, 'DIV');

			const explicit = h('div@el');
			assert.strictEqual(explicit.root, explicit.el);
			assert.strictEqual(explicit.el.tagName, 'DIV');

			const implicitId = h('#myid@el');
			assert.strictEqual(implicitId.root, implicitId.el);
			assert.strictEqual(implicitId.el.tagName, 'DIV');
			assert.strictEqual(implicitId.root.id, 'myid');

			const explicitId = h('div#myid@el');
			assert.strictEqual(explicitId.root, explicitId.el);
			assert.strictEqual(explicitId.el.tagName, 'DIV');
			assert.strictEqual(explicitId.root.id, 'myid');

			const implicitClass = h('.a@el');
			assert.strictEqual(implicitClass.root, implicitClass.el);
			assert.strictEqual(implicitClass.el.tagName, 'DIV');
			assert.strictEqual(implicitClass.root.classList.length, 1);
			assert(implicitClass.root.classList.contains('a'));

			const explicitClass = h('div.a@el');
			assert.strictEqual(explicitClass.root, explicitClass.el);
			assert.strictEqual(explicitClass.el.tagName, 'DIV');
			assert.strictEqual(explicitClass.root.classList.length, 1);
			assert(explicitClass.root.classList.contains('a'));
		});
	});

	test('should recurse', () => {
		const result = h('div.code-view', [
			h('div.title@title'),
			h('div.container', [
				h('div.gutter@gutterDiv'),
				h('span@editor'),
			]),
		]);

		assert.strictEqual(result.root.tagName, 'DIV');
		assert.strictEqual(result.root.className, 'code-view');
		assert.strictEqual(result.root.childElementCount, 2);
		assert.strictEqual(result.root.firstElementChild, result.title);
		assert.strictEqual(result.title.tagName, 'DIV');
		assert.strictEqual(result.title.className, 'title');
		assert.strictEqual(result.title.childElementCount, 0);
		assert.strictEqual(result.gutterDiv.tagName, 'DIV');
		assert.strictEqual(result.gutterDiv.className, 'gutter');
		assert.strictEqual(result.gutterDiv.childElementCount, 0);
		assert.strictEqual(result.editor.tagName, 'SPAN');
		assert.strictEqual(result.editor.className, '');
		assert.strictEqual(result.editor.childElementCount, 0);
	});

	test('cssValueWithDefault', () => {
		assert.strictEqual(asCssValueWithDefault('red', 'blue'), 'red');
		assert.strictEqual(asCssValueWithDefault(undefined, 'blue'), 'blue');
		assert.strictEqual(asCssValueWithDefault('var(--my-var)', 'blue'), 'var(--my-var, blue)');
		assert.strictEqual(asCssValueWithDefault('var(--my-var, red)', 'blue'), 'var(--my-var, red)');
		assert.strictEqual(asCssValueWithDefault('var(--my-var, var(--my-var2))', 'blue'), 'var(--my-var, var(--my-var2, blue))');
	});

	test('copyAttributes', () => {
		const elementSource = document.createElement('div');
		elementSource.setAttribute('foo', 'bar');
		elementSource.setAttribute('bar', 'foo');

		const elementTarget = document.createElement('div');
		copyAttributes(elementSource, elementTarget);

		assert.strictEqual(elementTarget.getAttribute('foo'), 'bar');
		assert.strictEqual(elementTarget.getAttribute('bar'), 'foo');
	});

	test('trackAttributes (unfiltered)', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const elementSource = document.createElement('div');
			const elementTarget = document.createElement('div');

			const disposable = trackAttributes(elementSource, elementTarget);

			elementSource.setAttribute('foo', 'bar');
			elementSource.setAttribute('bar', 'foo');

			await timeout(1);

			assert.strictEqual(elementTarget.getAttribute('foo'), 'bar');
			assert.strictEqual(elementTarget.getAttribute('bar'), 'foo');

			disposable.dispose();
		});
	});

	test('trackAttributes (filtered)', async () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const elementSource = document.createElement('div');
			const elementTarget = document.createElement('div');

			const disposable = trackAttributes(elementSource, elementTarget, ['foo']);

			elementSource.setAttribute('foo', 'bar');
			elementSource.setAttribute('bar', 'foo');

			await timeout(1);

			assert.strictEqual(elementTarget.getAttribute('foo'), 'bar');
			assert.strictEqual(elementTarget.getAttribute('bar'), null);

			disposable.dispose();
		});
	});

	test('window utilities', () => {
		const windows = Array.from(getWindows());
		assert.strictEqual(windows.length, 1);
		assert.strictEqual(getWindowsCount(), 1);
		const windowId = getWindowId(mainWindow);
		assert.ok(typeof windowId === 'number');
		assert.strictEqual(getWindowById(windowId)?.window, mainWindow);
		assert.strictEqual(getWindowById(undefined, true).window, mainWindow);
		assert.strictEqual(hasWindow(windowId), true);
		assert.strictEqual(isAuxiliaryWindow(mainWindow), false);
		ensureCodeWindow(mainWindow, 1);
		assert.ok(typeof mainWindow.vscodeWindowId === 'number');

		const div = document.createElement('div');
		assert.strictEqual(getWindow(div), mainWindow);
		assert.strictEqual(getDocument(div), mainWindow.document);

		const event = document.createEvent('MouseEvent');
		assert.strictEqual(getWindow(event), mainWindow);
		assert.strictEqual(getDocument(event), mainWindow.document);
	});

	suite('disposableWindowInterval', () => {
		test('basics', async () => {
			let count = 0;
			const promise = new DeferredPromise<void>();
			const interval = disposableWindowInterval(mainWindow, () => {
				count++;
				if (count === 3) {
					promise.complete(undefined);
					return true;
				} else {
					return false;
				}
			}, 0, 10);

			await promise.p;
			assert.strictEqual(count, 3);
			interval.dispose();
		});

		test('iterations', async () => {
			let count = 0;
			const interval = disposableWindowInterval(mainWindow, () => {
				count++;

				return false;
			}, 0, 0);

			await timeout(5);
			assert.strictEqual(count, 0);
			interval.dispose();
		});

		test('dispose', async () => {
			let count = 0;
			const interval = disposableWindowInterval(mainWindow, () => {
				count++;

				return false;
			}, 0, 10);

			interval.dispose();
			await timeout(5);
			assert.strictEqual(count, 0);
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
