/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

	const code = element.ownerDocument.createElement('code');
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

/**
 * Matches a link reference definition, including the indented continuation lines CommonMark
 * allows for its destination and title.
 */
const referenceDefinition = /^ {0,3}\[([^\]]+)\]:[^\n]*(?:\n[ \t]+[^\n]*)*\n?/gm;

/** Matches the URL-bearing attributes of raw HTML embedded in markdown. */
const urlAttribute = /\b(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** Normalizes a reference label the way the lexer keys its definition map. */
function normalizeLabel(label: string): string {
	return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Rewrites markdown so it can be shared outside this window. Chat responses address workspace
 * resources with targets that only mean something here — agent host sessions are even
 * instructed to emit absolute filesystem paths — so links, images, raw HTML attributes and
 * reference definitions that don't resolve elsewhere are reduced to the text the reader saw.
 */
export function toPortableMarkdown(markdown: string): string {
	return rewriteMarkdownLinks(markdown, {
		rewriteLink(token) {
			if (isPortableMarkdownTarget(token.href ?? '')) {
				return undefined;
			}
			const label = markdownTokensToPlainText((token as marked.Tokens.Link).tokens ?? []).trim() || (token.text ?? '').trim();
			return label ? appendEscapedMarkdownInlineCode(label) : '';
		},

		rewriteHtml(raw) {
			return raw.replace(urlAttribute, (match, _attribute, _quoted, doubleQuoted, singleQuoted, bare) => {
				const target = doubleQuoted ?? singleQuoted ?? bare ?? '';
				return isPortableMarkdownTarget(target) ? match : '';
			});
		},

		additionalEdits(source, { codeRanges, definitions, unlocatable }) {
			const edits: IMarkdownEdit[] = [];

			// A label spanning lines inside a list or quote cannot be located, so scrub the
			// target itself rather than let an absolute path reach the clipboard.
			for (const token of unlocatable) {
				const target = token.href ?? '';
				if (isPortableMarkdownTarget(target)) {
					continue;
				}
				for (let at = source.indexOf(`](${target})`); at >= 0; at = source.indexOf(`](${target})`, at + 1)) {
					edits.push({ start: at, end: at + `](${target})`.length, replacement: ']()' });
				}
			}

			// The lexer resolves references while parsing and emits no token for the definition
			// itself, so rewriting the reference alone would strand its target further down.
			const unshareable = new Set(Object.keys(definitions ?? {})
				.filter(label => !isPortableMarkdownTarget(definitions[label]?.href ?? '')));
			if (unshareable.size) {
				referenceDefinition.lastIndex = 0;
				for (let match = referenceDefinition.exec(source); match; match = referenceDefinition.exec(source)) {
					const start = match.index;
					const end = start + match[0].length;
					if (unshareable.has(normalizeLabel(match[1])) && !codeRanges.some(range => start < range.end && end > range.start)) {
						edits.push({ start, end, replacement: '' });
					}
				}
			}
			return edits;
		},
	});
}
