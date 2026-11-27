/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { registerSessionsListActions } from '../../browser/views/sessionsListActions.js';
import { Menus } from '../../browser/menus.js';
import { SessionsGrouping } from '../../browser/views/sessionsListCommon.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { bindSessionsViewGroupings, ChatViewSessionsListContext, EditorWindowSessionsContext, EditorWindowSessionsViewOffersInboxContext, SessionsView } from '../../browser/views/sessionsView.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { CHAT_VIEW_SESSIONS_GROUPINGS, EDITOR_WINDOW_SESSIONS_GROUPINGS } from '../../browser/agentsView/editorWindowSessionsList.js';
import { SESSIONS_LIST_INBOX_ENABLED_SETTING } from '../../common/sessionConfig.js';

suite('Chat view sessions list title actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('the actions of the sessions header are contributed to the Chat view title while the sessions list is shown', () => {
		const store = registerSessionsListActions();
		try {
			const describe = (id: MenuId) => MenuRegistry.getMenuItems(id).filter(isIMenuItem).map(item => item.command.id);
			const header = describe(Menus.SidebarSessionsHeader);
			const titleItems = MenuRegistry.getMenuItems(MenuId.ViewTitle).filter(item => item.when?.serialize().includes('chatViewSessionsList'));
			const title = titleItems.map(item => isIMenuItem(item) ? item.command.id : item.submenu.id);
			assert.deepStrictEqual({
				find: title.includes('sessionsViewPane.find'),
				compact: title.includes('sessionsViewPane.toggleCompact'),
				collapse: title.includes('sessionsViewPane.collapseAllGroups'),
				filter: title.includes(Menus.SessionsViewFilter.id),
				onlyForChatView: titleItems.every(item => item.when?.serialize().includes(`view == 'workbench.panel.chat.view.copilot'`)),
				gatedOnAiAndVisibleList: titleItems.every(item => {
					const when = item.when?.serialize() ?? '';
					return when.includes('chatIsEnabled') && when.includes('agentSessionsViewerVisible');
				}),
				headerKept: header.includes('sessionsViewPane.find'),
			}, { find: true, compact: true, collapse: true, filter: true, onlyForChatView: true, gatedOnAiAndVisibleList: true, headerKept: true });
		} finally {
			store.dispose();
		}
	});

	test('the Chat view title offers Toggle Inbox only with the Inbox setting on, in the sessions list, while AI is visible', () => {
		const store = registerSessionsListActions();
		try {
			const item = MenuRegistry.getMenuItems(MenuId.ViewTitle).filter(isIMenuItem).find(item => item.command.id === 'sessionsViewPane.inboxMode' && item.when?.serialize().includes('chatViewSessionsList'));
			const shows = ({ setting = true, list = true, aiEnabled = true, setupHidden = false, offered = CHAT_VIEW_SESSIONS_GROUPINGS.offered }: { setting?: boolean; list?: boolean; aiEnabled?: boolean; setupHidden?: boolean; offered?: readonly SessionsGrouping[] }) => {
				const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: setting });
				const contextKeyService = new ContextKeyService(configurationService);
				try {
					contextKeyService.createKey('view', 'workbench.panel.chat.view.copilot');
					ChatViewSessionsListContext.bindTo(contextKeyService).set(list);
					ChatContextKeys.enabled.bindTo(contextKeyService).set(aiEnabled);
					ChatContextKeys.agentSessionsViewerVisible.bindTo(contextKeyService).set(true);
					ChatEntitlementContextKeys.Setup.hidden.bindTo(contextKeyService).set(setupHidden);
					bindSessionsViewGroupings(contextKeyService, offered);
					return contextKeyService.contextMatchesRules(item?.when);
				} finally {
					contextKeyService.dispose();
				}
			};
			assert.deepStrictEqual({
				on: shows({}),
				settingOff: shows({ setting: false }),
				oldChatList: shows({ list: false }),
				aiDisabled: shows({ aiEnabled: false }),
				aiHidden: shows({ setupHidden: true }),
				notOffered: shows({ offered: EDITOR_WINDOW_SESSIONS_GROUPINGS.offered }),
			}, { on: true, settingOff: false, oldChatList: false, aiDisabled: false, aiHidden: false, notOffered: false });
		} finally {
			store.dispose();
		}
	});

	test('Toggle Inbox from the Command Palette toggles the list of the window that offers Inbox: the Agents window\'s view, else the one the Chat view embeds, and an editor window offers it only once that list is there', () => {
		const store = registerSessionsListActions();
		try {
			const toggled: string[] = [];
			const view = (name: string, offersInbox: boolean) => upcastPartial<SessionsView>({
				offersGrouping: grouping => offersInbox || grouping !== SessionsGrouping.Inbox,
				toggleInbox: () => { toggled.push(name); return true; },
				isInboxToggleFocused: () => false, isHeaderInTitle: false, grouping: SessionsGrouping.Inbox,
			});
			const run = (registered: SessionsView | null, embedded: SessionsView | undefined) => CommandsRegistry.getCommand('sessionsViewPane.inboxMode')!.handler(upcastPartial<ServicesAccessor>({
				get: <T>(id: unknown): T => (id === IViewsService ? { getViewWithId: () => registered } : { getEmbeddedView: () => embedded }) as T,
			}));
			// The Agents window; an editor window, whose Agents view does not offer Inbox; and one whose Chat view has no list yet
			run(view('agents', true), undefined);
			run(view('editor agents', false), view('chat', true));
			run(view('editor agents', false), undefined);

			const precondition = MenuRegistry.getCommand('sessionsViewPane.inboxMode')?.precondition;
			const enabled = (window: 'agents' | 'editor', chatListOffersInbox: boolean) => {
				const contextKeyService = new ContextKeyService(new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true }));
				try {
					(window === 'agents' ? IsSessionsWindowContext : EditorWindowSessionsContext).bindTo(contextKeyService).set(true);
					EditorWindowSessionsViewOffersInboxContext.bindTo(contextKeyService).set(chatListOffersInbox);
					ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
					return contextKeyService.contextMatchesRules(precondition);
				} finally {
					contextKeyService.dispose();
				}
			};

			assert.deepStrictEqual({
				toggled,
				enabled: { agents: enabled('agents', false), editorBeforeChatList: enabled('editor', false), editorWithChatList: enabled('editor', true) },
			}, {
				toggled: ['agents', 'chat'],
				enabled: { agents: true, editorBeforeChatList: false, editorWithChatList: true },
			});
		} finally {
			store.dispose();
		}
	});
});
