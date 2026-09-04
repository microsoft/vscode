/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { createAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { CustomizationType, SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService, ILoggerService, NullLogService, NullLoggerService } from '../../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { WorkbenchAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { MockPromptsService } from '../../common/promptSyntax/service/mockPromptsService.js';

suite('WorkbenchAgentHostCustomizationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps host and client root spaces distinct through hydration and subscription errors', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILoggerService, store.add(new NullLoggerService()));
		instantiationService.stub(IOutputService, {
			getChannel: () => undefined,
			getChannelDescriptor: () => undefined,
			showChannel: async () => { },
		});
		const subscriptionChanged = store.add(new Emitter<void>());
		const subscriptionError = store.add(new Emitter<Error>());
		const subscription = {
			value: undefined as SessionState | Error | undefined,
			verifiedValue: undefined as SessionState | undefined,
			onDidChange: subscriptionChanged.event,
			onDidError: subscriptionError.event,
		} as unknown as IAgentSubscription<SessionState> & { value: SessionState | Error | undefined; verifiedValue: SessionState | undefined };
		const connection = {
			onDidAction: Event.None,
			rootState: { value: undefined },
			resourceUris: createAgentHostResourceUriMapper('remote-test'),
			getSubscription: () => ({ object: subscription, dispose: () => { } }),
		} as unknown as IAgentConnection;
		let backend = URI.parse('agent-host:/provisional-a');
		let provisionalRoots = [URI.file('/provisional')];
		const provisionalChanged = store.add(new Emitter<URI>());
		const provisionalService = {
			onDidChange: provisionalChanged.event,
			get: () => backend,
			getProvisionalWorkingDirectories: () => provisionalRoots,
		} as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService;
		const connectionsService = {
			ambientConnection: connection,
		} as Partial<IAgentHostConnectionsService> as IAgentHostConnectionsService;
		const chatService = {
			onDidDisposeSession: Event.None,
		} as Partial<IChatService> as IChatService;
		const activeClientService = {
			isBundledMcpServer: () => false,
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService;
		const service = store.add(new WorkbenchAgentHostCustomizationService(
			connectionsService,
			provisionalService,
			instantiationService,
			new NullLogService() as ILogService,
			chatService,
			activeClientService,
		));
		let customizationChangeCount = 0;
		store.add(service.onDidChangeCustomizations(() => customizationChangeCount++));
		const session = URI.parse('untitled:chat-session');

		const readRoots = () => ({
			host: service.getWorkingDirectories(session),
			client: service.getWorkingDirectoryUris(session).map(uri => ({ scheme: uri.scheme, authority: uri.authority, path: uri.path })),
		});
		const provisional = readRoots();
		subscription.verifiedValue = {
			workingDirectories: ['file:///verified'],
			customizations: [{
				type: CustomizationType.Directory,
				id: 'workspace-skills',
				uri: 'file:///verified/.github/skills',
				name: 'Workspace Skills',
				contents: CustomizationType.Skill,
				writable: true,
				enabled: true,
			}],
		} as unknown as SessionState;
		subscription.value = subscription.verifiedValue;
		subscriptionChanged.fire();
		const verified = readRoots();
		const itemProvider = store.add(new AgentCustomizationItemProvider(
			'remote-test',
			undefined,
			undefined,
			new class extends mock<IFileService>() { }(),
			new NullLogService(),
			service,
			store.add(new MockPromptsService()),
		));
		const folders = await itemProvider.provideSourceFolders(session, PromptsType.skill, CancellationToken.None);
		subscription.value = { workingDirectories: ['file:///optimistic'], customizations: [] } as unknown as SessionState;
		subscriptionChanged.fire();
		const optimistic = readRoots();
		customizationChangeCount = 0;
		subscription.value = new Error('transient');
		subscriptionError.fire(subscription.value);
		const afterError = readRoots();
		const changesAfterError = customizationChangeCount;
		backend = URI.parse('agent-host:/provisional-b');
		provisionalRoots = [URI.file('/replacement')];
		subscription.value = undefined;
		subscription.verifiedValue = undefined;
		provisionalChanged.fire(session);
		const replacement = readRoots();

		assert.deepStrictEqual({
			provisional,
			verified,
			optimistic,
			afterError,
			changesAfterError,
			replacement,
			folders: folders.map(folder => ({ source: folder.source, uri: folder.uri.toString() })),
		}, {
			provisional: { host: ['file:///provisional'], client: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/provisional' }] },
			verified: { host: ['file:///verified'], client: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/verified' }] },
			optimistic: { host: ['file:///optimistic'], client: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/optimistic' }] },
			afterError: { host: ['file:///verified'], client: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/verified' }] },
			changesAfterError: 1,
			replacement: { host: ['file:///replacement'], client: [{ scheme: 'vscode-agent-host', authority: 'remote-test', path: '/replacement' }] },
			folders: [{ source: 'local', uri: connection.resourceUris.fromAgentHost(URI.parse('file:///verified/.github/skills')).toString() }],
		});
	});
});
