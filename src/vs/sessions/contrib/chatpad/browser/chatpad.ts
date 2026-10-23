/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatWindowContext, IChatWindowContent, IChatWindowKind } from '../../../services/chatWindow/browser/chatWindowService.js';
import type { ISessionsProviderChatpad } from '../../../services/sessions/common/sessionsProvider.js';

/** The command that opens the Chatpad, or reveals it when it is open. */
export const OPEN_CHATPAD_COMMAND_ID = 'sessions.openChatpad';

/** Where the Chatpad can be used: in the Agents window, with AI features and the agent host enabled. */
export const ChatpadEnabledContext = ContextKeyExpr.and(ChatContextKeys.enabled, AGENT_HOST_ENABLED_CONTEXT_KEY, IsSessionsWindowContext);

/** The Chatpad: a chat window that shows its note above its chat, docked in the main window by default. */
export const CHATPAD_CHAT_WINDOW_KIND: IChatWindowKind = {
	id: 'chatpad',
	title: localize('chatpad.windowTitle', "Chatpad"),
	inputPlaceholder: localize('chatpad.inputPlaceholder', "Ask to add to or organize your Chatpad"),
	inputMinLines: 1,
	// The Chatpad is a note with a chat to keep it, not a session of the sessions list.
	showSessionHeader: false,
	showPills: false,
	activatesSession: false,
	dockable: true,
	dockedByDefault: true,
	windowSize: { width: 720, height: 760 },
};

/** Within the Chatpad's chat window. */
export const ChatpadWindowContext = ChatWindowContext.isEqualTo(CHATPAD_CHAT_WINDOW_KIND.id);

/** The editor the Chatpad note is shown with, when available. */
const CHATPAD_NOTE_VIEW_TYPE = 'vscode.markdown.editor';

/** What the chat window of `chatpad` shows: its chat, and its note in the Markdown editor. */
export function getChatpadChatWindowContent(chatpad: ISessionsProviderChatpad): IChatWindowContent {
	return {
		session: chatpad.session.resource,
		editor: { resource: chatpad.note, viewType: CHATPAD_NOTE_VIEW_TYPE },
	};
}
