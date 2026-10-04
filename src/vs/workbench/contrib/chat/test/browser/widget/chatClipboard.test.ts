/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { convertHtmlToMarkdown } from '../../../../../../base/browser/htmlToMarkdown.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { sanitizeChatClipboardFragment, toPortableMarkdown } from '../../../browser/widget/chatClipboard.js';

function toFragment(html: string): DocumentFragment {
	const template = document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

function sanitizeToHtml(html: string): string {
	const fragment = toFragment(html);
	sanitizeChatClipboardFragment(fragment);
	const holder = document.createElement('div');
	holder.appendChild(fragment);
	return holder.innerHTML;
}

suite('ChatClipboard', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports whether the selection had to change', () => {
		assert.deepStrictEqual(
			[
				sanitizeChatClipboardFragment(toFragment('<a href="https://example.com">Example</a>')),
				sanitizeChatClipboardFragment(toFragment('<a href="" data-href="file:///repo/a.ts">a.ts</a>')),
			],
			[false, true]);
	});

	test('replaces internal resource links with their visible label as code', () => {
		assert.strictEqual(
			sanitizeToHtml('<p>See <a href="" data-href="file:///repo/src/config.ts">config.ts</a> for details.</p>'),
			'<p>See <code>config.ts</code> for details.</p>');
	});

	test('replaces images addressed by local paths', () => {
		assert.deepStrictEqual(
			[
				sanitizeToHtml('<p><img src="vscode-file://vscode-app/Users/me/shot.png" alt="screenshot"></p>'),
				sanitizeToHtml('<p><img src="https://example.com/a.png" alt="remote"></p>'),
			],
			[
				'<p><code>screenshot</code></p>',
				'<p><img src="https://example.com/a.png" alt="remote"></p>',
			]);
	});

	test('keeps portable links and drops their routing metadata', () => {
		assert.strictEqual(
			sanitizeToHtml('<a href="https://example.com/page" data-href="https://example.com/page">Example</a>'),
			'<a href="https://example.com/page">Example</a>');
	});

	test('uses the rendered label of an inline anchor widget', () => {
		// The widget renders an icon plus a label, and appends the line number as a suffix
		// span. Both parts of the label are what the reader saw.
		assert.strictEqual(
			sanitizeToHtml('<a class="chat-inline-anchor-widget show-file-icons" href="" data-href="file:///repo/foo.js#42,1"><span class="icon"></span><span class="icon-label">foo.js<span class="label-suffix">:42</span></span></a>'),
			'<code>foo.js:42</code>');
	});

	test('drops internal links that render no visible text', () => {
		assert.strictEqual(
			sanitizeToHtml('<p>before <a href="" data-href="file:///repo/a.ts"></a>after</p>'),
			'<p>before after</p>');
	});

	test('sanitizes a fragment from an auxiliary window', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		disposables.add(toDisposable(() => iframe.remove()));

		const auxiliaryDocument = iframe.contentDocument!;
		const fragment = auxiliaryDocument.createDocumentFragment();
		const anchor = auxiliaryDocument.createElement('a');
		anchor.setAttribute('data-href', 'file:///repo/a.ts');
		anchor.textContent = 'a.ts';
		fragment.appendChild(anchor);
		const createElement = auxiliaryDocument.createElement;
		auxiliaryDocument.createElement = () => {
			throw new Error('Not allowed to create elements in child window JavaScript context.');
		};
		disposables.add(toDisposable(() => auxiliaryDocument.createElement = createElement));

		sanitizeChatClipboardFragment(fragment);
		const replacement = fragment.firstElementChild;

		assert.deepStrictEqual({
			html: replacement?.outerHTML,
			ownerDocument: replacement?.ownerDocument === auxiliaryDocument,
			mainRealmElement: replacement instanceof HTMLElement,
		}, {
			html: '<code>a.ts</code>',
			ownerDocument: true,
			mainRealmElement: true,
		});
	});

	test('produces markdown without internal targets when pasted back into chat', () => {
		const copied = sanitizeToHtml(
			'<p>This is <strong>inherited</strong> from the <a href="" data-href="file:///repo/src/FooBar.ts">FooBar</a> class. '
			+ 'See <a href="https://example.com/docs" data-href="https://example.com/docs">the docs</a>.</p>');

		assert.strictEqual(
			convertHtmlToMarkdown(copied),
			'This is **inherited** from the `FooBar` class. See [the docs](https://example.com/docs).');
	});

	suite('toPortableMarkdown', () => {
		test('reduces non-portable link targets to their label', () => {
			assert.deepStrictEqual(
				[
					// Agent host sessions are instructed to emit absolute filesystem targets.
					toPortableMarkdown('Updated [src/a.ts](/Users/me/repo/src/a.ts) and [b.ts](c:/repo/b.ts).'),
					toPortableMarkdown('See [config](file:///repo/config.json).'),
					toPortableMarkdown('See [index.ts](http://_vscodecontentref_/0).'),
					toPortableMarkdown('See [a.ts](code-oss://file/repo/a.ts).'),
				],
				['Updated `src/a.ts` and `b.ts`.', 'See `config`.', 'See `index.ts`.', 'See `a.ts`.']);
		});

		test('keeps links that stay meaningful wherever the markdown lands', () => {
			// Document-relative targets name no machine, so sharing them loses nothing.
			const markdown = 'See [the docs](https://example.com/docs), [mail us](mailto:team@example.com), '
				+ '[details](#details) and [guide](../CONTRIBUTING.md).';
			assert.strictEqual(toPortableMarkdown(markdown), markdown);
		});

		test('scrubs the target of a link whose source cannot be located', () => {
			// A label spanning lines inside a quote or list loses its block prefixes in the
			// token source, so the link cannot be rewritten in place.
			assert.deepStrictEqual(
				[
					toPortableMarkdown('> [foo\n> bar](/Users/alice/private/a.ts)\n'),
					toPortableMarkdown('- [foo\n  bar](/Users/alice/private/a.ts)\n'),
				],
				['> [foo\n> bar]()\n', '- [foo\n  bar]()\n']);
		});

		test('visits an image nested inside a link that is kept', () => {
			assert.strictEqual(
				toPortableMarkdown('[![diagram](/Users/me/private.png)](https://example.com)'),
				'[`diagram`](https://example.com)');
		});

		test('removes a definition whose destination sits on the next line', () => {
			assert.strictEqual(
				toPortableMarkdown('See [d][r].\n\n[r]:\n  /Users/alice/a.ts\n'),
				'See `d`.\n\n');
		});

		test('leaves content that merely follows a definition', () => {
			assert.strictEqual(
				toPortableMarkdown('See [d][r].\n\n[r]: /Users/alice/a.ts\n\n    indented code\n'),
				'See `d`.\n\n    indented code\n');
		});

		test('takes a definition whole however it wraps', () => {
			assert.deepStrictEqual(
				[
					toPortableMarkdown('See [d][r].\n\n[r]: /Users/alice/a.ts "Title"\n'),
					toPortableMarkdown('See [d][r].\n\n[r]: /Users/alice/a.ts\n  "Title"\n'),
				],
				['See `d`.\n\n', 'See `d`.\n\n']);
		});

		test('keeps a reference working by giving it its own target', () => {
			// Definitions are dropped wholesale, so a shareable reference has to carry its
			// target inline or it would decay into literal text.
			assert.deepStrictEqual(
				[
					toPortableMarkdown('A [x][1] B [y][2].\n\n[1]: /p/a.ts\n[2]: https://ok.com\n'),
					toPortableMarkdown('See [r].\n\n[r]: https://ok.com\n'),
					toPortableMarkdown('![alt][r]\n\n[r]: https://ok.com/x.png\n'),
					toPortableMarkdown('See [d][r].\n\n[r]: https://ok.com "T"\n'),
				],
				[
					'A `x` B [y](https://ok.com).\n\n',
					'See [r](https://ok.com).\n\n',
					'![alt](https://ok.com/x.png)\n\n',
					'See [d](https://ok.com "T").\n\n',
				]);
		});

		test('drops a definition nothing refers to', () => {
			assert.strictEqual(toPortableMarkdown('Nothing here.\n\n[r]: /p/a.ts\n'), 'Nothing here.\n\n');
		});

		test('leaves a definition the parser accounted for as content', () => {
			// Inside a fence it is a sample, and directly under a paragraph it is literal text.
			assert.deepStrictEqual(
				[
					toPortableMarkdown('```\n[r]: /Users/alice/a.ts\n```\n'),
					toPortableMarkdown('Text here.\n[r]: /Users/alice/a.ts\n'),
				],
				['```\n[r]: /Users/alice/a.ts\n```\n', 'Text here.\n[r]: /Users/alice/a.ts\n']);
		});

		test('scrubs an unlocatable target without touching a sample of it in code', () => {
			assert.strictEqual(
				toPortableMarkdown('Example: `[x](/Users/alice/a.ts)` and\n\n> [foo\n> bar](/Users/alice/a.ts)\n'),
				'Example: `[x](/Users/alice/a.ts)` and\n\n> [foo\n> bar]()\n');
		});

		test('rewrites the real link rather than a lookalike inside code', () => {
			// Searching for the link source would match the sample in the code span first,
			// corrupting it and leaving the actual target behind.
			assert.deepStrictEqual(
				[
					toPortableMarkdown('Use `[a.ts](/repo/a.ts)` and then [a.ts](/repo/a.ts) for real.'),
					toPortableMarkdown('```\n[a.ts](/repo/a.ts)\n```\n\nSee [a.ts](/repo/a.ts).'),
				],
				[
					'Use `[a.ts](/repo/a.ts)` and then `a.ts` for real.',
					'```\n[a.ts](/repo/a.ts)\n```\n\nSee `a.ts`.',
				]);
		});

		test('leaves link syntax inside code spans and code blocks alone', () => {
			const markdown = 'Use `[a.ts](/repo/a.ts)` here.\n\n```md\n[b.ts](/repo/b.ts)\n```';
			assert.strictEqual(toPortableMarkdown(markdown), markdown);
		});

		test('removes reference definitions that would strand the target', () => {
			assert.deepStrictEqual(
				[
					toPortableMarkdown('See [docs][ref].\n\n[ref]: /repo/a.ts\n'),
					// CommonMark allows the destination to continue on an indented line.
					toPortableMarkdown('See [docs][ref].\n\n[ref]:\n  /Users/alice/private/a.ts\n'),
				],
				['See `docs`.\n\n', 'See `docs`.\n\n']);
		});

		test('keeps a definition line that only looks like one inside a code block', () => {
			const markdown = 'See [docs][ref].\n\n```md\n[ref]: /repo/a.ts\n```\n\n[ref]: /repo/a.ts\n';
			assert.strictEqual(
				toPortableMarkdown(markdown),
				'See `docs`.\n\n```md\n[ref]: /repo/a.ts\n```\n\n');
		});

		test('leaves raw html verbatim', () => {
			// Chat markdown renders without `supportHtml`, so a tag the model wrote was never a
			// live link. Editing its attributes would only corrupt text the reader was shown —
			// the same spelling appears in prose whenever a response explains the syntax.
			assert.deepStrictEqual(
				[
					toPortableMarkdown('<a href="file:///Users/alice/private/a.ts">a.ts</a>'),
					toPortableMarkdown('<div>\nhref="/Users/alice/a.ts" is the syntax\n</div>\n'),
				],
				[
					'<a href="file:///Users/alice/private/a.ts">a.ts</a>',
					'<div>\nhref="/Users/alice/a.ts" is the syntax\n</div>\n',
				]);
		});

		test('reduces images addressed by local paths', () => {
			assert.deepStrictEqual(
				[
					toPortableMarkdown('![diagram](/Users/alice/private/diagram.png)'),
					toPortableMarkdown('[![img](/i.png)](/repo/a.ts)'),
					toPortableMarkdown('![remote](https://example.com/a.png)'),
				],
				[
					'`diagram`',
					'`img`',
					'![remote](https://example.com/a.png)',
				]);
		});

		test('uses the text a reader saw as the label', () => {
			assert.deepStrictEqual(
				[toPortableMarkdown('[**Foo**](/repo/Foo.ts)'), toPortableMarkdown('See [`a.ts`](/repo/a.ts).')],
				['`Foo`', 'See `a.ts`.']);
		});

		test('preserves surrounding formatting and repeated labels', () => {
			assert.strictEqual(
				toPortableMarkdown('- **[a.ts](/repo/a.ts)** and [a.ts](/repo/other/a.ts)'),
				'- **`a.ts`** and `a.ts`');
		});

		test('rewrites links inside lists, quotes, headings and tables', () => {
			assert.strictEqual(
				toPortableMarkdown('## [a.ts](/repo/a.ts)\n\n> see [b.ts](/repo/b.ts)\n\n| f |\n| - |\n| [c.ts](/repo/c.ts) |\n'),
				'## `a.ts`\n\n> see `b.ts`\n\n| f |\n| - |\n| `c.ts` |\n');
		});
	});
});
