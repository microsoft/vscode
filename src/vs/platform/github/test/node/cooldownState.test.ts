/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CooldownState } from '../../common/cooldownState.js';
import { BootstrapAccount } from '../../common/types.js';
import { FakeScheduler } from './fakeScheduler.js';

suite('Cooldown state', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const account = { host: 'api.example.test', accountId: 'first' };

	test('keeps the longest wait and isolates account and resource state', () => {
		const scheduler = store.add(new FakeScheduler());
		const state = store.add(new CooldownState(scheduler));
		state.updateCooldown(account, 'core', 2000);
		state.updateCooldown(account, 'core', 1000);
		scheduler.advanceBy(500);
		assert.deepStrictEqual({
			core: state.getDelay(account, 'core'), search: state.getDelay(account, 'search'),
			other: state.getDelay({ ...account, accountId: 'second' }, 'core'),
		}, { core: 1500, search: 0, other: 0 });
	});

	test('the last owner schedules cleanup after all resource waits expire', () => {
		const scheduler = store.add(new FakeScheduler());
		const state = store.add(new CooldownState(scheduler));
		const first = {};
		const second = {};
		state.retainAccount(account, first);
		state.retainAccount(account, first);
		state.retainAccount(account, second);
		state.updateCooldown(account, 'core', 1000);
		state.updateCooldown(account, 'search', 2000);
		state.releaseAccount(account, first);
		assert.strictEqual(scheduler.pendingCount, 0);
		state.releaseAccount(account, second);
		scheduler.advanceBy(1999);
		assert.strictEqual(state.getDelay(account, 'search'), 1);
		scheduler.advanceBy(1);
		assert.deepStrictEqual({
			core: state.getState(account, 'core'), search: state.getState(account, 'search'), timers: scheduler.pendingCount,
		}, { core: undefined, search: undefined, timers: 0 });
	});

	test('retaining an inactive account cancels cleanup without erasing its cooldown', () => {
		const scheduler = store.add(new FakeScheduler());
		const state = store.add(new CooldownState(scheduler));
		const owner = {};
		state.updateCooldown(account, 'core', 1000);
		state.releaseAccount(account);
		state.retainAccount(account, owner);
		assert.deepStrictEqual({ timers: scheduler.pendingCount, delay: state.getDelay(account, 'core') }, { timers: 0, delay: 1000 });
		scheduler.advanceBy(1000);
		assert.ok(state.getState(account, 'core'));
		state.releaseAccount(account, owner);
		assert.strictEqual(state.getState(account, 'core'), undefined);
	});

	test('preserved cooldowns for unowned accounts expire without another release', () => {
		const scheduler = store.add(new FakeScheduler());
		const state = store.add(new CooldownState(scheduler));
		state.preserveCooldown(account, 'core', 1000);
		state.preserveCooldown(account, 'core', 500);
		scheduler.advanceBy(999);
		assert.strictEqual(state.getDelay(account, 'core'), 1);
		scheduler.advanceBy(1);
		assert.deepStrictEqual({ state: state.getState(account, 'core'), timers: scheduler.pendingCount }, { state: undefined, timers: 0 });
	});

	test('known bootstrap accounts continue to honor unresolved-origin waits', () => {
		const scheduler = store.add(new FakeScheduler());
		const state = store.add(new CooldownState(scheduler));
		const unknown: BootstrapAccount = { kind: 'bootstrap', host: account.host, origin: 'https://api.example.test' };
		state.updateCooldown(unknown, 'core', 2000);
		state.updateCooldown({ ...unknown, accountId: account.accountId }, 'core', 1000);
		assert.deepStrictEqual({
			known: state.getDelay({ ...unknown, accountId: account.accountId }, 'core'),
			otherOrigin: state.getDelay({ ...unknown, origin: 'https://other.example.test', host: 'other.example.test' }, 'core'),
			anonymous: state.getDelay({ ...unknown, kind: 'anonymous' }, 'core'),
		}, { known: 2000, otherOrigin: 0, anonymous: 0 });
	});

	test('cancelling a waiter releases its timer without clearing the server wait', async () => {
		const scheduler = store.add(new FakeScheduler());
		const state = store.add(new CooldownState(scheduler));
		const controller = new AbortController();
		state.updateCooldown(account, 'core', 1000);
		const waiting = state.wait(account, 'core', controller.signal);
		const reason = new Error('Cancelled waiter');
		controller.abort(reason);
		await assert.rejects(waiting, error => error === reason);
		assert.deepStrictEqual({ delay: state.getDelay(account, 'core'), timers: scheduler.pendingCount }, { delay: 1000, timers: 0 });
	});

	test('many inactive accounts share one expiry timer and release all quota state', () => {
		const scheduler = store.add(new FakeScheduler());
		const state = store.add(new CooldownState(scheduler));
		const accounts = Array.from({ length: 100 }, (_, i) => ({ ...account, accountId: String(i) }));
		for (const inactive of accounts) {
			state.updateCooldown(inactive, 'core', 1000);
			state.releaseAccount(inactive);
		}
		const cleanupTimers = scheduler.pendingCount;
		scheduler.advanceBy(1000);
		assert.deepStrictEqual({
			cleanupTimers,
			retained: accounts.filter(inactive => state.getState(inactive, 'core') !== undefined).length,
			timers: scheduler.pendingCount,
		}, { cleanupTimers: 1, retained: 0, timers: 0 });
	});

	test('explicit clearing and disposal reclaim state and scheduled cleanup', () => {
		const scheduler = store.add(new FakeScheduler());
		const state = store.add(new CooldownState(scheduler));
		let changes = 0;
		store.add(state.onDidChange(() => changes++));
		state.preserveCooldown(account, 'core', 1000);
		state.clearAccount(account);
		assert.deepStrictEqual({ changes, state: state.getState(account, 'core'), timers: scheduler.pendingCount }, {
			changes: 2, state: undefined, timers: 0,
		});
		state.preserveCooldown(account, 'core', 1000);
		state.dispose();
		assert.deepStrictEqual({ state: state.getState(account, 'core'), timers: scheduler.pendingCount }, { state: undefined, timers: 0 });
	});
});
