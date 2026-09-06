/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { planForkedTurnIdMap, resolveForkBoundary } from '../../../node/codex/codexForkPlan.js';

suite('codexForkPlan', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('resolveForkBoundary', () => {

		test('locates the boundary by codex turn id (first / middle / last)', () => {
			const ids = ['t0', 't1', 't2'];
			assert.deepStrictEqual({
				first: resolveForkBoundary(ids, 't0', -1),
				middle: resolveForkBoundary(ids, 't1', -1),
				last: resolveForkBoundary(ids, 't2', -1),
			}, {
				// Fork at t0 keeps 1 turn, drops the 2 trailing turns.
				first: { resolved: true, keepThroughIndex: 0, numTurnsToDrop: 2 },
				middle: { resolved: true, keepThroughIndex: 1, numTurnsToDrop: 1 },
				// Fork at the tip keeps everything, drops nothing.
				last: { resolved: true, keepThroughIndex: 2, numTurnsToDrop: 0 },
			});
		});

		test('falls back to turnIndex when the id is not found', () => {
			const ids = ['t0', 't1', 't2'];
			assert.deepStrictEqual(
				resolveForkBoundary(ids, 'missing', 1),
				{ resolved: true, keepThroughIndex: 1, numTurnsToDrop: 1 },
			);
		});

		test('rejects an unresolvable boundary instead of keeping full history', () => {
			const ids = ['t0', 't1', 't2'];
			assert.deepStrictEqual({
				// id missing AND fallback index out of range → unresolved
				negativeFallback: resolveForkBoundary(ids, 'missing', -1),
				tooLargeFallback: resolveForkBoundary(ids, 'missing', 5),
			}, {
				negativeFallback: { resolved: false },
				tooLargeFallback: { resolved: false },
			});
		});

		test('treats an empty source thread as a valid empty fork', () => {
			assert.deepStrictEqual(
				resolveForkBoundary([], 'anything', -1),
				{ resolved: true, keepThroughIndex: -1, numTurnsToDrop: 0 },
			);
		});
	});

	suite('planForkedTurnIdMap', () => {

		test('maps new host ids to the forked thread\'s (regenerated) codex ids for a live source', () => {
			// Live source: source session tracks codex→host ids; the fork remaps
			// old host ids to new ones and regenerates the codex turn ids.
			const sourceTurnIds = ['c0', 'c1', 'c2'];
			const forkedTurnIds = ['f0', 'f1']; // t2 was rolled back
			const hostBySourceCodex = new Map([['c0', 'h0'], ['c1', 'h1'], ['c2', 'h2']]);
			const turnIdMapping = new Map([['h0', 'n0'], ['h1', 'n1'], ['h2', 'n2']]);

			assert.deepStrictEqual(
				planForkedTurnIdMap(sourceTurnIds, forkedTurnIds, /*keepThroughIndex*/ 1, hostBySourceCodex, turnIdMapping),
				[['n0', 'f0'], ['n1', 'f1']],
			);
		});

		test('uses the source codex id as the host id for a restored source (no host map)', () => {
			// Restored source: no live host map, so old host id == source codex id.
			const sourceTurnIds = ['c0', 'c1'];
			const forkedTurnIds = ['c0', 'c1'];
			const turnIdMapping = new Map([['c0', 'n0'], ['c1', 'n1']]);

			assert.deepStrictEqual(
				planForkedTurnIdMap(sourceTurnIds, forkedTurnIds, /*keepThroughIndex*/ 1, undefined, turnIdMapping),
				[['n0', 'c0'], ['n1', 'c1']],
			);
		});

		test('returns nothing when there is no turn-id mapping to apply', () => {
			assert.deepStrictEqual({
				undefinedMapping: planForkedTurnIdMap(['c0'], ['c0'], 0, undefined, undefined),
				emptyMapping: planForkedTurnIdMap(['c0'], ['c0'], 0, undefined, new Map()),
			}, {
				undefinedMapping: [],
				emptyMapping: [],
			});
		});

		test('clamps to the number of forked turns actually present', () => {
			// keepThroughIndex claims 3 kept turns but the forked read only
			// returned 2 → only pair the turns we can resolve.
			const turnIdMapping = new Map([['c0', 'n0'], ['c1', 'n1'], ['c2', 'n2']]);
			assert.deepStrictEqual(
				planForkedTurnIdMap(['c0', 'c1', 'c2'], ['c0', 'c1'], /*keepThroughIndex*/ 2, undefined, turnIdMapping),
				[['n0', 'c0'], ['n1', 'c1']],
			);
		});

		test('falls back to the old host id when the mapping lacks an entry', () => {
			const turnIdMapping = new Map([['c0', 'n0']]);
			assert.deepStrictEqual(
				planForkedTurnIdMap(['c0', 'c1'], ['c0', 'c1'], /*keepThroughIndex*/ 1, undefined, turnIdMapping),
				[['n0', 'c0'], ['c1', 'c1']],
			);
		});
	});
});
