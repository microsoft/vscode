/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProgress, IProgressService, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, ResourceTrustRequestOptions } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatViewPaneTarget, IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatModelReference, IChatRequestSubmittedEvent, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatEditorOptions } from '../../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditor.js';
import { IChatWidgetHistoryService } from '../../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js';
import { PreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { nullExtensionDescription } from '../../../../../workbench/services/extensions/common/extensions.js';
import { SessionTypeAuthRequirement, ChatInteractivity, ChatOriginKind, IChat, ISession, ISessionType, ISessionWorkspace, ISideChatSelection, SessionStatus } from '../../common/session.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionChangeEvent, ISendRequestOptions, ISessionModelsSnapshot, ISessionModelPickerOptions, ISessionsProvider, ISessionsProviderCreateSessionOptions, ISessionWorktreeConfiguration } from '../../common/sessionsProvider.js';
import { SessionsManagementService } from '../../browser/sessionsManagementService.js';
import { ISessionsManagementService, ICreateNewSessionOptions, inheritableSessionTarget, ISendRequestSentEvent, WorkspaceNotTrustedError } from '../../common/sessionsManagement.js';
import { SessionsService } from '../../browser/sessionsService.js';
import { ISessionOpenTelemetryService, SessionOpenTelemetryService } from '../../browser/sessionOpenTelemetryService.js';
import { ISessionsPartService } from '../../browser/sessionsPartService.js';
import { CustomViewService, ICustomViewService } from '../../../customView/browser/customViewService.js';
import { ISessionsProvidersService } from '../../browser/sessionsProvidersService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { SessionsHasClosedItemContext } from '../../../../common/contextkeys.js';
import { COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME } from '../../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js';

const stubChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changes: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	modelSource: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	interactivity: constObservable(ChatInteractivity.Full),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
} satisfies IChat;

function stubSession(overrides: Partial<ISession> & Pick<ISession, 'sessionId' | 'providerId'>): ISession {
	return {
		resource: URI.parse(`test:///${overrides.sessionId}`),
		sessionType: 'test',
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable('Test'),
		updatedAt: constObservable(new Date()),
		status: constObservable(0),
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable([]),
		mainChat: constObservable(stubChat),
		capabilities: constObservable({ supportsMultipleChats: false }),
		...overrides,
	};
}

class TestChatWidgetService extends mock<IChatWidgetService>() {
	readonly opened: URI[] = [];
	private _widgetSessionResources = new Set<string>();

	override async openSession(sessionResource: URI, _target?: typeof ChatViewPaneTarget | PreferredGroup, _options?: IChatEditorOptions): Promise<IChatWidget | undefined> {
		this.opened.push(sessionResource);
		return undefined;
	}

	/** Simulate a session being displayed in a chat widget. */
	setWidgetSessionResource(resource: URI): void {
		this._widgetSessionResources.add(resource.toString());
	}

	clearWidgetSessionResources(): void {
		this._widgetSessionResources.clear();
	}

	override getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined {
		if (this._widgetSessionResources.has(sessionResource.toString())) {
			return {} as IChatWidget; // truthy stub
		}
		return undefined;
	}
}

class TestChatService extends mock<IChatService>() {
	private readonly _onDidSubmitRequest = new Emitter<IChatRequestSubmittedEvent>();
	override readonly onDidSubmitRequest = this._onDidSubmitRequest.event;
	readonly cancelledResources: URI[] = [];
	readonly loadedResources: URI[] = [];
	disposedModelRefs = 0;
	cancelError: Error | undefined;
	modelRefAvailable = true;

	override async acquireOrLoadSession(sessionResource: URI): Promise<IChatModelReference | undefined> {
		this.loadedResources.push(sessionResource);
		if (!this.modelRefAvailable) {
			return undefined;
		}
		return { object: {} as IChatModel, dispose: () => { this.disposedModelRefs++; } } as IChatModelReference;
	}

	submitRequest(event: IChatRequestSubmittedEvent): void {
		this._onDidSubmitRequest.fire(event);
	}

	dispose(): void {
		this._onDidSubmitRequest.dispose();
	}

	override async cancelCurrentRequestForSession(sessionResource: URI): Promise<void> {
		this.cancelledResources.push(sessionResource);
		if (this.cancelError) {
			throw this.cancelError;
		}
	}
}

class TestProgressService extends mock<IProgressService>() {
	override async withProgress<R>(_options: Parameters<IProgressService['withProgress']>[0], task: (progress: IProgress<IProgressStep>) => Promise<R>): Promise<R> {
		return task({ report() { } });
	}
}

class TestWorkspaceTrustManagementService extends mock<IWorkspaceTrustManagementService>() {
	trusted = true;
	readonly requestedUris: URI[] = [];

	override async getUriTrustInfo(uri: URI) {
		this.requestedUris.push(uri);
		return { uri, trusted: this.trusted };
	}
}

class TestSessionsProvidersService extends mock<ISessionsProvidersService>() {
	override readonly onDidChangeProviders = Event.None;

	constructor(private readonly _providers: readonly ISessionsProvider[]) {
		super();
	}

	override registerProvider(): never {
		throw new Error('not implemented');
	}

	override getProviders(): ISessionsProvider[] {
		return [...this._providers].sort((a, b) => a.order - b.order);
	}

	override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this._providers.find(provider => provider.id === providerId) as T | undefined;
	}
}

class TestSessionsProvider extends mock<ISessionsProvider>() {
	override readonly id: string = 'test';
	override readonly label = 'Test';
	override readonly icon = Codicon.vm;
	override readonly order: number = 0;
	override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'test', label: 'Test', icon: Codicon.vm, supportsWorktreeConfiguration: true }];
	override readonly onDidChangeSessionTypes = Event.None;
	override readonly onDidChangeSessions = Event.None;
	override readonly browseActions = [];

	constructor(private readonly _session: ISession) {
		super();
	}

	override getSessions(): ISession[] { return [this._session]; }
	override resolveWorkspace(_folderUri: URI): ISessionWorkspace | undefined { return undefined; }
	override createNewSession(_folderUri?: URI, _sessionTypeId?: string): ISession { return this._session; }
	override getSessionTypes(_folderUri: URI): ISessionType[] { return [...this.sessionTypes]; }
	override async renameChat(): Promise<void> { }
	override getModelsSnapshot(): ISessionModelsSnapshot { return { models: [], desiredModelResolution: { kind: 'notRequested' }, modelTarget: undefined }; }
	override getModelPickerOptions(): ISessionModelPickerOptions { return { useGroupedModelPicker: true, showFeatured: true, showUnavailableFeatured: false, showManageModelsAction: false }; }
	override readonly onDidChangeModels = Event.None;
	override setModel(_sessionId: string, _chatResource: URI, _modelId: string): void { }
	override async archiveSession(): Promise<void> { }
	override async unarchiveSession(): Promise<void> { }
	override async deleteSession(): Promise<void> { }
	override async deleteSessions(_sessionIds: readonly string[]): Promise<void> { }
	override async deleteChat(): Promise<boolean> { return true; }
	override deleteNewSession(_sessionId: string): void { }
	override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> { return this._session; }
	override async createNewChat(): Promise<IChat> { return this._session.mainChat.get(); }
	override async forkChat(_sessionId: string, _sourceChat: URI, _turnId: string): Promise<IChat> { throw new Error('not implemented'); }
	override async createSideChat(_sessionId: string, _sourceChat: URI, _turnId: string, _selection?: ISideChatSelection): Promise<IChat> { throw new Error('not implemented'); }
}

function createSessionsManagementService(
	session: ISession,
	disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>,
	provider: ISessionsProvider | readonly ISessionsProvider[] = new TestSessionsProvider(session),
	workspaceTrustManagementService = new TestWorkspaceTrustManagementService(),
	workspaceTrustRequestService?: IWorkspaceTrustRequestService,
	configurationService: IConfigurationService = new TestConfigurationService(),
): { service: ISessionsManagementService; view: SessionsService; chatWidgetService: TestChatWidgetService; chatService: TestChatService; contextKeyService: MockContextKeyService } {
	const instantiationService = disposables.add(new TestInstantiationService());
	const chatWidgetService = new TestChatWidgetService();
	const chatService = disposables.add(new TestChatService());
	const providers = Array.isArray(provider) ? provider : [provider];
	const contextKeyService = disposables.add(new MockContextKeyService());

	instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IContextKeyService, contextKeyService);
	instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(providers));
	instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
	instantiationService.stub(IChatWidgetService, chatWidgetService);
	instantiationService.stub(IProgressService, new TestProgressService());
	instantiationService.stub(IChatService, chatService);
	instantiationService.stub(IChatWidgetHistoryService, new class extends mock<IChatWidgetHistoryService>() {
		override moveHistory(): void { }
	});
	instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustManagementService);
	if (workspaceTrustRequestService) {
		instantiationService.stub(IWorkspaceTrustRequestService, workspaceTrustRequestService);
	}

	const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
	const view = createView(instantiationService, service, disposables);
	return { service, view, chatWidgetService, chatService, contextKeyService };
}

/**
 * Passive sessions part stub. The view service drives it but the tests only
 * exercise the view/model behaviour, so the calls are no-ops.
 */
class TestSessionsPartService extends mock<ISessionsPartService>() {
	override readonly onDidFocusSession = Event.None;
	override readonly onDidToggleMaximizeSession = Event.None;
	override updateVisibleSessions(): void { }
	override focusSession(): void { }
}

/**
 * Builds a {@link SessionsService} over an already-created management
 * service, stubbing the management service instance and a passive part so the
 * view's opening/restore/visible-session behaviour can be tested.
 */
function createView(instantiationService: TestInstantiationService, service: ISessionsManagementService, disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>): SessionsService {
	instantiationService.stub(ISessionsManagementService, service);
	instantiationService.stub(ISessionsPartService, new TestSessionsPartService());
	instantiationService.stub(ICustomViewService, disposables.add(new CustomViewService(new NullLogService(), disposables.add(new InMemoryStorageService()))));
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(ISessionOpenTelemetryService, disposables.add(new SessionOpenTelemetryService(NullTelemetryService)));
	return disposables.add(instantiationService.createInstance(SessionsService));
}

