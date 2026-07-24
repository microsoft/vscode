/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mergeSectionOrder, resolveSectionOrder, spliceSectionOrder } from '../../browser/sessionSectionOrderService.js';

suite('SessionSectionOrder Helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('resolveSectionOrder', () => {

		test('falls back to default order when nothing is persisted', () => {
			assert.deepStrictEqual(resolveSectionOrder([], ['a', 'b', 'c']), ['a', 'b', 'c']);
		});

		test('applies the persisted order for live ids', () => {
			assert.deepStrictEqual(resolveSectionOrder(['c', 'a', 'b'], ['a', 'b', 'c']), ['c', 'a', 'b']);
		});

		test('drops persisted ids that are no longer live', () => {
			assert.deepStrictEqual(resolveSectionOrder(['x', 'c', 'a'], ['a', 'c']), ['c', 'a']);
		});

		test('weaves not-yet-seen ids in at their default position', () => {
			// 'b' is new and defaults between 'a' and 'c'; persisted order is c,a.
			assert.deepStrictEqual(resolveSectionOrder(['c', 'a'], ['a', 'b', 'c']), ['c', 'a', 'b']);
		});

		test('inserts a new leading default before the persisted block', () => {
			assert.deepStrictEqual(resolveSectionOrder(['b', 'c'], ['a', 'b', 'c']), ['a', 'b', 'c']);
		});
	});

	suite('spliceSectionOrder', () => {

		test('moves before the target', () => {
			assert.deepStrictEqual(spliceSectionOrder(['a', 'b', 'c'], 'c', 'a', 'before'), ['c', 'a', 'b']);
		});

		test('moves after the target', () => {
			assert.deepStrictEqual(spliceSectionOrder(['a', 'b', 'c'], 'a', 'c', 'after'), ['b', 'c', 'a']);
		});

		test('returns undefined when the target is missing', () => {
			assert.strictEqual(spliceSectionOrder(['a', 'b'], 'a', 'z', 'before'), undefined);
		});
	});

	suite('mergeSectionOrder', () => {

		test('uses the visible order directly when nothing else is persisted', () => {
			assert.deepStrictEqual(mergeSectionOrder([], ['b', 'a']), ['b', 'a']);
		});

		test('keeps out-of-scope ids anchored to their visible predecessor', () => {
			// 'w1' (out of scope) followed 'g1' in the persisted order; reordering
			// the groups g1/g2 must keep 'w1' trailing g1.
			const persisted = ['g1', 'w1', 'g2'];
			const visibleAfter = ['g2', 'g1'];
			assert.deepStrictEqual(mergeSectionOrder(persisted, visibleAfter), ['g2', 'g1', 'w1']);
		});

		test('keeps out-of-scope ids that precede all visible ids at the head', () => {
			const persisted = ['w1', 'g1', 'g2'];
			const visibleAfter = ['g2', 'g1'];
			assert.deepStrictEqual(mergeSectionOrder(persisted, visibleAfter), ['w1', 'g2', 'g1']);
		});
	});
});
