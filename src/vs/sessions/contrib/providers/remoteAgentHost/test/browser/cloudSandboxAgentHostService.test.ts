/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { credentialRefreshDelayMs } from '../../browser/cloudSandboxAgentHostService.js';

suite('credentialRefreshDelayMs', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const now = Date.parse('2026-01-01T00:00:00Z');
	const inMinutes = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

	test('schedules a refresh one minute before expiry, clamped to the supported range', () => {
		assert.deepStrictEqual(
			{
				typicalToken: credentialRefreshDelayMs(inMinutes(40), now),
				beyondCeiling: credentialRefreshDelayMs(inMinutes(24 * 60), now),
				dueImminently: credentialRefreshDelayMs(inMinutes(1), now),
				alreadyExpired: credentialRefreshDelayMs(inMinutes(-30), now),
			},
			{
				typicalToken: 39 * 60_000,
				beyondCeiling: 55 * 60_000,
				// Never faster than the floor: a token that always looks due would otherwise
				// re-mint on every tick, and each mint asks Mission Control to resume a sandbox.
				dueImminently: 30_000,
				alreadyExpired: 30_000,
			},
		);
	});

	test('reports no schedule when expiry is missing or unparseable', () => {
		assert.deepStrictEqual(
			[
				credentialRefreshDelayMs(undefined, now),
				credentialRefreshDelayMs('', now),
				credentialRefreshDelayMs('not-a-date', now),
			],
			[undefined, undefined, undefined],
		);
	});
});
