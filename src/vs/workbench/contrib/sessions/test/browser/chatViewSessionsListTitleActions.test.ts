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
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { bindSessionsViewGroupings, ChatViewSessionsListContext, EditorWindowSessionsContext, EditorWindowSessionsViewOffersInboxContext, SessionsView } from '../../browser/views/sessionsView.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { EDITOR_WINDOW_SESSIONS_GROUPINGS } from '../../browser/agentsView/editorWindowSessionsList.js';
import { SESSIONS_LIST_FILTER_CHIPS_SETTING, SESSIONS_LIST_INBOX_ENABLED_SETTING } from '../../common/sessionConfig.js';
import { mainWindow } from '../../../../../base/browser/window.js';

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
				grouping: title.includes(Menus.SessionsViewGrouping.id),
				filter: title.includes(Menus.SessionsViewFilter.id),
				onlyForChatView: titleItems.every(item => item.when?.serialize().includes(`view == 'workbench.panel.chat.view.copilot'`)),
				gatedOnAiAndVisibleList: titleItems.every(item => {
					const when = item.when?.serialize() ?? '';
					return when.includes('chatIsEnabled') && when.includes('agentSessionsViewerVisible');
				}),
				headerKept: header.includes('sessionsViewPane.find'),
			}, { find: true, compact: true, collapse: true, grouping: true, filter: true, onlyForChatView: true, gatedOnAiAndVisibleList: true, headerKept: true });
		} finally {
			store.dispose();
		}
	});

	test('the chip setting switches the title actions only for the new Sessions list', async () => {
		const store = registerSessionsListActions();
		const configurationService = new TestConfigurationService();
		const context = new ContextKeyService(configurationService);
		try {
			context.createKey('view', 'workbench.panel.chat.view.copilot');
			const newList = ChatViewSessionsListContext.bindTo(context);
			newList.set(true);
			ChatContextKeys.enabled.bindTo(context).set(true);
			ChatContextKeys.agentSessionsViewerVisible.bindTo(context).set(true);
			const searchOpen = ChatContextKeys.sessionsListSearchOpen.bindTo(context);
			const setChipsEnabled = async (enabled: boolean) => {
				await configurationService.setUserConfiguration(SESSIONS_LIST_FILTER_CHIPS_SETTING, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire({
					affectsConfiguration: key => key === SESSIONS_LIST_FILTER_CHIPS_SETTING,
					affectedKeys: new Set([SESSIONS_LIST_FILTER_CHIPS_SETTING]),
					change: { keys: [SESSIONS_LIST_FILTER_CHIPS_SETTING], overrides: [] },
					source: ConfigurationTarget.USER,
				});
			};
			const items = (menu: MenuId) => MenuRegistry.getMenuItems(menu)
				.filter(item => context.contextMatchesRules(item.when))
				.map(item => isIMenuItem(item) ? item.command.id : item.submenu.id)
				.filter(id => id === 'sessionsViewPane.find' || id === Menus.SessionsViewGrouping.id || id === Menus.SessionsViewFilter.id);

			const off = { chat: items(MenuId.ViewTitle), agents: items(Menus.SidebarSessionsHeader), filter: items(Menus.SessionsViewFilter) };
			await setChipsEnabled(true);
			const on = { chat: items(MenuId.ViewTitle), agents: items(Menus.SidebarSessionsHeader), filter: items(Menus.SessionsViewFilter) };
			searchOpen.set(true);
			const searching = items(MenuId.ViewTitle);
			searchOpen.reset();
			const restored = items(MenuId.ViewTitle);
			newList.set(false);
			const legacyChat = items(MenuId.ViewTitle);
			newList.set(true);
			await setChipsEnabled(false);
			const offAgain = { chat: items(MenuId.ViewTitle), agents: items(Menus.SidebarSessionsHeader), filter: items(Menus.SessionsViewFilter) };
			assert.deepStrictEqual({ off, on, searching, restored, legacyChat, offAgain }, {
				off: { chat: [Menus.SessionsViewFilter.id, 'sessionsViewPane.find'], agents: [Menus.SessionsViewFilter.id, 'sessionsViewPane.find'], filter: [Menus.SessionsViewGrouping.id] },
				on: { chat: [Menus.SessionsViewGrouping.id], agents: [Menus.SessionsViewGrouping.id], filter: [] },
				searching: [], restored: [Menus.SessionsViewGrouping.id], legacyChat: [],
				offAgain: { chat: [Menus.SessionsViewFilter.id, 'sessionsViewPane.find'], agents: [Menus.SessionsViewFilter.id, 'sessionsViewPane.find'], filter: [Menus.SessionsViewGrouping.id] },
			});
		} finally {
			context.dispose();
			configurationService.onDidChangeConfigurationEmitter.dispose();
			store.dispose();
		}
	});

	test('the Chat view title offers Toggle Inbox only with the Inbox setting on, in the sessions list, while AI is visible', () => {
		const store = registerSessionsListActions();
		try {
			const item = MenuRegistry.getMenuItems(MenuId.ViewTitle).filter(isIMenuItem).find(item => item.command.id === 'sessionsViewPane.inboxMode' && item.when?.serialize().includes('chatViewSessionsList'));
			const shows = ({ setting = true, list = true, aiEnabled = true, setupHidden = false, offered = [...EDITOR_WINDOW_SESSIONS_GROUPINGS.offered, SessionsGrouping.Inbox] }: { setting?: boolean; list?: boolean; aiEnabled?: boolean; setupHidden?: boolean; offered?: readonly SessionsGrouping[] }) => {
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

suite('Chat view sessions list focus', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('focus that Toggle Inbox in the title loses as it goes moves to the toggle that replaces it, else to the list, unless it went elsewhere or the view went too', async () => {
		const handOver = Reflect.get(SessionsView.prototype, 'handOverInboxToggleFocus') as (this: object) => void;
		const elsewhere = mainWindow.document.body.appendChild(mainWindow.document.createElement('button'));
		try {
			const lost = async ({ toggleShown = false, moveFocusElsewhere = false, viewDisposed = false }) => {
				const focused: string[] = [];
				(mainWindow.document.activeElement as HTMLElement | null)?.blur();
				handOver.call({
					inboxToggles: new Set([{ isShown: () => toggleShown, focus: () => focused.push('toggle') }]),
					_store: { isDisposed: viewDisposed },
					isBodyVisible: () => true,
					sessionsControl: { focus: () => focused.push('list') },
				});
				if (moveFocusElsewhere) {
					elsewhere.focus();
				}
				await Promise.resolve();
				return focused.join() || 'none';
			};
			assert.deepStrictEqual({
				replacementToggle: await lost({ toggleShown: true }),
				noToggle: await lost({}),
				focusMovedElsewhere: await lost({ toggleShown: true, moveFocusElsewhere: true }),
				viewGone: await lost({ viewDisposed: true }),
			}, { replacementToggle: 'toggle', noToggle: 'list', focusMovedElsewhere: 'none', viewGone: 'none' });
		} finally {
			elsewhere.remove();
		}
	});
});
