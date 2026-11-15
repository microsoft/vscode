/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { SESSIONS_LIST_MARK_READ_COMMAND_ID, SESSIONS_LIST_MARK_UNREAD_COMMAND_ID } from '../../../../common/chatSessionCommands.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatViewId } from '../../../chat/browser/chat.js';
import { RENAME_SESSION_COMMAND_ID } from '../../common/sessionCommands.js';
import { SessionsListNotificationFocused } from '../views/sessionsListNotification.js';
import { getSessionsViewResolver, SessionsViewFocusedContext } from '../views/sessionsView.js';

/**
 * The accessibility help of the sessions list in the Chat view of an editor window. The list's Undo notice has help of its
 * own, which takes precedence while the notice has focus.
 */
export class ChatViewSessionsListAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 105;
	readonly name = 'chatViewSessionsList';
	readonly when = ContextKeyExpr.and(SessionsViewFocusedContext, FocusedViewContext.isEqualTo(ChatViewId), IsSessionsWindowContext.negate(), SessionsListNotificationFocused.negate());

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		// Resolved while the accessor is valid, for the list to take focus back as the help closes
		const getSessionsView = getSessionsViewResolver(accessor);
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ChatViewSessionsList,
			{ type: AccessibleViewType.Help },
			() => getChatViewSessionsListAccessibilityHelpContent(),
			() => getSessionsView()?.focus(),
			AccessibilityVerbositySettingId.Chat,
		);
	}
}

function getChatViewSessionsListAccessibilityHelpContent(): string {
	return [
		localize('chatViewSessionsList.overview', "You are in the sessions list of the Chat view. It lists your agent sessions in sections and groups."),
		localize('chatViewSessionsList.navigation', "Use the Up Arrow and Down Arrow keys to move through the list. Use the Right Arrow and Left Arrow keys to expand and collapse a section, a group, or a session with several chats."),
		localize('chatViewSessionsList.open', "Press Enter to open the focused session or chat. It opens in the Chat view, below or beside the list, unless the chats of the window open in the chat area."),
		localize('chatViewSessionsList.newChat', "To start a new chat in the Chat view, run New Chat{0}, or New Session in the header of the list.", '<keybinding:workbench.action.chat.newChat>'),
		localize('chatViewSessionsList.find', "Search the list with Find Session{0}.", '<keybinding:sessionsViewPane.find>'),
		localize('chatViewSessionsList.actions', "Press Shift+F10 or the Context Menu key to open the actions of the focused session, section, or group, such as Pin, Rename, Archive, and Mark as Read."),
		localize('chatViewSessionsList.shortcuts', "Rename the focused session{0}. Mark it as read{1} or unread{2}.", `<keybinding:${RENAME_SESSION_COMMAND_ID}>`, `<keybinding:${SESSIONS_LIST_MARK_READ_COMMAND_ID}>`, `<keybinding:${SESSIONS_LIST_MARK_UNREAD_COMMAND_ID}>`),
		localize('chatViewSessionsList.undo', "After you archive or delete sessions, a notice above the list offers Undo for 10 seconds. Focus it and open accessibility help{0} for how to use it.", '<keybinding:editor.action.accessibilityHelp>'),
	].join('\n');
}

/**
 * Tells screen readers in the list how to open its accessibility help, while the Chat view's verbosity setting is on, and
 * follows changes of the setting and of the keybindings.
 */
export function trackChatViewSessionsListHelpHint(list: { setAriaDescription(description: string | undefined): void }, configurationService: IConfigurationService, keybindingService: IKeybindingService): IDisposable {
	const store = new DisposableStore();
	const update = () => {
		const keybinding = configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat) ? keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel() : undefined;
		list.setAriaDescription(keybinding ? localize('chatViewSessionsListHelpHint', "Press {0} for accessibility help.", keybinding) : undefined);
	};
	update();
	store.add(configurationService.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
			update();
		}
	}));
	store.add(keybindingService.onDidUpdateKeybindings(() => update()));
	return store;
}
