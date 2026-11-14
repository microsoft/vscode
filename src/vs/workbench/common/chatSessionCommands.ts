/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const AGENT_SESSION_MARK_READ_ACTION_ID = 'agentSession.markRead';
export const AGENT_SESSION_MARK_UNREAD_ACTION_ID = 'agentSession.markUnread';

/**
 * Internal commands of the sessions list that mark what it shows, sessions or a chat of a session, read or unread. In a
 * window that registers them, {@link AGENT_SESSION_MARK_READ_ACTION_ID} and {@link AGENT_SESSION_MARK_UNREAD_ACTION_ID}
 * run them for a target that is not an agent session of the Chat view, such as one of the Sessions view.
 */
export const SESSIONS_LIST_MARK_READ_COMMAND_ID = '_sessionsList.markRead';
export const SESSIONS_LIST_MARK_UNREAD_COMMAND_ID = '_sessionsList.markUnread';
