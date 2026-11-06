/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Direction } from '../../../../../base/browser/ui/grid/grid.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ActiveSessionHost, IFocusedSessionHostService, ISessionHost, ISessionHostService, SessionHostKind } from '../../browser/sessionHost.js';
import { resolveSessionCommandTarget } from '../../browser/sessionCommandTarget.js';
import { SessionHostService } from '../../browser/sessionHostService.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { VisibleSessions } from '../../browser/visibleSessions.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { sessionsServiceWithGridHost } from './sessionHostTestUtils.js';

const CHAT_WINDOW_ID = 4242;

function chat(path: string): IChat {
	return upcastPartial<IChat>({ resource: URI.parse(`chat:/${path}`), title: constObservable(path) });
}

suite('resolveSessionCommandTarget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const mainChat = chat('main');
	const sideChat = chat('side');
	const otherChat = chat('other');
	const sessionA = upcastPartial<IActiveSession>({ sessionId: 'a', resource: URI.parse('session:/a'), isCreated: constObservable(true), activeChat: constObservable(mainChat), mainChat: constObservable(mainChat), chats: constObservable([mainChat, sideChat]) });
	const sessionAInWindow = upcastPartial<IActiveSession>({ ...sessionA, activeChat: constObservable(sideChat) });
	const sessionB = upcastPartial<IActiveSession>({ sessionId: 'b', resource: URI.parse('session:/b'), isCreated: constObservable(true), activeChat: constObservable(otherChat), mainChat: constObservable(otherChat), chats: constObservable([otherChat]) });
	const sessions: readonly ISession[] = [sessionA, sessionB];

	function setup(focusedWindow: 'main' | 'chat' = 'main') {
		const instantiationService = disposables.add(new TestInstantiationService());
		const contextKeyService = upcastPartial<IContextKeyService>({});
		const mainHost = new ActiveSessionHost({ kind: SessionHostKind.MainWindow, parent: undefined, session: constObservable<IActiveSession | undefined>(sessionB), contextKeyService, windowId: constObservable(mainWindow.vscodeWindowId) });
		const groups = [upcastPartial<IEditorGroup>({ id: 1, windowId: mainWindow.vscodeWindowId }), upcastPartial<IEditorGroup>({ id: 7, windowId: CHAT_WINDOW_ID })];
		const sessionsService = sessionsServiceWithGridHost(mainHost);
		const sessionHostService = disposables.add(new SessionHostService(sessionsService, upcastPartial<IEditorGroupsService>({ getGroup: id => groups.find(group => group.id === id) })));
		const chatWindowHost = new ActiveSessionHost({ kind: SessionHostKind.ChatWindow, parent: undefined, session: constObservable<IActiveSession | undefined>(sessionAInWindow), contextKeyService, windowId: constObservable(CHAT_WINDOW_ID) });
		disposables.add(sessionHostService.registerHost(chatWindowHost));
		instantiationService.stub(ISessionHostService, sessionHostService);
		instantiationService.stub(ISessionsService, sessionsService);
		instantiationService.stub(IFocusedSessionHostService, upcastPartial<IFocusedSessionHostService>({ getFocusedHost: () => focusedWindow === 'chat' ? chatWindowHost : mainHost }));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSession: resource => sessions.find(session => session.resource.toString() === resource.toString()),
			getSessionForChatResource: resource => {
				for (const session of sessions) {
					const found = session.chats.get().find(candidate => candidate.resource.toString() === resource.toString());
					if (found) {
						return { session, chat: found };
					}
				}
				return undefined;
			},
		}));
		const resolve = (...args: unknown[]) => {
			const target = instantiationService.invokeFunction(accessor => resolveSessionCommandTarget(accessor, args));
			return target && { host: target.host?.kind, session: target.session?.sessionId, chat: target.chat?.resource.path.slice(1) };
		};
		return { resolve, chatWindowHost, mainHost, sessionHostService };
	}

	test('arguments that name a host, a group or a window resolve to that host', () => {
		const { resolve, chatWindowHost } = setup();
		assert.deepStrictEqual({
			host: resolve(chatWindowHost.commandContext),
			chatWindowGroup: resolve({ groupId: 7 }),
			mainGroup: resolve({ groupId: 1 }),
			window: resolve({ windowId: CHAT_WINDOW_ID }),
		}, {
			host: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'side' },
			chatWindowGroup: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'side' },
			mainGroup: { host: SessionHostKind.MainWindow, session: 'b', chat: 'other' },
			window: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'side' },
		});
	});

	test('a chat or a session resolves to it and to the host that shows it', () => {
		const { resolve } = setup();
		assert.deepStrictEqual({
			shownChat: resolve(sideChat),
			chatContext: resolve({ chat: otherChat }),
			chatResource: resolve(sideChat.resource),
			notShownChat: resolve(mainChat),
			session: resolve(sessionB),
			sessionContext: resolve({ session: sessionA }),
			sessionResource: resolve(sessionA.resource),
		}, {
			shownChat: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'side' },
			chatContext: { host: SessionHostKind.MainWindow, session: 'b', chat: 'other' },
			chatResource: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'side' },
			notShownChat: { host: undefined, session: 'a', chat: 'main' },
			session: { host: SessionHostKind.MainWindow, session: 'b', chat: 'other' },
			sessionContext: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'side' },
			sessionResource: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'side' },
		});
	});

	test('a session that several windows show resolves to the host in the focused window', () => {
		const resolveIn = (focusedWindow: 'main' | 'chat') => {
			const { resolve, mainHost, sessionHostService } = setup(focusedWindow);
			disposables.add(sessionHostService.registerHost(new ActiveSessionHost({ kind: SessionHostKind.Pane, parent: mainHost, session: constObservable<IActiveSession | undefined>(sessionA), contextKeyService: upcastPartial<IContextKeyService>({}) })));
			return resolve(sessionA.resource);
		};
		assert.deepStrictEqual({ main: resolveIn('main'), chat: resolveIn('chat') }, {
			main: { host: SessionHostKind.Pane, session: 'a', chat: 'main' },
			chat: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'side' },
		});
	});

	test('without arguments, the focused host', () => {
		assert.deepStrictEqual({
			main: setup('main').resolve(),
			chat: setup('chat').resolve(undefined),
		}, {
			main: { host: SessionHostKind.MainWindow, session: 'b', chat: 'other' },
			chat: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'side' },
		});
	});

	test('arguments that name something not found never fall back to the focused host', () => {
		const { resolve } = setup('chat');
		assert.deepStrictEqual([
			resolve({ sessionHostId: 'gone' }),
			resolve({ groupId: 99 }),
			resolve({ windowId: 99 }),
			resolve(URI.parse('session:/gone')),
			resolve(chat('gone')),
			resolve('unknown'),
		], [undefined, undefined, undefined, undefined, undefined, undefined]);
	});
});

