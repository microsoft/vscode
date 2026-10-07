/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { ICloudSandboxAgentHostService, ICloudSandboxApiService, ICloudSandboxConnectOptions, ICloudSandboxEnvironment, IMissionControlEnvironment } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, IRemoteAgentHostConnectionInfo, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService, type ITelemetryData } from '../../../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { MissionControlEnvironmentService, type MissionControlConnectionAttemptClassification } from '../../../browser/remoteAgentHost/missionControlEnvironmentService.js';

const firstAccount = JSON.stringify(['github', 'first']);
const secondAccount = JSON.stringify(['github', 'second']);

function host(id: string, name = 'Machine', status = 'online'): IMissionControlEnvironment {
	return { id, name, kind: 'user-local', status };
}

suite('Mission Control inventory', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(storage = store.add(new InMemoryStorageService()), initialAccount: string | undefined = firstAccount, built = true, extensionDevelopment = false) {
		const instantiation = store.add(new TestInstantiationService());
		const accountChanged = store.add(new Emitter<string | undefined>());
		const authenticationChanged = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const sentimentChanged = store.add(new Emitter<void>());
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const calls = { lists: 0, lookups: [] as string[], connects: [] as ICloudSandboxConnectOptions[], disconnects: [] as string[] };
		const events: { eventName: string; data: ITelemetryData | undefined }[] = [];
		let account: string | undefined = initialAccount;
		let hidden = false;
		let own = 'own';
		let list: Promise<readonly IMissionControlEnvironment[]> = Promise.resolve([host('remote'), host('own'), { ...host('managed'), kind: 'managed-sandbox' }]);
		let listed = new DeferredPromise<void>();
		let environment: Promise<ICloudSandboxEnvironment> = Promise.resolve({ id: 'remote', status: 'online' });
		let connecting: Promise<void> = Promise.resolve();
		let connectionStatus: RemoteAgentHostConnectionStatus | undefined;
		instantiation.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
			override get connections() {
				const status = connectionStatus;
				return status ? [new class extends mock<IRemoteAgentHostConnectionInfo>() {
					override readonly address = 'cloudsandbox:remote';
					constructor(override readonly status: RemoteAgentHostConnectionStatus) { super(); }
				}(status)] : [];
			}
		}());
		instantiation.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
			override readonly onDidChangeAccount = accountChanged.event;
			override async getAccountKey() { return account; }
			override async listEnvironments() { calls.lists++; void listed.complete(); return list; }
			override async getEnvironment(id: string) { calls.lookups.push(id); return environment; }
		}());
		instantiation.stub(ICloudSandboxAgentHostService, new class extends mock<ICloudSandboxAgentHostService>() {
			override async connect(options: ICloudSandboxConnectOptions, token: CancellationToken) {
				calls.connects.push(options);
				await raceCancellationError(connecting, token);
				return `cloudsandbox:${options.environmentId}`;
			}
			override async disconnect(id: string) { calls.disconnects.push(id); }
		}());
		instantiation.stub(IAgentHostService, new class extends mock<IAgentHostService>() {
			override async getMissionControlEnvironmentId() { return own; }
		}());
		instantiation.stub(IStorageService, storage);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IEnvironmentService, { isBuilt: built, isExtensionDevelopment: extensionDevelopment });
		instantiation.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = sentimentChanged.event;
			override get sentiment() { return { hidden }; }
		}());
		instantiation.stub(ILogService, store.add(new NullLogService()));
		instantiation.stub(IAuthenticationService, { onDidChangeSessions: authenticationChanged.event });
		instantiation.stub(ITelemetryService, new class extends mock<ITelemetryService>() {
			override publicLog2(eventName: string, data?: ITelemetryData): void {
				events.push({ eventName, data });
			}
		}());
		const service = store.add(instantiation.createInstance(MissionControlEnvironmentService));
		return {
			service, storage, calls, configuration, authenticationChanged, events,
			setList: (result: Promise<readonly IMissionControlEnvironment[]>) => { list = result; listed = new DeferredPromise<void>(); return listed.p; },
			setEnvironment: (result: Promise<ICloudSandboxEnvironment>) => { environment = result; },
			setConnecting: (result: Promise<void>) => { connecting = result; },
			changeAccount: (value: string | undefined) => { account = value; accountChanged.fire(value); },
			disableAI: () => { hidden = true; sentimentChanged.fire(); },
			setOwn: (id: string) => { own = id; },
			setConnectionStatus: (status: RemoteAgentHostConnectionStatus) => { connectionStatus = status; },
		};
	}

	test('records successful connects, preflight failures and caller cancellations without host identity', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const context = fixture();
		await context.service.refresh(CancellationToken.None);
		await context.service.connect('remote', CancellationToken.None);
		context.setEnvironment(Promise.resolve({ id: 'remote', status: 'offline' }));
		await assert.rejects(context.service.connect('remote', CancellationToken.None), /not online/);
		const token = store.add(new CancellationTokenSource());
		const availability = new DeferredPromise<ICloudSandboxEnvironment>();
		context.setEnvironment(availability.p);
		const cancelled = context.service.connect('remote', token.token);
		token.cancel();
		await assert.rejects(cancelled, CancellationError);
		await availability.complete({ id: 'remote', status: 'online' });
		type ClassifiedSample<T> = { [K in Exclude<keyof T, 'owner' | 'comment'>]: T[K] extends { isMeasurement: true } ? number : string };
		const success: ClassifiedSample<MissionControlConnectionAttemptClassification> = { outcome: 'success', stage: 'connection', durationMs: 0 };
		assert.deepStrictEqual(context.events, [
			{ eventName: 'missionControlConnectionAttempt', data: success },
			{ eventName: 'missionControlConnectionAttempt', data: { outcome: 'failure', stage: 'environment', durationMs: 0 } },
			{ eventName: 'missionControlConnectionAttempt', data: { outcome: 'cancelled', stage: 'environment', durationMs: 0 } },
		]);
	}));

	test('discovers native hosts before connection and excludes self and managed compute', async () => {
		const { service, calls } = fixture();
		await service.refresh(CancellationToken.None);
		assert.deepStrictEqual({ hosts: service.hosts.get(), calls }, {
			hosts: [{ ...host('remote'), displayName: undefined }],
			calls: { lists: 1, lookups: [], connects: [], disconnects: [] },
		});
	});

	test('excludes a native host whose registration becomes ready during discovery', async () => {
		const { service, setList, setOwn, calls } = fixture();
		const inventory = new DeferredPromise<readonly IMissionControlEnvironment[]>();
		const listed = setList(inventory.p);
		const refresh = service.refresh(CancellationToken.None);
		await listed;
		setOwn('remote');
		await inventory.complete([host('remote')]);
		await refresh;
		assert.deepStrictEqual({ hosts: service.hosts.get(), connects: calls.connects }, { hosts: [], connects: [] });
	});

	test('restores account/profile-local metadata before network and preserves rename on refresh', async () => {
		const { service, storage } = fixture();
		await service.refresh(CancellationToken.None);
		service.setDisplayName('remote', '  Work Machine  ');
		service.dispose();
		const reopened = fixture(storage);
		await reopened.service.initialize();
		const cached = reopened.service.hosts.get();
		reopened.setList(Promise.resolve([host('remote', 'Remote name')]));
		await reopened.service.refresh(CancellationToken.None);
		const refreshed = reopened.service.hosts.get();
		reopened.service.setDisplayName('remote', undefined);
		const separateProfile = fixture();
		await separateProfile.service.initialize();
		assert.deepStrictEqual({
			cached, refreshed, restored: reopened.service.hosts.get(), calls: reopened.calls,
			separateProfile: separateProfile.service.hosts.get(),
			storedFields: Object.keys(JSON.parse(storage.get(`missionControl.userLocalHosts.v1.${encodeURIComponent(firstAccount)}.remote.metadata`, StorageScope.PROFILE)!)).sort(),
		}, {
			cached: [{ ...host('remote'), displayName: 'Work Machine' }],
			refreshed: [{ ...host('remote', 'Remote name'), displayName: 'Work Machine' }],
			restored: [{ ...host('remote', 'Remote name'), displayName: undefined }],
			calls: { lists: 1, lookups: [], connects: [], disconnects: [] }, separateProfile: [],
			storedFields: ['id', 'kind', 'name', 'status'],
		});
	});

	test('previously hidden hosts are restored and connectable without losing local names', async () => {
		const { service, storage, calls } = fixture();
		const prefix = `missionControl.userLocalHosts.v1.${encodeURIComponent(firstAccount)}.remote`;
		storage.storeAll([
			{ key: `${prefix}.metadata`, value: JSON.stringify(host('remote')), scope: StorageScope.PROFILE, target: StorageTarget.MACHINE },
			{ key: `${prefix}.hidden`, value: true, scope: StorageScope.PROFILE, target: StorageTarget.MACHINE },
			{ key: `${prefix}.displayName`, value: 'Local name', scope: StorageScope.PROFILE, target: StorageTarget.MACHINE },
		], false);
		await service.initialize();
		const restored = service.hosts.get();
		await service.refresh(CancellationToken.None);
		await service.connect('remote', CancellationToken.None);
		assert.deepStrictEqual({ restored, refreshed: service.hosts.get(), connects: calls.connects.length }, {
			restored: [{ ...host('remote'), displayName: 'Local name' }],
			refreshed: [{ ...host('remote'), displayName: 'Local name' }], connects: 1,
		});
	});

	test('failed and cancelled refreshes cannot clear retained hosts or preferences', async () => {
		const { service, setList } = fixture();
		await service.refresh(CancellationToken.None);
		service.setDisplayName('remote', 'Local label');
		setList(Promise.reject(new Error('Inventory unavailable')));
		await assert.rejects(service.refresh(CancellationToken.None), /Inventory unavailable/);
		const late = new DeferredPromise<readonly IMissionControlEnvironment[]>();
		const cancellation = store.add(new CancellationTokenSource());
		const listed = setList(late.p);
		const refresh = service.refresh(cancellation.token);
		await listed;
		cancellation.cancel();
		await late.complete([]);
		await assert.rejects(refresh, CancellationError);
		assert.deepStrictEqual(service.hosts.get(), [{ ...host('remote'), displayName: 'Local label' }]);
	});

	test('successful refresh removes absent hosts from memory, other windows and persisted metadata', async () => {
		const first = fixture();
		first.setList(Promise.resolve([host('remote'), host('deleted'), host('another-deleted')]));
		await first.service.refresh(CancellationToken.None);
		first.service.setDisplayName('remote', 'Local label');
		const second = fixture(first.storage);
		await second.service.initialize();
		first.setList(Promise.resolve([host('remote', 'Remote name', 'offline')]));
		await first.service.refresh(CancellationToken.None);
		first.service.setDisplayName('remote', 'Updated label');
		const reopened = fixture(first.storage);
		await reopened.service.initialize();
		assert.deepStrictEqual({
			hosts: [first, second, reopened].map(context => context.service.hosts.get()),
			metadata: ['deleted', 'another-deleted'].map(id => first.storage.get(`missionControl.userLocalHosts.v1.${encodeURIComponent(firstAccount)}.${id}.metadata`, StorageScope.PROFILE)),
			disconnects: [first.calls.disconnects, second.calls.disconnects],
		}, {
			hosts: Array.from({ length: 3 }, () => [{ ...host('remote', 'Remote name', 'offline'), displayName: 'Updated label' }]),
			metadata: [undefined, undefined],
			disconnects: [['deleted', 'another-deleted'], ['deleted', 'another-deleted']],
		});
	});

	test('an empty endpoint list clears cached inventory without removing another account or local preferences', async () => {
		const first = fixture();
		await first.service.refresh(CancellationToken.None);
		first.service.setDisplayName('remote', 'Local label');
		const otherAccount = fixture(first.storage, secondAccount);
		await otherAccount.service.refresh(CancellationToken.None);
		first.setList(Promise.resolve([]));
		await first.service.refresh(CancellationToken.None);
		const empty = first.service.hosts.get();
		const reopened = fixture(first.storage);
		await reopened.service.initialize();
		const cached = reopened.service.hosts.get();
		await reopened.service.refresh(CancellationToken.None);
		assert.deepStrictEqual({ empty, cached, rediscovered: reopened.service.hosts.get(), otherAccount: otherAccount.service.hosts.get() }, {
			empty: [], cached: [],
			rediscovered: [{ ...host('remote'), displayName: 'Local label' }],
			otherAccount: [{ ...host('remote'), displayName: undefined }],
		});
	});

	test('stale-window rename cannot remove newly discovered inventory or overwrite another host label', async () => {
		const first = fixture();
		await first.service.refresh(CancellationToken.None);
		const second = fixture(first.storage);
		await second.service.initialize();
		const stale = second.service.hosts.get();
		first.setList(Promise.resolve([host('remote'), host('new-machine')]));
		await first.service.refresh(CancellationToken.None);
		first.service.setDisplayName('new-machine', 'Current label');
		second.service.hosts.set(stale, undefined);
		second.service.setDisplayName('remote', 'Remote label');
		const reopened = fixture(first.storage);
		await reopened.service.initialize();
		assert.deepStrictEqual({
			hosts: reopened.service.hosts.get().map(host => ({ id: host.id, label: host.displayName })),
			firstDisconnects: first.calls.disconnects,
		}, {
			hosts: [
				{ id: 'remote', label: 'Remote label' },
				{ id: 'new-machine', label: 'Current label' },
			],
			firstDisconnects: [],
		});
	});

	test('endpoint inventory replaces another window cache without erasing local preferences', async () => {
		const first = fixture();
		await first.service.refresh(CancellationToken.None);
		const second = fixture(first.storage);
		await second.service.initialize();
		const stale = second.service.hosts.get();
		first.setList(Promise.resolve([host('remote'), host('first-machine')]));
		await first.service.refresh(CancellationToken.None);
		first.service.setDisplayName('first-machine', 'First local label');
		second.service.hosts.set(stale, undefined);
		second.setList(Promise.resolve([host('remote'), host('second-machine')]));
		await second.service.refresh(CancellationToken.None);
		const reopened = fixture(first.storage);
		await reopened.service.initialize();
		const refreshed = reopened.service.hosts.get().map(host => ({ id: host.id, label: host.displayName }));
		reopened.setList(Promise.resolve([host('remote'), host('first-machine'), host('second-machine')]));
		await reopened.service.refresh(CancellationToken.None);
		assert.deepStrictEqual({ refreshed, rediscovered: reopened.service.hosts.get().map(host => ({ id: host.id, label: host.displayName })) }, {
			refreshed: [
				{ id: 'remote', label: undefined },
				{ id: 'second-machine', label: undefined },
			],
			rediscovered: [
				{ id: 'remote', label: undefined },
				{ id: 'second-machine', label: undefined },
				{ id: 'first-machine', label: 'First local label' },
			],
		});
	});

	test('a newer refresh removes absent hosts and late discovery cannot restore them', async () => {
		const { service, setList } = fixture();
		await service.refresh(CancellationToken.None);
		const late = new DeferredPromise<readonly IMissionControlEnvironment[]>();
		const listed = setList(late.p);
		const oldRefresh = service.refresh(CancellationToken.None);
		await listed;
		setList(Promise.resolve([]));
		await service.refresh(CancellationToken.None);
		await late.complete([host('remote', 'Stale name')]);
		await assert.rejects(oldRefresh, CancellationError);
		assert.deepStrictEqual(service.hosts.get(), []);
	});

	test('deleting a host during an in-flight connection cancels admission and withdraws its relay', async () => {
		const { service, calls, setConnecting, setList } = fixture();
		await service.refresh(CancellationToken.None);
		const relay = new DeferredPromise<void>();
		setConnecting(relay.p);
		const connected = service.connect('remote', CancellationToken.None);
		while (!calls.connects.length) {
			await Promise.resolve();
		}
		const rejected = assert.rejects(connected, CancellationError);
		setList(Promise.resolve([]));
		await service.refresh(CancellationToken.None);
		await relay.complete();
		await rejected;
		assert.deepStrictEqual({ hosts: service.hosts.get(), disconnects: calls.disconnects }, { hosts: [], disconnects: ['remote'] });
	});

	test('account switch and sign-out withdraw hosts, reject late results and isolate preferences', async () => {
		const { service, storage, setList, changeAccount } = fixture();
		await service.refresh(CancellationToken.None);
		service.setDisplayName('remote', 'First account label');
		const late = new DeferredPromise<readonly IMissionControlEnvironment[]>();
		const listed = setList(late.p);
		const oldRefresh = service.refresh(CancellationToken.None);
		await listed;
		changeAccount(secondAccount);
		await service.initialize();
		const switched = service.hosts.get();
		await late.complete([host('remote')]);
		await assert.rejects(oldRefresh, CancellationError);
		await service.refresh(CancellationToken.None);
		const secondHosts = service.hosts.get();
		changeAccount(undefined);
		await service.initialize();
		const signedOut = service.hosts.get();
		const firstAgain = fixture(storage);
		await firstAgain.service.initialize();
		assert.deepStrictEqual({ switched, secondHosts, signedOut, firstAgain: firstAgain.service.hosts.get() }, {
			switched: [], secondHosts: [{ ...host('remote'), displayName: undefined }], signedOut: [],
			firstAgain: [{ ...host('remote'), displayName: 'First account label' }],
		});
	});

	test('offline hosts never mint credentials, wake compute or create sessions', async () => {
		const { service, calls, setEnvironment } = fixture();
		await service.refresh(CancellationToken.None);
		setEnvironment(Promise.resolve({ id: 'remote', status: 'offline' }));
		await assert.rejects(service.connect('remote', CancellationToken.None), /Start its owning application/);
		assert.deepStrictEqual({ lookups: calls.lookups, connects: calls.connects }, { lookups: ['remote'], connects: [] });
	});

	test('local display names never replace the remote default name on connection', async () => {
		const { service, calls } = fixture();
		await service.refresh(CancellationToken.None);
		service.setDisplayName('remote', 'My local label');
		await service.connect('remote', CancellationToken.None);
		service.setDisplayName('remote', undefined);
		assert.deepStrictEqual({ connectionNames: calls.connects.map(connection => connection.name), label: service.hosts.get()[0].displayName },
			{ connectionNames: ['Machine'], label: undefined });
	});

	for (const phase of ['availability', 'relay'] as const) {
		test(`stalled ${phase} work stops at the user-local deadline and cannot succeed late`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const context = fixture();
			await context.service.refresh(CancellationToken.None);
			const availability = new DeferredPromise<ICloudSandboxEnvironment>();
			const relay = new DeferredPromise<void>();
			if (phase === 'availability') {
				context.setEnvironment(availability.p);
			} else {
				context.setConnecting(relay.p);
			}
			const connected = context.service.connect('remote', CancellationToken.None);
			const failed = assert.rejects(connected, /timed out.*owning application/);
			await timeout(59_999);
			const before = { connects: context.calls.connects.length, disconnects: context.calls.disconnects.length };
			await timeout(1);
			await failed;
			await availability.complete({ id: 'remote', status: 'online' });
			await relay.complete();
			await timeout(0);
			assert.deepStrictEqual({ before, connects: context.calls.connects.length, disconnects: context.calls.disconnects, retained: context.service.hosts.get().map(host => host.id), events: context.events },
				{
					before: { connects: phase === 'relay' ? 1 : 0, disconnects: 0 }, connects: phase === 'relay' ? 1 : 0,
					disconnects: phase === 'relay' ? ['remote'] : [], retained: ['remote'],
					events: [{ eventName: 'missionControlConnectionAttempt', data: { outcome: 'timeout', stage: phase === 'relay' ? 'connection' : 'environment', durationMs: 60_000 } }],
				});
		}));
	}

	for (const { name, built, extensionDevelopment } of [
		{ name: 'source', built: false, extensionDevelopment: false },
		{ name: 'extension development', built: true, extensionDevelopment: true },
		{ name: 'normal built product', built: true, extensionDevelopment: false },
	]) {
		test(`discovers and connects hosts in ${name} windows`, async () => {
			const { service, calls } = fixture(undefined, firstAccount, built, extensionDevelopment);
			await service.refresh(CancellationToken.None);
			await service.connect('remote', CancellationToken.None);
			assert.deepStrictEqual({ enabled: service.enabled, lists: calls.lists, connections: calls.connects.length },
				{ enabled: true, lists: 1, connections: 1 });
		});
	}

	test('connect, disconnect and reconnect retain inventory and revalidate availability', async () => {
		const { service, calls } = fixture();
		await service.refresh(CancellationToken.None);
		await service.connect('remote', CancellationToken.None);
		await service.disconnect('remote');
		await service.connect('remote', CancellationToken.None);
		assert.deepStrictEqual({ hosts: service.hosts.get().map(host => host.id), calls }, {
			hosts: ['remote'], calls: {
				lists: 1, lookups: ['remote', 'remote'], disconnects: ['remote'],
				connects: [0, 1].map(() => ({ environmentId: 'remote', name: 'Machine', environmentKind: 'user-local' })),
			},
		});
	});

	for (const status of [RemoteAgentHostConnectionStatus.connecting, RemoteAgentHostConnectionStatus.reconnecting, RemoteAgentHostConnectionStatus.connected]) {
		test(`explicit connect ${status.kind === 'connected' ? 'reuses a healthy relay' : `replaces a ${status.kind} relay instead of reporting stale reuse as success`}`, async () => {
			const { service, calls, setConnectionStatus } = fixture();
			await service.refresh(CancellationToken.None);
			setConnectionStatus(status);
			await service.connect('remote', CancellationToken.None);
			assert.deepStrictEqual({
				lookups: calls.lookups, disconnects: calls.disconnects, connects: calls.connects.length,
			}, { lookups: ['remote'], disconnects: status.kind === 'connected' ? [] : ['remote'], connects: 1 });
		});
	}

	test('disconnect cancels an in-flight relay connection without removing its host', async () => {
		const { service, calls, setConnecting } = fixture();
		await service.refresh(CancellationToken.None);
		const relay = new DeferredPromise<void>();
		setConnecting(relay.p);
		const connected = service.connect('remote', CancellationToken.None);
		while (!calls.connects.length) {
			await Promise.resolve();
		}
		await service.disconnect('remote');
		await assert.rejects(connected, CancellationError);
		await relay.complete();
		assert.deepStrictEqual({ hosts: service.hosts.get().map(host => host.id), disconnects: calls.disconnects }, { hosts: ['remote'], disconnects: ['remote'] });
	});

	test('removing the account clears hosts immediately before async identity resolution', async () => {
		const { service, authenticationChanged } = fixture();
		await service.refresh(CancellationToken.None);
		authenticationChanged.fire({
			providerId: 'github', label: 'GitHub', event: { added: [], changed: [], removed: [{ id: 'session', account: { id: 'first', label: 'Account' }, scopes: [], accessToken: 'test-only' }] },
		});
		assert.deepStrictEqual(service.hosts.get(), []);
	});

	test('the AI master setting withdraws inventory immediately even before entitlement sentiment changes', async () => {
		const { service, configuration, calls } = fixture();
		await service.refresh(CancellationToken.None);
		await service.connect('remote', CancellationToken.None);
		await configuration.setUserConfiguration('chat.disableAIFeatures', true);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === 'chat.disableAIFeatures'; }
		}());
		await assert.rejects(service.connect('remote', CancellationToken.None), CancellationError);
		assert.deepStrictEqual({
			enabled: service.enabled, hosts: service.hosts.get(), disconnects: calls.disconnects, connects: calls.connects.length,
		}, { enabled: false, hosts: [], disconnects: ['remote'], connects: 1 });
	});

	test('deletion discovered by another window cancels admission and withdraws the live relay locally', async () => {
		const first = fixture();
		await first.service.refresh(CancellationToken.None);
		const second = fixture(first.storage);
		await second.service.initialize();
		const relay = new DeferredPromise<void>();
		second.setConnecting(relay.p);
		const connected = second.service.connect('remote', CancellationToken.None);
		while (!second.calls.connects.length) {
			await Promise.resolve();
		}
		const rejection = assert.rejects(connected, CancellationError);
		first.setList(Promise.resolve([]));
		await first.service.refresh(CancellationToken.None);
		await relay.complete();
		await rejection;
		assert.deepStrictEqual({
			hosts: second.service.hosts.get(),
			disconnects: second.calls.disconnects,
		}, { hosts: [], disconnects: ['remote'] });
	});

	for (const boundary of ['account-switch', 'AI-disabled', 'remote-disabled', 'disposed', 'disconnect'] as const) {
		test(`${boundary} during live availability lookup never mints relay credentials`, async () => {
			const context = fixture();
			await context.service.refresh(CancellationToken.None);
			const availability = new DeferredPromise<ICloudSandboxEnvironment>();
			context.setEnvironment(availability.p);
			const connected = context.service.connect('remote', CancellationToken.None);
			while (!context.calls.lookups.length) {
				await Promise.resolve();
			}
			const rejection = assert.rejects(connected, CancellationError);
			switch (boundary) {
				case 'account-switch': context.changeAccount(secondAccount); break;
				case 'AI-disabled': context.disableAI(); break;
				case 'remote-disabled':
					await context.configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
					context.configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
						override affectsConfiguration() { return true; }
					}());
					break;
				case 'disposed': context.service.dispose(); break;
				case 'disconnect':
					await context.service.disconnect('remote');
					break;
			}
			await availability.complete({ id: 'remote', status: 'online' });
			await rejection;
			assert.deepStrictEqual(context.calls.connects, []);
		});
	}

	for (const gate of ['remote-disabled', 'AI-disabled', 'AI-master-setting'] as const) {
		test(`${gate} never discovers or connects hosts`, async () => {
			const { service, calls, configuration, disableAI } = fixture();
			if (gate === 'remote-disabled') {
				await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
			} else if (gate === 'AI-disabled') {
				disableAI();
			} else {
				await configuration.setUserConfiguration('chat.disableAIFeatures', true);
			}
			await service.refresh(CancellationToken.None);
			await assert.rejects(service.connect('remote', CancellationToken.None), CancellationError);
			assert.deepStrictEqual({ enabled: service.enabled, hosts: service.hosts.get(), lists: calls.lists, connects: calls.connects }, {
				enabled: false, hosts: [], lists: 0, connects: [],
			});
		});
	}
});
