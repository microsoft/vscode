/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { DEFAULT_RECONNECT_POLICY } from '../../../../../../platform/agentHost/common/reconnectPolicy.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AHP_UNSUPPORTED_PROTOCOL_VERSION, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ManagedReconnectAgentHostContribution, ManagedReconnectState } from '../../browser/managedReconnectAgentHostContribution.js';
import { RemoteAgentHostSessionsProvider } from '../../browser/remoteAgentHostSessionsProvider.js';

suite('ManagedReconnectAgentHostContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('incompatible reconnect status reports the versions offered by the client', async () => {
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IRemoteAgentHostService, { connections: [] });
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(ISessionsProvidersService, {});
		instantiation.stub(INotificationService, new TestNotificationService());
		const statuses: RemoteAgentHostConnectionStatus[] = [];
		const provider = new class extends mock<RemoteAgentHostSessionsProvider>() {
			override setConnectionStatus(status: RemoteAgentHostConnectionStatus): void { statuses.push(status); }
		}();
		class TestContribution extends ManagedReconnectAgentHostContribution {
			protected readonly _entryType = RemoteAgentHostEntryType.SSH;

			constructor(
				@IRemoteAgentHostService remote: IRemoteAgentHostService,
				@IConfigurationService config: IConfigurationService,
				@ILogService log: ILogService,
				@IInstantiationService instantiation: IInstantiationService,
				@ISessionsProvidersService providers: ISessionsProvidersService,
				@INotificationService notifications: INotificationService,
			) {
				super(remote, config, log, instantiation, providers, notifications);
				this._providerInstances.set('ssh:machine', provider);
			}

			protected _getProviderOptions() { return {}; }

			attempt(): Promise<void> {
				return this._attemptManagedReconnect({
					kind: 'SSH', key: 'machine', address: 'ssh:machine', userInitiated: true,
					reconnectPolicy: DEFAULT_RECONNECT_POLICY,
					shouldPause: () => false,
					doConnect: async () => { throw new ProtocolError(AHP_UNSUPPORTED_PROTOCOL_VERSION, 'Unsupported protocol version', { supportedVersions: ['2.0.0'] }); },
				});
			}
		}
		const contribution = store.add(instantiation.createInstance(TestContribution));
		await contribution.attempt();
		assert.deepStrictEqual(statuses, [
			RemoteAgentHostConnectionStatus.connecting,
			RemoteAgentHostConnectionStatus.disconnected,
			RemoteAgentHostConnectionStatus.incompatible('Unsupported protocol version', ['1.0.0', '0.10.0', '0.9.0'], ['2.0.0']),
		]);
	});
});

suite('ManagedReconnectState', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('scheduleRetry fires the handler after the requested delay', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new ManagedReconnectState());
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
		// The timer disposable must be cleared inside scheduleRetry's tick so
		// observers that check hasPendingTimer after the handler runs (e.g. the
		// reconnect loop's "retry timer already scheduled, skipping" guard) see
		// the right value.
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new ManagedReconnectState());
			state.scheduleRetry(1000, () => { /* no follow-up */ });
			await timeout(1100);
			assert.strictEqual(state.hasPendingTimer, false, 'timer should be cleared after firing');
		});
	});

	test('cancelTimer prevents the handler from firing', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new ManagedReconnectState());
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
			const state = store.add(new ManagedReconnectState());
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
		// Safety net for the DisposableMap that owns these states: when the
		// contribution is disposed (or a host is removed) the entry's pending
		// timer must be cancelled so we don't fire reconnect attempts against
		// torn-down services.
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = new ManagedReconnectState();
			let fired = 0;
			state.scheduleRetry(1000, () => fired++);
			state.dispose();
			await timeout(2000);
			assert.strictEqual(fired, 0);
		});
	});

	test('resetForResume clears the timer and zeros attempts/paused state', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const state = store.add(new ManagedReconnectState());
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

	test('automatically resumes states that do not require a user action', () => {
		const state = store.add(new ManagedReconnectState());
		state.attempts = 1;
		state.paused = true;

		assert.deepStrictEqual({
			resumed: state.resumeAutomatically(),
			attempts: state.attempts,
			paused: state.paused,
		}, {
			resumed: true,
			attempts: 0,
			paused: false,
		});
	});
});
