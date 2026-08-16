/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Single source of truth for the names of the session server tools (the tools
 * that let an agent list, create, message, inspect, and delete sessions/chats).
 *
 * These names are shared across layers: `common/` code surfaces them (e.g. the
 * open-session link and chat-attachment pointer) but cannot import from `node/`,
 * while the actual tool implementations live under `node/`. Keeping the names
 * here — the lowest common layer — lets both sides reference the same literals
 * instead of duplicating string constants that must be manually kept in sync.
 *
 * This is a `const enum`: it is only ever referenced member-by-member and is
 * never iterated at runtime, so its members inline to plain string literals.
 */
export const enum SessionServerToolName {
	ListSessions = 'list_sessions',
	GetCurrentSession = 'get_current_session',
	CreateSession = 'create_session',
	CreateChat = 'create_chat',
	RenameChat = 'rename_chat',
	SendMessage = 'send_message',
	GetSessionContext = 'get_session_context',
	DeleteSession = 'delete_session',
}
