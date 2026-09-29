/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIncrementalRenderingBuffer } from './buffer.js';

/**
 * Maximum number of characters that may accumulate beyond the last
 * paragraph boundary before a render is forced.
 */
const MAX_BUFFERED_CHARS = 4000;

/**
 * Finds the last `\n\n` block boundary that is NOT inside an open
 * fenced code block. This prevents splitting a render in the middle
 * of a code fence, which would cause the code block element to update
 * in place (same DOM index) without triggering a new-child animation.
 *
 * The scan counts backtick-fence openings/closings from the start of
 * the string. A `\n\n` is only a valid boundary when the fence depth
 * is 0 (i.e. outside any code block).
 *
 * @internal Exported for testing.
 */
export function lastBlockBoundary(text: string): number {
	let lastValid = -1;
	let inFence = false;

	for (let i = 0; i < text.length; i++) {
		// Detect fenced code blocks: ``` or ~~~ at the start of a line.
		if ((i === 0 || text[i - 1] === '\n') &&
			((text[i] === '`' && text[i + 1] === '`' && text[i + 2] === '`') ||
				(text[i] === '~' && text[i + 1] === '~' && text[i + 2] === '~'))) {
			inFence = !inFence;
			i += 2; // skip past the triple backtick/tilde
			continue;
		}
		// Detect block boundary outside code fences.
		if (!inFence && text[i] === '\n' && text[i + 1] === '\n') {
			lastValid = i;
		}
	}

	return lastValid;
}

/**
 * Buffers content at paragraph boundaries (`\n\n` outside code fences).
 * This avoids rendering partially formed blocks — text mid-paragraph,
 * incomplete list groups, or half a code fence.
 */
export class ParagraphBuffer implements IIncrementalRenderingBuffer {
	readonly handlesFlush = false;

	getRenderable(fullMarkdown: string, _lastRendered: string): string {
		const lastBlock = lastBlockBoundary(fullMarkdown);
		let renderable = lastBlock === -1
			? fullMarkdown   // no paragraph breaks — single block, render as-is
			: fullMarkdown.slice(0, lastBlock + 2);

		// Escape hatch: if too much content has accumulated beyond the
		// last block boundary, render what we have.
		if (fullMarkdown.length - renderable.length > MAX_BUFFERED_CHARS) {
			renderable = fullMarkdown;
		}

		return renderable;
	}
}
