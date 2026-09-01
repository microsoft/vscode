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

		assert.deepStrictEqual({
			correlation: await pending,
			remaining: correlation.take('model-call-1'),
		}, {
			correlation: 'turn-1',
			remaining: undefined,
		});
	});

	test('discards correlations recorded after response fallback', async () => {
		const correlation = new ModelCallTurnCorrelation({ timeoutMs: 0 });

		correlation.markResponseForwarded('immediate-model-call');
		correlation.record('immediate-model-call', 'immediate-turn');
		const timedOut = await correlation.wait('timed-out-model-call');
		correlation.record('timed-out-model-call', 'late-turn');

		assert.deepStrictEqual({
			immediate: correlation.take('immediate-model-call'),
			timedOut,
			late: correlation.take('timed-out-model-call'),
		}, {
			immediate: undefined,
			timedOut: undefined,
			late: undefined,
		});
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
