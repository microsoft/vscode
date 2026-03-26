/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import type * as vscode from 'vscode';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
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
import { IAgentSessionsModel } from '../../../contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ChatSessionsService } from '../../../contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import { IChatProgress, IChatProgressMessage, IChatService } from '../../../contrib/chat/common/chatService/chatService.js';
import { IChatSessionProviderOptionGroup, IChatSessionRequestHistoryItem, IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../contrib/chat/common/constants.js';
import { LocalChatSessionUri } from '../../../contrib/chat/common/model/chatUri.js';
import { IChatAgentRequest, IChatAgentResult } from '../../../contrib/chat/common/participants/chatAgents.js';
import { MockChatService } from '../../../contrib/chat/test/common/chatService/mockChatService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { IExtensionService, nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { mock, TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadChatSessions, ObservableChatSession } from '../../browser/mainThreadChatSessions.js';
import { ExtHostChatSessionsShape, IChatProgressDto, IChatSessionDto, IChatSessionProviderOptions, IChatSessionRequestHistoryItemDto } from '../../common/extHost.protocol.js';
import { IExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { ExtHostChatSessions } from '../../common/extHostChatSessions.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import * as extHostTypes from '../../common/extHostTypes.js';
import { AnyCallRPCProtocol } from '../common/testRPCProtocol.js';

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
			$invokeOptionGroupSearch: sinon.stub().resolves([]),
			$interruptChatSessionActiveResponse: sinon.stub(),
			$invokeChatSessionRequestHandler: sinon.stub(),
			$disposeChatSessionContent: sinon.stub(),
			$refreshChatSessionItems: sinon.stub(),
			$onDidChangeChatSessionItemState: sinon.stub(),
			$newChatSessionItem: sinon.stub().resolves(undefined),
			$forkChatSession: sinon.stub().resolves(undefined),
			$provideChatSessionCustomizations: sinon.stub().resolves(undefined),
		};
	});

	teardown(function () {
		disposables.dispose();
		sinon.restore();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createSessionContent(options: {
		id?: string;
		title?: string;
		history?: any[];
		hasActiveResponseCallback?: boolean;
		hasRequestHandler?: boolean;
		hasForkHandler?: boolean;
	} = {}): IChatSessionDto {
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

	async function createInitializedSession(sessionContent: any, sessionId = 'test-id'): Promise<ObservableChatSession> {
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

		const progress1: IChatProgress = { kind: 'progressMessage', content: { value: 'Hello', isTrusted: false } };
		const progress2: IChatProgress = { kind: 'progressMessage', content: { value: 'World', isTrusted: false } };

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
						uri: { $mid: MarshalledId.Uri, scheme: 'file', path: '/custom-agent' },
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
		const request: IChatSessionRequestHistoryItem = {
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
		const sentDto = call.args[2] as IChatSessionRequestHistoryItemDto;
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

		const request: IChatSessionRequestHistoryItem = { type: 'request', id: 'request-1', prompt: 'Previous question', participant: 'participant' };
		const expectedRequestDto: IChatSessionRequestHistoryItemDto = {
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

		assert.ok(asSinonMethodStub(proxy.$provideChatSessionContent).calledOnceWith(
			1,
			resource,
			{ initialSessionOptions },
			CancellationToken.None
		));
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

		assert.ok(asSinonMethodStub(proxy.$invokeChatSessionRequestHandler).calledOnceWith(1, session.sessionResource, request, [], CancellationToken.None));
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

		let resolveRequest: (value: IChatAgentResult) => void;
		const requestPromise = new Promise<IChatAgentResult>(resolve => {
			resolveRequest = resolve;
		});

		asSinonMethodStub(proxy.$invokeChatSessionRequestHandler).returns(requestPromise);

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
		resolveRequest!({});
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

	setup(function () {
		disposables = new DisposableStore();
		instantiationService = new TestInstantiationService();

		proxy = {
			$provideChatSessionContent: sinon.stub(),
			$provideChatSessionProviderOptions: sinon.stub<[providerHandle: number, token: CancellationToken], Promise<IChatSessionProviderOptions | undefined>>().resolves(undefined),
			$provideHandleOptionsChange: sinon.stub(),
			$invokeOptionGroupSearch: sinon.stub().resolves([]),
			$interruptChatSessionActiveResponse: sinon.stub(),
			$invokeChatSessionRequestHandler: sinon.stub(),
			$disposeChatSessionContent: sinon.stub(),
			$refreshChatSessionItems: sinon.stub(),
			$onDidChangeChatSessionItemState: sinon.stub(),
			$newChatSessionItem: sinon.stub().resolves(undefined),
			$forkChatSession: sinon.stub().resolves(undefined),
			$provideChatSessionCustomizations: sinon.stub().resolves(undefined),
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
		instantiationService.stub(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
			override get model(): IAgentSessionsModel {
				return new class extends mock<IAgentSessionsModel>() {
					override onDidChangeSessionArchivedState = Event.None;
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
		const sessionContent: IChatSessionDto = {
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
		const sessionContent: IChatSessionDto = {
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
		const sessionContent: IChatSessionDto = {
			resource,
			history: [],
			hasActiveResponseCallback: false,
			hasRequestHandler: false,
			hasForkHandler: false,
			supportsInterruption: false,
		};

		asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);

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

		const resource = URI.parse(`${sessionScheme}:/test-session`);
		const sessionContent: IChatSessionDto = {
			resource,
			history: [],
			hasActiveResponseCallback: false,
			hasRequestHandler: false,
			hasForkHandler: false,
			supportsInterruption: false,
		};

		asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);

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

		const resource = URI.parse(`${sessionScheme}:/multi-turn-session`);
		const sessionContent: IChatSessionDto = {
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

		const provideOptionsStub = asSinonMethodStub(proxy.$provideChatSessionProviderOptions);
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

	test('getSessionOption returns undefined for unset options', async function () {
		const sessionScheme = 'test-session-type';
		mainThread.$registerChatSessionContentProvider(1, sessionScheme);

		const resource = URI.parse(`${sessionScheme}:/test-session`);
		const sessionContent: IChatSessionDto = {
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
		const sessionContent: IChatSessionDto = {
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

		const sessionContent: IChatSessionDto = {
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
		const sessionContent: IChatSessionDto = {
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

	test('hasAnySessionOptions returns correct values', async function () {
		const sessionScheme = 'test-session-type';
		mainThread.$registerChatSessionContentProvider(1, sessionScheme);

		const resourceWithOptions = URI.parse(`${sessionScheme}:/session-with-options`);
		const resourceWithoutOptions = URI.parse(`${sessionScheme}:/session-without-options`);

		// Session with options
		const sessionContentWithOptions: IChatSessionDto = {
			resource: resourceWithOptions,
			history: [],
			hasActiveResponseCallback: false,
			hasRequestHandler: false,
			hasForkHandler: false,
			supportsInterruption: false,
			options: { 'models': 'gpt-4' }
		};

		// Session without options
		const sessionContentWithoutOptions: IChatSessionDto = {
			resource: resourceWithoutOptions,
			history: [],
			hasActiveResponseCallback: false,
			hasRequestHandler: false,
			hasForkHandler: false,
			supportsInterruption: false,
		};

		asSinonMethodStub(proxy.$provideChatSessionContent)
			.onFirstCall().resolves(sessionContentWithOptions)
			.onSecondCall().resolves(sessionContentWithoutOptions);

		await chatSessionsService.getOrCreateChatSession(resourceWithOptions, CancellationToken.None);
		await chatSessionsService.getOrCreateChatSession(resourceWithoutOptions, CancellationToken.None);

		assert.strictEqual(chatSessionsService.hasAnySessionOptions(resourceWithOptions), true);
		assert.strictEqual(chatSessionsService.hasAnySessionOptions(resourceWithoutOptions), false);

		mainThread.$unregisterChatSessionContentProvider(1);
	});
});

suite('ExtHostChatSessions', function () {
	let disposables: DisposableStore;
	let extHostChatSessions: ExtHostChatSessions;
	let mainThreadChatSessionsProxy: {
		$registerChatSessionItemController: sinon.SinonStub;
		$unregisterChatSessionItemController: sinon.SinonStub;
		$updateChatSessionItems: sinon.SinonStub;
		$addOrUpdateChatSessionItem: sinon.SinonStub;
		$onDidCommitChatSessionItem: sinon.SinonStub;
		$registerChatSessionContentProvider: sinon.SinonStub;
		$unregisterChatSessionContentProvider: sinon.SinonStub;
		$onDidChangeChatSessionOptions: sinon.SinonStub;
		$onDidChangeChatSessionProviderOptions: sinon.SinonStub;
	};

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
		const commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock<IExtHostTelemetry>() { });
		const languageModels = new ExtHostLanguageModels(rpcProtocol, new NullLogService(), new class extends mock<IExtHostAuthentication>() { });

		extHostChatSessions = disposables.add(new ExtHostChatSessions(commands, languageModels, rpcProtocol, new NullLogService()));
	});

	teardown(function () {
		disposables.dispose();
		sinon.restore();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createContentProvider(session: vscode.ChatSession): vscode.ChatSessionContentProvider {
		return {
			provideChatSessionContent: async () => session,
		};
	}

	test('advertises controller fork support when only the controller registers a fork handler', async function () {
		const sessionScheme = 'test-session-type';
		const sessionResource = URI.parse(`${sessionScheme}:/test-session`);
		const controller = disposables.add(extHostChatSessions.createChatSessionItemController(nullExtensionDescription, sessionScheme, async () => { }));
		controller.forkHandler = async resource => controller.createChatSessionItem(resource.with({ path: '/forked-session' }), 'Forked Session');

		disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, undefined!, createContentProvider({
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

		disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, undefined!, createContentProvider({
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

		disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, undefined!, createContentProvider({
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
