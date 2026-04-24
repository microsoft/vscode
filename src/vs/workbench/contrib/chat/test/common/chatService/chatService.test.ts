/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService, toUserDataProfile } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../../services/assignment/test/common/nullAssignmentService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService, nullExtensionDescription } from '../../../../../services/extensions/common/extensions.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { InMemoryTestFileService, mock, TestChatEntitlementService, TestContextService, TestExtensionService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { TestMcpService } from '../../../../mcp/test/common/testMcpService.js';
import { IChatVariablesService } from '../../../common/attachments/chatVariables.js';
import { IChatDebugService } from '../../../common/chatDebugService.js';
import { ChatDebugServiceImpl } from '../../../common/chatDebugServiceImpl.js';
import { ChatRequestQueueKind, ChatSendResult, IChatFollowup, IChatModelReference, IChatProgress, IChatService, ResponseModelState } from '../../../common/chatService/chatService.js';
import { ChatService } from '../../../common/chatService/chatServiceImpl.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { ChatEditingSessionState, IChatEditingService, IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { ChatModel, IChatModel, ISerializableChatData } from '../../../common/model/chatModel.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { ChatAgentService, IChatAgent, IChatAgentData, IChatAgentImplementation, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatSlashCommandService, IChatSlashCommandService } from '../../../common/participants/chatSlashCommands.js';
import { IConfiguredHooksInfo, IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { MockChatVariablesService } from '../mockChatVariables.js';
import { MockPromptsService } from '../promptSyntax/service/mockPromptsService.js';
import { MockLanguageModelToolsService } from '../tools/mockLanguageModelToolsService.js';
import { MockChatService } from './mockChatService.js';
import { ChatSessionOptionsMap, IChatSession, IChatSessionHistoryItem, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { MockChatSessionsService } from '../mockChatSessionsService.js';
import { AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, COPILOT_SKILL_URI_SCHEME, TROUBLESHOOT_SKILL_PATH } from '../../../common/promptSyntax/promptTypes.js';

const chatAgentWithUsedContextId = 'ChatProviderWithUsedContext';
const chatAgentWithUsedContext: IChatAgent = {
	id: chatAgentWithUsedContextId,
	name: chatAgentWithUsedContextId,
	extensionId: nullExtensionDescription.identifier,
	extensionVersion: undefined,
	publisherDisplayName: '',
	extensionPublisherId: '',
	extensionDisplayName: '',
	locations: [ChatAgentLocation.Chat],
	modes: [ChatModeKind.Ask],
	metadata: {},
	slashCommands: [],
	disambiguation: [],
	async invoke(request, progress, history, token) {
		progress([{
			documents: [
				{
					uri: URI.file('/test/path/to/file'),
					version: 3,
					ranges: [
						new Range(1, 1, 2, 2)
					]
				}
			],
			kind: 'usedContext'
		}]);

		return { metadata: { metadataKey: 'value' } };
	},
	async provideFollowups(sessionId, token) {
		return [{ kind: 'reply', message: 'Something else', agentId: '', tooltip: 'a tooltip' } satisfies IChatFollowup];
	},
};

const chatAgentWithMarkdownId = 'ChatProviderWithMarkdown';
const chatAgentWithMarkdown: IChatAgent = {
	id: chatAgentWithMarkdownId,
	name: chatAgentWithMarkdownId,
	extensionId: nullExtensionDescription.identifier,
	extensionVersion: undefined,
	publisherDisplayName: '',
	extensionPublisherId: '',
	extensionDisplayName: '',
	locations: [ChatAgentLocation.Chat],
	modes: [ChatModeKind.Ask],
	metadata: {},
	slashCommands: [],
	disambiguation: [],
	async invoke(request, progress, history, token) {
		progress([{ kind: 'markdownContent', content: new MarkdownString('test') }]);
		return { metadata: { metadataKey: 'value' } };
	},
	async provideFollowups(sessionId, token) {
		return [];
	},
};

function getAgentData(id: string): IChatAgentData {
	return {
		name: id,
		id: id,
		extensionId: nullExtensionDescription.identifier,
		extensionVersion: undefined,
		extensionPublisherId: '',
		publisherDisplayName: '',
		extensionDisplayName: '',
		locations: [ChatAgentLocation.Chat],
		modes: [ChatModeKind.Ask],
		metadata: {},
		slashCommands: [],
		disambiguation: [],
	};
}

suite('ChatService', () => {
	const testDisposables = new DisposableStore();

	let instantiationService: TestInstantiationService;
	let testFileService: InMemoryTestFileService;
	let editingSessionEntries: ISettableObservable<readonly IModifiedFileEntry[]>;

	let chatAgentService: IChatAgentService;
	const testServices: ChatService[] = [];

	/**
	 * Ensure we wait for model disposals from all created ChatServices
	 */
	function createChatService(): ChatService {
		const service = testDisposables.add(instantiationService.createInstance(ChatService));
		testServices.push(service);
		return service;
	}

	function startSessionModel(service: IChatService, location: ChatAgentLocation = ChatAgentLocation.Chat): IChatModelReference {
		const ref = testDisposables.add(service.startNewLocalSession(location));
		return ref;
	}

	async function getOrRestoreModel(service: IChatService, resource: URI): Promise<IChatModel | undefined> {
		const ref = await service.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
		if (!ref) {
			return undefined;
		}
		return testDisposables.add(ref).object;
	}

	setup(async () => {
		instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection(
			[IChatVariablesService, new MockChatVariablesService()],
			[IWorkbenchAssignmentService, new NullWorkbenchAssignmentService()],
			[IMcpService, new TestMcpService()],
			[IPromptsService, new MockPromptsService()],
			[ILanguageModelToolsService, testDisposables.add(new MockLanguageModelToolsService())]
		)));
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(IChatEntitlementService, new TestChatEntitlementService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IUserDataProfilesService, { defaultProfile: toUserDataProfile('default', 'Default', URI.file('/test/userdata'), URI.file('/test/cache')) });
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IViewsService, new TestExtensionService());
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IChatSlashCommandService, testDisposables.add(instantiationService.createInstance(ChatSlashCommandService)));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IEnvironmentService, { workspaceStorageHome: URI.file('/test/path/to/workspaceStorage') });
		instantiationService.stub(ILifecycleService, { onWillShutdown: Event.None });
		instantiationService.stub(IWorkspaceEditingService, { onDidEnterWorkspace: Event.None });
		instantiationService.stub(IChatDebugService, testDisposables.add(new ChatDebugServiceImpl()));
		editingSessionEntries = observableValue('editingSessionEntries', []);
		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() {
			override startOrContinueGlobalEditingSession(): IChatEditingSession {
				return {
					state: constObservable(ChatEditingSessionState.Idle),
					requestDisablement: observableValue('requestDisablement', []),
					entries: editingSessionEntries,
					dispose: () => { }
				} as unknown as IChatEditingSession;
			}
		});

		// Configure test file service with tracking and in-memory storage
		testFileService = testDisposables.add(new InMemoryTestFileService());
		instantiationService.stub(IFileService, testFileService);

		chatAgentService = testDisposables.add(instantiationService.createInstance(ChatAgentService));
		instantiationService.stub(IChatAgentService, chatAgentService);

		const agent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				return {};
			},
		};
		testDisposables.add(chatAgentService.registerAgent('testAgent', { ...getAgentData('testAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgent(chatAgentWithUsedContextId, getAgentData(chatAgentWithUsedContextId)));
		testDisposables.add(chatAgentService.registerAgent(chatAgentWithMarkdownId, getAgentData(chatAgentWithMarkdownId)));
		testDisposables.add(chatAgentService.registerAgentImplementation('testAgent', agent));
		chatAgentService.updateAgent('testAgent', {});
	});

	teardown(async () => {
		testDisposables.clear();
		await Promise.all(testServices.map(s => s.waitForModelDisposals()));
		testServices.length = 0;
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('slash commands can share ids across non-overlapping session types', async () => {
		const slashCommandService = testDisposables.add(instantiationService.createInstance(ChatSlashCommandService));
		const executions: string[] = [];
		const progress = { report: (_progress: IChatProgress) => { } };

		testDisposables.add(slashCommandService.registerSlashCommand({
			command: 'switch',
			detail: 'Local switch',
			locations: [ChatAgentLocation.Chat],
			sessionTypes: ['local'],
		}, async () => {
			executions.push('local');
		}));

		testDisposables.add(slashCommandService.registerSlashCommand({
			command: 'switch',
			detail: 'Remote switch',
			locations: [ChatAgentLocation.Chat],
			sessionTypes: ['remote'],
		}, async () => {
			executions.push('remote');
		}));

		assert.strictEqual(slashCommandService.hasCommand('switch', 'local'), true);
		assert.strictEqual(slashCommandService.hasCommand('switch', 'remote'), true);
		assert.strictEqual(slashCommandService.hasCommand('switch', 'other'), false);

		await slashCommandService.executeCommand('switch', '', progress, [], ChatAgentLocation.Chat, LocalChatSessionUri.forSession('local-session'), CancellationToken.None);
		await slashCommandService.executeCommand('switch', '', progress, [], ChatAgentLocation.Chat, URI.from({ scheme: 'remote', path: '/session' }), CancellationToken.None);

		assert.deepStrictEqual(executions, ['local', 'remote']);
	});

	test('slash commands reject overlapping session types for the same id', () => {
		const slashCommandService = testDisposables.add(instantiationService.createInstance(ChatSlashCommandService));
		const command = async () => undefined;

		testDisposables.add(slashCommandService.registerSlashCommand({
			command: 'switch',
			detail: 'Local switch',
			locations: [ChatAgentLocation.Chat],
			sessionTypes: ['local', 'remote'],
		}, command));

		assert.throws(() => slashCommandService.registerSlashCommand({
			command: 'switch',
			detail: 'Remote switch',
			locations: [ChatAgentLocation.Chat],
			sessionTypes: ['remote', 'other'],
		}, command));
	});

	test('slash commands without session types apply to all session types', async () => {
		const slashCommandService = testDisposables.add(instantiationService.createInstance(ChatSlashCommandService));
		const executions: string[] = [];
		const progress = { report: (_progress: IChatProgress) => { } };

		testDisposables.add(slashCommandService.registerSlashCommand({
			command: 'switch',
			detail: 'All sessions switch',
			locations: [ChatAgentLocation.Chat],
		}, async () => {
			executions.push('all');
		}));

		assert.strictEqual(slashCommandService.hasCommand('switch', 'local'), true);
		assert.strictEqual(slashCommandService.hasCommand('switch', 'remote'), true);

		await slashCommandService.executeCommand('switch', '', progress, [], ChatAgentLocation.Chat, LocalChatSessionUri.forSession('local-session'), CancellationToken.None);
		await slashCommandService.executeCommand('switch', '', progress, [], ChatAgentLocation.Chat, URI.from({ scheme: 'remote', path: '/session' }), CancellationToken.None);

		assert.deepStrictEqual(executions, ['all', 'all']);
		assert.throws(() => slashCommandService.registerSlashCommand({
			command: 'switch',
			detail: 'Remote switch',
			locations: [ChatAgentLocation.Chat],
			sessionTypes: ['remote'],
		}, async () => undefined));
	});

	test('retrieveSession', async () => {
		const testService = createChatService();
		// Don't add refs to testDisposables so we can control disposal
		const session1Ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
		const session1 = session1Ref.object as ChatModel;
		session1.addRequest({ parts: [], text: 'request 1' }, { variables: [] }, 0);

		const session2Ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
		const session2 = session2Ref.object as ChatModel;
		session2.addRequest({ parts: [], text: 'request 2' }, { variables: [] }, 0);

		// Dispose refs to trigger persistence to file service
		session1Ref.dispose();
		session2Ref.dispose();

		// Wait for async persistence to complete
		await testService.waitForModelDisposals();

		// Verify that sessions were written to the file service
		assert.strictEqual(testFileService.writeOperations.length, 2, 'Should have written 2 sessions to file service');

		const session1WriteOp = testFileService.writeOperations.find((op: { resource: URI; content: string }) =>
			op.content.includes('request 1'));
		const session2WriteOp = testFileService.writeOperations.find((op: { resource: URI; content: string }) =>
			op.content.includes('request 2'));

		assert.ok(session1WriteOp, 'Session 1 should have been written to file service');
		assert.ok(session2WriteOp, 'Session 2 should have been written to file service');

		// Create a new service instance to simulate app restart
		const testService2 = createChatService();

		// Retrieve sessions and verify they're loaded from file service
		const retrieved1 = await getOrRestoreModel(testService2, session1.sessionResource);
		const retrieved2 = await getOrRestoreModel(testService2, session2.sessionResource);

		assert.ok(retrieved1, 'Should retrieve session 1');
		assert.ok(retrieved2, 'Should retrieve session 2');
		assert.deepStrictEqual(retrieved1.getRequests()[0]?.message.text, 'request 1');
		assert.deepStrictEqual(retrieved2.getRequests()[0]?.message.text, 'request 2');
	});

	test('reports modified edit keep-alive holders', () => {
		const testService = createChatService();
		instantiationService.stub(IChatService, testService);
		const rootRef = testService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: 'ChatServiceTest#root' });

		const modifiedEntry = new class extends mock<IModifiedFileEntry>() {
			override state = constObservable(ModifiedFileEntryState.Modified);
		}();

		editingSessionEntries.set([modifiedEntry], undefined);

		assert.deepStrictEqual(testService.getChatModelReferenceDebugInfo().models.map(model => ({
			createdBy: model.createdBy,
			holders: model.holders,
			hasPendingEdits: model.hasPendingEdits,
			referenceCount: model.referenceCount,
		})), [{
			createdBy: 'ChatServiceTest#root',
			holders: [
				{ holder: 'ChatModel#modifiedEditsKeepAlive', count: 1 },
				{ holder: 'ChatServiceTest#root', count: 1 }
			],
			hasPendingEdits: true,
			referenceCount: 2,
		}]);

		editingSessionEntries.set([], undefined);
		assert.deepStrictEqual(testService.getChatModelReferenceDebugInfo().models.map(model => ({
			holders: model.holders,
			hasPendingEdits: model.hasPendingEdits,
			referenceCount: model.referenceCount,
		})), [{
			holders: [{ holder: 'ChatServiceTest#root', count: 1 }],
			hasPendingEdits: false,
			referenceCount: 1,
		}]);

		rootRef.dispose();
	});

	test('addCompleteRequest', async () => {
		const testService = createChatService();

		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;
		assert.strictEqual(model.getRequests().length, 0);

		await testService.addCompleteRequest(model.sessionResource, 'test request', undefined, 0, { message: 'test response' });
		assert.strictEqual(model.getRequests().length, 1);
		assert.ok(model.getRequests()[0].response);
		assert.strictEqual(model.getRequests()[0].response?.response.toString(), 'test response');
	});

	test('sendRequest fails', async () => {
		const testService = createChatService();

		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;
		const response = await testService.sendRequest(model.sessionResource, `@${chatAgentWithUsedContextId} test request`);
		ChatSendResult.assertSent(response);
		await response.data.responseCompletePromise;

		await assertSnapshot(toSnapshotExportData(model));
	});

	test('history', async () => {
		const historyLengthAgent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				return {
					metadata: { historyLength: history.length }
				};
			},
		};

		testDisposables.add(chatAgentService.registerAgent('defaultAgent', { ...getAgentData('defaultAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgent('agent2', getAgentData('agent2')));
		testDisposables.add(chatAgentService.registerAgentImplementation('defaultAgent', historyLengthAgent));
		testDisposables.add(chatAgentService.registerAgentImplementation('agent2', historyLengthAgent));

		const testService = createChatService();
		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;

		// Send a request to default agent
		const response = await testService.sendRequest(model.sessionResource, `test request`, { agentId: 'defaultAgent' });
		ChatSendResult.assertSent(response);
		await response.data.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 1);
		assert.strictEqual(model.getRequests()[0].response?.result?.metadata?.historyLength, 0);

		// Send a request to agent2- it can't see the default agent's message
		const response2 = await testService.sendRequest(model.sessionResource, `test request`, { agentId: 'agent2' });
		ChatSendResult.assertSent(response2);
		await response2.data.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 2);
		assert.strictEqual(model.getRequests()[1].response?.result?.metadata?.historyLength, 0);

		// Send a request to defaultAgent - the default agent can see agent2's message
		const response3 = await testService.sendRequest(model.sessionResource, `test request`, { agentId: 'defaultAgent' });
		ChatSendResult.assertSent(response3);
		await response3.data.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 3);
		assert.strictEqual(model.getRequests()[2].response?.result?.metadata?.historyLength, 2);
	});

	test('can serialize', async () => {
		testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithUsedContextId, chatAgentWithUsedContext));
		chatAgentService.updateAgent(chatAgentWithUsedContextId, {});
		const testService = createChatService();

		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;
		assert.strictEqual(model.getRequests().length, 0);

		await assertSnapshot(toSnapshotExportData(model));

		const response = await testService.sendRequest(model.sessionResource, `@${chatAgentWithUsedContextId} test request`);
		ChatSendResult.assertSent(response);
		await response.data.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 1);

		const response2 = await testService.sendRequest(model.sessionResource, `test request 2`);
		ChatSendResult.assertSent(response2);
		await response2.data.responseCompletePromise;
		assert.strictEqual(model.getRequests().length, 2);

		await assertSnapshot(toSnapshotExportData(model));
	});

	test('can deserialize', async () => {
		let serializedChatData: ISerializableChatData;
		testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithUsedContextId, chatAgentWithUsedContext));

		// create the first service, send request, get response, and serialize the state
		{  // serapate block to not leak variables in outer scope
			const testService = createChatService();

			const chatModel1Ref = testDisposables.add(startSessionModel(testService));
			const chatModel1 = chatModel1Ref.object;
			assert.strictEqual(chatModel1.getRequests().length, 0);

			const response = await testService.sendRequest(chatModel1.sessionResource, `@${chatAgentWithUsedContextId} test request`);
			ChatSendResult.assertSent(response);

			await response.data.responseCompletePromise;

			serializedChatData = JSON.parse(JSON.stringify(chatModel1));
		}

		// try deserializing the state into a new service

		const testService2 = createChatService();

		const chatModel2Ref = testService2.loadSessionFromData(serializedChatData);
		assert(chatModel2Ref);
		testDisposables.add(chatModel2Ref);
		const chatModel2 = chatModel2Ref.object;

		await assertSnapshot(toSnapshotExportData(chatModel2));
	});

	test('can deserialize with response', async () => {
		let serializedChatData: ISerializableChatData;
		testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithMarkdownId, chatAgentWithMarkdown));

		{
			const testService = createChatService();

			const chatModel1Ref = testDisposables.add(startSessionModel(testService));
			const chatModel1 = chatModel1Ref.object;
			assert.strictEqual(chatModel1.getRequests().length, 0);

			const response = await testService.sendRequest(chatModel1.sessionResource, `@${chatAgentWithUsedContextId} test request`);
			ChatSendResult.assertSent(response);

			await response.data.responseCompletePromise;

			serializedChatData = JSON.parse(JSON.stringify(chatModel1));
		}

		// try deserializing the state into a new service

		const testService2 = createChatService();

		const chatModel2Ref = testService2.loadSessionFromData(serializedChatData);
		assert(chatModel2Ref);
		testDisposables.add(chatModel2Ref);
		const chatModel2 = chatModel2Ref.object;

		await assertSnapshot(toSnapshotExportData(chatModel2));
	});

	test('can serialize and deserialize implicit request flag', async () => {
		let serializedChatData: ISerializableChatData;

		{
			const testService = createChatService();
			const chatModel1Ref = testDisposables.add(startSessionModel(testService));
			const chatModel1 = chatModel1Ref.object;

			const response = await testService.sendRequest(chatModel1.sessionResource, 'test implicit request', { isSystemInitiated: true });
			ChatSendResult.assertSent(response);
			await response.data.responseCompletePromise;

			assert.strictEqual(chatModel1.getRequests().length, 1);
			assert.strictEqual(chatModel1.getRequests()[0].isSystemInitiated, true);

			serializedChatData = JSON.parse(JSON.stringify(chatModel1));
			assert.strictEqual(serializedChatData.requests.length, 1);
			assert.strictEqual(serializedChatData.requests[0].isSystemInitiated, true);
		}

		const testService2 = createChatService();
		const chatModel2Ref = testService2.loadSessionFromData(serializedChatData);
		assert(chatModel2Ref);
		testDisposables.add(chatModel2Ref);
		const chatModel2 = chatModel2Ref.object;

		assert.strictEqual(chatModel2.getRequests().length, 1);
		assert.strictEqual(chatModel2.getRequests()[0].isSystemInitiated, true);
	});

	test('acquireExistingSession keeps model alive for steering request after refs released', async () => {
		const testService = createChatService();
		const modelRef = startSessionModel(testService);
		const sessionResource = modelRef.object.sessionResource;

		// Acquire a keep-alive reference (what the fix does)
		const keepAliveRef = testDisposables.add(testService.acquireExistingSession(sessionResource, 'test#keepAlive')!);
		assert.ok(keepAliveRef, 'acquireExistingSession should return a reference');

		// Release the original reference to simulate user navigating away
		modelRef.dispose();
		await testService.waitForModelDisposals();

		// Model should still be accessible because keepAliveRef holds it
		const response = await testService.sendRequest(sessionResource, 'terminal completed', {
			queue: ChatRequestQueueKind.Steering,
			isSystemInitiated: true,
		});
		assert.strictEqual(response.kind, 'queued');

		// Clean up
		keepAliveRef.dispose();
	});

	test('onDidDisposeSession', async () => {
		const testService = createChatService();
		const modelRef = testService.startNewLocalSession(ChatAgentLocation.Chat);
		const model = modelRef.object;

		let disposed = false;
		testDisposables.add(testService.onDidDisposeSession(e => {
			for (const resource of e.sessionResources) {
				if (resource.toString() === model.sessionResource.toString()) {
					disposed = true;
				}
			}
		}));

		modelRef.dispose();
		await testService.waitForModelDisposals();
		assert.strictEqual(disposed, true);
	});

	test('steering message queued triggers setYieldRequested', async () => {
		const requestStarted = new DeferredPromise<void>();
		const completeRequest = new DeferredPromise<void>();
		let setYieldRequestedCalled = false;

		const slowAgent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				requestStarted.complete();
				await completeRequest.p;
				return {};
			},
			setYieldRequested(requestId: string, value: boolean) {
				setYieldRequestedCalled = true;
			},
		};

		testDisposables.add(chatAgentService.registerAgent('slowAgent', { ...getAgentData('slowAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgentImplementation('slowAgent', slowAgent));

		const testService = createChatService();
		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;

		// Start a request that will wait
		const response = await testService.sendRequest(model.sessionResource, 'first request', { agentId: 'slowAgent' });
		ChatSendResult.assertSent(response);

		// Wait for the agent to start processing
		await requestStarted.p;

		// Queue a steering message while the first request is still in progress
		const steeringResponse = await testService.sendRequest(model.sessionResource, 'steering message', {
			agentId: 'slowAgent',
			queue: ChatRequestQueueKind.Steering
		});
		assert.strictEqual(steeringResponse.kind, 'queued');

		// setYieldRequested should have been called on the agent
		assert.strictEqual(setYieldRequestedCalled, true, 'setYieldRequested should be called when a steering message is queued');

		// Complete the first request
		completeRequest.complete();
		await response.data.responseCompletePromise;
	});

	test('multiple steering messages are combined into a single request', async () => {
		const requestStarted = new DeferredPromise<void>();
		const completeRequest = new DeferredPromise<void>();
		const invokedRequests: string[] = [];

		const slowAgent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				invokedRequests.push(request.message);
				if (invokedRequests.length === 1) {
					requestStarted.complete();
					await completeRequest.p;
				}
				return {};
			},
		};

		testDisposables.add(chatAgentService.registerAgent('slowAgent', { ...getAgentData('slowAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgentImplementation('slowAgent', slowAgent));

		const testService = createChatService();
		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;

		// Start a request that will wait
		const response = await testService.sendRequest(model.sessionResource, 'first request', { agentId: 'slowAgent' });
		ChatSendResult.assertSent(response);

		// Wait for the agent to start processing
		await requestStarted.p;

		// Queue 3 steering messages while the first request is in progress
		const steering1 = await testService.sendRequest(model.sessionResource, 'steering1', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Steering });
		const steering2 = await testService.sendRequest(model.sessionResource, 'steering2', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Steering });
		const steering3 = await testService.sendRequest(model.sessionResource, 'steering3', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Steering });
		assert.ok(ChatSendResult.isQueued(steering1));
		assert.ok(ChatSendResult.isQueued(steering2));
		assert.ok(ChatSendResult.isQueued(steering3));

		// Complete the first request - should trigger processing of combined steering requests
		completeRequest.complete();
		await response.data.responseCompletePromise;

		// Wait for all deferred promises to resolve
		await steering1.deferred;
		await steering2.deferred;
		await steering3.deferred;

		// Should have only invoked 2 requests: the initial and the combined steering
		assert.strictEqual(invokedRequests.length, 2, 'Should have only 2 invocations (initial + combined steering)');
		// The combined message includes all steering texts joined with \n\n
		assert.ok(invokedRequests[1].includes('steering1'), 'Combined message should include steering1');
		assert.ok(invokedRequests[1].includes('steering2'), 'Combined message should include steering2');
		assert.ok(invokedRequests[1].includes('steering3'), 'Combined message should include steering3');
		assert.ok(invokedRequests[1].includes('\n\n'), 'Combined message should use \\n\\n as separator');
	});

	test('disabled Claude hooks hint is shown once per workspace (fix for #295079)', async () => {
		// Set up a prompts service that reports disabled Claude hooks
		const mockPromptsService = new class extends MockPromptsService {
			override getHooks(_token: CancellationToken): Promise<IConfiguredHooksInfo> {
				return Promise.resolve({ hooks: {}, hasDisabledClaudeHooks: true });
			}
		}();
		instantiationService.stub(IPromptsService, mockPromptsService);

		const storageService = instantiationService.get(IStorageService);
		const disabledHintsKey = 'chat.disabledClaudeHooks.notification';

		// Before any request, the storage key should not be set
		assert.strictEqual(storageService.getBoolean(disabledHintsKey, StorageScope.WORKSPACE), undefined);

		const testService = createChatService();
		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;

		// Disabled hooks are reported for every request, but the hint should only be shown once per workspace.
		const response = await testService.sendRequest(model.sessionResource, 'test request');
		ChatSendResult.assertSent(response);
		await response.data.responseCompletePromise;

		// The hint should have been shown, and the key set to true
		assert.strictEqual(storageService.getBoolean(disabledHintsKey, StorageScope.WORKSPACE), true, 'Flag should be set after showing the hint');

		// Verify the response contains the disabledClaudeHooks part
		const requests = model.getRequests();
		assert.strictEqual(requests.length, 1);
		const responseParts = requests[0].response?.response.value ?? [];
		const hasHookHint = responseParts.some(part => part.kind === 'disabledClaudeHooks');
		assert.ok(hasHookHint, 'Response should contain the disabledClaudeHooks hint');

		// Sending another request should NOT show the hint again (shown only once per workspace)
		const response2 = await testService.sendRequest(model.sessionResource, 'second request');
		ChatSendResult.assertSent(response2);
		await response2.data.responseCompletePromise;

		const requests2 = model.getRequests();
		assert.strictEqual(requests2.length, 2);
		const responseParts2 = requests2[1].response?.response.value ?? [];
		const hasHookHint2 = responseParts2.some(part => part.kind === 'disabledClaudeHooks');
		assert.ok(!hasHookHint2, 'Response should NOT contain the disabledClaudeHooks hint on second request');
	});

	test('disabled Claude hooks hint is not consumed when no disabled hooks (fix for #295079)', async () => {
		// Set up a prompts service that simulates the setup agent first pass (no disabled hooks)
		// followed by the real resent request (with disabled hooks).
		const mockPromptsService = new class extends MockPromptsService {
			private _callCount = 0;
			override getHooks(_token: CancellationToken): Promise<IConfiguredHooksInfo> {
				this._callCount++;
				// First call (setup agent): no disabled hooks
				// Second call (real request after resend): disabled hooks present
				return Promise.resolve({ hooks: {}, hasDisabledClaudeHooks: this._callCount > 1 });
			}
		}();
		instantiationService.stub(IPromptsService, mockPromptsService);

		const storageService = instantiationService.get(IStorageService);
		const disabledHintsKey = 'chat.disabledClaudeHooks.notification';

		// First request: no disabled hooks (simulates setup agent pass)
		const testService = createChatService();
		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;

		const response = await testService.sendRequest(model.sessionResource, 'first request');
		ChatSendResult.assertSent(response);
		await response.data.responseCompletePromise;

		// Flag should NOT be set because no hint was shown
		assert.strictEqual(storageService.getBoolean(disabledHintsKey, StorageScope.WORKSPACE), undefined, 'Flag should not be set when no disabled hooks');

		const firstRequest = model.getRequests()[0];
		assert.ok(firstRequest, 'Expected the initial request to exist before resend');

		// Resend the original request: now disabled hooks are present (simulates resend after setup)
		await testService.resendRequest(firstRequest);

		// Now the flag should be set and the hint shown
		assert.strictEqual(storageService.getBoolean(disabledHintsKey, StorageScope.WORKSPACE), true, 'Flag should be set after showing the hint');

		const requests = model.getRequests();
		assert.strictEqual(requests.length, 1, 'Resend should replace the original request');
		const responseParts2 = requests[0].response?.response.value ?? [];
		const hasHookHint2 = responseParts2.some(part => part.kind === 'disabledClaudeHooks');
		assert.ok(hasHookHint2, 'Response should contain the disabledClaudeHooks hint on second request');
	});
	test('cancelCurrentRequestForSession waits for response completion', async () => {
		const requestStarted = new DeferredPromise<void>();
		const completeRequest = new DeferredPromise<void>();

		const slowAgent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				requestStarted.complete();
				const listener = token.onCancellationRequested(() => {
					listener.dispose();
					// Simulate some cleanup delay before completing
					setTimeout(() => completeRequest.complete(), 10);
				});
				await completeRequest.p;
				return {};
			},
		};

		testDisposables.add(chatAgentService.registerAgent('slowAgent', { ...getAgentData('slowAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgentImplementation('slowAgent', slowAgent));

		const testService = createChatService();
		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;

		const response = await testService.sendRequest(model.sessionResource, 'test request', { agentId: 'slowAgent' });
		ChatSendResult.assertSent(response);

		await requestStarted.p;

		// Cancel and await - should wait for the response to complete
		await testService.cancelCurrentRequestForSession(model.sessionResource, 'test');

		// After cancel resolves, the response model should have a result
		const lastRequest = model.getRequests()[0];
		assert.ok(lastRequest.response, 'Response should exist after cancellation completes');
		assert.strictEqual(lastRequest.response.state, ResponseModelState.Cancelled, 'Response should be in Cancelled state');
	});

	test('cancelCurrentRequestForSession returns after timeout if response does not complete', async () => {
		const requestStarted = new DeferredPromise<void>();
		const completeRequest = new DeferredPromise<void>();

		const hangingAgent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				requestStarted.complete();
				// Wait for external signal, ignoring cancellation to simulate a hung agent
				await completeRequest.p;
				return {};
			},
		};

		testDisposables.add(chatAgentService.registerAgent('hangingAgent', { ...getAgentData('hangingAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgentImplementation('hangingAgent', hangingAgent));

		const testService = createChatService();
		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;

		const response = await testService.sendRequest(model.sessionResource, 'test request', { agentId: 'hangingAgent' });
		ChatSendResult.assertSent(response);

		await requestStarted.p;

		// Cancel should return after timeout even though the agent has not completed.
		// Use faked timers so raceTimeout's 1s setTimeout fires instantly.
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			await testService.cancelCurrentRequestForSession(model.sessionResource, 'test');
		});

		// Let the agent finish so the test cleans up properly
		completeRequest.complete();
		await response.data.responseCompletePromise;
	});

	test('pending requests can be removed from one session and re-sent on another', async () => {
		const requestStarted = new DeferredPromise<void>();
		const completeRequest = new DeferredPromise<void>();
		const invokedMessages: string[] = [];

		const slowAgent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				invokedMessages.push(request.message);
				if (invokedMessages.length === 1) {
					requestStarted.complete();
					await completeRequest.p;
				}
				return {};
			},
		};

		testDisposables.add(chatAgentService.registerAgent('slowAgent', { ...getAgentData('slowAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgentImplementation('slowAgent', slowAgent));

		const testService = createChatService();
		const sourceRef = testDisposables.add(startSessionModel(testService));
		const source = sourceRef.object;

		// Start a blocking request on source
		const response = await testService.sendRequest(source.sessionResource, 'first request', { agentId: 'slowAgent' });
		ChatSendResult.assertSent(response);
		await requestStarted.p;

		// Queue a request while the first is in progress
		const queued = await testService.sendRequest(source.sessionResource, 'queued request', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Queued });
		assert.ok(ChatSendResult.isQueued(queued));

		// Remove the queued request from source
		const pendingId = source.getPendingRequests()[0].request.id;
		testService.removePendingRequest(source.sessionResource, pendingId);
		assert.strictEqual(source.getPendingRequests().length, 0);

		// Re-send it on a new target session through the normal queue path
		const targetRef = testDisposables.add(startSessionModel(testService));
		const target = targetRef.object;
		const resent = await testService.sendRequest(target.sessionResource, 'queued request', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Queued, pauseQueue: true });
		assert.ok(ChatSendResult.isQueued(resent));
		assert.strictEqual(target.getPendingRequests().length, 1);

		// Complete the first request so the source loop finishes
		completeRequest.complete();
		await response.data.responseCompletePromise;

		// Process the target queue — the re-sent request should be invoked
		testService.processPendingRequests(target.sessionResource);
		const result = await resent.deferred;
		assert.ok(ChatSendResult.isSent(result));
		await result.data.responseCompletePromise;

		// The agent should have been invoked twice: first request + re-sent queued request
		assert.strictEqual(invokedMessages.length, 2);
		assert.ok(invokedMessages[1].includes('queued request'));
	});

	test('race condition: processNextPendingRequest dequeues before commit handler runs', async () => {
		// This reproduces the race where:
		// 1. Request 1 completes → .finally() calls processNextPendingRequest immediately
		// 2. processNextPendingRequest dequeues queued-request-1 and starts it on the OLD session
		// 3. Commit event arrives later → only sees remaining queued requests (one was already dequeued)
		// The fix: detect the in-flight request on the old session, cancel it, and re-send on the new session.

		const invocationOrder: string[] = [];
		const firstRequestStarted = new DeferredPromise<void>();
		const firstRequestGate = new DeferredPromise<void>();

		const slowAgent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				invocationOrder.push(request.message);

				if (invocationOrder.length === 1) {
					// First request — block until we say go
					firstRequestStarted.complete();
					await firstRequestGate.p;
				}
				// All subsequent requests complete immediately
				return {};
			},
		};

		testDisposables.add(chatAgentService.registerAgent('slowAgent', { ...getAgentData('slowAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgentImplementation('slowAgent', slowAgent));

		const testService = createChatService();
		const sourceRef = testDisposables.add(startSessionModel(testService));
		const source = sourceRef.object;

		// Step 1: Send request 1 (blocks on firstRequestGate)
		const response1 = await testService.sendRequest(source.sessionResource, 'request-1', { agentId: 'slowAgent' });
		ChatSendResult.assertSent(response1);
		await firstRequestStarted.p;

		// Step 2: Queue 3 more requests while request 1 is in progress
		const q1 = await testService.sendRequest(source.sessionResource, 'queued-1', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Queued });
		const q2 = await testService.sendRequest(source.sessionResource, 'queued-2', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Queued });
		const q3 = await testService.sendRequest(source.sessionResource, 'queued-3', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Queued });
		assert.ok(ChatSendResult.isQueued(q1));
		assert.ok(ChatSendResult.isQueued(q2));
		assert.ok(ChatSendResult.isQueued(q3));
		assert.strictEqual(source.getPendingRequests().length, 3);
		assert.strictEqual(source.getRequests().length, 1, 'Only request-1 should be a real request');

		// Step 3: Complete request 1 → .finally() runs processNextPendingRequest
		// This dequeues "queued-1" and starts it on the source (old) session
		firstRequestGate.complete();
		await response1.data.responseCompletePromise;

		// processNextPendingRequest dequeued one from the queue synchronously
		assert.strictEqual(source.getPendingRequests().length, 2, 'Should have 2 remaining after auto-dequeue');

		// Yield to let the dequeued request's async chain progress (extension activation, addRequest, etc.)
		await new Promise(resolve => setTimeout(resolve, 0));

		// Step 4: Simulate what _resendPendingRequests does (the commit handler)
		// This is the recovery: cancel the in-flight, remove remaining, re-send all on target
		const targetRef = testDisposables.add(startSessionModel(testService));
		const target = targetRef.object;

		// Cancel whatever is in-flight on the old session
		await testService.cancelCurrentRequestForSession(source.sessionResource);

		// Remove remaining pending requests from old session
		const remaining = [...source.getPendingRequests()];
		for (const p of remaining) {
			testService.removePendingRequest(source.sessionResource, p.request.id);
		}
		assert.strictEqual(source.getPendingRequests().length, 0);

		// Re-send ALL 3 on the target through the normal queue path
		const resent1 = await testService.sendRequest(target.sessionResource, 'queued-1', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Queued, pauseQueue: true });
		const resent2 = await testService.sendRequest(target.sessionResource, 'queued-2', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Queued, pauseQueue: true });
		const resent3 = await testService.sendRequest(target.sessionResource, 'queued-3', { agentId: 'slowAgent', queue: ChatRequestQueueKind.Queued, pauseQueue: true });
		assert.ok(ChatSendResult.isQueued(resent1));
		assert.ok(ChatSendResult.isQueued(resent2));
		assert.ok(ChatSendResult.isQueued(resent3));
		assert.strictEqual(target.getPendingRequests().length, 3, 'Target should have all 3 queued requests');

		// Step 5: Process the target queue and verify all 3 get sent
		testService.processPendingRequests(target.sessionResource);
		const result1 = await resent1.deferred;
		assert.ok(ChatSendResult.isSent(result1));
		await result1.data.responseCompletePromise;

		const result2 = await resent2.deferred;
		assert.ok(ChatSendResult.isSent(result2));
		await result2.data.responseCompletePromise;

		const result3 = await resent3.deferred;
		assert.ok(ChatSendResult.isSent(result3));
		await result3.data.responseCompletePromise;

		// Verify the agent received all 3 queued messages on the target session
		const queuedInvocations = invocationOrder.filter(m => m.includes('queued-'));
		assert.ok(queuedInvocations.length >= 3, `Expected at least 3 queued invocations, got ${queuedInvocations.length}`);
		const lastThree = queuedInvocations.slice(-3);
		assert.ok(lastThree[0].includes('queued-1'));
		assert.ok(lastThree[1].includes('queued-2'));
		assert.ok(lastThree[2].includes('queued-3'));
	});

	test('acquireOrLoadSession returns undefined when remote provider is not registered (fix for #301203)', async () => {
		const unregisteredScheme = 'unregistered-provider';
		const sessionResource = URI.from({ scheme: unregisteredScheme, path: '/orphaned-session' });

		// Use a mock sessions service with NO content provider registered for the scheme
		const mockSessionsService = new MockChatSessionsService();
		instantiationService.stub(IChatSessionsService, mockSessionsService);

		const testService = createChatService();
		const ref = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
		assert.strictEqual(ref, undefined, 'Should return undefined when no provider is registered');
	});

	test('sendRequest on untitled remote session propagates initialSessionOptions to new model', async () => {
		const remoteScheme = 'remoteProvider';
		const untitledResource = URI.from({ scheme: remoteScheme, path: '/untitled-test-session' });
		const realResource = URI.from({ scheme: remoteScheme, path: '/real-session-123' });

		// Set up the mock chat sessions service
		const mockSessionsService = new MockChatSessionsService();

		// Register a content provider so loadRemoteSession can resolve sessions
		testDisposables.add(mockSessionsService.registerChatSessionContentProvider(remoteScheme, {
			provideChatSessionContent: (_resource: URI, _token: CancellationToken) => {
				return Promise.resolve({
					sessionResource: _resource,
					history: [],
					onWillDispose: Event.None,
					dispose: () => { },
				});
			},
		}));

		// Set session options for the untitled resource
		mockSessionsService.setSessionOption(untitledResource, 'model', 'claude-3.5-sonnet');
		mockSessionsService.setSessionOption(untitledResource, 'repo', 'my-repo');

		// Override createNewChatSessionItem to return a real resource
		mockSessionsService.createNewChatSessionItem = async () => ({
			resource: realResource,
			label: 'Test Session',
			timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
		});

		instantiationService.stub(IChatSessionsService, mockSessionsService);

		// Register the remote agent
		const remoteAgent: IChatAgentImplementation = {
			async invoke(request, progress, history, token) {
				return {};
			},
		};
		testDisposables.add(chatAgentService.registerAgent(remoteScheme, { ...getAgentData(remoteScheme), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgentImplementation(remoteScheme, remoteAgent));

		const testService = createChatService();

		// Load the untitled session to create the initial model
		const untitledRef = await testService.acquireOrLoadSession(untitledResource, ChatAgentLocation.Chat, CancellationToken.None);
		assert.ok(untitledRef, 'Should load untitled session');
		testDisposables.add(untitledRef);

		// Send a request - this triggers the untitled → real session conversion
		const response = await testService.sendRequest(untitledResource, 'hello', { agentId: remoteScheme });
		ChatSendResult.assertSent(response);
		await response.data.responseCompletePromise;

		// The new model (with real resource) should have initialSessionOptions set
		const newModel = testService.getSession(realResource) as ChatModel;
		assert.ok(newModel, 'New model should exist at the real resource');
		assert.deepStrictEqual(
			ChatSessionOptionsMap.toStrValueArray(mockSessionsService.getSessionOptions(realResource)),
			[
				{ optionId: 'model', value: 'claude-3.5-sonnet' },
				{ optionId: 'repo', value: 'my-repo' },
			]
		);
	});
	test('troubleshoot skill via attachedContext is blocked when fileLogging.enabled is off', async () => {
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		await configService.setUserConfiguration(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, false);

		const troubleshootAgent: IChatAgentImplementation = {
			async invoke(_request, _progress, _history, _token) {
				return {};
			},
		};
		testDisposables.add(chatAgentService.registerAgent('troubleshootAgent', { ...getAgentData('troubleshootAgent'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgentImplementation('troubleshootAgent', troubleshootAgent));

		const testService = createChatService();
		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;

		const skillUri = URI.from({ scheme: COPILOT_SKILL_URI_SCHEME, path: TROUBLESHOOT_SKILL_PATH });
		const response = await testService.sendRequest(model.sessionResource, 'investigate this issue', {
			attachedContext: [{
				id: 'troubleshoot-skill',
				name: 'troubleshoot',
				kind: 'generic',
				value: skillUri,
			}],
		});
		ChatSendResult.assertSent(response);
		await response.data.responseCompletePromise;

		const requests = model.getRequests();
		assert.strictEqual(requests.length, 1);
		const responseContent = requests[0].response?.response.toString();
		assert.ok(responseContent?.includes(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING), 'Response should mention the fileLogging setting');
	});

	test('troubleshoot skill via attachedContext proceeds when fileLogging.enabled is on', async () => {
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		await configService.setUserConfiguration(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, true);

		const troubleshootAgent: IChatAgentImplementation = {
			async invoke(_request, progress, _history, _token) {
				progress([{ kind: 'markdownContent', content: new MarkdownString('Troubleshooting complete') }]);
				return {};
			},
		};
		testDisposables.add(chatAgentService.registerAgent('troubleshootAgent2', { ...getAgentData('troubleshootAgent2'), isDefault: true }));
		testDisposables.add(chatAgentService.registerAgentImplementation('troubleshootAgent2', troubleshootAgent));

		const testService = createChatService();
		const modelRef = testDisposables.add(startSessionModel(testService));
		const model = modelRef.object;

		const skillUri = URI.from({ scheme: COPILOT_SKILL_URI_SCHEME, path: TROUBLESHOOT_SKILL_PATH });
		const response = await testService.sendRequest(model.sessionResource, 'investigate this issue', {
			attachedContext: [{
				id: 'troubleshoot-skill',
				name: 'troubleshoot',
				kind: 'generic',
				value: skillUri,
			}],
		});
		ChatSendResult.assertSent(response);
		await response.data.responseCompletePromise;

		const requests = model.getRequests();
		assert.strictEqual(requests.length, 1);
		const responseContent = requests[0].response?.response.toString();
		assert.ok(!responseContent?.includes(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING), 'Response should not contain the settings gate message');
	});

	test('switching between sessions disposes previous models and releases all references', async () => {
		const testService = createChatService();

		// Create 3 sessions with some content
		const sessions: { resource: URI; ref: IChatModelReference }[] = [];
		for (let i = 0; i < 3; i++) {
			const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
			const model = ref.object as ChatModel;
			model.addRequest({ parts: [], text: `request in session ${i}` }, { variables: [] }, 0);
			sessions.push({ resource: model.sessionResource, ref });
		}

		// Save all sessions so they can be restored later
		for (const s of sessions) {
			s.ref.dispose();
		}
		await testService.waitForModelDisposals();

		// Verify all models are disposed
		for (const s of sessions) {
			assert.strictEqual(testService.getSession(s.resource), undefined, `Session ${s.resource} should be disposed after ref release`);
		}

		// Now simulate "clicking through sessions" — load each one, switch to next
		// This mimics chatViewPane.loadSession() pattern: acquire new, release old
		let currentRef: IChatModelReference | undefined;
		for (const s of sessions) {
			const newRef = await testService.acquireOrLoadSession(s.resource, ChatAgentLocation.Chat, CancellationToken.None, 'test#switch');
			assert.ok(newRef, `Should be able to restore session ${s.resource}`);

			// Release old ref (like ChatViewPane.showModel does)
			currentRef?.dispose();
			currentRef = newRef;
		}

		// At this point, only the last session should have a live model
		await testService.waitForModelDisposals();
		const debugInfo = testService.getChatModelReferenceDebugInfo();
		assert.deepStrictEqual({
			totalModels: debugInfo.totalModels,
			totalReferences: debugInfo.totalReferences,
			models: debugInfo.models.map(m => ({
				resource: m.sessionResource.toString(),
				refCount: m.referenceCount,
				holders: m.holders,
				pendingDisposal: m.pendingDisposal,
				createdBy: m.createdBy,
			})),
		}, {
			totalModels: 1,
			totalReferences: 1,
			models: [{
				resource: sessions[2].resource.toString(),
				refCount: 1,
				holders: [{ holder: 'test#switch', count: 1 }],
				pendingDisposal: false,
				createdBy: 'test#switch',
			}],
		});
		assert.strictEqual(debugInfo.models[0].sessionResource.toString(), sessions[2].resource.toString(),
			'The live model should be the last session we switched to');

		// Verify the first two sessions' models are gone
		await testService.waitForModelDisposals();
		assert.strictEqual(testService.getSession(sessions[0].resource), undefined, 'Session 0 model should be disposed');
		assert.strictEqual(testService.getSession(sessions[1].resource), undefined, 'Session 1 model should be disposed');
		assert.ok(testService.getSession(sessions[2].resource), 'Session 2 model should still be alive');

		currentRef!.dispose();
		await testService.waitForModelDisposals();
	});

	test('previousModelRef pattern in ChatViewPane does not cause double-reference retention', async () => {
		const testService = createChatService();

		// Create 3 sessions
		const sessions: { resource: URI }[] = [];
		for (let i = 0; i < 3; i++) {
			const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
			const model = ref.object as ChatModel;
			model.addRequest({ parts: [], text: `request ${i}` }, { variables: [] }, 0);
			sessions.push({ resource: model.sessionResource });
			ref.dispose();
		}
		await testService.waitForModelDisposals();

		// Simulate the ChatViewPane._previousModelRef pattern:
		// showModel() does:
		//   this._previousModelRef.value = this.modelRef.value;  // <-- stores ref
		//   this.modelRef.value = undefined;                      // <-- disposes same ref!
		// This should NOT cause the model to stay alive because the
		// MutableDisposable setter disposes the old value after assigning the new one.

		// Load session 0
		const ref0 = await testService.acquireOrLoadSession(sessions[0].resource, ChatAgentLocation.Chat, CancellationToken.None, 'test');
		assert.ok(ref0);

		// "Switch" to session 1 using the buggy pattern
		const previousRef = ref0; // save reference (like _previousModelRef.value = modelRef.value)
		// Now dispose the ref (like modelRef.value = undefined which disposes via setter)
		ref0.dispose();

		// The previousRef IS ref0 — same object. It's now disposed.
		// So previousRef is holding a dead reference.

		// Load session 1
		const ref1 = await testService.acquireOrLoadSession(sessions[1].resource, ChatAgentLocation.Chat, CancellationToken.None, 'test');
		assert.ok(ref1);

		await testService.waitForModelDisposals();

		// Session 0 should be disposed because its ref was disposed and
		// previousRef is the same object (also disposed)
		assert.strictEqual(testService.getSession(sessions[0].resource), undefined,
			'Session 0 should be disposed -- the "previous ref" pattern did not keep it alive');

		// Only session 1 should be alive
		const debugInfo = testService.getChatModelReferenceDebugInfo();
		assert.strictEqual(debugInfo.totalModels, 1, 'Only session 1 should be alive');

		ref1.dispose();
		// Clean up previousRef — it's already disposed, calling again should be a no-op
		previousRef.dispose();
		await testService.waitForModelDisposals();
	});

	test('serializer _previous field does not retain data after model disposal', async () => {
		const testService = createChatService();

		// Create a session with content
		const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
		const model = ref.object as ChatModel;
		const sessionResource = model.sessionResource;
		model.addRequest({ parts: [], text: 'some request with data' }, { variables: [] }, 0);

		// Force serialization to populate dataSerializer._previous
		// (happens in willDisposeModel)
		ref.dispose();
		await testService.waitForModelDisposals();

		// Model should be gone
		assert.strictEqual(testService.getSession(sessionResource), undefined);

		// Restore and dispose again to verify clean disposal cycle
		const ref2 = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None, 'test');
		assert.ok(ref2);
		const model2 = ref2.object as ChatModel;
		assert.ok(model2.dataSerializer, 'Restored model should have a dataSerializer');

		ref2.dispose();
		await testService.waitForModelDisposals();
		assert.strictEqual(testService.getSession(sessionResource), undefined, 'Model should be disposed after second cycle');
	});

	test('model becomes unreachable after all references released', async () => {
		const testService = createChatService();

		// Create a session with non-trivial content to track
		const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
		let model: ChatModel | undefined = ref.object as ChatModel;
		const sessionResource = model.sessionResource;
		model.addRequest({ parts: [], text: 'a request' }, { variables: [] }, 0);

		// Use WeakRef to detect GC
		const weakModel = new WeakRef(model);

		// Dispose the reference and clear the local strong reference
		ref.dispose();
		model = undefined;
		await testService.waitForModelDisposals();

		// Model should not be in the store
		assert.strictEqual(testService.getSession(sessionResource), undefined, 'Model should be gone from store');

		// The reference debug snapshot should show no models
		const debugInfo = testService.getChatModelReferenceDebugInfo();
		assert.strictEqual(debugInfo.totalModels, 0, 'No models should be tracked');

		// Force GC and check weak ref
		if (typeof globalThis.gc === 'function') {
			globalThis.gc();
			// After GC, the weak reference should be cleared
			assert.strictEqual(weakModel.deref(), undefined, 'Model should be GC\'d after all references released');
		}
	});

	test('rapid session switching accumulates at most 2 live models', async () => {
		const testService = createChatService();

		// Create 5 sessions with content
		const sessionResources: URI[] = [];
		for (let i = 0; i < 5; i++) {
			const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
			const model = ref.object as ChatModel;
			model.addRequest({ parts: [], text: `session ${i} request` }, { variables: [] }, 0);
			sessionResources.push(model.sessionResource);
			ref.dispose();
		}
		await testService.waitForModelDisposals();

		// Now rapidly switch through all sessions without waiting for disposal
		let currentRef: IChatModelReference | undefined;
		for (const resource of sessionResources) {
			const newRef = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None, 'test#rapid');
			assert.ok(newRef);
			currentRef?.dispose();
			currentRef = newRef;
		}

		// After waiting for disposals, should be exactly 1
		await testService.waitForModelDisposals();
		const finalDebugInfo = testService.getChatModelReferenceDebugInfo();
		assert.strictEqual(finalDebugInfo.totalModels, 1, 'Should have exactly 1 model after waiting for disposals');

		currentRef!.dispose();
		await testService.waitForModelDisposals();
	});

	suite('loadRemoteSession progress streaming', () => {
		const remoteScheme = 'remote-streaming-test';

		interface IProvidedSessionOptions {
			readonly progressObs?: ISettableObservable<IChatProgress[]>;
			readonly isCompleteObs?: ISettableObservable<boolean>;
			readonly interruptActiveResponseCallback?: () => Promise<boolean>;
			readonly onDidStartServerRequest?: Event<{ prompt: string }>;
			readonly history?: readonly IChatSessionHistoryItem[];
		}

		function setupRemoteProvider(opts: IProvidedSessionOptions): { resource: URI; provided: IChatSession } {
			const resource = URI.from({ scheme: remoteScheme, path: '/session-' + generateId() });
			const mockSessionsService = new MockChatSessionsService();
			instantiationService.stub(IChatSessionsService, mockSessionsService);

			testDisposables.add(chatAgentService.registerAgent(remoteScheme, { ...getAgentData(remoteScheme), isDefault: true }));
			testDisposables.add(chatAgentService.registerAgentImplementation(remoteScheme, { async invoke() { return {}; } }));

			const provided: IChatSession = {
				sessionResource: resource,
				history: opts.history ?? [{ type: 'request', prompt: 'hello', participant: remoteScheme }],
				onWillDispose: Event.None,
				progressObs: opts.progressObs,
				isCompleteObs: opts.isCompleteObs,
				interruptActiveResponseCallback: opts.interruptActiveResponseCallback,
				onDidStartServerRequest: opts.onDidStartServerRequest,
				dispose: () => { },
			};
			testDisposables.add(mockSessionsService.registerChatSessionContentProvider(remoteScheme, {
				provideChatSessionContent: () => Promise.resolve(provided),
			}));

			return { resource, provided };
		}

		let idCounter = 0;
		function generateId(): string {
			return `${Date.now()}-${idCounter++}`;
		}

		test('already-complete session at load time: no initial pending request, response is completed via autorun', async () => {
			const progressObs = observableValue<IChatProgress[]>('progress', []);
			const isCompleteObs = observableValue<boolean>('isComplete', true);
			let interruptCalls = 0;
			const { resource } = setupRemoteProvider({
				progressObs,
				isCompleteObs,
				interruptActiveResponseCallback: async () => { interruptCalls++; return true; },
			});

			const testService = createChatService();
			const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
			assert.ok(ref);
			testDisposables.add(ref);

			const model = ref.object as ChatModel;
			const lastRequest = model.lastRequest!;
			assert.strictEqual(lastRequest.response?.isComplete, true, 'Response should be completed through the isComplete autorun');

			// No pending request should exist — cancelling is a noop and must not call the interrupt callback.
			await testService.cancelCurrentRequestForSession(resource, 'test');
			assert.strictEqual(interruptCalls, 0, 'Interrupt callback should not be invoked when there is no pending request');
		});

		test('active session at load time: cancelCurrentRequestForSession invokes the interrupt callback', async () => {
			const progressObs = observableValue<IChatProgress[]>('progress', []);
			const isCompleteObs = observableValue<boolean>('isComplete', false);
			let interruptCalls = 0;
			const { resource } = setupRemoteProvider({
				progressObs,
				isCompleteObs,
				interruptActiveResponseCallback: async () => { interruptCalls++; return true; },
			});

			const testService = createChatService();
			const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
			assert.ok(ref);
			testDisposables.add(ref);

			const model = ref.object as ChatModel;
			assert.strictEqual(model.lastRequest?.response?.isComplete, false, 'Response must stay open while session is active');

			await testService.cancelCurrentRequestForSession(resource, 'test');
			assert.strictEqual(interruptCalls, 1, 'Interrupt callback should be invoked once');
		});

		test('transition of isCompleteObs to true clears pending request and completes response', async () => {
			const progressObs = observableValue<IChatProgress[]>('progress', []);
			const isCompleteObs = observableValue<boolean>('isComplete', false);
			let interruptCalls = 0;
			const { resource } = setupRemoteProvider({
				progressObs,
				isCompleteObs,
				interruptActiveResponseCallback: async () => { interruptCalls++; return true; },
			});

			const testService = createChatService();
			const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
			assert.ok(ref);
			testDisposables.add(ref);

			const model = ref.object as ChatModel;
			const lastRequest = model.lastRequest!;
			assert.strictEqual(lastRequest.response?.isComplete, false);

			// Simulate server finishing the turn.
			isCompleteObs.set(true, undefined);

			assert.strictEqual(lastRequest.response?.isComplete, true, 'Response should complete when isCompleteObs transitions to true');

			// Pending request entry should now be gone — cancel must be a noop.
			await testService.cancelCurrentRequestForSession(resource, 'test');
			assert.strictEqual(interruptCalls, 0, 'Interrupt should not fire after the turn has completed');
		});

		test('interrupt callback returning false installs a fresh pending request so cancel can be retried', async () => {
			const progressObs = observableValue<IChatProgress[]>('progress', []);
			const isCompleteObs = observableValue<boolean>('isComplete', false);
			const interruptResults = [false, true];
			const interruptInvocations: number[] = [];
			const { resource } = setupRemoteProvider({
				progressObs,
				isCompleteObs,
				interruptActiveResponseCallback: async () => {
					const index = interruptInvocations.length;
					interruptInvocations.push(index);
					return interruptResults[index] ?? true;
				},
			});

			const testService = createChatService();
			const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
			assert.ok(ref);
			testDisposables.add(ref);

			// First cancel: user rejects the interruption, so a new pending request is wired up.
			await testService.cancelCurrentRequestForSession(resource, 'test-first');

			// Second cancel: should find the freshly-installed pending request and fire the callback again.
			await testService.cancelCurrentRequestForSession(resource, 'test-second');

			assert.strictEqual(interruptInvocations.length, 2, 'Interrupt callback should be invoked on both cancel attempts');
		});

		test('non-streaming session with isCompleteObs=true at load: response completes synchronously', async () => {
			const isCompleteObs = observableValue<boolean>('isComplete', true);
			// Deliberately no progressObs / interruptActiveResponseCallback — falls through to the non-streaming branch.
			const { resource } = setupRemoteProvider({ isCompleteObs });

			const testService = createChatService();
			const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
			assert.ok(ref);
			testDisposables.add(ref);

			const model = ref.object as ChatModel;
			assert.strictEqual(model.lastRequest?.response?.isComplete, true, 'Non-streaming session should complete response at load time');
		});

		test('draft input is restored after disposing and reloading a remote session', async () => {
			const { resource } = setupRemoteProvider({ history: [] });

			const testService = createChatService();

			// Load the session and seed an unsent draft on its inputModel.
			const ref1 = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
			assert.ok(ref1, 'Should load remote session');
			const model1 = ref1.object as ChatModel;
			model1.inputModel.setState({
				inputText: 'unsent draft',
				selections: [{ selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 12 }],
			});

			// Release the only reference -> willDisposeModel runs and persists metadata.
			ref1.dispose();
			await testService.waitForModelDisposals();

			// Reload the same session. The draft must be restored from metadata.
			const ref2 = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
			assert.ok(ref2, 'Should re-load remote session');
			testDisposables.add(ref2);
			const model2 = ref2.object as ChatModel;
			const restored = model2.inputModel.state.get();
			assert.strictEqual(restored?.inputText, 'unsent draft', 'Input text should be restored');
		});
	});
});


function toSnapshotExportData(model: IChatModel) {
	const exp = model.toExport();
	return {
		...exp,
		requests: exp.requests.map(r => {
			// Destructure properties after `vote` so we can insert `voteDownReason` in the correct position for snapshot compat
			const { slashCommand, usedContext, contentReferences, codeCitations, timeSpentWaiting, isSystemInitiated: _isSystemInitiated, systemInitiatedLabel: _systemInitiatedLabel, elapsedMs: _elapsedMs, completionTokens: _completionTokens, ...rest } = r;
			return {
				...rest,
				modelState: {
					...r.modelState,
					completedAt: undefined
				},
				timestamp: undefined,
				requestId: undefined, // id contains a random part
				responseId: undefined, // id contains a random part
				voteDownReason: undefined, // removed from model, kept for snapshot compat
				slashCommand,
				usedContext,
				contentReferences,
				codeCitations,
				timeSpentWaiting,
			};
		})
	};
}
