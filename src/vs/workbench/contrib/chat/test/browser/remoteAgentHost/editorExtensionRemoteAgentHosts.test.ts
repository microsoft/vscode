/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostAdvertisedAuthenticationResolver } from '../../../../../../platform/agentHost/common/agentHostAdvertisedAuthentication.js';
import { IExtensionRemoteAgentHostsService } from '../../../../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { type IRemoteAgentHostConnectionFactory, type IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { EditorExtensionRemoteAgentHostsContribution } from '../../../browser/remoteAgentHost/editorExtensionRemoteAgentHosts.js';

suite('EditorExtensionRemoteAgentHostsContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function registeredFactories(isSessionsWindow: boolean, connectableEntries: readonly IRemoteAgentHostEntry[]) {
		const factories: IRemoteAgentHostConnectionFactory[] = [];
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IWorkbenchEnvironmentService, { isSessionsWindow });
		instantiation.stub(IExtensionRemoteAgentHostsService, { connectableEntries: constObservable(connectableEntries) });
		instantiation.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
			override registerConnectionFactory(factory: IRemoteAgentHostConnectionFactory) {
				factories.push(factory);
				return toDisposable(() => factories.splice(factories.indexOf(factory), 1));
			}
		}());
		instantiation.stub(IConfigurationService, {});
		instantiation.stub(IAgentHostAdvertisedAuthenticationResolver, {});
		store.add(instantiation.createInstance(EditorExtensionRemoteAgentHostsContribution));
		return factories.map(factory => ({ kind: factory.kind, entries: factory.entries.get().map(entry => entry.connection) }));
	}

	test('an editor window connects to the hosts its extensions register, and the Agents window leaves them to its own contribution', () => {
		const registered: IRemoteAgentHostEntry = { name: 'Jobs', connection: { type: RemoteAgentHostEntryType.Extension, address: 'localhost:8445', extensionId: 'publisher.jobs', extensionDisplayName: 'Jobs' } };
		assert.deepStrictEqual({
			editorWindow: registeredFactories(false, [registered]),
			agentsWindow: registeredFactories(true, [registered]),
		}, {
			editorWindow: [{ kind: RemoteAgentHostEntryType.Extension, entries: [registered.connection] }],
			agentsWindow: [],
		});
	});
});
