/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { computeDeferredRange, countMarkdownCodeBlocks, getDeferredRenderingSide, getNextDeferredEnd, getNextDeferredStart, IDeferredRenderingContent } from '../../../browser/widget/chatDeferredResponseRendering.js';

/** `b` marks a boundary, `p` a protected part, and any other character an ordinary part. */
function createContent(spec: string): IDeferredRenderingContent {
	return {
		length: spec.length,
		isBoundary: index => spec[index] === 'b',
		isProtected: index => spec[index] === 'p',
	};
}

suite('ChatDeferredResponseRendering', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('chooses a range that ends at a boundary and starts after the last protected part', () => {
		const regular = createContent('b..b..b..b..b..b');
		const protectedPart = createContent('b.p.b..b..b..b');
		assert.deepStrictEqual({
			atLimit: computeDeferredRange(regular, 12, 0, 1),
			belowLimit: computeDeferredRange(regular, 11, 0, 1),
			afterProtected: computeDeferredRange(protectedPart, 10, 0, 1),
			fromFloor: computeDeferredRange(regular, 12, 4, 1),
			tooSmall: computeDeferredRange(regular, 12, 0, 13),
			noBoundary: computeDeferredRange(createContent('..........'), 8, 0, 1),
		}, {
			atLimit: { start: 0, end: 12 },
			belowLimit: { start: 0, end: 9 },
			// The part after a protected one is not a boundary, so the range starts at the next boundary.
			afterProtected: { start: 4, end: 10 },
			fromFloor: { start: 6, end: 12 },
			tooSmall: undefined,
			noBoundary: undefined,
		});
	});

	test('renders chunks up to the next boundary from either side', () => {
		const content = createContent('b..b..b..b..b..b');
		const range = { start: 0, end: 12 };
		assert.deepStrictEqual({
			newest: getNextDeferredEnd(range, content, 2),
			oldest: getNextDeferredStart(range, content, 2),
			lastNewest: getNextDeferredEnd({ start: 0, end: 3 }, content, 5),
			lastOldest: getNextDeferredStart({ start: 9, end: 12 }, content, 5),
		}, {
			newest: 9,
			oldest: 3,
			lastNewest: 0,
			lastOldest: 12,
		});
	});

	test('counts the code blocks a markdown string numbers', () => {
		assert.deepStrictEqual([
			'```ts\na\n```\ntext\n~~~\nb\n~~~',
			'```vscode-extensions\npublisher.extension\n```',
			'````md\n```\ninner\n```\n````',
			'inline ``` is not a fence',
			'    ```\nindented code is not a fence',
			'```\nnot closed',
		].map(countMarkdownCodeBlocks), [2, 0, 1, 0, 0, 1]);
	});

	test('renders the side of the gap that keeps the visible content still', () => {
		const viewport = { top: 100, bottom: 500 };
		const side = (top: number, preferOldest = false) => getDeferredRenderingSide({ top, bottom: top + 20 }, viewport, preferOldest);
		assert.deepStrictEqual({
			farAbove: side(-400),
			above: side(0),
			upperHalf: side(150),
			upperHalfAfterOpening: side(150, true),
			lowerHalf: side(400),
			below: side(600),
			farBelow: side(950),
		}, {
			farAbove: undefined,
			above: 'newest',
			upperHalf: 'newest',
			upperHalfAfterOpening: 'oldest',
			lowerHalf: 'oldest',
			below: 'oldest',
			farBelow: undefined,
		});
	});
});
