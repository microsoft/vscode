/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { CompactionTurnCorrelation, isCompactionTelemetryKind } from '../../node/copilot/compactionTurnCorrelation.js';

suite('CompactionTurnCorrelation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves an owner recorded before the telemetry, including one that ran between turns', async () => {
		const correlation = new CompactionTurnCorrelation();
		correlation.record('attempt-in-turn', 'turn-1');
		correlation.record('attempt-between-turns', undefined);

		assert.deepStrictEqual([
			await correlation.resolve('attempt-in-turn'),
			await correlation.resolve('attempt-in-turn'),
			await correlation.resolve('attempt-between-turns'),
		], [
			{ turnId: 'turn-1', outcome: 'mappingAvailable' },
			{ turnId: 'turn-1', outcome: 'mappingAvailable' },
			{ turnId: undefined, outcome: 'noOwningTurn' },
		]);
	});

	test('waits for an owner recorded after the telemetry arrives', async () => {
		const correlation = new CompactionTurnCorrelation();
		const startRow = correlation.resolve('attempt-1');
		const completeRow = correlation.resolve('attempt-1');

		correlation.record('attempt-1', 'turn-1');

		const results = await Promise.all([startRow, completeRow]);
		assert.deepStrictEqual(results.map(({ turnId, outcome, waitMs }) => ({ turnId, outcome, measuredWait: typeof waitMs === 'number' && waitMs >= 0 })), [
			{ turnId: 'turn-1', outcome: 'mappingWaited', measuredWait: true },
			{ turnId: 'turn-1', outcome: 'mappingWaited', measuredWait: true },
		]);
	});

	test('expires the wait when no owner is recorded', () => runWithFakedTimers({}, async () => {
		const correlation = new CompactionTurnCorrelation();
		const result = await correlation.resolve('unknown-attempt');

		assert.deepStrictEqual({ turnId: result.turnId, outcome: result.outcome, measuredWait: typeof result.waitMs === 'number' }, {
			turnId: undefined, outcome: 'waitExpired', measuredWait: true,
		});
	}));

	test('delivers an owner recorded within a later waiter\'s budget after an earlier waiter expired', () => runWithFakedTimers({}, async () => {
		const correlation = new CompactionTurnCorrelation({ timeoutMs: 100 });
		const startRow = correlation.resolve('attempt-1');
		await timeout(50);
		const completeRow = correlation.resolve('attempt-1');
		await timeout(60);
		// The start row's budget has expired; the completion row has 40ms left.
		correlation.record('attempt-1', 'turn-1');

		const [start, complete] = await Promise.all([startRow, completeRow]);
		assert.deepStrictEqual([start.outcome, complete.turnId, complete.outcome], ['waitExpired', 'turn-1', 'mappingWaited']);
	}));

	test('retains the owner from compaction start when completion lands in a later turn', async () => {
		const correlation = new CompactionTurnCorrelation({ cacheLimit: 2 });
		correlation.record('attempt-1', 'turn-1');
		correlation.record('attempt-1', 'turn-2');
		const retained = await correlation.resolve('attempt-1');
		correlation.record('attempt-2', 'turn-2');
		correlation.record('attempt-3', 'turn-3');

		assert.deepStrictEqual({ retained, latest: await correlation.resolve('attempt-3') }, {
			retained: { turnId: 'turn-1', outcome: 'mappingAvailable' },
			latest: { turnId: 'turn-3', outcome: 'mappingAvailable' },
		});
	});

	test('identifies compaction telemetry kinds', () => {
		assert.deepStrictEqual(
			['session_compaction_start', 'session_compaction_complete', 'session_truncation', 'response.success'].map(isCompactionTelemetryKind),
			[true, true, false, false],
		);
	});
});
