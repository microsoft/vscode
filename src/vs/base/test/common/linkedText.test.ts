/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { parseLinkedText } from '../../common/linkedText.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('LinkedText', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses correctly', () => {
		assert.deepStrictEqual(parseLinkedText('').nodes, []);
		assert.deepStrictEqual(parseLinkedText('hello').nodes, ['hello']);
		assert.deepStrictEqual(parseLinkedText('hello there').nodes, ['hello there']);
		assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href).').nodes, [
			'Some message with ',
			{ label: 'link text', href: 'http://link.href' },
			'.'
		]);
		assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href "and a title").').nodes, [
			'Some message with ',
			{ label: 'link text', href: 'http://link.href', title: 'and a title' },
			'.'
		]);
		assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href \'and a title\').').nodes, [
			'Some message with ',
			{ label: 'link text', href: 'http://link.href', title: 'and a title' },
			'.'
		]);
		assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href "and a \'title\'").').nodes, [
			'Some message with ',
			{ label: 'link text', href: 'http://link.href', title: 'and a \'title\'' },
			'.'
		]);
		assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href \'and a "title"\').').nodes, [
			'Some message with ',
			{ label: 'link text', href: 'http://link.href', title: 'and a "title"' },
			'.'
		]);
		assert.deepStrictEqual(parseLinkedText('Some message with [link text](random stuff).').nodes, [
			'Some message with [link text](random stuff).'
		]);
		assert.deepStrictEqual(parseLinkedText('Some message with [https link](https://link.href).').nodes, [
			'Some message with ',
			{ label: 'https link', href: 'https://link.href' },
			'.'
		]);
		assert.deepStrictEqual(parseLinkedText('Some message with [https link](https:).').nodes, [
			'Some message with [https link](https:).'
		]);
		assert.deepStrictEqual(parseLinkedText('Some message with [a command](command:foobar).').nodes, [
			'Some message with ',
			{ label: 'a command', href: 'command:foobar' },
			'.'
		]);
		assert.deepStrictEqual(parseLinkedText('Some message with [a command](command:).').nodes, [
			'Some message with [a command](command:).'
		]);
		assert.deepStrictEqual(parseLinkedText('link [one](command:foo "nice") and link [two](http://foo)...').nodes, [
			'link ',
			{ label: 'one', href: 'command:foo', title: 'nice' },
			' and link ',
			{ label: 'two', href: 'http://foo' },
			'...'
		]);
		assert.deepStrictEqual(parseLinkedText('link\n[one](command:foo "nice")\nand link [two](http://foo)...').nodes, [
			'link\n',
			{ label: 'one', href: 'command:foo', title: 'nice' },
			'\nand link ',
			{ label: 'two', href: 'http://foo' },
			'...'
		]);
	});

	test('Should match non-greedily', () => {
		assert.deepStrictEqual(parseLinkedText('a [link text 1](http://link.href "title1") b [link text 2](http://link.href "title2") c').nodes, [
			'a ',
			{ label: 'link text 1', href: 'http://link.href', title: 'title1' },
			' b ',
			{ label: 'link text 2', href: 'http://link.href', title: 'title2' },
			' c',
		]);
	});
});
