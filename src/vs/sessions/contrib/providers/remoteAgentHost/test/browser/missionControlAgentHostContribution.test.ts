/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { IMissionControlEnvironmentService, IMissionControlHost } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
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
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ConnectMissionControlEnvironmentCommand } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/missionControlEnvironmentActions.js';
import { Menus } from '../../../../../browser/menus.js';

class TestProvider extends mock<RemoteAgentHostSessionsProvider>() {
	override readonly connectionStatus = observableValue<RemoteAgentHostConnectionStatus>(this, RemoteAgentHostConnectionStatus.disconnected);
	disposed = false;
	constructor(override readonly remoteAddress: string, private name: string) { super(); }
	override get defaultLabel(): string { return this.name; }
	override get label(): string { return this.name; }
	override setLabel(name: string): void { this.name = name; }
	override setConnectionStatus(status: RemoteAgentHostConnectionStatus): void { this.connectionStatus.set(status, undefined); }
	override dispose(): void { this.disposed = true; }
}

suite('Mission Control native provider inventory', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
			const availability = [MenuId.CommandPalette, Menus.SessionWorkspaceManage].map(menu => {
				const item = MenuRegistry.getMenuItems(menu).filter(isIMenuItem).find(item => item.command.id === ConnectMissionControlEnvironmentCommand);
				assert.ok(item);
				return (item.when?.evaluate(context) ?? true) && (item.command.precondition?.evaluate(context) ?? true);
			});
			assert.deepStrictEqual(availability, [available, available]);
		});
	}

	function fixture(profileId = 'profile') {
		const instantiation = store.add(new TestInstantiationService());
		const hosts = observableValue<readonly IMissionControlHost[]>('hosts', []);
		let account = 'first';
		const created: { provider: TestProvider; options: IEntryDrivenProviderOptions }[] = [];
		const actions: string[] = [];
		instantiation.stub(IUserDataProfileService, new class extends mock<IUserDataProfileService>() {
			override readonly currentProfile = new class extends mock<IUserDataProfile>() {
				override readonly id = profileId;
			}();
		}());
		instantiation.stub(IRemoteAgentHostService, {
			onDidChangeConfiguredEntries: Event.None, onDidChangeConnections: Event.None, connections: [],
		});
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(ISessionsProvidersService, {});
		instantiation.stub(INotificationService, new TestNotificationService());
		instantiation.stub(ILogService, store.add(new NullLogService()));
		instantiation.stub(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
			override registerDiscoveryHandler() { return toDisposable(() => { }); }
		}());
		instantiation.stub(IMissionControlEnvironmentService, new class extends mock<IMissionControlEnvironmentService>() {
			override readonly hosts = hosts;
			override readonly enabled = true;
			override get accountKey() { return account; }
			override async refresh() { actions.push('discover'); }
			override async connect(id: string) { actions.push(`connect:${id}`); }
			override async disconnect(id: string) { actions.push(`disconnect:${id}`); }
			override async hide(id: string) {
				actions.push(`hide:${id}`);
				hosts.set(hosts.get().map(host => ({ ...host, hidden: true })), undefined);
			}
		}());
		const contribution = store.add(instantiation.createInstance(class extends MissionControlAgentHostContribution {
			protected override _createProvider(address: string, name: string, options: IEntryDrivenProviderOptions) {
				const provider = new TestProvider(address, name);
				const resources = new DisposableStore();
				resources.add(provider);
				this._providerInstances.set(address, provider);
				resources.add(toDisposable(() => this._providerInstances.delete(address)));
				this._providerStores.set(address, resources);
				created.push({ provider, options });
				return provider;
			}
		}));
		return { hosts, created, actions, contribution, changeAccount: () => { hosts.set([], undefined); account = 'second'; } };
	}

	test('registers disconnected native hosts before AHP and preserves provider lifetime across rename and hide/restore', async () => {
		const { hosts, created, actions } = fixture();
		const host: IMissionControlHost = { id: 'environment', name: 'Machine', kind: 'user-local', status: 'offline' };
		hosts.set([host], undefined);
		const original = created[0].provider;
		hosts.set([{ ...host, name: 'Renamed Machine' }], undefined);
		const renamed = { label: original.label, count: created.length, disposed: original.disposed };
		await created[0].options.connectOnDemand!();
		await created[0].options.disconnectOnDemand!();
		const disconnected = { count: created.length, disposed: original.disposed };
		await created[0].options.removeOnDemand!();
		hosts.set([host], undefined);
		assert.deepStrictEqual({
			status: original.connectionStatus.get().kind, renamed, disconnected, hiddenProviderDisposed: original.disposed,
			restoredProviders: created.length, actions, alias: created[0].options.sessionSchemeAlias,
			retained: created[0].options.retainSessionsOnDisconnect, readOnly: created[0].options.readOnlyWhenDisconnected,
		}, {
			status: 'disconnected', renamed: { label: 'Renamed Machine', count: 1, disposed: false },
			disconnected: { count: 1, disposed: false }, hiddenProviderDisposed: true, restoredProviders: 2,
			actions: ['discover', 'connect:environment', 'disconnect:environment', 'hide:environment'],
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

	test('old-account host actions cannot connect, hide or disconnect the replacement account host', async () => {
		const { hosts, created, changeAccount, actions } = fixture();
		const host: IMissionControlHost = { id: 'environment', name: 'Machine', kind: 'user-local', status: 'online' };
		hosts.set([host], undefined);
		const old = created[0].options;
		changeAccount();
		hosts.set([host], undefined);
		await assert.rejects(old.connectOnDemand!(), CancellationError);
		await assert.rejects(old.disconnectOnDemand!(), CancellationError);
		await assert.rejects(old.removeOnDemand!(), CancellationError);
		assert.throws(() => old.setDisplayName!('Stale rename'), CancellationError);
		assert.deepStrictEqual(actions, ['discover']);
	});
});
