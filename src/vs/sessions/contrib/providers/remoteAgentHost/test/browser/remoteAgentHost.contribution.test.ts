/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { AgentHostAuthenticationRecovery, AgentHostAuthTokenCache } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IRemoteAgentHostSSHConnection, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { SSHHostKeyDeniedError } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { AuthRequiredReason, NotificationType, type INotification } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { categorizeSSHConnectError } from '../../../../../common/sessionsTelemetry.js';
import { disconnectSSHEntry, RemoteAgentHostContribution, shouldPauseSSHReconnectAfterFailure, sshConnectionKey, SSHReconnectState } from '../../browser/remoteAgentHost.contribution.js';

interface IRemoteAuthNotificationHarness {
	_connections: Map<string, { readonly authTokenCache: AgentHostAuthTokenCache; readonly authRecovery: AgentHostAuthenticationRecovery }>;
	_sessionsProvidersService: { getProvider(): undefined };
	_instantiationService: TestInstantiationService;
	_connectionCustomizations: { get(address: string): { readonly authenticate?: (request: { readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }) => Promise<{ readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }> } | undefined };
	_logService: NullLogService;
	_handleAuthenticationRequiredNotification(address: string, connection: Pick<IAgentConnection, 'authenticate'>, notification: INotification): void;
}

suite('RemoteAgentHost auth notifications', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resends the current token for an expired notification resource that is not advertised by root agents', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, {
			getOrActivateProviderIdForServer: async () => 'test-provider',
			getSessions: async () => [{
				id: 'session-id',
				account: { id: 'account-id', label: 'Test Account' },
				scopes: ['session:read'],
				accessToken: 'session-token',
			}],
		});
		const logService = new NullLogService();
		instantiationService.stub(ILogService, logService);
		const authenticateCalls: Array<{ readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }> = [];
		const connection = {
			authenticate: async (params: { readonly resource: string; readonly scopes?: readonly string[]; readonly token: string }) => {
				authenticateCalls.push(params);
				return { authenticated: true };
			},
		};
		const address = 'test-host';
		const contribution = Object.create(RemoteAgentHostContribution.prototype) as IRemoteAuthNotificationHarness;
		contribution._connections = new Map([[address, { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }]]);
		contribution._sessionsProvidersService = { getProvider: () => undefined };
		contribution._instantiationService = instantiationService;
		contribution._connectionCustomizations = { get: () => undefined };
		contribution._logService = logService;
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com/session',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['session:read'],
		};
		const notification: INotification = {
			type: NotificationType.AuthRequired,
			channel: 'ahp-root://',
			resource,
			reason: AuthRequiredReason.Expired,
		};

		contribution._handleAuthenticationRequiredNotification(address, connection, notification);
		await timeout(0);

		assert.deepStrictEqual(authenticateCalls, [{
			resource: 'https://api.example.com/session',
			scopes: ['session:read'],
			token: 'session-token',
		}]);
	});

	test('reauthenticates each host independently with the same current token', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, {
			getOrActivateProviderIdForServer: async () => 'test-provider',
			getSessions: async () => [{ id: 'session-id', account: { id: 'account-id', label: 'Test Account' }, scopes: ['session:read'], accessToken: 'session-token' }],
		});
		instantiationService.stub(ILogService, new NullLogService());
		const calls: string[] = [];
		const contribution = Object.create(RemoteAgentHostContribution.prototype) as IRemoteAuthNotificationHarness;
		contribution._connections = new Map([
			['host-one', { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }],
			['host-two', { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }],
		]);
		contribution._sessionsProvidersService = { getProvider: () => undefined };
		contribution._instantiationService = instantiationService;
		contribution._connectionCustomizations = { get: () => undefined };
		contribution._logService = new NullLogService();
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com/session',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['session:read'],
		};
		const notification: INotification = { type: NotificationType.AuthRequired, channel: 'ahp-root://', resource, reason: AuthRequiredReason.Required };

		contribution._handleAuthenticationRequiredNotification('host-one', { authenticate: async request => { calls.push(`one:${request.token}`); return { authenticated: true }; } }, notification);
		contribution._handleAuthenticationRequiredNotification('host-two', { authenticate: async request => { calls.push(`two:${request.token}`); return { authenticated: true }; } }, notification);
		await timeout(0);

		assert.deepStrictEqual(calls, ['one:session-token', 'two:session-token']);
	});

	test('prompts on a second completed same-token challenge and creates a fresh transformed envelope', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, {
			getOrActivateProviderIdForServer: async () => 'test-provider',
			getSessions: async () => [{ id: 'session-id', account: { id: 'account-id', label: 'Test Account' }, scopes: ['session:read'], accessToken: 'session-token' }],
		});
		instantiationService.stub(ILogService, new NullLogService());
		let promptCount = 0;
		instantiationService.stub(ICommandService, {
			executeCommand: async <R>() => {
				promptCount++;
				return { success: true } as R;
			},
		});
		const envelopes: string[] = [];
		let envelopeNumber = 0;
		const address = 'sealed-host';
		const contribution = Object.create(RemoteAgentHostContribution.prototype) as IRemoteAuthNotificationHarness;
		contribution._connections = new Map([[address, { authTokenCache: new AgentHostAuthTokenCache(), authRecovery: new AgentHostAuthenticationRecovery() }]]);
		contribution._sessionsProvidersService = { getProvider: () => undefined };
		contribution._instantiationService = instantiationService;
		contribution._connectionCustomizations = {
			get: () => ({
				authenticate: async request => ({ ...request, token: `${request.token}:sealed-${++envelopeNumber}` }),
			}),
		};
		contribution._logService = new NullLogService();
		const resource: ProtectedResourceMetadata = {
			resource: 'https://api.example.com/session',
			authorization_servers: ['https://auth.example.com'],
			scopes_supported: ['session:read'],
		};
		const notification: INotification = { type: NotificationType.AuthRequired, channel: 'ahp-root://', resource, reason: AuthRequiredReason.Expired };
		const connection: Pick<IAgentConnection, 'authenticate'> = { authenticate: async request => { envelopes.push(request.token); return { authenticated: true }; } };

		contribution._handleAuthenticationRequiredNotification(address, connection, notification);
		await timeout(0);
		contribution._handleAuthenticationRequiredNotification(address, connection, notification);
		await timeout(0);

		assert.deepStrictEqual({ envelopes, promptCount }, {
			envelopes: ['session-token:sealed-1', 'session-token:sealed-2'],
			promptCount: 1,
		});
	});
});

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
			state.requiresUserInitiatedResume = true;
			state.scheduleRetry(1000, () => fired++);

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

			await timeout(2000);
			assert.strictEqual(fired, 0, 'pending retry must be cancelled by resetForResume');
		});
	});

	test('host key denial requires an explicit resume', () => {
		const state = store.add(new SSHReconnectState());
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
