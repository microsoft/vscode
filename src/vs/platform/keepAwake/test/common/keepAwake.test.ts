/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IKeepAwakeState, KeepAwake } from '../../common/keepAwake.js';

suite('KeepAwake', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(start: () => number = () => 1) {
		const calls: string[] = [];
		const policy = store.add(new KeepAwake({
			start: () => { calls.push('start'); return start(); },
			stop: id => calls.push(`stop:${id}`),
		}, () => calls.push('error')));
		return { policy, calls };
	}

	test('aggregates claims, acquires on enable and releases immediately on disable', () => {
		const { policy, calls } = create();
		policy.setClaim('window:1', true);
		assert.deepStrictEqual(calls, []);
		policy.configure(true, 0);
		policy.setClaim('window:2', true);
		policy.deleteClaim('window:1');
		assert.deepStrictEqual(policy.state, { enabled: true, active: true, inGrace: false, busySources: ['window:2'] });
		policy.configure(false, 0);
		policy.dispose();
		assert.deepStrictEqual(calls, ['start', 'stop:1']);
	});

	test('holds through grace exactly until the deadline and emits only changed state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { policy, calls } = create();
		const states: IKeepAwakeState[] = [];
		store.add(policy.onDidChangeState(state => states.push(state)));
		policy.configure(true, 1000);
		policy.setClaim('window:1', true);
		policy.setClaim('window:1', true);
		policy.deleteClaim('window:1');
		await timeout(999);
		assert.deepStrictEqual(calls, ['start']);
		await timeout(1);
		assert.deepStrictEqual({ calls, states }, {
			calls: ['start', 'stop:1'],
			states: [
				{ enabled: true, active: false, inGrace: false, busySources: [] },
				{ enabled: true, active: true, inGrace: false, busySources: ['window:1'] },
				{ enabled: true, active: true, inGrace: true, busySources: [] },
				{ enabled: true, active: false, inGrace: false, busySources: [] },
			],
		});
	}));

	test('resuming during grace retains the blocker and starts a fresh idle deadline', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { policy, calls } = create();
		policy.configure(true, 100);
		policy.setClaim('window:1', true);
		policy.setClaim('window:1', false);
		await timeout(50);
		policy.setClaim('agentHost', true);
		await timeout(100);
		policy.deleteClaim('agentHost');
		await timeout(99);
		assert.deepStrictEqual(calls, ['start']);
		await timeout(1);
		assert.deepStrictEqual(calls, ['start', 'stop:1']);
	}));

	for (const grace of [50, 200]) {
		test(`recomputes grace ${grace} from the original idle timestamp`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { policy, calls } = create();
			policy.configure(true, 100);
			policy.setClaim('window:1', true);
			policy.setClaim('window:1', false);
			await timeout(25);
			policy.configure(true, grace);
			await timeout(grace - 26);
			assert.deepStrictEqual(calls, ['start']);
			await timeout(1);
			assert.deepStrictEqual(calls, ['start', 'stop:1']);
		}));
	}

	test('disable cancels grace without reacquiring', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { policy, calls } = create();
		policy.configure(true, 100);
		policy.setClaim('window:1', true);
		policy.setClaim('window:1', false);
		policy.configure(false, 100);
		policy.configure(true, 100);
		await timeout(200);
		assert.deepStrictEqual(calls, ['start', 'stop:1']);
	}));

	test('failed acquisition retries only after configuration changes', () => {
		for (const invalid of [false, true]) {
			const { policy, calls } = create(() => {
				if (invalid) {
					return -1;
				}
				throw new Error('test failure');
			});
			policy.configure(true, 0);
			policy.setClaim('window:1', true);
			policy.setClaim('window:2', true);
			policy.setClaim('window:1', false);
			policy.configure(true, 0);
			assert.deepStrictEqual(calls, ['start', 'error']);
			policy.configure(true, 100);
			policy.dispose();
			assert.deepStrictEqual(calls, ['start', 'error', 'start', 'error']);
		}
	});

	test('zero grace and disposal each stop a held blocker once', () => {
		const { policy, calls } = create();
		policy.configure(true, 0);
		policy.setClaim('window:1', true);
		policy.setClaim('window:1', false);
		policy.setClaim('window:1', true);
		policy.dispose();
		policy.dispose();
		assert.deepStrictEqual(calls, ['start', 'stop:1', 'start', 'stop:1']);
	});
});
