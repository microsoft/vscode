/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { SessionWorkspacesEnabledContext } from '../../common/contextkeys.js';

/** Opens the Workspace editor on a new workspace, and returns the workspace once created, else `undefined`. */
export const NEW_SESSION_WORKSPACE_COMMAND_ID = 'sessions.workspaces.new';
/** Opens the Workspace editor on the workspace of the given `.code-workspace` file, or one that the user picks. */
export const EDIT_SESSION_WORKSPACE_COMMAND_ID = 'sessions.workspaces.edit';
/** Removes the workspace of the given `.code-workspace` file, or one that the user picks, after asking. */
export const REMOVE_SESSION_WORKSPACE_COMMAND_ID = 'sessions.workspaces.remove';

/** When the Workspace editor's commands show: chat is on, and so are workspaces. */
export const SESSION_WORKSPACE_EDITOR_WHEN = ContextKeyExpr.and(ChatContextKeys.enabled, SessionWorkspacesEnabledContext);
