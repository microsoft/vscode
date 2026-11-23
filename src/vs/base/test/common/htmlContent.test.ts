/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { appendEscapedMarkdownInlineCode, escapeMarkdownLinkLabel, escapeMarkdownSyntaxTokens, escapeUntrustedMarkdown } from '../../common/htmlContent.js';
import { marked } from '../../common/marked/marked.js';
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

	suite('escapeUntrustedMarkdown', () => {
		function render(markdown: string): { links: string[]; hasImage: boolean; hasThemeIcon: boolean; hasBlock: boolean } {
			const html = marked.parse(markdown, { async: false });
			return {
				links: [...html.matchAll(/<a href="([^"]*)"/g)].map(match => match[1]),
				hasImage: html.includes('<img'),
				hasThemeIcon: /(?<!\\)\$\(/.test(html),
				hasBlock: /<(h\d|ul|ol|blockquote|table|pre|hr)[ >]/.test(html)
			};
		}

		test('escaped text renders as text only', () => {
			const texts = [
				'Example',
				'Example [Link](command:workbench.action.files.newUntitledFile)',
				'Example <command:workbench.action.files.newUntitledFile?%5B%5D>',
				'Example <https://example.com/x>',
				'Example https://example.com/x',
				'Example www.example.com',
				'Example someone@example.com',
				'Example ![image](https://example.com/x.png)',
				'Example **bold** `code` <b>html</b> $(rocket)',
				'> quote',
				'# heading',
				'- item',
				'1. item',
				'---',
				'Example\n- item\n\n# heading'
			];

			const rendered: Record<string, ReturnType<typeof render>> = {};
			for (const text of texts) {
				rendered[text] = render(escapeUntrustedMarkdown(text));
			}

			const plain = { links: [], hasImage: false, hasThemeIcon: false, hasBlock: false };
			assert.deepStrictEqual(rendered, Object.fromEntries(texts.map(text => [text, plain])));
		});

		test('collapses whitespace and keeps ordinary text readable', () => {
			assert.strictEqual(escapeUntrustedMarkdown('Hello  World\nAgain'), 'Hello World Again');
		});
	});
});
