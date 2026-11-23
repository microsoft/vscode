/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { escapeHtmlTags, formatCommitMessage } from '../hover';

suite('git hover', () => {
	test('escapeHtmlTags escapes HTML tags outside of code and autolinks', () => {
		const messages = [
			'Fix the <div> wrapper',
			'Add <b>bold</b> support',
			'Generic Foo<T> type',
			'Use `Promise<void>` and [#1](https://github.com/o/r/issues/1)',
			'See <https://example.com> and <a@b.com>, a < b',
			'Body\r\n```\nArray<T>\n```\n    at Object.<anonymous> (x.js)',
			'~~~\n~~~example\nFoo<T>\n~~~\n<b>',
			'Fix \\<div> \\\\<b> \\\\\\<i>'
		];

		assert.deepStrictEqual(messages.map(escapeHtmlTags), [
			'Fix the &lt;div> wrapper',
			'Add &lt;b>bold&lt;/b> support',
			'Generic Foo&lt;T> type',
			'Use `Promise<void>` and [#1](https://github.com/o/r/issues/1)',
			'See <https://example.com> and <a@b.com>, a < b',
			'Body\n```\nArray<T>\n```\n    at Object.<anonymous> (x.js)',
			'~~~\n~~~example\nFoo<T>\n~~~\n&lt;b>',
			'Fix \\<div> \\\\&lt;b> \\\\\\<i>'
		]);
	});

	test('formatCommitMessage preserves blank lines between paragraphs', () => {
		const messages = [
			'Subject',
			'Subject\n\nFirst line\nsecond line\n\n\nLast <b> ![img](x)\n',
			'\r\nSubject\r\n  \r\nBody\r\n',
			'Subject\n\n```\na\n\nb\n```',
			'Subject\n\n    first\n\n    second\n    \nBody'
		];

		assert.deepStrictEqual(messages.map(formatCommitMessage), [
			'Subject',
			'Subject\n\n&nbsp;\n\nFirst line\n\nsecond line\n\n&nbsp;\n\n&nbsp;\n\nLast &lt;b> &#33;&#91;img](x)',
			'Subject\n\n&nbsp;\n\nBody',
			'Subject\n\n&nbsp;\n\n```\n\na\n\n\n\nb\n\n```',
			'Subject\n\n&nbsp;\n\n    first\n\n\n\n    second\n\n&nbsp;\n\nBody'
		]);
	});
});
