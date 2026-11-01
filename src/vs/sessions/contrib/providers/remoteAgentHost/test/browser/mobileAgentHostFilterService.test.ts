/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { AgentHostFilterService } from '../../../../../services/agentHostFilter/browser/agentHostFilterService.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { MobileAgentHostFilterService } from '../../browser/mobileAgentHostFilterService.js';

suite('MobileAgentHostFilterService isolation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const cloud = { id: 'githubsandbox', label: 'GitHub Sandboxes', connectable: false, sessionCreationProviderId: 'cloud-creation', order: 1 };

	function create(mobile: boolean) {
		const changed = store.add(new Emitter<ISessionsProvidersChangeEvent>());
		const providers = [upcastPartial<IAgentHostSessionsProvider>({
			id: 'agenthost-computer', label: 'Computer', icon: Codicon.remote,
			remoteAddress: 'tunnel:computer',
			connectionStatus: constObservable(RemoteAgentHostConnectionStatus.connected),
		})];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			onDidChangeProviders: changed.event, getProviders: () => providers,
			getProvider: () => undefined,
		}));
		instantiationService.stub(IRemoteAgentHostService, upcastPartial<IRemoteAgentHostService>({
			onDidChangeConfiguredEntries: Event.None, configuredEntries: [],
		}));
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		return store.add(mobile
			? instantiationService.createInstance(MobileAgentHostFilterService)
			: instantiationService.createInstance(AgentHostFilterService));
	}

	for (const mobile of [false, true]) {
		test(`${mobile ? 'mobile' : 'full'} default and label stay entry-specific after delayed Cloud discovery`, () => {
			const service = create(mobile);
			const before = service.selectedHostId;
			const registration = store.add(service.registerHostGroup(cloud));
			const after = service.selectedHostId;
			const entry = service.hosts.find(host => host.id === cloud.id)!;
			registration.dispose();
			assert.deepStrictEqual({ before, after, removed: service.selectedHostId, label: entry.label, description: entry.description }, {
				before: isWeb ? 'agenthost-computer' : undefined,
				after: isWeb ? mobile ? cloud.id : 'agenthost-computer' : undefined,
				removed: isWeb ? 'agenthost-computer' : undefined,
				label: mobile ? 'Cloud' : 'GitHub Sandboxes',
				description: mobile ? 'GitHub Sandboxes' : undefined,
			});
		});

		test(`${mobile ? 'mobile' : 'full'} preserves an explicit computer selection`, () => {
			const service = create(mobile);
			service.setSelectedHostId('agenthost-computer');
			store.add(service.registerHostGroup(cloud));
			assert.strictEqual(service.selectedHostId, isWeb ? 'agenthost-computer' : undefined);
		});
	}
});