suite('SessionsManagementService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('cancelCurrentRequest loads the chat model then cancels the main chat request', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'test' });
		const { service, chatService } = createSessionsManagementService(session, disposables);

		await service.cancelCurrentRequest(session);

		assert.deepStrictEqual({
			loaded: chatService.loadedResources,
			cancelled: chatService.cancelledResources,
			disposedModelRefs: chatService.disposedModelRefs,
		}, {
			loaded: [stubChat.resource],
			cancelled: [stubChat.resource],
			disposedModelRefs: 1,
		});
	});

	test('cancelCurrentRequest disposes the loaded model when cancellation fails', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'test' });
		const { service, chatService } = createSessionsManagementService(session, disposables);
		chatService.cancelError = new Error('cancel failed');

		await assert.rejects(() => service.cancelCurrentRequest(session), /cancel failed/);

		assert.deepStrictEqual({
			loaded: chatService.loadedResources,
			cancelled: chatService.cancelledResources,
			disposedModelRefs: chatService.disposedModelRefs,
		}, {
			loaded: [stubChat.resource],
			cancelled: [stubChat.resource],
			disposedModelRefs: 1,
		});
	});

	test('cancelCurrentRequest rejects when the chat model cannot be loaded', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'test' });
		const { service, chatService } = createSessionsManagementService(session, disposables);
		chatService.modelRefAvailable = false;

		await assert.rejects(() => service.cancelCurrentRequest(session), /Failed to load chat session for cancellation/);

		assert.deepStrictEqual({
			loaded: chatService.loadedResources,
			cancelled: chatService.cancelledResources,
			disposedModelRefs: chatService.disposedModelRefs,
		}, {
			loaded: [stubChat.resource],
			cancelled: [],
			disposedModelRefs: 0,
		});
	});

	test('openSession waits for a loading session before opening chat content', async () => {
		const loading = observableValue('loading', true);
		const session = stubSession({ sessionId: 'loading', providerId: 'test', loading });
		const { view } = createSessionsManagementService(session, disposables);

		let resolved = false;
		const openPromise = view.openSession(session.resource).then(() => { resolved = true; });
		await Promise.resolve();

		assert.deepStrictEqual({ resolved }, { resolved: false });

		loading.set(false, undefined);
		await openPromise;

		assert.deepStrictEqual({ resolved }, { resolved: true });
	});

	test('marks the active session as read via its provider even when its provider state was unread', async () => {
		const isRead = observableValue('isRead', false);
		const session = stubSession({ sessionId: 'unread', providerId: 'test', isRead });
		const provider = new class extends TestSessionsProvider {
			override async setSessionReadState(_sessionId: string, read: boolean): Promise<void> {
				isRead.set(read, undefined);
			}
		}(session);
		const { view } = createSessionsManagementService(session, disposables, provider);

		// While not active, the provider-owned unread state is untouched.
		const readBeforeActive = session.isRead.get();

		// Opening the session makes it active; it must then be marked read.
		await view.openSession(session.resource);
		const readWhileActive = session.isRead.get();

		assert.deepStrictEqual(
			{ readBeforeActive, readWhileActive, activeId: view.activeSession.get()?.sessionId },
			{ readBeforeActive: false, readWhileActive: true, activeId: 'unread' },
		);
	});

	test('leaves a non-active session in its provider read state', () => {
		const active = stubSession({ sessionId: 'active', providerId: 'test' });
		const other = stubSession({ sessionId: 'other', providerId: 'test', isRead: constObservable(false) });
		const { view } = createSessionsManagementService(active, disposables);

		// Nothing is opened, so `other` stays non-active and keeps its unread state.
		assert.deepStrictEqual(
			{ activeId: view.activeSession.get()?.sessionId, otherRead: other.isRead.get() },
			{ activeId: undefined, otherRead: false },
		);
	});

	test('does not change active session when added session is not displayed in any widget', async () => {
		const originalSession = stubSession({ sessionId: 'original', providerId: 'test' });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			constructor() { super(originalSession); }
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		const chatWidgetService = new TestChatWidgetService();

		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, chatWidgetService);
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);

		// Open the original session so it becomes the active session
		await view.openSession(originalSession.resource);
		assert.strictEqual(view.activeSession.get()?.sessionId, 'original');

		// A new session appears but is NOT displayed in any widget
		const otherSession = stubSession({ sessionId: 'other', providerId: 'test' });
		// Note: not calling chatWidgetService.setWidgetSessionResource()

		onDidChangeSessions.fire({ added: [otherSession], removed: [], changed: [] });

		// The active session should remain unchanged
		assert.strictEqual(view.activeSession.get()?.sessionId, 'original');
	});

	test('getSessionForChatResource returns the session that owns the chat', () => {
		const chatA: IChat = { ...stubChat, resource: URI.parse('test:///chat-a') };
		const chatB: IChat = { ...stubChat, resource: URI.parse('test:///CHAT-B') };
		const sessionA = stubSession({
			sessionId: 'a',
			providerId: 'test',
			chats: constObservable([chatA]),
			mainChat: constObservable(chatA),
		});
		const sessionB = stubSession({
			sessionId: 'b',
			providerId: 'test',
			chats: constObservable([chatB]),
			mainChat: constObservable(chatB),
		});
		const provider = new class extends TestSessionsProvider {
			constructor() { super(sessionA); }
			override getSessions(): ISession[] { return [sessionA, sessionB]; }
		};
		const { service } = createSessionsManagementService(sessionA, disposables, provider);

		const ownedChat = service.getSessionForChatResource(URI.parse('test:///chat-b'));

		assert.deepStrictEqual({
			sessionId: ownedChat?.session.sessionId,
			chat: ownedChat?.chat,
			missing: service.getSessionForChatResource(URI.parse('test:///missing')),
		}, {
			sessionId: 'b',
			chat: chatB,
			missing: undefined,
		});
	});

	test('restoreVisibleSessions waits for session to appear via onDidChangeSessions', async () => {
		const targetSession = stubSession({ sessionId: 'target', providerId: 'test' });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());

		let sessions: ISession[] = [];
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			constructor() { super(targetSession); }
			override getSessions(): ISession[] { return sessions; }
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		const chatWidgetService = new TestChatWidgetService();

		// Seed storage so the management service treats `targetSession` as the
		// last active session and tries to restore it on startup.
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([{ sessionResource: targetSession.resource.toString(), visibleOrder: 0, isActive: true }]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);

		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, chatWidgetService);
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);

		// At this point the provider does not yet know about the session
		// (mimicking an agent host provider whose cache has not loaded yet).
		const restorePromise = view.restoreVisibleSessions();
		await Promise.resolve();
		assert.deepStrictEqual({
			visible: view.visibleSessions.get().filter((s): s is NonNullable<typeof s> => !!s).map(s => s.sessionId),
			restoreComplete: view.initialRestoreComplete.get(),
		}, {
			visible: [],
			restoreComplete: false,
		});

		// Now the provider learns about the session and fires its change event.
		// `onDidChangeProviders` does NOT fire here — only the per-provider
		// session change event — so the fix must subscribe to it as well.
		sessions = [targetSession];
		onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });

		await restorePromise;
		assert.deepStrictEqual({
			visible: view.visibleSessions.get().map(s => s?.sessionId),
			restoreComplete: view.initialRestoreComplete.get(),
		}, {
			visible: [targetSession.sessionId],
			restoreComplete: true,
		});
	});

	test('ROUNDTRIP: opened session is retained across save + restore', async () => {
		const createdChat: IChat = { ...stubChat, resource: URI.parse('test:///chat-x'), status: constObservable(1) };
		const session = stubSession({
			sessionId: 'x',
			providerId: 'test',
			status: constObservable(1),
			chats: constObservable([createdChat]),
			mainChat: constObservable(createdChat),
		});

		const provider = new TestSessionsProvider(session);
		const storage = disposables.add(new InMemoryStorageService());

		const makeService = () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IStorageService, storage);
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
			instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
			instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
			instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
			instantiationService.stub(IProgressService, new TestProgressService());
			instantiationService.stub(IChatService, new class extends mock<IChatService>() {
				override readonly onDidSubmitRequest = Event.None;
			});
			const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
			const view = createView(instantiationService, service, disposables);
			return { service, view };
		};

		// First window: open the session, then simulate shutdown (flush storage).
		const first = makeService();
		await first.view.openSession(session.resource);
		assert.strictEqual(first.view.activeSession.get()?.sessionId, 'x');
		await storage.flush();

		// Second window: restore from persisted state.
		const second = makeService();
		await second.view.restoreVisibleSessions();

		assert.deepStrictEqual({
			visible: second.view.visibleSessions.get().map(s => s?.sessionId ?? null),
			active: second.view.activeSession.get()?.sessionId ?? null,
		}, {
			visible: ['x'],
			active: 'x',
		});
	});

	test('RACE: a new session created during restore does not drop the restored session', async () => {
		const targetSession = stubSession({ sessionId: 'target', providerId: 'test' });
		const newSession = stubSession({ sessionId: 'fresh', providerId: 'test' });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());

		let sessions: ISession[] = [];
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			constructor() { super(targetSession); }
			override getSessions(): ISession[] { return sessions; }
			override createNewSession(): ISession { return newSession; }
			override resolveWorkspace(): ISessionWorkspace { return { folders: [], isVirtualWorkspace: false } as unknown as ISessionWorkspace; }
		};

		const storage = disposables.add(new InMemoryStorageService());
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([{ sessionResource: targetSession.resource.toString(), visibleOrder: 0, isActive: true }]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});
		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);

		// Restore starts but the provider has not yet surfaced the session.
		const restorePromise = view.restoreVisibleSessions();
		await Promise.resolve();

		// The new-chat widget eagerly creates a session for the restored
		// workspace folder while restore is still waiting for its session.
		service.createNewSession(URI.parse('file:///folder'));

		// The provider now surfaces the persisted session.
		sessions = [targetSession];
		onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });
		await restorePromise;

		assert.deepStrictEqual({
			hasTarget: view.visibleSessions.get().some(s => s?.sessionId === 'target'),
			active: view.activeSession.get()?.sessionId ?? null,
		}, {
			hasTarget: true,
			active: 'target',
		});
	});

	test.skip('openNewSession inherits the active session workspace when requested', async () => {
		const makeWorkspace = (uri: URI): ISessionWorkspace => ({
			uri,
			label: 'ws',
			icon: Codicon.vm,
			folders: [{ root: uri, workingDirectory: uri, name: 'ws', description: undefined }],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		});

		const workspaceB = URI.parse('file:///workspaceB');
		const openSession = stubSession({ sessionId: 'open', providerId: 'test', workspace: constObservable(makeWorkspace(workspaceB)) });

		let createdFolderUri: URI | undefined;
		const provider = new class extends TestSessionsProvider {
			constructor() { super(openSession); }
			override getSessions(): ISession[] { return [openSession]; }
			override resolveWorkspace(folderUri?: URI): ISessionWorkspace { return makeWorkspace(folderUri!); }
			override createNewSession(folderUri?: URI): ISession {
				createdFolderUri = folderUri;
				return stubSession({ sessionId: 'inherited', providerId: 'test', workspace: constObservable(makeWorkspace(folderUri!)) });
			}
		};

		const { view } = createSessionsManagementService(openSession, disposables, provider);

		// Make the established session active.
		await view.openSession(openSession.resource);
		assert.strictEqual(view.activeSession.get()?.sessionId, 'open');

		// Opening a new session view inherits the active session's workspace.
		view.openNewSession();

		assert.deepStrictEqual({
			createdFor: createdFolderUri?.toString() ?? null,
			activeSession: view.activeSession.get()?.sessionId ?? null,
			activeWorkspace: view.activeSession.get()?.workspace.get()?.folders[0]?.root.toString() ?? null,
		}, {
			createdFor: workspaceB.toString(),
			activeSession: 'inherited',
			activeWorkspace: workspaceB.toString(),
		});
	});

	test('openNewSession does not inherit the active session workspace by default', async () => {
		const workspaceB = URI.parse('file:///workspaceB');
		const openSession = stubSession({
			sessionId: 'open',
			providerId: 'test',
			workspace: constObservable({
				uri: workspaceB,
				label: 'ws',
				icon: Codicon.vm,
				folders: [{ root: workspaceB, workingDirectory: workspaceB, name: 'ws', description: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			} satisfies ISessionWorkspace),
		});

		let createNewSessionCalled = false;
		const provider = new class extends TestSessionsProvider {
			constructor() { super(openSession); }
			override getSessions(): ISession[] { return [openSession]; }
			override createNewSession(): ISession {
				createNewSessionCalled = true;
				return openSession;
			}
		};

		const { view } = createSessionsManagementService(openSession, disposables, provider);

		await view.openSession(openSession.resource);
		assert.strictEqual(view.activeSession.get()?.sessionId, 'open');

		// Without the inherit option, no new session is created from the active
		// session's workspace; the empty new-session view is shown instead.
		view.openNewSession();

		assert.deepStrictEqual({
			createNewSessionCalled,
			activeSession: view.activeSession.get()?.sessionId ?? null,
		}, {
			createNewSessionCalled: false,
			activeSession: null,
		});
	});

	test('canOpenSession grants a worktree trust from a trusted base repo before prompting', async () => {
		const repoRoot = URI.file('/repo');
		const worktree = URI.file('/repo.worktrees/feature');
		const session = stubSession({
			sessionId: 'wt-open',
			providerId: 'test',
			workspace: constObservable({
				uri: repoRoot,
				label: 'repo',
				icon: Codicon.vm,
				folders: [{
					root: repoRoot,
					workingDirectory: worktree,
					name: 'feature',
					description: undefined,
					gitRepository: { uri: repoRoot, workTreeUri: worktree, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
				}],
				requiresWorkspaceTrust: true,
				isVirtualWorkspace: false,
			} satisfies ISessionWorkspace),
		});

		// The user trusts the base repo but not the worktree itself.
		const trusted = new Set<string>([repoRoot.toString()]);
		const setUrisTrustCalls: string[][] = [];
		const trustManagement = new class extends TestWorkspaceTrustManagementService {
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: trusted.has(uri.toString()) }; }
			override async setUrisTrust(uris: URI[], isTrusted: boolean) {
				setUrisTrustCalls.push(uris.map(uri => uri.toString()));
				if (isTrusted) { for (const uri of uris) { trusted.add(uri.toString()); } }
			}
		};
		const resourcesTrustUris: string[] = [];
		const trustRequest = new class extends mock<IWorkspaceTrustRequestService>() {
			override async requestResourcesTrust(options: ResourceTrustRequestOptions) { resourcesTrustUris.push(options.uri.toString()); return true; }
		};

		const { view } = createSessionsManagementService(session, disposables, new TestSessionsProvider(session), trustManagement, trustRequest);

		const canOpen = await view.canOpenSession(session);

		// Worktree trust is inherited (granted) from the trusted base repo before the
		// folder-trust check, so the open gate never prompts.
		assert.deepStrictEqual({
			canOpen,
			granted: setUrisTrustCalls,
			prompts: resourcesTrustUris,
		}, {
			canOpen: true,
			granted: [[worktree.toString()]],
			prompts: [],
		});
	});

	test('canOpenSession still prompts for a worktree when the base repo is untrusted', async () => {
		const repoRoot = URI.file('/repo-untrusted');
		const worktree = URI.file('/repo-untrusted.worktrees/feature');
		const session = stubSession({
			sessionId: 'wt-open-untrusted',
			providerId: 'test',
			workspace: constObservable({
				uri: repoRoot,
				label: 'repo',
				icon: Codicon.vm,
				folders: [{
					root: repoRoot,
					workingDirectory: worktree,
					name: 'feature',
					description: undefined,
					gitRepository: { uri: repoRoot, workTreeUri: worktree, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
				}],
				requiresWorkspaceTrust: true,
				isVirtualWorkspace: false,
			} satisfies ISessionWorkspace),
		});

		// Nothing is trusted: no inheritance, so the worktree must be prompted for
		// and the declined open is refused.
		const setUrisTrustCalls: string[][] = [];
		const trustManagement = new class extends TestWorkspaceTrustManagementService {
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: false }; }
			override async setUrisTrust(uris: URI[]) { setUrisTrustCalls.push(uris.map(uri => uri.toString())); }
		};
		const resourcesTrustUris: string[] = [];
		const trustRequest = new class extends mock<IWorkspaceTrustRequestService>() {
			override async requestResourcesTrust(options: ResourceTrustRequestOptions) { resourcesTrustUris.push(options.uri.toString()); return false; }
		};

		const { view } = createSessionsManagementService(session, disposables, new TestSessionsProvider(session), trustManagement, trustRequest);

		const canOpen = await view.canOpenSession(session);

		assert.deepStrictEqual({
			canOpen,
			granted: setUrisTrustCalls,
			prompts: resourcesTrustUris,
		}, {
			canOpen: false,
			granted: [],
			prompts: [worktree.toString()],
		});
	});

	test('cancelled openNewSession does not replace a newer draft after workspace trust resolves', async () => {
		const staleFolder = URI.file('/stale');
		const latestFolder = URI.file('/latest');
		const makeWorkspace = (uri: URI): ISessionWorkspace => ({
			uri,
			label: uri.path,
			icon: Codicon.folder,
			folders: [{ root: uri, workingDirectory: uri, name: uri.path, description: undefined }],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		});
		const staleSession = stubSession({ sessionId: 'stale', providerId: 'test', workspace: constObservable(makeWorkspace(staleFolder)) });
		const latestSession = stubSession({ sessionId: 'latest', providerId: 'test', workspace: constObservable(makeWorkspace(latestFolder)) });
		const createdFolders: string[] = [];
		const provider = new class extends TestSessionsProvider {
			constructor() { super(latestSession); }
			override resolveWorkspace(folderUri: URI): ISessionWorkspace { return makeWorkspace(folderUri); }
			override createNewSession(folderUri: URI): ISession {
				createdFolders.push(folderUri.toString());
				return folderUri.toString() === staleFolder.toString() ? staleSession : latestSession;
			}
		};
		const staleTrust = new DeferredPromise<boolean>();
		let trustRequestCount = 0;
		const trustRequestService = new class extends mock<IWorkspaceTrustRequestService>() {
			override requestResourcesTrust(): Promise<boolean> {
				trustRequestCount++;
				return trustRequestCount === 1 ? staleTrust.p : Promise.resolve(true);
			}
		};
		const { view } = createSessionsManagementService(
			latestSession,
			disposables,
			provider,
			new TestWorkspaceTrustManagementService(),
			trustRequestService,
		);
		const staleCts = disposables.add(new CancellationTokenSource());

		const staleOpen = view.openNewSession({ folderUri: staleFolder }, staleCts.token);
		await Promise.resolve();
		staleCts.cancel();
		const latestResult = await view.openNewSession({ folderUri: latestFolder });
		staleTrust.complete(true);
		const staleResult = await staleOpen;

		assert.deepStrictEqual({
			createdFolders,
			activeSessionId: view.activeSession.get()?.sessionId,
			latestSessionId: latestResult.session?.sessionId,
			staleSessionId: staleResult.session?.sessionId,
		}, {
			createdFolders: [latestFolder.toString()],
			activeSessionId: 'latest',
			latestSessionId: 'latest',
			staleSessionId: undefined,
		});
	});

	test.skip('openNewSession recreates a draft for the active session workspace when inheriting', async () => {
		const makeWorkspace = (uri: URI): ISessionWorkspace => ({
			uri,
			label: 'ws',
			icon: Codicon.vm,
			folders: [{ root: uri, workingDirectory: uri, name: 'ws', description: undefined }],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		});

		const workspaceA = URI.parse('file:///workspaceA');
		const openSession = stubSession({ sessionId: 'open', providerId: 'test', workspace: constObservable(makeWorkspace(workspaceA)) });
		const pendingSession = stubSession({ sessionId: 'pending', providerId: 'test', workspace: constObservable(makeWorkspace(workspaceA)) });

		let createNewSessionCount = 0;
		const provider = new class extends TestSessionsProvider {
			constructor() { super(openSession); }
			override getSessions(): ISession[] { return [openSession]; }
			override resolveWorkspace(folderUri?: URI): ISessionWorkspace { return makeWorkspace(folderUri!); }
			override createNewSession(): ISession {
				createNewSessionCount++;
				return pendingSession;
			}
		};

		const { view } = createSessionsManagementService(openSession, disposables, provider);

		// Compose an in-progress new session (pending draft) for workspace A.
		view.openNewSession({ folderUri: workspaceA });
		assert.strictEqual(view.activeSession.get()?.sessionId, 'pending');

		// Navigate to the established session, which shares workspace A.
		await view.openSession(openSession.resource);
		assert.strictEqual(view.activeSession.get()?.sessionId, 'open');

		// Opening a new session view inherits workspace A and always creates a
		// fresh draft for it (no workspace de-duplication).
		view.openNewSession();

		assert.deepStrictEqual({
			createNewSessionCount,
			activeSession: view.activeSession.get()?.sessionId ?? null,
		}, {
			createNewSessionCount: 2,
			activeSession: 'pending',
		});
	});

	test('restoreVisibleSessions restores the grid order, sticky and active state', async () => {
		const sessionA = stubSession({ sessionId: 'a', providerId: 'test' });
		const sessionB = stubSession({ sessionId: 'b', providerId: 'test' });
		const sessionC = stubSession({ sessionId: 'c', providerId: 'test' });
		const sessions = [sessionA, sessionB, sessionC];

		const provider = new class extends TestSessionsProvider {
			constructor() { super(sessionA); }
			override getSessions(): ISession[] { return sessions; }
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		// Persisted grid: [A (sticky), B (active), C]
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([
				{ sessionResource: sessionA.resource.toString(), visibleOrder: 0, isSticky: true, isActive: false },
				{ sessionResource: sessionB.resource.toString(), visibleOrder: 1, isSticky: false, isActive: true },
				{ sessionResource: sessionC.resource.toString(), visibleOrder: 2, isSticky: false, isActive: false },
			]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);

		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);

		await view.restoreVisibleSessions();

		assert.deepStrictEqual({
			visible: view.visibleSessions.get().map(s => s?.sessionId ?? null),
			sticky: view.visibleSessions.get().map(s => s?.sticky.get() ?? false),
			active: view.activeSession.get()?.sessionId,
		}, {
			visible: ['a', 'b', 'c'],
			sticky: [true, false, false],
			active: 'b',
		});
	});

	test('restoreVisibleSessions lays out the grid atomically without intermediate single-session states', async () => {
		const sessionA = stubSession({ sessionId: 'a', providerId: 'test' });
		const sessionB = stubSession({ sessionId: 'b', providerId: 'test' });
		const sessions = [sessionA, sessionB];

		const provider = new class extends TestSessionsProvider {
			constructor() { super(sessionA); }
			override getSessions(): ISession[] { return sessions; }
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		// Persisted grid: [A, B (active)] — the active session is NOT the
		// left-most one, which used to surface B alone before A was inserted.
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([
				{ sessionResource: sessionA.resource.toString(), visibleOrder: 0, isSticky: false, isActive: false },
				{ sessionResource: sessionB.resource.toString(), visibleOrder: 1, isSticky: false, isActive: true },
			]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);

		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);

		// Record every grid state published while restoring.
		const states: (string | null)[][] = [];
		disposables.add(autorun(reader => {
			states.push(view.visibleSessions.read(reader).map(s => s?.sessionId ?? null));
		}));

		await view.restoreVisibleSessions();

		// The grid must never go through a state showing only the active
		// session 'b' on its own — that intermediate layout is the flicker.
		const showedActiveAlone = states.some(s => s.length === 1 && s[0] === 'b');

		assert.deepStrictEqual({
			showedActiveAlone,
			final: view.visibleSessions.get().map(s => s?.sessionId ?? null),
			active: view.activeSession.get()?.sessionId,
		}, {
			showedActiveAlone: false,
			final: ['a', 'b'],
			active: 'b',
		});
	});

	test('sendNewChatRequest keeps the started session active for a foreground send', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const { service, view } = createSessionsManagementService(session, disposables);

		// Open the session so it becomes the active session.
		await view.openSession(session.resource);
		assert.strictEqual(view.activeSession.get()?.sessionId, 's1');

		// A foreground new-chat send keeps the started session active (the view
		// follows the send and never resets the active slot).
		await service.sendNewChatRequest(session, { query: 'hi' });
		assert.strictEqual(view.activeSession.get()?.sessionId, 's1');
	});

	test('sendNewChatRequest routes a prepared draft through its replacement provider', async () => {
		const folder = URI.file('/workspace');
		const workspace: ISessionWorkspace = {
			uri: folder,
			label: 'Workspace',
			icon: Codicon.vm,
			folders: [{ root: folder, workingDirectory: folder, name: 'Workspace', description: undefined }],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
		const originalStatus = observableValue('originalStatus', SessionStatus.Untitled);
		const originalRequestInProgress = observableValue('originalRequestInProgress', false);
		const originalChat: IChat = { ...stubChat, status: originalStatus };
		const original = stubSession({
			sessionId: 'local-draft',
			providerId: 'local',
			status: originalStatus,
			isNewSessionRequestInProgress: originalRequestInProgress,
			chats: constObservable([originalChat]),
			mainChat: constObservable(originalChat),
			workspace: constObservable(workspace),
		});
		const replacementStatus = observableValue('replacementStatus', SessionStatus.Untitled);
		const replacementRequestInProgress = observableValue('replacementRequestInProgress', false);
		const replacementChat: IChat = { ...stubChat, resource: URI.parse('dev:///chat'), status: replacementStatus };
		const replacement = stubSession({
			sessionId: 'dev-draft',
			providerId: 'dev',
			status: replacementStatus,
			isNewSessionRequestInProgress: replacementRequestInProgress,
			chats: constObservable([replacementChat]),
			mainChat: constObservable(replacementChat),
			workspace: constObservable(workspace),
		});
		const preparation = new DeferredPromise<void>();
		const deleted: string[] = [];
		const originalProvider = new class extends TestSessionsProvider {
			override readonly id = 'local';
			constructor() { super(original); }
			override resolveWorkspace(): ISessionWorkspace { return workspace; }
			override createNewSession(): ISession { return original; }
			override startNewSessionRequest() {
				originalRequestInProgress.set(true, undefined);
				return toDisposable(() => originalRequestInProgress.set(false, undefined));
			}
			override async prepareNewSession() {
				await preparation.p;
				return { session: replacement };
			}
			override deleteNewSession(sessionId: string): void { deleted.push(sessionId); }
		}();
		const sent: string[] = [];
		const replacementProvider = new class extends TestSessionsProvider {
			override readonly id = 'dev';
			constructor() { super(replacement); }
			override startNewSessionRequest() {
				replacementRequestInProgress.set(true, undefined);
				return toDisposable(() => replacementRequestInProgress.set(false, undefined));
			}
			override async createNewChat(): Promise<IChat> {
				sent.push('createNewChat');
				return replacementChat;
			}
			override async sendRequest(sessionId: string): Promise<ISession> {
				sent.push(`sendRequest:${sessionId}`);
				return replacement;
			}
		}();
		const { service, view } = createSessionsManagementService(original, disposables, [originalProvider, replacementProvider]);
		service.createNewSession(folder, { providerId: originalProvider.id, sessionTypeId: 'test' });
		await view.openSession(original.resource);
		const replacements: string[] = [];
		disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => replacements.push(`${from.sessionId}->${to.sessionId}`)));

		const send = service.sendNewChatRequest(original, { query: 'hi' });
		assert.deepStrictEqual({
			statusDuringPreparation: original.status.get(),
			requestInProgressDuringPreparation: original.isNewSessionRequestInProgress?.get(),
			activeSessionDuringPreparation: view.activeSession.get()?.sessionId,
			activeRequestInProgressDuringPreparation: view.activeSession.get()?.isNewSessionRequestInProgress?.get(),
			activeSessionCreatedDuringPreparation: view.activeSession.get()?.isCreated.get(),
		}, {
			statusDuringPreparation: SessionStatus.Untitled,
			requestInProgressDuringPreparation: true,
			activeSessionDuringPreparation: 'local-draft',
			activeRequestInProgressDuringPreparation: true,
			activeSessionCreatedDuringPreparation: false,
		});
		preparation.complete();
		await send;

		assert.deepStrictEqual({
			deleted,
			replacements,
			sent,
			visibleSessions: view.visibleSessions.get().map(session => session?.sessionId ?? null),
			activeSession: view.activeSession.get()?.sessionId,
			replacementStatus: replacement.status.get(),
			replacementRequestInProgress: replacement.isNewSessionRequestInProgress?.get(),
		}, {
			deleted: ['local-draft'],
			replacements: ['local-draft->dev-draft'],
			sent: ['createNewChat', 'sendRequest:dev-draft'],
			visibleSessions: ['dev-draft'],
			activeSession: 'dev-draft',
			replacementStatus: SessionStatus.Untitled,
			replacementRequestInProgress: false,
		});
	});

	test('sendNewChatRequest restores an untitled draft when preparation fails', async () => {
		const status = observableValue('status', SessionStatus.Untitled);
		const chat: IChat = { ...stubChat, status };
		const session = stubSession({
			sessionId: 'draft',
			providerId: 'test',
			status,
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const preparation = new DeferredPromise<void>();
		const requestInProgress = observableValue('requestInProgress', false);
		const sessionWithRequestState = { ...session, isNewSessionRequestInProgress: requestInProgress };
		const provider = new class extends TestSessionsProvider {
			override startNewSessionRequest() {
				requestInProgress.set(true, undefined);
				return toDisposable(() => requestInProgress.set(false, undefined));
			}
			override async prepareNewSession(): Promise<never> {
				await preparation.p;
				throw new Error('prepare failed');
			}
		}(sessionWithRequestState);
		const { service, view } = createSessionsManagementService(sessionWithRequestState, disposables, provider);
		await view.openSession(sessionWithRequestState.resource);

		const send = service.sendNewChatRequest(sessionWithRequestState, { query: 'hi' });
		assert.deepStrictEqual({
			status: status.get(),
			requestInProgress: requestInProgress.get(),
		}, {
			status: SessionStatus.Untitled,
			requestInProgress: true,
		});
		preparation.complete();
		await assert.rejects(send, /prepare failed/);

		assert.deepStrictEqual({
			status: status.get(),
			requestInProgress: requestInProgress.get(),
			activeSession: view.activeSession.get()?.sessionId,
		}, {
			status: SessionStatus.Untitled,
			requestInProgress: false,
			activeSession: 'draft',
		});
	});

	test('sendNewChatRequest tracks a foreground first request until it settles', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			status: constObservable(SessionStatus.Untitled),
		});
		const createChatBarrier = new DeferredPromise<void>();
		const provider = new class extends TestSessionsProvider {
			override async createNewChat(): Promise<IChat> {
				await createChatBarrier.p;
				return session.mainChat.get();
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const send = service.sendNewChatRequest(session, { query: 'hi' });
		await timeout(0);
		const duringCreate = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		createChatBarrier.complete();
		await send;

		assert.deepStrictEqual({
			duringCreate,
			afterSend: service.getInFlightNewSessionRequests(),
		}, {
			duringCreate: ['s1'],
			afterSend: [],
		});
	});

	test('sendNewChatRequest keeps tracking until concurrent first requests settle', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			status: constObservable(SessionStatus.Untitled),
		});
		const createBarriers = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		const bothCreatesStarted = new DeferredPromise<void>();
		let createCount = 0;
		const provider = new class extends TestSessionsProvider {
			override async createNewChat(): Promise<IChat> {
				const index = createCount++;
				if (createCount === createBarriers.length) {
					bothCreatesStarted.complete();
				}
				await createBarriers[index].p;
				return session.mainChat.get();
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const first = service.sendNewChatRequest(session, { query: 'first' });
		const second = service.sendNewChatRequest(session, { query: 'second' });
		await bothCreatesStarted.p;
		const whileBothPending = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		createBarriers[0].complete();
		await first;
		const afterFirstSettles = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		createBarriers[1].complete();
		await second;

		assert.deepStrictEqual({
			whileBothPending,
			afterFirstSettles,
			afterBothSettle: service.getInFlightNewSessionRequests(),
		}, {
			whileBothPending: ['s1'],
			afterFirstSettles: ['s1'],
			afterBothSettle: [],
		});
	});

	test('sendNewChatRequest does not track a request in an existing session', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			status: constObservable(SessionStatus.Completed),
		});
		const createChatBarrier = new DeferredPromise<void>();
		const provider = new class extends TestSessionsProvider {
			override async createNewChat(): Promise<IChat> {
				await createChatBarrier.p;
				return session.mainChat.get();
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const send = service.sendNewChatRequest(session, { query: 'hi' });
		await timeout(0);
		const duringCreate = service.getInFlightNewSessionRequests();
		createChatBarrier.complete();
		await send;

		assert.deepStrictEqual(duringCreate, []);
	});

	test('sendNewChatRequest clears first-request tracking when chat creation fails', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			status: constObservable(SessionStatus.Untitled),
		});
		const provider = new class extends TestSessionsProvider {
			override async createNewChat(): Promise<IChat> {
				throw new Error('create failed');
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await assert.rejects(service.sendNewChatRequest(session, { query: 'hi' }), /create failed/);

		assert.deepStrictEqual(service.getInFlightNewSessionRequests(), []);
	});

	test('sendNewChatRequest with background resolves before preparation and routes the replacement in the background', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
			status: constObservable(SessionStatus.Untitled),
		});
		const replacementChat: IChat = { ...stubChat, resource: URI.parse('replacement:///chat') };
		const replacement = stubSession({
			sessionId: 's2',
			providerId: 'replacement',
			chats: constObservable([replacementChat]),
			mainChat: constObservable(replacementChat),
		});
		let completeSendRequest: (() => void) | undefined;
		const preparation = new DeferredPromise<void>();
		const sendRequestStartedBarrier = new DeferredPromise<void>();
		const deleted: string[] = [];
		const replacements: string[] = [];
		let preparationStarted = false;
		let sendRequestStarted = false;
		const sendRequestFinished = new DeferredPromise<void>();
		let sentSessionId: string | undefined;
		const originalProvider = new class extends TestSessionsProvider {
			override async prepareNewSession() {
				preparationStarted = true;
				await preparation.p;
				return { session: replacement };
			}
			override deleteNewSession(sessionId: string): void {
				deleted.push(sessionId);
			}
		}(session);
		const replacementProvider = new class extends TestSessionsProvider {
			override readonly id = 'replacement';
			override async sendRequest(sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				try {
					sentSessionId = sessionId;
					sendRequestStarted = true;
					await sendRequestStartedBarrier.complete();
					await new Promise<void>(resolve => {
						completeSendRequest = resolve;
					});
					return replacement;
				} finally {
					sendRequestFinished.complete();
				}
			}
		}(replacement);
		const { service } = createSessionsManagementService(session, disposables, [originalProvider, replacementProvider]);
		disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => replacements.push(`${from.sessionId}->${to.sessionId}`)));

		const sendPromise = service.sendNewChatRequest(session, { query: 'hi', background: true });
		await sendPromise;

		const whilePreparing = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		assert.deepStrictEqual({
			preparationStarted,
			sendRequestStarted,
			deleted,
			whilePreparing,
		}, {
			preparationStarted: true,
			sendRequestStarted: false,
			deleted: [],
			whilePreparing: ['s1'],
		});
		await preparation.complete();
		await preparation.complete();
		await timeout(0);
		await sendRequestStartedBarrier.p;
		const whileSending = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		assert.deepStrictEqual({
			deleted,
			replacements,
			sentSessionId,
		}, {
			deleted: ['s1'],
			replacements: [],
			sentSessionId: 's2',
		});
		completeSendRequest?.();
		await sendRequestFinished.p;
		await timeout(0);

		assert.deepStrictEqual({
			sendRequestStarted,
			whileSending,
			afterSend: service.getInFlightNewSessionRequests(),
		}, {
			sendRequestStarted: true,
			whileSending: ['s1'],
			afterSend: [],
		});
	});

	test('sendRequest with background is fire-and-forget and does not fire onWillSendRequest', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat'), status: constObservable(SessionStatus.Untitled) };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		let completeSendRequest: (() => void) | undefined;
		let sentChatResource: URI | undefined;
		const provider = new class extends TestSessionsProvider {
			override async sendRequest(_sessionId: string, chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				sentChatResource = chatResource;
				await new Promise<void>(resolve => {
					completeSendRequest = resolve;
				});
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		let willSendCount = 0;
		disposables.add(service.onWillSendRequest(() => willSendCount++));

		// The background send is fire-and-forget (it resolves before the
		// provider commits) and never fires `onWillSendRequest`, so the view's
		// send-follow cannot navigate into the sent chat.
		await service.sendRequest(session, chat, { query: 'hi', background: true });

		assert.deepStrictEqual({
			sentChatResource: sentChatResource?.toString(),
			willSendCount,
		}, {
			sentChatResource: chat.resource.toString(),
			willSendCount: 0,
		});

		completeSendRequest?.();
	});

	test('mirrored follow-up requests preserve submitted attachments', () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const { service, chatService } = createSessionsManagementService(session, disposables);
		const attachedContext: IChatRequestVariableEntry[] = [{ kind: 'generic', id: 'context', name: 'Context', value: 'value' }];
		let sentEvent: ISendRequestSentEvent | undefined;
		disposables.add(service.onDidSendRequest(event => sentEvent = event));

		chatService.submitRequest({
			chatSessionResource: chat.resource,
			message: { text: 'follow up', parts: [] },
			attachedContext,
		});

		assert.deepStrictEqual(sentEvent && {
			query: sentEvent.options.query,
			attachedContext: sentEvent.options.attachedContext,
			isNewSession: sentEvent.isNewSession,
			isNewChat: sentEvent.isNewChat,
		}, {
			query: 'follow up',
			attachedContext,
			isNewSession: false,
			isNewChat: false,
		});
	});

	test('send-follow activates only visible chat tabs', async () => {
		const mainChat: IChat = { ...stubChat, resource: URI.parse('test:///chat/main'), title: constObservable('main') };
		const sideChat: IChat = { ...stubChat, resource: URI.parse('test:///chat/side'), title: constObservable('side'), origin: { kind: ChatOriginKind.SideChat } };
		const toolChat: IChat = { ...stubChat, resource: URI.parse('test:///chat/tool'), title: constObservable('tool'), origin: { kind: ChatOriginKind.Tool }, interactivity: constObservable(ChatInteractivity.ReadOnly) };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([mainChat, sideChat, toolChat]),
			mainChat: constObservable(mainChat),
			capabilities: constObservable({ supportsMultipleChats: true }),
		});
		const provider = new class extends TestSessionsProvider {
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				return session;
			}
		}(session);
		const { service, view } = createSessionsManagementService(session, disposables, provider);

		await view.openSession(session.resource);
		await view.openChat(session, sideChat.resource);
		await service.sendRequest(session, toolChat, { query: 'hidden tool' });
		await Promise.resolve();
		const afterHiddenSend = view.activeSession.get()?.activeChat.get().resource.toString();

		await view.openChat(session, toolChat.resource);
		await service.sendRequest(session, toolChat, { query: 'visible tool' });
		await Promise.resolve();
		const afterVisibleSend = view.activeSession.get()?.activeChat.get().resource.toString();

		assert.deepStrictEqual({
			visibleTabs: view.activeSession.get()?.visibleChatTabs.get().map(chat => chat.title.get()),
			afterHiddenSend,
			afterVisibleSend,
		}, {
			visibleTabs: ['main', 'side', 'tool'],
			afterHiddenSend: sideChat.resource.toString(),
			afterVisibleSend: toolChat.resource.toString(),
		});
	});

	test('createAndSendNewChatRequest sends without changing the active view', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		let sendRequestStarted = false;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				sendRequestStarted = true;
				return session;
			}
		}(session);
		const { service, view } = createSessionsManagementService(session, disposables, provider);

		// No active session and no pending composer before the headless send.
		assert.strictEqual(view.activeSession.get(), undefined);

		await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' });

		// The request was sent, but the user's view was not navigated into the session.
		assert.strictEqual(sendRequestStarted, true);
		assert.strictEqual(view.activeSession.get(), undefined);
	});

	test('createAndSendNewChatRequest prepares request options while configuring the provisional session', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		const requestOptionsBarrier = new DeferredPromise<void>();
		const requestPreparationStarted = new DeferredPromise<void>();
		const configurationCompleted = new DeferredPromise<void>();
		const events: string[] = [];
		let createMetadata: Record<string, unknown> | undefined;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace {
				return {
					uri: URI.parse('test:///folder'),
					label: 'Test',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				};
			}
			override createNewSession(_folderUri?: URI, _sessionTypeId?: string, options?: ISessionsProviderCreateSessionOptions): ISession {
				createMetadata = options?.metadata;
				events.push('create');
				return session;
			}
			override startNewSessionRequest(_sessionId: string, activity?: string) {
				events.push(`start:${activity}`);
				return { dispose: () => events.push('clear') };
			}
			override async setWorktreeConfiguration(): Promise<void> {
				events.push('configure');
				configurationCompleted.complete();
			}
			override async sendRequest(_sessionId: string, _chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
				events.push(`send:${options.query}`);
				return session;
			}
		}(session);
		const { service, view } = createSessionsManagementService(session, disposables, provider);

		const sendPromise = service.createAndSendNewChatRequest(URI.parse('test:///folder'), {
			kind: 'deferred',
			activity: 'Fetching pull request...',
			async resolve() {
				events.push('prepare');
				requestPreparationStarted.complete();
				await requestOptionsBarrier.p;
				return { query: 'prepared' };
			},
		}, {
			isolationMode: 'worktree',
			metadata: { github: { pullRequestUrl: 'https://github.com/owner/repo/pull/42' } },
			onSessionCreated: created => {
				view.showSession(created.resource);
				events.push(`show:${view.activeSession.get()?.sessionId}`);
			},
		});
		await Promise.all([requestPreparationStarted.p, configurationCompleted.p]);
		const eventsWhilePreparingRequest = [...events];
		const inFlightWhilePreparing = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		requestOptionsBarrier.complete();
		await sendPromise;

		assert.deepStrictEqual({
			eventsWhilePreparingRequest,
			inFlightWhilePreparing,
			inFlightAfterSend: service.getInFlightNewSessionRequests(),
			events,
			createMetadata,
		}, {
			eventsWhilePreparingRequest: ['create', 'start:Fetching pull request...', 'show:s1', 'prepare', 'configure'],
			inFlightWhilePreparing: ['s1'],
			inFlightAfterSend: [],
			events: ['create', 'start:Fetching pull request...', 'show:s1', 'prepare', 'configure', 'clear', 'send:prepared'],
			createMetadata: { github: { pullRequestUrl: 'https://github.com/owner/repo/pull/42' } },
		});
	});

	test('createAndSendNewChatRequest clears request activity when already cancelled', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		let requestOptionsResolved = false;
		let activityCleared = 0;
		let deleted = 0;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace {
				return {
					uri: URI.parse('test:///folder'),
					label: 'Test',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				};
			}
			override startNewSessionRequest() {
				return { dispose: () => activityCleared++ };
			}
			override deleteNewSession(): void {
				deleted++;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await assert.rejects(service.createAndSendNewChatRequest(URI.parse('test:///folder'), {
			kind: 'deferred',
			activity: 'Fetching pull request...',
			async resolve() {
				requestOptionsResolved = true;
				return { query: 'prepared' };
			},
		}, undefined, CancellationToken.Cancelled), /Canceled/);

		assert.deepStrictEqual({
			requestOptionsResolved,
			activityCleared,
			deleted,
		}, {
			requestOptionsResolved: false,
			activityCleared: 1,
			deleted: 1,
		});
	});

	test('createAndSendNewChatRequest disposes the draft when request activity startup fails', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		let deleted = 0;
		const provider = new class extends TestSessionsProvider {
			override getSessions(): ISession[] {
				return [];
			}
			override resolveWorkspace(): ISessionWorkspace {
				return {
					uri: URI.parse('test:///folder'),
					label: 'Test',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				};
			}
			override startNewSessionRequest(): never {
				throw new Error('start failed');
			}
			override deleteNewSession(): void {
				deleted++;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await assert.rejects(service.createAndSendNewChatRequest(URI.parse('test:///folder'), {
			kind: 'deferred',
			activity: 'Fetching pull request...',
			async resolve() {
				return { query: 'prepared' };
			},
		}), /start failed/);

		assert.deepStrictEqual({
			deleted,
			session: service.getSession(session.resource),
		}, {
			deleted: 1,
			session: undefined,
		});
	});

	test('createAndSendNewChatRequest refuses an untrusted required workspace before creating a session', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const folderUri = URI.parse('test:///folder');
		let resolveCount = 0;
		let createCount = 0;
		let sendCount = 0;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(uri: URI): ISessionWorkspace {
				resolveCount++;
				return {
					uri,
					label: 'Test',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: true,
					isVirtualWorkspace: false,
				};
			}
			override createNewSession(): ISession {
				createCount++;
				return session;
			}
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				sendCount++;
				return session;
			}
		}(session);
		const workspaceTrustManagementService = new TestWorkspaceTrustManagementService();
		workspaceTrustManagementService.trusted = false;
		const { service } = createSessionsManagementService(session, disposables, provider, workspaceTrustManagementService);

		await assert.rejects(
			service.createAndSendNewChatRequest(folderUri, { query: 'hi' }),
			WorkspaceNotTrustedError,
		);
		workspaceTrustManagementService.trusted = true;
		await service.createAndSendNewChatRequest(folderUri, { query: 'hi' });

		assert.deepStrictEqual({
			requestedUris: workspaceTrustManagementService.requestedUris.map(uri => uri.toString()),
			resolveCount,
			createCount,
			sendCount,
		}, {
			requestedUris: [folderUri.toString(), folderUri.toString()],
			resolveCount: 2,
			createCount: 1,
			sendCount: 1,
		});
	});

	test('target availability requires the requested provider and session type to be advertised', () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const availableFolder = URI.parse('test:///available');
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override readonly sessionTypes: readonly ISessionType[] = [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'workspace-agent', label: 'Workspace Agent', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick-agent', label: 'Quick Agent', icon: Codicon.vm },
			];
			override resolveWorkspace(folderUri: URI): ISessionWorkspace | undefined {
				return extUriBiasedIgnorePathCase.isEqual(folderUri, availableFolder) ? { folderUri } as unknown as ISessionWorkspace : undefined;
			}
			override getSessionTypes(folderUri: URI): ISessionType[] {
				return extUriBiasedIgnorePathCase.isEqual(folderUri, availableFolder) ? [this.sessionTypes[0]] : [];
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		assert.deepStrictEqual({
			defaultWorkspace: service.isNewSessionTargetAvailable(availableFolder),
			exactWorkspace: service.isNewSessionTargetAvailable(availableFolder, { providerId: 'test', sessionTypeId: 'workspace-agent' }),
			wrongWorkspaceType: service.isNewSessionTargetAvailable(availableFolder, { providerId: 'test', sessionTypeId: 'quick-agent' }),
			missingWorkspace: service.isNewSessionTargetAvailable(URI.parse('test:///missing')),
			exactQuickChat: service.isQuickChatTargetAvailable({ providerId: 'test', sessionTypeId: 'quick-agent' }),
			wrongQuickChatProvider: service.isQuickChatTargetAvailable({ providerId: 'other', sessionTypeId: 'quick-agent' }),
		}, {
			defaultWorkspace: true,
			exactWorkspace: true,
			wrongWorkspaceType: false,
			missingWorkspace: false,
			exactQuickChat: true,
			wrongQuickChatProvider: false,
		});
	});

	test('createNewSession rejects a pinned session type that is not advertised', () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(folderUri: URI): ISessionWorkspace {
				return { folderUri } as unknown as ISessionWorkspace;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		assert.throws(
			() => service.createNewSession(URI.parse('test:///folder'), { providerId: 'test', sessionTypeId: 'missing' }),
			/does not advertise session type 'missing'/,
		);
	});

	test('inheritableSessionTarget drops a harness the folder no longer offers', () => {
		const folderUri = URI.parse('test:///folder');
		// The provider still resolves the folder (its existing sessions stay
		// usable) but no longer advertises the type they were created with.
		const hiddenHarnessSession = stubSession({ sessionId: 's1', providerId: 'test', sessionType: 'copilotcli' });
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(_folderUri: URI): ISessionWorkspace {
				return { folderUri: _folderUri } as unknown as ISessionWorkspace;
			}
			override getSessionTypes(): ISessionType[] {
				return [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'test', label: 'Test', icon: Codicon.vm }];
			}
		}(hiddenHarnessSession);
		const { service } = createSessionsManagementService(hiddenHarnessSession, disposables, provider);

		const stillOfferedSession = stubSession({ sessionId: 's2', providerId: 'test', sessionType: 'test' });

		assert.deepStrictEqual({
			hiddenHarness: inheritableSessionTarget(service, hiddenHarnessSession, folderUri),
			offeredHarness: inheritableSessionTarget(service, stillOfferedSession, folderUri),
			noFolder: inheritableSessionTarget(service, stillOfferedSession, undefined),
			noSession: inheritableSessionTarget(service, undefined, folderUri),
		}, {
			hiddenHarness: {},
			offeredHarness: { providerId: 'test', sessionTypeId: 'test' },
			noFolder: {},
			noSession: {},
		});
	});

	test('a New Session gesture whose harness is hidden still creates on the fallback provider', async () => {
		// End-to-end shape of the Agents-window bug: an extension-host session is
		// open, its harness has since been hidden (`hideExtensionHost`), and the
		// user presses New. The gesture spreads `inheritableSessionTarget` into
		// the options, so this also covers the empty-target path at a call site.
		const folderUri = URI.parse('test:///folder');
		const extHostSession = stubSession({ sessionId: 'exthost-1', providerId: 'copilot', sessionType: 'copilotcli' });
		const created: { providerId: string; sessionTypeId: string }[] = [];

		// Still resolves the folder (its existing sessions stay usable) but
		// advertises nothing for it.
		const copilot = new class extends TestSessionsProvider {
			override readonly id = 'copilot';
			override readonly order = 0;
			override readonly sessionTypes: readonly ISessionType[] = [];
			override resolveWorkspace(_folderUri: URI): ISessionWorkspace { return { folderUri: _folderUri } as unknown as ISessionWorkspace; }
			override getSessionTypes(): ISessionType[] { return []; }
			override getSessions(): ISession[] { return [extHostSession]; }
		}(extHostSession);

		// The agent host sorts first.
		const agentHostSession = stubSession({ sessionId: 'ah-draft', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: 'copilotcli' });
		const agentHost = new class extends TestSessionsProvider {
			override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly order = -1;
			override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'copilotcli', label: 'Copilot', icon: Codicon.vm }];
			override resolveWorkspace(_folderUri: URI): ISessionWorkspace { return { folderUri: _folderUri } as unknown as ISessionWorkspace; }
			override getSessionTypes(): ISessionType[] { return [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'copilotcli', label: 'Copilot', icon: Codicon.vm }]; }
			override getSessions(): ISession[] { return []; }
			override createNewSession(_folderUri: URI, sessionTypeId: string): ISession {
				created.push({ providerId: this.id, sessionTypeId });
				return agentHostSession;
			}
		}(agentHostSession);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([copilot, agentHost]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new TestChatService());
		instantiationService.stub(IWorkspaceTrustRequestService, new class extends mock<IWorkspaceTrustRequestService>() {
			override async requestResourcesTrust(): Promise<boolean> { return true; }
		});

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);
		await view.openSession(extHostSession.resource);

		const active = view.activeSession.get();
		const result = await view.openNewSession({
			folderUri,
			...inheritableSessionTarget(service, active, folderUri),
		});

		assert.deepStrictEqual({
			created,
			resultProviderId: result.session?.providerId,
			trustDeclined: result.trustDeclined,
		}, {
			created: [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli' }],
			resultProviderId: LOCAL_AGENT_HOST_PROVIDER_ID,
			trustDeclined: false,
		});
	});

	test('createAndSendQuickChatRequest uses the quick-chat contract without navigation or repository configuration', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///quick-chat') };
		const activeSession = stubSession({ sessionId: 'active', providerId: 'test' });
		const quickChat = stubSession({
			sessionId: 'quick-1',
			providerId: 'test',
			isQuickChat: constObservable(true),
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override getSessions(): ISession[] { return [activeSession]; }
			override createQuickChat(sessionTypeId: string): ISession {
				calls.push(`createQuickChat:${sessionTypeId}`);
				return quickChat;
			}
			override setModel(_sessionId: string, _chatResource: URI, modelId: string): void { calls.push(`setModel:${modelId}`); }
			override setIsolationMode(): never { throw new Error('isolation should not be configured'); }
			override setBranch(): never { throw new Error('branch should not be configured'); }
			override async sendRequest(): Promise<ISession> {
				calls.push('send');
				return quickChat;
			}
		}(quickChat);
		const { service, view } = createSessionsManagementService(activeSession, disposables, provider);
		await view.openSession(activeSession.resource);

		const result = await service.createAndSendQuickChatRequest({ query: 'hi' }, {
			providerId: 'test',
			sessionTypeId: 'test',
			modelId: 'gpt-4o',
			isolationMode: 'worktree',
			branch: 'stale',
		});

		assert.deepStrictEqual({
			sessionId: result?.sessionId,
			activeSession: view.activeSession.get()?.sessionId,
			newSession: service.newSession.get(),
			calls,
		}, {
			sessionId: 'quick-1',
			activeSession: 'active',
			newSession: undefined,
			calls: ['createQuickChat:test', 'setModel:gpt-4o', 'send'],
		});
	});

	test('createAndSendQuickChatRequest cancels commit detection and disposes the provisional draft', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///quick-chat') };
		const session = stubSession({
			sessionId: 'quick-1',
			providerId: 'test',
			isQuickChat: constObservable(true),
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const sendStarted = new DeferredPromise<void>();
		const sendDone = new DeferredPromise<void>();
		const sendReturned = new DeferredPromise<void>();
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override createQuickChat(): ISession { return session; }
			override deleteNewSession(): void { deleted = true; }
			override async sendRequest(): Promise<ISession> {
				await sendStarted.complete();
				await sendDone.p;
				await sendReturned.complete();
				return session;
			}
		}(session);
		const { service, chatService } = createSessionsManagementService(session, disposables, provider);
		const cts = disposables.add(new CancellationTokenSource());
		let started = 0;
		let sent = 0;
		disposables.add(service.onDidStartSession(() => started++));
		disposables.add(service.onDidSendRequest(() => sent++));

		const request = service.createAndSendQuickChatRequest({ query: 'hi' }, {
			providerId: 'test',
			sessionTypeId: 'test',
		}, cts.token);
		await sendStarted.p;
		cts.cancel();

		await assert.rejects(request, /Canceled/);
		assert.strictEqual(deleted, true);
		await sendDone.complete();
		await sendReturned.p;
		await Promise.resolve();
		await Promise.resolve();
		assert.deepStrictEqual({
			cancelledResources: chatService.cancelledResources.map(resource => resource.toString()),
			started,
			sent,
		}, {
			cancelledResources: [chat.resource.toString()],
			started: 0,
			sent: 0,
		});
	});

	test('createAndSendNewChatRequest invokes configuration setters from createOptions', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const calls: string[] = [];
		let sentOptions: ISendRequestOptions | undefined;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override setModel(_sessionId: string, _chatResource: URI, _modelId: string): void { calls.push(`setModel:${_modelId}`); }
			override setMode(_sessionId: string, _modeId: string): void { calls.push(`setMode:${_modeId}`); }
			override setPermissionLevel(_sessionId: string, _level: string): void { calls.push(`setPermissionLevel:${_level}`); }
			override async setIsolationMode(_sessionId: string, _mode: string): Promise<void> { calls.push(`setIsolationMode:${_mode}`); }
			override async setBranch(_sessionId: string, _branch: string): Promise<void> { calls.push(`setBranch:${_branch}`); }
			override async setWorktreeBranchTrack(_sessionId: string, _enabled: boolean): Promise<void> { calls.push(`setWorktreeBranchTrack:${_enabled}`); }
			override async setWorktreeCreateNewBranch(_sessionId: string, _enabled: boolean): Promise<void> { calls.push(`setWorktreeCreateNewBranch:${_enabled}`); }
			override async sendRequest(_sessionId: string, _chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
				sentOptions = options;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const createOptions: ICreateNewSessionOptions = {
			modelId: 'gpt-4o',
			modeId: 'agent',
			permissionLevel: 'allowedTools',
			isolationMode: 'worktree',
			worktreeBranchTrack: false,
			worktreeCreateNewBranch: true,
			branch: 'main',
		};
		const result = await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi', title: 'Pull Request', hideFromTranscript: true }, createOptions);

		assert.deepStrictEqual({
			sessionId: result?.sessionId,
			calls,
			sentOptions,
		}, {
			sessionId: 's1',
			calls: [
				'setModel:gpt-4o',
				'setMode:agent',
				'setPermissionLevel:allowedTools',
				'setIsolationMode:worktree',
				'setWorktreeBranchTrack:false',
				'setWorktreeCreateNewBranch:true',
				'setBranch:main',
			],
			sentOptions: { query: 'hi', title: 'Pull Request', hideFromTranscript: true },
		});
	});

	test('createAndSendNewChatRequest prefers atomic worktree configuration', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override getSessions(): ISession[] { return []; }
			override async setWorktreeConfiguration(_sessionId: string, configuration: ISessionWorktreeConfiguration): Promise<void> {
				calls.push(`setWorktreeConfiguration:${JSON.stringify(configuration)}`);
			}
			override async setIsolationMode(): Promise<void> { calls.push('setIsolationMode'); }
			override async setWorktreeBranchTrack(): Promise<void> { calls.push('setWorktreeBranchTrack'); }
			override async setBranch(): Promise<void> { calls.push('setBranch'); }
		}(session);
		const { service, view } = createSessionsManagementService(session, disposables, provider);

		await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			isolationMode: 'worktree',
			worktreeBranchTrack: true,
			worktreeCreateNewBranch: false,
			branch: 'feature',
			onSessionCreated: created => {
				calls.push(`created:${created.sessionId}:${service.getSession(created.resource)?.sessionId}`);
				void view.openSession(created.resource);
			},
		});

		assert.deepStrictEqual({
			calls,
			activeSession: view.activeSession.get()?.sessionId,
		}, {
			calls: [
				'created:s1:s1',
				'setWorktreeConfiguration:{"isolationMode":"worktree","worktreeBranchTrack":true,"worktreeCreateNewBranch":false,"branch":"feature"}',
			],
			activeSession: 's1',
		});
	});

	test('createAndSendNewChatRequest skips providers without worktree configuration support', async () => {
		const cloudSession = stubSession({ sessionId: 'cloud', providerId: 'cloud' });
		const localSession = stubSession({ sessionId: 'local', providerId: 'local' });
		const cloudProvider = new class extends TestSessionsProvider {
			override readonly id = 'cloud';
			override readonly order = 0;
			override readonly sessionTypes: readonly ISessionType[] = [{ id: 'cloud', label: 'Cloud', icon: Codicon.cloud, supportsWorktreeConfiguration: false, authRequirement: SessionTypeAuthRequirement.None }];
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
		}(cloudSession);
		let configuredBranch: string | undefined;
		const localProvider = new class extends TestSessionsProvider {
			override readonly id = 'local';
			override readonly order = 1;
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async setWorktreeConfiguration(_sessionId: string, configuration: ISessionWorktreeConfiguration): Promise<void> {
				configuredBranch = configuration.branch;
			}
		}(localSession);
		const { service } = createSessionsManagementService(localSession, disposables, [cloudProvider, localProvider]);

		const result = await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			isolationMode: 'worktree',
			worktreeBranchTrack: true,
			branch: 'feature',
		});

		assert.deepStrictEqual({
			providerId: result?.providerId,
			configuredBranch,
		}, {
			providerId: 'local',
			configuredBranch: 'feature',
		});
	});

	test('createAndSendNewChatRequest uses an immediately resolved model identifier', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const resolvedModel: ILanguageModelChatMetadataAndIdentifier = {
			identifier: 'target:gpt-4o',
			metadata: {
				extension: nullExtensionDescription.identifier,
				name: 'GPT-4o',
				vendor: 'target',
				family: 'gpt-4o',
				version: '1',
				id: 'gpt-4o',
				maxInputTokens: 100,
				maxOutputTokens: 100,
				isDefaultForLocation: {},
			},
		};
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(folderUri: URI): ISessionWorkspace { return { folderUri } as unknown as ISessionWorkspace; }
			override getModelsSnapshot(): ISessionModelsSnapshot {
				return { models: [resolvedModel], desiredModelResolution: { kind: 'available', model: resolvedModel }, modelTarget: 'target' };
			}
			override setModel(_sessionId: string, _chatResource: URI, modelId: string): void { calls.push(`setModel:${modelId}`); }
			override async sendRequest(): Promise<ISession> {
				calls.push('send');
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { modelId: 'legacy/gpt-4o' });

		assert.deepStrictEqual(calls, ['setModel:target:gpt-4o', 'send']);
	});

	test('createAndSendNewChatRequest waits for and uses the resolved model identifier', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const onDidChangeModels = disposables.add(new Emitter<void>());
		let resolution: ISessionModelsSnapshot['desiredModelResolution'] = { kind: 'pending', identifier: 'target:gpt-4o' };
		const calls: string[] = [];
		const model: ILanguageModelChatMetadataAndIdentifier = {
			identifier: 'target:gpt-4o',
			metadata: {
				extension: nullExtensionDescription.identifier,
				name: 'GPT-4o',
				vendor: 'target',
				family: 'gpt-4o',
				version: '1',
				id: 'gpt-4o',
				maxInputTokens: 100,
				maxOutputTokens: 100,
				isDefaultForLocation: {},
			},
		};
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeModels = onDidChangeModels.event;
			override resolveWorkspace(folderUri: URI): ISessionWorkspace { return { folderUri } as unknown as ISessionWorkspace; }
			override getModelsSnapshot(): ISessionModelsSnapshot { return { models: [], desiredModelResolution: resolution, modelTarget: undefined }; }
			override setModel(_sessionId: string, _chatResource: URI, modelId: string): void { calls.push(`setModel:${modelId}`); }
			override async sendRequest(): Promise<ISession> {
				calls.push('send');
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { modelId: 'legacy/gpt-4o' });
		await Promise.resolve();
		assert.deepStrictEqual(calls, []);

		resolution = { kind: 'available', model };
		onDidChangeModels.fire();
		await request;

		assert.deepStrictEqual(calls, ['setModel:target:gpt-4o', 'send']);
	});

	test('createAndSendNewChatRequest rejects a pending model that becomes unavailable and disposes the draft', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const onDidChangeModels = disposables.add(new Emitter<void>());
		let resolution: ISessionModelsSnapshot['desiredModelResolution'] = { kind: 'pending', identifier: 'removed-model' };
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeModels = onDidChangeModels.event;
			override resolveWorkspace(folderUri: URI): ISessionWorkspace { return { folderUri } as unknown as ISessionWorkspace; }
			override getModelsSnapshot(): ISessionModelsSnapshot {
				return { models: [], desiredModelResolution: resolution, modelTarget: undefined };
			}
			override setModel(): never { throw new Error('setModel should not be called'); }
			override deleteNewSession(): void { deleted = true; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { modelId: 'removed-model' });
		await Promise.resolve();
		resolution = { kind: 'unavailable', identifier: 'removed-model' };
		onDidChangeModels.fire();

		await assert.rejects(request, /Model 'removed-model' is unavailable/);
		assert.strictEqual(deleted, true);
	});

	test('createAndSendNewChatRequest rejects when the workspace stops advertising the session type', async () => {
		const folderUri = URI.parse('test:///folder');
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const onDidChangeSessionTypes = disposables.add(new Emitter<void>());
		let folderTypeAvailable = true;
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessionTypes = onDidChangeSessionTypes.event;
			override resolveWorkspace(): ISessionWorkspace { return { uri: folderUri } as ISessionWorkspace; }
			override getSessionTypes(candidate: URI): ISessionType[] {
				return folderTypeAvailable && extUriBiasedIgnorePathCase.isEqual(candidate, folderUri) ? [...this.sessionTypes] : [];
			}
			override getModelsSnapshot(): ISessionModelsSnapshot {
				return { models: [], desiredModelResolution: { kind: 'pending', identifier: 'gpt-4o' }, modelTarget: undefined };
			}
			override deleteNewSession(): void { deleted = true; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const request = service.createAndSendNewChatRequest(folderUri, { query: 'hi' }, { modelId: 'gpt-4o' });
		await Promise.resolve();
		folderTypeAvailable = false;
		onDidChangeSessionTypes.fire();

		await assert.rejects(request, /Session type 'test' is no longer available/);
		assert.strictEqual(deleted, true);
	});

	test('createAndSendNewChatRequest cancels while waiting for model resolution and disposes the draft', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const onDidChangeModels = disposables.add(new Emitter<void>());
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeModels = onDidChangeModels.event;
			override resolveWorkspace(folderUri: URI): ISessionWorkspace { return { folderUri } as unknown as ISessionWorkspace; }
			override getModelsSnapshot(): ISessionModelsSnapshot {
				return { models: [], desiredModelResolution: { kind: 'pending', identifier: 'gpt-4o' }, modelTarget: undefined };
			}
			override deleteNewSession(): void { deleted = true; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const cts = disposables.add(new CancellationTokenSource());

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { modelId: 'gpt-4o' }, cts.token);
		await Promise.resolve();
		cts.cancel();

		await assert.rejects(request, /Canceled/);
		assert.strictEqual(deleted, true);
	});

	test('createAndSendNewChatRequest awaits asynchronous repository configuration setters', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const isolationDone = new DeferredPromise<void>();
		const branchTrackStarted = new DeferredPromise<void>();
		const branchTrackDone = new DeferredPromise<void>();
		const branchStarted = new DeferredPromise<void>();
		const branchDone = new DeferredPromise<void>();
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async setIsolationMode(): Promise<void> {
				calls.push('isolation:start');
				await isolationDone.p;
				calls.push('isolation:end');
			}
			override async setWorktreeBranchTrack(): Promise<void> {
				calls.push('branchTrack:start');
				await branchTrackStarted.complete();
				await branchTrackDone.p;
				calls.push('branchTrack:end');
			}
			override async setBranch(): Promise<void> {
				calls.push('branch:start');
				await branchStarted.complete();
				await branchDone.p;
				calls.push('branch:end');
			}
			override async sendRequest(): Promise<ISession> {
				calls.push('send');
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			isolationMode: 'worktree',
			worktreeBranchTrack: false,
			branch: 'main',
		});
		await Promise.resolve();
		assert.deepStrictEqual(calls, ['isolation:start']);

		await isolationDone.complete();
		await branchTrackStarted.p;
		assert.deepStrictEqual(calls, ['isolation:start', 'isolation:end', 'branchTrack:start']);

		await branchTrackDone.complete();
		await branchStarted.p;
		assert.deepStrictEqual(calls, ['isolation:start', 'isolation:end', 'branchTrack:start', 'branchTrack:end', 'branch:start']);

		await branchDone.complete();
		await request;
		assert.deepStrictEqual(calls, ['isolation:start', 'isolation:end', 'branchTrack:start', 'branchTrack:end', 'branch:start', 'branch:end', 'send']);
	});

	test('createAndSendNewChatRequest cancels pending repository configuration and disposes the draft', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const configurationDone = new DeferredPromise<void>();
		let deleted = false;
		let sent = false;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async setIsolationMode(): Promise<void> {
				await configurationDone.p;
			}
			override deleteNewSession(): void {
				deleted = true;
			}
			override async sendRequest(): Promise<ISession> {
				sent = true;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const cts = disposables.add(new CancellationTokenSource());

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			isolationMode: 'worktree',
			branch: 'main',
		}, cts.token);
		await Promise.resolve();
		cts.cancel();

		await assert.rejects(request, /Canceled/);
		assert.deepStrictEqual({ deleted, sent }, { deleted: true, sent: false });
		await configurationDone.complete();
	});

	test('createAndSendNewChatRequest cancels a pending send and disposes the draft', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const sendDone = new DeferredPromise<void>();
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override deleteNewSession(): void {
				deleted = true;
			}
			override async sendRequest(): Promise<ISession> {
				await sendDone.p;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const cts = disposables.add(new CancellationTokenSource());

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, undefined, cts.token);
		await Promise.resolve();
		cts.cancel();

		await assert.rejects(request, /Canceled/);
		assert.strictEqual(deleted, true);
		await sendDone.complete();
	});

	test('createAndSendNewChatRequest rejects worktree configuration for unsupported session types', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		let created = false;
		let sent = false;
		const provider = new class extends TestSessionsProvider {
			override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'test', label: 'Test', icon: Codicon.vm }];
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override createNewSession(): ISession {
				created = true;
				return session;
			}
			override async sendRequest(): Promise<ISession> {
				sent = true;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await assert.rejects(
			() => service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
				isolationMode: 'worktree',
				branch: 'legacy-branch',
			}),
			/No sessions provider supports worktree configuration/,
		);

		assert.deepStrictEqual({ created, sent }, { created: false, sent: false });
	});

	test('createAndSendNewChatRequest permits folder isolation for unsupported worktree session types', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		let sent = false;
		const provider = new class extends TestSessionsProvider {
			override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'test', label: 'Test', icon: Codicon.vm }];
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async sendRequest(): Promise<ISession> {
				sent = true;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const result = await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			isolationMode: 'workspace',
		});

		assert.deepStrictEqual({ providerId: result?.providerId, sent }, { providerId: 'test', sent: true });
	});

	test('createAndSendNewChatRequest disposes stranded draft when a setter throws', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override setModel(): void { throw new Error('model not found'); }
			override deleteNewSession(): void { deleted = true; }
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> { return session; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await assert.rejects(
			() => service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { modelId: 'bad' }),
			/model not found/,
		);
		assert.strictEqual(deleted, true);
	});

	test('createAndSendNewChatRequest returns undefined when service is disposed mid-send', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const serviceRef: { current?: ISessionsManagementService } = {};
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				// Dispose the service while the send is in-flight.
				(serviceRef.current as unknown as { dispose(): void }).dispose();
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		serviceRef.current = service;

		const result = await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' });
		assert.strictEqual(result, undefined);
	});

	test('discardNewSession fires onDidDiscardNewSession with the discarded draft', () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const discarded: string[] = [];
		disposables.add(service.onDidDiscardNewSession(s => discarded.push(s.sessionId)));

		// Establish a pending draft, then abandon it.
		service.createNewSession(URI.parse('test:///folder'));
		service.discardNewSession();

		assert.deepStrictEqual(discarded, ['s1']);
	});

	test('createNewSession fires replacement before publishing the new draft', () => {
		const drafts = [
			stubSession({ sessionId: 's1', providerId: 'test' }),
			stubSession({ sessionId: 's2', providerId: 'test' }),
		];
		const deleted: string[] = [];
		let createIndex = 0;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override createNewSession(): ISession { return drafts[createIndex++]; }
			override deleteNewSession(sessionId: string): void { deleted.push(sessionId); }
		}(drafts[0]);
		const { service } = createSessionsManagementService(drafts[0], disposables, provider);

		const replacements: { from: string; to: string; currentDraft: string | undefined }[] = [];
		disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => {
			replacements.push({ from: from.sessionId, to: to.sessionId, currentDraft: service.newSession.get()?.sessionId });
		}));

		service.createNewSession(URI.parse('test:///folder'));
		service.createNewSession(URI.parse('test:///folder'));

		assert.deepStrictEqual({
			replacements,
			deleted,
			currentDraft: service.newSession.get()?.sessionId,
		}, {
			replacements: [{ from: 's1', to: 's2', currentDraft: 's1' }],
			deleted: ['s1'],
			currentDraft: 's2',
		});
	});

	test('createNewSession keeps the previous draft when replacement creation fails', () => {
		const draft = stubSession({ sessionId: 's1', providerId: 'test' });
		let createCount = 0;
		const deleted: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override createNewSession(): ISession {
				if (createCount++ > 0) {
					throw new Error('create failed');
				}
				return draft;
			}
			override deleteNewSession(sessionId: string): void { deleted.push(sessionId); }
		}(draft);
		const { service } = createSessionsManagementService(draft, disposables, provider);
		const replacements: string[] = [];
		disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => replacements.push(`${from.sessionId}->${to.sessionId}`)));

		service.createNewSession(URI.parse('test:///folder'));
		assert.throws(() => service.createNewSession(URI.parse('test:///folder')), /create failed/);

		assert.deepStrictEqual({
			currentDraft: service.newSession.get()?.sessionId,
			replacements,
			deleted,
		}, {
			currentDraft: 's1',
			replacements: [],
			deleted: [],
		});
	});

	test('automation draft lifecycle is isolated from the new-session draft', () => {
		const drafts = [
			stubSession({ sessionId: 'automation-workspace', providerId: 'test' }),
			stubSession({ sessionId: 'new-session', providerId: 'test' }),
			stubSession({ sessionId: 'automation-quick-chat', providerId: 'test' }),
			stubSession({ sessionId: 'automation-replacement', providerId: 'test' }),
		];
		const deleted: string[] = [];
		let createIndex = 0;
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override resolveWorkspace(folderUri: URI): ISessionWorkspace {
				return {
					uri: folderUri,
					label: 'Workspace',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				};
			}
			override createNewSession(): ISession { return drafts[createIndex++]; }
			override createQuickChat(): ISession { return drafts[createIndex++]; }
			override deleteNewSession(sessionId: string): void { deleted.push(sessionId); }
		}(drafts[0]);
		const { service } = createSessionsManagementService(drafts[0], disposables, provider);
		const folderUri = URI.parse('test:///folder');

		const firstAutomationSession = service.createAutomationSession(folderUri);
		service.createNewSession(folderUri);
		service.createAutomationQuickChat();
		service.discardAutomationSession(firstAutomationSession);
		service.createAutomationSession(folderUri);
		service.discardAutomationSession();

		assert.deepStrictEqual({
			newSession: service.newSession.get()?.sessionId,
			automationSession: service.automationSession.get()?.sessionId,
			deleted,
		}, {
			newSession: 'new-session',
			automationSession: undefined,
			deleted: ['automation-workspace', 'automation-quick-chat', 'automation-replacement'],
		});
	});

	test('sendNewChatRequest clears the draft without firing onDidDiscardNewSession', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		let discardCount = 0;
		disposables.add(service.onDidDiscardNewSession(() => discardCount++));

		// Sending the composed draft graduates it into the list rather than
		// discarding it, so the discard event must not fire.
		const draft = service.createNewSession(URI.parse('test:///folder'));
		await service.sendNewChatRequest(draft, { query: 'hi' });

		assert.strictEqual(discardCount, 0);
	});

	test('getAllSessionTypes orders providers by their order property (lower first)', () => {
		const service = createOrderedTypesService(disposables, 0, 1);
		assert.deepStrictEqual(service.getAllSessionTypes().map(type => type.id), ['copilot', 'agent-host']);
	});

	test('getAllSessionTypes surfaces local agent host types first when it has lower order', () => {
		const service = createOrderedTypesService(disposables, 0, -1);
		assert.deepStrictEqual(service.getAllSessionTypes().map(type => type.id), ['agent-host', 'copilot']);
	});

	test('replacing the active session promotes the committed session to active', async () => {
		const draft = stubSession({ sessionId: 'draft', providerId: 'test' });
		const committed = stubSession({ sessionId: 'committed', providerId: 'test' });
		const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			constructor() { super(draft); }
			override getSessions(): ISession[] { return [draft, committed]; }
		};
		const { view } = createSessionsManagementService(draft, disposables, provider);

		// Open the draft so it becomes the active session.
		await view.openSession(draft.resource);
		assert.strictEqual(view.activeSession.get()?.sessionId, 'draft');

		// The provider atomically replaces the draft with a committed session
		// (e.g. after the first turn). The complete flow must: swap the visible
		// grid slot, make the committed session active in the view, and update
		// the canonical active session in the management service.
		onDidReplaceSession.fire({ from: draft, to: committed });

		assert.deepStrictEqual({
			visible: view.visibleSessions.get().map(s => s?.sessionId ?? null),
			active: view.activeSession.get()?.sessionId ?? null,
		}, {
			visible: ['committed'],
			active: 'committed',
		});
	});

	test('replacing the active session in place (same id, new resource) re-points the active session', async () => {
		const before = stubSession({ sessionId: 'same', providerId: 'test', resource: URI.parse('test:///before') });
		const after = stubSession({ sessionId: 'same', providerId: 'test', resource: URI.parse('test:///after') });
		const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			constructor() { super(before); }
			override getSessions(): ISession[] { return [before]; }
		};
		const { view } = createSessionsManagementService(before, disposables, provider);

		await view.openSession(before.resource);
		assert.strictEqual(view.activeSession.get()?.resource.toString(), before.resource.toString());

		// A same-id replacement still needs to force the active session update
		// so consumers observe the new resource.
		onDidReplaceSession.fire({ from: before, to: after });

		assert.strictEqual(view.activeSession.get()?.resource.toString(), after.resource.toString());
	});

	test('replacing a non-active session leaves the active session unchanged', async () => {
		const active = stubSession({ sessionId: 'active', providerId: 'test' });
		const draft = stubSession({ sessionId: 'draft', providerId: 'test' });
		const committed = stubSession({ sessionId: 'committed', providerId: 'test' });
		const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			constructor() { super(active); }
			override getSessions(): ISession[] { return [active, draft, committed]; }
		};
		const { view } = createSessionsManagementService(active, disposables, provider);

		// Open `active` and add `draft` to the grid alongside it without
		// activating, so `draft` is visible but not the active session.
		await view.openSession(active.resource);
		view.insertAt(draft, 'active', 'right', false);
		assert.strictEqual(view.activeSession.get()?.sessionId, 'active');

		// Replacing the non-active `draft` swaps its grid slot to `committed`
		// but must not hijack the active session.
		onDidReplaceSession.fire({ from: draft, to: committed });

		assert.deepStrictEqual({
			visible: view.visibleSessions.get().map(s => s?.sessionId ?? null),
			active: view.activeSession.get()?.sessionId ?? null,
		}, {
			visible: ['active', 'committed'],
			active: 'active',
		});
	});

	test('opens a session and targeted chat to the side', async () => {
		const firstChat = { ...stubChat, resource: URI.parse('test:///first/main') };
		const targetMain = { ...stubChat, resource: URI.parse('test:///target/main') };
		const targetPeer = { ...stubChat, resource: URI.parse('test:///target/peer') };
		const first = stubSession({ sessionId: 'first', providerId: 'test', chats: constObservable([firstChat]), mainChat: constObservable(firstChat) });
		const target = stubSession({ sessionId: 'target', providerId: 'test', chats: constObservable([targetMain, targetPeer]), mainChat: constObservable(targetMain) });
		const provider = new class extends TestSessionsProvider {
			constructor() { super(first); }
			override getSessions(): ISession[] { return [first, target]; }
		};
		const { view } = createSessionsManagementService(first, disposables, provider);
		await view.openSession(first.resource);

		await view.openSessionToSide(target, { chatResource: targetPeer.resource });

		assert.deepStrictEqual({
			visible: view.visibleSessions.get().map(session => session?.sessionId),
			activeSession: view.activeSession.get()?.sessionId,
			activeChat: view.activeSession.get()?.activeChat.get().resource.toString(),
		}, {
			visible: ['first', 'target'],
			activeSession: 'target',
			activeChat: targetPeer.resource.toString(),
		});
	});

	test('replacing a session only swaps the active session when it matches `from`', async () => {
		const a = stubSession({ sessionId: 'a', providerId: 'test' });
		const b = stubSession({ sessionId: 'b', providerId: 'test' });
		const other = stubSession({ sessionId: 'other', providerId: 'test' });
		const onDidReplaceSession = disposables.add(new Emitter<{ from: ISession; to: ISession }>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			constructor() { super(a); }
			override getSessions(): ISession[] { return [a, b, other]; }
		};
		const { view } = createSessionsManagementService(a, disposables, provider);

		await view.openSession(a.resource);
		assert.strictEqual(view.activeSession.get()?.sessionId, 'a');

		// `from` does not match the active session: active stays put.
		onDidReplaceSession.fire({ from: other, to: b });
		assert.strictEqual(view.activeSession.get()?.sessionId, 'a');

		// `from` matches the active session: active is replaced with `to`.
		onDidReplaceSession.fire({ from: a, to: b });
		assert.strictEqual(view.activeSession.get()?.sessionId, 'b');
	});

	suite('deleteSessions', () => {

		class RecordingProvider extends TestSessionsProvider {
			readonly deleted: string[][] = [];
			constructor(public override readonly id: string, private readonly _fail: boolean, session: ISession) {
				super(session);
			}
			override async deleteSessions(sessionIds: readonly string[]): Promise<void> {
				this.deleted.push([...sessionIds]);
				if (this._fail) {
					throw new Error(`${this.id} failed`);
				}
			}
		}

		function createService(providers: ISessionsProvider[]): ISessionsManagementService {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
			instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(providers));
			instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
			instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
			instantiationService.stub(IProgressService, new TestProgressService());
			instantiationService.stub(IChatService, new class extends mock<IChatService>() {
				override readonly onDidSubmitRequest = Event.None;
			});
			instantiationService.stub(IChatWidgetHistoryService, new class extends mock<IChatWidgetHistoryService>() {
				override moveHistory(): void { }
			});
			return disposables.add(instantiationService.createInstance(SessionsManagementService));
		}

		test('groups sessions by provider and continues when one provider fails (best-effort)', async () => {
			const s1 = stubSession({ sessionId: 's1', providerId: 'p1' });
			const s2 = stubSession({ sessionId: 's2', providerId: 'p2' });
			const failing = new RecordingProvider('p1', true, s1);
			const succeeding = new RecordingProvider('p2', false, s2);
			const service = createService([failing, succeeding]);

			const deleted: string[] = [];
			disposables.add(service.onDidDeleteSession(session => deleted.push(session.sessionId)));

			await assert.rejects(service.deleteSessions([s1, s2]), /p1 failed/);

			assert.deepStrictEqual({
				failingDeleted: failing.deleted,
				succeedingDeleted: succeeding.deleted,
				eventsFired: deleted,
			}, {
				failingDeleted: [['s1']],
				succeedingDeleted: [['s2']],
				eventsFired: ['s2'],
			});
		});
	});

	suite('createNewChatInSession', () => {

		test('reuses an existing untitled chat instead of creating a new one', async () => {
			const untitledChat: IChat = { ...stubChat, resource: URI.parse('test:///untitled'), status: constObservable(SessionStatus.Untitled) };
			const session = stubSession({ sessionId: 'reuse', providerId: 'test', chats: constObservable([untitledChat]) });
			let createNewChatCalls = 0;
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async createNewChat(): Promise<IChat> {
					createNewChatCalls++;
					return stubChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.createNewChatInSession(session);

			assert.deepStrictEqual({
				reused: result === untitledChat,
				createNewChatCalls,
			}, {
				reused: true,
				createNewChatCalls: 0,
			});
		});

		test('asks the provider to create a chat when none are untitled', async () => {
			const activeChat: IChat = { ...stubChat, resource: URI.parse('test:///active'), status: constObservable(SessionStatus.InProgress) };
			const createdChat: IChat = { ...stubChat, resource: URI.parse('test:///created') };
			const session = stubSession({ sessionId: 'create', providerId: 'test', chats: constObservable([activeChat]) });
			let createNewChatCalls = 0;
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async createNewChat(): Promise<IChat> {
					createNewChatCalls++;
					return createdChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.createNewChatInSession(session);

			assert.deepStrictEqual({
				result: result?.resource.toString(),
				createNewChatCalls,
			}, {
				result: createdChat.resource.toString(),
				createNewChatCalls: 1,
			});
		});

		test('forceNew creates a fresh chat even when an untitled one exists', async () => {
			const untitledChat: IChat = { ...stubChat, resource: URI.parse('test:///untitled'), status: constObservable(SessionStatus.Untitled) };
			const createdChat: IChat = { ...stubChat, resource: URI.parse('test:///created') };
			const session = stubSession({ sessionId: 'force-new', providerId: 'test', chats: constObservable([untitledChat]) });
			let createNewChatCalls = 0;
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async createNewChat(): Promise<IChat> {
					createNewChatCalls++;
					return createdChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.createNewChatInSession(session, { forceNew: true });

			assert.deepStrictEqual({
				result: result?.resource.toString(),
				createNewChatCalls,
			}, {
				result: createdChat.resource.toString(),
				createNewChatCalls: 1,
			});
		});

		test('returns undefined when the provider is not found', async () => {
			const session = stubSession({ sessionId: 'orphan', providerId: 'missing-provider' });
			const provider = new TestSessionsProvider(stubSession({ sessionId: 'other', providerId: 'test' }));
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.createNewChatInSession(session);

			assert.strictEqual(result, undefined);
		});
	});

	suite('forkChatInSession', () => {

		test('asks the provider to fork the chat when the session supports multiple chats', async () => {
			const sourceChat = URI.parse('test:///source');
			const forkedChat: IChat = { ...stubChat, resource: URI.parse('test:///forked') };
			const session = stubSession({ sessionId: 'fork', providerId: 'test', capabilities: constObservable({ supportsMultipleChats: true }) });
			let forkChatArgs: readonly [string, URI, string] | undefined;
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async forkChat(sessionId: string, sourceChat: URI, turnId: string): Promise<IChat> {
					forkChatArgs = [sessionId, sourceChat, turnId];
					return forkedChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.forkChatInSession(session, sourceChat, 'turn-1');

			assert.deepStrictEqual({
				result: result.resource.toString(),
				args: forkChatArgs?.map(arg => URI.isUri(arg) ? arg.toString() : arg),
			}, {
				result: forkedChat.resource.toString(),
				args: ['fork', sourceChat.toString(), 'turn-1'],
			});
		});

		test('throws when the provider is not found', async () => {
			const session = stubSession({ sessionId: 'orphan', providerId: 'missing-provider', capabilities: constObservable({ supportsMultipleChats: true }) });
			const provider = new TestSessionsProvider(stubSession({ sessionId: 'other', providerId: 'test' }));
			const { service } = createSessionsManagementService(session, disposables, provider);

			await assert.rejects(() => service.forkChatInSession(session, URI.parse('test:///source'), 'turn-1'), /Provider 'missing-provider' not found/);
		});

		test('throws when the session does not support multiple chats', async () => {
			const session = stubSession({ sessionId: 'single-chat', providerId: 'test', capabilities: constObservable({ supportsMultipleChats: false }) });
			const { service } = createSessionsManagementService(session, disposables);

			await assert.rejects(() => service.forkChatInSession(session, URI.parse('test:///source'), 'turn-1'), /does not support forking into a chat/);
		});
	});

	suite('createSideChatInSession', () => {

		test('asks the provider to create the side chat when the session supports it', async () => {
			const sourceChat = URI.parse('test:///source');
			const sideChat: IChat = { ...stubChat, resource: URI.parse('test:///side') };
			const session = stubSession({ sessionId: 'side', providerId: 'test', capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }) });
			const selection = { text: '  selected text  ' };
			let createSideChatArgs: readonly [string, URI, string, ISideChatSelection | undefined] | undefined;
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async createSideChat(sessionId: string, sourceChat: URI, turnId: string, selection?: ISideChatSelection): Promise<IChat> {
					createSideChatArgs = [sessionId, sourceChat, turnId, selection];
					return sideChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.createSideChatInSession(session, sourceChat, 'turn-1', selection);

			assert.deepStrictEqual({
				result: result.resource.toString(),
				args: createSideChatArgs?.map(arg => URI.isUri(arg) ? arg.toString() : arg),
			}, {
				result: sideChat.resource.toString(),
				args: ['side', sourceChat.toString(), 'turn-1', selection],
			});
		});

		test('throws when the provider is not found', async () => {
			const session = stubSession({ sessionId: 'orphan', providerId: 'missing-provider', capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }) });
			const provider = new TestSessionsProvider(stubSession({ sessionId: 'other', providerId: 'test' }));
			const { service } = createSessionsManagementService(session, disposables, provider);

			await assert.rejects(() => service.createSideChatInSession(session, URI.parse('test:///source'), 'turn-1'), /Provider 'missing-provider' not found/);
		});

		test('throws when the session does not support side chats', async () => {
			const session = stubSession({ sessionId: 'no-side-chat', providerId: 'test', capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: false }) });
			const { service } = createSessionsManagementService(session, disposables);

			await assert.rejects(() => service.createSideChatInSession(session, URI.parse('test:///source'), 'turn-1'), /does not support side chats/);
		});
	});

	suite('chat persistence', () => {

		function chat(id: string, status: SessionStatus = SessionStatus.Completed, origin?: ChatOriginKind): IChat {
			return {
				...stubChat,
				resource: URI.parse(`test:///chat/${id}`),
				title: constObservable(id),
				status: constObservable(status),
				origin: origin ? { kind: origin } : undefined,
			};
		}

		function multiChatSession(id: string, chats: IChat[]): ISession {
			return stubSession({
				sessionId: id,
				providerId: 'test',
				chats: constObservable(chats),
				mainChat: constObservable(chats[0]),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
		}

		function setup(sessions: ISession[]) {
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessions[0]); }
				override getSessions(): ISession[] { return sessions; }
			};
			return createSessionsManagementService(sessions[0], disposables, provider);
		}

		const closedTitles = (view: SessionsService) =>
			(view.activeSession.get()?.closedChats.get() ?? []).map(c => c.title.get());

		test('a chat closed in one session stays closed after switching away and back', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const activeA = view.activeSession.get()!;
			const chatB = sessionA.chats.get().find(c => c.title.get() === 'b')!;
			await view.closeChat(activeA, chatB);
			assert.deepStrictEqual(closedTitles(view), ['b']);

			// Switching away disposes session A's wrapper (and its in-memory closed
			// set); switching back must restore the closed chat from persisted state.
			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource);

			assert.deepStrictEqual(closedTitles(view), ['b']);
		});

		test('closing the middle of three chats persists across a switch', async () => {
			const sessionA = multiChatSession('A', [chat('c1'), chat('c2'), chat('c3')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const activeA = view.activeSession.get()!;
			const middle = sessionA.chats.get().find(c => c.title.get() === 'c2')!;
			await view.closeChat(activeA, middle);

			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource);

			const reActiveA = view.activeSession.get()!;
			assert.deepStrictEqual({
				open: reActiveA.openChats.get().map(c => c.title.get()),
				closed: reActiveA.closedChats.get().map(c => c.title.get()),
			}, {
				open: ['c1', 'c3'],
				closed: ['c2'],
			});
		});

		test('closing the active chat persists across a switch', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const chatB = sessionA.chats.get().find(c => c.title.get() === 'b')!;
			await view.openChat(sessionA, chatB.resource);
			await view.closeChat(view.activeSession.get()!, chatB);

			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource);

			assert.deepStrictEqual(closedTitles(view), ['b']);
		});

		test('reopening a closed chat is also persisted across a switch', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const activeA = view.activeSession.get()!;
			const chatB = sessionA.chats.get().find(c => c.title.get() === 'b')!;
			await view.closeChat(activeA, chatB);
			await view.openChat(sessionA, chatB.resource); // reopen

			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource);

			assert.deepStrictEqual(closedTitles(view), []);
		});

		test('a closed side chat stays closed after switching away and back', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('side', SessionStatus.Completed, ChatOriginKind.SideChat)]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const activeA = view.activeSession.get()!;
			const sideChat = sessionA.chats.get().find(c => c.title.get() === 'side')!;
			await view.closeChat(activeA, sideChat);
			assert.deepStrictEqual(closedTitles(view), ['side']);

			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource);

			assert.deepStrictEqual(closedTitles(view), ['side']);
		});

		test('a closed chat stays closed across a restart', async () => {
			const mainA = chat('mainA');
			const chatB = chat('b');
			const sessionA = stubSession({
				sessionId: 'A', providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable([mainA, chatB]),
				mainChat: constObservable(mainA),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const storage = disposables.add(new InMemoryStorageService());
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessionA); }
				override getSessions(): ISession[] { return [sessionA]; }
			};
			const makeView = () => {
				const instantiationService = disposables.add(new TestInstantiationService());
				instantiationService.stub(IStorageService, storage);
				instantiationService.stub(ILogService, new NullLogService());
				instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
				instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
				instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
				instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
				instantiationService.stub(IProgressService, new TestProgressService());
				instantiationService.stub(IChatService, new class extends mock<IChatService>() {
					override readonly onDidSubmitRequest = Event.None;
				});
				const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
				return createView(instantiationService, service, disposables);
			};

			// First window: close chat B, then simulate shutdown (flush storage).
			const first = makeView();
			await first.openSession(sessionA.resource);
			await first.closeChat(first.activeSession.get()!, chatB);
			await storage.flush();

			// Second window: restore and confirm B is still closed.
			const second = makeView();
			await second.restoreVisibleSessions();
			assert.deepStrictEqual((second.activeSession.get()?.closedChats.get() ?? []).map(c => c.title.get()), ['b']);
		});

		test('a chat closed in a non-active session stays closed across a restart', async () => {
			const mainA = chat('mainA');
			const chatA2 = chat('a2');
			const sessionA = stubSession({
				sessionId: 'A', providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable([mainA, chatA2]),
				mainChat: constObservable(mainA),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const mainB = chat('mainB');
			const chatB2 = chat('b2');
			const sessionB = stubSession({
				sessionId: 'B', providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable([mainB, chatB2]),
				mainChat: constObservable(mainB),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const storage = disposables.add(new InMemoryStorageService());
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessionA); }
				override getSessions(): ISession[] { return [sessionA, sessionB]; }
			};
			const makeView = () => {
				const instantiationService = disposables.add(new TestInstantiationService());
				instantiationService.stub(IStorageService, storage);
				instantiationService.stub(ILogService, new NullLogService());
				instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
				instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
				instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
				instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
				instantiationService.stub(IProgressService, new TestProgressService());
				instantiationService.stub(IChatService, new class extends mock<IChatService>() {
					override readonly onDidSubmitRequest = Event.None;
				});
				const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
				return createView(instantiationService, service, disposables);
			};

			// First window: close a chat in each session, end on session A so B is
			// no longer visible, then simulate shutdown (flush storage).
			const first = makeView();
			await first.openSession(sessionB.resource);
			await first.closeChat(first.activeSession.get()!, chatB2);
			await first.openSession(sessionA.resource);
			await first.closeChat(first.activeSession.get()!, chatA2);
			await storage.flush();

			// Second window: restore, then switch to B and confirm its chat is still closed.
			const second = makeView();
			await second.restoreVisibleSessions();
			await second.openSession(sessionB.resource);
			assert.deepStrictEqual((second.activeSession.get()?.closedChats.get() ?? []).map(c => c.title.get()), ['b2']);
		});

		test('restores the active chat when it appears after the session', async () => {
			const main = chat('main');
			const side = chat('side', SessionStatus.Completed, ChatOriginKind.SideChat);
			const storage = disposables.add(new InMemoryStorageService());
			const makeView = (session: ISession) => {
				const instantiationService = disposables.add(new TestInstantiationService());
				instantiationService.stub(IStorageService, storage);
				instantiationService.stub(ILogService, new NullLogService());
				instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
				instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([new TestSessionsProvider(session)]));
				instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
				instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
				instantiationService.stub(IProgressService, new TestProgressService());
				instantiationService.stub(IChatService, new class extends mock<IChatService>() {
					override readonly onDidSubmitRequest = Event.None;
				});
				const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
				return createView(instantiationService, service, disposables);
			};

			const firstSession = stubSession({
				sessionId: 'delayed-active-chat',
				providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable([main, side]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const first = makeView(firstSession);
			await first.openSession(firstSession.resource);
			await first.openChat(firstSession, side.resource);
			await storage.flush();
			first.dispose();

			const chats = observableValue<readonly IChat[]>('delayedChats', [main]);
			const restoredSession = stubSession({
				sessionId: 'delayed-active-chat',
				providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats,
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const second = makeView(restoredSession);
			await second.restoreVisibleSessions();
			const beforeSave = second.activeSession.get()?.activeChat.get().resource.toString();
			await storage.flush();
			second.dispose();

			const chatsAfterRestart = observableValue<readonly IChat[]>('delayedChatsAfterRestart', [main]);
			const restartedSession = stubSession({
				sessionId: 'delayed-active-chat',
				providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: chatsAfterRestart,
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const third = makeView(restartedSession);
			await third.restoreVisibleSessions();
			const afterSaveBeforeCatalog = third.activeSession.get()?.activeChat.get().resource.toString();

			chatsAfterRestart.set([main, side], undefined);

			assert.deepStrictEqual({
				beforeSave,
				afterSaveBeforeCatalog,
				afterCatalog: third.activeSession.get()?.activeChat.get().resource.toString(),
			}, {
				beforeSave: main.resource.toString(),
				afterSaveBeforeCatalog: main.resource.toString(),
				afterCatalog: side.resource.toString(),
			});
		});
	});

	suite('reopenLastClosedItem', () => {

		function chat(title: string): IChat {
			return {
				...stubChat,
				resource: URI.parse(`test:///chat/${title}`),
				title: constObservable(title),
				status: constObservable(SessionStatus.Completed),
			};
		}

		function multiChatSession(id: string, chats: IChat[]): ISession {
			return stubSession({
				sessionId: id,
				providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable(chats),
				mainChat: constObservable(chats[0]),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
		}

		function setup(sessions: ISession[]) {
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessions[0]); }
				override getSessions(): ISession[] { return sessions; }
			};
			const { view, contextKeyService } = createSessionsManagementService(sessions[0], disposables, provider);
			// The context key drives the command's palette visibility, and is the
			// only external signal of whether an entry is remembered.
			return { view, canReopen: () => contextKeyService.getContextKeyValue(SessionsHasClosedItemContext.key) === true };
		}

		const grid = (view: SessionsService) => ({
			visible: view.visibleSessions.get().map(s => s?.sessionId ?? null),
			sticky: view.visibleSessions.get().map(s => s?.sticky.get() ?? false),
			active: view.activeSession.get()?.sessionId ?? null,
		});

		test('reopens a closed chat, consuming the entry', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const { view, canReopen } = setup([sessionA]);

			await view.openSession(sessionA.resource);
			const chatB = sessionA.chats.get().find(c => c.title.get() === 'b')!;
			await view.closeChat(view.activeSession.get()!, chatB);
			const afterClose = canReopen();

			await view.reopenLastClosedItem();

			assert.deepStrictEqual({
				afterClose,
				closed: view.activeSession.get()!.closedChats.get().map(c => c.title.get()),
				open: view.activeSession.get()!.openChats.get().map(c => c.title.get()),
				canReopenAgain: canReopen(),
			}, {
				afterClose: true,
				closed: [],
				open: ['mainA', 'b'],
				canReopenAgain: false,
			});
		});

		test('an explicitly closed session returns to its grid index', async () => {
			const sessionA = multiChatSession('A', [chat('mainA')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			// Pin A so opening B adds a second slot instead of replacing it.
			await view.openSession(sessionA.resource);
			view.toggleSessionStickiness(sessionA);
			await view.openSession(sessionB.resource);

			view.closeSession(sessionA);
			const afterClose = grid(view);

			await view.reopenLastClosedItem();

			assert.deepStrictEqual({ afterClose, afterReopen: grid(view) }, {
				afterClose: { visible: ['B'], sticky: [false], active: 'B' },
				afterReopen: { visible: ['A', 'B'], sticky: [true, false], active: 'A' },
			});
		});

		test('a session pushed out of the grid takes its slot back', async () => {
			const sessionA = multiChatSession('A', [chat('mainA')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			await view.openSession(sessionB.resource);
			const afterReplace = grid(view);

			await view.reopenLastClosedItem();

			assert.deepStrictEqual({ afterReplace, afterReopen: grid(view) }, {
				afterReplace: { visible: ['B'], sticky: [false], active: 'B' },
				afterReopen: { visible: ['A'], sticky: [false], active: 'A' },
			});
		});

		test('remembers only the most recently closed item', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const chatB = sessionA.chats.get().find(c => c.title.get() === 'b')!;
			await view.closeChat(view.activeSession.get()!, chatB);
			// Opening B pushes A out of the grid, superseding the closed-chat entry.
			await view.openSession(sessionB.resource);

			await view.reopenLastClosedItem();
			// The entry is consumed, so pressing again must not walk back to the
			// superseded closed chat.
			await view.reopenLastClosedItem();

			assert.deepStrictEqual({
				...grid(view),
				closedChats: view.activeSession.get()!.closedChats.get().map(c => c.title.get()),
			}, {
				visible: ['A'],
				sticky: [false],
				active: 'A',
				closedChats: ['b'],
			});
		});

		test('a batch close is not offered for reopening', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b'), chat('c')]);
			const { view, canReopen } = setup([sessionA]);

			await view.openSession(sessionA.resource);
			const active = view.activeSession.get()!;
			// Mirrors "Close All Chats", which closes every non-main chat.
			for (const target of ['b', 'c']) {
				await view.closeChat(active, sessionA.chats.get().find(c => c.title.get() === target)!, { skipHistory: true });
			}

			await view.reopenLastClosedItem();

			assert.deepStrictEqual({
				canReopen: canReopen(),
				closed: view.activeSession.get()!.closedChats.get().map(c => c.title.get()),
			}, {
				canReopen: false,
				closed: ['b', 'c'],
			});
		});

		test('a stale entry is dropped when its session vanished without a delete event', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const sessions = [sessionA, sessionB];
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessionA); }
				override getSessions(): ISession[] { return sessions; }
			};
			const { view, contextKeyService } = createSessionsManagementService(sessionA, disposables, provider);
			const canReopen = () => contextKeyService.getContextKeyValue(SessionsHasClosedItemContext.key) === true;

			await view.openSession(sessionA.resource);
			await view.closeChat(view.activeSession.get()!, sessionA.chats.get().find(c => c.title.get() === 'b')!);

			// The provider drops the session from its catalog without firing
			// onDidDeleteSession, so the recorded entry can never be reopened.
			sessions.splice(0, 1);
			await view.reopenLastClosedItem();

			assert.deepStrictEqual({ canReopen: canReopen() }, { canReopen: false });
		});
	});

	suite('createQuickChat', () => {

		/**
		 * Provider that supports quick chats and mints a fresh draft session on
		 * each `createQuickChat`, recording the requested type and call count.
		 */
		class QuickChatProvider extends TestSessionsProvider {
			lastQuickChatType: string | undefined;
			createQuickChatCalls = 0;
			override readonly supportsQuickChats = true;

			constructor(
				seed: ISession,
				override readonly id: string = 'quick-provider',
				override readonly order: number = 0,
				override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick', label: 'Quick', icon: Codicon.vm }],
			) {
				super(seed);
			}

			override createQuickChat(sessionTypeId: string): ISession {
				this.createQuickChatCalls++;
				this.lastQuickChatType = sessionTypeId;
				return stubSession({ sessionId: `q${this.createQuickChatCalls}`, providerId: this.id });
			}
		}

		function setupQuickChat(providers: readonly ISessionsProvider[]): ISessionsManagementService {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
			instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(providers));
			instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
			instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
			instantiationService.stub(IProgressService, new TestProgressService());
			instantiationService.stub(IChatService, new class extends mock<IChatService>() {
				override readonly onDidSubmitRequest = Event.None;
			});
			return disposables.add(instantiationService.createInstance(SessionsManagementService));
		}

		test('creates a session via the first capable provider (by order) and defaults the type', () => {
			const plain = new class extends TestSessionsProvider {
				override readonly id = 'plain';
				override readonly order = 0;
			}(stubSession({ sessionId: 'p1', providerId: 'plain' }));
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }), 'quick-provider', 1);

			const service = setupQuickChat([plain, quick]);
			const session = service.createQuickChat();

			assert.deepStrictEqual({
				createdSessionId: session.sessionId,
				requestedType: quick.lastQuickChatType,
				draft: service.newSession.get()?.sessionId,
			}, {
				createdSessionId: 'q1',
				requestedType: 'quick',
				draft: 'q1',
			});
		});

		test('mints a new quick-chat session on each call', () => {
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }));

			const service = setupQuickChat([quick]);
			const first = service.createQuickChat();
			const second = service.createQuickChat();

			assert.deepStrictEqual({
				first: first.sessionId,
				second: second.sessionId,
				createQuickChatCalls: quick.createQuickChatCalls,
				draft: service.newSession.get()?.sessionId,
			}, {
				first: 'q1',
				second: 'q2',
				createQuickChatCalls: 2,
				draft: 'q2',
			});
		});

		test('throws when no provider supports quick chats', () => {
			const plain = new TestSessionsProvider(stubSession({ sessionId: 'p1', providerId: 'test' }));
			const service = setupQuickChat([plain]);
			assert.throws(() => service.createQuickChat(), /No sessions provider supports quick chats/);
		});

		test('honours options.providerId and the requested session type', () => {
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }), 'quick-provider', 0, [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick', label: 'Quick', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'other', label: 'Other', icon: Codicon.vm },
			]);

			const service = setupQuickChat([quick]);
			service.createQuickChat({ providerId: 'quick-provider', sessionTypeId: 'other' });

			assert.strictEqual(quick.lastQuickChatType, 'other');
		});

		test('honours an explicit sessionTypeId without a providerId', () => {
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }), 'quick-provider', 0, [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick', label: 'Quick', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'other', label: 'Other', icon: Codicon.vm },
			]);

			const service = setupQuickChat([quick]);
			service.createQuickChat({ sessionTypeId: 'other' });

			assert.strictEqual(quick.lastQuickChatType, 'other');
		});

		test('defaults to the last-used session type on the next call', () => {
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }), 'quick-provider', 0, [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick', label: 'Quick', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'other', label: 'Other', icon: Codicon.vm },
			]);

			const service = setupQuickChat([quick]);
			service.createQuickChat({ sessionTypeId: 'other' });
			service.createQuickChat();

			assert.strictEqual(quick.lastQuickChatType, 'other');
		});

		test('throws when the requested provider does not advertise the session type', () => {
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }));
			const service = setupQuickChat([quick]);
			assert.throws(() => service.createQuickChat({ providerId: 'quick-provider', sessionTypeId: 'missing' }), /does not advertise session type/);
		});

		test('throws when the requested provider does not support quick chats', () => {
			const plain = new class extends TestSessionsProvider {
				override readonly id = 'plain';
			}(stubSession({ sessionId: 'p1', providerId: 'plain' }));
			const service = setupQuickChat([plain]);
			assert.throws(() => service.createQuickChat({ providerId: 'plain' }), /does not support quick chats/);
		});

		test('getQuickChatSessionTypes returns every advertised type from quick-chat-capable providers only', () => {
			const plain = new class extends TestSessionsProvider {
				override readonly id = 'plain';
				override readonly order = 0;
			}(stubSession({ sessionId: 'p1', providerId: 'plain' }));
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }), 'quick-provider', 1, [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick', label: 'Quick', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'other', label: 'Other', icon: Codicon.vm },
			]);

			const service = setupQuickChat([plain, quick]);

			assert.deepStrictEqual(
				service.getQuickChatSessionTypes().map(t => ({ providerId: t.providerId, sessionTypeId: t.sessionType.id })),
				[
					{ providerId: 'quick-provider', sessionTypeId: 'quick' },
					{ providerId: 'quick-provider', sessionTypeId: 'other' },
				],
			);
		});
	});

	suite('legacy Copilot CLI migration', () => {

		const RAW_ID = 'sess-abc';

		function legacyCliSession(): ISession {
			return stubSession({
				sessionId: `legacy-${RAW_ID}`,
				providerId: 'default-copilot',
				sessionType: COPILOT_CLI_EH_SCHEME,
				resource: URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${RAW_ID}` }),
			});
		}

		function migratedCliSession(): ISession {
			return stubSession({
				sessionId: `migrated-${RAW_ID}`,
				providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				sessionType: COPILOT_CLI_EH_SCHEME,
				resource: URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: `/${RAW_ID}` }),
			});
		}

		suite('resolveSessionResource', () => {

			const legacyResource = URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${RAW_ID}` });
			const twinResource = URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: `/${RAW_ID}` });

			function serviceWithResolver(resolve: (resource: URI) => Promise<URI | undefined>): ISessionsManagementService {
				const session = legacyCliSession();
				const provider = new class extends TestSessionsProvider {
					constructor() { super(session); }
					override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
					override getSessions(): ISession[] { return [session]; }
					override resolveSessionResource(resource: URI): Promise<URI | undefined> { return resolve(resource); }
				};
				return createSessionsManagementService(session, disposables, provider).service;
			}

			test('redirects a legacy resource to the twin a provider claims', async () => {
				const service = serviceWithResolver(async () => twinResource);

				assert.strictEqual((await service.resolveSessionResource(legacyResource)).toString(), twinResource.toString());
			});

			test('keeps the original resource when no provider claims it', async () => {
				const service = serviceWithResolver(async () => undefined);

				assert.strictEqual((await service.resolveSessionResource(legacyResource)).toString(), legacyResource.toString());
			});

			test('keeps the original resource when a provider throws', async () => {
				const service = serviceWithResolver(async () => { throw new Error('host unavailable'); });

				// Failure must degrade to today's behaviour, never block the open.
				assert.strictEqual((await service.resolveSessionResource(legacyResource)).toString(), legacyResource.toString());
			});

			test('does not consult providers for a resource they decline', async () => {
				const seen: string[] = [];
				const service = serviceWithResolver(async resource => { seen.push(resource.toString()); return undefined; });
				const native = URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: '/native' });

				const resolved = await service.resolveSessionResource(native);
				assert.deepStrictEqual({ resolved: resolved.toString(), seen }, { resolved: native.toString(), seen: [native.toString()] });
			});

			test('a provider that declines does not stop a later provider from claiming', async () => {
				const session = legacyCliSession();
				const declining = new class extends TestSessionsProvider {
					constructor() { super(session); }
					override readonly id = 'declining';
					override getSessions(): ISession[] { return [session]; }
					override resolveSessionResource(): Promise<URI | undefined> { return Promise.resolve(undefined); }
				};
				const claiming = new class extends TestSessionsProvider {
					constructor() { super(session); }
					override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
					override readonly order = 1;
					override getSessions(): ISession[] { return [session]; }
					override resolveSessionResource(): Promise<URI | undefined> { return Promise.resolve(twinResource); }
				};
				const service = createSessionsManagementService(session, disposables, [declining, claiming]).service;

				assert.strictEqual((await service.resolveSessionResource(legacyResource)).toString(), twinResource.toString());
			});
		});

		function serviceWithSessions(sessions: readonly ISession[]): ISessionsManagementService {
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessions[0]); }
				override getSessions(): ISession[] { return [...sessions]; }
			};
			return createSessionsManagementService(sessions[0], disposables, provider).service;
		}

		test('getSessions hides the legacy entry once its migrated agent-host entry exists', () => {
			const legacy = legacyCliSession();
			const migrated = migratedCliSession();
			const service = serviceWithSessions([legacy, migrated]);

			assert.deepStrictEqual(
				service.getSessions().map(s => s.sessionId),
				[migrated.sessionId],
			);
		});

		test('getSessions keeps the legacy entry visible when no migrated entry exists', () => {
			const legacy = legacyCliSession();
			const service = serviceWithSessions([legacy]);

			assert.deepStrictEqual(
				service.getSessions().map(s => s.sessionId),
				[legacy.sessionId],
			);
		});

		test('getSession still resolves the hidden legacy entry so it can be migrated on open', () => {
			const legacy = legacyCliSession();
			const migrated = migratedCliSession();
			const service = serviceWithSessions([legacy, migrated]);

			// Hidden from the displayed list, yet still resolvable by resource so
			// an explicit open can trigger migration.
			assert.deepStrictEqual(
				{
					listed: service.getSessions().some(s => s.sessionId === legacy.sessionId),
					resolved: service.getSession(legacy.resource)?.sessionId ?? null,
				},
				{ listed: false, resolved: legacy.sessionId },
			);
		});
	});
});

