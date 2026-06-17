/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { computeMobileMultiDiffItemHeight, computeMobileMultiDiffVirtualLayout, IMobileMultiDiffVirtualizerMetrics } from '../../browser/parts/mobile/contributions/mobileMultiDiffVirtualizer.js';

suite('MobileMultiDiffVirtualizer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const metrics: IMobileMultiDiffVirtualizerMetrics = {
		fileHeaderHeight: 32,
		hunkHeaderHeight: 18,
		rowHeight: 20,
		bodyVerticalPadding: 8,
		placeholderHeight: 44,
	};

	test('computes deterministic item heights', () => {
		assert.strictEqual(
			computeMobileMultiDiffItemHeight({ state: 'loaded', hunkCount: 2, rowCount: 10 }, metrics),
			32 + 8 + 2 * 18 + 10 * 20,
		);
		assert.strictEqual(
			computeMobileMultiDiffItemHeight({ state: 'loading', hunkCount: 2, rowCount: 10 }, metrics),
			32 + 44,
		);
		assert.strictEqual(
			computeMobileMultiDiffItemHeight({ state: 'loaded', collapsed: true, hunkCount: 2, rowCount: 10 }, metrics),
			32,
		);
		assert.strictEqual(
			computeMobileMultiDiffItemHeight({ state: 'loaded', hunkCount: 0, rowCount: 0 }, metrics),
			32 + 44,
		);
		assert.strictEqual(
			computeMobileMultiDiffItemHeight({ state: 'unloaded' }, metrics),
			32 + 44,
		);
		assert.strictEqual(
			computeMobileMultiDiffItemHeight({ state: 'unloaded', estimatedHunkCount: 1, estimatedRowCount: 10 }, metrics),
			32 + 8 + 18 + 10 * 20,
		);
		assert.strictEqual(
			computeMobileMultiDiffItemHeight({ state: 'empty' }, metrics),
			32 + 44,
		);
		assert.strictEqual(
			computeMobileMultiDiffItemHeight({ state: 'error' }, metrics),
			32 + 44,
		);
	});

	test('handles an empty item list', () => {
		const layout = computeMobileMultiDiffVirtualLayout([], {
			viewportHeight: 100,
			scrollTop: 0,
			metrics,
		});

		assert.strictEqual(layout.totalHeight, 0);
		assert.deepStrictEqual(layout.items, []);
	});

	test('computes visible items from the outer scroll range', () => {
		const items = new Array(5).fill(undefined).map(() => ({ state: 'loaded' as const, hunkCount: 0, rowCount: 2 }));

		const layout = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 100,
			scrollTop: 0,
			metrics,
		});

		assert.strictEqual(layout.totalHeight, 5 * 80);
		assert.deepStrictEqual(layout.items.map(item => item.index), [0, 1]);
		assert.deepStrictEqual(layout.items.map(item => item.virtualTop), [0, 80]);
		assert.deepStrictEqual(layout.items.map(item => item.innerOffset), [0, 0]);
	});

	test('uses half-open viewport boundaries', () => {
		const items = new Array(3).fill(undefined).map(() => ({ state: 'loaded' as const, hunkCount: 0, rowCount: 2 }));

		const firstPage = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 80,
			scrollTop: 0,
			metrics,
		});
		const secondPage = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 80,
			scrollTop: 80,
			metrics,
		});
		const afterEnd = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 80,
			scrollTop: 240,
			metrics,
		});

		assert.deepStrictEqual(firstPage.items.map(item => item.index), [0]);
		assert.deepStrictEqual(secondPage.items.map(item => item.index), [1]);
		assert.deepStrictEqual(afterEnd.items.map(item => item.index), []);
	});

	test('includes overscan without changing total height', () => {
		const items = new Array(3).fill(undefined).map(() => ({ state: 'loaded' as const, hunkCount: 0, rowCount: 2 }));

		const withoutOverscan = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 80,
			scrollTop: 80,
			metrics,
		});
		const withOverscan = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 80,
			scrollTop: 80,
			overscan: 80,
			metrics,
		});

		assert.strictEqual(withoutOverscan.totalHeight, 240);
		assert.strictEqual(withOverscan.totalHeight, 240);
		assert.deepStrictEqual(withoutOverscan.items.map(item => item.index), [1]);
		assert.deepStrictEqual(withOverscan.items.map(item => item.index), [0, 1, 2]);
	});

	test('clamps negative scroll, viewport, and overscan values', () => {
		const items = new Array(3).fill(undefined).map(() => ({ state: 'loaded' as const, hunkCount: 0, rowCount: 2 }));

		const negativeScroll = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 80,
			scrollTop: -100,
			metrics,
		});
		const negativeViewport = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: -80,
			scrollTop: 0,
			metrics,
		});
		const negativeOverscan = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 80,
			scrollTop: 80,
			overscan: -80,
			metrics,
		});

		assert.deepStrictEqual(negativeScroll.items.map(item => item.index), [0]);
		assert.deepStrictEqual(negativeViewport.items.map(item => item.index), []);
		assert.deepStrictEqual(negativeOverscan.items.map(item => item.index), [1]);
	});

	test('keeps a large mounted item anchored while computing its inner offset', () => {
		const items = [
			{ state: 'loaded' as const, hunkCount: 1, rowCount: 10 }, // 258px
			{ state: 'loaded' as const, hunkCount: 0, rowCount: 2 }, // 80px
		];

		const insideLargeFile = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 100,
			scrollTop: 50,
			metrics,
		});

		assert.strictEqual(insideLargeFile.totalHeight, 338);
		assert.deepStrictEqual(insideLargeFile.items.map(item => item.index), [0]);
		assert.strictEqual(insideLargeFile.items[0].virtualHeight, 258);
		assert.strictEqual(insideLargeFile.items[0].renderHeight, 258);
		assert.strictEqual(insideLargeFile.items[0].innerOffset, 50);
		assert.strictEqual(insideLargeFile.items[0].renderTop, 0);

		const leavingLargeFile = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 100,
			scrollTop: 220,
			metrics,
		});

		assert.deepStrictEqual(leavingLargeFile.items.map(item => item.index), [0, 1]);
		assert.strictEqual(leavingLargeFile.items[0].innerOffset, 220);
		assert.strictEqual(leavingLargeFile.items[0].renderTop, 0);
		assert.strictEqual(leavingLargeFile.items[0].renderHeight, 258);
		assert.strictEqual(leavingLargeFile.items[1].innerOffset, 0);
		assert.strictEqual(leavingLargeFile.items[1].renderTop, 258);
	});

	test('uses collapsed heights in total and visible range calculations', () => {
		const items = [
			{ state: 'loaded' as const, hunkCount: 1, rowCount: 10, collapsed: true },
			{ state: 'loaded' as const, hunkCount: 0, rowCount: 2 },
			{ state: 'loading' as const },
		];

		const layout = computeMobileMultiDiffVirtualLayout(items, {
			viewportHeight: 100,
			scrollTop: 0,
			metrics,
		});

		assert.strictEqual(layout.totalHeight, 32 + 80 + 76);
		assert.deepStrictEqual(layout.items.map(item => item.index), [0, 1]);
		assert.deepStrictEqual(layout.items.map(item => item.virtualHeight), [32, 80]);
	});
});
