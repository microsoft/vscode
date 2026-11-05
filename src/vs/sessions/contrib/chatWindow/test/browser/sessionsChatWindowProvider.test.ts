/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
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
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatHostOpenerService, IChatHostOpenerService } from '../../../../services/sessions/browser/chatHostOpener.js';
import { ChatInteractivity, IChat, ISession, ISessionChangeset, ISessionChangesetOperation, SessionChangesetOperationScope, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../../common/chatWindows.js';
import { SessionChangesEditorFileListContext } from '../../../changes/common/changes.js';
import { SessionChangesetOperationsContext } from '../../../changes/browser/changesActions.js';
import { ActiveSessionState, IChangesSessionObservables, IChangesViewService } from '../../../changes/common/changesViewService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { SESSION_ACTIVITY_BAR_COLUMN_WIDTH } from '../../../../browser/parts/sessionActivityBar.js';
import { AGENTS_CHAT_WINDOW_CLASS } from '../../browser/chatWindowTitleDoubleClick.js';
import { alignChatWindowHeaderActions, CHAT_WINDOW_MAIN_PART_GROUP_VIEW_OPTIONS, focusChatWindowUnlessFocused, getChatWindowMainPartOptions, getChatWindowTitleHeight, isChatWindowStripInColumn, reserveChatWindowControls, SessionsChatWindowContent, SessionsChatWindowProvider } from '../../browser/sessionsChatWindowProvider.js';
import { DesktopMainEditorPart } from '../../../../browser/parts/desktopEditorPart.js';
import { IEditorGroupViewOptions } from '../../../../../workbench/browser/parts/editor/editor.js';
import { EditorInputCapabilities, GroupModelChangeKind } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IGroupModelChangeEvent } from '../../../../../workbench/common/editor/editorGroupModel.js';
import { stubSessionHosts } from '../../../../services/sessions/test/browser/sessionHostTestUtils.js';
import { ISessionHost } from '../../../../services/sessions/browser/sessionHost.js';

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
		const configuration = new TestConfigurationService({ [CHAT_WINDOWS_ENABLED_SETTING]: true });
		const sentiment = observableValue<IChatSentiment>('sentiment', {});
		const instantiationService = store.add(new TestInstantiationService());
		stubSessionHosts(instantiationService, store);
		instantiationService.stub(IConfigurationService, configuration);
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
			override readonly visibleSessions = constObservable([]);
			override readonly initialRestoreComplete = constObservable(true);
			readonly mainWindowActiveSession = mainWindowActiveSession;
			override async openMovedChats(chats: readonly { readonly session: ISession; readonly chatResource: URI }[]) {
				events.push(`open moved ${chats.map(chat => `${chat.session.sessionId} ${chat.chatResource.path}`).join(', ')}`);
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
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			getSessionPullRequest: () => upcastPartial<ReturnType<IGitHubService['getSessionPullRequest']>>({
				pullRequestCIObs: constObservable(upcastPartial<GitHubPullRequestCIModel>({ checks: constObservable([]), requiredChecks: constObservable(undefined), fixRequested: observableValue('fixRequested', false) })),
			}),
		}));
		const provider = store.add(instantiationService.createInstance(SessionsChatWindowProvider));
		return { provider, events, window, windowInstantiationService: store.add(instantiationService.createChild(new ServiceCollection([IContextKeyService, store.add(new ContextKeyService(configuration))]))), onDidChangeSessions, sentiment, configuration, editorGroups, activeChat, chatHostOpenerService };
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
		override readonly chatLeads = constObservable(true);
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

	test('opening a chat a window shows reveals it there, and a chat opened beside one it shows opens beside it in that window', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const { provider, events, chatHostOpenerService } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		await content.resolveChat(URI.parse('test:/main'));

		const opener = chatHostOpenerService.getOpenerOf(URI.parse('test:/main'));
		const notShown = chatHostOpenerService.getOpenerOf(URI.parse('test:/subagent'));
		await opener?.reveal(URI.parse('test:/main'));
		await opener?.openBeside(URI.parse('test:/subagent'), URI.parse('test:/main'));

		assert.deepStrictEqual({ shown: !!opener, notShown, events: events.filter(event => event.startsWith('window')) }, {
			shown: true,
			notShown: undefined,
			events: ['window open /main', 'window open /subagent in 42 beside /main'],
		});
	});

	test('Move to Main Window shows the chats of the window in the main window, its active one first, also of other sessions; it then opens its other editors there, without waiting for a session that does not become active', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const other = createSession('other', [createChat('elsewhere')]);
		const { provider, events } = createProvider(store, [session, other]);

		await provider.moveToMainWindow([URI.parse('test:/elsewhere'), URI.parse('test:/main'), URI.parse('test:/subagent')], { editors: [{ name: 'file.ts' } as unknown as EditorInput] });

		assert.deepStrictEqual(events, ['open moved other /elsewhere, session /main, session /subagent', 'open editors file.ts (active)']);
	});

	test('each chat editor of a window shows the session header in its own title row: back on the first of two split chats, the header is in the first one\'s row, not in the second\'s', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('second')]);
		const { windowInstantiationService } = createProvider(store, [session]);
		const headers = new Map<HTMLElement, string>();
		const content = store.add(windowInstantiationService.createInstance(SessionsChatWindowContent, (_window, _content, container) => {
			const element = append(container, $('.title'));
			const header = { element, actionsElement: undefined, setShown: () => { } };
			headers.set(element, `row of ${container.className}`);
			return { element, size: constObservable(30), header, layout: () => { }, dispose: () => element.remove() };
		}));
		store.add(content.bind!(window, windowInstantiationService));
		const first = (await content.resolveChat(URI.parse('test:/main')))! as unknown as { header: IObservable<{ element: HTMLElement } | undefined>; createTitle(container: HTMLElement, instantiationService: unknown): IDisposable | undefined };
		const second = (await content.resolveChat(URI.parse('test:/second')))! as unknown as typeof first;
		store.add(first.createTitle($('.first'), windowInstantiationService)!);
		activeChat.set(URI.parse('test:/second'), undefined);
		store.add(second.createTitle($('.second'), windowInstantiationService)!);
		const onSecond = [first, second].map(chat => chat.header.get() && headers.get(chat.header.get()!.element));
		activeChat.set(URI.parse('test:/main'), undefined);
		const backOnFirst = [first, second].map(chat => chat.header.get() && headers.get(chat.header.get()!.element));

		assert.deepStrictEqual({ onSecond, backOnFirst }, { onSecond: [undefined, 'row of second'], backOnFirst: ['row of first', undefined] });
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

	test('the Session Activity Bar has a column of its own while the chat is below the main part or hidden, and shows beside the chat otherwise', () => {
		assert.deepStrictEqual([ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.EditorOnly].map(isChatWindowStripInColumn), [false, false, true, true]);
	});

	test('focuses its window only while that window does not have focus, so that a focused chat window is not focused again', () => {
		const focused: boolean[] = [];
		for (const hasFocus of [false, true]) {
			focusChatWindowUnlessFocused({ document: { hasFocus: () => hasFocus } }, () => focused.push(hasFocus));
		}
		assert.deepStrictEqual(focused, [false]);
	});

	test('the header\'s actions, last at the right of the title bar, are centered above the Session Activity Bar\'s column below, whatever their width', () => {
		const titlebar = $('div');
		const host = append(titlebar, $('div'));
		mainWindow.document.body.appendChild(titlebar);
		disposables.add({ dispose: () => titlebar.remove() });
		const insets: string[] = [];
		for (const width of [20, 22, 0]) {
			host.replaceChildren();
			if (width) {
				append(host, $('div')).style.cssText = `display: inline-block; width: ${width}px; height: 16px;`;
			}
			alignChatWindowHeaderActions(titlebar, host);
			insets.push(`${width}: ${titlebar.style.getPropertyValue('--session-header-actions-inset') || 'none'}`);
		}
		// The column is SESSION_ACTIVITY_BAR_COLUMN_WIDTH (34px) wide: an action that wide is centered with half the rest after it.
		assert.deepStrictEqual({ column: SESSION_ACTIVITY_BAR_COLUMN_WIDTH, insets }, { column: 34, insets: ['20: 7px', '22: 6px', '0: none'] });
	});

	test('the tab row at the top right of a chat window keeps the room of the window controls only while they float above it, beside the chat\'s own title: not while they are in the title row, hidden as in full screen, or at the left as on macOS', () => {
		const chatWindow = append(mainWindow.document.body, $(`.${AGENTS_CHAT_WINDOW_CLASS}`));
		disposables.add({ dispose: () => chatWindow.remove() });
		const titlebar = append(chatWindow, $('div'));
		// The window controls at the right, as on Windows and Linux.
		const controls = append(titlebar, $('div'));
		controls.style.cssText = 'display: block; width: 138px; height: 30px;';
		const reserved = (windowControls: HTMLElement | undefined) => {
			reserveChatWindowControls(titlebar, windowControls);
			return chatWindow.style.getPropertyValue('--chat-window-controls-right-width') || 'none';
		};

		const inTitleRow = reserved(controls);
		// Side by Side: the chat's own title, over its column only, leaves its window controls at the top right of the window.
		titlebar.classList.add('header-chat-column');
		const overChatColumn = reserved(controls);
		controls.style.display = 'none';
		const fullScreen = reserved(controls);
		controls.style.display = 'block';
		const leftAsOnMacOS = reserved(undefined);
		const windowedAgain = reserved(controls);

		assert.deepStrictEqual({ inTitleRow, overChatColumn, fullScreen, leftAsOnMacOS, windowedAgain }, { inTitleRow: 'none', overChatColumn: '138px', fullScreen: 'none', leftAsOnMacOS: 'none', windowedAgain: '138px' });
	});

	test('the cards keep the main window\'s gaps: between them and to the edges of the window but its top, where the title row is', () => {
		const store = disposables.add(new DisposableStore());
		const { provider } = createProvider(store, []);

		assert.deepStrictEqual({ gap: provider.look.gap.get(), outerInsets: provider.look.outerInsets?.get() }, { gap: 4, outerInsets: { top: 0, right: 4, bottom: 4, left: 4 } });
	});

	test('the title rows are as tall as the row of tabs of the main part, its card\'s frame included, in every layout: no measuring, so from the first frame', () => {
		assert.deepStrictEqual({
			cards: getChatWindowTitleHeight(false, true),
			compactDensity: getChatWindowTitleHeight(false, false),
			compactTabs: getChatWindowTitleHeight(true, true),
		}, { cards: 33, compactDensity: 32, compactTabs: 29 });
	});

	test('the main part of a chat window shows the menus of the main window\'s editor area, such as the actions of the Changes editor in its header row', () => {
		// Its menus only: the main window's options read nothing of the part for them.
		const mainWindowOptions = (DesktopMainEditorPart.prototype as unknown as { getGroupViewOptions(this: object): IEditorGroupViewOptions }).getGroupViewOptions.call({});

		assert.deepStrictEqual(CHAT_WINDOW_MAIN_PART_GROUP_VIEW_OPTIONS.menuIds, mainWindowOptions.menuIds);
	});
});
