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
import { SSHHostKeyDeniedError } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { categorizeSSHConnectError } from '../../../../../common/sessionsTelemetry.js';
import { ManagedReconnectState } from '../../browser/managedReconnectAgentHostContribution.js';
import { disconnectSSHEntry, shouldPauseSSHReconnectAfterFailure, sshConnectionKey } from '../../browser/sshAgentHost.contribution.js';

suite('SSH reconnect state', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('manages retry timers and resets state', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new ManagedReconnectState());
			let firstFired = 0;
			let secondFired = 0;
			state.attempts = 7;
			state.paused = true;
			state.requiresUserInitiatedResume = true;
			state.scheduleRetry(5000, () => firstFired++);
			state.scheduleRetry(1000, () => secondFired++);

			state.resetForResume();
			assert.deepStrictEqual({
				attempts: state.attempts,
				paused: state.paused,
				requiresUserInitiatedResume: state.requiresUserInitiatedResume,
				hasPendingTimer: state.hasPendingTimer,
			}, {
				attempts: 0,
				paused: false,
				requiresUserInitiatedResume: false,
				hasPendingTimer: false,
			});

			await timeout(6000);
			assert.deepStrictEqual({ firstFired, secondFired }, { firstFired: 0, secondFired: 0 });
		});
	});

	test('clears a timer once it fires and on disposal', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new ManagedReconnectState());
			let fired = 0;
			state.scheduleRetry(1000, () => fired++);
			await timeout(1100);

			assert.deepStrictEqual({ fired, hasPendingTimer: state.hasPendingTimer }, { fired: 1, hasPendingTimer: false });

			state.scheduleRetry(1000, () => fired++);
			state.dispose();
			await timeout(2000);
			assert.strictEqual(fired, 1);
		});
	});

	test('requires explicit resume after host key denial', () => {
		const state = store.add(new ManagedReconnectState());
		state.attempts = 1;
		state.paused = true;
		state.requiresUserInitiatedResume = true;

		const automaticResume = state.resumeAutomatically();
		const afterAutomaticResume = {
			attempts: state.attempts,
			paused: state.paused,
			requiresUserInitiatedResume: state.requiresUserInitiatedResume,
		};
		state.resetForResume();

		assert.deepStrictEqual({
			automaticResume,
			afterAutomaticResume,
			afterExplicitResume: {
				attempts: state.attempts,
				paused: state.paused,
				requiresUserInitiatedResume: state.requiresUserInitiatedResume,
			},
		}, {
			automaticResume: false,
			afterAutomaticResume: {
				attempts: 1,
				paused: true,
				requiresUserInitiatedResume: true,
			},
			afterExplicitResume: {
				attempts: 0,
				paused: false,
				requiresUserInitiatedResume: false,
			},
		});
	});
});

suite('shouldPauseSSHReconnectAfterFailure', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('pauses reconnect after cancellation or host key denial but not after regular failures', () => {
		assert.deepStrictEqual({
			cancellation: shouldPauseSSHReconnectAfterFailure(new CancellationError()),
			hostKeyDenial: shouldPauseSSHReconnectAfterFailure(new SSHHostKeyDeniedError('test-host')),
			regularError: shouldPauseSSHReconnectAfterFailure(new Error('boom')),
		}, {
			cancellation: true,
			hostKeyDenial: true,
			regularError: false,
		});
	});
});

suite('categorizeSSHConnectError', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns bounded categories without logging error messages', () => {
		assert.deepStrictEqual({
			cancellation: categorizeSSHConnectError(new CancellationError()),
			hostKeyDenial: categorizeSSHConnectError(new SSHHostKeyDeniedError('test-host')),
			authentication: categorizeSSHConnectError(new Error('All configured authentication methods failed')),
			network: categorizeSSHConnectError(new Error('connect ETIMEDOUT')),
			other: categorizeSSHConnectError(new Error('remote setup failed')),
		}, {
			cancellation: 'cancelled',
			hostKeyDenial: 'hostKeyDenied',
			authentication: 'authentication',
			network: 'network',
			other: 'other',
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

	test('drops the persisted entry before tearing down the SSH tunnel', async () => {
		const calls: string[] = [];
		const connection = makeSSHConfigConnection();
		const disconnected = new DeferredPromise<void>();
		const remoteAgentHostService = {
			removeRemoteAgentHost: async (address: string) => {
				calls.push(`remove:${address}`);
			},
		};
		const sshService = {
			disconnect: async (key: string) => {
				calls.push(`ssh:${key}`);
				await disconnected.p;
			},
		};

		// `sshService.disconnect` is what removes the persisted entry. It has to
		// land first, or the teardown's own reconcile still sees the host as
		// desired and re-dials it.
		const pending = disconnectSSHEntry(connection, remoteAgentHostService, sshService);
		await timeout(0);
		assert.deepStrictEqual(calls, ['ssh:ssh:myserver']);

		disconnected.complete();
		await pending;
		assert.deepStrictEqual(calls, ['ssh:ssh:myserver', 'remove:localhost:4321']);
	});

	test('uses the SSH config host or host connection key on disconnect', async () => {
		const calls: string[] = [];
		await disconnectSSHEntry(
			makeSSHConfigConnection({ sshConfigHost: 'myserver' }),
			{ removeRemoteAgentHost: async () => { } },
			{ disconnect: async key => { calls.push(key); } },
		);
		await disconnectSSHEntry(
			{
				type: RemoteAgentHostEntryType.SSH,
				address: 'localhost:4321',
				hostName: 'myserver.example.com',
				user: 'me',
				port: 2222,
			},
			{ removeRemoteAgentHost: async () => { } },
			{ disconnect: async key => { calls.push(key); } },
		);
		assert.deepStrictEqual(calls, ['ssh:myserver', 'me@myserver.example.com:2222']);
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
