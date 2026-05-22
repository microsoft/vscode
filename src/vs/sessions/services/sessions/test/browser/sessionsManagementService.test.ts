/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
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
import { IAgentSession, IAgentSessionsModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IChatEditorOptions } from '../../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditor.js';
import { PreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { IChat, ISession, ISessionType, ISessionWorkspace } from '../../common/session.js';
import { ISessionChangeEvent, ISendRequestOptions, ISessionsProvider } from '../../common/sessionsProvider.js';
import { SessionsManagementService } from '../../browser/sessionsManagementService.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../browser/sessionsProvidersService.js';

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

class TestAgentSessionsService extends mock<IAgentSessionsService>() {
	readonly observed: URI[] = [];

	override readonly onDidChangeSessionArchivedState = Event.None;
	override readonly model: IAgentSessionsModel = {
		onWillResolve: Event.None,
		onDidResolve: Event.None,
		onDidChangeSessions: Event.None,
		onDidChangeSessionArchivedState: Event.None,
		resolved: true,
		sessions: [],
		getSession: () => undefined,
		observeSession: resource => {
			this.observed.push(resource);
			return constObservable<IAgentSession | undefined>(undefined);
		},
		resolve: async () => { },
	};

	override getSession(): IAgentSession | undefined {
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
		return [...this._providers];
	}

	override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this._providers.find(provider => provider.id === providerId) as T | undefined;
	}
}

class TestSessionsProvider extends mock<ISessionsProvider>() {
	override readonly id = 'test';
	override readonly label = 'Test';
	override readonly icon = Codicon.vm;
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
	override setModel(): void { }
	override async archiveSession(): Promise<void> { }
	override async unarchiveSession(): Promise<void> { }
	override async deleteSession(): Promise<void> { }
	override async deleteChat(): Promise<void> { }
	override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> { return this._session; }
	override async createNewChat(): Promise<IChat> { return this._session.mainChat.get(); }
}

function createSessionsManagementService(session: ISession, disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>): { service: ISessionsManagementService; chatWidgetService: TestChatWidgetService; agentSessionsService: TestAgentSessionsService } {
	const instantiationService = disposables.add(new TestInstantiationService());
	const chatWidgetService = new TestChatWidgetService();
	const agentSessionsService = new TestAgentSessionsService();

	instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
	instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([new TestSessionsProvider(session)]));
	instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
	instantiationService.stub(IChatWidgetService, chatWidgetService);
	instantiationService.stub(IAgentSessionsService, agentSessionsService);
	instantiationService.stub(IProgressService, new TestProgressService());

	const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
	return { service, chatWidgetService, agentSessionsService };
}

suite('SessionsManagementService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('openSession waits for a loading session before opening chat content', async () => {
		const loading = observableValue('loading', true);
		const session = stubSession({ sessionId: 'loading', providerId: 'test', loading });
		const { service, chatWidgetService, agentSessionsService } = createSessionsManagementService(session, disposables);

		const openPromise = service.openSession(session.resource);
		await Promise.resolve();

		assert.deepStrictEqual({ opened: chatWidgetService.opened.map(uri => uri.toString()), observed: agentSessionsService.observed.map(uri => uri.toString()) }, { opened: [], observed: [] });

		loading.set(false, undefined);
		await openPromise;

		assert.deepStrictEqual({ opened: chatWidgetService.opened.map(uri => uri.toString()), observed: agentSessionsService.observed.map(uri => uri.toString()) }, { opened: [session.resource.toString()], observed: [session.resource.toString()] });
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
		const agentSessionsService = new TestAgentSessionsService();

		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, chatWidgetService);
		instantiationService.stub(IAgentSessionsService, agentSessionsService);
		instantiationService.stub(IProgressService, new TestProgressService());

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));

		// Open the original session so it becomes the active session
		await service.openSession(originalSession.resource);
		assert.strictEqual(service.activeSession.get()?.sessionId, 'original');

		// A new session appears but is NOT displayed in any widget
		const otherSession = stubSession({ sessionId: 'other', providerId: 'test' });
		// Note: not calling chatWidgetService.setWidgetSessionResource()

		onDidChangeSessions.fire({ added: [otherSession], removed: [], changed: [] });

		// The active session should remain unchanged
		assert.strictEqual(service.activeSession.get()?.sessionId, 'original');
	});

	test('restoreLastActiveSession waits for session to appear via onDidChangeSessions', async () => {
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
		const agentSessionsService = new TestAgentSessionsService();

		// Seed storage so the management service treats `targetSession` as the
		// last active session and tries to restore it on startup.
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([{ sessionResource: targetSession.resource.toString(), isActive: true }]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);

		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, chatWidgetService);
		instantiationService.stub(IAgentSessionsService, agentSessionsService);
		instantiationService.stub(IProgressService, new TestProgressService());

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));

		// At this point the provider does not yet know about the session
		// (mimicking an agent host provider whose cache has not loaded yet).
		const restorePromise = service.restoreLastActiveSession();
		await Promise.resolve();
		assert.deepStrictEqual(chatWidgetService.opened.map(uri => uri.toString()), []);

		// Now the provider learns about the session and fires its change event.
		// `onDidChangeProviders` does NOT fire here — only the per-provider
		// session change event — so the fix must subscribe to it as well.
		sessions = [targetSession];
		onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });

		await restorePromise;
		assert.deepStrictEqual(chatWidgetService.opened.map(uri => uri.toString()), [targetSession.resource.toString()]);
	});
});

