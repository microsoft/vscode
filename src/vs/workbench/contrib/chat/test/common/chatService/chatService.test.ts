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
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
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
import { ChatRequestQueueKind, ChatSendResult, IChatFollowup, IChatModelReference, IChatService, ResponseModelState } from '../../../common/chatService/chatService.js';
import { ChatService } from '../../../common/chatService/chatServiceImpl.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { IChatEditingService, IChatEditingSession } from '../../../common/editing/chatEditingService.js';
import { ChatModel, IChatModel, ISerializableChatData } from '../../../common/model/chatModel.js';
import { ChatAgentService, IChatAgent, IChatAgentData, IChatAgentImplementation, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatSlashCommandService, IChatSlashCommandService } from '../../../common/participants/chatSlashCommands.js';
import { IConfiguredHooksInfo, IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { MockChatVariablesService } from '../mockChatVariables.js';
import { MockPromptsService } from '../promptSyntax/service/mockPromptsService.js';
import { MockLanguageModelToolsService } from '../tools/mockLanguageModelToolsService.js';
import { MockChatService } from './mockChatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { MockChatSessionsService } from '../mockChatSessionsService.js';

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
		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() {
			override startOrContinueGlobalEditingSession(): IChatEditingSession {
				return {
					state: constObservable('idle'),
					requestDisablement: observableValue('requestDisablement', []),
					entries: constObservable([]),
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

	test('onDidDisposeSession', async () => {
		const testService = createChatService();
		const modelRef = testService.startNewLocalSession(ChatAgentLocation.Chat);
		const model = modelRef.object;

		let disposed = false;
		testDisposables.add(testService.onDidDisposeSession(e => {
			for (const resource of e.sessionResource) {
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
			override getHooks(_token: CancellationToken, _sessionResource?: URI): Promise<IConfiguredHooksInfo> {
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
			override getHooks(_token: CancellationToken, _sessionResource?: URI): Promise<IConfiguredHooksInfo> {
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
		assert.ok(newModel.contributedChatSession, 'New model should have contributedChatSession');
		assert.deepStrictEqual(
			newModel.contributedChatSession?.initialSessionOptions?.map(o => ({ optionId: o.optionId, value: o.value })),
			[
				{ optionId: 'model', value: 'claude-3.5-sonnet' },
				{ optionId: 'repo', value: 'my-repo' },
			]
		);
	});
});


function toSnapshotExportData(model: IChatModel) {
	const exp = model.toExport();
	return {
		...exp,
		requests: exp.requests.map(r => {
			return {
				...r,
				modelState: {
					...r.modelState,
					completedAt: undefined
				},
				timestamp: undefined,
				requestId: undefined, // id contains a random part
				responseId: undefined, // id contains a random part
			};
		})
	};
}
