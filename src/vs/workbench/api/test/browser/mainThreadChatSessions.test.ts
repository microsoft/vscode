/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { ChatSessionsService } from '../../../contrib/chat/browser/chatSessions.contribution.js';
import { IChatAgentRequest } from '../../../contrib/chat/common/chatAgents.js';
import { IChatProgress } from '../../../contrib/chat/common/chatService.js';
import { IChatSessionItem, IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../contrib/chat/common/constants.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { mock, TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadChatSessions, ObservableChatSession } from '../../browser/mainThreadChatSessions.js';
import { ExtHostChatSessionsShape, IChatProgressDto } from '../../common/extHost.protocol.js';

suite('ObservableChatSession', function () {
	let disposables: DisposableStore;
	let logService: ILogService;
	let dialogService: IDialogService;
	let proxy: ExtHostChatSessionsShape;

	setup(function () {
		disposables = new DisposableStore();
		logService = new NullLogService();

		dialogService = new class extends mock<IDialogService>() {
			override async confirm() {
				return { confirmed: true };
			}
		};

		proxy = {
			$provideChatSessionContent: sinon.stub(),
			$interruptChatSessionActiveResponse: sinon.stub(),
			$invokeChatSessionRequestHandler: sinon.stub(),
			$disposeChatSessionContent: sinon.stub(),
			$provideChatSessionItems: sinon.stub(),
			$provideNewChatSessionItem: sinon.stub().resolves({ id: 'new-session-id', label: 'New Session' } as IChatSessionItem)
		};
	});

	teardown(function () {
		disposables.dispose();
		sinon.restore();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createSessionContent(options: {
		id?: string;
		history?: any[];
		hasActiveResponseCallback?: boolean;
		hasRequestHandler?: boolean;
	} = {}) {
		return {
			id: options.id || 'test-id',
			history: options.history || [],
			hasActiveResponseCallback: options.hasActiveResponseCallback || false,
			hasRequestHandler: options.hasRequestHandler || false
		};
	}

	async function createInitializedSession(sessionContent: any, sessionId = 'test-id'): Promise<ObservableChatSession> {
		const session = new ObservableChatSession(sessionId, 1, proxy, logService, dialogService);
		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);
		await session.initialize(CancellationToken.None);
		return session;
	}

	test('constructor creates session with proper initial state', function () {
		const session = disposables.add(new ObservableChatSession('test-id', 1, proxy, logService, dialogService));

		assert.strictEqual(session.sessionId, 'test-id');
		assert.strictEqual(session.providerHandle, 1);
		assert.deepStrictEqual(session.history, []);
		assert.ok(session.progressObs);
		assert.ok(session.isCompleteObs);

		// Initial state should be inactive and incomplete
		assert.deepStrictEqual(session.progressObs.get(), []);
		assert.strictEqual(session.isCompleteObs.get(), false);
	});

	test('session queues progress before initialization and processes it after', async function () {
		const session = disposables.add(new ObservableChatSession('test-id', 1, proxy, logService, dialogService));

		const progress1: IChatProgress = { kind: 'progressMessage', content: { value: 'Hello', isTrusted: false } };
		const progress2: IChatProgress = { kind: 'progressMessage', content: { value: 'World', isTrusted: false } };

		// Add progress before initialization - should be queued
		session.handleProgressChunk('req1', [progress1]);
		session.handleProgressChunk('req1', [progress2]);

		// Progress should be queued, not visible yet
		assert.deepStrictEqual(session.progressObs.get(), []);

		// Initialize the session
		const sessionContent = createSessionContent();
		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);
		await session.initialize(CancellationToken.None);

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
		assert.strictEqual((session.history[0] as any).prompt, 'Previous question');
		assert.strictEqual(session.history[1].type, 'response');

		// Verify capabilities were set up
		assert.ok(session.interruptActiveResponseCallback);
		assert.ok(session.requestHandler);
	});

	test('initialization is idempotent and returns same promise', async function () {
		const session = disposables.add(new ObservableChatSession('test-id', 1, proxy, logService, dialogService));
		const sessionContent = createSessionContent();
		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);

		const promise1 = session.initialize(CancellationToken.None);
		const promise2 = session.initialize(CancellationToken.None);

		assert.strictEqual(promise1, promise2);
		await promise1;

		// Should only call proxy once even though initialize was called twice
		assert.ok((proxy.$provideChatSessionContent as sinon.SinonStub).calledOnce);
	});

	test('progress handling works correctly after initialization', async function () {
		const sessionContent = createSessionContent();
		const session = disposables.add(await createInitializedSession(sessionContent));

		const progress: IChatProgress = { kind: 'progressMessage', content: { value: 'New progress', isTrusted: false } };

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
		const progress: IChatProgress = { kind: 'progressMessage', content: { value: 'Processing...', isTrusted: false } };
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

		const progress: IChatProgress = { kind: 'progressMessage', content: { value: 'Processing...', isTrusted: false } };
		session.handleProgressChunk('req1', [progress]);

		assert.strictEqual(session.isCompleteObs.get(), false);
		session.handleProgressComplete('req1');

		assert.strictEqual(session.isCompleteObs.get(), true);
	});

	test('request handler forwards requests to proxy', async function () {
		const sessionContent = createSessionContent({ hasRequestHandler: true });
		const session = disposables.add(await createInitializedSession(sessionContent));

		assert.ok(session.requestHandler);

		const request = { requestId: 'req1', prompt: 'Test prompt' } as any;
		const progressCallback = sinon.stub();

		await session.requestHandler!(request, progressCallback, [], CancellationToken.None);

		assert.ok((proxy.$invokeChatSessionRequestHandler as sinon.SinonStub).calledOnceWith(1, 'test-id', request, [], CancellationToken.None));
	});

	test('request handler forwards progress updates to external callback', async function () {
		const sessionContent = createSessionContent({ hasRequestHandler: true });
		const session = disposables.add(await createInitializedSession(sessionContent));

		assert.ok(session.requestHandler);

		const request = { requestId: 'req1', prompt: 'Test prompt' } as any;
		const progressCallback = sinon.stub();

		let resolveRequest: () => void;
		const requestPromise = new Promise<void>(resolve => {
			resolveRequest = resolve;
		});

		(proxy.$invokeChatSessionRequestHandler as sinon.SinonStub).returns(requestPromise);

		const requestHandlerPromise = session.requestHandler!(request, progressCallback, [], CancellationToken.None);

		const progress1: IChatProgress = { kind: 'progressMessage', content: { value: 'Progress 1', isTrusted: false } };
		const progress2: IChatProgress = { kind: 'progressMessage', content: { value: 'Progress 2', isTrusted: false } };

		session.handleProgressChunk('req1', [progress1]);
		session.handleProgressChunk('req1', [progress2]);

		// Wait a bit for autorun to trigger
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.ok(progressCallback.calledTwice);
		assert.deepStrictEqual(progressCallback.firstCall.args[0], [progress1]);
		assert.deepStrictEqual(progressCallback.secondCall.args[0], [progress2]);

		// Complete the request
		resolveRequest!();
		await requestHandlerPromise;

		assert.strictEqual(session.isCompleteObs.get(), true);
	});

	test('dispose properly cleans up resources and notifies listeners', function () {
		const session = new ObservableChatSession('test-id', 1, proxy, logService, dialogService);

		let disposeEventFired = false;
		const disposable = session.onWillDispose(() => {
			disposeEventFired = true;
		});

		session.dispose();

		assert.ok(disposeEventFired);
		assert.ok((proxy.$disposeChatSessionContent as sinon.SinonStub).calledOnceWith(1, 'test-id'));

		disposable.dispose();
	});

	test('session key generation is consistent', function () {
		const session = new ObservableChatSession('test-id', 42, proxy, logService, dialogService);

		assert.strictEqual(session.sessionKey, '42_test-id');
		assert.strictEqual(ObservableChatSession.generateSessionKey(42, 'test-id'), '42_test-id');

		session.dispose();
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
		assert.strictEqual((session.history[0] as any).prompt, 'First question');
		assert.strictEqual(session.history[1].type, 'response');
		assert.strictEqual((session.history[1].parts[0] as any).content.value, 'First answer');
		assert.strictEqual(session.history[2].type, 'request');
		assert.strictEqual((session.history[2] as any).prompt, 'Second question');
		assert.strictEqual(session.history[3].type, 'response');
		assert.strictEqual((session.history[3].parts[0] as any).content.value, 'Second answer');

		// Session should be complete since it has no capabilities
		assert.strictEqual(session.isCompleteObs.get(), true);
	});
});

