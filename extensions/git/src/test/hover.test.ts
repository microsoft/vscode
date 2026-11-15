/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { escapeHtmlTags } from '../hover';

suite('git hover', () => {
	test('escapeHtmlTags escapes HTML tags outside of code and autolinks', () => {
		const messages = [
			'Fix the <div> wrapper',
			'Add <b>bold</b> support',
			'Generic Foo<T> type',
			'Use `Promise<void>` and [#1](https://github.com/o/r/issues/1)',
			'See <https://example.com> and <a@b.com>, a < b',
			'Body\r\n```\nArray<T>\n```\n    at Object.<anonymous> (x.js)'
		];

		assert.deepStrictEqual(messages.map(escapeHtmlTags), [
			'Fix the &lt;div> wrapper',
			'Add &lt;b>bold&lt;/b> support',
			'Generic Foo&lt;T> type',
			'Use `Promise<void>` and [#1](https://github.com/o/r/issues/1)',
			'See <https://example.com> and <a@b.com>, a < b',
			'Body\n```\nArray<T>\n```\n    at Object.<anonymous> (x.js)'
		]);
	});
});
