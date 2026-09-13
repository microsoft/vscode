/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { raceTimeout, timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_HOST_SHUTDOWN_PHASE_TIMEOUT_MS, AGENT_HOST_SHUTDOWN_TIMEOUT_MS, flushAgentHostPersistenceBeforeShutdown, shutdownAgentHostBeforeDispose } from '../../node/agentHostShutdown.js';
import { getServerShutdownTimeout } from './serverIntegrationTestHelpers.js';

suite('AgentHostShutdown', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a failed persistence flush does not reject shutdown', async () => {
		const succeeded = await flushAgentHostPersistenceBeforeShutdown(
			[Promise.reject(new Error('storage unavailable'))],
			3000,
			new NullLogService(),
		);
		assert.strictEqual(succeeded, false);
	});

	test('providers shut down before persistence is flushed', async () => {
		const steps: string[] = [];

		const succeeded = await shutdownAgentHostBeforeDispose(
			async () => {
				steps.push('protocol drain');
			},
			async () => {
				steps.push('provider shutdown');
			},
			() => {
				steps.push('persistence flush');
				return [Promise.resolve()];
			},
			3000,
			new NullLogService(),
		);

		assert.deepStrictEqual({ succeeded, steps }, { succeeded: true, steps: ['protocol drain', 'provider shutdown', 'persistence flush'] });
	});

	test('a failed provider shutdown still flushes persistence', async () => {
		let persistenceFlushed = false;

		const succeeded = await shutdownAgentHostBeforeDispose(
			() => Promise.resolve(),
			() => Promise.reject(new Error('provider unavailable')),
			() => {
				persistenceFlushed = true;
				return [Promise.resolve()];
			},
			3000,
			new NullLogService(),
		);

		assert.deepStrictEqual({ succeeded, persistenceFlushed }, { succeeded: false, persistenceFlushed: true });
	});

	test('a stalled protocol drain cannot skip provider shutdown', async () => {
		const steps: string[] = [];
		const succeeded = await shutdownAgentHostBeforeDispose(
			() => new Promise<void>(() => { }),
			async () => { steps.push('provider shutdown'); },
			() => {
				steps.push('persistence flush');
				return [];
			},
			1,
			new NullLogService(),
		);
		assert.deepStrictEqual({ succeeded, steps }, { succeeded: false, steps: ['provider shutdown', 'persistence flush'] });
	});

	test('the local server timeout covers every shutdown phase plus cleanup margin', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const phaseDuration = AGENT_HOST_SHUTDOWN_PHASE_TIMEOUT_MS - 1;
		const started = Date.now();
		const shutdown = shutdownAgentHostBeforeDispose(
			() => timeout(phaseDuration),
			() => timeout(phaseDuration),
			() => [timeout(phaseDuration)],
			AGENT_HOST_SHUTDOWN_PHASE_TIMEOUT_MS,
			new NullLogService(),
		);
		const succeeded = await raceTimeout(shutdown, getServerShutdownTimeout(false));
		assert.deepStrictEqual({
			succeeded,
			elapsed: Date.now() - started,
			localTimeout: getServerShutdownTimeout(false),
			extendedTimeout: getServerShutdownTimeout(true),
		}, {
			succeeded: true,
			elapsed: 3 * phaseDuration,
			localTimeout: AGENT_HOST_SHUTDOWN_TIMEOUT_MS + 2_000,
			extendedTimeout: Math.max(30_000, AGENT_HOST_SHUTDOWN_TIMEOUT_MS + 2_000),
		});
	}));
});
