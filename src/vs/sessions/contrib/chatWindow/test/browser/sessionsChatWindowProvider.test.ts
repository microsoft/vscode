/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatWindow, IChatWindowOpenOptions, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ChatWindowGrid, ChatWindowGridCell } from '../../../../../workbench/contrib/chatWindow/browser/chatWindowGrid.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import '../../../../../workbench/contrib/sessions/browser/parts/media/sessionActivityBar.css';
import '../../../../../workbench/browser/parts/activitybar/media/menuActivityBar.css';
import '../../../../browser/media/workbench.css';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ChatHostOpenerService, IChatHostOpenerService } from '../../../../../workbench/contrib/sessions/browser/chatHostOpener.js';
import { ChatInteractivity, IChat, ISession, ISessionChangeset, ISessionChangesetOperation, SessionChangesetOperationScope, SessionStatus } from '../../../../../workbench/contrib/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../../common/chatWindows.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { SessionChangesEditorFileListContext } from '../../../../../workbench/contrib/sessions/common/changes.js';
import { SessionChangesetOperationsContext } from '../../../changes/browser/changesActions.js';
import { ActiveSessionState, IChangesSessionObservables, IChangesViewService } from '../../../../../workbench/contrib/sessions/common/changesViewService.js';
import { IGitHubService } from '../../../../../workbench/contrib/sessions/browser/github/githubService.js';
import { GitHubPullRequestCIModel } from '../../../../../workbench/contrib/sessions/browser/github/models/githubPullRequestCIModel.js';
import { findSessionActivityBarExternalHost, getSessionActivityBarSize, SessionActivityBarColumn, setSessionActivityBarSize } from '../../../../../workbench/contrib/sessions/browser/parts/sessionActivityBarHost.js';
import { MenuActivityBar, MenuActivityBarSize } from '../../../../../workbench/browser/parts/activitybar/menuActivityBar.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../../../workbench/contrib/sessions/common/layoutConstants.js';
import { AGENTS_CHAT_WINDOW_CLASS, CHAT_WINDOW_MAIN_PART_GROUP_VIEW_OPTIONS, focusChatWindowUnlessFocused, getChatWindowMainPartOptions, SessionsChatWindowProvider } from '../../browser/sessionsChatWindowProvider.js';
import { DesktopMainEditorPart } from '../../../../browser/parts/desktopEditorPart.js';
import { IEditorGroupViewOptions } from '../../../../../workbench/browser/parts/editor/editor.js';
import { EditorInputCapabilities, GroupModelChangeKind } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IGroupModelChangeEvent } from '../../../../../workbench/common/editor/editorGroupModel.js';
import { stubSessionHosts } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ISessionHost } from '../../../../../workbench/contrib/sessions/browser/sessionHost.js';
import { ITitleService } from '../../../../../workbench/services/title/browser/titleService.js';
import { IAuxiliaryTitlebarPart } from '../../../../../workbench/browser/parts/titlebar/titlebarPart.js';

