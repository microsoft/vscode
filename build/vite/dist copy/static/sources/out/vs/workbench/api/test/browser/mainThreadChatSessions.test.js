/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { asSinonMethodStub } from '../../../../base/test/common/sinonUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { IAgentSessionsService } from '../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ChatSessionsService } from '../../../contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import { IChatService } from '../../../contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../contrib/chat/common/constants.js';
import { LocalChatSessionUri } from '../../../contrib/chat/common/model/chatUri.js';
import { MockChatService } from '../../../contrib/chat/test/common/chatService/mockChatService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService, nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { mock, TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadChatSessions, ObservableChatSession } from '../../browser/mainThreadChatSessions.js';
import { ExtHostChatSessions } from '../../common/extHostChatSessions.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import * as extHostTypes from '../../common/extHostTypes.js';
import { AnyCallRPCProtocol } from '../common/testRPCProtocol.js';
suite('ObservableChatSession', function () {
    let disposables;
    let logService;
    let dialogService;
    let proxy;
    setup(function () {
        disposables = new DisposableStore();
        logService = new NullLogService();
        dialogService = new class extends mock() {
            async confirm() {
                return { confirmed: true };
            }
        };
        proxy = {
            $provideChatSessionContent: sinon.stub(),
            $provideChatSessionProviderOptions: sinon.stub().resolves(undefined),
            $provideHandleOptionsChange: sinon.stub(),
            $interruptChatSessionActiveResponse: sinon.stub(),
            $invokeChatSessionRequestHandler: sinon.stub(),
            $disposeChatSessionContent: sinon.stub(),
            $refreshChatSessionItems: sinon.stub(),
            $onDidChangeChatSessionItemState: sinon.stub(),
            $newChatSessionItem: sinon.stub().resolves(undefined),
            $forkChatSession: sinon.stub().resolves(undefined),
            $provideChatSessionInputState: sinon.stub().resolves(undefined),
        };
    });
    teardown(function () {
        disposables.dispose();
        sinon.restore();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createSessionContent(options = {}) {
        const id = options.id || 'test-id';
        return {
            resource: LocalChatSessionUri.forSession(id),
            title: options.title,
            history: options.history || [],
            hasActiveResponseCallback: options.hasActiveResponseCallback ?? false,
            hasRequestHandler: options.hasRequestHandler ?? false,
            hasForkHandler: options.hasForkHandler ?? false,
            supportsInterruption: false,
        };
    }
    async function createInitializedSession(sessionContent, sessionId = 'test-id') {
        const resource = LocalChatSessionUri.forSession(sessionId);
        const session = new ObservableChatSession(resource, 1, proxy, logService, dialogService);
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        await session.initialize(CancellationToken.None, { initialSessionOptions: [] });
        return session;
    }
    test('constructor creates session with proper initial state', function () {
        const sessionId = 'test-id';
        const resource = LocalChatSessionUri.forSession(sessionId);
        const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
        assert.strictEqual(session.providerHandle, 1);
        assert.deepStrictEqual(session.history, []);
        assert.ok(session.progressObs);
        assert.ok(session.isCompleteObs);
        // Initial state should be inactive and incomplete
        assert.deepStrictEqual(session.progressObs.get(), []);
        assert.strictEqual(session.isCompleteObs.get(), false);
    });
    test('session queues progress before initialization and processes it after', async function () {
        const sessionId = 'test-id';
        const resource = LocalChatSessionUri.forSession(sessionId);
        const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
        const progress1 = { kind: 'progressMessage', content: { value: 'Hello', isTrusted: false } };
        const progress2 = { kind: 'progressMessage', content: { value: 'World', isTrusted: false } };
        // Add progress before initialization - should be queued
        session.handleProgressChunk('req1', [progress1]);
        session.handleProgressChunk('req1', [progress2]);
        // Progress should be queued, not visible yet
        assert.deepStrictEqual(session.progressObs.get(), []);
        // Initialize the session
        const sessionContent = createSessionContent();
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        await session.initialize(CancellationToken.None, { initialSessionOptions: [] });
        // Now progress should be visible
        assert.strictEqual(session.progressObs.get().length, 2);
        assert.deepStrictEqual(session.progressObs.get(), [progress1, progress2]);
        assert.strictEqual(session.isCompleteObs.get(), true); // Should be complete for sessions without active response callback or request handler
    });
    test('initialization loads session history and sets up capabilities', async function () {
        const sessionHistory = [
            { type: 'request', prompt: 'Previous question' },
            { type: 'response', parts: [{ kind: 'progressMessage', content: { value: 'Previous answer', isTrusted: false } }] }
        ];
        const sessionContent = createSessionContent({
            history: sessionHistory,
            hasActiveResponseCallback: true,
            hasRequestHandler: true
        });
        const session = disposables.add(await createInitializedSession(sessionContent));
        // Verify history was loaded
        assert.strictEqual(session.history.length, 2);
        assert.strictEqual(session.history[0].type, 'request');
        assert.strictEqual(session.history[0].prompt, 'Previous question');
        assert.strictEqual(session.history[1].type, 'response');
        // Verify capabilities were set up
        assert.ok(session.interruptActiveResponseCallback);
        assert.ok(session.requestHandler);
    });
    test('initialization revives modeInstructions in history', async function () {
        const sessionContent = createSessionContent({
            history: [
                {
                    type: 'request',
                    prompt: 'Hello',
                    participant: 'test',
                    modeInstructions: {
                        uri: { $mid: 1 /* MarshalledId.Uri */, scheme: 'file', path: '/custom-agent' },
                        name: 'my-agent',
                        content: 'instructions',
                        toolReferences: [],
                        isBuiltin: false,
                    },
                },
            ],
        });
        const session = disposables.add(await createInitializedSession(sessionContent));
        const requestItem = session.history[0];
        assert.strictEqual(requestItem.type, 'request');
        if (requestItem.type === 'request') {
            assert.ok(requestItem.modeInstructions);
            assert.ok(URI.isUri(requestItem.modeInstructions.uri));
            assert.strictEqual(requestItem.modeInstructions.name, 'my-agent');
            assert.strictEqual(requestItem.modeInstructions.isBuiltin, false);
        }
    });
    test('toRequestDto passes modeInstructions through', async function () {
        const session = disposables.add(await createInitializedSession(createSessionContent({ hasForkHandler: true })));
        assert.ok(session.forkSession);
        const modeInstructions = {
            uri: URI.parse('file:///custom-agent'),
            name: 'my-agent',
            content: 'agent instructions',
            toolReferences: [],
            isBuiltin: false,
        };
        const request = {
            type: 'request',
            id: 'req-1',
            prompt: 'Hello with mode',
            participant: 'participant',
            modeInstructions,
        };
        const forkedItem = {
            resource: URI.file('/tmp/forked.md'),
            label: 'Forked',
            changes: [],
            timing: {
                created: 123,
                lastRequestStarted: 234,
                lastRequestEnded: 345,
            },
        };
        asSinonMethodStub(proxy.$forkChatSession).resolves(forkedItem);
        await session.forkSession?.(request, CancellationToken.None);
        const call = asSinonMethodStub(proxy.$forkChatSession).firstCall;
        const sentDto = call.args[2];
        assert.deepStrictEqual(sentDto.modeInstructions, modeInstructions);
    });
    test('initialization sets forkSession and revives forked items', async function () {
        const session = disposables.add(await createInitializedSession(createSessionContent({ hasForkHandler: true })));
        assert.ok(session.forkSession);
        const forkedResource = URI.file('/tmp/forked-chat.md');
        const forkedItem = {
            resource: forkedResource,
            label: 'Forked Session',
            timing: {
                created: 123,
                lastRequestStarted: 234,
                lastRequestEnded: 345,
            },
            changes: [{
                    uri: URI.file('/tmp/changed.ts'),
                    originalUri: URI.file('/tmp/original.ts'),
                    insertions: 4,
                    deletions: 2,
                }],
        };
        asSinonMethodStub(proxy.$forkChatSession).resolves(forkedItem);
        const request = { type: 'request', id: 'request-1', prompt: 'Previous question', participant: 'participant' };
        const expectedRequestDto = {
            type: 'request',
            id: 'request-1',
            prompt: 'Previous question',
            participant: 'participant',
            command: undefined,
            variableData: undefined,
            modelId: undefined,
            modeInstructions: undefined,
        };
        const result = await session.forkSession?.(request, CancellationToken.None);
        assert.ok(asSinonMethodStub(proxy.$forkChatSession).calledOnceWithExactly(1, session.sessionResource, expectedRequestDto, CancellationToken.None));
        assert.ok(result);
        assert.ok(result.resource instanceof URI);
        assert.ok(Array.isArray(result.changes));
        assert.ok(result.changes[0].uri instanceof URI);
        assert.ok(result.changes[0].originalUri instanceof URI);
        assert.deepStrictEqual(result, forkedItem);
    });
    test('initialization sets title from session content', async function () {
        const sessionContent = createSessionContent({
            title: 'My Custom Title',
        });
        const session = disposables.add(await createInitializedSession(sessionContent));
        assert.strictEqual(session.title, 'My Custom Title');
    });
    test('title is undefined when not provided in session content', async function () {
        const sessionContent = createSessionContent();
        const session = disposables.add(await createInitializedSession(sessionContent));
        assert.strictEqual(session.title, undefined);
    });
    test('initialization is idempotent and returns same promise', async function () {
        const sessionId = 'test-id';
        const resource = LocalChatSessionUri.forSession(sessionId);
        const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
        const sessionContent = createSessionContent();
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        const promise1 = session.initialize(CancellationToken.None, { initialSessionOptions: [] });
        const promise2 = session.initialize(CancellationToken.None, { initialSessionOptions: [] });
        assert.strictEqual(promise1, promise2);
        await promise1;
        // Should only call proxy once even though initialize was called twice
        assert.ok(asSinonMethodStub(proxy.$provideChatSessionContent).calledOnce);
    });
    test('initialization forwards initial session options context', async function () {
        const sessionId = 'test-id';
        const resource = LocalChatSessionUri.forSession(sessionId);
        const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
        const initialSessionOptions = [{ optionId: 'model', value: 'gpt-4.1' }];
        const sessionContent = createSessionContent();
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        await session.initialize(CancellationToken.None, { initialSessionOptions });
        assert.ok(asSinonMethodStub(proxy.$provideChatSessionContent).calledOnceWith(1, resource, { initialSessionOptions }, CancellationToken.None));
    });
    test('progress handling works correctly after initialization', async function () {
        const sessionContent = createSessionContent();
        const session = disposables.add(await createInitializedSession(sessionContent));
        const progress = { kind: 'progressMessage', content: { value: 'New progress', isTrusted: false } };
        // Add progress after initialization
        session.handleProgressChunk('req1', [progress]);
        assert.deepStrictEqual(session.progressObs.get(), [progress]);
        // Session with no capabilities should remain complete
        assert.strictEqual(session.isCompleteObs.get(), true);
    });
    test('progress completion updates session state correctly', async function () {
        const sessionContent = createSessionContent();
        const session = disposables.add(await createInitializedSession(sessionContent));
        // Add some progress first
        const progress = { kind: 'progressMessage', content: { value: 'Processing...', isTrusted: false } };
        session.handleProgressChunk('req1', [progress]);
        // Session with no capabilities should already be complete
        assert.strictEqual(session.isCompleteObs.get(), true);
        session.handleProgressComplete('req1');
        assert.strictEqual(session.isCompleteObs.get(), true);
    });
    test('session with active response callback becomes active when progress is added', async function () {
        const sessionContent = createSessionContent({ hasActiveResponseCallback: true });
        const session = disposables.add(await createInitializedSession(sessionContent));
        // Session should start inactive and incomplete (has capabilities but no active progress)
        assert.strictEqual(session.isCompleteObs.get(), false);
        const progress = { kind: 'progressMessage', content: { value: 'Processing...', isTrusted: false } };
        session.handleProgressChunk('req1', [progress]);
        assert.strictEqual(session.isCompleteObs.get(), false);
        session.handleProgressComplete('req1');
        assert.strictEqual(session.isCompleteObs.get(), true);
    });
    test('request handler forwards requests to proxy', async function () {
        const sessionContent = createSessionContent({ hasRequestHandler: true });
        const session = disposables.add(await createInitializedSession(sessionContent));
        assert.ok(session.requestHandler);
        const request = {
            requestId: 'req1',
            sessionResource: LocalChatSessionUri.forSession('test-session'),
            agentId: 'test-agent',
            message: 'Test prompt',
            location: ChatAgentLocation.Chat,
            variables: { variables: [] }
        };
        const progressCallback = sinon.stub();
        await session.requestHandler(request, progressCallback, [], CancellationToken.None);
        assert.ok(asSinonMethodStub(proxy.$invokeChatSessionRequestHandler).calledOnceWith(1, session.sessionResource, request, [], CancellationToken.None));
    });
    test('request handler forwards progress updates to external callback', async function () {
        const sessionContent = createSessionContent({ hasRequestHandler: true });
        const session = disposables.add(await createInitializedSession(sessionContent));
        assert.ok(session.requestHandler);
        const request = {
            requestId: 'req1',
            sessionResource: LocalChatSessionUri.forSession('test-session'),
            agentId: 'test-agent',
            message: 'Test prompt',
            location: ChatAgentLocation.Chat,
            variables: { variables: [] }
        };
        const progressCallback = sinon.stub();
        let resolveRequest;
        const requestPromise = new Promise(resolve => {
            resolveRequest = resolve;
        });
        asSinonMethodStub(proxy.$invokeChatSessionRequestHandler).returns(requestPromise);
        const requestHandlerPromise = session.requestHandler(request, progressCallback, [], CancellationToken.None);
        const progress1 = { kind: 'progressMessage', content: { value: 'Progress 1', isTrusted: false } };
        const progress2 = { kind: 'progressMessage', content: { value: 'Progress 2', isTrusted: false } };
        session.handleProgressChunk('req1', [progress1]);
        session.handleProgressChunk('req1', [progress2]);
        // Wait a bit for autorun to trigger
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.ok(progressCallback.calledTwice);
        assert.deepStrictEqual(progressCallback.firstCall.args[0], [progress1]);
        assert.deepStrictEqual(progressCallback.secondCall.args[0], [progress2]);
        // Complete the request
        resolveRequest({});
        await requestHandlerPromise;
        assert.strictEqual(session.isCompleteObs.get(), true);
    });
    test('dispose properly cleans up resources and notifies listeners', function () {
        const sessionId = 'test-id';
        const resource = LocalChatSessionUri.forSession(sessionId);
        const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
        let disposeEventFired = false;
        const disposable = session.onWillDispose(() => {
            disposeEventFired = true;
        });
        session.dispose();
        assert.ok(disposeEventFired);
        assert.ok(asSinonMethodStub(proxy.$disposeChatSessionContent).calledOnceWith(1, resource));
        disposable.dispose();
    });
    test('session with multiple request/response pairs in history', async function () {
        const sessionHistory = [
            { type: 'request', prompt: 'First question' },
            { type: 'response', parts: [{ kind: 'progressMessage', content: { value: 'First answer', isTrusted: false } }] },
            { type: 'request', prompt: 'Second question' },
            { type: 'response', parts: [{ kind: 'progressMessage', content: { value: 'Second answer', isTrusted: false } }] }
        ];
        const sessionContent = createSessionContent({
            history: sessionHistory,
            hasActiveResponseCallback: false,
            hasRequestHandler: false
        });
        const session = disposables.add(await createInitializedSession(sessionContent));
        // Verify all history was loaded correctly
        assert.strictEqual(session.history.length, 4);
        assert.strictEqual(session.history[0].type, 'request');
        assert.strictEqual(session.history[0].prompt, 'First question');
        assert.strictEqual(session.history[1].type, 'response');
        assert.strictEqual(session.history[1].parts[0].content.value, 'First answer');
        assert.strictEqual(session.history[2].type, 'request');
        assert.strictEqual(session.history[2].prompt, 'Second question');
        assert.strictEqual(session.history[3].type, 'response');
        assert.strictEqual(session.history[3].parts[0].content.value, 'Second answer');
        // Session should be complete since it has no capabilities
        assert.strictEqual(session.isCompleteObs.get(), true);
    });
});
suite('MainThreadChatSessions', function () {
    let instantiationService;
    let mainThread;
    let proxy;
    let chatSessionsService;
    let disposables;
    setup(function () {
        disposables = new DisposableStore();
        instantiationService = new TestInstantiationService();
        proxy = {
            $provideChatSessionContent: sinon.stub(),
            $provideChatSessionProviderOptions: sinon.stub().resolves(undefined),
            $provideHandleOptionsChange: sinon.stub(),
            $interruptChatSessionActiveResponse: sinon.stub(),
            $invokeChatSessionRequestHandler: sinon.stub(),
            $disposeChatSessionContent: sinon.stub(),
            $refreshChatSessionItems: sinon.stub(),
            $onDidChangeChatSessionItemState: sinon.stub(),
            $newChatSessionItem: sinon.stub().resolves(undefined),
            $forkChatSession: sinon.stub().resolves(undefined),
            $provideChatSessionInputState: sinon.stub().resolves(undefined),
        };
        const extHostContext = new class {
            constructor() {
                this.remoteAuthority = '';
                this.extensionHostKind = 1 /* ExtensionHostKind.LocalProcess */;
            }
            dispose() { }
            assertRegistered() { }
            set(v) { return null; }
            getProxy() { return proxy; }
            drain() { return null; }
        };
        instantiationService.stub(IConfigurationService, new TestConfigurationService());
        instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IEditorService, new class extends mock() {
        });
        instantiationService.stub(IExtensionService, new TestExtensionService());
        instantiationService.stub(IViewsService, new class extends mock() {
            async openView() { return null; }
        });
        instantiationService.stub(IDialogService, new class extends mock() {
            async confirm() {
                return { confirmed: true };
            }
        });
        instantiationService.stub(ILabelService, new class extends mock() {
            registerFormatter() {
                return {
                    dispose: () => { }
                };
            }
        });
        instantiationService.stub(IChatService, new MockChatService());
        instantiationService.stub(IAgentSessionsService, new class extends mock() {
            get model() {
                return new class extends mock() {
                    constructor() {
                        super(...arguments);
                        this.onDidChangeSessionArchivedState = Event.None;
                    }
                };
            }
        });
        chatSessionsService = disposables.add(instantiationService.createInstance(ChatSessionsService));
        instantiationService.stub(IChatSessionsService, chatSessionsService);
        mainThread = disposables.add(instantiationService.createInstance(MainThreadChatSessions, extHostContext));
    });
    teardown(function () {
        disposables.dispose();
        instantiationService.dispose();
        sinon.restore();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('provideChatSessionContent creates and initializes session', async function () {
        const sessionScheme = 'test-session-type';
        mainThread.$registerChatSessionContentProvider(1, sessionScheme);
        const resource = URI.parse(`${sessionScheme}:/test-session`);
        const sessionContent = {
            resource,
            history: [],
            hasActiveResponseCallback: false,
            hasRequestHandler: false,
            hasForkHandler: false,
            supportsInterruption: false,
        };
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        const session1 = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
        assert.ok(session1);
        const session2 = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
        assert.strictEqual(session1, session2);
        assert.ok(asSinonMethodStub(proxy.$provideChatSessionContent).calledOnce);
        mainThread.$unregisterChatSessionContentProvider(1);
    });
    test('provideChatSessionContent propagates title', async function () {
        const sessionScheme = 'test-session-type';
        mainThread.$registerChatSessionContentProvider(1, sessionScheme);
        const resource = URI.parse(`${sessionScheme}:/test-session`);
        const sessionContent = {
            resource,
            title: 'My Session Title',
            history: [],
            hasActiveResponseCallback: false,
            hasRequestHandler: false,
            hasForkHandler: false,
            supportsInterruption: false,
        };
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
        assert.strictEqual(session.title, 'My Session Title');
        mainThread.$unregisterChatSessionContentProvider(1);
    });
    test('$handleProgressChunk routes to correct session', async function () {
        const sessionScheme = 'test-session-type';
        mainThread.$registerChatSessionContentProvider(1, sessionScheme);
        const resource = URI.parse(`${sessionScheme}:/test-session`);
        const sessionContent = {
            resource,
            history: [],
            hasActiveResponseCallback: false,
            hasRequestHandler: false,
            hasForkHandler: false,
            supportsInterruption: false,
        };
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
        const progressDto = { kind: 'progressMessage', content: { value: 'Test', isTrusted: false } };
        await mainThread.$handleProgressChunk(1, resource, 'req1', [progressDto]);
        assert.strictEqual(session.progressObs.get().length, 1);
        assert.strictEqual(session.progressObs.get()[0].kind, 'progressMessage');
        mainThread.$unregisterChatSessionContentProvider(1);
    });
    test('$handleProgressComplete marks session complete', async function () {
        const sessionScheme = 'test-session-type';
        mainThread.$registerChatSessionContentProvider(1, sessionScheme);
        const resource = URI.parse(`${sessionScheme}:/test-session`);
        const sessionContent = {
            resource,
            history: [],
            hasActiveResponseCallback: false,
            hasRequestHandler: false,
            hasForkHandler: false,
            supportsInterruption: false,
        };
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
        const progressDto = { kind: 'progressMessage', content: { value: 'Test', isTrusted: false } };
        await mainThread.$handleProgressChunk(1, resource, 'req1', [progressDto]);
        mainThread.$handleProgressComplete(1, resource, 'req1');
        assert.strictEqual(session.isCompleteObs.get(), true);
        mainThread.$unregisterChatSessionContentProvider(1);
    });
    test('integration with multiple request/response pairs', async function () {
        const sessionScheme = 'test-session-type';
        mainThread.$registerChatSessionContentProvider(1, sessionScheme);
        const resource = URI.parse(`${sessionScheme}:/multi-turn-session`);
        const sessionContent = {
            resource,
            history: [
                { type: 'request', prompt: 'First question', participant: 'test-participant' },
                { type: 'response', parts: [{ kind: 'progressMessage', content: { value: 'First answer', isTrusted: false } }], participant: 'test-participant' },
                { type: 'request', prompt: 'Second question', participant: 'test-participant' },
                { type: 'response', parts: [{ kind: 'progressMessage', content: { value: 'Second answer', isTrusted: false } }], participant: 'test-participant' }
            ],
            hasActiveResponseCallback: false,
            hasRequestHandler: false,
            hasForkHandler: false,
            supportsInterruption: false,
        };
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
        // Verify the session loaded correctly
        assert.ok(session);
        assert.strictEqual(session.history.length, 4);
        // Verify all history items are correctly loaded
        assert.strictEqual(session.history[0].type, 'request');
        assert.strictEqual(session.history[0].prompt, 'First question');
        assert.strictEqual(session.history[1].type, 'response');
        assert.strictEqual(session.history[2].type, 'request');
        assert.strictEqual(session.history[2].prompt, 'Second question');
        assert.strictEqual(session.history[3].type, 'response');
        // Session should be complete since it has no active capabilities
        assert.strictEqual(session.isCompleteObs.get(), true);
        mainThread.$unregisterChatSessionContentProvider(1);
    });
    test('$onDidChangeChatSessionProviderOptions refreshes option groups', async function () {
        const sessionScheme = 'test-session-type';
        const handle = 1;
        const optionGroups1 = [{
                id: 'models',
                name: 'Models',
                items: [{ id: 'modelA', name: 'Model A' }]
            }];
        const optionGroups2 = [{
                id: 'models',
                name: 'Models',
                items: [{ id: 'modelB', name: 'Model B' }]
            }];
        const provideOptionsStub = asSinonMethodStub(proxy.$provideChatSessionProviderOptions);
        provideOptionsStub.onFirstCall().resolves({ optionGroups: optionGroups1 });
        provideOptionsStub.onSecondCall().resolves({ optionGroups: optionGroups2 });
        mainThread.$registerChatSessionContentProvider(handle, sessionScheme);
        // Wait for initial options fetch triggered on registration
        await new Promise(resolve => setTimeout(resolve, 0));
        let storedGroups = chatSessionsService.getOptionGroupsForSessionType(sessionScheme);
        assert.ok(storedGroups);
        assert.strictEqual(storedGroups[0].items[0].id, 'modelA');
        // Simulate extension signaling that provider options have changed
        mainThread.$onDidChangeChatSessionProviderOptions(handle);
        await new Promise(resolve => setTimeout(resolve, 0));
        storedGroups = chatSessionsService.getOptionGroupsForSessionType(sessionScheme);
        assert.ok(storedGroups);
        assert.strictEqual(storedGroups[0].items[0].id, 'modelB');
        mainThread.$unregisterChatSessionContentProvider(handle);
    });
    test('getSessionOption returns undefined for unset options', async function () {
        const sessionScheme = 'test-session-type';
        mainThread.$registerChatSessionContentProvider(1, sessionScheme);
        const resource = URI.parse(`${sessionScheme}:/test-session`);
        const sessionContent = {
            resource,
            history: [],
            hasActiveResponseCallback: false,
            hasRequestHandler: false,
            hasForkHandler: false,
            supportsInterruption: false,
        };
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
        // getSessionOption should return undefined for unset options
        assert.strictEqual(chatSessionsService.getSessionOption(resource, 'models'), undefined);
        assert.strictEqual(chatSessionsService.getSessionOption(resource, 'anyOption'), undefined);
        mainThread.$unregisterChatSessionContentProvider(1);
    });
    test('getSessionOption returns value for explicitly set options', async function () {
        const sessionScheme = 'test-session-type';
        mainThread.$registerChatSessionContentProvider(1, sessionScheme);
        const resource = URI.parse(`${sessionScheme}:/test-session`);
        const sessionContent = {
            resource,
            history: [],
            hasActiveResponseCallback: false,
            hasRequestHandler: false,
            hasForkHandler: false,
            supportsInterruption: false,
            options: {
                'models': 'gpt-4',
                'region': { id: 'us-east', name: 'US East' }
            }
        };
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
        // getSessionOption should return the configured values
        assert.strictEqual(chatSessionsService.getSessionOption(resource, 'models'), 'gpt-4');
        assert.deepStrictEqual(chatSessionsService.getSessionOption(resource, 'region'), { id: 'us-east', name: 'US East' });
        // getSessionOption should return undefined for options not in the session
        assert.strictEqual(chatSessionsService.getSessionOption(resource, 'notConfigured'), undefined);
        mainThread.$unregisterChatSessionContentProvider(1);
    });
    test('option change notifications are sent to the extension', async function () {
        const sessionScheme = 'test-session-type';
        const handle = 1;
        mainThread.$registerChatSessionContentProvider(handle, sessionScheme);
        const sessionContent = {
            resource: URI.parse(`${sessionScheme}:/test-session`),
            history: [],
            hasActiveResponseCallback: false,
            hasRequestHandler: false,
            hasForkHandler: false,
            supportsInterruption: false,
            options: {
                'models': 'gpt-4'
            }
        };
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        const resource = URI.parse(`${sessionScheme}:/test-session`);
        await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
        // Clear the stub call history
        asSinonMethodStub(proxy.$provideHandleOptionsChange).resetHistory();
        // Simulate an option change
        chatSessionsService.setSessionOption(resource, 'models', 'gpt-4-turbo');
        // Verify the extension was notified
        assert.ok(asSinonMethodStub(proxy.$provideHandleOptionsChange).calledOnce);
        const call = asSinonMethodStub(proxy.$provideHandleOptionsChange).firstCall;
        assert.strictEqual(call.args[0], handle);
        assert.deepStrictEqual(call.args[1], resource);
        assert.deepStrictEqual(call.args[2], { models: 'gpt-4-turbo' });
        mainThread.$unregisterChatSessionContentProvider(handle);
    });
    test('option change notifications fail silently when provider not registered', async function () {
        const sessionScheme = 'unregistered-session-type';
        // Do NOT register a content provider for this scheme
        const resource = URI.parse(`${sessionScheme}:/test-session`);
        // Clear any previous calls
        asSinonMethodStub(proxy.$provideHandleOptionsChange).resetHistory();
        // Attempt to notify option change for an unregistered scheme
        // This should not throw, but also should not call the proxy
        chatSessionsService.updateSessionOptions(resource, new Map([
            ['models', 'gpt-4-turbo']
        ]));
        // Verify the extension was NOT notified (no provider registered)
        assert.strictEqual(asSinonMethodStub(proxy.$provideHandleOptionsChange).callCount, 0);
    });
    test('setSessionOption updates option and getSessionOption reflects change', async function () {
        const sessionScheme = 'test-session-type';
        mainThread.$registerChatSessionContentProvider(1, sessionScheme);
        const resource = URI.parse(`${sessionScheme}:/test-session`);
        const sessionContent = {
            resource,
            history: [],
            hasActiveResponseCallback: false,
            hasRequestHandler: false,
            hasForkHandler: false,
            supportsInterruption: false,
        };
        asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
        await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
        // Initially no options set
        assert.strictEqual(chatSessionsService.getSessionOption(resource, 'models'), undefined);
        // Set an option
        chatSessionsService.setSessionOption(resource, 'models', 'gpt-4');
        // Now getSessionOption should return the value
        assert.strictEqual(chatSessionsService.getSessionOption(resource, 'models'), 'gpt-4');
        mainThread.$unregisterChatSessionContentProvider(1);
    });
});
suite('ExtHostChatSessions', function () {
    let disposables;
    let extHostChatSessions;
    let mainThreadChatSessionsProxy;
    setup(function () {
        disposables = new DisposableStore();
        mainThreadChatSessionsProxy = {
            $registerChatSessionItemController: sinon.stub(),
            $unregisterChatSessionItemController: sinon.stub(),
            $updateChatSessionItems: sinon.stub().resolves(),
            $addOrUpdateChatSessionItem: sinon.stub().resolves(),
            $onDidCommitChatSessionItem: sinon.stub(),
            $registerChatSessionContentProvider: sinon.stub(),
            $unregisterChatSessionContentProvider: sinon.stub(),
            $onDidChangeChatSessionOptions: sinon.stub(),
            $onDidChangeChatSessionProviderOptions: sinon.stub(),
        };
        const rpcProtocol = AnyCallRPCProtocol(mainThreadChatSessionsProxy);
        const commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
        });
        const languageModels = new ExtHostLanguageModels(rpcProtocol, new NullLogService(), new class extends mock() {
        });
        extHostChatSessions = disposables.add(new ExtHostChatSessions(commands, languageModels, rpcProtocol, new NullLogService()));
    });
    teardown(function () {
        disposables.dispose();
        sinon.restore();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createContentProvider(session) {
        return {
            provideChatSessionContent: async () => session,
        };
    }
    test('advertises controller fork support when only the controller registers a fork handler', async function () {
        const sessionScheme = 'test-session-type';
        const sessionResource = URI.parse(`${sessionScheme}:/test-session`);
        const controller = disposables.add(extHostChatSessions.createChatSessionItemController(nullExtensionDescription, sessionScheme, async () => { }));
        controller.forkHandler = async (resource) => controller.createChatSessionItem(resource.with({ path: '/forked-session' }), 'Forked Session');
        disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, undefined, createContentProvider({
            history: [],
            requestHandler: undefined,
        })));
        const session = await extHostChatSessions.$provideChatSessionContent(0, sessionResource, { initialSessionOptions: [] }, CancellationToken.None);
        assert.strictEqual(session.hasForkHandler, true);
        await extHostChatSessions.$disposeChatSessionContent(0, sessionResource);
    });
    test('prefers controller fork handler over deprecated session fork handler', async function () {
        const sessionScheme = 'test-session-type';
        const sessionResource = URI.parse(`${sessionScheme}:/test-session`);
        const requestTurn = new extHostTypes.ChatRequestTurn('prompt', undefined, [], 'participant', [], undefined, 'request-1');
        const controller = disposables.add(extHostChatSessions.createChatSessionItemController(nullExtensionDescription, sessionScheme, async () => { }));
        const controllerItem = controller.createChatSessionItem(URI.parse(`${sessionScheme}:/forked-by-controller`), 'Forked by Controller');
        const sessionItem = {
            resource: URI.parse(`${sessionScheme}:/forked-by-session`),
            label: 'Forked by Session'
        };
        const controllerForkHandler = sinon.stub().resolves(controllerItem);
        const deprecatedSessionForkHandler = sinon.stub().resolves(sessionItem);
        controller.forkHandler = controllerForkHandler;
        disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, undefined, createContentProvider({
            history: [requestTurn],
            requestHandler: undefined,
            forkHandler: deprecatedSessionForkHandler,
        })));
        await extHostChatSessions.$provideChatSessionContent(0, sessionResource, { initialSessionOptions: [] }, CancellationToken.None);
        const result = await extHostChatSessions.$forkChatSession(0, sessionResource, {
            type: 'request',
            id: 'request-1',
            prompt: 'prompt',
            participant: 'participant',
        }, CancellationToken.None);
        assert.ok(controllerForkHandler.calledOnceWithExactly(sessionResource, requestTurn, CancellationToken.None));
        assert.strictEqual(deprecatedSessionForkHandler.callCount, 0);
        assert.strictEqual(result.resource.toString(), controllerItem.resource.toString());
        assert.strictEqual(result.label, controllerItem.label);
        await extHostChatSessions.$disposeChatSessionContent(0, sessionResource);
    });
    test('falls back to deprecated session fork handler when no controller fork handler exists', async function () {
        const sessionScheme = 'test-session-type';
        const sessionResource = URI.parse(`${sessionScheme}:/test-session`);
        const requestTurn = new extHostTypes.ChatRequestTurn('prompt', undefined, [], 'participant', [], undefined, 'request-1');
        const deprecatedSessionForkHandler = sinon.stub().resolves({
            resource: URI.parse(`${sessionScheme}:/forked-by-session`),
            label: 'Forked by Session'
        });
        disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, undefined, createContentProvider({
            history: [requestTurn],
            requestHandler: undefined,
            forkHandler: deprecatedSessionForkHandler,
        })));
        await extHostChatSessions.$provideChatSessionContent(0, sessionResource, { initialSessionOptions: [] }, CancellationToken.None);
        const result = await extHostChatSessions.$forkChatSession(0, sessionResource, {
            type: 'request',
            id: 'request-1',
            prompt: 'prompt',
            participant: 'participant',
        }, CancellationToken.None);
        assert.ok(deprecatedSessionForkHandler.calledOnceWithExactly(sessionResource, requestTurn, CancellationToken.None));
        assert.strictEqual(result.resource.toString(), `${sessionScheme}:/forked-by-session`);
        assert.strictEqual(result.label, 'Forked by Session');
        await extHostChatSessions.$disposeChatSessionContent(0, sessionResource);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENoYXRTZXNzaW9ucy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2Jyb3dzZXIvbWFpblRocmVhZENoYXRTZXNzaW9ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUUvQixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXZFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUN0SCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDdEgsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1B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