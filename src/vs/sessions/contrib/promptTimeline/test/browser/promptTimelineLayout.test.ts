/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { spaceMarkCenters } from '../../browser/promptTimelineLayout.js';

suite('spaceMarkCenters', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const GAP = 24;

	function space(centers: number[], height: number, gap = GAP): number[] {
		const marks = centers.map(center => ({ center }));
		spaceMarkCenters(marks, height, gap);
		return marks.map(m => Math.round(m.center * 10) / 10);
	}

	/** Adjacent centres are at least `gap` apart, ascending, and inside `[gap/2, height-gap/2]`. */
	function assertValid(result: number[], height: number, gap = GAP, fullSpacing = true): void {
		for (let i = 1; i < result.length; i++) {
			assert.ok(result[i] >= result[i - 1] - 1e-6, `not ascending at ${i}: ${JSON.stringify(result)}`);
			if (fullSpacing) {
				assert.ok(result[i] - result[i - 1] >= gap - 1e-6, `gap < ${gap} at ${i}: ${JSON.stringify(result)}`);
			}
		}
		for (const c of result) {
			assert.ok(c >= gap / 2 - 1e-6 && c <= height - gap / 2 + 1e-6, `out of bounds: ${c} in ${JSON.stringify(result)}`);
		}
	}

	test('leaves already-spaced marks untouched', () => {
		assert.deepStrictEqual(space([50, 120, 300, 500], 560), [50, 120, 300, 500]);
	});

	test('pushes clustered marks apart to keep the min gap', () => {
		const result = space([100, 108, 112], 560);
		assert.deepStrictEqual(result, [100, 124, 148]);
		assertValid(result, 560);
	});

	test('spreads a cluster pinned at the top from the top bound', () => {
		const result = space([10, 12, 14, 16, 18], 560);
		assert.deepStrictEqual(result, [12, 36, 60, 84, 108]);
		assertValid(result, 560);
	});

	test('pulls a cluster near the bottom up within bounds', () => {
		const result = space([545, 548, 551], 560);
		assert.deepStrictEqual(result, [500, 524, 548]);
		assertValid(result, 560);
	});

	test('clamps a single out-of-range mark into the rail', () => {
		assert.deepStrictEqual(space([1000], 560), [548]);
		assert.deepStrictEqual(space([-50], 560), [12]);
	});

	test('distributes evenly when too many marks to fit at full spacing', () => {
		const height = 200; // fits only ~8 marks at 24px
		const result = space(Array.from({ length: 20 }, (_, i) => i * 5), height);
		assertValid(result, height, GAP, /*fullSpacing*/ false);
		assert.strictEqual(result[0], 12);
		assert.strictEqual(result[result.length - 1], height - 12);
	});

	test('no-ops for empty input or a rail too short to space', () => {
		assert.deepStrictEqual(space([], 560), []);
		assert.deepStrictEqual(space([100, 108], 10), [100, 108]);
	});
});
