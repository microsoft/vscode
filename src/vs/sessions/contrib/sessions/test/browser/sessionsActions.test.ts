/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Menus } from '../../../../browser/menus.js';
import { SESSION_CONVERSATION_SIDE_CHATS_GROUP } from '../../../../browser/sessionConversationGroups.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';

import { SessionConversationActionsContribution } from '../../browser/sessionsActions.js';
import '../../browser/views/sessionsViewActions.js';
import { createTestSession } from './sessionsListTestUtils.js';

suite('Sessions - Actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('contributes New Chat to the session header overflow', () => {
		const action = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.chatCompositeBar.addChat');

		assert.deepStrictEqual({
			title: action && (typeof action.command.title === 'string' ? action.command.title : action.command.title.value),
			group: action?.group,
			order: action?.order,
			when: action?.when?.serialize(),
		}, {
			title: 'New Chat in This Session',
			group: 'secondary/3_newChat',
			order: 10,
			when: 'sessionIsCreated && sessionSupportsMultipleChats && !isQuickChatSession && !sessionIsArchived',
		});
	});

	test('contributes New Chat to the session list item menu', () => {
		const action = MenuRegistry.getMenuItems(Menus.SessionItemContextMenu)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.chatCompositeBar.addChat');

		assert.deepStrictEqual({
			title: action && (typeof action.command.title === 'string' ? action.command.title : action.command.title.value),
			group: action?.group,
			order: action?.order,
			when: action?.when?.serialize(),
		}, {
			title: 'New Chat in This Session',
			group: '1_newChat',
			order: 0,
			when: 'sessionIsCreated && sessionSupportsMultipleChats && !isQuickChatSession && !sessionIsArchived',
		});
	});

	test('groups session management actions before creation and close', () => {
		const actions = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.filter(item => item.command.id === 'sessions.chatCompositeBar.togglePin' || item.command.id === 'sessions.sessionHeader.rename' || item.command.id === 'sessions.chatCompositeBar.addChat' || item.command.id === 'sessions.chatCompositeBar.close')
			.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || (a.order ?? 0) - (b.order ?? 0))
			.map(item => ({ id: item.command.id, group: item.group }));

		assert.deepStrictEqual(actions, [
			{ id: 'sessions.sessionHeader.rename', group: 'secondary/1_session' },
			{ id: 'sessions.chatCompositeBar.addChat', group: 'secondary/3_newChat' },
			{ id: 'sessions.chatCompositeBar.togglePin', group: 'secondary/4_pin' },
			{ id: 'sessions.chatCompositeBar.close', group: 'secondary/4_pin' },
		]);
	});

	test('places the Side Chats submenu and New Chat in separate adjacent overflow groups', () => {
		const chats = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isISubmenuItem)
			.find(item => item.submenu === Menus.SessionConversations);
		const addChat = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.chatCompositeBar.addChat');

		assert.deepStrictEqual({
			chatsTitle: chats && (typeof chats.title === 'string' ? chats.title : chats.title.value),
			chatsGroup: chats?.group,
			chatsOrder: chats?.order,
			chatsWhen: chats?.when?.serialize(),
			addChatGroup: addChat?.group,
			addChatOrder: addChat?.order,
		}, {
			chatsTitle: 'Side Chats',
			chatsGroup: 'secondary/2_chats',
			chatsOrder: 10,
			chatsWhen: 'sessionHasSideChats && sessionIsCreated && !sessionIsArchived',
			addChatGroup: 'secondary/3_newChat',
			addChatOrder: 10,
		});
	});

	test('uses a concise pin title in the session toolbar', () => {
		const pin = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.chatCompositeBar.togglePin');

		assert.strictEqual(pin && (typeof pin.command.title === 'string' ? pin.command.title : pin.command.title.value), 'Pin');
	});

	test('keeps the Command Palette delete action explicit', () => {
		const deleteChat = MenuRegistry.getCommand('sessions.chatCompositeBar.deleteChat');

		assert.strictEqual(deleteChat && (typeof deleteChat.title === 'string' ? deleteChat.title : deleteChat.title.value), 'Delete Chat');
	});

	test('groups session toolbar actions with concise titles', () => {
		const actions = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.filter(item => ['sessions.chatCompositeBar.togglePin', 'sessions.chatCompositeBar.toggleMaximize', 'sessions.chatCompositeBar.close'].includes(item.command.id))
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map(item => ({
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				group: item.group,
			}));

		assert.deepStrictEqual(actions, [
			{ title: 'Pin', group: 'secondary/4_pin' },
			{ title: 'Maximize', group: 'secondary/4_pin' },
			{ title: 'Close', group: 'secondary/4_pin' },
		]);
	});

	test('the Side Chats menu surfaces only side chats, not subagents or ordinary chats', () => {
		const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
		const { session } = createTestSession('Session');
		const completed = constObservable(SessionStatus.Completed);
		const mainChat: IChat = { ...session.mainChat.get(), resource: URI.parse('test-chat://main'), title: constObservable('Main chat'), status: completed, origin: undefined };
		const peerChat: IChat = { ...mainChat, resource: URI.parse('test-chat://peer'), title: constObservable('Peer chat'), origin: { kind: ChatOriginKind.User } };
		const sideChat: IChat = { ...mainChat, resource: URI.parse('test-chat://side'), title: constObservable('Side chat'), origin: { kind: ChatOriginKind.SideChat } };
		const subagentChat: IChat = { ...mainChat, resource: URI.parse('test-chat://subagent'), title: constObservable('Subagent chat'), origin: { kind: ChatOriginKind.Tool, parentChat: mainChat.resource } };
		const allChats = [mainChat, peerChat, sideChat, subagentChat];

		const activeSession = upcastPartial<IActiveSession>({
			...session,
			chats: constObservable(allChats),
			activeChat: constObservable(mainChat),
			isCreated: constObservable(true),
			sticky: constObservable(false),
		});

		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly visibleSessions = constObservable([activeSession]);
		});

		disposables.add(instantiationService.createInstance(SessionConversationActionsContribution));

		const registered = MenuRegistry.getMenuItems(Menus.SessionConversations)
			.filter(isIMenuItem)
			.filter(item => item.command.id.startsWith(`sessions.openChat.${session.sessionId}.`))
			.map(item => ({
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				group: item.group,
			}));

		assert.deepStrictEqual(registered, [
			{ title: 'Side chat', group: SESSION_CONVERSATION_SIDE_CHATS_GROUP },
		]);
	});
});
