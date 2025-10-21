/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import { LinkDetector, linkify } from '../linkify';

const dom = new JSDOM();
global.document = dom.window.document;

suite('Notebook builtin output link detection', () => {

	LinkDetector.injectedHtmlCreator = (value: string) => value;

	test('no links', () => {
		const htmlWithLinks = linkify('hello', { linkifyFilePaths: true, trustHtml: true }, true);
		assert.equal(htmlWithLinks.innerHTML, 'hello');
	});

	test('web link detection', () => {
		const htmlWithLinks = linkify('something www.example.com something', { linkifyFilePaths: true, trustHtml: true }, true);
		const htmlWithLinks2 = linkify('something www.example.com something', { linkifyFilePaths: false, trustHtml: false }, true);

		assert.equal(htmlWithLinks.innerHTML, 'something <a href="www.example.com">www.example.com</a> something');
		assert.equal(htmlWithLinks.textContent, 'something www.example.com something');
		assert.equal(htmlWithLinks2.innerHTML, 'something <a href="www.example.com">www.example.com</a> something');
		assert.equal(htmlWithLinks2.textContent, 'something www.example.com something');
	});

	test('html link detection', () => {
		const htmlWithLinks = linkify('something <a href="www.example.com">link</a> something', { linkifyFilePaths: true, trustHtml: true }, true);
		const htmlWithLinks2 = linkify('something <a href="www.example.com">link</a> something', { linkifyFilePaths: false, trustHtml: true }, true);

		assert.equal(htmlWithLinks.innerHTML, 'something <span><a href="www.example.com">link</a></span> something');
		assert.equal(htmlWithLinks.textContent, 'something link something');
		assert.equal(htmlWithLinks2.innerHTML, 'something <span><a href="www.example.com">link</a></span> something');
		assert.equal(htmlWithLinks2.textContent, 'something link something');
	});

	test('html link without trust', () => {
		const htmlWithLinks = linkify('something <a href="file.py">link</a> something', { linkifyFilePaths: true, trustHtml: false }, true);

		assert.equal(htmlWithLinks.innerHTML, 'something &lt;a href="file.py"&gt;link&lt;/a&gt; something');
		assert.equal(htmlWithLinks.textContent, 'something <a href="file.py">link</a> something');
	});
});

