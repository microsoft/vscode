/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { EntryDrivenProviderContribution, IEntryDrivenProviderOptions } from '../../browser/entryDrivenProviderContribution.js';
import { RemoteAgentHostSessionsProvider } from '../../browser/remoteAgentHostSessionsProvider.js';

suite('Entry-driven remote provider lifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
