/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { appendEscapedMarkdownCodeBlockFence, appendEscapedMarkdownInlineCode, escapeMarkdownLinkLabel, escapeMarkdownSyntaxTokens } from '../../common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('htmlContent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('appendEscapedMarkdownCodeBlockFence', () => {
		test('uses a three backtick fence by default', () => {
			assert.strictEqual(appendEscapedMarkdownCodeBlockFence('a\nb', 'ts'), '```ts\na\nb\n```');
		});

		test('uses a longer fence than any fence in the code', () => {
			assert.strictEqual(appendEscapedMarkdownCodeBlockFence('```\nx\n````', 'md'), '`````md\n```\nx\n````\n`````');
		});

		test('accounts for fences indented by up to three spaces', () => {
			assert.strictEqual(appendEscapedMarkdownCodeBlockFence('a\n  ```\nb', ''), '````\na\n  ```\nb\n````');
			assert.strictEqual(appendEscapedMarkdownCodeBlockFence('   ````', ''), '`````\n   ````\n`````');
			// four spaces is an indented code line, not a fence
			assert.strictEqual(appendEscapedMarkdownCodeBlockFence('    ```', ''), '```\n    ```\n```');
		});
	});

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

	suite('escapeMarkdownLinkLabel', () => {
		test('passes plain text through unchanged', () => {
			assert.strictEqual(escapeMarkdownLinkLabel('hello'), 'hello');
			assert.strictEqual(escapeMarkdownLinkLabel(''), '');
			assert.strictEqual(escapeMarkdownLinkLabel('heap-snapshot-analysis'), 'heap-snapshot-analysis');
			assert.strictEqual(escapeMarkdownLinkLabel('foo.bar_baz'), 'foo.bar_baz');
		});

		test('escapes only `\\` and `]`', () => {
			assert.strictEqual(escapeMarkdownLinkLabel('a]b'), 'a\\]b');
			assert.strictEqual(escapeMarkdownLinkLabel('a\\b'), 'a\\\\b');
			assert.strictEqual(escapeMarkdownLinkLabel(']]'), '\\]\\]');
		});

		test('does not escape characters that are safe in link text', () => {
			// these would be escaped by escapeMarkdownSyntaxTokens but must
			// pass through here since they render literally inside `[...]`.
			assert.strictEqual(escapeMarkdownLinkLabel('a*b_c#d-e.f!g~h+i(j)k{l}m'), 'a*b_c#d-e.f!g~h+i(j)k{l}m');
		});
	});

	suite('escapeMarkdownSyntaxTokens', () => {
		test('escapes inline syntax tokens anywhere', () => {
			assert.strictEqual(escapeMarkdownSyntaxTokens('a*b_c`d[e]f(g)h#i+j!k~l{m}'), 'a\\*b\\_c\\`d\\[e\\]f\\(g\\)h\\#i\\+j\\!k\\~l\\{m\\}');
		});

		test('does not escape mid-line dashes', () => {
			assert.strictEqual(escapeMarkdownSyntaxTokens('heap-snapshot-analysis'), 'heap-snapshot-analysis');
			assert.strictEqual(escapeMarkdownSyntaxTokens('npm run foo-bar'), 'npm run foo-bar');
		});

		test('escapes dashes that start a line', () => {
			assert.strictEqual(escapeMarkdownSyntaxTokens('- item'), '\\- item');
			assert.strictEqual(escapeMarkdownSyntaxTokens('  - indented'), '  \\- indented');
			assert.strictEqual(escapeMarkdownSyntaxTokens('---'), '\\---');
			assert.strictEqual(escapeMarkdownSyntaxTokens('line one\n- item'), 'line one\n\\- item');
		});
	});
});
