/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../common/sessionConfig.js';
import { SessionHeaderMenus } from './menus.js';

export interface ISessionChatTabsActionsOptions {
	/** The prefix of the ids of its actions: each window has its own, so that both register in one place, such as tests. */
	readonly idPrefix: string;
	/** The submenu that offers the choices: each window has its own, for the same reason. */
	readonly submenu: MenuId;
	/** Where the submenu shows, in the header of a session. */
	readonly when: ContextKeyExpression | undefined;
	/** When the choices run. */
	readonly precondition?: ContextKeyExpression;
}

/**
 * Registers the Show Chat Tabs submenu of a session's header, with its choice of {@link SESSIONS_CHAT_TABS_SETTING}:
 * Multiple shows each chat as a tab, Single shows the active chat.
 */
export function registerSessionChatTabsActions({ idPrefix, submenu, when, precondition }: ISessionChatTabsActionsOptions): IDisposable {
	const store = new DisposableStore();

	for (const menu of SessionHeaderMenus) {
		store.add(MenuRegistry.appendMenuItem(menu, {
			submenu,
			title: localize2('chatCompositeBar.showChatTabs', "Show Chat Tabs"),
			group: 'secondary/0_pane',
			order: 50,
			when,
		}));
	}

	store.add(registerAction2(class ShowMultipleChatTabsAction extends Action2 {
		constructor() {
			super({
				id: `${idPrefix}.showMultipleChatTabs`,
				title: localize2('showMultipleChatTabs', "Multiple"),
				toggled: ContextKeyExpr.equals(`config.${SESSIONS_CHAT_TABS_SETTING}`, SessionsChatTabsMode.Multiple),
				precondition,
				menu: {
					id: submenu,
					group: '1_presentation',
					order: 10,
				},
			});
		}

		override run(accessor: ServicesAccessor): Promise<void> {
			return accessor.get(IConfigurationService).updateValue(SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode.Multiple);
		}
	}));

	store.add(registerAction2(class ShowSingleChatAction extends Action2 {
		constructor() {
			super({
				id: `${idPrefix}.showSingleChat`,
				title: localize2('showSingleChat', "Single"),
				toggled: ContextKeyExpr.equals(`config.${SESSIONS_CHAT_TABS_SETTING}`, SessionsChatTabsMode.Single),
				precondition,
				menu: {
					id: submenu,
					group: '1_presentation',
					order: 20,
				},
			});
		}

		override run(accessor: ServicesAccessor): Promise<void> {
			return accessor.get(IConfigurationService).updateValue(SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode.Single);
		}
	}));

	return store;
}
