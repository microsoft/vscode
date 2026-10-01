/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { computeReconnectDelay, DEFAULT_RECONNECT_POLICY } from '../../common/reconnectPolicy.js';

suite('Remote agent host reconnect policy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves the default retry schedule without jitter', () => {
		assert.deepStrictEqual([1, 2, 5, 6, 10].map(attempt => computeReconnectDelay(DEFAULT_RECONNECT_POLICY, attempt)), [
			1000, 2000, 16000, 30000, 30000,
		]);
	});

	test('jitter stays within the upper half of the capped backoff', () => {
		const policy = { ...DEFAULT_RECONNECT_POLICY, jitter: true };
		const delays = (attempt: number) => [0, 0.5, 1].map(random => computeReconnectDelay(policy, attempt, () => random));
		assert.deepStrictEqual({ initial: delays(1), capped: delays(10) }, {
			initial: [500, 750, 1000],
			capped: [15000, 22500, 30000],
		});
	});
});
