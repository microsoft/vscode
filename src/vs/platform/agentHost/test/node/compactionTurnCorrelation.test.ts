/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
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

	test('expires the wait when no owner is recorded', async () => {
		const correlation = new CompactionTurnCorrelation({ timeoutMs: 1 });
		const result = await correlation.resolve('unknown-attempt');

		assert.deepStrictEqual({ turnId: result.turnId, outcome: result.outcome, measuredWait: typeof result.waitMs === 'number' }, {
			turnId: undefined, outcome: 'waitExpired', measuredWait: true,
		});
	});

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
