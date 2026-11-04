/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { AgentHostWakeNetworkMonitor, SCHEDULED_WORK_WAKE_NETWORK_CAP_MS } from '../../common/agentHostWakeNetworkMonitor.js';

suite('AgentHostWakeNetworkMonitor', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** Records when the monitor checks the network and what it reports, in ms since creation. */
	function createMonitor(isOnlineAt: (elapsed: number) => boolean) {
		const start = Date.now();
		const checks: number[] = [];
		const reports: string[] = [];
		const monitor = store.add(new AgentHostWakeNetworkMonitor(() => {
			const elapsed = Date.now() - start;
			checks.push(elapsed);
			return isOnlineAt(elapsed);
		}, online => reports.push(`${Date.now() - start}: ${online ? 'online' : 'offline'}`)));
		return { monitor, checks, reports };
	}

	test('checks once at wake and does not poll while the network is online', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { monitor, checks, reports } = createMonitor(() => true);

		monitor.handleWake();
		await timeout(10_000);

		assert.deepStrictEqual({ checks, reports, isOnline: monitor.isOnline }, { checks: [0], reports: [], isOnline: true });
	}));

	test('polls while the network is offline after a wake and reports when it is back', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { monitor, checks, reports } = createMonitor(elapsed => elapsed >= 3_000);

		monitor.handleWake();
		await timeout(10_000);

		assert.deepStrictEqual({ checks, reports, isOnline: monitor.isOnline }, {
			checks: [0, 1_000, 2_000, 3_000],
			reports: ['0: offline', '3000: online'],
			isOnline: true,
		});
	}));

	test('stops polling at the cap while the network stays offline', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 500 }, async () => {
		const { monitor, checks, reports } = createMonitor(() => false);

		monitor.handleWake();
		await timeout(2 * SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		assert.deepStrictEqual({ checkCount: checks.length, lastCheck: checks.at(-1), reports, isOnline: monitor.isOnline }, {
			checkCount: SCHEDULED_WORK_WAKE_NETWORK_CAP_MS / 1_000,
			lastCheck: SCHEDULED_WORK_WAKE_NETWORK_CAP_MS - 1_000,
			reports: ['0: offline'],
			isOnline: false,
		});
	}));

	test('stops polling on sleep, and checks again on the next wake', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { monitor, checks, reports } = createMonitor(elapsed => elapsed >= 15_000);

		monitor.handleWake();
		await timeout(2_500);
		monitor.handleSleep();
		await timeout(10_000);
		monitor.handleWake();
		await timeout(10_000);

		assert.deepStrictEqual({ checks, reports, isOnline: monitor.isOnline }, {
			checks: [0, 1_000, 2_000, 12_500, 13_500, 14_500, 15_500],
			reports: ['0: offline', '15500: online'],
			isOnline: true,
		});
	}));

	test('stops polling when disposed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { monitor, checks, reports } = createMonitor(() => false);

		monitor.handleWake();
		await timeout(2_500);
		monitor.dispose();
		await timeout(SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		assert.deepStrictEqual({ checks, reports }, { checks: [0, 1_000, 2_000], reports: ['0: offline'] });
	}));
});
