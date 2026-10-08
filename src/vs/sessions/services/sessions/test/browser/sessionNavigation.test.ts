/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { AbstractCustomView } from '../../../customView/browser/customView.js';
import { CustomViewService, ICustomViewService } from '../../../customView/browser/customViewService.js';
import { IActiveSession, ICreateNewSessionOptions, IProviderSessionType, IRecentlyOpenedSessions, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ChatInteractivity, IChat, ISession, ISessionType, ISessionWorkspace, ISideChatSelection, SessionStatus } from '../../common/session.js';
import { SessionsNavigation } from '../../browser/sessionNavigation.js';
import { getRecencyEntryKey, SessionsRecencyHistory } from '../../browser/sessionsRecencyHistory.js';
import { Event } from '../../../../../base/common/event.js';
import { ISendRequestOptions } from '../../common/sessionsProvider.js';

const stubChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	workspace: constObservable(undefined),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(SessionStatus.Completed),
	changes: constObservable([]),
	changesets: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	modelSource: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	interactivity: constObservable(ChatInteractivity.Full),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
};

function stubChatWithId(id: string, status: SessionStatus = SessionStatus.Completed): IChat {
	return {
		resource: URI.parse(`test:///chat-${id}`),
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable(`Chat ${id}`),
		updatedAt: constObservable(new Date()),
		status: constObservable(status),
		checkpoints: constObservable(undefined),
		changes: constObservable([]),
		changesets: constObservable([]),
		modelId: constObservable(undefined),
		modelSource: constObservable(undefined),
		mode: constObservable(undefined),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		interactivity: constObservable(ChatInteractivity.Full),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
	};
}

function stubSession(id: string, status: SessionStatus = SessionStatus.Completed, chats?: IChat[]): ISession {
	const sessionChats = chats ?? [stubChat];
	return {
		sessionId: id,
		resource: URI.parse(`test:///${id}`),
		providerId: 'test',
		sessionType: 'test',
		harness: 'copilot',
		environment: 'local',
		application: constObservable({ id: 'vscode', label: 'VS Code' }),
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable(`Session ${id}`),
		updatedAt: constObservable(new Date()),
		status: constObservable(status),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable(sessionChats),
		mainChat: constObservable(sessionChats[0]),
		capabilities: constObservable({ supportsMultipleChats: chats !== undefined && chats.length > 1 }),
	};
}

class MockSessionStore implements ISessionsManagementService {

	readonly _serviceBrand: undefined;

	readonly activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
	readonly visibleSessions = observableValue<readonly IActiveSession[]>('test.visibleSessions', []);
	readonly onDidChangeSessions = Event.None;
	readonly onDidStartSession = Event.None;
	readonly onDidChangeSessionTypes = Event.None;
	readonly onWillSendRequest = Event.None;
	readonly onDidSendRequest = Event.None;
	readonly onDidArchiveSession = Event.None;
	readonly onDidUnarchiveSession = Event.None;
	readonly onDidDeleteSession = Event.None;
	readonly onDidDeleteChat = Event.None;
	readonly onDidRenameChat = Event.None;
	readonly onDidRenameSession = Event.None;
	readonly onDidReplaceSession = Event.None;
	readonly onDidDiscardNewSession = Event.None;
	readonly onDidReplaceNewDraftSession = Event.None;
	readonly onDidToggleSessionStickiness = Event.None;

	readonly newSession: IObservable<ISession | undefined> = constObservable(undefined);
	readonly automationSession: IObservable<ISession | undefined> = constObservable(undefined);

	private readonly _sessions = new Map<string, ISession>();
	private _openedResource: URI | undefined;
	private _openedChatResource: URI | undefined;
	private _openedNewSession = false;

	get lastOpenedResource(): URI | undefined { return this._openedResource; }
	get lastOpenedChatResource(): URI | undefined { return this._openedChatResource; }
	get lastOpenedNewSession(): boolean { return this._openedNewSession; }

