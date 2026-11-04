/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ActiveSessionHost, IFocusedSessionHostService, ISessionHostService, SessionHostKind } from '../../browser/sessionHost.js';
import { resolveSessionCommandTarget } from '../../browser/sessionCommandTarget.js';
import { SessionHostService } from '../../browser/sessionHostService.js';
import { IChat, ISession } from '../../common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../common/sessionsManagement.js';

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
		const sessionHostService = disposables.add(new SessionHostService(mainHost, upcastPartial<IEditorGroupsService>({ getGroup: id => groups.find(group => group.id === id) })));
		const chatWindowHost = new ActiveSessionHost({ kind: SessionHostKind.ChatWindow, parent: undefined, session: constObservable<IActiveSession | undefined>(sessionAInWindow), contextKeyService, windowId: constObservable(CHAT_WINDOW_ID) });
		disposables.add(sessionHostService.registerHost(chatWindowHost));
		instantiationService.stub(ISessionHostService, sessionHostService);
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
		return { resolve, chatWindowHost };
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
			sessionContext: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'main' },
			sessionResource: { host: SessionHostKind.ChatWindow, session: 'a', chat: 'main' },
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
