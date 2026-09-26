/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const INBOX_NOTIFICATIONS_VIEW_ID = 'sessions.inboxNotifications.view';
export const SHOW_INBOX_NOTIFICATIONS_COMMAND_ID = 'sessions.inboxNotifications.show';

/**
 * Gates the entire Inbox feature: the Inbox shortcut section in the Sessions
 * list, the Inbox custom view, and its Show Inbox command/keybinding.
 * Experimental, off by default; rollout is controlled by the experiment service.
 */
export const CHAT_INBOX_ENABLED_SETTING = 'chat.agentSessions.inbox.enabled';

/** Context key mirroring {@link CHAT_INBOX_ENABLED_SETTING}, for `when` clauses and section visibility. */
export const ChatInboxEnabledContext = new RawContextKey<boolean>('chatInboxEnabled', false, {
	type: 'boolean',
	description: 'True when the Sessions Inbox feature is enabled via the chat.agentSessions.inbox.enabled setting.',
});
