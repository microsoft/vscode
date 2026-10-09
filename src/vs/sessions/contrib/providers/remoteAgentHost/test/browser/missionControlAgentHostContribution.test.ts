/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { IMissionControlEnvironmentService, IMissionControlHost, IMissionControlSharingService } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Context } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IsDevelopmentContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IEntryDrivenProviderOptions } from '../../browser/entryDrivenProviderContribution.js';
import { MissionControlAgentHostContribution } from '../../browser/missionControlAgentHostContribution.js';
import { RemoteAgentHostSessionsProvider } from '../../browser/remoteAgentHostSessionsProvider.js';
import { IUserDataProfileService } from '../../../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { IUserDataProfile } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ConnectMissionControlEnvironmentCommand } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/missionControlEnvironmentActions.js';
import { Menus } from '../../../../../browser/menus.js';
import { RemoteAgentHostCommandIds } from '../../browser/remoteAgentHostActions.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../../../../chat/common/constants.js';

class TestProvider extends mock<RemoteAgentHostSessionsProvider>() {
	override readonly connectionStatus = observableValue<RemoteAgentHostConnectionStatus>(this, RemoteAgentHostConnectionStatus.disconnected);
	disposed = false;
	constructor(override readonly remoteAddress: string, private name: string, private readonly options: IEntryDrivenProviderOptions) { super(); }
	override get defaultLabel(): string { return this.name; }
	override get label(): string { return this.name; }
	override setLabel(name: string): void { this.name = name; }
	override setConnectionStatus(status: RemoteAgentHostConnectionStatus): void { this.connectionStatus.set(status, undefined); }
	override async connect(): Promise<void> { await this.options.connectOnDemand?.(); }
	override async disconnect(): Promise<void> { await this.options.disconnectOnDemand?.(); }
	override dispose(): void { this.disposed = true; }
}

