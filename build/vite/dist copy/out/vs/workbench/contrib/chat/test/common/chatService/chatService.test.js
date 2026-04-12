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
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
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
import { ChatSendResult, IChatService } from '../../../common/chatService/chatService.js';
import { ChatService } from '../../../common/chatService/chatServiceImpl.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatSlashCommandService, IChatSlashCommandService } from '../../../common/participants/chatSlashCommands.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { MockChatVariablesService } from '../mockChatVariables.js';
import { MockPromptsService } from '../promptSyntax/service/mockPromptsService.js';
import { MockLanguageModelToolsService } from '../tools/mockLanguageModelToolsService.js';
import { MockChatService } from './mockChatService.js';
import { ChatSessionOptionsMap, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { MockChatSessionsService } from '../mockChatSessionsService.js';
const chatAgentWithUsedContextId = 'ChatProviderWithUsedContext';
const chatAgentWithUsedContext = {
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
        return [{ kind: 'reply', message: 'Something else', agentId: '', tooltip: 'a tooltip' }];
    },
};
const chatAgentWithMarkdownId = 'ChatProviderWithMarkdown';
const chatAgentWithMarkdown = {
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
function getAgentData(id) {
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
    let instantiationService;
    let testFileService;
    let editingSessionEntries;
    let chatAgentService;
    const testServices = [];
    /**
     * Ensure we wait for model disposals from all created ChatServices
     */
    function createChatService() {
        const service = testDisposables.add(instantiationService.createInstance(ChatService));
        testServices.push(service);
        return service;
    }
    function startSessionModel(service, location = ChatAgentLocation.Chat) {
        const ref = testDisposables.add(service.startNewLocalSession(location));
        return ref;
    }
    async function getOrRestoreModel(service, resource) {
        const ref = await service.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
        if (!ref) {
            return undefined;
        }
        return testDisposables.add(ref).object;
    }
    setup(async () => {
        instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection([IChatVariablesService, new MockChatVariablesService()], [IWorkbenchAssignmentService, new NullWorkbenchAssignmentService()], [IMcpService, new TestMcpService()], [IPromptsService, new MockPromptsService()], [ILanguageModelToolsService, testDisposables.add(new MockLanguageModelToolsService())])));
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
        instantiationService.stub(IChatEditingService, new class extends mock() {
            startOrContinueGlobalEditingSession() {
                return {
                    state: constObservable(2 /* ChatEditingSessionState.Idle */),
                    requestDisablement: observableValue('requestDisablement', []),
                    entries: editingSessionEntries,
                    dispose: () => { }
                };
            }
        });
        // Configure test file service with tracking and in-memory storage
        testFileService = testDisposables.add(new InMemoryTestFileService());
        instantiationService.stub(IFileService, testFileService);
        chatAgentService = testDisposables.add(instantiationService.createInstance(ChatAgentService));
        instantiationService.stub(IChatAgentService, chatAgentService);
        const agent = {
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
        const session1 = session1Ref.object;
        session1.addRequest({ parts: [], text: 'request 1' }, { variables: [] }, 0);
        const session2Ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
        const session2 = session2Ref.object;
        session2.addRequest({ parts: [], text: 'request 2' }, { variables: [] }, 0);
        // Dispose refs to trigger persistence to file service
        session1Ref.dispose();
        session2Ref.dispose();
        // Wait for async persistence to complete
        await testService.waitForModelDisposals();
        // Verify that sessions were written to the file service
        assert.strictEqual(testFileService.writeOperations.length, 2, 'Should have written 2 sessions to file service');
        const session1WriteOp = testFileService.writeOperations.find((op) => op.content.includes('request 1'));
        const session2WriteOp = testFileService.writeOperations.find((op) => op.content.includes('request 2'));
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
        const modifiedEntry = new class extends mock() {
            constructor() {
                super(...arguments);
                this.state = constObservable(0 /* ModifiedFileEntryState.Modified */);
            }
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
        const historyLengthAgent = {
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
        let serializedChatData;
        testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithUsedContextId, chatAgentWithUsedContext));
        // create the first service, send request, get response, and serialize the state
        { // serapate block to not leak variables in outer scope
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
        let serializedChatData;
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
        let serializedChatData;
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
        const keepAliveRef = testDisposables.add(testService.acquireExistingSession(sessionResource, 'test#keepAlive'));
        assert.ok(keepAliveRef, 'acquireExistingSession should return a reference');
        // Release the original reference to simulate user navigating away
        modelRef.dispose();
        await testService.waitForModelDisposals();
        // Model should still be accessible because keepAliveRef holds it
        const response = await testService.sendRequest(sessionResource, 'terminal completed', {
            queue: "steering" /* ChatRequestQueueKind.Steering */,
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
        const requestStarted = new DeferredPromise();
        const completeRequest = new DeferredPromise();
        let setYieldRequestedCalled = false;
        const slowAgent = {
            async invoke(request, progress, history, token) {
                requestStarted.complete();
                await completeRequest.p;
                return {};
            },
            setYieldRequested(requestId, value) {
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
            queue: "steering" /* ChatRequestQueueKind.Steering */
        });
        assert.strictEqual(steeringResponse.kind, 'queued');
        // setYieldRequested should have been called on the agent
        assert.strictEqual(setYieldRequestedCalled, true, 'setYieldRequested should be called when a steering message is queued');
        // Complete the first request
        completeRequest.complete();
        await response.data.responseCompletePromise;
    });
    test('multiple steering messages are combined into a single request', async () => {
        const requestStarted = new DeferredPromise();
        const completeRequest = new DeferredPromise();
        const invokedRequests = [];
        const slowAgent = {
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
        const steering1 = await testService.sendRequest(model.sessionResource, 'steering1', { agentId: 'slowAgent', queue: "steering" /* ChatRequestQueueKind.Steering */ });
        const steering2 = await testService.sendRequest(model.sessionResource, 'steering2', { agentId: 'slowAgent', queue: "steering" /* ChatRequestQueueKind.Steering */ });
        const steering3 = await testService.sendRequest(model.sessionResource, 'steering3', { agentId: 'slowAgent', queue: "steering" /* ChatRequestQueueKind.Steering */ });
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
            getHooks(_token) {
                return Promise.resolve({ hooks: {}, hasDisabledClaudeHooks: true });
            }
        }();
        instantiationService.stub(IPromptsService, mockPromptsService);
        const storageService = instantiationService.get(IStorageService);
        const disabledHintsKey = 'chat.disabledClaudeHooks.notification';
        // Before any request, the storage key should not be set
        assert.strictEqual(storageService.getBoolean(disabledHintsKey, 1 /* StorageScope.WORKSPACE */), undefined);
        const testService = createChatService();
        const modelRef = testDisposables.add(startSessionModel(testService));
        const model = modelRef.object;
        // Disabled hooks are reported for every request, but the hint should only be shown once per workspace.
        const response = await testService.sendRequest(model.sessionResource, 'test request');
        ChatSendResult.assertSent(response);
        await response.data.responseCompletePromise;
        // The hint should have been shown, and the key set to true
        assert.strictEqual(storageService.getBoolean(disabledHintsKey, 1 /* StorageScope.WORKSPACE */), true, 'Flag should be set after showing the hint');
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
            constructor() {
                super(...arguments);
                this._callCount = 0;
            }
            getHooks(_token) {
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
        assert.strictEqual(storageService.getBoolean(disabledHintsKey, 1 /* StorageScope.WORKSPACE */), undefined, 'Flag should not be set when no disabled hooks');
        const firstRequest = model.getRequests()[0];
        assert.ok(firstRequest, 'Expected the initial request to exist before resend');
        // Resend the original request: now disabled hooks are present (simulates resend after setup)
        await testService.resendRequest(firstRequest);
        // Now the flag should be set and the hint shown
        assert.strictEqual(storageService.getBoolean(disabledHintsKey, 1 /* StorageScope.WORKSPACE */), true, 'Flag should be set after showing the hint');
        const requests = model.getRequests();
        assert.strictEqual(requests.length, 1, 'Resend should replace the original request');
        const responseParts2 = requests[0].response?.response.value ?? [];
        const hasHookHint2 = responseParts2.some(part => part.kind === 'disabledClaudeHooks');
        assert.ok(hasHookHint2, 'Response should contain the disabledClaudeHooks hint on second request');
    });
    test('cancelCurrentRequestForSession waits for response completion', async () => {
        const requestStarted = new DeferredPromise();
        const completeRequest = new DeferredPromise();
        const slowAgent = {
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
        assert.strictEqual(lastRequest.response.state, 2 /* ResponseModelState.Cancelled */, 'Response should be in Cancelled state');
    });
    test('cancelCurrentRequestForSession returns after timeout if response does not complete', async () => {
        const requestStarted = new DeferredPromise();
        const completeRequest = new DeferredPromise();
        const hangingAgent = {
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
        const requestStarted = new DeferredPromise();
        const completeRequest = new DeferredPromise();
        const invokedMessages = [];
        const slowAgent = {
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
        const queued = await testService.sendRequest(source.sessionResource, 'queued request', { agentId: 'slowAgent', queue: "queued" /* ChatRequestQueueKind.Queued */ });
        assert.ok(ChatSendResult.isQueued(queued));
        // Remove the queued request from source
        const pendingId = source.getPendingRequests()[0].request.id;
        testService.removePendingRequest(source.sessionResource, pendingId);
        assert.strictEqual(source.getPendingRequests().length, 0);
        // Re-send it on a new target session through the normal queue path
        const targetRef = testDisposables.add(startSessionModel(testService));
        const target = targetRef.object;
        const resent = await testService.sendRequest(target.sessionResource, 'queued request', { agentId: 'slowAgent', queue: "queued" /* ChatRequestQueueKind.Queued */, pauseQueue: true });
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
        const invocationOrder = [];
        const firstRequestStarted = new DeferredPromise();
        const firstRequestGate = new DeferredPromise();
        const slowAgent = {
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
        const q1 = await testService.sendRequest(source.sessionResource, 'queued-1', { agentId: 'slowAgent', queue: "queued" /* ChatRequestQueueKind.Queued */ });
        const q2 = await testService.sendRequest(source.sessionResource, 'queued-2', { agentId: 'slowAgent', queue: "queued" /* ChatRequestQueueKind.Queued */ });
        const q3 = await testService.sendRequest(source.sessionResource, 'queued-3', { agentId: 'slowAgent', queue: "queued" /* ChatRequestQueueKind.Queued */ });
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
        const resent1 = await testService.sendRequest(target.sessionResource, 'queued-1', { agentId: 'slowAgent', queue: "queued" /* ChatRequestQueueKind.Queued */, pauseQueue: true });
        const resent2 = await testService.sendRequest(target.sessionResource, 'queued-2', { agentId: 'slowAgent', queue: "queued" /* ChatRequestQueueKind.Queued */, pauseQueue: true });
        const resent3 = await testService.sendRequest(target.sessionResource, 'queued-3', { agentId: 'slowAgent', queue: "queued" /* ChatRequestQueueKind.Queued */, pauseQueue: true });
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
            provideChatSessionContent: (_resource, _token) => {
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
        const remoteAgent = {
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
        const newModel = testService.getSession(realResource);
        assert.ok(newModel, 'New model should exist at the real resource');
        assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(mockSessionsService.getSessionOptions(realResource)), [
            { optionId: 'model', value: 'claude-3.5-sonnet' },
            { optionId: 'repo', value: 'my-repo' },
        ]);
    });
});
function toSnapshotExportData(model) {
    const exp = model.toExport();
    return {
        ...exp,
        requests: exp.requests.map(r => {
            // Destructure properties after `vote` so we can insert `voteDownReason` in the correct position for snapshot compat
            const { slashCommand, usedContext, contentReferences, codeCitations, timeSpentWaiting, isSystemInitiated: _isSystemInitiated, systemInitiatedLabel: _systemInitiatedLabel, ...rest } = r;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxlQUFlLEVBQXVCLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BILE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDL0YsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFB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