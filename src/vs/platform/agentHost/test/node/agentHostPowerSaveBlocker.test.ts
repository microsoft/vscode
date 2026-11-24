/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess, execFile } from 'child_process';
import { PassThrough } from 'stream';
import { promisify } from 'util';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostPowerSaveBlocker, isOnBatteryPowerFromLinuxSupplies, startNativePowerSaveBlocker } from '../../node/agentHostPowerSaveBlocker.js';

async function runNativeHelper(waitForReady: boolean): Promise<{ code: number | null; stdout: string; stderr: string }> {
	const child = startNativePowerSaveBlocker(true);
	let stdout = '';
	let stderr = '';
	let exited = false;
	child.stdout?.on('data', data => {
		stdout += data.toString();
		if (waitForReady && stdout.includes('ready')) {
			child.stdin?.end();
		}
	});
	child.stderr?.on('data', data => stderr += data.toString());
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const code = await new Promise<number | null>((resolve, reject) => {
			child.once('error', reject);
			child.once('close', code => {
				exited = true;
				resolve(code);
			});
			timer = setTimeout(() => reject(new Error(`Native inhibitor did not exit: ${stderr}`)), 10_000);
			if (!waitForReady) {
				child.stdin?.end();
			}
		});
		return { code, stdout, stderr };
	} finally {
		clearTimeout(timer);
		child.stdin?.end();
		if (!exited) {
			child.kill();
		}
	}
}

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

	test('Linux power detection trusts line-power readings and treats unconfirmed power conservatively', () => {
		assert.deepStrictEqual([
			isOnBatteryPowerFromLinuxSupplies([{ type: 'Mains', online: '1' }]),
			isOnBatteryPowerFromLinuxSupplies([{ type: 'Mains', online: '1' }, { type: 'Battery', status: 'Unknown' }]),
			isOnBatteryPowerFromLinuxSupplies([{ type: 'USB_C', online: '0' }, { type: 'Battery', status: 'Full' }]),
			isOnBatteryPowerFromLinuxSupplies([{ type: 'Battery', status: 'Discharging' }]),
		], [false, false, true, true]);
		for (const status of ['Unknown', 'Full', 'Not charging']) {
			assert.throws(() => isOnBatteryPowerFromLinuxSupplies([{ type: 'Battery', status }]), /Power source is unknown/);
		}
		assert.throws(() => isOnBatteryPowerFromLinuxSupplies([{ type: 'Battery', scope: 'Device', status: 'Discharging' }]), /Power source is unknown/);
		assert.throws(() => isOnBatteryPowerFromLinuxSupplies([]), /Power source is unknown/);
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

	(isLinux ? test : test.skip)('native Linux launcher uses arguments accepted by installed systemd', async function () {
		this.timeout(15_000);
		try {
			await promisify(execFile)('systemd-inhibit', ['--version'], { timeout: 5000 });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				this.skip();
			}
			throw error;
		}
		const result = await runNativeHelper(false);
		assert.doesNotMatch(result.stderr, /unrecognized option|unknown option|invalid option/i);
		if (result.code !== 0) {
			// CI containers may have the command but no system bus or permission to inhibit.
			assert.match(result.stderr, /Failed to (connect|inhibit)|Access denied|Interactive authentication required/i);
		}
	});

	(isWindows ? test : test.skip)('native Windows helper acquires a request and releases it on stdin EOF', async function () {
		this.timeout(15_000);
		const result = await runNativeHelper(true);
		assert.strictEqual(result.code, 0, result.stderr);
		assert.match(result.stdout, /ready/);
		assert.strictEqual(result.stderr, '');
	});
});
