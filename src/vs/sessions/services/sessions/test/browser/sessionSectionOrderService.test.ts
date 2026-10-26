/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { mergeSectionOrder, resolveSectionOrder, restoreSectionOrderPositions, SessionSectionOrderService, spliceSectionOrder } from '../../browser/sessionSectionOrderService.js';

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

	suite('restoreSectionOrderPositions', () => {

		test('re-inserts dropped ids after the ids they followed, or first when none of those remain', () => {
			// 'g1' and 'g3' were dropped; 'w1' moved meanwhile and keeps its new position.
			assert.deepStrictEqual(restoreSectionOrderPositions(['g2', 'w1'], ['g1', 'w1', 'g2', 'g3'], new Set(['g1', 'g3'])), ['g1', 'g2', 'g3', 'w1']);
		});

		test('leaves captured ids that are still ordered where they are', () => {
			assert.deepStrictEqual(restoreSectionOrderPositions(['g2', 'g1'], ['g1', 'g2'], new Set(['g1', 'g2'])), ['g2', 'g1']);
		});
	});
});

suite('SessionSectionOrderService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('restores captured positions that retain dropped, and persists them', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const service = disposables.add(new SessionSectionOrderService(storageService));
		service.reorder(['g1', 'g2', 'g3'], 'g1', 'g3', 'after');
		const positions = service.capturePositions(['g2']);
		service.retain(['g1', 'g3']);
		const afterRetain = service.resolveOrder(['g1', 'g2', 'g3']);
		let changes = 0;
		disposables.add(service.onDidChange(() => changes++));

		service.restorePositions(positions);
		service.restorePositions(positions);

		assert.deepStrictEqual({
			afterRetain,
			restored: service.resolveOrder(['g1', 'g2', 'g3']),
			reloaded: disposables.add(new SessionSectionOrderService(storageService)).resolveOrder(['g1', 'g2', 'g3']),
			changes,
		}, {
			// Without its position, 'g2' falls back to its default place after 'g1'.
			afterRetain: ['g3', 'g1', 'g2'],
			restored: ['g2', 'g3', 'g1'],
			reloaded: ['g2', 'g3', 'g1'],
			changes: 1,
		});
	});
});
