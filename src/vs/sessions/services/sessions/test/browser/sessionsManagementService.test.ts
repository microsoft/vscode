/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProgress, IProgressService, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ChatViewPaneTarget, IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatEditorOptions } from '../../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditor.js';
import { IChatWidgetHistoryService } from '../../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js';
import { PreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { IChat, ISession, ISessionType, ISessionWorkspace, SessionStatus } from '../../common/session.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionChangeEvent, ISendRequestOptions, ISessionModelPickerOptions, ISessionsProvider } from '../../common/sessionsProvider.js';
import { SessionsManagementService } from '../../browser/sessionsManagementService.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { SessionsService } from '../../browser/sessionsService.js';
import { ISessionsPartService } from '../../browser/sessionsPartService.js';
import { ISessionsProvidersService } from '../../browser/sessionsProvidersService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';

const stubChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changes: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
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
		capabilities: { supportsMultipleChats: false },
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

class TestProgressService extends mock<IProgressService>() {
	override async withProgress<R>(_options: Parameters<IProgressService['withProgress']>[0], task: (progress: IProgress<IProgressStep>) => Promise<R>): Promise<R> {
		return task({ report() { } });
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
	override readonly sessionTypes: readonly ISessionType[] = [{ id: 'test', label: 'Test', icon: Codicon.vm }];
	override readonly onDidChangeSessionTypes = Event.None;
	override readonly onDidChangeSessions = Event.None;
	override readonly browseActions = [];

	constructor(private readonly _session: ISession) {
		super();
	}

	override getSessions(): ISession[] { return [this._session]; }
	override resolveWorkspace(): ISessionWorkspace | undefined { return undefined; }
	override createNewSession(): ISession { return this._session; }
	override getSessionTypes(): ISessionType[] { return [...this.sessionTypes]; }
	override async renameChat(): Promise<void> { }
	override getModels(): readonly ILanguageModelChatMetadataAndIdentifier[] { return []; }
	override getModelPickerOptions(): ISessionModelPickerOptions { return { useGroupedModelPicker: true, showFeatured: true, showUnavailableFeatured: false, showManageModelsAction: false }; }
	override readonly onDidChangeModels = Event.None;
	override setModel(): void { }
	override async archiveSession(): Promise<void> { }
	override async unarchiveSession(): Promise<void> { }
	override async deleteSession(): Promise<void> { }
	override async deleteSessions(_sessionIds: readonly string[]): Promise<void> { }
	override async deleteChat(): Promise<boolean> { return true; }
	override deleteNewSession(): void { }
	override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> { return this._session; }
	override async createNewChat(): Promise<IChat> { return this._session.mainChat.get(); }
	override async forkChat(_sessionId: string, _sourceChat: URI, _turnId: string): Promise<IChat> { throw new Error('not implemented'); }
}

function createSessionsManagementService(session: ISession, disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, provider: ISessionsProvider = new TestSessionsProvider(session)): { service: ISessionsManagementService; view: SessionsService; chatWidgetService: TestChatWidgetService } {
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
	instantiationService.stub(IChatWidgetHistoryService, new class extends mock<IChatWidgetHistoryService>() {
		override moveHistory(): void { }
	});

	const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
	const view = createView(instantiationService, service, disposables);
	return { service, view, chatWidgetService };
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
	return disposables.add(instantiationService.createInstance(SessionsService));
}

suite('SessionsManagementService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
		assert.deepStrictEqual(view.visibleSessions.get().filter((s): s is NonNullable<typeof s> => !!s).map(s => s.sessionId), []);

		// Now the provider learns about the session and fires its change event.
		// `onDidChangeProviders` does NOT fire here — only the per-provider
		// session change event — so the fix must subscribe to it as well.
		sessions = [targetSession];
		onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });

		await restorePromise;
		assert.deepStrictEqual(view.visibleSessions.get().map(s => s?.sessionId), [targetSession.sessionId]);
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

	test('sendNewChatRequest with background resolves before provider send commits', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		let completeSendRequest: (() => void) | undefined;
		let sendRequestStarted = false;
		const provider = new class extends TestSessionsProvider {
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				sendRequestStarted = true;
				await new Promise<void>(resolve => {
					completeSendRequest = resolve;
				});
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		// The background send is fire-and-forget: the promise resolves before
		// the provider's `sendRequest` commits.
		const sendPromise = service.sendNewChatRequest(session, { query: 'hi', background: true });
		await sendPromise;

		assert.strictEqual(sendRequestStarted, true);

		completeSendRequest?.();
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
			const session = stubSession({ sessionId: 'fork', providerId: 'test', capabilities: { supportsMultipleChats: true } });
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
			const session = stubSession({ sessionId: 'orphan', providerId: 'missing-provider', capabilities: { supportsMultipleChats: true } });
			const provider = new TestSessionsProvider(stubSession({ sessionId: 'other', providerId: 'test' }));
			const { service } = createSessionsManagementService(session, disposables, provider);

			await assert.rejects(() => service.forkChatInSession(session, URI.parse('test:///source'), 'turn-1'), /Provider 'missing-provider' not found/);
		});

		test('throws when the session does not support multiple chats', async () => {
			const session = stubSession({ sessionId: 'single-chat', providerId: 'test', capabilities: { supportsMultipleChats: false } });
			const { service } = createSessionsManagementService(session, disposables);

			await assert.rejects(() => service.forkChatInSession(session, URI.parse('test:///source'), 'turn-1'), /does not support forking into a chat/);
		});
	});

	suite('closed chats persistence', () => {

		function chat(id: string, status: SessionStatus = SessionStatus.Completed): IChat {
			return { ...stubChat, resource: URI.parse(`test:///chat/${id}`), title: constObservable(id), status: constObservable(status) };
		}

		function multiChatSession(id: string, chats: IChat[]): ISession {
			return stubSession({
				sessionId: id,
				providerId: 'test',
				chats: constObservable(chats),
				mainChat: constObservable(chats[0]),
				capabilities: { supportsMultipleChats: true },
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
		override readonly sessionTypes: readonly ISessionType[] = [{ id: 'copilot', label: 'Copilot', icon: Codicon.vm }];
	}(stubSession({ sessionId: 'c1', providerId: 'default-copilot' }));
	const agentHostProvider = new class extends TestSessionsProvider {
		override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
		override readonly order = agentHostOrder;
		override readonly sessionTypes: readonly ISessionType[] = [{ id: 'agent-host', label: 'Agent Host', icon: Codicon.vm }];
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