	constructor(private readonly customViewService: ICustomViewService) { }

	setActiveSession(session: ISession | undefined, chat?: IChat): void {
		if (session) {
			const activeChat = chat ?? session.chats.get()[0] ?? stubChat;
			const active: IActiveSession = {
				...session,
				isCreated: constObservable(true),
				sticky: constObservable(false),
				activeChat: observableValue<IChat>(`test.activeChat-${session.sessionId}`, activeChat),
				openChats: session.chats,
				closedChats: constObservable([]),
				lastClosedChat: undefined,
				visibleChatTabs: session.chats,
				shouldShowChatTabs: constObservable(false),
			};
			this.activeSession.set(active, undefined);
		} else {
			this.activeSession.set(undefined, undefined);
		}
	}

	replaceActiveSession(from: IActiveSession, to: IActiveSession): void {
		this.setActiveSession(to);
	}

	setActiveChat(chat: IChat): void {
		const active = this.activeSession.get();
		if (active) {
			(active.activeChat as ReturnType<typeof observableValue<IChat>>).set(chat, undefined);
		}
	}

	addSession(session: ISession): void {
		this._sessions.set(session.resource.toString(), session);
	}

	getSessions(): ISession[] { return [...this._sessions.values()]; }
	getInFlightNewSessionRequests(): readonly ISession[] { return []; }
	getInFlightNewSessionRequest(): undefined { return undefined; }

	getRecentlyOpenedSessions(): IRecentlyOpenedSessions { return { recent: [...this._sessions.values()], other: [] }; }

	getSession(resource: URI): ISession | undefined {
		return this._sessions.get(resource.toString());
	}

	async resolveSessionResource(resource: URI): Promise<URI> {
		return resource;
	}

	getSessionForChatResource(resource: URI): { session: ISession; chat: IChat } | undefined {
		for (const session of this._sessions.values()) {
			const chat = session.chats.get().find(c => c.resource.toString() === resource.toString());
			if (chat) {
				return { session, chat };
			}
		}
		return undefined;
	}

	getSessionContextReference(_resource: URI): string | undefined {
		return undefined;
	}

	getAllSessionTypes(): ISessionType[] { return []; }
	getAllProviderSessionTypes(): IProviderSessionType[] { return []; }
	getSessionTypesForFolder(_folderUri: URI): IProviderSessionType[] { return []; }
	getQuickChatSessionTypes(): IProviderSessionType[] { return []; }
	isNewSessionTargetAvailable(_folderUri: URI, _options?: ICreateNewSessionOptions): boolean { return false; }
	isQuickChatTargetAvailable(_options?: ICreateNewSessionOptions): boolean { return false; }
	resolveWorkspace(_folderUri: URI): { providerId: string; workspace: ISessionWorkspace } | undefined { return undefined; }

	async openSession(sessionResource: URI): Promise<void> {
		this._openedResource = sessionResource;
		this._openedChatResource = undefined;
		this._openedNewSession = false;
		const session = this._sessions.get(sessionResource.toString());
		if (session) {
			transaction(tx => {
				this.customViewService.hideCustomView(tx);
				this.setActiveSession(session);
			});
		}
	}

	async openNewSession(): Promise<void> {
		this._openedNewSession = true;
		this._openedResource = undefined;
		this._openedChatResource = undefined;
		transaction(tx => {
			this.customViewService.hideCustomView(tx);
			this.setActiveSession(undefined);
		});
	}

