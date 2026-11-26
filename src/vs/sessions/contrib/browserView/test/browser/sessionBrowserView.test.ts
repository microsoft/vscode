/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IBrowserViewOwner } from '../../../../../platform/browserView/common/browserView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IEditorWillOpenEvent } from '../../../../../workbench/common/editor.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewContextualFilter, IBrowserViewModel, IBrowserViewOpenHandler, IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { getSessionChatOfResource, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IFocusedSessionHostService, ISessionHost } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { IChat, ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { stubSessionHosts } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { SessionBrowserViewController } from '../../browser/sessionBrowserView.js';

suite('SessionBrowserViewController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function session(id: string) {
		const mainChat = upcastPartial<IChat>({ resource: URI.parse(`chat:/${id}`) });
		const peer = upcastPartial<IChat>({ resource: URI.parse(`chat:/${id}/peer`) });
		const subagent = upcastPartial<IChat>({ resource: URI.parse(`chat:/${id}/subagent`) });
		const isArchived = observableValue('isArchived', false);
		const session = upcastPartial<ISession>({
			sessionId: id,
			resource: URI.parse(`session:/${id}`),
			status: constObservable(SessionStatus.Completed),
			mainChat: constObservable(mainChat),
			chats: constObservable([mainChat, peer, subagent]),
			isArchived,
		});
		return { ...session, isArchived };
	}

	function setup() {
		const first = session('first');
		const second = session('second');
		const mainSession = observableValue<ISession | undefined>('mainSession', first);
		const focusedSession = observableValue<ISession | undefined>('focusedSession', first);
		const chatWindowSession = observableValue<ISession | undefined>('chatWindowSession', second);
		const instantiationService = store.add(new TestInstantiationService());
		const mainGroup = upcastPartial<IEditorGroup>({ id: 1, windowId: mainWindow.vscodeWindowId });
		const chatWindowGroup = upcastPartial<IEditorGroup>({ id: 2, windowId: 1000 });
		const onDidAddGroup = store.add(new Emitter<IEditorGroup>());
		const editorGroupsService = upcastPartial<IEditorGroupsService>({
			onDidAddGroup: onDidAddGroup.event,
			getGroup: id => id === mainGroup.id ? mainGroup : id === chatWindowGroup.id ? chatWindowGroup : undefined,
		});
		const { sessionHostService } = stubSessionHosts(instantiationService, store, {
			session: mainSession.map(session => session && { session, chat: session.mainChat.get() }),
			editorGroupsService,
		});
		store.add(sessionHostService.registerHost(upcastPartial<ISessionHost>({
			windowId: constObservable(chatWindowGroup.windowId),
			session: chatWindowSession,
		})));
		instantiationService.stub(IFocusedSessionHostService, upcastPartial<IFocusedSessionHostService>({
			focusedHost: constObservable(upcastPartial<ISessionHost>({ session: focusedSession })),
		}));
		const onWillOpenEditor = store.add(new Emitter<IEditorWillOpenEvent>());
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ onWillOpenEditor: onWillOpenEditor.event }));
		instantiationService.stub(IEditorGroupsService, editorGroupsService);
		const sessions = [first, second];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			getSessionForChatResource: resource => {
				for (const session of sessions) {
					const chat = getSessionChatOfResource(session, resource, extUri);
					if (chat) {
						return { session, chat };
					}
				}
				return undefined;
			},
			getSession: resource => sessions.find(session => isEqual(session.resource, resource)),
		}));
		let handler: IBrowserViewOpenHandler | undefined;
		let filter: IBrowserViewContextualFilter | undefined;
		const browserService = upcastPartial<IBrowserViewWorkbenchService>({
			registerOpenHandler: value => { handler = value; return Disposable.None; },
			registerContextualFilter: value => { filter = value; return Disposable.None; },
		});
		instantiationService.stub(IBrowserViewWorkbenchService, browserService);
		store.add(instantiationService.createInstance(SessionBrowserViewController));

		function input(owner?: IBrowserViewOwner) {
			const input = store.add(new BrowserEditorInput({ id: 'page' }, async () => { throw new Error('Not needed'); }, upcastPartial<IThemeService>({}), NullTelemetryService, browserService));
			if (owner) {
				input.model = upcastPartial<IBrowserViewModel>({
					owner,
					onWillDispose: Event.None,
					onDidClose: Event.None,
					onDidChangeTitle: Event.None,
					onDidChangeFavicon: Event.None,
					onDidChangeLoadingState: Event.None,
					onDidNavigate: Event.None,
					dispose: () => { },
				});
			}
			return input;
		}

		return { first, second, mainSession, focusedSession, chatWindowSession, chatWindowGroup, onWillOpenEditor, onDidAddGroup, handler: handler!, filter: filter!, input };
	}

	test('only automatically opens agent pages owned by the main window active session', () => {
		const { first, mainSession, focusedSession, second, handler, input } = setup();
		const page = input();
		const shouldOpen = (sessionId: string) => handler.shouldOpenEditor(page, { type: 'agent', sessionId }, {});
		const activeChats = first.chats.get().map(chat => shouldOpen(chat.resource.toString()));
		const inactivePane = shouldOpen(second.mainChat.get().resource.toString());
		const unknownOwner = shouldOpen('chat:/unknown');
		focusedSession.set(second, undefined);
		const otherWindowFocused = shouldOpen(first.mainChat.get().resource.toString());
		mainSession.set(undefined, undefined);
		assert.deepStrictEqual({
			activeChats, inactivePane, unknownOwner, otherWindowFocused,
			noActiveSession: shouldOpen(first.mainChat.get().resource.toString()),
			userOpen: handler.shouldOpenEditor(page, { type: 'user' }, {}),
		}, {
			activeChats: [true, true, true], inactivePane: false, unknownOwner: false, otherWindowFocused: true,
			noActiveSession: false, userOpen: true,
		});
	});

	test('filters contextual pages by the focused chat window unless a session is explicit', () => {
		const { first, second, mainSession, focusedSession, filter, input } = setup();
		const firstPage = input({ type: 'agent', sessionId: first.mainChat.get().resource.toString() });
		const secondPage = input({ type: 'agent', sessionId: second.mainChat.get().resource.toString() });
		let changes = 0;
		store.add(filter.onDidChange!(() => changes++));
		focusedSession.set(second, undefined);
		const inChatWindow = [filter.include(firstPage, {}), filter.include(secondPage, {})];
		const afterFocusChange = changes;
		const explicitContext = [firstPage, secondPage].map(page => filter.include(page, { activeSessionId: first.mainChat.get().resource.toString() }));
		mainSession.set(second, undefined);
		const afterMainChange = changes;
		focusedSession.set(first, undefined);
		assert.deepStrictEqual({
			inChatWindow, explicitContext, afterFocusChange, afterMainChange, changes,
			afterSwitch: [filter.include(firstPage, {}), filter.include(secondPage, {})],
		}, {
			inChatWindow: [false, true], explicitContext: [true, false], afterFocusChange: 1, afterMainChange: 1, changes: 2,
			afterSwitch: [true, false],
		});
	});

	test('keeps an explicitly opened agent page alive for its owner, not the active session', () => {
		const { first, second, mainSession, focusedSession, onWillOpenEditor, input } = setup();
		mainSession.set(second, undefined);
		focusedSession.set(second, undefined);
		const page = input({ type: 'agent', sessionId: first.mainChat.get().resource.toString() });
		onWillOpenEditor.fire({ editor: page, groupId: 1 });
		page.dispose();
		const afterSwap = page.isDisposed();
		second.isArchived.set(true, undefined);
		const afterOtherArchived = page.isDisposed();
		first.isArchived.set(true, undefined);
		assert.deepStrictEqual({ afterSwap, afterOtherArchived, afterOwnerArchived: page.isDisposed() }, {
			afterSwap: false, afterOtherArchived: false, afterOwnerArchived: true,
		});
	});

	test('does not adopt an unknown agent page into the active session lifecycle', () => {
		const { first, onWillOpenEditor, input } = setup();
		const page = input({ type: 'agent', sessionId: 'chat:/unknown' });
		onWillOpenEditor.fire({ editor: page, groupId: 1 });
		first.isArchived.set(true, undefined);
		assert.strictEqual(page.isDisposed(), false);
	});

	test('tracks unresolved user tabs in the main window session, not a focused chat window', () => {
		const { first, second, focusedSession, onWillOpenEditor, input } = setup();
		focusedSession.set(second, undefined);
		const page = input();
		onWillOpenEditor.fire({ editor: page, groupId: 1 });
		second.isArchived.set(true, undefined);
		const afterOtherArchived = page.isDisposed();
		first.isArchived.set(true, undefined);
		assert.deepStrictEqual({ afterOtherArchived, afterOwnerArchived: page.isDisposed() }, {
			afterOtherArchived: false, afterOwnerArchived: true,
		});
	});

	for (const restored of [false, true]) {
		test(`tracks ${restored ? 'restored' : 'opened'} user tabs under their chat window session`, () => {
			const { first, second, chatWindowGroup, onWillOpenEditor, onDidAddGroup, input } = setup();
			const page = input({ type: 'user' });
			if (restored) {
				onDidAddGroup.fire(upcastPartial<IEditorGroup>({ ...chatWindowGroup, editors: [page] }));
			} else {
				onWillOpenEditor.fire({ editor: page, groupId: chatWindowGroup.id });
			}
			first.isArchived.set(true, undefined);
			const afterMainArchived = page.isDisposed();
			second.isArchived.set(true, undefined);
			assert.deepStrictEqual({ afterMainArchived, afterOwnerArchived: page.isDisposed() }, {
				afterMainArchived: false, afterOwnerArchived: true,
			});
		});

		test(`uses the ${restored ? 'restored' : 'opening'} chat window host to veto disposal during a session swap`, () => {
			const { first, second, chatWindowSession, chatWindowGroup, onWillOpenEditor, onDidAddGroup, input } = setup();
			const page = input({ type: 'user' });
			if (restored) {
				onDidAddGroup.fire(upcastPartial<IEditorGroup>({ ...chatWindowGroup, editors: [page] }));
			} else {
				onWillOpenEditor.fire({ editor: page, groupId: chatWindowGroup.id });
			}
			chatWindowSession.set(first, undefined);
			page.dispose();
			const afterSwap = page.isDisposed();
			chatWindowSession.set(second, undefined);
			page.dispose();
			assert.deepStrictEqual({ afterSwap, afterOwnerClose: page.isDisposed() }, {
				afterSwap: false, afterOwnerClose: true,
			});
		});
	}
});
