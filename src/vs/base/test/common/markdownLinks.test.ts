/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { rewriteMarkdownLinks } from '../../common/markdownLinks.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('rewriteMarkdownLinks', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const rewriteToMarker = { rewriteLink: () => 'REWRITTEN' };

	test('edits the token that produced the source, not the first lookalike', () => {
		// Searching for a token's source text would match the sample inside the code span,
		// corrupting it and leaving the real link in place.
		assert.deepStrictEqual(
			[
				rewriteMarkdownLinks('Use `[a](./x.txt)` then a real [a](./x.txt) link.', rewriteToMarker),
				rewriteMarkdownLinks('```\n[a](./x.txt)\n```\n\n[a](./x.txt)', rewriteToMarker),
			],
			[
				'Use `[a](./x.txt)` then a real REWRITTEN link.',
				'```\n[a](./x.txt)\n```\n\nREWRITTEN',
			]);
	});

	test('locates tokens in markdown with CRLF line endings', () => {
		// The lexer normalizes line endings before tokenizing, so a block's source no longer matches
		// it verbatim. Searching for it as-is skipped the fence and rewrote the sample inside it.
		const markdown = '```\r\n[a](./x.txt)\r\n```\r\n\r[a](./x.txt)\r\n\r\n[b]: ./y.txt\r\n';
		let definitions: string[] = [];
		const rewritten = rewriteMarkdownLinks(markdown, {
			...rewriteToMarker,
			additionalEdits: (_markdown, context) => {
				definitions = context.definitionRanges.map(range => markdown.substring(range.start, range.end));
				return [];
			},
		});
		assert.deepStrictEqual(
			{ rewritten, definitions },
			{
				rewritten: '```\r\n[a](./x.txt)\r\n```\r\n\rREWRITTEN\r\n\r\n[b]: ./y.txt\r\n',
				definitions: ['[b]: ./y.txt\r\n'],
			});
	});

	test('gives up quickly on a CRLF block it cannot locate', () => {
		// The lexer expands the tab, so the lookup fails only after matching every line break. Each
		// `\r\n` must have a single way to match, or this backtracks exponentially and hangs.
		const markdown = '```\r\n' + '\r\n'.repeat(60) + '\tcode\r\n```\r\n\r\n[a](./x.txt)';
		assert.strictEqual(rewriteMarkdownLinks(markdown, rewriteToMarker), markdown.replace('[a](./x.txt)', 'REWRITTEN'));
	});

	test('locates large blocks with LF and CRLF line endings', () => {
		for (const eol of ['\n', '\r\n']) {
			const markdown = '```' + eol + ('console.log("fixture");' + eol).repeat(8192) + '```' + eol + eol + '[open](file:///fixture.ts)';
			assert.strictEqual(rewriteMarkdownLinks(markdown, rewriteToMarker), markdown.replace('[open](file:///fixture.ts)', 'REWRITTEN'));
		}
	});

	test('gives up quickly on a long run of blank lines it cannot locate', () => {
		// The lexer drops the tab, so this whitespace token's source cannot be found. Rescanning the
		// blank lines from every offset made this quadratic: seconds for 32,768 lines.
		for (const eol of ['\n', '\r\n']) {
			const markdown = 'a' + eol + eol.repeat(32768) + '\t' + eol + eol + '[x](./y)';
			assert.strictEqual(rewriteMarkdownLinks(markdown, rewriteToMarker), markdown.replace('[x](./y)', 'REWRITTEN'));
		}
	});

	test('keeps tokens the rewriter declines', () => {
		const markdown = 'See [a](./x.txt) and ![b](./y.png).';
		assert.strictEqual(rewriteMarkdownLinks(markdown, { rewriteLink: () => undefined }), markdown);
	});

	test('returns the source unchanged when it cannot be parsed as markdown', () => {
		assert.strictEqual(rewriteMarkdownLinks('', rewriteToMarker), '');
	});
});
