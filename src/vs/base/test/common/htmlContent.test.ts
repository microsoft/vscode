/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { appendEscapedMarkdownInlineCode } from '../../common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('htmlContent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('appendEscapedMarkdownInlineCode', () => {
		test('wraps plain text in single backticks', () => {
			assert.strictEqual(appendEscapedMarkdownInlineCode('hello'), '`hello`');
			assert.strictEqual(appendEscapedMarkdownInlineCode(''), '``');
			assert.strictEqual(appendEscapedMarkdownInlineCode('foo bar'), '`foo bar`');
		});

		test('chooses a fence longer than any backtick run in the content', () => {
			assert.strictEqual(appendEscapedMarkdownInlineCode('a`b'), '``a`b``');
			assert.strictEqual(appendEscapedMarkdownInlineCode('a``b'), '```a``b```');
			assert.strictEqual(appendEscapedMarkdownInlineCode('a```b```c'), '````a```b```c````');
		});

		test('pads with spaces when the content begins or ends with a backtick', () => {
			assert.strictEqual(appendEscapedMarkdownInlineCode('`'), '`` ` ``');
			assert.strictEqual(appendEscapedMarkdownInlineCode('`hello'), '`` `hello ``');
			assert.strictEqual(appendEscapedMarkdownInlineCode('hello`'), '`` hello` ``');
			assert.strictEqual(appendEscapedMarkdownInlineCode('`a`b`'), '`` `a`b` ``');
		});

		test('does not pad when backticks are only in the interior', () => {
			assert.strictEqual(appendEscapedMarkdownInlineCode('a`b'), '``a`b``');
		});

		test('handles content composed entirely of backticks', () => {
			assert.strictEqual(appendEscapedMarkdownInlineCode('``'), '``` `` ```');
		});
	});
});
