/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ModelCallTurnCorrelation } from '../../node/copilot/modelCallTurnCorrelation.js';

suite('ModelCallTurnCorrelation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns a correlation recorded before response telemetry', () => {
		const correlation = new ModelCallTurnCorrelation();
		correlation.record('model-call-1', 'turn-1');

		assert.deepStrictEqual({
			correlation: correlation.take('model-call-1'),
			remaining: correlation.take('model-call-1'),
		}, {
			correlation: 'turn-1',
			remaining: undefined,
		});
	});

	test('resolves response telemetry waiting for a correlation', async () => {
		const correlation = new ModelCallTurnCorrelation();
		const pending = correlation.wait('model-call-1');

		correlation.record('model-call-1', 'turn-1');

		const result = await pending;
		assert.deepStrictEqual({
			correlation: result.turnId,
			outcome: result.outcome,
			measuredWait: typeof result.waitMs === 'number' && result.waitMs >= 0,
			remaining: correlation.take('model-call-1'),
		}, {
			correlation: 'turn-1',
			outcome: 'mappingWaited',
			measuredWait: true,
			remaining: undefined,
		});
	});

	test('discards correlations recorded after response fallback', async () => {
		const correlation = new ModelCallTurnCorrelation({ timeoutMs: 0 });

		correlation.markResponseForwarded('immediate-model-call');
		const immediateRecord = correlation.record('immediate-model-call', 'immediate-turn');
		const timedOut = await correlation.wait('timed-out-model-call');
		const lateRecord = correlation.record('timed-out-model-call', 'late-turn');

		assert.deepStrictEqual({
			immediateRecord,
			lateRecord,
			immediate: correlation.take('immediate-model-call'),
			timedOut: { turnId: timedOut.turnId, outcome: timedOut.outcome, measuredWait: typeof timedOut.waitMs === 'number' },
			late: correlation.take('timed-out-model-call'),
		}, {
			immediateRecord: 'late',
			lateRecord: 'late',
			immediate: undefined,
			timedOut: { turnId: undefined, outcome: 'waitExpired', measuredWait: true },
			late: undefined,
		});
		assert.deepStrictEqual(await correlation.wait('timed-out-model-call'), { turnId: undefined, outcome: 'responseAlreadyForwarded' });
	});

	test('deduplicates recorded owners and rejects conflicting owners', async () => {
		const correlation = new ModelCallTurnCorrelation();
		assert.strictEqual(correlation.record('call', 'turn-1'), 'recorded');
		assert.strictEqual(correlation.record('call', 'turn-1'), 'duplicate');
		assert.strictEqual(correlation.record('call', 'turn-2'), 'conflict');
		assert.deepStrictEqual(await correlation.wait('call'), { turnId: 'turn-1', outcome: 'mappingAvailable' });
		assert.deepStrictEqual(await correlation.wait('call'), { turnId: undefined, outcome: 'responseAlreadyForwarded' });
		assert.strictEqual(correlation.record('call', 'turn-1'), 'duplicate');
		assert.strictEqual(correlation.take('call'), undefined);
	});

	test('shares concurrent waits without losing an exact owner', async () => {
		const correlation = new ModelCallTurnCorrelation();
		const first = correlation.wait('call');
		const second = correlation.wait('call');
		correlation.record('call', 'turn');

		assert.deepStrictEqual((await Promise.all([first, second])).map(result => ({
			turnId: result.turnId, outcome: result.outcome, measuredWait: typeof result.waitMs === 'number' && result.waitMs >= 0,
		})), [
			{ turnId: 'turn', outcome: 'mappingWaited', measuredWait: true },
			{ turnId: 'turn', outcome: 'mappingWaited', measuredWait: true },
		]);
		assert.deepStrictEqual(await correlation.wait('call'), { turnId: undefined, outcome: 'responseAlreadyForwarded' });
	});

	test('bounds owner deduplication history', () => {
		const correlation = new ModelCallTurnCorrelation({ cacheLimit: 2 });
		correlation.record('call-1', 'turn-1');
		correlation.record('call-2', 'turn-2');
		correlation.record('call-3', 'turn-3');
		assert.strictEqual(correlation.record('call-3', 'turn-3'), 'duplicate');
		assert.strictEqual(correlation.record('call-1', 'turn-1'), 'recorded');
	});

	test('distinguishes cached mappings and already-forwarded responses from waits', async () => {
		const correlation = new ModelCallTurnCorrelation();
		correlation.record('cached', 'turn-cached');
		correlation.markResponseForwarded('forwarded');

		assert.deepStrictEqual([
			await correlation.wait('cached'),
			await correlation.wait('forwarded'),
		], [
			{ turnId: 'turn-cached', outcome: 'mappingAvailable' },
			{ turnId: undefined, outcome: 'responseAlreadyForwarded' },
		]);
	});

	test('bounds unmatched correlations and forwarded-response markers', () => {
		const recordedCorrelations = new ModelCallTurnCorrelation({ cacheLimit: 2 });
		const forwardedCorrelations = new ModelCallTurnCorrelation({ cacheLimit: 2 });

		for (let i = 1; i <= 3; i++) {
			recordedCorrelations.record(`recorded-${i}`, `turn-${i}`);
			forwardedCorrelations.markResponseForwarded(`forwarded-${i}`);
		}
		forwardedCorrelations.record('forwarded-1', 'late-turn');
		forwardedCorrelations.record('forwarded-3', 'discarded-turn');

		assert.deepStrictEqual({
			evictedCorrelation: recordedCorrelations.take('recorded-1'),
			retainedCorrelations: [recordedCorrelations.take('recorded-2'), recordedCorrelations.take('recorded-3')],
			evictedMarkerAllowsCorrelation: forwardedCorrelations.take('forwarded-1'),
			retainedMarkerDiscardsCorrelation: forwardedCorrelations.take('forwarded-3'),
		}, {
			evictedCorrelation: undefined,
			retainedCorrelations: ['turn-2', 'turn-3'],
			evictedMarkerAllowsCorrelation: 'late-turn',
			retainedMarkerDiscardsCorrelation: undefined,
		});
	});
});
