/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { ChatSessionsService } from '../../../contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import { IChatAgentRequest } from '../../../contrib/chat/common/participants/chatAgents.js';
import { IChatProgress, IChatProgressMessage, IChatService } from '../../../contrib/chat/common/chatService/chatService.js';
import { IChatSessionItem, IChatSessionProviderOptionGroup, IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { LocalChatSessionUri } from '../../../contrib/chat/common/model/chatUri.js';
import { ChatAgentLocation } from '../../../contrib/chat/common/constants.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { mock, TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadChatSessions, ObservableChatSession } from '../../browser/mainThreadChatSessions.js';
import { ExtHostChatSessionsShape, IChatProgressDto, IChatSessionProviderOptions } from '../../common/extHost.protocol.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { MockChatService } from '../../../contrib/chat/test/common/chatService/mockChatService.js';

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
			$provideChatSessionProviderOptions: sinon.stub<[providerHandle: number, token: CancellationToken], Promise<IChatSessionProviderOptions | undefined>>().resolves(undefined),
			$provideHandleOptionsChange: sinon.stub(),
			$interruptChatSessionActiveResponse: sinon.stub(),
			$invokeChatSessionRequestHandler: sinon.stub(),
			$disposeChatSessionContent: sinon.stub(),
			$provideChatSessionItems: sinon.stub(),
			$provideNewChatSessionItem: sinon.stub().resolves({ label: 'New Session' } as IChatSessionItem)
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
		const resource = LocalChatSessionUri.forSession(sessionId);
		const session = new ObservableChatSession(resource, 1, proxy, logService, dialogService);
		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);
		await session.initialize(CancellationToken.None);
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
		assert.strictEqual(session.history[0].prompt, 'Previous question');
		assert.strictEqual(session.history[1].type, 'response');

		// Verify capabilities were set up
		assert.ok(session.interruptActiveResponseCallback);
		assert.ok(session.requestHandler);
	});

	test('initialization is idempotent and returns same promise', async function () {
		const sessionId = 'test-id';
		const resource = LocalChatSessionUri.forSession(sessionId);
		const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));

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

		const request: IChatAgentRequest = {
			requestId: 'req1',
			sessionResource: LocalChatSessionUri.forSession('test-session'),
			agentId: 'test-agent',
			message: 'Test prompt',
			location: ChatAgentLocation.Chat,
			variables: { variables: [] }
		};
		const progressCallback = sinon.stub();

		await session.requestHandler!(request, progressCallback, [], CancellationToken.None);

		assert.ok((proxy.$invokeChatSessionRequestHandler as sinon.SinonStubbedMember<typeof proxy.$invokeChatSessionRequestHandler>).calledOnceWith(1, session.sessionResource, request, [], CancellationToken.None));
	});

	test('request handler forwards progress updates to external callback', async function () {
		const sessionContent = createSessionContent({ hasRequestHandler: true });
		const session = disposables.add(await createInitializedSession(sessionContent));

		assert.ok(session.requestHandler);

		const request: IChatAgentRequest = {
			requestId: 'req1',
			sessionResource: LocalChatSessionUri.forSession('test-session'),
			agentId: 'test-agent',
			message: 'Test prompt',
			location: ChatAgentLocation.Chat,
			variables: { variables: [] }
		};
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
		const sessionId = 'test-id';
		const resource = LocalChatSessionUri.forSession(sessionId);
		const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));

		let disposeEventFired = false;
		const disposable = session.onWillDispose(() => {
			disposeEventFired = true;
		});

		session.dispose();

		assert.ok(disposeEventFired);
		assert.ok((proxy.$disposeChatSessionContent as sinon.SinonStubbedMember<typeof proxy.$disposeChatSessionContent>).calledOnceWith(1, resource));

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
		assert.strictEqual((session.history[1].parts[0] as IChatProgressMessage).content.value, 'First answer');
		assert.strictEqual(session.history[2].type, 'request');
		assert.strictEqual(session.history[2].prompt, 'Second question');
		assert.strictEqual(session.history[3].type, 'response');
		assert.strictEqual((session.history[3].parts[0] as IChatProgressMessage).content.value, 'Second answer');

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

	const exampleSessionResource = LocalChatSessionUri.forSession('new-session-id');

	setup(function () {
		disposables = new DisposableStore();
		instantiationService = new TestInstantiationService();

		proxy = {
			$provideChatSessionContent: sinon.stub(),
			$provideChatSessionProviderOptions: sinon.stub<[providerHandle: number, token: CancellationToken], Promise<IChatSessionProviderOptions | undefined>>().resolves(undefined),
			$provideHandleOptionsChange: sinon.stub(),
			$interruptChatSessionActiveResponse: sinon.stub(),
			$invokeChatSessionRequestHandler: sinon.stub(),
			$disposeChatSessionContent: sinon.stub(),
			$provideChatSessionItems: sinon.stub(),
			$provideNewChatSessionItem: sinon.stub().resolves({ resource: exampleSessionResource, label: 'New Session' } as IChatSessionItem)
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
		instantiationService.stub(ILabelService, new class extends mock<ILabelService>() {
			override registerFormatter() {
				return {
					dispose: () => { }
				};
			}
		});
		instantiationService.stub(IChatService, new MockChatService());

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

		const sessionContent = {
			id: 'test-session',
			history: [],
			hasActiveResponseCallback: false,
			hasRequestHandler: false
		};

		const resource = URI.parse(`${sessionScheme}:/test-session`);

		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);
		const session1 = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);

		assert.ok(session1);

		const session2 = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
		assert.strictEqual(session1, session2);

		assert.ok((proxy.$provideChatSessionContent as sinon.SinonStub).calledOnce);
		mainThread.$unregisterChatSessionContentProvider(1);
	});

	test('$handleProgressChunk routes to correct session', async function () {
		const sessionScheme = 'test-session-type';

		mainThread.$registerChatSessionContentProvider(1, sessionScheme);

		const sessionContent = {
			id: 'test-session',
			history: [],
			hasActiveResponseCallback: false,
			hasRequestHandler: false
		};

		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);

		const resource = URI.parse(`${sessionScheme}:/test-session`);
		const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None) as ObservableChatSession;

		const progressDto: IChatProgressDto = { kind: 'progressMessage', content: { value: 'Test', isTrusted: false } };
		await mainThread.$handleProgressChunk(1, resource, 'req1', [progressDto]);

		assert.strictEqual(session.progressObs.get().length, 1);
		assert.strictEqual(session.progressObs.get()[0].kind, 'progressMessage');

		mainThread.$unregisterChatSessionContentProvider(1);
	});

	test('$handleProgressComplete marks session complete', async function () {
		const sessionScheme = 'test-session-type';
		mainThread.$registerChatSessionContentProvider(1, sessionScheme);

		const sessionContent = {
			id: 'test-session',
			history: [],
			hasActiveResponseCallback: false,
			hasRequestHandler: false
		};

		(proxy.$provideChatSessionContent as sinon.SinonStub).resolves(sessionContent);

		const resource = URI.parse(`${sessionScheme}:/test-session`);
		const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None) as ObservableChatSession;

		const progressDto: IChatProgressDto = { kind: 'progressMessage', content: { value: 'Test', isTrusted: false } };
		await mainThread.$handleProgressChunk(1, resource, 'req1', [progressDto]);
		mainThread.$handleProgressComplete(1, resource, 'req1');

		assert.strictEqual(session.isCompleteObs.get(), true);

		mainThread.$unregisterChatSessionContentProvider(1);
	});

	test('integration with multiple request/response pairs', async function () {
		const sessionScheme = 'test-session-type';
		mainThread.$registerChatSessionContentProvider(1, sessionScheme);

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

		const resource = URI.parse(`${sessionScheme}:/multi-turn-session`);
		const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None) as ObservableChatSession;

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

		const optionGroups1: IChatSessionProviderOptionGroup[] = [{
			id: 'models',
			name: 'Models',
			items: [{ id: 'modelA', name: 'Model A' }]
		}];
		const optionGroups2: IChatSessionProviderOptionGroup[] = [{
			id: 'models',
			name: 'Models',
			items: [{ id: 'modelB', name: 'Model B' }]
		}];

		const provideOptionsStub = proxy.$provideChatSessionProviderOptions as sinon.SinonStub;
		provideOptionsStub.onFirstCall().resolves({ optionGroups: optionGroups1 } as IChatSessionProviderOptions);
		provideOptionsStub.onSecondCall().resolves({ optionGroups: optionGroups2 } as IChatSessionProviderOptions);

		mainThread.$registerChatSessionContentProvider(handle, sessionScheme);

		// Wait for initial options fetch triggered on registration
		await new Promise(resolve => setTimeout(resolve, 0));

		let storedGroups = chatSessionsService.getOptionGroupsForSessionType(sessionScheme);
		assert.ok(storedGroups);
		assert.strictEqual(storedGroups![0].items[0].id, 'modelA');

		// Simulate extension signaling that provider options have changed
		mainThread.$onDidChangeChatSessionProviderOptions(handle);
		await new Promise(resolve => setTimeout(resolve, 0));

		storedGroups = chatSessionsService.getOptionGroupsForSessionType(sessionScheme);
		assert.ok(storedGroups);
		assert.strictEqual(storedGroups![0].items[0].id, 'modelB');

		mainThread.$unregisterChatSessionContentProvider(handle);
	});
});
