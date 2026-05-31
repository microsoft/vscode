/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostSSHConnection, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { disconnectSSHEntry, shouldPauseSSHReconnectAfterFailure, sshConnectionKey, SSHReconnectState } from '../../browser/remoteAgentHost.contribution.js';

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

suite('shouldPauseSSHReconnectAfterFailure', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('pauses reconnect after cancellation but not after regular failures', () => {
		assert.deepStrictEqual({
			cancellation: shouldPauseSSHReconnectAfterFailure(new CancellationError()),
			regularError: shouldPauseSSHReconnectAfterFailure(new Error('boom')),
		}, {
			cancellation: true,
			regularError: false,
		});
	});
});

suite('disconnectSSHEntry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function makeSSHConfigConnection(overrides: Partial<IRemoteAgentHostSSHConnection> = {}): IRemoteAgentHostSSHConnection {
		return {
			type: RemoteAgentHostEntryType.SSH,
			address: 'localhost:4321',
			sshConfigHost: 'myserver',
			hostName: 'myserver.example.com',
			...overrides,
		};
	}

	test('removes the entry from configured storage BEFORE tearing down the SSH tunnel', async () => {
		// Regression guard for the X-button picker fix. `_sshService.disconnect`
		// fires `onDidChangeConnections` synchronously, which the contribution
		// translates into `_reconcile` → `_reconnectSSHEntries`. If the entry
		// is still in configured storage at that point, the auto-reconnect
		// path immediately reconnects the host we just told it to disconnect
		// (and on the next window reload, the persisted entry reconnects too).
		const calls: string[] = [];
		const connection = makeSSHConfigConnection();

		// Block removeRemoteAgentHost so we can prove disconnect waits for it.
		const removed = new DeferredPromise<void>();

		const remoteAgentHostService = {
			removeRemoteAgentHost: async (address: string) => {
				calls.push(`remove:${address}`);
				await removed.p;
			},
		};
		const sshService = {
			disconnect: async (key: string) => {
				calls.push(`ssh:${key}`);
			},
		};

		const pending = disconnectSSHEntry(connection, remoteAgentHostService, sshService);

		// Give microtasks a chance to drain. ssh disconnect must NOT have run yet
		// because removeRemoteAgentHost is still pending.
		await timeout(0);
		assert.deepStrictEqual(calls, ['remove:localhost:4321']);

		removed.complete();
		await pending;

		assert.deepStrictEqual(calls, ['remove:localhost:4321', 'ssh:ssh:myserver']);
	});

	test('uses sshConfigHost-based key when sshConfigHost is set', async () => {
		const calls: string[] = [];
		await disconnectSSHEntry(
			makeSSHConfigConnection({ sshConfigHost: 'myserver' }),
			{ removeRemoteAgentHost: async () => { /* noop */ } },
			{ disconnect: async (key: string) => { calls.push(key); } },
		);
		assert.deepStrictEqual(calls, ['ssh:myserver']);
	});

	test('uses user@host:port key when sshConfigHost is not set', async () => {
		const calls: string[] = [];
		await disconnectSSHEntry(
			{
				type: RemoteAgentHostEntryType.SSH,
				address: 'localhost:4321',
				hostName: 'myserver.example.com',
				user: 'me',
				port: 2222,
			},
			{ removeRemoteAgentHost: async () => { /* noop */ } },
			{ disconnect: async (key: string) => { calls.push(key); } },
		);
		assert.deepStrictEqual(calls, ['me@myserver.example.com:2222']);
	});
});

suite('sshConnectionKey', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches the keys the SSH service stores connections under', () => {
		assert.deepStrictEqual({
			configHost: sshConnectionKey({
				type: RemoteAgentHostEntryType.SSH,
				address: 'localhost:4321',
				sshConfigHost: 'myserver',
				hostName: 'ignored',
			}),
			userHostPort: sshConnectionKey({
				type: RemoteAgentHostEntryType.SSH,
				address: 'localhost:4321',
				hostName: 'myserver.example.com',
				user: 'me',
				port: 2222,
			}),
			hostOnly: sshConnectionKey({
				type: RemoteAgentHostEntryType.SSH,
				address: 'localhost:4321',
				hostName: 'myserver.example.com',
			}),
		}, {
			configHost: 'ssh:myserver',
			userHostPort: 'me@myserver.example.com:2222',
			hostOnly: 'myserver.example.com@myserver.example.com:22',
		});
	});
});
