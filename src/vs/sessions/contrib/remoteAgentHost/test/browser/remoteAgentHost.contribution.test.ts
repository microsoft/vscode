/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SSHReconnectState } from '../../browser/remoteAgentHost.contribution.js';

suite('SSHReconnectState', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('scheduleRetry fires the handler after the requested delay', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new SSHReconnectState());
			let fired = 0;
			state.scheduleRetry(1000, () => fired++);

			assert.strictEqual(state.hasPendingTimer, true);
			await timeout(500);
			assert.strictEqual(fired, 0);
			await timeout(600);
			assert.strictEqual(fired, 1);
		});
	});

	test('hasPendingTimer becomes false once the handler has run', async () => {
		// Regression guard for the PR-feedback fix: the timer disposable must
		// be cleared inside scheduleRetry's tick so that observers that check
		// hasPendingTimer after the handler runs see the right value.
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new SSHReconnectState());
			state.scheduleRetry(1000, () => { /* no follow-up */ });
			await timeout(1100);
			assert.strictEqual(state.hasPendingTimer, false, 'timer should be cleared after firing');
		});
	});

	test('cancelTimer prevents the handler from firing', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new SSHReconnectState());
			let fired = 0;
			state.scheduleRetry(1000, () => fired++);
			state.cancelTimer();
			assert.strictEqual(state.hasPendingTimer, false);
			await timeout(2000);
			assert.strictEqual(fired, 0);
		});
	});

	test('scheduling a second retry replaces the first', async () => {
		// MutableDisposable contract: assigning a new value disposes the old.
		// If two retries were scheduled simultaneously the contribution would
		// double-fire reconnect attempts and inflate the attempt counter.
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new SSHReconnectState());
			let firstFired = 0;
			let secondFired = 0;
			state.scheduleRetry(5000, () => firstFired++);
			state.scheduleRetry(1000, () => secondFired++);
			await timeout(6000);
			assert.strictEqual(firstFired, 0, 'replaced timer must not fire');
			assert.strictEqual(secondFired, 1);
		});
	});

	test('disposing the state cancels a pending retry timer', async () => {
		// This is the safety net for the DisposableMap that owns these states:
		// when the contribution is disposed (or a host is removed) the entry's
		// pending timer must be cancelled so we don't fire reconnect attempts
		// against torn-down services.
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = new SSHReconnectState();
			let fired = 0;
			state.scheduleRetry(1000, () => fired++);
			state.dispose();
			await timeout(2000);
			assert.strictEqual(fired, 0);
		});
	});

	test('resetForResume clears the timer and zeros attempts/paused state', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new SSHReconnectState());
			let fired = 0;
			state.attempts = 7;
			state.paused = true;
			state.scheduleRetry(1000, () => fired++);

			state.resetForResume();
			assert.strictEqual(state.attempts, 0);
			assert.strictEqual(state.paused, false);
			assert.strictEqual(state.hasPendingTimer, false);

			await timeout(2000);
			assert.strictEqual(fired, 0, 'pending retry must be cancelled by resetForResume');
		});
	});
});
