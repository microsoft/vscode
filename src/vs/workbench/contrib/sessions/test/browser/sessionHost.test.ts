/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { getMainWindowHost, getWindowHost, IFocusedSessionHostService, ISessionHost, SessionHost, SessionHostKind, shownChatOf } from '../../../../services/sessions/browser/sessionHost.js';
import { FocusedSessionHostService, SessionHostService } from '../../browser/sessionHostService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { chatOfShown, ITestSessionsService, ITestShownChat, sessionOfShown, sessionsServiceWithGridHost, stubSessionHostsFromSessionsService, TestShown, withCreatedStatus, navigationServiceOf } from './sessionHostTestUtils.js';

function chat(path: string): IChat {
	return upcastPartial<IChat>({ resource: URI.parse(`chat:/${path}`) });
}

/** A host's view of a session: the session `id`, and `chat` of it. */
function session(id: string, chat: IChat, options?: { readonly created?: boolean; readonly mainChat?: IChat }): ITestShownChat {
	return {
		session: upcastPartial<ISession>({
			sessionId: id,
			resource: URI.parse(`session:/${id}`),
			...withCreatedStatus(constObservable(options?.created ?? true)),
			mainChat: constObservable(options?.mainChat ?? chat),
		}),
		chat,
	};
}

const contextKeyService = upcastPartial<IContextKeyService>({});
const CHAT_WINDOW_ID = 4242;

function host(kind: SessionHostKind, parent: ISessionHost | undefined, value: IObservable<ITestShownChat | undefined>, options?: { readonly windowId?: number; readonly loadingChat?: URI }): SessionHost {
	return new SessionHost({
		kind,
		parent,
		session: derived(reader => sessionOfShown(value.read(reader))),
		chat: derived(reader => chatOfShown(value.read(reader), reader)),
		contextKeyService,
		windowId: options?.windowId !== undefined ? constObservable(options.windowId) : undefined,
		loadingChat: options?.loadingChat ? constObservable(options.loadingChat) : undefined,
	});
}

function describe(value: ISessionHost | undefined): string | undefined {
	return value?.kind;
}

