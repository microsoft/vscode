/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { Menus } from '../../../../browser/menus.js';

import '../../browser/sessionsActions.js';
import '../../browser/views/sessionsViewActions.js';

suite('Sessions - Actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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
			group: 'secondary/2_chats',
			order: 20,
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
			.filter(item => item.command.id === 'sessions.chatCompositeBar.togglePin' || item.command.id === 'sessionsViewPane.renameSession' || item.command.id === 'sessions.chatCompositeBar.addChat' || item.command.id === 'sessions.chatCompositeBar.close')
			.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || (a.order ?? 0) - (b.order ?? 0))
			.map(item => ({ id: item.command.id, group: item.group }));

		assert.deepStrictEqual(actions, [
			{ id: 'sessionsViewPane.renameSession', group: 'secondary/1_session' },
			{ id: 'sessions.chatCompositeBar.addChat', group: 'secondary/2_chats' },
			{ id: 'sessions.chatCompositeBar.togglePin', group: 'secondary/3_pin' },
			{ id: 'sessions.chatCompositeBar.close', group: 'secondary/3_pin' },
		]);
	});

	test('contributes Chats before New Chat in the same overflow group', () => {
		const chats = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isISubmenuItem)
			.find(item => item.submenu === Menus.SessionConversations);

		assert.deepStrictEqual({
			group: chats?.group,
			order: chats?.order,
		}, {
			group: 'secondary/2_chats',
			order: 10,
		});
	});

	test('uses a concise pin title in the session toolbar', () => {
		const pin = MenuRegistry.getMenuItems(Menus.SessionBarToolbar)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.chatCompositeBar.togglePin');

		assert.strictEqual(pin && (typeof pin.command.title === 'string' ? pin.command.title : pin.command.title.value), 'Pin');
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
			{ title: 'Pin', group: 'secondary/3_pin' },
			{ title: 'Maximize', group: 'secondary/3_pin' },
			{ title: 'Close', group: 'secondary/3_pin' },
		]);
	});
});
