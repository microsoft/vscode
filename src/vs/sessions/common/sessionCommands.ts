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

/** Archives a session. Registered in `sessionsViewActions.ts`. */
export const ARCHIVE_SESSION_COMMAND_ID = 'sessionsViewPane.archiveSession';

/** Unarchives a session. Registered in `sessionsViewActions.ts`. */
export const UNARCHIVE_SESSION_COMMAND_ID = 'sessionsViewPane.unarchiveSession';

/** Renames a session. Registered in `sessionsViewActions.ts`. */
export const RENAME_SESSION_COMMAND_ID = 'sessionsViewPane.renameSession';