/**
 * Builds a management service with a Copilot-style provider and a
 * local-agent-host provider, each with an explicit {@link ISessionsProvider.order}.
 * Used to assert that the management service surfaces session types ordered by
 * provider order (lower first).
 */
function createOrderedTypesService(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, copilotOrder: number, agentHostOrder: number): ISessionsManagementService {
	const copilotProvider = new class extends TestSessionsProvider {
		override readonly id = 'default-copilot';
		override readonly order = copilotOrder;
		override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'copilot', label: 'Copilot', icon: Codicon.vm }];
	}(stubSession({ sessionId: 'c1', providerId: 'default-copilot' }));
	const agentHostProvider = new class extends TestSessionsProvider {
		override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
		override readonly order = agentHostOrder;
		override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'agent-host', label: 'Agent Host', icon: Codicon.vm }];
	}(stubSession({ sessionId: 'a1', providerId: LOCAL_AGENT_HOST_PROVIDER_ID }));

	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
	instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([copilotProvider, agentHostProvider]));
	instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
	instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
	instantiationService.stub(IProgressService, new TestProgressService());
	instantiationService.stub(IChatService, new class extends mock<IChatService>() {
		override readonly onDidSubmitRequest = Event.None;
	});

	return disposables.add(instantiationService.createInstance(SessionsManagementService));
}
