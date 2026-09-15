/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { appendEscapedMarkdownInlineCode, isPortableLinkTarget, isPortableMarkdownTarget } from '../../../../../base/common/htmlContent.js';
import * as marked from '../../../../../base/common/marked/marked.js';
import { IMarkdownEdit, markdownTokensToPlainText, rewriteMarkdownLinks } from '../../../../../base/common/markdownLinks.js';

/**
 * Reads the target a rendered chat anchor points at. Clicks route through `data-href`, so that
 * attribute carries the semantic target while `href` may be empty or a copy-safe duplicate.
 */
function getLinkTarget(element: Element): string {
	return (element.getAttribute('data-href') || element.getAttribute('href') || '').trim();
}

/** Replaces an element with the text a reader saw, marked up as code. */
function replaceWithLabel(element: Element, label: string): void {
	if (!label.trim()) {
		element.remove();
		return;
	}

	const code = $('code');
	code.textContent = label;
	element.replaceWith(code);
}

/**
 * Rewrites a copied chat selection so it stays useful outside this window, replacing links and
 * images that only resolve here with the text the reader saw. Returns whether anything changed.
 */
export function sanitizeChatClipboardFragment(fragment: DocumentFragment): boolean {
	let changed = false;

	// eslint-disable-next-line no-restricted-syntax -- operating on a detached fragment
	for (const anchor of Array.from(fragment.querySelectorAll('a'))) {
		const target = getLinkTarget(anchor);
		if (isPortableLinkTarget(target)) {
			anchor.setAttribute('href', target);
			anchor.removeAttribute('data-href');
			continue;
		}

		replaceWithLabel(anchor, anchor.textContent ?? '');
		changed = true;
	}

	// eslint-disable-next-line no-restricted-syntax -- operating on a detached fragment
	for (const image of Array.from(fragment.querySelectorAll('img'))) {
		if (!isPortableLinkTarget(image.getAttribute('src') ?? '')) {
			replaceWithLabel(image, image.getAttribute('alt') ?? '');
			changed = true;
		}
	}

	// eslint-disable-next-line no-restricted-syntax -- operating on a detached fragment
	for (const element of Array.from(fragment.querySelectorAll('[data-href]'))) {
		element.removeAttribute('data-href');
	}

	return changed;
}

function overlapsCode(start: number, end: number, codeRanges: readonly { readonly start: number; readonly end: number }[]): boolean {
	return codeRanges.some(range => start < range.end && end > range.start);
}

/**
 * Rewrites markdown so it can be shared outside this window. Chat responses address workspace
 * resources with targets that only mean something here — agent host sessions are even
 * instructed to emit absolute filesystem paths — so links and images that don't resolve
 * elsewhere are reduced to the text the reader saw.
 *
 * Raw HTML is left verbatim. Chat markdown is rendered without `supportHtml`, so a tag the model
 * wrote was never a live link, and rewriting its attributes would corrupt text the reader saw.
 */
export function toPortableMarkdown(markdown: string): string {
	return rewriteMarkdownLinks(markdown, {
		rewriteLink(token) {
			const target = token.href ?? '';
			if (!isPortableMarkdownTarget(target)) {
				const label = markdownTokensToPlainText((token as marked.Tokens.Link).tokens ?? []).trim() || (token.text ?? '').trim();
				return label ? appendEscapedMarkdownInlineCode(label) : '';
			}

			// Every definition is dropped below, so a link that named one has to start carrying
			// its own target. Spelling the target out is what tells the two apart.
			if (!token.raw.includes(target)) {
				const title = token.title ? ` "${token.title}"` : '';
				return `${token.type === 'image' ? '!' : ''}[${token.text}](${target}${title})`;
			}
			return undefined;
		},

		additionalEdits(source, { codeRanges, definitionRanges, unlocatable }) {
			const edits: IMarkdownEdit[] = [];

			// A label spanning lines inside a list or quote cannot be located, so scrub the
			// target itself rather than let an absolute path reach the clipboard. Occurrences
			// inside code are left alone: those are samples, not live links.
			for (const token of unlocatable) {
				const target = token.href ?? '';
				if (isPortableMarkdownTarget(target)) {
					continue;
				}
				const needle = `](${target})`;
				for (let at = source.indexOf(needle); at >= 0; at = source.indexOf(needle, at + 1)) {
					if (!overlapsCode(at, at + needle.length, codeRanges)) {
						edits.push({ start: at, end: at + needle.length, replacement: ']()' });
					}
				}
			}

			// A definition holds its target in source the reader never saw, so leaving one behind
			// would publish the very path this strips. The links that leaned on them now spell
			// their targets out, so the definitions have nothing left to say.
			edits.push(...definitionRanges.map(range => ({ ...range, replacement: '' })));
			return edits;
		},
	});
}
