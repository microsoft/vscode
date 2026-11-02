/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatWindow } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IContentPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { SessionHasWorkspaceContext } from '../../../../common/contextkeys.js';
import { ISessionScope } from '../../../../services/sessions/browser/sessionScope.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService, IShowSessionInWindowOptions } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../../common/chatWindows.js';
import { SESSION_ACTIVITY_BAR_COLUMN_WIDTH } from '../../../../browser/parts/sessionActivityBar.js';
import { alignChatWindowHeaderActions, focusChatWindowUnlessFocused, getChatWindowMainPartOptions, isChatWindowStripInColumn, SessionsChatWindowProvider } from '../../browser/sessionsChatWindowProvider.js';

suite('Sessions chat window provider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createChat(path: string, archived = false): IChat {
		return new class extends mock<IChat>() {
			override readonly resource = URI.parse(`test:/${path}`);
			override readonly title = constObservable(path);
			override readonly isArchived = observableValue('archived', archived);
			override readonly isRead = constObservable(true);
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
		}();
	}

	function createProvider(store: DisposableStore, sessions: ISession[]) {
		const events: string[] = [];
		const windowSessions = observableValue<readonly IActiveSession[]>('windowSessions', []);
		const onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());
		const configuration = new TestConfigurationService({ [CHAT_WINDOWS_ENABLED_SETTING]: true });
		const sentiment = observableValue<IChatSentiment>('sentiment', {});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly sentimentObs = sentiment as IObservable<IChatSentiment>;
		}());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override getSession(resource: URI) { return sessions.find(session => session.resource.toString() === resource.toString()); }
			override getSessions() { return sessions; }
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly visibleSessions = constObservable([]);
			override readonly windowSessions = windowSessions;
			override readonly initialRestoreComplete = constObservable(true);
			override showSessionInWindow(session: ISession, options?: IShowSessionInWindowOptions): IActiveSession {
				events.push(`show ${session.sessionId} ${options?.chatResource?.path}`);
				const windowSession = new class extends mock<IActiveSession>() {
					override readonly sessionId = session.sessionId;
					override readonly resource = session.resource;
					override readonly scopedChatResource = options?.chatResource;
					override readonly loading = session.loading;
					override readonly chats = session.chats;
					override readonly title = session.title;
					override readonly mainChat = session.mainChat;
					override readonly activeChat = constObservable(session.chats.get().find(chat => chat.resource.toString() === options?.chatResource?.toString()) ?? session.mainChat.get());
					override readonly status = constObservable(SessionStatus.Completed);
					override readonly isArchived = constObservable(false);
					override readonly capabilities = constObservable({ supportsMultipleChats: false, supportsFork: false, supportsSideChat: false, supportsRename: false, supportsDelete: false });
					override readonly workspace = constObservable(undefined);
					override readonly isCreated = constObservable(true);
					override readonly sticky = constObservable(false);
					override readonly shouldShowChatTabs = constObservable(false);
					override readonly visibleChatTabs = constObservable([]);
				}();
				windowSessions.set([...windowSessions.get(), windowSession], undefined);
				return windowSession;
			}
			override closeSession(session: IActiveSession) {
				events.push(`close ${session.sessionId}`);
				windowSessions.set(windowSessions.get().filter(candidate => candidate !== session), undefined);
			}
			override setActive(session: IActiveSession | undefined) { events.push(`active ${session?.sessionId}`); }
		}());
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider() { return undefined; }
		}());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override acquireExistingSession() { return undefined; }
		}());
		const provider = store.add(instantiationService.createInstance(SessionsChatWindowProvider));
		const window = new class extends mock<IChatWindow>() {
			override readonly mainPart = new class extends mock<IContentPart>() {
				override readonly groups = [];
				override readonly onDidAddGroup = Event.None;
				override readonly onDidRemoveGroup = Event.None;
			}();
			override readonly layoutMode = constObservable(ChatWindowLayoutMode.SideBySide);
			override readonly onDidClose = Event.None;
		}();
		const windowInstantiationService = store.add(instantiationService.createChild(new ServiceCollection([IContextKeyService, store.add(new ContextKeyService(configuration))])));
		return { provider, events, window, windowInstantiationService, onDidChangeSessions, sentiment, configuration };
	}

	test('a chat window shows a chat, or the main chat of a session, as a session of its own window once its window exists, acts on that session, and stops showing it as it closes', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('second')]);
		const { provider, events, window, windowInstantiationService } = createProvider(store, [session]);

		const unknown = await provider.resolveContent(URI.parse('test:/unknown'));
		const ofSession = await provider.resolveContent(session.resource);
		const content = (await provider.resolveContent(URI.parse('test:/second')))!;
		const beforeBind = { chat: content.chat.get().path, title: content.title.get(), events: [...events] };
		store.add(content.bind!(window, windowInstantiationService));
		const scope = content.services!.get(ISessionScope) as ISessionScope;
		content.didShow!(window, true);
		const contextKeyService = windowInstantiationService.invokeFunction(accessor => accessor.get(IContextKeyService));
		const bound = { scope: scope.session.get()?.sessionId, hasWorkspace: contextKeyService.getContextKeyValue(SessionHasWorkspaceContext.key) };
		ofSession?.dispose();
		content.dispose();

		assert.deepStrictEqual({ unknown, ofSession: ofSession?.chat.get().path, beforeBind, bound, events }, {
			unknown: undefined,
			ofSession: '/main',
			beforeBind: { chat: '/second', title: 'second', events: [] },
			bound: { scope: 'session', hasWorkspace: false },
			events: ['show session /second', 'active session', 'close session'],
		});
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
});