suite('Sessions chat window provider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createChat(path: string, archived = false): IChat {
		return new class extends mock<IChat>() {
			override readonly resource = URI.parse(`test:/${path}`);
			override readonly title = constObservable(path);
			override readonly isArchived = observableValue('archived', archived);
			override readonly isRead = constObservable(true);
			override readonly interactivity = constObservable(ChatInteractivity.Full);
			override readonly status = constObservable(SessionStatus.Completed);
			override readonly workspace = constObservable(undefined);
			override readonly changes = constObservable([]);
			override readonly changesets = constObservable(undefined);
		}();
	}

	function createSession(name: string, chats: IChat[]): ISession {
		return new class extends mock<ISession>() {
			override readonly sessionId = name;
			override readonly resource = URI.parse(`test:/${name}`);
			override readonly title = constObservable(name);
			override readonly loading = constObservable(false);
			override readonly chats = constObservable(chats);
			override readonly mainChat = constObservable(chats[0]);
			override readonly status = constObservable(SessionStatus.Completed);
			override readonly isArchived = constObservable(false);
			override readonly workspace = constObservable(undefined);
			override readonly capabilities = constObservable({ supportsMultipleChats: false, supportsFork: false, supportsSideChat: false, supportsRename: false, supportsDelete: false });
		}();
	}

	function createProvider(store: DisposableStore, sessions: ISession[]) {
		const events: string[] = [];
		// The main window shows another session than those that move into it, such as one whose opening was cancelled
		const mainWindowActiveSession = constObservable<IActiveSession | undefined>(undefined);
		const onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());
		const visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []);
		const configuration = new TestConfigurationService({ [CHAT_WINDOWS_ENABLED_SETTING]: true });
		const sentiment = observableValue<IChatSentiment>('sentiment', {});
		const instantiationService = store.add(new TestInstantiationService());
		stubSessionHosts(instantiationService, store);
		instantiationService.stub(IConfigurationService, configuration);
		const storage = store.add(new TestStorageService());
		instantiationService.stub(IStorageService, storage);
		const editorGroups: IEditorGroup[] = [];
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override get groups() { return editorGroups; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly mainPart = upcastPartial<IEditorPart>({ activeGroup: upcastPartial<IEditorGroup>({ id: 1 }) });
		}());
		const openEditors = async (editors: readonly { readonly editor: unknown; readonly options?: { readonly inactive?: boolean } }[]) => {
			events.push(`open editors ${editors.map(({ editor, options }) => `${(editor as { name: string }).name}${options?.inactive ? '' : ' (active)'}`).join(', ')}`);
			return [];
		};
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ openEditors: openEditors as unknown as IEditorService['openEditors'] }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ setPartHidden: () => { } }));
		instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly sentimentObs = sentiment as IObservable<IChatSentiment>;
		}());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override getSession(resource: URI) { return sessions.find(session => session.resource.toString() === resource.toString()); }
			override getSessions() { return sessions; }
			override getSessionForChatResource(resource: URI) {
				for (const session of sessions) {
					const chat = session.chats.get().find(candidate => candidate.resource.toString() === resource.toString());
					if (chat) {
						return { session, chat };
					}
				}
				return undefined;
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly visibleSessions = visibleSessions;
			override readonly initialRestoreComplete = constObservable(true);
			readonly mainWindowActiveSession = mainWindowActiveSession;
			override async openMovedChats(chats: readonly { readonly session: ISession; readonly chatResource: URI }[]) {
				// A chat that a window still claims would open in that window again, not in the grid
				events.push(`open moved ${chats.map(chat => `${chat.session.sessionId} ${chat.chatResource.path}${chatHostOpenerService.getOpenerOf(chat.chatResource) ? ' (claimed by a window)' : ''}`).join(', ')}`);
			}
			override hideChatFromGrid(session: ISession, chat: URI) {
				events.push(`hide ${session.sessionId} ${chat.path}`);
				return toDisposable(() => events.push(`show ${session.sessionId} ${chat.path}`));
			}
			override async openChat(session: ISession, chat: URI) { events.push(`open ${session.sessionId} ${chat.path}`); }
			override async openChatToSide(session: ISession, chat: URI, options?: { preserveFocus?: boolean; referenceChatResource?: URI }) {
				events.push(`open ${session.sessionId} ${chat.path} beside ${options?.referenceChatResource?.path}${options?.preserveFocus ? ' preserving focus' : ''}`);
			}
		}());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override readonly windows = constObservable([window]);
			override async open(chat: URI, options?: IChatWindowOpenOptions) {
				events.push(`window open ${chat.path}${options?.window ? ` in ${options.window.windowId}` : ''}${options?.beside ? ` beside ${options.beside.path}` : ''}`);
				return undefined;
			}
		}());
		const chatHostOpenerService = new ChatHostOpenerService();
		instantiationService.stub(IChatHostOpenerService, chatHostOpenerService);
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider() { return undefined; }
		}());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override acquireExistingSession() { return undefined; }
		}());
		// The changes of the session a window shows: a changeset with an operation on its files.
		const operations = [upcastPartial<ISessionChangesetOperation>({ id: 'discard', label: 'Discard Changes', scopes: [SessionChangesetOperationScope.Resource] })];
		instantiationService.stub(IChangesViewService, upcastPartial<IChangesViewService>({
			getSessionChanges: () => upcastPartial<IChangesSessionObservables>({
				changesetObs: constObservable(upcastPartial<ISessionChangeset>({ id: 'uncommitted', operations: constObservable(operations) })),
				changesetOperationsObs: constObservable(operations),
				changesObs: constObservable([]),
				changesetsLoadingObs: constObservable(false),
				loadingObs: constObservable(false),
				stateObs: constObservable(upcastPartial<ActiveSessionState>({})),
			}),
		}));
		instantiationService.stub(ILogService, new NullLogService());
		// The title bars it creates for its windows
		const titleBars: { readonly container: HTMLElement; readonly editorGroupsContainer: unknown; readonly instantiationService: IInstantiationService; setHeight(height: number): void; readonly layouts: string[]; disposed: boolean }[] = [];
		instantiationService.stub(ITitleService, upcastPartial<ITitleService>({
			createAuxiliaryTitlebarPart: (container, editorGroupsContainer, partInstantiationService) => {
				const onDidChange = store.add(new Emitter<undefined>());
				let height = 44;
				const titleBar = { container, editorGroupsContainer, instantiationService: partInstantiationService, setHeight: (value: number) => { height = value; onDidChange.fire(undefined); }, layouts: [] as string[], disposed: false };
				titleBars.push(titleBar);
				return upcastPartial<IAuxiliaryTitlebarPart>({
					get height() { return height; },
					onDidChange: onDidChange.event,
					layout: (width: number, layoutHeight: number) => { titleBar.layouts.push(`${width}x${layoutHeight}`); },
					dispose: () => { titleBar.disposed = true; },
				});
			},
		}));
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			getSessionPullRequest: () => upcastPartial<ReturnType<IGitHubService['getSessionPullRequest']>>({
				pullRequestCIObs: constObservable(upcastPartial<GitHubPullRequestCIModel>({ checks: constObservable([]), requiredChecks: constObservable(undefined), fixRequested: observableValue('fixRequested', false) })),
			}),
		}));
		const provider = store.add(instantiationService.createInstance(SessionsChatWindowProvider));
		return { provider, storage, events, window, titleBars, windowInstantiationService: store.add(instantiationService.createChild(new ServiceCollection([IContextKeyService, store.add(new ContextKeyService(configuration))]))), onDidChangeSessions, sentiment, configuration, editorGroups, activeChat, chatHostOpenerService, visibleSessions };
	}

	/** The window the chats show in: its active chat is `activeChat`. */
	const activeChat = observableValue<URI>('activeChat', URI.parse('test:/main'));
	const window = new class extends mock<IChatWindow>() {
		override readonly windowId = 42;
		override readonly mainPart = new class extends mock<IContentPart>() {
			override readonly groups = [];
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
		}();
		override readonly layoutMode = constObservable(ChatWindowLayoutMode.SideBySide);
		override readonly onDidClose = Event.None;
		override readonly chat = activeChat;
		override readonly chats = derived(reader => [activeChat.read(reader)]);
	}();

	test('a chat window shows each chat as a session of its own scoped to the chat, also of a session by its main chat; it keeps the chat out of the main window\'s grid while it shows it, acts on its active chat and binds its keys, without making its session the active session', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('second')]);
		const { provider, events, windowInstantiationService } = createProvider(store, [session]);

		const unknown = await provider.resolveContent(URI.parse('test:/unknown'));
		const content = (await provider.resolveContent(session.resource))!;
		const ofSession = (await content.resolveChat(session.resource))!;
		const second = (await content.resolveChat(URI.parse('test:/second')))!;
		store.add(content.bind!(window, windowInstantiationService));
		activeChat.set(URI.parse('test:/second'), undefined);
		const host = content.services!.get(ISessionHost) as ISessionHost;
		const contextKeyService = windowInstantiationService.invokeFunction(accessor => accessor.get(IContextKeyService));
		const shown = {
			chats: [ofSession, second].map(chat => ({ chat: chat.chat.get().path, title: chat.title.get(), scopedTo: (chat as unknown as { session: IObservable<IActiveSession | undefined> }).session.get()?.scopedChatResource?.path })),
			host: { session: host.session.get()?.sessionId, chat: host.chat.get()?.resource.path },
			changesetOperations: contextKeyService.getContextKeyValue(SessionChangesetOperationsContext.key),
			changesFileList: contextKeyService.getContextKeyValue(SessionChangesEditorFileListContext.key),
		};
		content.dispose();
		activeChat.set(URI.parse('test:/main'), undefined);

		assert.deepStrictEqual({ unknown, shown, events }, {
			unknown: undefined,
			shown: {
				chats: [{ chat: '/main', title: 'main', scopedTo: '/main' }, { chat: '/second', title: 'second', scopedTo: '/second' }],
				host: { session: 'session', chat: '/second' },
				changesetOperations: ['resource:discard'],
				changesFileList: true,
			},
			events: ['hide session /main', 'hide session /second', 'show session /main', 'show session /second'],
		});
	});

	test('another resource of a chat a window shows, such as its session\'s, resolves to the entry the window has of it, not to one of its own', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main')]);
		const { provider, events } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const shown = (await content.resolveChat(URI.parse('test:/main')))!;

		const ofSession = await content.resolveChat(session.resource);

		assert.deepStrictEqual({ same: ofSession === shown, events }, { same: true, events: ['hide session /main'] });
	});

	test('a session resolves to the chat its grid slot shows, unless the exact chat is asked for, which is its main chat', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('peer')]);
		const { provider, visibleSessions } = createProvider(store, [session]);
		visibleSessions.set([upcastPartial<IActiveSession>({ sessionId: 'session', activeChat: constObservable(session.chats.get()[1]) })], undefined);
		const content = store.add((await provider.resolveContent(session.resource))!);

		const exact = await content.resolveChat(session.resource, true);
		const substituted = await content.resolveChat(session.resource);

		assert.deepStrictEqual({ exact: exact?.chat.get().path, substituted: substituted?.chat.get().path }, { exact: '/main', substituted: '/peer' });
	});

	test('a chat leaves its window once it is archived, or deleted once its session listed its chats', async () => {
		const store = disposables.add(new DisposableStore());
		const isArchived = observableValue('archived', false);
		const archived = Object.assign(createChat('archived'), { isArchived });
		const chats = observableValue<IChat[]>('chats', [createChat('main'), archived, createChat('deleted')]);
		const session = Object.assign(createSession('session', chats.get()), { chats });
		const { provider, onDidChangeSessions } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const ended: string[] = [];
		for (const resource of ['test:/archived', 'test:/deleted', 'test:/main']) {
			const chat = (await content.resolveChat(URI.parse(resource)))!;
			store.add(chat.onDidEnd(() => ended.push(chat.chat.get().path)));
		}

		isArchived.set(true, undefined);
		chats.set(chats.get().filter(chat => chat.resource.path !== '/deleted'), undefined);
		onDidChangeSessions.fire({ added: [], changed: [session], removed: [] });

		assert.deepStrictEqual(ended, ['/archived', '/deleted']);
	});

	test('opening a chat a window shows reveals it there, and a chat opened beside one it shows opens beside it in that window; once the chat\'s editor closed, such as with its window, which is still going away, the window does not show it: it opens elsewhere, not in a new window', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const { provider, events, chatHostOpenerService, editorGroups } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const main = (await content.resolveChat(URI.parse('test:/main')))!;
		// The group of the window that shows the chat's editor
		const group = upcastPartial<IEditorGroup>({ contains: editor => editor === main.input });
		editorGroups.push(group);

		const opener = chatHostOpenerService.getOpenerOf(URI.parse('test:/main'));
		const notShown = chatHostOpenerService.getOpenerOf(URI.parse('test:/subagent'));
		await opener?.reveal(URI.parse('test:/main'));
		await opener?.openBeside(URI.parse('test:/subagent'), URI.parse('test:/main'));
		editorGroups.splice(editorGroups.indexOf(group), 1);
		const afterEditorClosed = chatHostOpenerService.getOpenerOf(URI.parse('test:/main'));

		assert.deepStrictEqual({ shown: !!opener, notShown, afterEditorClosed, events: events.filter(event => event.startsWith('window')) }, {
			shown: true,
			notShown: undefined,
			afterEditorClosed: undefined,
			events: ['window open /main', 'window open /subagent in 42 beside /main'],
		});
	});

	test('a chat its window closed for it to show elsewhere shows there again when restored: in that window, as long as it stays', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const { provider, events, chatHostOpenerService, editorGroups, window, windowInstantiationService } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		store.add(content.bind!(window, windowInstantiationService));
		const subagent = (await content.resolveChat(URI.parse('test:/subagent')))!;
		let open = true;
		editorGroups.push(upcastPartial<IEditorGroup>({
			contains: editor => open && editor === subagent.input,
			closeEditor: async () => {
				open = false;
				return true;
			},
		}));
		const opener = chatHostOpenerService.getOpenerOf(URI.parse('test:/subagent'))!;

		const closed = await opener.close(URI.parse('test:/subagent'));
		await closed?.restore();

		assert.deepStrictEqual({ closed: !!closed, events: events.filter(event => event.startsWith('window')) }, { closed: true, events: ['window open /subagent in 42'] });
	});

	test('a chat whose close its window vetoes is not closed: there is nothing to show it there again', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const { provider, chatHostOpenerService, editorGroups, window, windowInstantiationService } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		store.add(content.bind!(window, windowInstantiationService));
		const subagent = (await content.resolveChat(URI.parse('test:/subagent')))!;
		editorGroups.push(upcastPartial<IEditorGroup>({
			contains: editor => editor === subagent.input,
			closeEditor: async () => false,
		}));

		const closed = await chatHostOpenerService.getOpenerOf(URI.parse('test:/subagent'))!.close(URI.parse('test:/subagent'));

		assert.strictEqual(closed, undefined);
	});

	test('Move to Main Window, once the window closed its chats\' editors as it closes, opens every chat in the grid: no window, which is still going away, claims them, so none opens again', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const other = createSession('other', [createChat('elsewhere')]);
		const { provider, events, editorGroups } = createProvider(store, [session, other]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const shown = await Promise.all(['test:/elsewhere', 'test:/main', 'test:/subagent'].map(async chat => (await content.resolveChat(URI.parse(chat)))!));
		// The chat part of the window, which shows the chats' editors until it closes with the window
		const chatPart = upcastPartial<IEditorGroup>({ contains: editor => shown.some(chat => chat.input === editor) });
		editorGroups.push(chatPart);

		await provider.moveToMainWindow([URI.parse('test:/elsewhere')], {});
		editorGroups.splice(editorGroups.indexOf(chatPart), 1);
		await provider.moveToMainWindow([URI.parse('test:/elsewhere'), URI.parse('test:/main'), URI.parse('test:/subagent')], {});

		assert.deepStrictEqual(events.filter(event => !event.startsWith('hide')), [
			'open moved other /elsewhere (claimed by a window)',
			'open moved other /elsewhere, session /main, session /subagent',
		]);
	});

	test('Move to Main Window shows the chats of the window in the main window, its active one first, also of other sessions; it then opens its other editors there, without waiting for a session that does not become active', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const other = createSession('other', [createChat('elsewhere')]);
		const { provider, events } = createProvider(store, [session, other]);

		await provider.moveToMainWindow([URI.parse('test:/elsewhere'), URI.parse('test:/main'), URI.parse('test:/subagent')], { editors: [{ name: 'file.ts' } as unknown as EditorInput] });

		assert.deepStrictEqual(events, ['open moved other /elsewhere, session /main, session /subagent', 'open editors file.ts (active)']);
	});

	test('a chat follows the chats of its session, which change without the sessions changing: it leaves its window once deleted, and shows the chat that replaces it', async () => {
		const store = disposables.add(new DisposableStore());
		const main = createChat('main');
		const chats = observableValue<IChat[]>('chats', [main, createChat('deleted')]);
		const session = Object.assign(createSession('session', chats.get()), { chats });
		const { provider } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const ended: string[] = [];
		const shown = (await content.resolveChat(URI.parse('test:/main')))! as unknown as { session: IObservable<IActiveSession | undefined> };
		const deleted = (await content.resolveChat(URI.parse('test:/deleted')))!;
		store.add(deleted.onDidEnd(() => ended.push('/deleted')));
		const before = shown.session.get()?.activeChat.get();

		const replacement = createChat('main');
		chats.set([replacement], undefined);

		assert.deepStrictEqual({ ended, before: before === main, after: shown.session.get()?.activeChat.get() === replacement }, { ended: ['/deleted'], before: true, after: true });
	});

	test('the tab of the last chat of a window, while another editor is beside it in its group, shows the chat\'s title and offers no close action; alone again, it closes as before', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main')]);
		const { provider, windowInstantiationService, editorGroups } = createProvider(store, [session]);
		const content = (await provider.resolveContent(session.resource))!;
		const chat = (await content.resolveChat(session.resource))!;
		const onModelChange = store.add(new Emitter<IGroupModelChangeEvent>());
		const tab = upcastPartial<EditorInput>({});
		const editors: EditorInput[] = [chat.input, tab];
		editorGroups.push(upcastPartial<IEditorGroup>({
			windowId: window.windowId,
			get count() { return editors.length; },
			contains: (editor: EditorInput) => editors.includes(editor),
			onDidModelChange: onModelChange.event,
		}));

		store.add(content.bind!(window, windowInstantiationService));
		const withTab = { name: chat.input.getName(), cannotClose: chat.input.hasCapability(EditorInputCapabilities.CannotClose) };
		editors.pop();
		onModelChange.fire({ kind: GroupModelChangeKind.EDITOR_CLOSE, editor: tab });
		const alone = chat.input.hasCapability(EditorInputCapabilities.CannotClose);
		content.dispose();
		editorGroups.length = 0;

		assert.deepStrictEqual({ withTab, alone }, { withTab: { name: 'main', cannotClose: true }, alone: false });
	});

	test('a chat window restores while its chat is there, and forgets the chats of removed sessions; it restores only while enabled and AI features show', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('archived', true)]);
		const { provider, onDidChangeSessions, sentiment } = createProvider(store, [session]);
		const removed: string[][] = [];
		store.add(provider.onDidRemoveChats(chats => removed.push(chats.map(chat => chat.path))));

		const restores = await Promise.all(['test:/main', 'test:/archived', 'test:/session'].map(resource => provider.canRestore(URI.parse(resource))));
		const enabled = provider.restoreEnabled.get();
		sentiment.set({ hidden: true }, undefined);
		const hidden = provider.restoreEnabled.get();
		onDidChangeSessions.fire({ added: [], changed: [], removed: [session] });

		assert.deepStrictEqual({ restores, enabled, hidden, removed }, {
			restores: [true, false, true],
			enabled: true,
			hidden: false,
			removed: [['/session', '/main', '/archived']],
		});
	});

	test('the main part of a chat window follows the tabs setting, with none showing one tab so that its actions show, and arranges no groups on a double click', () => {
		assert.deepStrictEqual(['multiple', 'single', 'none'].map(getChatWindowMainPartOptions), [
			{ doubleClickTabToToggleEditorGroupSizes: 'off' },
			{ doubleClickTabToToggleEditorGroupSizes: 'off' },
			{ doubleClickTabToToggleEditorGroupSizes: 'off', showTabs: 'single' },
		]);
	});

	test('the Session Activity Bar of a chat window shows in a column of its own at the right of the window, at the size chosen for it and as wide as the main window\'s, whatever the layout mode, never inside the chat', () => {
		const store = disposables.add(new DisposableStore());
		const { provider, storage, windowInstantiationService } = createProvider(store, []);
		const container = append(mainWindow.document.body, $('.chat-window-strip'));
		store.add(toDisposable(() => container.remove()));
		const strip = provider.chrome.createStrip!(window, container, windowInstantiationService)!;
		store.add(strip);
		// A chat view of the window looks for the host among its ancestors.
		const chatView = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => chatView.remove()));
		const host = findSessionActivityBarExternalHost(chatView);
		// The main window's column at the default layout density, the gap between its cards included, at each size chosen
		const mainColumn = store.add(new SessionActivityBarColumn(constObservable(true)));
		const sizes: Record<string, { chatWindow: number; mainWindow: number }> = {};
		for (const size of [getSessionActivityBarSize(storage), MenuActivityBarSize.Normal, MenuActivityBarSize.Compact]) {
			setSessionActivityBarSize(storage, size);
			mainColumn.setLayout(AGENTS_FLOATING_PANEL_GAP, false, size);
			sizes[`${Object.keys(sizes).length ? 'then ' : 'initially '}${size}`] = { chatWindow: strip.size.get(), mainWindow: mainColumn.minimumWidth };
		}

		assert.deepStrictEqual({ hostedInStrip: host?.element === container, active: host?.active.get(), fullSize: host?.fullSize, classes: [...container.classList], visible: strip.visible.get() }, {
			hostedInStrip: true,
			active: true,
			fullSize: true,
			// Not the main window's column's: their rules follow the main window's state, whose classes a chat window mirrors
			classes: ['chat-window-strip', 'session-activity-bar-host'],
			visible: true,
		});
		// Compact unless the normal size is chosen, from the context menu of either window's bar
		assert.deepStrictEqual(Object.keys(sizes), ['initially compact', 'then normal', 'then compact']);
		for (const [key, { chatWindow, mainWindow }] of Object.entries(sizes)) {
			assert.strictEqual(chatWindow, mainWindow, key);
		}
	});

	test('the strip of a chat window fills its column and keeps the main window\'s distances, to the card beside it and to the right edge of the window, inside the card of its column, which clips what it shows, in Default and Compact density, whatever the main window\'s state', () => {
		const store = disposables.add(new DisposableStore());
		const { provider, storage, windowInstantiationService, configuration } = createProvider(store, []);
		const part = (name: string) => new class extends mock<IContentPart>() {
			override readonly element = $(`.${name}`);
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [new class extends mock<IEditorGroup>() { override readonly isEmpty = false; override readonly onDidModelChange = Event.None; }()];
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override getScopedInstantiationService(): IInstantiationService {
				const contextKeyService = new MockContextKeyService();
				return upcastPartial<IInstantiationService>({ invokeFunction: (<R>(fn: (accessor: ServicesAccessor) => R) => fn(upcastPartial<ServicesAccessor>({ get: <T>() => contextKeyService as T }))) as IInstantiationService['invokeFunction'] });
			}
		}();
		const windowWidth = 1000;
		const windowHeight = 600;
		const rect = (element: Element) => element.getBoundingClientRect();
		// The Agents window's workbench element, with the classes and the theme's tokens its cards and the strip are styled with
		const createWorkbench = (store: DisposableStore, compact: boolean, mainWindowState: readonly string[]) => {
			const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.modern-ui-tabs.modern-ui-connected-editor-tabs.dock-detail-panel.mac'));
			store.add(toDisposable(() => workbench.remove()));
			workbench.classList.toggle('modern-ui-compact', compact);
			workbench.classList.add(...mainWindowState);
			workbench.style.cssText = `--vscode-agents-layout-floatingPanelGap: ${AGENTS_FLOATING_PANEL_GAP}px; --vscode-strokeThickness: 1px; --vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-spacing-size240: 24px; --vscode-cornerRadius-large: 8px; --window-corner-radius: 10px;`;
			return workbench;
		};
		// The strip as the Session Activity Bar docks it in a host that it fills, at the size chosen for it
		const dock = (host: HTMLElement, size: MenuActivityBarSize) => {
			const docked = append(host, $('.menu-activity-bar.session-activity-bar.docked'));
			docked.classList.toggle('size-compact', size === MenuActivityBarSize.Compact);
			docked.style.top = '0px';
			return docked;
		};
		// Between the boxes, and as they show: a card that leaves its frame to what it holds shows it inside its border
		const distances = (strip: HTMLElement, column: HTMLElement, card: HTMLElement, frameInset: number) => {
			const stripRect = rect(strip);
			// As wide as the bar says it is, in both windows
			assert.strictEqual(stripRect.width, MenuActivityBar.getWidth(strip.closest('.modern-ui-compact') !== null, strip.classList.contains('size-compact') ? MenuActivityBarSize.Compact : MenuActivityBarSize.Normal));
			const columnCard = column.closest('.part-grid-card') ?? column;
			return {
				width: stripRect.width,
				fillsColumn: stripRect.top === rect(column).top && stripRect.bottom === rect(column).bottom,
				insideItsCard: stripRect.left >= rect(columnCard).left && stripRect.right <= rect(columnCard).right,
				toCard: stripRect.left - rect(card).right,
				visibleToCard: stripRect.left - rect(card).right + frameInset,
				toEdge: windowWidth - stripRect.right,
			};
		};

		const actual: Record<string, unknown> = {};
		const expected: Record<string, unknown> = {};
		for (const [compact, size] of [false, true].flatMap(compact => [MenuActivityBarSize.Normal, MenuActivityBarSize.Compact].map(size => [compact, size] as const))) {
			const density = `${compact ? 'compact' : 'default'} density, ${size} size`;
			setSessionActivityBarSize(storage, size);

			// The main window, with the side pane closed: as its workbench lays out its grid (`_gridGutter`, `_layoutGrid`), which ends
			// the gap before the right edge of the window, its column at the right of it, right beside the chat's card.
			const mainStore = new DisposableStore();
			const main = createWorkbench(mainStore, compact, ['noeditorpane']);
			const gridGutter = compact ? 0 : AGENTS_FLOATING_PANEL_GAP;
			const mainColumn = mainStore.add(new SessionActivityBarColumn(constObservable(true)));
			mainColumn.setLayout(gridGutter, compact, size);
			const columnLeft = windowWidth - gridGutter - mainColumn.minimumWidth;
			const chatCard = append(main, $('div'));
			chatCard.style.cssText = `position: fixed; top: 0; left: 0; width: ${columnLeft}px; height: ${windowHeight}px;`;
			append(main, mainColumn.element).style.cssText = `position: fixed; top: 0; left: ${columnLeft}px; width: ${mainColumn.minimumWidth}px; height: ${windowHeight}px;`;
			// Its chat shows its frame inset within its card (`--agents-session-frame-inset`)
			const sessionFrameInset = parseFloat(mainWindow.getComputedStyle(main).getPropertyValue('--agents-session-frame-inset')) || 0;
			expected[density] = distances(dock(mainColumn.element, size), mainColumn.element, chatCard, sessionFrameInset);
			mainStore.dispose();

			// A chat window beside the chat, and beside its main part, whatever the state of the main window, whose classes it mirrors
			configuration.setUserConfiguration('window.density.layout', compact ? 'compact' : 'default');
			for (const [mode, neighbor] of [[ChatWindowLayoutMode.ChatOnly, ChatWindowGridCell.Chat], [ChatWindowLayoutMode.SideBySide, ChatWindowGridCell.Main]] as const) {
				for (const mainWindowState of [['noeditorpane'], ['session-activity-bar-column-visible']]) {
					const windowStore = new DisposableStore();
					const workbench = createWorkbench(windowStore, compact, mainWindowState);
					const host = append(workbench, $(`.${AGENTS_CHAT_WINDOW_CLASS}`));
					host.style.cssText = `position: fixed; top: 0; left: 0; width: ${windowWidth}px; height: ${windowHeight}px;`;
					const stripElement = append(host, $('.chat-window-strip'));
					const strip = windowStore.add(provider.chrome.createStrip!(window, stripElement, windowInstantiationService)!);
					const grid = windowStore.add(new ChatWindowGrid(host, { main: part('main'), chat: part('chat'), strip: { element: stripElement, visible: strip.visible, size: strip.size, layout: (width, height) => strip.layout(width, height) } }, constObservable(mode), provider.look.gap, undefined, undefined, undefined, editorGroupsService));
					grid.setOuterInsets(provider.look.outerInsets!.get());
					grid.layout(windowWidth, windowHeight);
					const card = host.querySelector<HTMLElement>(`[data-part-grid-cell="${neighbor}"] > .part-grid-card`)!;
					const cardStyle = mainWindow.getComputedStyle(card);
					// A card that leaves its frame to what it holds has a transparent border, inside which that frame shows
					const frameInset = cardStyle.borderRightColor === 'rgba(0, 0, 0, 0)' ? parseFloat(cardStyle.borderRightWidth) : 0;
					const docked = dock(stripElement, size);
					// Its corners are its own, as the other cards of a chat window keep theirs, not the main window's rounded corner
					const corners = mainWindow.getComputedStyle(docked).borderBottomRightRadius === mainWindow.getComputedStyle(docked).borderTopRightRadius ? 'its own' : 'the main window\'s';
					actual[`${density}, beside the ${neighbor}, main window ${mainWindowState}`] = { ...distances(docked, stripElement, card, frameInset), corners };
					expected[`${density}, beside the ${neighbor}, main window ${mainWindowState}`] = { ...expected[density] as object, corners: 'its own' };
					windowStore.dispose();
				}
			}
			delete expected[density];
		}

		assert.deepStrictEqual(actual, expected);
	});

	test('the title row of a chat window is the title bar of the Agents window, created into it with the window\'s services, which its command center and actions act on, across its top in every layout: as tall as the title bar is, such as for its density', () => {
		const store = disposables.add(new DisposableStore());
		const { provider, windowInstantiationService, titleBars } = createProvider(store, []);
		const container = $('.chat-window-title-row');
		const row = provider.chrome.createTitleRow!(window, container, windowInstantiationService)!;
		const visible = row.visible.get();
		const sizes = [row.size.get()];
		titleBars[0].setHeight(35);
		sizes.push(row.size.get());
		row.layout(1000, 35);
		row.dispose();

		assert.deepStrictEqual({
			created: titleBars.map(titleBar => ({ container: titleBar.container === container, editorGroups: titleBar.editorGroupsContainer === window.mainPart, services: titleBar.instantiationService === windowInstantiationService })),
			visible,
			sizes,
			layouts: titleBars[0].layouts,
			disposed: titleBars[0].disposed,
		}, {
			created: [{ container: true, editorGroups: true, services: true }],
			visible: true,
			sizes: [44, 35],
			layouts: ['1000x35'],
			disposed: true,
		});
	});

	test('focuses its window only while that window does not have focus, so that a focused chat window is not focused again', () => {
		const focused: boolean[] = [];
		for (const hasFocus of [false, true]) {
			focusChatWindowUnlessFocused({ document: { hasFocus: () => hasFocus } }, () => focused.push(hasFocus));
		}
		assert.deepStrictEqual(focused, [false]);
	});

	test('the cards keep the main window\'s gaps: between them and to the edges of the window but its top, where the title row is, with the strip\'s column or without it', () => {
		const store = disposables.add(new DisposableStore());
		const { provider, configuration } = createProvider(store, []);
		const withStrip = provider.look.outerInsets?.get();
		configuration.setUserConfiguration(SESSION_ACTIVITY_BAR_SETTING, false);

		assert.deepStrictEqual({ gap: provider.look.gap.get(), withStrip, withoutStrip: provider.look.outerInsets?.get() }, {
			gap: 4,
			withStrip: { top: 0, right: 4, bottom: 4, left: 4 },
			withoutStrip: { top: 0, right: 4, bottom: 4, left: 4 },
		});
	});

	test('the main part of a chat window shows the menus of the main window\'s editor area, such as the actions of the Changes editor in its header row', () => {
		// Its menus only: the main window's options read nothing of the part for them.
		const mainWindowOptions = (DesktopMainEditorPart.prototype as unknown as { getGroupViewOptions(this: object): IEditorGroupViewOptions }).getGroupViewOptions.call({});

		assert.deepStrictEqual(CHAT_WINDOW_MAIN_PART_GROUP_VIEW_OPTIONS.menuIds, mainWindowOptions.menuIds);
	});
});
