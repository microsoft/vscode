/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ImmortalReference } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { gitHubPullRequestArtifactIntegrationId, gitHubPullRequestArtifactWorkspaceSettingsKey } from '../../../../../../platform/agentHost/common/githubPullRequestArtifact.js';
import { ActionEnvelope, ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { ArtifactSnapshot, IArtifactModel } from '../../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { ArtifactIntegrationServer } from '../../../../../../platform/artifactIntegrations/common/artifactIntegrationProtocol.js';
import { ArtifactIntegrationRegistry, IArtifactIntegrationRegistry } from '../../../../../../platform/artifactIntegrations/common/artifactIntegrationRegistry.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { AgentHostArtifactIntegrations, IArtifactWorkspaceConfigurationContext } from '../../browser/agentHostArtifactIntegrations.js';

suite('Agent Host artifact workspace settings', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('mirrors only workspace overrides into artifact-scoped session configuration and resends after reconnect', async () => {
		const instantiation = workbenchInstantiationService(undefined, store);
		let inspected: IConfigurationValue<readonly string[]> = { userValue: ['Global *'], workspaceValue: ['Workspace *'], workspaceFolderValue: ['Folder *'] };
		const configuration = new class extends TestConfigurationService {
			override inspect<T>(): IConfigurationValue<T> { return inspected as IConfigurationValue<T>; }
		}();
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IArtifactIntegrationRegistry, store.add(new ArtifactIntegrationRegistry()));
		instantiation.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentiment: { hidden: false }, onDidChangeSentiment: Event.None }));
		const snapshot = constObservable<ArtifactSnapshot>({
			authority: { id: 'host', targetHost: 'self', location: 'host' }, session: 'session',
			artifact: { id: 'pr', label: 'PR', resource: 'https://github.com/octo/repo/pull/42' }, runs: [],
			contributions: [{
				integrationId: gitHubPullRequestArtifactIntegrationId, label: 'GitHub', actions: [], options: [],
				configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
				view: { availability: { kind: 'available' }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] },
			}],
		});
		const server = store.add(new ArtifactIntegrationServer({
			acquireArtifact: async () => new ImmortalReference(upcastPartial<IArtifactModel>({ snapshot })),
		}));
		const connected = observableValue('connected', true);
		const actions = store.add(new Emitter<ActionEnvelope>());
		const patches: { channel: string; config: Record<string, unknown> }[] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override readonly initializeResult = constObservable(upcastPartial<InitializeResult>({ _meta: { 'vscode.artifactIntegrations': 1 } }));
			override readonly connectionAvailable = connected;
			override readonly onDidAction = actions.event;
			override readonly onDidArtifactIntegrationUpdate = server.onDidUpdate;
			override artifactIntegrationRequest(request: Parameters<ArtifactIntegrationServer['request']>[0]) { return server.request(request); }
			override dispatch(channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
				if (action.type === ActionType.SessionConfigChanged) {
					patches.push({ channel, config: action.config });
				} else {
					assert.fail(`Unexpected action: ${action.type}`);
				}
			}
		}();
		const integrations = store.add(instantiation.createInstance(AgentHostArtifactIntegrations, 'test-host'));
		integrations.setConnection(connection);
		const workspace = observableValue<IArtifactWorkspaceConfigurationContext | undefined>('workspace', {
			chat: 'chat', workingDirectory: 'file:///repo', resource: URI.file('/repo'),
		});
		const reference = store.add(await integrations.acquireArtifact('session', 'pr', workspace));
		connected.set(false, undefined);
		connected.set(true, undefined);
		actions.fire({ channel: 'another-session', serverSeq: 1, origin: undefined, action: { type: ActionType.SessionConfigChanged, config: {}, replace: true } });
		actions.fire({ channel: 'session', serverSeq: 2, origin: undefined, action: { type: ActionType.SessionConfigChanged, config: {}, replace: true } });
		inspected = { userValue: ['Global *'] };
		workspace.set({ ...workspace.get()!, resource: URI.file('/another-workspace') }, undefined);
		reference.dispose();
		workspace.set(undefined, undefined);
		actions.fire({ channel: 'session', serverSeq: 3, origin: undefined, action: { type: ActionType.SessionConfigChanged, config: {}, replace: true } });
		const key = gitHubPullRequestArtifactWorkspaceSettingsKey('pr');
		assert.deepStrictEqual(patches, [
			{ channel: 'session', config: { [key]: { chat: 'chat', workingDirectory: 'file:///repo', ignoredChecks: ['Folder *'] } } },
			{ channel: 'session', config: { [key]: { chat: 'chat', workingDirectory: 'file:///repo', ignoredChecks: ['Folder *'] } } },
			{ channel: 'session', config: { [key]: { chat: 'chat', workingDirectory: 'file:///repo', ignoredChecks: ['Folder *'] } } },
			{ channel: 'session', config: { [key]: null } },
		]);
	});
});
