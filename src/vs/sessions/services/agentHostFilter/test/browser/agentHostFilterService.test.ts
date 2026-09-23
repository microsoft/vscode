/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAgentHostGroup } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../../sessions/common/sessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../sessions/browser/sessionsProvidersService.js';
import { AgentHostFilterService } from '../../browser/agentHostFilterService.js';
import { AgentHostFilterConnectionStatus } from '../../common/agentHostFilter.js';

class StubRemoteProvider {
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon = Codicon.remote;
	readonly remoteAddress: string;
	readonly hostGroup: IAgentHostGroup | undefined;
	private readonly _status;
	readonly connectionStatus: IObservable<RemoteAgentHostConnectionStatus>;
	connectCalls = 0;
	disconnectCalls = 0;

	constructor(address: string, label: string, status: RemoteAgentHostConnectionStatus = RemoteAgentHostConnectionStatus.connected, hostGroup?: IAgentHostGroup) {
		this.id = `agenthost-${address}`;
		this.label = label;
		this.remoteAddress = address;
		this.hostGroup = hostGroup;
		this._status = observableValue<RemoteAgentHostConnectionStatus>('status', status);
		this.connectionStatus = this._status;
	}

	setStatus(status: RemoteAgentHostConnectionStatus): void {
		this._status.set(status, undefined);
	}

	async connect(): Promise<void> {
		this.connectCalls++;
	}

	async disconnect(): Promise<void> {
		this.disconnectCalls++;
	}
}

class StubSessionsProvidersService implements Partial<ISessionsProvidersService> {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, ISessionsProvider>();
	private readonly _onDidChangeProviders = new Emitter<ISessionsProvidersChangeEvent>();
	readonly onDidChangeProviders = this._onDidChangeProviders.event;

	registerProvider(provider: ISessionsProvider): IDisposable {
		this._providers.set(provider.id, provider);
		this._onDidChangeProviders.fire({ added: [provider], removed: [] });
		return toDisposable(() => {
			if (this._providers.delete(provider.id)) {
				this._onDidChangeProviders.fire({ added: [], removed: [provider] });
			}
		});
	}

	getProviders(): ISessionsProvider[] {
		return Array.from(this._providers.values());
	}

	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this._providers.get(providerId) as T | undefined;
	}
}

class StubRemoteAgentHostService extends Disposable implements Partial<IRemoteAgentHostService> {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeConfiguredEntries = this._register(new Emitter<void>());
	readonly onDidChangeConfiguredEntries = this._onDidChangeConfiguredEntries.event;
	configuredEntries: readonly IRemoteAgentHostEntry[] = [];

	setConfiguredEntries(entries: readonly IRemoteAgentHostEntry[]): void {
		this.configuredEntries = entries;
		this._onDidChangeConfiguredEntries.fire();
	}

	reconnect(_address: string): void { /* noop */ }
}

function pid(address: string): string {
	return `agenthost-${address}`;
}

/** A cloud-sandbox-shaped group: many connections, one user-facing entry. */
const SANDBOX_GROUP: IAgentHostGroup = {
	id: 'cloudsandbox',
	label: 'Cloud Sandboxes',
	icon: Codicon.package,
	order: 1,
	connectable: false,
};

/** Same group ranked alongside ungrouped hosts, so its label sorts it first. */
const SANDBOX_GROUP_UNRANKED: IAgentHostGroup = { ...SANDBOX_GROUP, order: 0 };

