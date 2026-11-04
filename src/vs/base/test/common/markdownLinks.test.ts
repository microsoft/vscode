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

	test('keeps tokens the rewriter declines', () => {
		const markdown = 'See [a](./x.txt) and ![b](./y.png).';
		assert.strictEqual(rewriteMarkdownLinks(markdown, { rewriteLink: () => undefined }), markdown);
	});

	test('returns the source unchanged when it cannot be parsed as markdown', () => {
		assert.strictEqual(rewriteMarkdownLinks('', rewriteToMarker), '');
	});
});
