/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess } from 'child_process';
import { PassThrough } from 'stream';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostPowerSaveBlocker } from '../../node/agentHostPowerSaveBlocker.js';

suite('AgentHostPowerSaveBlocker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let children: ChildProcess[];
	let onBattery: boolean;
	let warnings: string[];
	let log: NullLogService;

	function start(allowOnBattery = false, powerSource = async () => onBattery, killOnDispose = false): AgentHostPowerSaveBlocker {
		return disposables.add(new AgentHostPowerSaveBlocker(allowOnBattery, log, {
			isOnBatteryPower: powerSource,
			killOnDispose,
			start: () => {
				const child = new ChildProcess();
				child.stdin = new PassThrough();
				child.stderr = new PassThrough();
				children.push(child);
				return child;
			},
		}));
	}

	setup(() => {
		children = [];
		onBattery = false;
		warnings = [];
		log = new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		}();
	});

	test('changes the hold with the host power source and closes stdin on disposal', async () => {
		await runWithFakedTimers({}, async () => {
			const blocker = start();
			await timeout(0);
			assert.strictEqual(children.length, 1);
			onBattery = true;
			await timeout(30_000);
			assert.strictEqual(children[0].stdin!.writableEnded, true);
			onBattery = false;
			await timeout(30_000);
			assert.strictEqual(children.length, 2);
			blocker.dispose();
			assert.strictEqual(children[1].stdin!.writableEnded, true);
			await timeout(60_000);
			assert.strictEqual(children.length, 2);
		});
	});

	test('allowing battery power skips power-source probes', () => {
		let probes = 0;
		start(true, async () => {
			probes++;
			throw new Error('No power monitor');
		});
		assert.strictEqual(children.length, 1);
		assert.strictEqual(probes, 0);
		assert.deepStrictEqual(warnings, []);
	});

	test('a power-source result arriving after disposal never launches a helper', async () => {
		const pending = new DeferredPromise<boolean>();
		const blocker = start(false, () => pending.p);
		blocker.dispose();
		await pending.complete(false);
		assert.strictEqual(children.length, 0);
	});

	test('unknown power sources release the hold, log, and retry instead of assuming AC', async () => {
		await runWithFakedTimers({}, async () => {
			let failed = false;
			start(false, async () => {
				if (failed) {
					throw new Error('Unavailable');
				}
				return false;
			});
			await timeout(0);
			failed = true;
			await timeout(30_000);
			assert.strictEqual(children[0].stdin!.writableEnded, true);
			assert.strictEqual(warnings.length, 1);
			failed = false;
			await timeout(30_000);
			assert.strictEqual(children.length, 2);
		});
	});

	test('a failed or unexpectedly exited helper logs and is retried while work continues', async () => {
		await runWithFakedTimers({}, async () => {
			start(true);
			children[0].emit('error', new Error('ENOENT'));
			children[0].emit('close', -2, null);
			assert.ok(warnings.some(message => message.includes('Failed to start')));
			await timeout(30_000);
			assert.strictEqual(children.length, 2);
			children[1].emit('close', 1, null);
			await timeout(30_000);
			assert.strictEqual(children.length, 3);
		});
	});

	test('a late exit from a released helper cannot clear its replacement', async () => {
		await runWithFakedTimers({}, async () => {
			start();
			await timeout(0);
			onBattery = true;
			await timeout(30_000);
			onBattery = false;
			await timeout(30_000);
			children[0].emit('close', 0, null);
			assert.strictEqual(children[1].stdin!.writableEnded, false);
			await timeout(30_000);
			assert.strictEqual(children.length, 2);
		});
	});

	test('kills helpers that do not monitor stdin when disposed', () => {
		const blocker = start(true, undefined, true);
		let kills = 0;
		children[0].kill = () => { kills++; return true; };
		blocker.dispose();
		assert.strictEqual(kills, 1);
	});
});
