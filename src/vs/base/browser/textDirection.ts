/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { detectTextDirection } from '../common/textDirection.js';

/**
 * Block-level, text-bearing elements that should follow the direction of their content.
 * `ul`/`ol` are included so an RTL list also flips its marker side (the markers follow the
 * list's own direction, not the list items').
 */
const TEXT_BLOCK_SELECTOR = 'p, li, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, td, th, summary, dt, dd';

/**
 * Walks the rendered markdown subtree and sets a writing direction on each block-level
 * text element so Hebrew/Arabic content reads correctly, while code blocks (`<pre>`) are
 * forced left-to-right. Elements that already carry an explicit `dir` are left untouched.
 *
 * Inline `<code>` is intentionally not annotated so it keeps its natural bidi flow inside
 * a directional paragraph.
 */
export function applyBlockTextDirection(root: HTMLElement): void {
	// eslint-disable-next-line no-restricted-syntax
	for (const element of root.querySelectorAll<HTMLElement>(TEXT_BLOCK_SELECTOR)) {
		if (!element.hasAttribute('dir')) {
			element.setAttribute('dir', detectTextDirection(element.textContent ?? ''));
		}
	}

	// eslint-disable-next-line no-restricted-syntax
	for (const pre of root.querySelectorAll<HTMLElement>('pre')) {
		if (!pre.hasAttribute('dir')) {
			pre.setAttribute('dir', 'ltr');
		}
	}
}