suite('AgentHostFilterService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(providers: StubSessionsProvidersService, storage = store.add(new InMemoryStorageService()), remote = store.add(new StubRemoteAgentHostService())) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsProvidersService, providers as unknown as ISessionsProvidersService);
		instantiationService.stub(IRemoteAgentHostService, upcastPartial<IRemoteAgentHostService>(remote));
		instantiationService.stub(IStorageService, storage);
		return store.add(instantiationService.createInstance(AgentHostFilterService));
	}

	test('defaults to undefined when no selection persisted and no hosts', () => {
		const providers = new StubSessionsProvidersService();
		const service = createService(providers);
		assert.strictEqual(service.selectedHostId, undefined);
		assert.deepStrictEqual([...service.hosts], []);
	});

	test('defaults based on platform when none persisted', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:9999', 'Host B') as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A', RemoteAgentHostConnectionStatus.disconnected) as unknown as ISessionsProvider));
		const service = createService(providers);
		assert.strictEqual(service.selectedHostId, isWeb ? pid('localhost:4321') : undefined);
	});

	test('surfaces registered remote providers with their connection status', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:9999', 'Host B', RemoteAgentHostConnectionStatus.disconnected) as unknown as ISessionsProvider));
		const service = createService(providers);

		const hosts = [...service.hosts].map(h => ({ label: h.label, status: h.status, id: h.id }));
		assert.deepStrictEqual(hosts, [
			{ label: 'Host A', status: AgentHostFilterConnectionStatus.Connected, id: pid('localhost:4321') },
			{ label: 'Host B', status: AgentHostFilterConnectionStatus.Disconnected, id: pid('localhost:9999') },
		]);
	});

	test('updates when a provider status changes', () => {
		const providers = new StubSessionsProvidersService();
		const hostA = new StubRemoteProvider('localhost:4321', 'Host A');
		store.add(providers.registerProvider(hostA as unknown as ISessionsProvider));
		const service = createService(providers);

		let events = 0;
		store.add(service.onDidChange(() => events++));

		hostA.setStatus(RemoteAgentHostConnectionStatus.disconnected);
		assert.strictEqual(service.hosts[0].status, AgentHostFilterConnectionStatus.Disconnected);
		assert.strictEqual(events, 1);
	});

	test('maps reconnecting providers to connecting', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A', RemoteAgentHostConnectionStatus.reconnecting) as unknown as ISessionsProvider));
		const service = createService(providers);

		assert.strictEqual(service.hosts[0].status, AgentHostFilterConnectionStatus.Connecting);
	});

	test('setSelectedHostId fires change and restores based on platform', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:9999', 'Host B') as unknown as ISessionsProvider));
		const storage = store.add(new InMemoryStorageService());
		const service = createService(providers, storage);

		let events = 0;
		store.add(service.onDidChange(() => events++));

		service.setSelectedHostId(pid('localhost:9999'));
		assert.strictEqual(service.selectedHostId, pid('localhost:9999'));
		assert.strictEqual(events, 1);

		// Recreate service with same storage — selection is restored only on web.
		const service2 = createService(providers, storage);
		assert.strictEqual(service2.selectedHostId, isWeb ? pid('localhost:9999') : undefined);
	});

	for (const savedHostId of [SANDBOX_GROUP.id, pid('localhost:4321')]) {
		test(`restores ${savedHostId} after delayed discovery without persisting the fallback`, () => {
			const providers = new StubSessionsProvidersService();
			const storage = store.add(new InMemoryStorageService());
			const storageKey = 'sessions.agentHostFilter.selectedProviderId';
			storage.store(storageKey, savedHostId, StorageScope.PROFILE, StorageTarget.USER);
			const service = createService(providers, storage);
			const selections = [service.selectedHostId];
			const otherHost = new StubRemoteProvider('localhost:9999', 'Other host');
			store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(otherHost)));
			selections.push(service.selectedHostId);
			store.add(service.registerHostGroup(SANDBOX_GROUP));
			selections.push(service.selectedHostId);
			store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(new StubRemoteProvider('localhost:4321', 'Saved host'))));
			selections.push(service.selectedHostId);
			otherHost.setStatus(RemoteAgentHostConnectionStatus.reconnecting);
			selections.push(service.selectedHostId);

			assert.deepStrictEqual({
				selections,
				providerIds: service.selectedHost?.providerIds,
				stored: storage.get(storageKey, StorageScope.PROFILE),
			}, {
				selections: isWeb ? [
					undefined,
					pid('localhost:9999'),
					savedHostId === SANDBOX_GROUP.id ? savedHostId : pid('localhost:9999'),
					savedHostId,
					savedHostId,
				] : [undefined, undefined, undefined, undefined, undefined],
				providerIds: isWeb ? (savedHostId === SANDBOX_GROUP.id ? [] : [savedHostId]) : undefined,
				stored: savedHostId,
			});
		});
	}

	test('explicitly choosing the startup fallback replaces a not-yet-restored preference', () => {
		const providers = new StubSessionsProvidersService();
		const storage = store.add(new InMemoryStorageService());
		storage.store('sessions.agentHostFilter.selectedProviderId', SANDBOX_GROUP.id, StorageScope.PROFILE, StorageTarget.USER);
		store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(new StubRemoteProvider('localhost:4321', 'Host A'))));
		const service = createService(providers, storage);
		service.setSelectedHostId(pid('localhost:4321'));
		store.add(service.registerHostGroup(SANDBOX_GROUP));

		assert.strictEqual(service.selectedHostId, isWeb ? pid('localhost:4321') : undefined);
	});

	test('keeps the selected configured host and scope while its provider is replaced', () => {
		const providers = new StubSessionsProvidersService();
		const remote = store.add(new StubRemoteAgentHostService());
		remote.setConfiguredEntries([{ name: 'Host A', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'localhost:4321' } }]);
		const registration = store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(new StubRemoteProvider('localhost:4321', 'Host A'))));
		const service = createService(providers, undefined, remote);
		store.add(service.registerHostGroup(SANDBOX_GROUP));
		service.setSelectedHostId(pid('localhost:4321'));
		const snapshots: { id: string | undefined; label: string | undefined; providerIds: readonly string[] | undefined; status: AgentHostFilterConnectionStatus | undefined }[] = [];
		store.add(service.onDidChange(() => snapshots.push({
			id: service.selectedHostId,
			label: service.selectedHost?.label,
			providerIds: service.selectedHost?.providerIds,
			status: service.selectedHost?.status,
		})));

		registration.dispose();
		const replacement = new StubRemoteProvider('localhost:4321', 'Host A', RemoteAgentHostConnectionStatus.connecting);
		store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(replacement)));
		replacement.setStatus(RemoteAgentHostConnectionStatus.connected);

		assert.deepStrictEqual(snapshots, isWeb ? [
			{ id: pid('localhost:4321'), label: 'Host A', providerIds: [pid('localhost:4321')], status: AgentHostFilterConnectionStatus.Disconnected },
			{ id: pid('localhost:4321'), label: 'Host A', providerIds: [pid('localhost:4321')], status: AgentHostFilterConnectionStatus.Connecting },
			{ id: pid('localhost:4321'), label: 'Host A', providerIds: [pid('localhost:4321')], status: AgentHostFilterConnectionStatus.Connected },
		] : [
			{ id: undefined, label: undefined, providerIds: undefined, status: undefined },
			{ id: undefined, label: undefined, providerIds: undefined, status: undefined },
			{ id: undefined, label: undefined, providerIds: undefined, status: undefined },
		]);
	});

	test('falls back when a retained host is removed from configuration', () => {
		const providers = new StubSessionsProvidersService();
		const remote = store.add(new StubRemoteAgentHostService());
		remote.setConfiguredEntries([{ name: 'Host A', connection: { type: RemoteAgentHostEntryType.WebSocket, address: 'localhost:4321' } }]);
		const registration = store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(new StubRemoteProvider('localhost:4321', 'Host A'))));
		const service = createService(providers, undefined, remote);
		store.add(service.registerHostGroup(SANDBOX_GROUP));
		service.setSelectedHostId(pid('localhost:4321'));
		registration.dispose();
		remote.setConfiguredEntries([]);

		assert.deepStrictEqual({
			selected: service.selectedHostId,
			providerIds: service.selectedHost?.providerIds,
			hosts: service.hosts.map(host => host.id),
		}, {
			selected: isWeb ? SANDBOX_GROUP.id : undefined,
			providerIds: isWeb ? [] : undefined,
			hosts: [SANDBOX_GROUP.id],
		});
	});

	test('keeps an explicit group selected through empty membership and reconnects', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(new StubRemoteProvider('localhost:4321', 'Host A'))));
		const service = createService(providers);
		store.add(service.registerHostGroup(SANDBOX_GROUP));
		service.setSelectedHostId(SANDBOX_GROUP.id);
		const member = new StubRemoteProvider('cloudsandbox:env-1', 'Sandbox', RemoteAgentHostConnectionStatus.connected, SANDBOX_GROUP);
		const registration = store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(member)));
		const snapshots = [service.selectedHost?.providerIds];
		member.setStatus(RemoteAgentHostConnectionStatus.reconnecting);
		snapshots.push(service.selectedHost?.providerIds);
		registration.dispose();
		snapshots.push(service.selectedHost?.providerIds);
		store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(member)));
		snapshots.push(service.selectedHost?.providerIds);

		assert.deepStrictEqual({ selected: service.selectedHostId, snapshots }, {
			selected: isWeb ? SANDBOX_GROUP.id : undefined,
			snapshots: isWeb ? [[member.id], [member.id], [], [member.id]] : [undefined, undefined, undefined, undefined],
		});
	});

	test('overlapping discovery does not replace the latest explicit choice', async () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(new StubRemoteProvider('localhost:4321', 'Host A'))));
		const service = createService(providers);
		store.add(service.registerHostGroup(SANDBOX_GROUP));
		const first = new DeferredPromise<void>();
		const second = new DeferredPromise<void>();
		let calls = 0;
		store.add(service.registerDiscoveryHandler(() => ++calls === 1 ? first.p : second.p));
		const firstDiscovery = service.rediscover();
		const secondDiscovery = service.rediscover();
		service.setSelectedHostId(pid('localhost:4321'));
		await first.complete();
		await firstDiscovery;
		const discoveringAfterFirst = service.isDiscovering;
		service.setSelectedHostId(SANDBOX_GROUP.id);
		store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(new StubRemoteProvider('localhost:9999', 'Host B'))));
		await second.complete();
		await secondDiscovery;

		assert.deepStrictEqual({ discoveringAfterFirst, discovering: service.isDiscovering, selected: service.selectedHostId }, {
			discoveringAfterFirst: true,
			discovering: false,
			selected: isWeb ? SANDBOX_GROUP.id : undefined,
		});
	});

	test('fallback selection depends on platform when selected host disappears', () => {
		const providers = new StubSessionsProvidersService();
		const hostA = new StubRemoteProvider('localhost:4321', 'Host A');
		const hostB = new StubRemoteProvider('localhost:9999', 'Host B');
		store.add(providers.registerProvider(hostA as unknown as ISessionsProvider));
		const hostBReg = providers.registerProvider(hostB as unknown as ISessionsProvider);
		const service = createService(providers);

		service.setSelectedHostId(pid('localhost:9999'));
		assert.strictEqual(service.selectedHostId, pid('localhost:9999'));

		// Remove Host B — selection falls back only on web.
		hostBReg.dispose();
		assert.strictEqual(service.selectedHostId, isWeb ? pid('localhost:4321') : undefined);
	});

	test('setSelectedHostId ignores unknown hosts', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		const service = createService(providers);
		service.setSelectedHostId(pid('localhost:4321'));
		assert.strictEqual(service.selectedHostId, pid('localhost:4321'));
		service.setSelectedHostId('agenthost-nonexistent');
		assert.strictEqual(service.selectedHostId, pid('localhost:4321'));
	});

	test('folds grouped providers into a single entry scoping to all of them', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('cloudsandbox:env-1', 'Task one', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP) as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('cloudsandbox:env-2', 'Task two', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP) as unknown as ISessionsProvider));
		const service = createService(providers);

		assert.deepStrictEqual([...service.hosts].map(h => ({ id: h.id, label: h.label, providerIds: [...h.providerIds], grouped: h.grouped, connectable: h.connectable })), [
			// Ungrouped hosts sort first — a fresh profile must not land in the group.
			{ id: pid('localhost:4321'), label: 'Host A', providerIds: [pid('localhost:4321')], grouped: false, connectable: true },
			{ id: 'cloudsandbox', label: 'Cloud Sandboxes', providerIds: [pid('cloudsandbox:env-1'), pid('cloudsandbox:env-2')], grouped: true, connectable: false },
		]);
		assert.strictEqual(service.hosts[1].icon, Codicon.package);
		assert.strictEqual(service.hosts[1].address, undefined);
	});

	test('grouped entry status is the most alive of its members', () => {
		const providers = new StubSessionsProvidersService();
		const envOne = new StubRemoteProvider('cloudsandbox:env-1', 'Task one', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP);
		store.add(providers.registerProvider(envOne as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('cloudsandbox:env-2', 'Task two', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP) as unknown as ISessionsProvider));
		const service = createService(providers);

		assert.strictEqual(service.hosts[0].status, AgentHostFilterConnectionStatus.Disconnected);

		envOne.setStatus(RemoteAgentHostConnectionStatus.connected);
		assert.strictEqual(service.hosts[0].status, AgentHostFilterConnectionStatus.Connected);
	});

	test('selectedHost exposes every provider a grouped selection covers', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('cloudsandbox:env-1', 'Task one', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP) as unknown as ISessionsProvider));
		store.add(providers.registerProvider(new StubRemoteProvider('cloudsandbox:env-2', 'Task two', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP) as unknown as ISessionsProvider));
		const service = createService(providers);

		service.setSelectedHostId('cloudsandbox');
		assert.strictEqual(service.selectedHost?.id, 'cloudsandbox');
		assert.deepStrictEqual([...(service.selectedHost?.providerIds ?? [])], [pid('cloudsandbox:env-1'), pid('cloudsandbox:env-2')]);
	});

	test('reconnect and disconnect fan out to every member of a group', async () => {
		const providers = new StubSessionsProvidersService();
		const envOne = new StubRemoteProvider('cloudsandbox:env-1', 'Task one', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP);
		const envTwo = new StubRemoteProvider('cloudsandbox:env-2', 'Task two', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP);
		store.add(providers.registerProvider(envOne as unknown as ISessionsProvider));
		store.add(providers.registerProvider(envTwo as unknown as ISessionsProvider));
		const service = createService(providers);

		await service.reconnect('cloudsandbox');
		await service.disconnect('cloudsandbox');

		assert.strictEqual(envOne.connectCalls, 1);
		assert.strictEqual(envTwo.connectCalls, 1);
		assert.strictEqual(envOne.disconnectCalls, 1);
		assert.strictEqual(envTwo.disconnectCalls, 1);
	});

	test('falls back to a connectable host rather than a group', () => {
		const providers = new StubSessionsProvidersService();
		const hostA = new StubRemoteProvider('localhost:4321', 'Host A');
		const hostAReg = providers.registerProvider(hostA as unknown as ISessionsProvider);
		// The group is ranked alongside Host A and 'Cloud Sandboxes' sorts before
		// 'Host A', so only the connectable-first rule keeps the default off it.
		store.add(providers.registerProvider(new StubRemoteProvider('cloudsandbox:env-1', 'Task one', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP_UNRANKED) as unknown as ISessionsProvider));
		const service = createService(providers);

		assert.strictEqual(service.hosts[0].id, 'cloudsandbox');
		assert.strictEqual(service.selectedHostId, isWeb ? pid('localhost:4321') : undefined);

		// With no connectable host left there is nothing better to fall back to.
		hostAReg.dispose();
		assert.strictEqual(service.selectedHostId, isWeb ? 'cloudsandbox' : undefined);
	});

	test('a connectable host registering later replaces an automatic group selection', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('cloudsandbox:env-1', 'Task one', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP) as unknown as ISessionsProvider));
		const service = createService(providers);

		// Nothing connectable exists yet, so the group is all there is to pick.
		assert.strictEqual(service.selectedHostId, isWeb ? 'cloudsandbox' : undefined);

		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		assert.strictEqual(service.selectedHostId, isWeb ? pid('localhost:4321') : undefined);
	});

	test('a connectable host registering later leaves an explicit group selection alone', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('cloudsandbox:env-1', 'Task one', RemoteAgentHostConnectionStatus.disconnected, SANDBOX_GROUP) as unknown as ISessionsProvider));
		const service = createService(providers);

		service.setSelectedHostId('cloudsandbox');
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		assert.strictEqual(service.selectedHostId, isWeb ? 'cloudsandbox' : undefined);
	});

	test('a declared group has an entry with no members, and drops it when undeclared', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		const service = createService(providers);

		const registration = service.registerHostGroup(SANDBOX_GROUP);
		assert.deepStrictEqual([...service.hosts].map(h => ({ id: h.id, providerIds: [...h.providerIds], grouped: h.grouped, status: h.status })), [
			{ id: pid('localhost:4321'), providerIds: [pid('localhost:4321')], grouped: false, status: AgentHostFilterConnectionStatus.Connected },
			{ id: 'cloudsandbox', providerIds: [], grouped: true, status: AgentHostFilterConnectionStatus.Disconnected },
		]);

		registration.dispose();
		assert.deepStrictEqual([...service.hosts].map(h => h.id), [pid('localhost:4321')]);
	});

	test('members fold into an already-declared group entry', () => {
		const providers = new StubSessionsProvidersService();
		const service = createService(providers);
		store.add(service.registerHostGroup(SANDBOX_GROUP));

		store.add(providers.registerProvider(new StubRemoteProvider('cloudsandbox:env-1', 'Task one', RemoteAgentHostConnectionStatus.connected, SANDBOX_GROUP) as unknown as ISessionsProvider));
		assert.deepStrictEqual([...service.hosts].map(h => ({ id: h.id, providerIds: [...h.providerIds], status: h.status })), [
			{ id: 'cloudsandbox', providerIds: [pid('cloudsandbox:env-1')], status: AgentHostFilterConnectionStatus.Connected },
		]);
	});

	test('scopes creation drafts to a group without treating the creation provider as a connection', async () => {
		const providers = new StubSessionsProvidersService();
		const service = createService(providers);
		const group = { ...SANDBOX_GROUP, sessionCreationProviderId: 'sandbox-creation' };
		store.add(service.registerHostGroup(group));
		const beforeRegistration = [...service.hosts[0].providerIds];
		const registration = store.add(providers.registerProvider(upcastPartial<ISessionsProvider>({ id: 'sandbox-creation' })));
		const emptyGroup = service.hosts[0];
		const member = new StubRemoteProvider('cloudsandbox:env-1', 'Task one', RemoteAgentHostConnectionStatus.connected, group);
		store.add(providers.registerProvider(upcastPartial<ISessionsProvider>(member)));
		const populatedGroup = service.hosts[0];
		await service.reconnect(group.id);
		await service.disconnect(group.id);
		registration.dispose();

		assert.deepStrictEqual({
			beforeRegistration,
			emptyGroup: {
				providerIds: emptyGroup.providerIds,
				creationProvider: emptyGroup.sessionCreationProviderId,
				status: emptyGroup.status,
				address: emptyGroup.address,
				connectable: emptyGroup.connectable,
			},
			populatedGroup: { providerIds: populatedGroup.providerIds, status: populatedGroup.status },
			afterUnregister: service.hosts[0].providerIds,
			connectionCalls: [member.connectCalls, member.disconnectCalls],
		}, {
			beforeRegistration: [],
			emptyGroup: {
				providerIds: ['sandbox-creation'],
				creationProvider: 'sandbox-creation',
				status: AgentHostFilterConnectionStatus.Disconnected,
				address: undefined,
				connectable: false,
			},
			populatedGroup: { providerIds: ['sandbox-creation', pid('cloudsandbox:env-1')], status: AgentHostFilterConnectionStatus.Connected },
			afterUnregister: [pid('cloudsandbox:env-1')],
			connectionCalls: [1, 1],
		});
	});

	test('an empty declared group is never the automatic selection', () => {
		const providers = new StubSessionsProvidersService();
		store.add(providers.registerProvider(new StubRemoteProvider('localhost:4321', 'Host A') as unknown as ISessionsProvider));
		const service = createService(providers);
		// Ranked alongside Host A, so only the connectable-first rule keeps the
		// default off the alphabetically earlier group.
		store.add(service.registerHostGroup(SANDBOX_GROUP_UNRANKED));

		assert.strictEqual(service.selectedHostId, isWeb ? pid('localhost:4321') : undefined);
	});
});
