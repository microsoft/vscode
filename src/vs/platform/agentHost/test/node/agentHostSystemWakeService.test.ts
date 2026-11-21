/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { autorun } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { SCHEDULED_WORK_WAKE_NETWORK_CAP_MS, SCHEDULED_WORK_WAKE_SETTLE_MS } from '../../common/agentHostWakeNetworkMonitor.js';
import { AgentHostSystemWakeService } from '../../node/agentHostSystemWakeService.js';

class RecordingLogService extends NullLogService {
	readonly messages: string[] = [];
	private readonly _start = Date.now();

	override info(message: string): void {
		this.messages.push(`${Date.now() - this._start}: ${message}`);
	}
}

suite('AgentHostSystemWakeService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** Records when scheduled work readiness changes and what the service logs, in ms since creation. */
	function createService() {
		const log = new RecordingLogService();
		const service = store.add(new AgentHostSystemWakeService(log));
		const start = Date.now();
		const readiness: string[] = [];
		store.add(autorun(reader => {
			readiness.push(`${Date.now() - start}: ${service.isReadyForScheduledWork.read(reader) ? 'ready' : 'held'}`);
		}));
		return { service, readiness, logs: log.messages };
	}

	test('is ready without a wake, even when the network is reported offline', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, readiness, logs } = createService();

		service.setNetworkOnline(false);
		await timeout(SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		assert.deepStrictEqual({ readiness, logs }, { readiness: ['0: ready'], logs: [] });
	}));

	test('holds scheduled work while the network settles after a wake', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, readiness, logs } = createService();

		service.setFullyAwake(false);
		await timeout(1_000);
		service.setFullyAwake(true);
		await timeout(SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		assert.deepStrictEqual({ readiness, logs }, {
			readiness: ['0: ready', '0: held', '16000: ready'],
			logs: [
				'1000: [AgentHost] Scheduled work held after wake: reason=settling',
				'16000: [AgentHost] Scheduled work released after wake: reason=ready',
			],
		});
	}));

	test('holds scheduled work while the network is offline after settling, until it is back', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, readiness, logs } = createService();

		service.setFullyAwake(false);
		service.setFullyAwake(true);
		service.setNetworkOnline(false);
		await timeout(30_000);
		service.setNetworkOnline(true);
		await timeout(SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		assert.deepStrictEqual({ readiness, logs }, {
			readiness: ['0: ready', '0: held', '30000: ready'],
			logs: [
				'0: [AgentHost] Scheduled work held after wake: reason=settling',
				'15000: [AgentHost] Scheduled work held after wake: reason=offline',
				'30000: [AgentHost] Scheduled work released after wake: reason=ready',
			],
		});
	}));

	test('releases scheduled work at the cap when the network stays offline', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, readiness, logs } = createService();

		service.setFullyAwake(false);
		service.setFullyAwake(true);
		service.setNetworkOnline(false);
		await timeout(2 * SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		assert.deepStrictEqual({ readiness, logs }, {
			readiness: ['0: ready', '0: held', `${SCHEDULED_WORK_WAKE_NETWORK_CAP_MS}: ready`],
			logs: [
				'0: [AgentHost] Scheduled work held after wake: reason=settling',
				'15000: [AgentHost] Scheduled work held after wake: reason=offline',
				`${SCHEDULED_WORK_WAKE_NETWORK_CAP_MS}: [AgentHost] Scheduled work released after wake: reason=cap`,
			],
		});
	}));

	test('sleeping cancels the previous wake\'s settle delay and cap, and the next wake starts fresh ones', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, readiness, logs } = createService();

		service.setFullyAwake(false);
		service.setFullyAwake(true);
		service.setNetworkOnline(false);
		await timeout(5_000);
		service.setFullyAwake(false);
		await timeout(5_000);
		service.setFullyAwake(true);
		await timeout(2 * SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		const secondWake = 10_000;
		assert.deepStrictEqual({ readiness, logs }, {
			readiness: ['0: ready', '0: held', `${secondWake + SCHEDULED_WORK_WAKE_NETWORK_CAP_MS}: ready`],
			logs: [
				'0: [AgentHost] Scheduled work held after wake: reason=settling',
				`${secondWake}: [AgentHost] Scheduled work held after wake: reason=settling`,
				`${secondWake + SCHEDULED_WORK_WAKE_SETTLE_MS}: [AgentHost] Scheduled work held after wake: reason=offline`,
				`${secondWake + SCHEDULED_WORK_WAKE_NETWORK_CAP_MS}: [AgentHost] Scheduled work released after wake: reason=cap`,
			],
		});
	}));

	test('sleeping as the settle delay ends cancels the cap, and the next wake starts fresh delays', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, readiness, logs } = createService();

		service.setFullyAwake(false);
		service.setFullyAwake(true);
		service.setNetworkOnline(false);
		await timeout(SCHEDULED_WORK_WAKE_SETTLE_MS);
		service.setFullyAwake(false);
		await timeout(5_000);
		service.setFullyAwake(true);
		await timeout(2 * SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		const secondWake = SCHEDULED_WORK_WAKE_SETTLE_MS + 5_000;
		assert.deepStrictEqual({ readiness, logs }, {
			readiness: ['0: ready', '0: held', `${secondWake + SCHEDULED_WORK_WAKE_NETWORK_CAP_MS}: ready`],
			logs: [
				'0: [AgentHost] Scheduled work held after wake: reason=settling',
				`${SCHEDULED_WORK_WAKE_SETTLE_MS}: [AgentHost] Scheduled work held after wake: reason=offline`,
				`${secondWake}: [AgentHost] Scheduled work held after wake: reason=settling`,
				`${secondWake + SCHEDULED_WORK_WAKE_SETTLE_MS}: [AgentHost] Scheduled work held after wake: reason=offline`,
				`${secondWake + SCHEDULED_WORK_WAKE_NETWORK_CAP_MS}: [AgentHost] Scheduled work released after wake: reason=cap`,
			],
		});
	}));

	test('a repeated wake report does not restart the settle delay', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, readiness } = createService();

		service.setFullyAwake(false);
		service.setFullyAwake(true);
		await timeout(10_000);
		service.setFullyAwake(true);
		await timeout(SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		assert.deepStrictEqual(readiness, ['0: ready', '0: held', `${SCHEDULED_WORK_WAKE_SETTLE_MS}: ready`]);
	}));

	test('disposing the service while scheduled work is held cancels its timers', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, readiness } = createService();

		service.setFullyAwake(false);
		service.setFullyAwake(true);
		service.dispose();
		await timeout(SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		assert.deepStrictEqual(readiness, ['0: ready', '0: held']);
	}));
});
