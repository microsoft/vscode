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

/** Closes a chat tab. Registered in `sessionsActions.ts`. */
export const CLOSE_CHAT_COMMAND_ID = 'sessions.chatCompositeBar.closeChat';

/** Opens or focuses a regular editor window. Registered in `vscodeActions.ts`. */
export const OPEN_VSCODE_WINDOW_COMMAND_ID = 'agents.openVSCodeWindow';

/** Returns from the Agents window to a regular editor window. Registered in `vscodeActions.ts`. */
export const RETURN_TO_VSCODE_EDITOR_COMMAND_ID = 'agents.returnToVSCodeEditor';

/** Checks whether the Agents window is the only open main window. Registered in `vscodeActions.ts`. */
export const SHOULD_SHOW_RETURN_TO_VSCODE_EDITOR_COMMAND_ID = 'agents.shouldShowReturnToVSCodeEditor';
