/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { agentHostConnectionKinds } from '../../../../../../platform/agentHost/test/common/testAgentHostResourceUriMappers.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType, type SessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { sessionReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { CustomizationEnablementKind, CustomizationType, McpServerStatus, SessionState, SessionStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { buildChatUri, buildDefaultChatUri, createSessionState, withSessionFolderPickerDecision } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILogService, ILoggerService, NullLogService, NullLoggerService } from '../../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { WorkbenchAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { MockPromptsService } from '../../common/promptSyntax/service/mockPromptsService.js';

suite('WorkbenchAgentHostCustomizationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('notifies only when session customization inputs change', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILoggerService, store.add(new NullLoggerService()));
		instantiationService.stub(IOutputService, new class extends mock<IOutputService>() { }());
		const subscriptionChanged = store.add(new Emitter<SessionState>());
		const subscription = {
			value: undefined as SessionState | undefined,
			onDidChange: subscriptionChanged.event,
		} as IAgentSubscription<SessionState> & { value: SessionState | undefined };
		const connection = {
			onDidAction: Event.None,
			rootState: { value: undefined },
			resourceUris: agentHostConnectionKinds[0].resourceUris,
			getSubscription: () => ({ object: subscription, dispose: () => { } }),
		} as unknown as IAgentConnection;
		const backend = URI.parse('agent-host:/session');
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const service = store.add(new WorkbenchAgentHostCustomizationService(
			{ ambientConnection: connection } as Partial<IAgentHostConnectionsService> as IAgentHostConnectionsService,
			{ onDidChange: Event.None, get: () => backend, getProvisionalWorkingDirectories: () => [] } as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService,
			instantiationService,
			new NullLogService(),
			{ onDidDisposeSession: Event.None } as Partial<IChatService> as IChatService,
			new class extends mock<IAgentHostActiveClientService>() { }(),
			new class extends mock<IMcpService>() { }(),
			configurationService,
			new TestNotificationService(),
		));
		service.getCustomizations(URI.parse('untitled:chat-session'));
		let customizationChanges = 0;
		let agentChanges = 0;
		store.add(service.onDidChangeCustomizations(() => customizationChanges++));
		store.add(service.onDidChangeCustomAgents(() => agentChanges++));
		let state = createSessionState({
			resource: backend.toString(), provider: 'copilot', title: 'Session', status: SessionStatus.Idle,
			createdAt: '', modifiedAt: '',
		});
		const chat = buildDefaultChatUri(backend.toString());
		state = { ...state, defaultChat: chat, chats: [{ resource: chat, title: 'Chat', status: SessionStatus.Idle, modifiedAt: '' }] };
		const changes: { action: string; customizations: number; agents: number }[] = [];
		const notify = (action: string) => {
			subscription.value = state;
			subscriptionChanged.fire(state);
			changes.push({ action, customizations: customizationChanges, agents: agentChanges });
		};
		notify('snapshot');
		const actions: SessionAction[] = [
			{ type: ActionType.SessionReady },
			{ type: ActionType.SessionTitleChanged, title: 'Updated Session' },
			{ type: ActionType.SessionActivityChanged, activity: 'Working' },
			{ type: ActionType.SessionIsReadChanged, isRead: true },
			{ type: ActionType.SessionChatUpdated, chat, changes: { status: SessionStatus.InProgress, modifiedAt: 'updated' } },
			{
				type: ActionType.SessionCustomizationsChanged, customizations: [{
					type: CustomizationType.Directory, id: 'skills', uri: 'file:///workspace/skills', name: 'Skills',
					contents: CustomizationType.Skill, writable: true, enabled: true,
				}]
			},
			{ type: ActionType.SessionWorkingDirectorySet, directory: 'file:///workspace' },
			{ type: ActionType.SessionMetaChanged, _meta: withSessionFolderPickerDecision(undefined, { hidden: true, primary: 'file:///workspace' })! },
			{ type: ActionType.SessionActiveClientSet, activeClient: { clientId: 'vscode', tools: [{ name: 'tool', description: 'Tool' }] } },
			{ type: ActionType.SessionDefaultChatChanged, defaultChat: buildChatUri(backend.toString(), 'peer') },
			{ type: ActionType.SessionChatRemoved, chat },
		];
		for (const action of actions) {
			state = sessionReducer(state, action);
			notify(action.type);
		}
		assert.deepStrictEqual(changes, [
			{ action: 'snapshot', customizations: 1, agents: 1 },
			{ action: ActionType.SessionReady, customizations: 1, agents: 1 },
			{ action: ActionType.SessionTitleChanged, customizations: 1, agents: 1 },
			{ action: ActionType.SessionActivityChanged, customizations: 1, agents: 1 },
			{ action: ActionType.SessionIsReadChanged, customizations: 1, agents: 1 },
			{ action: ActionType.SessionChatUpdated, customizations: 1, agents: 1 },
			{ action: ActionType.SessionCustomizationsChanged, customizations: 2, agents: 2 },
			{ action: ActionType.SessionWorkingDirectorySet, customizations: 3, agents: 3 },
			{ action: ActionType.SessionMetaChanged, customizations: 4, agents: 4 },
			{ action: ActionType.SessionActiveClientSet, customizations: 5, agents: 5 },
			{ action: ActionType.SessionDefaultChatChanged, customizations: 6, agents: 6 },
			{ action: ActionType.SessionChatRemoved, customizations: 7, agents: 7 },
		]);
	});

	for (const kind of agentHostConnectionKinds) {
		test(`keeps roots in client space through hydration and subscription errors (${kind.name})`, async () => {
			const snapshotRoot = (path: string) => URI.from({
				scheme: Schemas.file,
				authority: '',
				path,
			});
			const expectedRoots = (...paths: string[]) => ({
				session: paths.map(path => snapshotRoot(path).toString()),
				client: paths.map(path => {
					const uri = kind.toClient(snapshotRoot(path));
					return { scheme: uri.scheme, authority: uri.authority, path: uri.path };
				}),
			});
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
			const dispatched: SessionAction[] = [];
			const connection = {
				dispatch: (_channel: string, action: SessionAction) => dispatched.push(action),
				onDidAction: Event.None,
				rootState: { value: undefined },
				resourceUris: kind.resourceUris,
				getSubscription: () => ({ object: subscription, dispose: () => { } }),
			} as unknown as IAgentConnection;
			let backend = URI.parse('agent-host:/provisional-a');
			let provisionalRoots = [kind.toClient(snapshotRoot('/provisional'))];
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
			const configurationService = new TestConfigurationService();
			store.add(configurationService.onDidChangeConfigurationEmitter);
			const service = store.add(new WorkbenchAgentHostCustomizationService(
				connectionsService,
				provisionalService,
				instantiationService,
				new NullLogService() as ILogService,
				chatService,
				activeClientService,
				new class extends mock<IMcpService>() { }(),
				configurationService,
				new TestNotificationService(),
			));
			let customizationChangeCount = 0;
			store.add(service.onDidChangeCustomizations(() => customizationChangeCount++));
			const session = URI.parse('untitled:chat-session');

			const readRoots = () => ({
				session: service.getWorkingDirectories(session),
				client: service.getClientWorkingDirectoryUris(session).map(uri => ({ scheme: uri.scheme, authority: uri.authority, path: uri.path })),
			});
			const provisional = readRoots();
			const backendDefaultChat = buildDefaultChatUri('copilot:/session');
			const backendPeerChat = buildChatUri('copilot:/session', 'peer');
			subscription.verifiedValue = {
				workingDirectories: [snapshotRoot('/verified').toString(), snapshotRoot('/second workspace').toString()],
				_meta: withSessionFolderPickerDecision(undefined, { hidden: true, primary: snapshotRoot('/verified').toString() }),
				defaultChat: backendDefaultChat,
				chats: [
					{ resource: backendDefaultChat },
					{ resource: backendPeerChat },
				],
				customizations: [{
					type: CustomizationType.Directory,
					id: 'workspace-skills',
					uri: snapshotRoot('/verified/.github/skills').toString(),
					name: 'Workspace Skills',
					contents: CustomizationType.Skill,
					writable: true,
					enabled: true,
				}, {
					type: CustomizationType.McpServer,
					id: 'playwright',
					uri: 'mcp-server:/playwright',
					name: 'playwright',
					enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
					state: { kind: McpServerStatus.Stopped },
				}],
				activeClients: [{
					clientId: 'vscode',
					tools: [{ name: 'extensionTool', description: 'Provided by an extension', _meta: { 'vscode.chat.fullReferenceName': 'publisher.extension/extensionTool' } }],
				}],
			} as unknown as SessionState;
			subscription.value = subscription.verifiedValue;
			subscriptionChanged.fire();
			const verified = readRoots();
			const folderPickerDecision = service.getFolderPickerDecision(session);
			service.setCustomizationEnablement(session, 'playwright', [{ kind: CustomizationEnablementKind.Workspace, uri: kind.toClient(snapshotRoot('/verified')).toString(), enabled: false }], CustomizationEnablementKind.Session, true);
			const backendChats = {
				default: service.getBackendChatResource(session)?.toString(),
				peer: service.getBackendChatResource(session.with({ fragment: 'peer' }))?.toString(),
				missing: service.getBackendChatResource(session.with({ fragment: 'missing' }))?.toString(),
			};
			const itemProvider = store.add(new AgentCustomizationItemProvider(
				{ clientId: 'vscode', resourceUris: connection.resourceUris },
				undefined,
				undefined,
				new class extends mock<IFileService>() { }(),
				new NullLogService(),
				service,
				store.add(new MockPromptsService()),
				new class extends mock<ILabelService>() { }(),
			));
			const folders = await itemProvider.provideSourceFolders(session, PromptsType.skill, CancellationToken.None);
			const toolInventory = service.getAgentFileToolInventory(session);
			subscription.value = { workingDirectories: [snapshotRoot('/optimistic').toString(), snapshotRoot('/second workspace').toString()], customizations: [] } as unknown as SessionState;
			subscriptionChanged.fire();
			const optimistic = readRoots();
			customizationChangeCount = 0;
			subscription.value = new Error('transient');
			subscriptionError.fire(subscription.value);
			const afterError = readRoots();
			const changesAfterError = customizationChangeCount;
			subscription.value = { ...subscription.verifiedValue, workingDirectories: [] };
			subscriptionChanged.fire();
			const emptySnapshot = readRoots();
			subscription.value = { ...subscription.verifiedValue, workingDirectories: undefined };
			subscriptionChanged.fire();
			const omittedRoots = readRoots();
			backend = URI.parse('agent-host:/provisional-b');
			provisionalRoots = [kind.toClient(snapshotRoot('/replacement'))];
			subscription.value = undefined;
			subscription.verifiedValue = undefined;
			provisionalChanged.fire(session);
			const replacement = readRoots();

			assert.deepStrictEqual({
				provisional,
				verified,
				folderPickerDecision,
				toggle: dispatched.find(action => action.type === ActionType.SessionCustomizationToggled),
				backendChats,
				optimistic,
				afterError,
				changesAfterError,
				emptySnapshot,
				omittedRoots,
				replacement,
				toolInventory,
				folders: folders.map(folder => ({ source: folder.source, uri: folder.uri.toString() })),
			}, {
				provisional: expectedRoots('/provisional'),
				verified: expectedRoots('/verified', '/second workspace'),
				folderPickerDecision: { hidden: true, primary: kind.toClient(snapshotRoot('/verified')).toString() },
				toggle: { type: ActionType.SessionCustomizationToggled, id: 'playwright', enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }, { kind: CustomizationEnablementKind.Workspace, uri: 'file:///verified', enabled: false }] },
				backendChats: {
					default: backendDefaultChat,
					peer: backendPeerChat,
					missing: undefined,
				},
				optimistic: expectedRoots('/optimistic', '/second workspace'),
				afterError: expectedRoots('/verified', '/second workspace'),
				changesAfterError: 1,
				emptySnapshot: { session: [], client: [] },
				omittedRoots: { session: [], client: [] },
				replacement: expectedRoots('/replacement'),
				toolInventory: [
					{ name: 'publisher.extension/extensionTool', description: 'Provided by an extension', availability: 'available' },
					{ name: 'playwright/*', availability: 'disabled' },
				],
				folders: [{ source: 'local', uri: kind.toClient(snapshotRoot('/verified/.github/skills')).toString() }],
			});
		});
	}
});
