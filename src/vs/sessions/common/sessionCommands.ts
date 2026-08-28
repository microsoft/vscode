/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Command identifiers for session-view actions that are invoked from more than
 * one layer. Kept in `vs/sessions/common` so both the action registration under
 * `vs/sessions/contrib` and callers under `vs/sessions/browser` can share them
 * without crossing the sessions layering rules.
 */

/** Unarchives a session. Registered in `sessionsViewActions.ts`. */
export const UNARCHIVE_SESSION_COMMAND_ID = 'sessionsViewPane.unarchiveSession';

/** Renames a session. Registered in `sessionsViewActions.ts`. */
export const RENAME_SESSION_COMMAND_ID = 'sessionsViewPane.renameSession';

/** Archives one or more sessions. Registered in `sessionsViewActions.ts`. */
export const ARCHIVE_SESSION_COMMAND_ID = 'sessionsViewPane.archiveSession';

/** Closes a chat tab. Registered in `sessionsActions.ts`. */
export const CLOSE_CHAT_COMMAND_ID = 'sessions.chatCompositeBar.closeChat';

/** Focuses the active session. Registered in `sessionsActions.ts`. */
export const FOCUS_ACTIVE_SESSION_COMMAND_ID = 'sessions.focusActiveSession';

export const FOCUS_PREVIOUS_CHAT_GROUP_COMMAND_ID = 'sessions.focusPreviousChatGroup';

export const FOCUS_NEXT_CHAT_GROUP_COMMAND_ID = 'sessions.focusNextChatGroup';

export const SPLIT_CHAT_GROUP_RIGHT_COMMAND_ID = 'sessions.splitChatGroupRight';

export const SPLIT_CHAT_GROUP_DOWN_COMMAND_ID = 'sessions.splitChatGroupDown';

export const MOVE_CHAT_TO_PREVIOUS_GROUP_COMMAND_ID = 'sessions.moveChatToPreviousGroup';

export const MOVE_CHAT_TO_NEXT_GROUP_COMMAND_ID = 'sessions.moveChatToNextGroup';

/** Opens or focuses a regular editor window. Registered in `vscodeActions.ts`. */
export const OPEN_VSCODE_WINDOW_COMMAND_ID = 'agents.openVSCodeWindow';

/** Returns from the Agents window to a regular editor window. Registered in `vscodeActions.ts`. */
export const RETURN_TO_VSCODE_EDITOR_COMMAND_ID = 'agents.returnToVSCodeEditor';

/** Checks whether the Agents window is the only open main window. Registered in `vscodeActions.ts`. */
export const SHOULD_SHOW_RETURN_TO_VSCODE_EDITOR_COMMAND_ID = 'agents.shouldShowReturnToVSCodeEditor';

/** Starts GitHub Copilot sign-in. Registered in `account.contribution.ts`. */
export const AGENTIC_SIGN_IN_COMMAND_ID = 'workbench.action.agenticSignIn';

/** Opens the managed Files editor. Registered in `addTabActions.ts`. */
export const NEW_FILE_TAB_COMMAND_ID = 'workbench.action.agentSessions.newFileTab';
