/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostAdvertisedAuthenticationResolver } from '../../../../../../platform/agentHost/common/agentHostAdvertisedAuthentication.js';
import { type IExtensionRemoteAgentHost, IExtensionRemoteAgentHostsService, toExtensionRemoteAgentHostEntry } from '../../../../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { IWSLRemoteAgentHostService } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { ISessionsProvidersService } from '../../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution, IEntryDrivenProviderOptions } from '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/entryDrivenProviderContribution.js';
import { RemoteAgentHostSessionsProvider } from '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remoteAgentHostSessionsProvider.js';
import { SSHAgentHostContribution } from '../../browser/sshAgentHost.contribution.js';
import { WebSocketAgentHostContribution } from '../../browser/webSocketAgentHost.contribution.js';
import { WSLAgentHostContribution } from '../../browser/wslAgentHost.contribution.js';

suite('Entry-driven remote provider lifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('SSH and WSL reconcile offline registrations without a connection event', async () => {
		const instantiation = store.add(new TestInstantiationService());
		const changes = store.add(new Emitter<void>());
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IRemoteAgentHostService, { onDidChangeConfiguredEntries: changes.event, onDidChangeConnections: Event.None });
		instantiation.stub(ISSHRemoteAgentHostService, { disconnectedEntries: constObservable([]) });
		instantiation.stub(IWSLRemoteAgentHostService, {});
		instantiation.stub(ISessionsProvidersService, {});
		instantiation.stub(INotificationService, new TestNotificationService());
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(ITelemetryService, NullTelemetryService);
		const reconciled: string[] = [];
		class TestSSHContribution extends SSHAgentHostContribution {
			protected override _reconcile() { reconciled.push('ssh'); }
		}
		class TestWSLContribution extends WSLAgentHostContribution {
			protected override _reconcile() { reconciled.push('wsl'); }
		}
		store.add(instantiation.createInstance(TestSSHContribution));
		store.add(instantiation.createInstance(TestWSLContribution));
		reconciled.length = 0;
		changes.fire();
		await timeout(0);
		assert.deepStrictEqual(reconciled, ['ssh', 'wsl']);
	});

	test('hands an already-configured host to an extension that registers its address and back, through configured entries alone', () => {
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const changes = store.add(new Emitter<void>());
		const address = '127.0.0.1:8445';
		const configured: IRemoteAgentHostEntry = { name: 'Jobs', connection: { type: RemoteAgentHostEntryType.WebSocket, address } };
		const registered: IRemoteAgentHostEntry = { name: 'Jobs', connection: { type: RemoteAgentHostEntryType.Extension, address, extensionId: 'publisher.jobs', extensionDisplayName: 'Job Runner' } };
		let configuredEntries: readonly IRemoteAgentHostEntry[] = [configured];
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IRemoteAgentHostService, {
			get configuredEntries() { return configuredEntries; },
			onDidChangeConfiguredEntries: changes.event, onDidChangeConnections: Event.None, connections: [],
			registerConnectionFactory: () => Disposable.None,
		});
		instantiation.stub(IExtensionRemoteAgentHostsService, { connectableEntries: constObservable([]), hosts: constObservable([]), disconnectedAddresses: constObservable(new Set<string>()) });
		instantiation.stub(IEnvironmentService, {});
		instantiation.stub(IAgentHostAdvertisedAuthenticationResolver, {});
		instantiation.stub(ISessionsProvidersService, {});
		instantiation.stub(INotificationService, new TestNotificationService());
		const events: string[] = [];
		class TestContribution extends WebSocketAgentHostContribution {
			protected override _createProvider(address: string, name: string, options: IEntryDrivenProviderOptions) {
				const owner = options.canRemove === false ? 'extension' : 'settings';
				const provider = new class extends mock<RemoteAgentHostSessionsProvider>() {
					override get defaultLabel() { return name; }
					override dispose() { events.push(`dispose ${owner}`); }
				}();
				const resources = new DisposableStore();
				resources.add(provider);
				this._providerInstances.set(address, provider);
				resources.add(toDisposable(() => this._providerInstances.delete(address)));
				this._providerStores.set(address, resources);
				events.push(`create ${owner}`);
				return provider;
			}
		}
		store.add(instantiation.createInstance(TestContribution));
		configuredEntries = [registered];
		changes.fire();
		configuredEntries = [configured];
		changes.fire();
		assert.deepStrictEqual(events, ['create settings', 'dispose settings', 'create extension', 'dispose extension', 'create settings']);
	});

	test('keeps the provider of an extension host the user disconnected, unlisting its sessions, until its registration ends', () => {
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const changes = store.add(new Emitter<void>());
		const host: IExtensionRemoteAgentHost = { address: '127.0.0.1:8445', name: 'Jobs', extensionId: 'publisher.jobs', extensionDisplayName: 'Job Runner' };
		const hosts = observableValue<readonly IExtensionRemoteAgentHost[]>('hosts', [host]);
		const disconnectedAddresses = observableValue<ReadonlySet<string>>('disconnectedAddresses', new Set());
		let configuredEntries: readonly IRemoteAgentHostEntry[] = [toExtensionRemoteAgentHostEntry(host)];
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IRemoteAgentHostService, {
			get configuredEntries() { return configuredEntries; },
			onDidChangeConfiguredEntries: changes.event, onDidChangeConnections: Event.None, connections: [],
			registerConnectionFactory: () => Disposable.None,
		});
		instantiation.stub(IExtensionRemoteAgentHostsService, { connectableEntries: constObservable([]), hosts, disconnectedAddresses });
		instantiation.stub(IEnvironmentService, {});
		instantiation.stub(IAgentHostAdvertisedAuthenticationResolver, {});
		instantiation.stub(ISessionsProvidersService, {});
		instantiation.stub(INotificationService, new TestNotificationService());
		const providers: { readonly address: string; status?: string; sessionsListed: boolean; disposed: boolean }[] = [];
		class TestContribution extends WebSocketAgentHostContribution {
			protected override _createProvider(address: string, name: string) {
				const state: { readonly address: string; status?: string; sessionsListed: boolean; disposed: boolean } = { address, sessionsListed: true, disposed: false };
				providers.push(state);
				const provider = new class extends mock<RemoteAgentHostSessionsProvider>() {
					override get defaultLabel() { return name; }
					override setConnectionStatus(status: RemoteAgentHostConnectionStatus) { state.status = status.kind; }
					override unpublishCachedSessions() { state.sessionsListed = false; }
					override dispose() { state.disposed = true; }
				}();
				const resources = new DisposableStore();
				resources.add(provider);
				this._providerInstances.set(address, provider);
				resources.add(toDisposable(() => this._providerInstances.delete(address)));
				this._providerStores.set(address, resources);
				return provider;
			}
		}
		store.add(instantiation.createInstance(TestContribution));

		// The service no longer dials a host the user disconnected, so it has no configured entry.
		configuredEntries = [];
		disconnectedAddresses.set(new Set([host.address]), undefined);
		changes.fire();
		const afterDisconnect = providers.map(provider => ({ ...provider }));
		hosts.set([], undefined);
		assert.deepStrictEqual({ afterDisconnect, afterUnregister: providers }, {
			afterDisconnect: [{ address: host.address, status: 'disconnected', sessionsListed: false, disposed: false }],
			afterUnregister: [{ address: host.address, status: 'disconnected', sessionsListed: false, disposed: true }],
		});
	});

	for (const kind of [RemoteAgentHostEntryType.SSH, RemoteAgentHostEntryType.WSL]) {
		test(`${kind} name changes rebuild the connect callback rather than reconnecting with a stale name`, async () => {
			const instantiation = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiation.stub(IConfigurationService, configuration);
			instantiation.stub(IRemoteAgentHostService, { connections: [] });
			instantiation.stub(ISessionsProvidersService, {});
			instantiation.stub(INotificationService, new TestNotificationService());
			const names: string[] = [];
			const created: { readonly provider: RemoteAgentHostSessionsProvider; readonly options: IEntryDrivenProviderOptions }[] = [];
			class TestContribution extends EntryDrivenProviderContribution {
				protected readonly _entryType = kind;
				entries: readonly IRemoteAgentHostEntry[] = [];

				constructor(
					@IRemoteAgentHostService remote: IRemoteAgentHostService,
					@IConfigurationService config: IConfigurationService,
					@ISessionsProvidersService providers: ISessionsProvidersService,
					@INotificationService notifications: INotificationService,
				) {
					super(remote, config, instantiation, providers, notifications);
				}

				protected override _getProviderEntries() { return this.entries; }
				protected _getProviderOptions(entry: IRemoteAgentHostEntry) {
					return { connectOnDemand: async () => { names.push(entry.name); } };
				}
				reconcile(): void { this._reconcile(); }
				protected override _createProvider(address: string, name: string, options: IEntryDrivenProviderOptions) {
					const provider = new class extends mock<RemoteAgentHostSessionsProvider>() {
						override get defaultLabel() { return name; }
						disposed = false;
						override dispose() { this.disposed = true; }
					}();
					const resources = new DisposableStore();
					resources.add(provider);
					this._providerInstances.set(address, provider);
					resources.add(toDisposable(() => this._providerInstances.delete(address)));
					this._providerStores.set(address, resources);
					created.push({ provider, options });
					return provider;
				}
			}
			const contribution = store.add(instantiation.createInstance(TestContribution));
			const connection: IRemoteAgentHostEntry['connection'] = kind === RemoteAgentHostEntryType.SSH
				? { type: RemoteAgentHostEntryType.SSH, address: 'ssh:machine', hostName: 'machine', sshConfigHost: 'machine' }
				: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' };
			contribution.entries = [{ name: 'Original machine', connection }];
			contribution.reconcile();
			contribution.entries = [{ name: 'Updated machine', connection }];
			contribution.reconcile();
			await created[1].options.connectOnDemand!();
			assert.deepStrictEqual({ providers: created.length, names }, { providers: 2, names: ['Updated machine'] });
		});
	}
});
