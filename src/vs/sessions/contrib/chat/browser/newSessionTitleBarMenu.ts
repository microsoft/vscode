/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { LayoutModeContext, SideBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { NEW_SESSION_ACTION_ID } from '../../../../workbench/contrib/sessions/common/chatConstants.js';
import { SessionsWelcomeVisibleContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { SessionsTitleBarNewSessionEnabledContext } from '../../../common/agentsWindowContextKeys.js';

/**
 * Adds the Agents window title bar entry of the New Session action, with the command the action's own menu entries
 * use.
 */
export function appendNewSessionTitleBarMenuItem(): IDisposable {
	return MenuRegistry.appendMenuItem(AgentsWindowMenus.TitleBarLeftLayout, {
		command: {
			id: NEW_SESSION_ACTION_ID,
			title: localize2('sessions.newSession.label', "New Session"),
			category: CHAT_CATEGORY,
		},
		group: 'navigation',
		order: 1,
		// In place of the sessions list of the main window while it is hidden; a window with layout modes, such as a chat window, has none.
		when: ContextKeyExpr.and(LayoutModeContext.toNegated(), SideBarVisibleContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionsTitleBarNewSessionEnabledContext),
	});
}
