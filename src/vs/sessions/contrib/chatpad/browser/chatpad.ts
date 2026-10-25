/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_WINDOW_TEXT_EDITOR, ChatWindowContext, IChatWindowContent, IChatWindowKind } from '../../../services/chatWindow/browser/chatWindowService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import type { ISessionsProviderChatpad } from '../../../services/sessions/common/sessionsProvider.js';

/** The command that opens the Chatpad, or reveals it when it is open. */
export const OPEN_CHATPAD_COMMAND_ID = 'sessions.openChatpad';

/** Whether a sessions provider offers the Chatpad. */
export const ChatpadProviderContext = new RawContextKey<boolean>('sessionsChatpadProvider', false, localize('sessionsChatpadProvider', "Whether a sessions provider offers the Chatpad."));

/** Where the Chatpad can be used: in the Agents window, with AI features enabled and a provider that offers it. */
export const ChatpadEnabledContext = ContextKeyExpr.and(ChatContextKeys.enabled, ChatpadProviderContext, IsSessionsWindowContext);

/** The experimental setting that gates the Chatpad entry points: the commands, the launcher and restoring it at startup. */
export const CHATPAD_ENABLED_SETTING = 'sessions.chatpad.enabled';

/** Where the Chatpad can be opened or appended to: where it can be used, and the experimental setting is on. */
export const ChatpadAvailableContext = ContextKeyExpr.and(ChatpadEnabledContext, ContextKeyExpr.has(`config.${CHATPAD_ENABLED_SETTING}`))!;

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

/** The editor the Chatpad note is shown with by default, when available. */
export const CHATPAD_NOTE_MARKDOWN_EDITOR = 'vscode.markdown.editor';

/** Whether the Chatpad note shows as text, rather than in the Markdown editor, as the user last chose. */
const CHATPAD_NOTE_AS_TEXT_STORAGE_KEY = 'sessions.chatpad.noteAsText';

/** The editor the Chatpad note shows in: the Markdown editor, or the text editor as the user last chose. */
export function getChatpadNoteViewType(storageService: IStorageService): string {
	return storageService.getBoolean(CHATPAD_NOTE_AS_TEXT_STORAGE_KEY, StorageScope.PROFILE, false) ? CHAT_WINDOW_TEXT_EDITOR : CHATPAD_NOTE_MARKDOWN_EDITOR;
}

/** Remembers the editor the Chatpad note shows in; see {@link getChatpadNoteViewType}. */
export function setChatpadNoteViewType(storageService: IStorageService, viewType: string): void {
	storageService.store(CHATPAD_NOTE_AS_TEXT_STORAGE_KEY, viewType === CHAT_WINDOW_TEXT_EDITOR, StorageScope.PROFILE, StorageTarget.USER);
}

/** What the chat window of `chatpad` shows: its chat, and its note in the editor the user last chose. */
export function getChatpadChatWindowContent(chatpad: ISessionsProviderChatpad, storageService: IStorageService): IChatWindowContent {
	return {
		session: chatpad.session.resource,
		editor: { resource: chatpad.note, viewType: getChatpadNoteViewType(storageService) },
	};
}