suite('Mission Control native provider inventory', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('labels the remote picker entry and connect command as Environments', () => {
		const labels = [
			{ menu: Menus.SessionWorkspaceManage, command: RemoteAgentHostCommandIds.connectViaMissionControl },
			{ menu: MenuId.CommandPalette, command: ConnectMissionControlEnvironmentCommand },
		].map(({ menu, command }) => {
			const item = MenuRegistry.getMenuItems(menu).filter(isIMenuItem).find(item => item.command.id === command);
			assert.ok(item);
			return typeof item.command.title === 'string' ? item.command.title : item.command.title.value;
		});
		assert.deepStrictEqual(labels, ['Environments', 'Connect to Environment...']);
	});

	for (const { name, development, hostsEnabled, chatEnabled, aiDisabled, available } of [
		{ name: 'source', development: true, hostsEnabled: true, chatEnabled: true, aiDisabled: false, available: true },
		{ name: 'normal built product', development: false, hostsEnabled: true, chatEnabled: true, aiDisabled: false, available: true },
		{ name: 'remote hosts disabled', development: false, hostsEnabled: false, chatEnabled: true, aiDisabled: false, available: false },
		{ name: 'chat disabled', development: false, hostsEnabled: true, chatEnabled: false, aiDisabled: false, available: false },
		{ name: 'AI master setting disabled', development: false, hostsEnabled: true, chatEnabled: true, aiDisabled: true, available: false },
	]) {
		test(`command and workspace picker availability: ${name}`, () => {
			const context = new Context(0, null);
			context.setValue(IsDevelopmentContext.key, development);
			context.setValue(ChatContextKeys.enabled.key, chatEnabled);
			context.setValue(`config.${RemoteAgentHostsEnabledSettingId}`, hostsEnabled);
			context.setValue('config.chat.disableAIFeatures', aiDisabled);
			const availability = [
				{ menu: MenuId.CommandPalette, command: ConnectMissionControlEnvironmentCommand },
				{ menu: Menus.SessionWorkspaceManage, command: RemoteAgentHostCommandIds.connectViaMissionControl },
			].map(({ menu, command }) => {
				const item = MenuRegistry.getMenuItems(menu).filter(isIMenuItem).find(item => item.command.id === command);
				assert.ok(item);
				return (item.when?.evaluate(context) ?? true) && (item.command.precondition?.evaluate(context) ?? true);
			});
			assert.deepStrictEqual(availability, [available, available]);
		});
	}

	function fixture(profileId = 'profile', options: {
		web?: boolean;
		autoConnect?: boolean;
		storage?: InMemoryStorageService;
		connect?: () => Promise<void>;
		refresh?: () => Promise<void>;
		sharedStartupFirst?: boolean;
	} = {}) {
		const instantiation = store.add(new TestInstantiationService());
		const hosts = observableValue<readonly IMissionControlHost[]>('hosts', []);
		let account = 'first';
		const created: { provider: TestProvider; options: IEntryDrivenProviderOptions }[] = [];
		const actions: string[] = [];
		const recentChanges = store.add(new Emitter<void>());
		const providerChanges = store.add(new Emitter<{ added: []; removed: [] }>());
		let recentFolders: readonly URI[] = [];
		const sharedProjects: string[][] = [];
		const recentQueries: { includeVSCode: boolean | undefined; collapseWorktrees: boolean | undefined }[] = [];
		instantiation.stub(ISessionsRecentWorkspacesService, {
			onDidChangeRecentWorkspaces: recentChanges.event,
			getRecentWorkspaces: (includeVSCode, collapseWorktrees) => {
				recentQueries.push({ includeVSCode, collapseWorktrees });
				return recentFolders.map(root => upcastPartial<IRecentWorkspace>({
					workspace: upcastPartial<ISessionWorkspace>({ folders: [{ root, workingDirectory: root, name: 'Folder', description: undefined }] }),
				}));
			},
		});
		instantiation.stub(IMissionControlSharingService, { setProjectFolders: folders => sharedProjects.push(folders.map(folder => folder.toString())) });
		const connections = new Map<string, IRemoteAgentHostConnectionInfo>();
		const connectionsChanged = store.add(new Emitter<void>());
		let sharedDiscoveries = 0;
		let tunnelDiscoveries = 0;
		const discoveryHandlers = new Set<() => Promise<void>>([async () => { tunnelDiscoveries++; }]);
		const rediscover = async () => {
			sharedDiscoveries++;
			const results = await Promise.allSettled([...discoveryHandlers].map(handler => handler()));
			return results.every(result => result.status === 'fulfilled');
		};
		const sharedStartup = options.sharedStartupFirst ? rediscover() : undefined;
		instantiation.stub(IStorageService, options.storage ?? store.add(new InMemoryStorageService()));
		instantiation.stub(IUserDataProfileService, new class extends mock<IUserDataProfileService>() {
			override readonly currentProfile = new class extends mock<IUserDataProfile>() {
				override readonly id = profileId;
			}();
		}());
		instantiation.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConfiguredEntries = Event.None;
			override readonly onDidChangeConnections = connectionsChanged.event;
			override get connections() { return [...connections.values()]; }
			override getConnection() { return undefined; }
		}());
		const configuration = new TestConfigurationService({
			[RemoteAgentHostsEnabledSettingId]: true,
			[RemoteAgentHostAutoConnectSettingId]: options.autoConnect ?? true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(ISessionsProvidersService, { onDidChangeProviders: providerChanges.event });
		instantiation.stub(INotificationService, new TestNotificationService());
		instantiation.stub(ILogService, store.add(new NullLogService()));
		instantiation.stub(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
			override registerDiscoveryHandler(handler: () => Promise<void>) {
				discoveryHandlers.add(handler);
				return toDisposable(() => discoveryHandlers.delete(handler));
			}
			override rediscover() { return rediscover(); }
		}());
		instantiation.stub(IMissionControlEnvironmentService, new class extends mock<IMissionControlEnvironmentService>() {
			override readonly hosts = hosts;
			override readonly enabled = true;
			override get accountKey() { return account; }
			override async refresh() { actions.push('discover'); await options.refresh?.(); }
			override async connect(id: string) {
				actions.push(`connect:${id}`);
				if (options.connect) {
					await options.connect();
				}
				const address = `cloudsandbox:${id}`;
				connections.set(address, { address, name: id, status: RemoteAgentHostConnectionStatus.connected });
				connectionsChanged.fire();
			}
			override async disconnect(id: string) {
				actions.push(`disconnect:${id}`);
				connections.delete(`cloudsandbox:${id}`);
				connectionsChanged.fire();
			}
		}());
		const contribution = store.add(instantiation.createInstance(class extends MissionControlAgentHostContribution {
			protected override get isWebPlatform(): boolean { return options.web ?? false; }
			protected override _createProvider(address: string, name: string, options: IEntryDrivenProviderOptions) {
				const provider = new TestProvider(address, name, options);
				const resources = new DisposableStore();
				resources.add(provider);
				this._providerInstances.set(address, provider);
				resources.add(toDisposable(() => this._providerInstances.delete(address)));
				this._providerStores.set(address, resources);
				created.push({ provider, options });
				return provider;
			}
		}));
		return {
			hosts, created, actions, contribution, configuration, sharedProjects, recentQueries, providerChanges, rediscover, sharedStartup,
			setRecentFolders: (folders: readonly URI[]) => { recentFolders = folders; recentChanges.fire(); },
			getDiscoveryCounts: () => ({ sharedDiscoveries, tunnelDiscoveries, missionControlDiscoveries: actions.filter(action => action === 'discover').length }),
			changeAccount: () => { hosts.set([], undefined); connections.clear(); account = 'second'; },
		};
	}

	test('publishes only local-disk picker recents and updates them when history or picker settings change', async () => {
		const f = fixture();
		const first = URI.file('/home/test/code/first');
		const second = URI.file('/another-drive/second');
		f.setRecentFolders([first, URI.parse('vscode-agent-host://remote/remote-folder'), URI.parse('vscode-remote://ssh-remote+host/folder'), second]);
		f.setRecentFolders([second]);
		f.providerChanges.fire({ added: [], removed: [] });
		await f.configuration.setUserConfiguration(UNIFIED_WORKSPACE_PICKER_SETTING, true);
		f.configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: section => section === UNIFIED_WORKSPACE_PICKER_SETTING,
		}));
		assert.deepStrictEqual({
			projects: f.sharedProjects,
			lastQuery: f.recentQueries.at(-1),
		}, {
			projects: [[], [first.toString(), second.toString()], [second.toString()], [second.toString()], [second.toString()]],
			lastQuery: { includeVSCode: true, collapseWorktrees: true },
		});
	});

	for (const { name, web, autoConnect, connects } of [
		{ name: 'web', web: true, autoConnect: true, connects: true },
		{ name: 'web with auto-connect disabled', web: true, autoConnect: false, connects: false },
		{ name: 'desktop', web: false, autoConnect: true, connects: false },
	]) {
		test(`discovers online and offline native hosts on ${name}`, async () => {
			const { hosts, created, actions, rediscover } = fixture('profile', { web, autoConnect });
			hosts.set([
				{ id: 'online', name: 'Online Machine', kind: 'user-local', status: 'online' },
				{ id: 'offline', name: 'Offline Machine', kind: 'user-local', status: 'offline' },
			], undefined);
			await rediscover();
			assert.deepStrictEqual({
				addresses: created.map(entry => entry.provider.remoteAddress),
				statuses: created.map(entry => entry.provider.connectionStatus.get().kind),
				connects: actions.filter(action => action.startsWith('connect:')),
				discoveries: actions.filter(action => action === 'discover').length,
			}, {
				addresses: ['cloudsandbox:online', 'cloudsandbox:offline'],
				statuses: [connects ? 'connected' : 'disconnected', 'disconnected'],
				connects: connects ? ['connect:online'] : [],
				discoveries: 1,
			});
		});
	}

	for (const sharedStartupFirst of [true, false]) {
		test(`startup discovery does not repeat tunnel discovery (${sharedStartupFirst ? 'tunnel' : 'Mission Control'} first)`, async () => {
			const gate = new DeferredPromise<void>();
			const context = fixture('profile', { sharedStartupFirst, refresh: () => gate.p });
			const sharedStartup = context.sharedStartup ?? context.rediscover();
			const pending = context.getDiscoveryCounts();
			await gate.complete();
			await sharedStartup;
			await context.rediscover();
			assert.deepStrictEqual({ pending, refreshed: context.getDiscoveryCounts() }, {
				pending: { sharedDiscoveries: 1, tunnelDiscoveries: 1, missionControlDiscoveries: 1 },
				refreshed: { sharedDiscoveries: 2, tunnelDiscoveries: 2, missionControlDiscoveries: 2 },
			});
		});
	}

	test('joins pending web connections across rediscovery and explicit connect', async () => {
		const gate = new DeferredPromise<void>();
		const { hosts, created, actions, rediscover } = fixture('profile', { web: true, connect: () => gate.p });
		const host: IMissionControlHost = { id: 'environment', name: 'Machine', kind: 'user-local', status: 'online' };
		hosts.set([host], undefined);
		const status = created[0].provider.connectionStatus.get().kind;
		hosts.set([{ ...host }], undefined);
		await rediscover();
		const explicit = created[0].provider.connect();
		await gate.complete();
		await explicit;
		assert.deepStrictEqual({
			status, finalStatus: created[0].provider.connectionStatus.get().kind,
			connects: actions.filter(action => action.startsWith('connect:')),
		}, { status: 'connecting', finalStatus: 'connected', connects: ['connect:environment'] });
	});

	test('web disconnect suppression survives refresh and reload and is isolated by account and profile', async () => {
		const storage = store.add(new InMemoryStorageService());
		const first = fixture('profile', { web: true, storage });
		const host: IMissionControlHost = { id: 'environment', name: 'Machine', kind: 'user-local', status: 'online' };
		first.hosts.set([host], undefined);
		await first.created[0].provider.connect();
		await first.created[0].provider.disconnect();
		first.hosts.set([{ ...host }], undefined);
		await first.rediscover();
		const reopened = fixture('profile', { web: true, storage });
		reopened.hosts.set([host], undefined);
		const suppressed = reopened.created[0].provider.connectionStatus.get().kind;
		await reopened.created[0].provider.connect();
		await reopened.created[0].provider.disconnect();
		reopened.changeAccount();
		reopened.hosts.set([host], undefined);
		const otherProfile = fixture('other', { web: true, storage });
		otherProfile.hosts.set([host], undefined);
		assert.deepStrictEqual({
			firstConnects: first.actions.filter(action => action.startsWith('connect:')),
			suppressed,
			reopenedConnects: reopened.actions.filter(action => action.startsWith('connect:')),
			otherProfileConnects: otherProfile.actions.filter(action => action.startsWith('connect:')),
		}, {
			firstConnects: ['connect:environment'], suppressed: 'disconnected',
			reopenedConnects: ['connect:environment', 'connect:environment'],
			otherProfileConnects: ['connect:environment'],
		});
	});

	test('enabling web auto-connect connects already discovered online hosts', async () => {
		const { hosts, actions, configuration } = fixture('profile', { web: true, autoConnect: false });
		hosts.set([{ id: 'environment', name: 'Machine', kind: 'user-local', status: 'online' }], undefined);
		const before = [...actions];
		await configuration.setUserConfiguration(RemoteAgentHostAutoConnectSettingId, true);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(key: string) { return key === RemoteAgentHostAutoConnectSettingId; }
		}());
		assert.deepStrictEqual({ before, after: actions }, {
			before: ['discover'], after: ['discover', 'connect:environment'],
		});
	});

	test('discovery failures report failure to the shared rediscovery surface', async () => {
		const { rediscover } = fixture('profile', { refresh: async () => { throw new Error('Discovery unavailable'); } });
		assert.strictEqual(await rediscover(), false);
	});

	test('failed automatic connections retain a disconnected host for explicit retry', async () => {
		const { hosts, created } = fixture('profile', { web: true, connect: async () => { throw new Error('Connection unavailable'); } });
		hosts.set([{ id: 'environment', name: 'Machine', kind: 'user-local', status: 'online' }], undefined);
		await assert.rejects(created[0].provider.connect(), /Connection unavailable/);
		assert.deepStrictEqual({
			providers: created.length, disposed: created[0].provider.disposed,
			status: created[0].provider.connectionStatus.get().kind,
		}, { providers: 1, disposed: false, status: 'disconnected' });
	});

	test('connection completion after disposal does not recreate environment providers', async () => {
		const gate = new DeferredPromise<void>();
		const { hosts, created, contribution } = fixture('profile', { connect: () => gate.p });
		hosts.set([{ id: 'environment', name: 'Machine', kind: 'user-local', status: 'online' }], undefined);
		const connection = created[0].provider.connect();
		contribution.dispose();
		await gate.complete();
		await connection;
		assert.deepStrictEqual({
			providers: created.length, disposed: created[0].provider.disposed,
		}, { providers: 1, disposed: true });
	});

	test('connection UI uses environment terminology without relay jargon', () => {
		const { hosts, created } = fixture();
		hosts.set([{ id: 'environment', name: 'Machine', kind: 'user-local', status: 'online' }], undefined);
		const labels = created[0].options.connectionLabels!;
		assert.deepStrictEqual({ ...labels, reconnectingIn: labels.reconnectingIn!(5) }, {
			unavailableTitle: 'Environment Disconnected',
			unavailableDescription: 'Start the environment\'s owning application, then reconnect. This does not start or replace its compute.',
			unavailable: 'Environment disconnected.',
			connectingTitle: 'Connecting to Environment',
			connecting: 'Connecting to the environment...',
			reconnecting: 'Reconnecting to the environment...',
			reconnectingIn: 'Reconnecting to the environment in 5s...',
			incompatibleTitle: 'Environment Incompatible',
			incompatible: 'The environment\'s Agent Host Protocol version is incompatible.',
		});
	});

	test('host descriptions contain only availability even for duplicate names', () => {
		const { hosts, created } = fixture();
		const host: IMissionControlHost = { id: 'env_11111111', name: 'Machine', kind: 'user-local', status: 'online' };
		hosts.set([host], undefined);
		const description = created[0].options.hostDescription!;
		const online = description.get();
		hosts.set([{ ...host, status: 'offline' }], undefined);
		const offline = description.get();
		hosts.set([host, { ...host, id: 'env_22222222' }], undefined);
		const duplicates = created.map(entry => entry.options.hostDescription!.get());
		hosts.set([{ ...host, displayName: 'Renamed' }, { ...host, id: 'env_22222222' }], undefined);
		assert.deepStrictEqual({ online, offline, duplicates, renamed: description.get() }, {
			online: 'Online', offline: 'Offline', duplicates: ['Online', 'Online'], renamed: 'Online',
		});
	});

	test('registers disconnected native hosts before AHP, preserves them across rename and disconnect, and withdraws deleted hosts', async () => {
		const { hosts, created, actions } = fixture();
		const host: IMissionControlHost = { id: 'environment', name: 'Machine', kind: 'user-local', status: 'offline' };
		hosts.set([host], undefined);
		const original = created[0].provider;
		hosts.set([{ ...host, name: 'Renamed Machine' }], undefined);
		const renamed = { label: original.label, count: created.length, disposed: original.disposed };
		await created[0].options.connectOnDemand!();
		await created[0].options.disconnectOnDemand!();
		const disconnected = { count: created.length, disposed: original.disposed };
		const canRemove = created[0].options.canRemove;
		const removal = created[0].options.removeOnDemand;
		hosts.set([], undefined);
		assert.deepStrictEqual({
			status: original.connectionStatus.get().kind, renamed, disconnected, deletedProviderDisposed: original.disposed,
			providers: created.length, canRemove, removal, actions, alias: created[0].options.sessionSchemeAlias,
			retained: created[0].options.retainSessionsOnDisconnect, readOnly: created[0].options.readOnlyWhenDisconnected,
		}, {
			status: 'disconnected', renamed: { label: 'Renamed Machine', count: 1, disposed: false },
			disconnected: { count: 1, disposed: false }, deletedProviderDisposed: true, providers: 1, canRemove: false, removal: undefined,
			actions: ['discover', 'connect:environment', 'disconnect:environment'],
			alias: undefined, retained: true, readOnly: true,
		});
	});

	test('account withdrawal disposes old providers and scopes summaries without changing addresses', () => {
		const { hosts, created, changeAccount } = fixture();
		const host: IMissionControlHost = { id: 'environment', name: 'Machine', kind: 'user-local', status: 'online' };
		hosts.set([host], undefined);
		changeAccount();
		hosts.set([host], undefined);
		assert.deepStrictEqual({
			disposed: created[0].provider.disposed,
			addresses: created.map(entry => entry.provider.remoteAddress),
			caches: created.map(entry => entry.options.sessionCacheKey),
		}, {
			disposed: true, addresses: ['cloudsandbox:environment', 'cloudsandbox:environment'],
			caches: ['missionControl.userLocalSessions.v1.profile.first.environment', 'missionControl.userLocalSessions.v1.profile.second.environment'],
		});
	});

	test('different profiles isolate summaries without changing the host routing address', () => {
		const first = fixture('first-profile');
		const second = fixture('second-profile');
		const host: IMissionControlHost = { id: 'environment', name: 'Machine', kind: 'user-local', status: 'online' };
		first.hosts.set([host], undefined);
		second.hosts.set([host], undefined);
		assert.deepStrictEqual({
			addresses: [first.created[0].provider.remoteAddress, second.created[0].provider.remoteAddress],
			keys: [first.created[0].options.sessionCacheKey, second.created[0].options.sessionCacheKey],
		}, {
			addresses: ['cloudsandbox:environment', 'cloudsandbox:environment'],
			keys: ['missionControl.userLocalSessions.v1.first-profile.first.environment', 'missionControl.userLocalSessions.v1.second-profile.first.environment'],
		});
	});

	test('old-account host actions cannot connect or disconnect the replacement account host', async () => {
		const { hosts, created, changeAccount, actions } = fixture();
		const host: IMissionControlHost = { id: 'environment', name: 'Machine', kind: 'user-local', status: 'online' };
		hosts.set([host], undefined);
		const old = created[0].options;
		changeAccount();
		hosts.set([host], undefined);
		await assert.rejects(old.connectOnDemand!(), CancellationError);
		await assert.rejects(old.disconnectOnDemand!(), CancellationError);
		assert.throws(() => old.setDisplayName!('Stale rename'), CancellationError);
		assert.deepStrictEqual(actions, ['discover']);
	});
});
