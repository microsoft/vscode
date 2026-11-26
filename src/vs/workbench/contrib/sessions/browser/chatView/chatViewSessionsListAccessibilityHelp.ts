/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
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
import { ISessionsViewLocator, SessionsView, SessionsViewFocusedContext, SessionsViewId } from '../views/sessionsView.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';

/**
 * The accessibility help of the sessions list in the Chat view of an editor window. The list's Undo notice has help of its
 * own, which takes precedence while the notice has focus.
 */
export class ChatViewSessionsListAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 105;
	readonly name = 'chatViewSessionsList';
	readonly when = ContextKeyExpr.and(SessionsViewFocusedContext, FocusedViewContext.isEqualTo(ChatViewId), IsSessionsWindowContext.negate(), SessionsListNotificationFocused.negate());

	constructor(
		@IViewsService private readonly _viewsService: IViewsService,
		@ISessionsViewLocator private readonly _sessionsViewLocator: ISessionsViewLocator,
	) { }

	getProvider(_accessor: ServicesAccessor): AccessibleContentProvider {
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ChatViewSessionsList,
			{ type: AccessibleViewType.Help },
			() => getChatViewSessionsListAccessibilityHelpContent(),
			// The list takes focus back as the help closes: the Sessions view as it is then, registered or embedded in the Chat view
			() => (this._viewsService.getViewWithId<SessionsView>(SessionsViewId) ?? this._sessionsViewLocator.getEmbeddedView())?.focus(),
			AccessibilityVerbositySettingId.Chat,
		);
	}
}

function getChatViewSessionsListAccessibilityHelpContent(): string {
	return [
		localize('chatViewSessionsList.overview', "You are in the sessions list of the Chat view. It lists your agent sessions in sections and groups."),
		localize('chatViewSessionsList.navigation', "Use the Up Arrow and Down Arrow keys to move through the list. Use the Right Arrow and Left Arrow keys to expand and collapse a section, a group, or a session with several chats."),
		localize('chatViewSessionsList.open', "Press Enter to open the focused session or chat. It opens in the Chat view, below or beside the list, unless the chats of the window open in the chat area."),
		localize('chatViewSessionsList.newChat', "To start a new chat, run New Chat{0}.", '<keybinding:workbench.action.chat.newChat>'),
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
export class ChatViewSessionsListHelpHint extends Disposable {

	constructor(
		private readonly _list: { setAriaDescription(description: string | undefined): void },
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();
		this.update();
		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
				this.update();
			}
		}));
		this._register(_keybindingService.onDidUpdateKeybindings(() => this.update()));
	}

	private update(): void {
		const keybinding = this._configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat) ? this._keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel() : undefined;
		this._list.setAriaDescription(keybinding ? localize('chatViewSessionsListHelpHint', "Press {0} for accessibility help.", keybinding) : undefined);
	}
}