	async openChat(session: ISession, chatUri: URI): Promise<void> {
		this._openedResource = session.resource;
		this._openedChatResource = chatUri;
		this._openedNewSession = false;
		const chat = session.chats.get().find(c => c.resource.toString() === chatUri.toString());
		if (chat) {
			transaction(tx => {
				this.customViewService.hideCustomView(tx);
				this.setActiveSession(session, chat);
			});
		}
	}
	restoreVisibleSessions(): Promise<void> { throw new Error('not implemented'); }
	createNewSession(_folderUri: URI, _options?: ICreateNewSessionOptions): ISession { throw new Error('not implemented'); }
	createAutomationSession(_folderUri: URI, _options?: ICreateNewSessionOptions): ISession { throw new Error('not implemented'); }
	createAutomationQuickChat(_options?: ICreateNewSessionOptions): ISession { throw new Error('not implemented'); }
	getAutomationSessionConfiguration(): Promise<undefined> { return Promise.resolve(undefined); }
	supportsAutomationSessionConfiguration(): boolean { return false; }
	usesCombinedNewSessionConfigPicker(): boolean { return false; }
	createQuickChat(_options?: ICreateNewSessionOptions): ISession { throw new Error('not implemented'); }
	createNewChatInSession(_session: ISession): Promise<IChat | undefined> { throw new Error('not implemented'); }
	forkChatInSession(_session: ISession, _sourceChat: URI, _turnId: string): Promise<IChat> { throw new Error('not implemented'); }
	createSideChatInSession(_session: ISession, _sourceChat: URI, _turnId: string, _selection?: ISideChatSelection): Promise<IChat> { throw new Error('not implemented'); }
	discardNewSession(): void { throw new Error('not implemented'); }
	discardAutomationSession(): void { throw new Error('not implemented'); }
	unsetNewSession(): void { throw new Error('not implemented'); }
	sendNewChatRequest(_session: ISession, _options: ISendRequestOptions): Promise<void> { throw new Error('not implemented'); }
	createAndSendNewChatRequest(_folderUri: URI, _options: ISendRequestOptions, _createOptions?: ICreateNewSessionOptions): Promise<ISession | undefined> { throw new Error('not implemented'); }
	createAndSendQuickChatRequest(_options: ISendRequestOptions, _createOptions?: ICreateNewSessionOptions): Promise<ISession | undefined> { throw new Error('not implemented'); }
	sendRequest(_session: ISession, _chat: IChat, _options: ISendRequestOptions): Promise<void> { throw new Error('not implemented'); }
	openNewChatInSession(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	openPreviousSession(): Promise<void> { throw new Error('not implemented'); }
	openNextSession(): Promise<void> { throw new Error('not implemented'); }
	toggleSessionStickiness(_session: ISession): void { throw new Error('not implemented'); }
	insertAt(_session: ISession, _targetSessionId: string, _side: 'left' | 'right', _activate?: boolean): void { throw new Error('not implemented'); }
	closeSession(_session: ISession | undefined): void { throw new Error('not implemented'); }
	closeAllSessions(): void { throw new Error('not implemented'); }
	setActive(_session: IActiveSession): void { throw new Error('not implemented'); }
	cancelCurrentRequest(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	archiveSession(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	importSession(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	unarchiveSession(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	archiveChat(_session: ISession, _chat: IChat): Promise<void> { throw new Error('not implemented'); }
	unarchiveChat(_session: ISession, _chat: IChat): Promise<void> { throw new Error('not implemented'); }
	setSessionReadState(_session: ISession, _isRead: boolean): Promise<void> { throw new Error('not implemented'); }
	markChatRead(_session: ISession, _chat: IChat): Promise<void> { throw new Error('not implemented'); }
	markRead(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	markUnread(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	markAllRead(_sessions: readonly ISession[]): Promise<void> { throw new Error('not implemented'); }
	deleteSession(_session: ISession): Promise<void> { throw new Error('not implemented'); }
	deleteSessions(_sessions: readonly ISession[]): Promise<void> { throw new Error('not implemented'); }
	deleteChat(_session: ISession, _chatUri: URI): Promise<boolean> { throw new Error('not implemented'); }
	renameChat(_session: ISession, _chatUri: URI, _title: string): Promise<void> { throw new Error('not implemented'); }
	renameSession(_session: ISession, _title: string): Promise<void> { throw new Error('not implemented'); }
	removeSessionArtifact(_session: ISession, _artifactId: string): Promise<void> { throw new Error('not implemented'); }
}

suite('SessionsNavigation', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();
	let store: MockSessionStore;
	let nav: SessionsNavigation;
	let contextKeyService: MockContextKeyService;
	let customViewService: CustomViewService;
	let storageService: InMemoryStorageService;
	let recency: SessionsRecencyHistory;

	setup(() => {
		const disposables = ds.add(new DisposableStore());

		contextKeyService = disposables.add(new MockContextKeyService());

		storageService = disposables.add(new InMemoryStorageService());
		customViewService = disposables.add(new CustomViewService(new NullLogService(), storageService));
		store = new MockSessionStore(customViewService);
		recency = disposables.add(new SessionsRecencyHistory(storageService, new NullLogService()));

		nav = disposables.add(new SessionsNavigation(
			store,
			store.activeSession,
			customViewService,
			store,
			recency,
			contextKeyService,
			new NullLogService(),
		));
	});

	function canGoBack(): boolean {
		return contextKeyService.getContextKeyValue('sessionsCanGoBack') ?? false;
	}

	function canGoForward(): boolean {
		return contextKeyService.getContextKeyValue('sessionsCanGoForward') ?? false;
	}

	function registerCustomView(id: string) {
		return ds.add(customViewService.registerCustomView({
			id,
			ctor: new SyncDescriptor(class extends AbstractCustomView {
				readonly title = constObservable('Custom View');
				render(_container: HTMLElement): void { }
				layout(_width: number, _height: number): void { }
			}),
		}));
	}

	async function navigate(direction: 'back' | 'forward', count: number): Promise<string[]> {
		const destinations: string[] = [];
		for (let i = 0; i < count; i++) {
			if (direction === 'back') {
				await nav.goBack();
			} else {
				await nav.goForward();
			}
			destinations.push(customViewService.activeCustomView.get()?.id ?? store.activeSession.get()?.sessionId ?? 'newSession');
		}
		return destinations;
	}

	test('initially cannot go back or forward', () => {
		assert.strictEqual(canGoBack(), false);
		assert.strictEqual(canGoForward(), false);
	});

	test('can go back after navigating to two sessions', () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);

		store.setActiveSession(s1);
		store.setActiveSession(s2);

		assert.strictEqual(canGoBack(), true);
		assert.strictEqual(canGoForward(), false);
	});

	test('goBack restores previous session', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);

		store.setActiveSession(s1);
		store.setActiveSession(s2);

		await nav.goBack();

		assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
		assert.strictEqual(canGoBack(), true);
		assert.strictEqual(canGoForward(), true);
	});

	test('goForward restores next session after goBack', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);

		store.setActiveSession(s1);
		store.setActiveSession(s2);

		await nav.goBack();
		await nav.goForward();

		assert.strictEqual(store.lastOpenedResource?.toString(), s2.resource.toString());
		assert.strictEqual(canGoBack(), true);
		assert.strictEqual(canGoForward(), false);
	});

	test('opening a new session after goBack keeps older entries reachable (MRU, no truncation)', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		const s3 = stubSession('s3');
		store.addSession(s1);
		store.addSession(s2);
		store.addSession(s3);

		store.setActiveSession(s1); // recency=[s1]
		store.setActiveSession(s2); // recency=[s2, s1], cursor=s2

		await nav.goBack(); // cursor=s1
		// Now open s3 explicitly: s3 is promoted to the front -> recency=[s3, s2, s1]
		store.setActiveSession(s3);

		assert.strictEqual(canGoBack(), true);
		assert.strictEqual(canGoForward(), false);

		// Unlike browser-style truncation, s2 is NOT discarded; going back from
		// s3 lands on the next most-recent entry, s2.
		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s2.resource.toString());

		// And s1 remains reachable one step further back.
		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
	});

	test('reopening an earlier session moves it to the front of recency (no duplicates)', async () => {
		// A→B→C, back→back→fwd→fwd, open A again
		// should move A to the front: recency=[A,C,B] (no duplicate A)
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		const s3 = stubSession('s3');
		store.addSession(s1);
		store.addSession(s2);
		store.addSession(s3);

		store.setActiveSession(s1); // recency=[s1]
		store.setActiveSession(s2); // recency=[s2,s1]
		store.setActiveSession(s3); // recency=[s3,s2,s1]

		await nav.goBack();  // cursor=s2
		await nav.goBack();  // cursor=s1
		await nav.goForward(); // cursor=s2
		await nav.goForward(); // cursor=s3

		// Now open s1 again — moves to front: recency=[s1,s3,s2]
		store.setActiveSession(s1);

		// Back once: s3
		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s3.resource.toString());

		// Back once more: s2
		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s2.resource.toString());

		await nav.goBack();
		assert.strictEqual(store.lastOpenedNewSession, true);
		assert.strictEqual(canGoBack(), false);
	});

	test('the initial new-session view can be revisited in both directions', async () => {
		const session = stubSession('s1');
		store.addSession(session);
		store.setActiveSession(session);

		const back = await navigate('back', 1);
		const atNewSession = { back: canGoBack(), forward: canGoForward() };
		const forward = await navigate('forward', 1);

		assert.deepStrictEqual({ back, atNewSession, forward, canGoForward: canGoForward() }, {
			back: ['newSession'],
			atNewSession: { back: false, forward: true },
			forward: ['s1'],
			canGoForward: false,
		});
	});

	test('reopening new-session moves its only entry to the most recent position', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);

		await store.openSession(s1.resource);
		await store.openNewSession();
		await store.openSession(s2.resource);
		await nav.goBack();
		await nav.goForward();
		await store.openNewSession();

		const back = await navigate('back', 2);
		const atOldest = { back: canGoBack(), forward: canGoForward() };
		const forward = await navigate('forward', 2);

		assert.deepStrictEqual({ back, atOldest, forward, canGoForward: canGoForward() }, {
			back: ['s2', 's1'],
			atOldest: { back: false, forward: true },
			forward: ['s2', 'newSession'],
			canGoForward: false,
		});
	});

	test('custom views participate in back and forward navigation alongside sessions', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);
		registerCustomView('automations');

		await store.openSession(s1.resource);
		customViewService.showCustomView('automations');
		await store.openSession(s2.resource);

		const back = await navigate('back', 3);
		const atOldest = { back: canGoBack(), forward: canGoForward() };
		const forward = await navigate('forward', 3);

		assert.deepStrictEqual({ back, atOldest, forward, canGoForward: canGoForward() }, {
			back: ['automations', 's1', 'newSession'],
			atOldest: { back: false, forward: true },
			forward: ['s1', 'automations', 's2'],
			canGoForward: false,
		});
	});

	test('each custom view retains only its most recent opening', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);
		registerCustomView('automations');
		registerCustomView('other');

		await store.openSession(s1.resource);
		customViewService.showCustomView('automations');
		await store.openSession(s2.resource);
		customViewService.showCustomView('other');
		customViewService.showCustomView('automations');

		const back = await navigate('back', 4);
		const canGoFurtherBack = canGoBack();
		const forward = await navigate('forward', 4);

		assert.deepStrictEqual({ back, canGoFurtherBack, forward, canGoForward: canGoForward() }, {
			back: ['other', 's2', 's1', 'newSession'],
			canGoFurtherBack: false,
			forward: ['s1', 's2', 'other', 'automations'],
			canGoForward: false,
		});
	});

	test('opening a custom view after going back preserves the existing MRU order', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);
		registerCustomView('automations');

		await store.openSession(s1.resource);
		await store.openSession(s2.resource);
		await nav.goBack();
		customViewService.showCustomView('automations');

		assert.deepStrictEqual(await navigate('back', 3), ['s2', 's1', 'newSession']);
	});

	test('new-session and custom views are navigable without a created session', async () => {
		registerCustomView('automations');
		customViewService.showCustomView('automations');
		const back = await navigate('back', 1);
		const forward = await navigate('forward', 1);
		await store.openNewSession();
		const reopenedBack = await navigate('back', 1);

		assert.deepStrictEqual({ back, forward, reopenedBack, canGoBack: canGoBack() }, {
			back: ['newSession'],
			forward: ['automations'],
			reopenedBack: ['automations'],
			canGoBack: false,
		});
	});

	test('background session changes do not move a custom view in history', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);
		registerCustomView('automations');

		await store.openSession(s1.resource);
		customViewService.showCustomView('automations');
		await store.openSession(s2.resource);
		await nav.goBack();
		store.setActiveSession(undefined);

		assert.deepStrictEqual({
			activeView: customViewService.activeCustomView.get()?.id,
			forward: await navigate('forward', 1),
			back: await navigate('back', 2),
		}, {
			activeView: 'automations',
			forward: ['s2'],
			back: ['automations', 's1'],
		});
	});

	for (const direction of ['back', 'forward'] as const) {
		test(`unregistered custom views are skipped when navigating ${direction}`, async () => {
			const s1 = stubSession('s1');
			const s2 = stubSession('s2');
			store.addSession(s1);
			store.addSession(s2);
			const registration = registerCustomView('automations');

			await store.openSession(s1.resource);
			customViewService.showCustomView('automations');
			await store.openSession(s2.resource);
			if (direction === 'forward') {
				await navigate('back', 2);
			}
			registration.dispose();

			assert.deepStrictEqual({
				destinations: await navigate(direction, 1),
				customViews: recency.entries.filter(entry => entry.kind === 'customView'),
			}, {
				destinations: [direction === 'back' ? 's1' : 's2'],
				customViews: [],
			});
		});
	}

	test('missing sessions are skipped without consuming a navigation step', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);

		store.setActiveSession(s1);
		store.setActiveSession(stubSession('missing'));
		store.setActiveSession(s2);

		assert.deepStrictEqual(await navigate('back', 1), ['s1']);
	});

	test('only session entries are persisted, in the existing recency format', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);
		registerCustomView('automations');

		await store.openSession(s1.resource);
		customViewService.showCustomView('automations');
		await store.openNewSession();
		await store.openSession(s2.resource);
		const restored = ds.add(new SessionsRecencyHistory(storageService, new NullLogService()));

		assert.deepStrictEqual(restored.entries.map(entry => entry.kind === 'session' ? {
			kind: entry.kind,
			session: entry.sessionResource.toString(),
			chat: entry.chatResource?.toString(),
		} : entry), [
			{ kind: 'session', session: s2.resource.toString(), chat: stubChat.resource.toString() },
			{ kind: 'session', session: s1.resource.toString(), chat: stubChat.resource.toString() },
		]);
	});

	test('singleton views preserve all 50 restored session entries', () => {
		const sessions = Array.from({ length: 50 }, (_, index) => ({
			kind: 'session' as const,
			sessionResource: URI.parse(`test:///session-${index}`),
			chatResource: URI.parse(`test:///chat-${index}`),
		}));
		for (const entry of sessions) {
			recency.markOpened(entry);
		}
		const restored = ds.add(new SessionsRecencyHistory(storageService, new NullLogService()));
		restored.markOpened({ kind: 'newSession' });
		restored.markOpened({ kind: 'customView', id: 'automations' });
		restored.markOpened({ kind: 'customView', id: 'settings' });
		restored.markOpened({ kind: 'newSession' });
		const reloaded = ds.add(new SessionsRecencyHistory(storageService, new NullLogService()));
		const expectedSessions = [...sessions].reverse().map(getRecencyEntryKey);

		assert.deepStrictEqual({
			navigation: restored.entries.map(getRecencyEntryKey),
			persisted: reloaded.entries.map(getRecencyEntryKey),
		}, {
			navigation: [
				'newSession',
				'customView:settings',
				'customView:automations',
				...expectedSessions,
			],
			persisted: expectedSessions,
		});
	});

	test('the 50-session cap evicts only the oldest session entry', () => {
		const sessions = Array.from({ length: 51 }, (_, index) => ({
			kind: 'session' as const,
			sessionResource: URI.parse(`test:///session-${index}`),
			chatResource: URI.parse(`test:///chat-${index}`),
		}));
		recency.markOpened({ kind: 'customView', id: 'automations' });
		for (const entry of sessions) {
			recency.markOpened(entry);
		}
		const restored = ds.add(new SessionsRecencyHistory(storageService, new NullLogService()));
		const expectedSessions = sessions.slice(1).reverse().map(getRecencyEntryKey);

		assert.deepStrictEqual({
			navigation: recency.entries.map(getRecencyEntryKey),
			persisted: restored.entries.map(getRecencyEntryKey),
		}, {
			navigation: [
				...expectedSessions,
				'customView:automations',
				'newSession',
			],
			persisted: expectedSessions,
		});
	});

	test('navigating to new-session view after a session enables go back', async () => {
		const s1 = stubSession('s1');
		store.addSession(s1);

		store.setActiveSession(s1);
		store.setActiveSession(undefined); // user explicitly went to new-session view

		assert.strictEqual(canGoBack(), true);
		assert.strictEqual(canGoForward(), false);

		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
	});

	test('navigating to new-session view with no history does not enable go back', () => {
		store.setActiveSession(undefined); // new-session view with empty history

		assert.strictEqual(canGoBack(), false);
	});

	test('duplicate consecutive session is not added to history', () => {
		const s1 = stubSession('s1');
		store.addSession(s1);

		store.setActiveSession(s1);
		store.setActiveSession(s1); // duplicate

		assert.deepStrictEqual(recency.entries.map(entry => entry.kind), ['session', 'newSession']);
	});

	test('removed sessions are cleaned from history', async () => {
		const s1 = stubSession('s1');
		const s2 = stubSession('s2');
		const s3 = stubSession('s3');
		store.addSession(s1);
		store.addSession(s2);
		store.addSession(s3);

		store.setActiveSession(s1);
		store.setActiveSession(s2);
		store.setActiveSession(s3);

		// Remove s2 from history
		nav.onDidRemoveSessions({ added: [], removed: [s2], changed: [] });

		// Going back from s3 should skip s2 and go to s1
		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
	});

	test('untitled sessions share the new-session view entry', () => {
		const pending = stubSession('pending', SessionStatus.Untitled);
		store.addSession(pending);
		store.setActiveSession(pending);

		assert.strictEqual(canGoBack(), false);

		const s1 = stubSession('s1');
		store.addSession(s1);
		store.setActiveSession(s1);

		assert.strictEqual(canGoBack(), true);

		// Opening a second real session: history is [s1, s2], can go back
		const s2 = stubSession('s2');
		store.addSession(s2);
		store.setActiveSession(s2);

		assert.deepStrictEqual(recency.entries.map(entry => entry.kind), ['session', 'session', 'newSession']);
	});

	test('go to new-session, goBack, go to new-session again still enables back', async () => {
		// Regression: after goBack from new-session view, going to new-session again
		// must still enable back. The autorun must keep activeSession tracked even
		// when it returns early during navigation (_navigating=true).
		const s1 = stubSession('s1');
		store.addSession(s1);
		store.setActiveSession(s1); // history=[s1], idx=0

		store.setActiveSession(undefined); // go to new-session view
		assert.strictEqual(canGoBack(), true, 'back enabled after first new-session view');

		await nav.goBack(); // back to s1
		assert.strictEqual(canGoBack(), false, 'back disabled on s1');

		store.setActiveSession(undefined); // go to new-session view again
		assert.strictEqual(canGoBack(), true, 'back enabled after second new-session view');
	});

	test('switching chats within a session is recorded in history', () => {
		const chatA = stubChatWithId('a');
		const chatB = stubChatWithId('b');
		const s1 = stubSession('s1', SessionStatus.Completed, [chatA, chatB]);
		store.addSession(s1);

		store.setActiveSession(s1, chatA);

		// Switch to chat B within the same session
		store.setActiveChat(chatB);
		assert.deepStrictEqual(recency.entries, [
			{ kind: 'session', sessionResource: s1.resource, chatResource: chatB.resource },
			{ kind: 'session', sessionResource: s1.resource, chatResource: chatA.resource },
			{ kind: 'newSession' },
		]);
	});

	test('goBack restores previous chat within a session', async () => {
		const chatA = stubChatWithId('a');
		const chatB = stubChatWithId('b');
		const s1 = stubSession('s1', SessionStatus.Completed, [chatA, chatB]);
		store.addSession(s1);

		store.setActiveSession(s1, chatA);
		store.setActiveChat(chatB);

		await nav.goBack();
		assert.strictEqual(store.lastOpenedChatResource?.toString(), chatA.resource.toString());
		assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
	});

	test('navigation across sessions and chats works together', async () => {
		const chatA = stubChatWithId('a');
		const chatB = stubChatWithId('b');
		const s1 = stubSession('s1', SessionStatus.Completed, [chatA, chatB]);
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);

		// s1/chatA → s1/chatB → s2
		store.setActiveSession(s1, chatA);
		store.setActiveChat(chatB);
		store.setActiveSession(s2);

		// Go back to s1/chatB
		await nav.goBack();
		assert.strictEqual(store.lastOpenedChatResource?.toString(), chatB.resource.toString());

		// Go back to s1/chatA
		await nav.goBack();
		assert.strictEqual(store.lastOpenedChatResource?.toString(), chatA.resource.toString());

		// Go forward to s1/chatB
		await nav.goForward();
		assert.strictEqual(store.lastOpenedChatResource?.toString(), chatB.resource.toString());

		// Go forward to s2
		await nav.goForward();
		assert.strictEqual(store.lastOpenedResource?.toString(), s2.resource.toString());
	});

	test('untitled chats are not recorded with a chat resource', () => {
		const chatUntitled = stubChatWithId('untitled', SessionStatus.Untitled);
		const s1 = stubSession('s1', SessionStatus.Completed, [chatUntitled]);
		store.addSession(s1);

		store.setActiveSession(s1, chatUntitled);
		assert.deepStrictEqual(recency.entries, [
			{ kind: 'session', sessionResource: s1.resource, chatResource: undefined },
			{ kind: 'newSession' },
		]);
	});

	test('goBack falls back to openSession when chat was deleted', async () => {
		const chatA = stubChatWithId('a');
		const chatB = stubChatWithId('b');
		const chatsObs = observableValue<readonly IChat[]>('test.chats', [chatA, chatB]);
		const s1: ISession = {
			...stubSession('s1', SessionStatus.Completed, [chatA, chatB]),
			chats: chatsObs,
		};
		const s2 = stubSession('s2');
		store.addSession(s1);
		store.addSession(s2);

		// Record history: s1/chatA → s1/chatB → s2
		store.setActiveSession(s1, chatA);
		store.setActiveChat(chatB);
		store.setActiveSession(s2);

		// Remove chatB from the session
		chatsObs.set([chatA], undefined);

		// Go back — chatB is stale, should fall back to openSession(s1)
		await nav.goBack();
		assert.strictEqual(store.lastOpenedResource?.toString(), s1.resource.toString());
		assert.strictEqual(store.lastOpenedChatResource, undefined, 'should not open a stale chat');
	});
});
