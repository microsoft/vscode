/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { toAgentHostPowerSaveBlockerMessage } from '../../common/agentHostPowerSaveBlocker.js';
import { AgentHostElectronPowerSaveBlocker } from '../../electron-main/agentHostPowerSaveBlocker.js';

suite('AgentHostElectronPowerSaveBlocker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let onBattery: boolean;
	let probes: number;
	let starts: number;
	let stops: number;
	let batteryChanged: Emitter<boolean>;

	function createBlocker(supportsBatteryPower = true): AgentHostElectronPowerSaveBlocker {
		return disposables.add(new AgentHostElectronPowerSaveBlocker(new NullLogService(), {
			supportsBatteryPower,
			onDidChangeOnBatteryPower: batteryChanged.event,
			isOnBatteryPower: () => {
				probes++;
				return onBattery;
			},
			createPowerSaveBlocker: () => {
				starts++;
				return toDisposable(() => stops++);
			},
		}));
	}

	setup(() => {
		onBattery = false;
		probes = 0;
		starts = 0;
		stops = 0;
		batteryChanged = disposables.add(new Emitter<boolean>());
	});

	test('acquires on AC, follows battery changes, and releases on request', () => {
		const blocker = createBlocker();
		blocker.handleMessage(toAgentHostPowerSaveBlockerMessage({ kind: 'acquire', allowOnBattery: false }));
		onBattery = true;
		batteryChanged.fire(true);
		onBattery = false;
		batteryChanged.fire(false);
		blocker.handleMessage(toAgentHostPowerSaveBlockerMessage({ kind: 'release' }));
		batteryChanged.fire(true);
		assert.deepStrictEqual({ probes, starts, stops }, { probes: 3, starts: 2, stops: 2 });
	});

	test('allows battery power without probing and ignores invalid messages', () => {
		onBattery = true;
		const blocker = createBlocker();
		blocker.handleMessage(toAgentHostPowerSaveBlockerMessage({ kind: 'acquire', allowOnBattery: true }));
		blocker.handleMessage({ type: 'invalid' });
		assert.deepStrictEqual({ probes, starts, stops }, { probes: 0, starts: 1, stops: 0 });
	});

	test('releases an unconditional hold when switching to plugged-in only without power source support', () => {
		const blocker = createBlocker(false);
		blocker.handleMessage(toAgentHostPowerSaveBlockerMessage({ kind: 'acquire', allowOnBattery: true }));
		blocker.handleMessage(toAgentHostPowerSaveBlockerMessage({ kind: 'acquire', allowOnBattery: false }));
		batteryChanged.fire(false);
		assert.deepStrictEqual({ probes, starts, stops }, { probes: 0, starts: 1, stops: 1 });
	});
});