suite('SessionHost', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const mainChat = chat('main');
	const sideChat = chat('side');
	const otherChat = chat('other');
	const sessionA = session('a', mainChat);
	const sessionAInWindow = session('a', sideChat);
	const sessionB = session('b', otherChat);

	function createService(groups: readonly IEditorGroup[] = [], mainSession: IObservable<ITestShownChat | undefined> = constObservable(sessionA)) {
		const mainHost = host(SessionHostKind.MainWindow, undefined, mainSession, { windowId: mainWindow.vscodeWindowId });
		const editorGroupsService = upcastPartial<IEditorGroupsService>({ getGroup: id => groups.find(group => group.id === id) });
		const service = disposables.add(new SessionHostService(navigationServiceOf(sessionsServiceWithGridHost(mainHost)), editorGroupsService));
		return { service, mainHost };
	}

	test('what a host shows derives from its session and chat', () => {
		const value = observableValue<ITestShownChat | undefined>('session', undefined);
		const loading = host(SessionHostKind.ChatWindow, undefined, value, { loadingChat: sideChat.resource });
		const composer = host(SessionHostKind.Composer, undefined, value);
		const snapshot = (target: ISessionHost) => ({ kind: target.content.get().kind, chat: target.chatResource.get()?.toString(), session: target.session.get()?.sessionId });

		const main = host(SessionHostKind.MainWindow, undefined, value);
		const before = { loading: snapshot(loading), composer: snapshot(composer), main: snapshot(main) };
		value.set(session('draft', mainChat, { created: false, mainChat }), undefined);
		const draft = snapshot(composer);
		value.set(sessionAInWindow, undefined);
		const shown = snapshot(loading);

		assert.deepStrictEqual({ before, draft, shown }, {
			before: {
				loading: { kind: 'loading', chat: 'chat:/side', session: undefined },
				composer: { kind: 'newSession', chat: undefined, session: undefined },
				main: { kind: 'empty', chat: undefined, session: undefined },
			},
			draft: { kind: 'newSession', chat: 'chat:/main', session: 'draft' },
			shown: { kind: 'chat', chat: 'chat:/side', session: 'a' },
		});
	});

	test('hosts nest: a pane is in its window, and passes its own id to commands', () => {
		const { mainHost } = createService();
		const pane = host(SessionHostKind.Pane, mainHost, constObservable(sessionB));
		const composer = host(SessionHostKind.Composer, pane, constObservable(sessionB));

		assert.deepStrictEqual({
			window: describe(getWindowHost(composer)),
			parent: describe(composer.parent),
			windowId: composer.windowId.get(),
			distinctIds: new Set([mainHost.id, pane.id, composer.id]).size,
			commandContext: composer.commandContext,
		}, {
			window: SessionHostKind.MainWindow,
			parent: SessionHostKind.Pane,
			windowId: mainWindow.vscodeWindowId,
			distinctIds: 3,
			commandContext: { sessionHostId: composer.id },
		});
	});

	test('looks hosts up by window and group, without falling back for unknown ones', () => {
		const chatWindowGroup = upcastPartial<IEditorGroup>({ id: 7, windowId: CHAT_WINDOW_ID });
		const mainGroup = upcastPartial<IEditorGroup>({ id: 1, windowId: mainWindow.vscodeWindowId });
		const { service } = createService([chatWindowGroup, mainGroup]);
		const chatWindow = host(SessionHostKind.ChatWindow, undefined, constObservable(sessionAInWindow), { windowId: CHAT_WINDOW_ID });
		const registration = service.registerHost(chatWindow);
		const pane = host(SessionHostKind.Pane, chatWindow, constObservable(sessionAInWindow));
		disposables.add(service.registerHost(pane));

		const registered = {
			mainWindow: describe(service.getHostOfWindow(mainWindow.vscodeWindowId)),
			chatWindow: describe(service.getHostOfWindow(CHAT_WINDOW_ID)),
			chatWindowGroup: describe(service.getHostOfGroup(7)),
			mainGroup: describe(service.getHostOfGroup(mainGroup)),
			unknownGroup: describe(service.getHostOfGroup(99)),
			byId: describe(service.getHost(chatWindow.id)),
		};
		registration.dispose();
		const closed = describe(service.getHostOfWindow(CHAT_WINDOW_ID));

		assert.deepStrictEqual({ registered, closed }, {
			registered: {
				mainWindow: SessionHostKind.MainWindow,
				chatWindow: SessionHostKind.ChatWindow,
				chatWindowGroup: SessionHostKind.ChatWindow,
				mainGroup: SessionHostKind.MainWindow,
				unknownGroup: undefined,
				byId: SessionHostKind.ChatWindow,
			},
			closed: undefined,
		});
	});

	test('the main window host is the one host of the main window, not a pane in it or a chat window', () => {
		const { service, mainHost } = createService();
		const pane = host(SessionHostKind.Pane, mainHost, constObservable(sessionB));
		disposables.add(service.registerHost(pane));
		const chatWindow = host(SessionHostKind.ChatWindow, undefined, constObservable(sessionAInWindow), { windowId: CHAT_WINDOW_ID });
		disposables.add(service.registerHost(chatWindow));
		const describeShown = (value: ISessionHost) => {
			const shown = shownChatOf(value);
			return shown && { session: shown.session.resource.toString(), chat: shown.chat.resource.toString() };
		};

		assert.deepStrictEqual({
			isMainHost: getMainWindowHost(service) === mainHost,
			sameEachTime: getMainWindowHost(service) === getMainWindowHost(service),
			main: describeShown(getMainWindowHost(service)),
			chatWindow: describeShown(chatWindow),
		}, {
			isMainHost: true,
			sameEachTime: true,
			main: { session: sessionA.session.resource.toString(), chat: mainChat.resource.toString() },
			chatWindow: { session: sessionAInWindow.session.resource.toString(), chat: sideChat.resource.toString() },
		});
	});

	test('two hosts show the same session with different chats; lookups find the innermost host', () => {
		const { service, mainHost } = createService();
		const mainPane = host(SessionHostKind.Pane, mainHost, constObservable(sessionA));
		disposables.add(service.registerHost(mainPane));
		const chatWindow = host(SessionHostKind.ChatWindow, undefined, constObservable(sessionAInWindow), { windowId: CHAT_WINDOW_ID });
		disposables.add(service.registerHost(chatWindow));

		assert.deepStrictEqual({
			mainChat: describe(service.getHostOfChat(mainChat.resource)),
			sideChat: describe(service.getHostOfChat(sideChat.resource)),
			notShown: describe(service.getHostOfChat(otherChat.resource)),
			hostsOfSession: service.getHostsOfSession(sessionA.session.resource).map(describe),
			chats: [mainHost, chatWindow].map(target => target.chat.get()?.resource.toString()),
			shown: [sessionA.session.resource, sideChat.resource, sessionB.session.resource, otherChat.resource].map(resource => service.isShown(resource)),
		}, {
			mainChat: SessionHostKind.Pane,
			sideChat: SessionHostKind.ChatWindow,
			notShown: undefined,
			hostsOfSession: [SessionHostKind.Pane, SessionHostKind.ChatWindow],
			chats: ['chat:/main', 'chat:/side'],
			shown: [true, true, false, false],
		});
	});

	test('composers and dialogs do not own what they draft: a pane showing a chat, with a composer drafting another', () => {
		const { service, mainHost } = createService([], constObservable(sessionB));
		const pane = host(SessionHostKind.Pane, mainHost, constObservable(sessionA));
		disposables.add(service.registerHost(pane));
		const draft = session('a', sideChat);
		disposables.add(service.registerHost(host(SessionHostKind.Composer, pane, constObservable(draft))));
		disposables.add(service.registerHost(host(SessionHostKind.AutomationDialog, mainHost, constObservable(sessionA))));

		assert.deepStrictEqual({
			hostsOfSession: service.getHostsOfSession(sessionA.session.resource).map(describe),
			ofChat: describe(service.getHostOfChat(mainChat.resource)),
			ofDraft: describe(service.getHostOfChat(sideChat.resource)),
		}, {
			hostsOfSession: [SessionHostKind.Pane],
			ofChat: SessionHostKind.Pane,
			ofDraft: undefined,
		});
	});

	test('a chat moving between hosts is found in the host that shows it now', () => {
		const paneSession = observableValue<ITestShownChat | undefined>('pane', sessionA);
		const { service, mainHost } = createService([], paneSession);
		const windowSession = observableValue<ITestShownChat | undefined>('window', undefined);
		disposables.add(service.registerHost(host(SessionHostKind.Pane, mainHost, paneSession)));
		disposables.add(service.registerHost(host(SessionHostKind.ChatWindow, undefined, windowSession, { windowId: CHAT_WINDOW_ID })));

		const before = describe(service.getHostOfChat(mainChat.resource));
		paneSession.set(sessionB, undefined);
		windowSession.set(sessionA, undefined);
		const after = describe(service.getHostOfChat(mainChat.resource));

		assert.deepStrictEqual({ before, after }, { before: SessionHostKind.Pane, after: SessionHostKind.ChatWindow });
	});

	test('the focused host follows the window that gains focus and stays while the app is in the background; commands read DOM focus', () => {
		const { service } = createService();
		disposables.add(service.registerHost(host(SessionHostKind.ChatWindow, undefined, constObservable(sessionAInWindow), { windowId: CHAT_WINDOW_ID })));
		const onDidChangeActiveWindow = disposables.add(new Emitter<number>());
		const focused = disposables.add(new FocusedSessionHostService(service, upcastPartial<IHostService>({ hasFocus: true, onDidChangeActiveWindow: onDidChangeActiveWindow.event })));

		const initially = describe(focused.focusedHost.get());
		onDidChangeActiveWindow.fire(CHAT_WINDOW_ID);
		const inChatWindow = describe(focused.focusedHost.get());
		const fromDomFocus = describe(focused.getFocusedHost());
		onDidChangeActiveWindow.fire(mainWindow.vscodeWindowId);
		const back = describe(focused.focusedHost.get());

		assert.deepStrictEqual({ initially, inChatWindow, fromDomFocus, back }, {
			initially: SessionHostKind.MainWindow,
			inChatWindow: SessionHostKind.ChatWindow,
			fromDomFocus: SessionHostKind.MainWindow,
			back: SessionHostKind.MainWindow,
		});
	});

	test('a chat window that gains focus before its host knows its window becomes the focused host once it does', () => {
		const { service } = createService();
		const windowId = observableValue<number | undefined>('windowId', undefined);
		const chatWindow = new SessionHost({ kind: SessionHostKind.ChatWindow, parent: undefined, session: constObservable(sessionAInWindow.session), chat: constObservable(sessionAInWindow.chat), contextKeyService, windowId });
		disposables.add(service.registerHost(chatWindow));
		const onDidChangeActiveWindow = disposables.add(new Emitter<number>());
		const focused = disposables.add(new FocusedSessionHostService(service, upcastPartial<IHostService>({ hasFocus: true, onDidChangeActiveWindow: onDidChangeActiveWindow.event })));

		onDidChangeActiveWindow.fire(CHAT_WINDOW_ID);
		const beforeBind = describe(focused.focusedHost.get());
		windowId.set(CHAT_WINDOW_ID, undefined);
		const afterBind = describe(focused.focusedHost.get());

		assert.deepStrictEqual({ beforeBind, afterBind }, { beforeBind: SessionHostKind.MainWindow, afterBind: SessionHostKind.ChatWindow });
	});

	test('while the focused window restores its chat, the previously focused host stays focused until it has loaded', () => {
		const { service } = createService();
		const windowSession = observableValue<ITestShownChat | undefined>('window', undefined);
		disposables.add(service.registerHost(host(SessionHostKind.ChatWindow, undefined, windowSession, { windowId: CHAT_WINDOW_ID, loadingChat: sideChat.resource })));
		const onDidChangeActiveWindow = disposables.add(new Emitter<number>());
		const focused = disposables.add(new FocusedSessionHostService(service, upcastPartial<IHostService>({ hasFocus: false, onDidChangeActiveWindow: onDidChangeActiveWindow.event })));
		const snapshot = () => ({ focused: describe(focused.focusedHost.get()), chat: focused.focusedHost.get().chat.get()?.resource.toString() });

		onDidChangeActiveWindow.fire(CHAT_WINDOW_ID);
		const whileLoading = snapshot();
		windowSession.set(sessionAInWindow, undefined);
		const loaded = snapshot();

		assert.deepStrictEqual({ whileLoading, loaded }, {
			whileLoading: { focused: SessionHostKind.MainWindow, chat: 'chat:/main' },
			loaded: { focused: SessionHostKind.ChatWindow, chat: 'chat:/side' },
		});
	});

	test('while the app is in the background, commands act on the window that last had focus', () => {
		const { service } = createService();
		disposables.add(service.registerHost(host(SessionHostKind.ChatWindow, undefined, constObservable(sessionAInWindow), { windowId: CHAT_WINDOW_ID })));
		const onDidChangeActiveWindow = disposables.add(new Emitter<number>());
		let hasFocus = true;
		const focused = disposables.add(new FocusedSessionHostService(service, upcastPartial<IHostService>({ get hasFocus() { return hasFocus; }, onDidChangeActiveWindow: onDidChangeActiveWindow.event })));

		onDidChangeActiveWindow.fire(CHAT_WINDOW_ID);
		hasFocus = false;
		const inBackground = describe(focused.getFocusedHost());
		hasFocus = true;
		const withFocus = describe(focused.getFocusedHost());

		assert.deepStrictEqual({ inBackground, withFocus }, { inBackground: SessionHostKind.ChatWindow, withFocus: SessionHostKind.MainWindow });
	});
});

suite('stubSessionHostsFromSessionsService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the focused host is the window of the active entry, also while two windows show one session', () => {
		const inB = session('S', chat('b'));
		const inC: ITestShownChat = { session: inB.session, chat: chat('c') };
		const active = observableValue<TestShown | undefined>('active', inB);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({ activeSession: active, windowSessions: constObservable([inB, inC]) }));
		stubSessionHostsFromSessionsService(instantiationService);
		const focusedSessionHostService = instantiationService.get(IFocusedSessionHostService);
		const focused = () => {
			const host = focusedSessionHostService.getFocusedHost();
			return { kind: host.kind, window: host.windowId.get(), chat: host.chat.get()?.resource.path };
		};

		const before = focused();
		active.set(inC, undefined);

		assert.deepStrictEqual({ before, after: focused() }, {
			before: { kind: SessionHostKind.ChatWindow, window: 1000, chat: '/b' },
			after: { kind: SessionHostKind.ChatWindow, window: 1001, chat: '/c' },
		});
	});
});