suite('MainThreadChatSessions', function () {
	let instantiationService: TestInstantiationService;
	let mainThread: MainThreadChatSessions;
	let proxy: ExtHostChatSessionsShape;
	let chatSessionsService: IChatSessionsService;
	let disposables: DisposableStore;

	setup(function () {
		disposables = new DisposableStore();
		instantiationService = new TestInstantiationService();

		proxy = {
			$provideChatSessionContent: sinon.stub(),
			$interruptChatSessionActiveResponse: sinon.stub(),
			$invokeChatSessionRequestHandler: sinon.stub(),
			$disposeChatSessionContent: sinon.stub(),
			$provideChatSessionItems: sinon.stub(),
			$provideNewChatSessionItem: sinon.stub().resolves({ id: 'new-session-id', label: 'New Session' } as IChatSessionItem)
		};

		const extHostContext = new class implements IExtHostContext {
			remoteAuthority = '';
			extensionHostKind = ExtensionHostKind.LocalProcess;
			dispose() { }
			assertRegistered() { }
			set(v: any): any { return null; }
			getProxy(): any { return proxy; }
			drain(): any { return null; }
		};

		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() { });
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() {
			override async openView() { return null; }
		});
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm() {
				return { confirmed: true };
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

	test('provideNewChatSessionItem creates a new chat session', async function () {
		mainThread.$registerChatSessionItemProvider(1, 'test-type');

		// Create a mock IChatAgentRequest
		const mockRequest: IChatAgentRequest = {
			sessionId: 'test-session',
			requestId: 'test-request',
			agentId: 'test-agent',
			message: 'my prompt',
			location: ChatAgentLocation.Chat,
			variables: { variables: [] }
		};

		// Valid
		const chatSessionItem = await chatSessionsService.provideNewChatSessionItem('test-type', {
			request: mockRequest,
			prompt: 'my prompt',
			metadata: {}
		}, CancellationToken.None);
		assert.strictEqual(chatSessionItem.id, 'new-session-id');
		assert.strictEqual(chatSessionItem.label, 'New Session');

		// Invalid session type should throw
		await assert.rejects(
			chatSessionsService.provideNewChatSessionItem('invalid-type', {
				request: mockRequest,
				prompt: 'my prompt',
				metadata: {}
			}, CancellationToken.None)
		);

		mainThread.$unregisterChatSessionItemProvider(1);
	});

	test('provideChatSessionContent creates and initializes session', async function () {
		mainThread.$registerChatSessionContentProvider(1, 'test-type');

		const sessionContent = {
			id: 'test-session',
			history: [],
			hasActiveResponseCallback: false,
			hasRequestHandler: false
		};

		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);
		const session1 = await chatSessionsService.provideChatSessionContent('test-type', 'test-session', CancellationToken.None);

		assert.ok(session1);
		assert.strictEqual(session1.sessionId, 'test-session');

		const session2 = await chatSessionsService.provideChatSessionContent('test-type', 'test-session', CancellationToken.None);
		assert.strictEqual(session1, session2);

		assert.ok((proxy.$provideChatSessionContent as sinon.SinonStub).calledOnce);
		mainThread.$unregisterChatSessionContentProvider(1);
	});

	test('$handleProgressChunk routes to correct session', async function () {
		mainThread.$registerChatSessionContentProvider(1, 'test-type');

		const sessionContent = {
			id: 'test-session',
			history: [],
			hasActiveResponseCallback: false,
			hasRequestHandler: false
		};

		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);

		const session = await chatSessionsService.provideChatSessionContent('test-type', 'test-session', CancellationToken.None) as ObservableChatSession;

		const progressDto: IChatProgressDto = { kind: 'progressMessage', content: { value: 'Test', isTrusted: false } };
		await mainThread.$handleProgressChunk(1, 'test-session', 'req1', [progressDto]);

		assert.strictEqual(session.progressObs.get().length, 1);
		assert.strictEqual(session.progressObs.get()[0].kind, 'progressMessage');

		mainThread.$unregisterChatSessionContentProvider(1);
	});

	test('$handleProgressComplete marks session complete', async function () {
		mainThread.$registerChatSessionContentProvider(1, 'test-type');

		const sessionContent = {
			id: 'test-session',
			history: [],
			hasActiveResponseCallback: false,
			hasRequestHandler: false
		};

		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);

		const session = await chatSessionsService.provideChatSessionContent('test-type', 'test-session', CancellationToken.None) as ObservableChatSession;

		const progressDto: IChatProgressDto = { kind: 'progressMessage', content: { value: 'Test', isTrusted: false } };
		await mainThread.$handleProgressChunk(1, 'test-session', 'req1', [progressDto]);
		mainThread.$handleProgressComplete(1, 'test-session', 'req1');

		assert.strictEqual(session.isCompleteObs.get(), true);

		mainThread.$unregisterChatSessionContentProvider(1);
	});

	test('integration with multiple request/response pairs', async function () {
		mainThread.$registerChatSessionContentProvider(1, 'test-type');

		const sessionContent = {
			id: 'multi-turn-session',
			history: [
				{ type: 'request', prompt: 'First question' },
				{ type: 'response', parts: [{ kind: 'progressMessage', content: { value: 'First answer', isTrusted: false } }] },
				{ type: 'request', prompt: 'Second question' },
				{ type: 'response', parts: [{ kind: 'progressMessage', content: { value: 'Second answer', isTrusted: false } }] }
			],
			hasActiveResponseCallback: false,
			hasRequestHandler: false
		};

		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);

		const session = await chatSessionsService.provideChatSessionContent('test-type', 'multi-turn-session', CancellationToken.None) as ObservableChatSession;

		// Verify the session loaded correctly
		assert.ok(session);
		assert.strictEqual(session.sessionId, 'multi-turn-session');
		assert.strictEqual(session.history.length, 4);

		// Verify all history items are correctly loaded
		assert.strictEqual(session.history[0].type, 'request');
		assert.strictEqual((session.history[0] as any).prompt, 'First question');
		assert.strictEqual(session.history[1].type, 'response');
		assert.strictEqual(session.history[2].type, 'request');
		assert.strictEqual((session.history[2] as any).prompt, 'Second question');
		assert.strictEqual(session.history[3].type, 'response');

		// Session should be complete since it has no active capabilities
		assert.strictEqual(session.isCompleteObs.get(), true);

		mainThread.$unregisterChatSessionContentProvider(1);
	});
});
