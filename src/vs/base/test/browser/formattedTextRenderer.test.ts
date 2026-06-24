/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { renderFormattedText, renderText } from '../../browser/formattedTextRenderer.js';
import { DisposableStore } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { $ } from '../../browser/dom.js';

suite('FormattedTextRenderer', () => {
	const store = new DisposableStore();

	setup(() => {
		store.clear();
	});

	teardown(() => {
		store.clear();
	});

	test('render simple element', () => {
		const result: HTMLElement = renderText('testing');

		assert.strictEqual(result.nodeType, document.ELEMENT_NODE);
		assert.strictEqual(result.textContent, 'testing');
		assert.strictEqual(result.tagName, 'DIV');
	});

	test('render element with target', () => {
		const target = $('div.testClass');
		const result = renderText('testing', {}, target);
		assert.strictEqual(result.nodeType, document.ELEMENT_NODE);
		assert.strictEqual(result, target);
		assert.strictEqual(result.className, 'testClass');
	});

	test('simple formatting', () => {
		let result: HTMLElement = renderFormattedText('**bold**');
		assert.strictEqual(result.children.length, 1);
		assert.strictEqual(result.firstChild!.textContent, 'bold');
		assert.strictEqual((<HTMLElement>result.firstChild).tagName, 'B');
		assert.strictEqual(result.innerHTML, '<b>bold</b>');

		result = renderFormattedText('__italics__');
		assert.strictEqual(result.innerHTML, '<i>italics</i>');

		result = renderFormattedText('``code``');
		assert.strictEqual(result.innerHTML, '``code``');

		result = renderFormattedText('``code``', { renderCodeSegments: true });
		assert.strictEqual(result.innerHTML, '<code>code</code>');

		result = renderFormattedText('this string has **bold**, __italics__, and ``code``!!', { renderCodeSegments: true });
		assert.strictEqual(result.innerHTML, 'this string has <b>bold</b>, <i>italics</i>, and <code>code</code>!!');
	});

	test('no formatting', () => {
		const result: HTMLElement = renderFormattedText('this is just a string');
		assert.strictEqual(result.innerHTML, 'this is just a string');
	});

	test('preserve newlines', () => {
		const result: HTMLElement = renderFormattedText('line one\nline two');
		assert.strictEqual(result.innerHTML, 'line one<br>line two');
	});

	test('action', () => {
		let callbackCalled = false;
		const result: HTMLElement = renderFormattedText('[[action]]', {
			actionHandler: {
				callback(content) {
					assert.strictEqual(content, '0');
					callbackCalled = true;
				},
				disposables: store
			}
		});
		assert.strictEqual(result.innerHTML, '<a>action</a>');

		const event: MouseEvent = document.createEvent('MouseEvent');
		event.initEvent('click', true, true);
		result.firstChild!.dispatchEvent(event);
		assert.strictEqual(callbackCalled, true);
	});

	test('fancy action', () => {
		let callbackCalled = false;
		const result: HTMLElement = renderFormattedText('__**[[action]]**__', {
			actionHandler: {
				callback(content) {
					assert.strictEqual(content, '0');
					callbackCalled = true;
				},
				disposables: store
			}
		});
		assert.strictEqual(result.innerHTML, '<i><b><a>action</a></b></i>');

		const event: MouseEvent = document.createEvent('MouseEvent');
		event.initEvent('click', true, true);
		result.firstChild!.firstChild!.firstChild!.dispatchEvent(event);
		assert.strictEqual(callbackCalled, true);
	});

	test('fancier action', () => {
		let callbackCalled = false;
		const result: HTMLElement = renderFormattedText('``__**[[action]]**__``', {
			renderCodeSegments: true,
			actionHandler: {
				callback(content) {
					assert.strictEqual(content, '0');
					callbackCalled = true;
				},
				disposables: store
			}
		});
		assert.strictEqual(result.innerHTML, '<code><i><b><a>action</a></b></i></code>');

		const event: MouseEvent = document.createEvent('MouseEvent');
		event.initEvent('click', true, true);
		result.firstChild!.firstChild!.firstChild!.firstChild!.dispatchEvent(event);
		assert.strictEqual(callbackCalled, true);
	});

	test('escaped formatting', () => {
		const result: HTMLElement = renderFormattedText('\\*\\*bold\\*\\*');
		assert.strictEqual(result.children.length, 0);
		assert.strictEqual(result.innerHTML, '**bold**');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