suite('resolveSessionCommandTarget: panes of the grid', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function modelChat(path: string): IChat {
		return upcastPartial<IChat>({ resource: URI.parse(`chat:/${path}`), title: constObservable(path), interactivity: constObservable(ChatInteractivity.Full) });
	}
	function modelSession(sessionId: string, chats: readonly IChat[]): ISession {
		return upcastPartial<ISession>({ sessionId, resource: URI.parse(`session:/${sessionId}`), status: constObservable(SessionStatus.Completed), loading: constObservable(false), mainChat: constObservable(chats[0]), chats: constObservable(chats) });
	}
	const mainChat = modelChat('main');
	const sideChat = modelChat('side');
	const sessionA = modelSession('a', [mainChat, sideChat]);
	const sessionB = modelSession('b', [modelChat('other')]);

	/** A real grid in a state `arrange` puts it in, with a pane host of each of its panes, as the sessions part shows them. */
	function setup(arrange: (model: VisibleSessions) => void) {
		const uriIdentityService = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		};
		const model = disposables.add(new VisibleSessions(session => session.mainChat.get(), () => [], () => [], () => { }, uriIdentityService));
		arrange(model);
		const contextKeyService = upcastPartial<IContextKeyService>({});
		const mainHost = new ActiveSessionHost({ kind: SessionHostKind.MainWindow, parent: undefined, session: model.activeSession, contextKeyService, windowId: constObservable(mainWindow.vscodeWindowId) });
		const sessionsService = upcastPartial<ISessionsService>({ gridHost: mainHost, isActivePane: pane => model.isActivePane(pane), isDetachedPane: pane => model.isDetachedPane(pane) });
		const sessionHostService = disposables.add(new SessionHostService(sessionsService, upcastPartial<IEditorGroupsService>({ getGroup: () => undefined })));
		const panes = new Map<ISessionHost, string>();
		for (const pane of model.gridSessions.get()) {
			if (pane) {
				const host = new ActiveSessionHost({ kind: SessionHostKind.Pane, parent: mainHost, session: constObservable(pane), contextKeyService });
				disposables.add(sessionHostService.registerHost(host));
				panes.set(host, model.isDetachedPane(pane) ? `${pane.sessionId} (detached)` : pane.sessionId);
			}
		}
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ISessionHostService, sessionHostService);
		instantiationService.stub(ISessionsService, sessionsService);
		instantiationService.stub(IFocusedSessionHostService, upcastPartial<IFocusedSessionHostService>({ getFocusedHost: () => mainHost }));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSession: resource => [sessionA, sessionB].find(session => session.resource.toString() === resource.toString()),
			getSessionForChatResource: () => undefined,
		}));
		const resolve = (...args: unknown[]) => {
			const target = instantiationService.invokeFunction(accessor => resolveSessionCommandTarget(accessor, args));
			return target && { pane: target.host && (panes.get(target.host) ?? target.host.kind), chat: target.chat?.resource.path.slice(1) };
		};
		const paneOf = (detached: boolean) => model.gridSessions.get().find(pane => pane?.sessionId === 'a' && model.isDetachedPane(pane) === detached)!;
		return { model, resolve, paneOf };
	}

	/** Session A in a slot and its side chat in a detached pane beside session B, which the detached pane becomes the active pane of. */
	function detachSideChat(model: VisibleSessions): void {
		model.restoreGrid([{ session: sessionA, sticky: false }, { session: sessionB, sticky: false }], 0);
		model.moveChatToGrid(sessionA, sideChat, model.getGridSlots()[1].id, Direction.Right);
	}

	test('a session that a slot and a detached pane show resolves to the active one of them, else to its slot', () => {
		const resolveWhile = (active: (model: VisibleSessions) => void) => setup(model => {
			detachSideChat(model);
			active(model);
		}).resolve(sessionA.resource);

		assert.deepStrictEqual({
			slotActive: resolveWhile(model => model.setActive(model.visibleSessions.get()[0])),
			detachedActive: resolveWhile(() => { }),
			otherSessionActive: resolveWhile(model => model.setActive(model.visibleSessions.get()[1])),
		}, {
			slotActive: { pane: 'a', chat: 'main' },
			detachedActive: { pane: 'a (detached)', chat: 'side' },
			otherSessionActive: { pane: 'a', chat: 'main' },
		});
	});

	test('a session that only a detached pane shows resolves to that pane', () => {
		const { resolve } = setup(model => {
			model.restoreGrid([{ session: sessionB, sticky: false }], 0);
			model.moveChatToGrid(sessionA, sideChat, model.getGridSlots()[0].id, Direction.Right);
			model.setActive(model.visibleSessions.get()[0]);
		});

		assert.deepStrictEqual(resolve(sessionA.resource), { pane: 'a (detached)', chat: 'side' });
	});

	test('the session of a pane, as its toolbars pass it, resolves to that pane, whichever pane is active', () => {
		const resolvePanes = (active: (model: VisibleSessions) => void) => {
			const { resolve, paneOf } = setup(model => {
				detachSideChat(model);
				active(model);
			});
			return { slot: resolve(paneOf(false)), detached: resolve(paneOf(true)) };
		};

		assert.deepStrictEqual({
			slotActive: resolvePanes(model => model.setActive(model.visibleSessions.get()[0])),
			detachedActive: resolvePanes(() => { }),
			otherSessionActive: resolvePanes(model => model.setActive(model.visibleSessions.get()[1])),
		}, {
			slotActive: { slot: { pane: 'a', chat: 'main' }, detached: { pane: 'a (detached)', chat: 'side' } },
			detachedActive: { slot: { pane: 'a', chat: 'main' }, detached: { pane: 'a (detached)', chat: 'side' } },
			otherSessionActive: { slot: { pane: 'a', chat: 'main' }, detached: { pane: 'a (detached)', chat: 'side' } },
		});
	});
});
