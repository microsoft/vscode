/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { SessionWorkspacesEnabledContext } from '../../common/contextkeys.js';

/** Opens the Workspace editor on a new workspace, and returns the workspace once created, else `undefined`. */
export const NEW_SESSION_WORKSPACE_COMMAND_ID = 'sessions.workspaces.new';
/** Opens the Workspace editor on the workspace of the given `.code-workspace` file, or one that the user picks. */
export const EDIT_SESSION_WORKSPACE_COMMAND_ID = 'sessions.workspaces.edit';
/** Opens the Workspace editor on the custom group of the given id, to edit its name, icon and color. */
export const EDIT_SESSION_GROUP_COMMAND_ID = 'sessions.groups.edit';
/** Removes the workspace of the given `.code-workspace` file, or one that the user picks, after asking. */
export const REMOVE_SESSION_WORKSPACE_COMMAND_ID = 'sessions.workspaces.remove';

/** Whether the window has the Workspace editor, as the desktop and web Agents window and the editor window do, but not the phone. */
export const SessionWorkspaceEditorAvailableContext = new RawContextKey<boolean>('sessionWorkspaceEditorAvailable', false);

/** When the Workspace editor's commands show: the window has the editor, and chat and workspaces are on. */
export const SESSION_WORKSPACE_EDITOR_WHEN = ContextKeyExpr.and(SessionWorkspaceEditorAvailableContext, ChatContextKeys.enabled, SessionWorkspacesEnabledContext);
