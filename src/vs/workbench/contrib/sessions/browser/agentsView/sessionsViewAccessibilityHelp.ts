/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { SESSIONS_LIST_MARK_READ_COMMAND_ID, SESSIONS_LIST_MARK_UNREAD_COMMAND_ID } from '../../../../common/chatSessionCommands.js';
import { RENAME_SESSION_COMMAND_ID } from '../../common/sessionCommands.js';
import { SessionsListNotificationFocused } from '../views/sessionsListNotification.js';
import { SessionsView, SessionsViewId } from '../views/sessionsView.js';

/**
 * The accessibility help of the Sessions view of an editor window, where its sessions open in the chat area beside it. The
 * Agents window has help of its own, as has the list's Undo notice.
 */
export class SessionsViewAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 105;
	readonly name = 'sessions-view';
	readonly when = ContextKeyExpr.and(FocusedViewContext.isEqualTo(SessionsViewId), IsSessionsWindowContext.negate(), SessionsListNotificationFocused.negate());

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const viewsService = accessor.get(IViewsService);
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsView,
			{ type: AccessibleViewType.Help },
			() => getSessionsViewAccessibilityHelpContent(),
			() => viewsService.getViewWithId<SessionsView>(SessionsViewId)?.focus(),
			AccessibilityVerbositySettingId.SessionsView,
		);
	}
}

function getSessionsViewAccessibilityHelpContent(): string {
	return [
		localize('sessionsView.overview', "You are in the Sessions view. It lists your agent sessions in sections and groups, and opens them in the chat area beside it."),
		localize('sessionsView.navigation', "Use the Up Arrow and Down Arrow keys to move through the list. Use the Right Arrow and Left Arrow keys to expand and collapse a section, a group, or a session with several chats."),
		localize('sessionsView.open', "Press Enter to open the focused session or chat in the chat area. To move focus to the chat area, run Focus Chat Area{0}.", '<keybinding:workbench.action.agentsView.focusChatPart>'),
		localize('sessionsView.newSession', "To start a session, run New Session{0}. Its composer opens in the chat area.", '<keybinding:workbench.action.agentsView.newSession>'),
		localize('sessionsView.find', "Search the list with Find Session{0}.", '<keybinding:sessionsViewPane.find>'),
		localize('sessionsView.actions', "Press Shift+F10 or the Context Menu key to open the actions of the focused session, section, or group, such as Pin, Rename, Archive, and Mark as Read."),
		localize('sessionsView.shortcuts', "Rename the focused session{0}. Mark it as read{1} or unread{2}.", `<keybinding:${RENAME_SESSION_COMMAND_ID}>`, `<keybinding:${SESSIONS_LIST_MARK_READ_COMMAND_ID}>`, `<keybinding:${SESSIONS_LIST_MARK_UNREAD_COMMAND_ID}>`),
		localize('sessionsView.undo', "After you archive or delete sessions, a notice above the list offers Undo for 10 seconds. Focus it and open accessibility help{0} for how to use it.", '<keybinding:editor.action.accessibilityHelp>'),
	].join('\n');
}
