/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CTX_NOTEBOOK_CELL_CHAT_FOCUSED = new RawContextKey<boolean>('notebookCellChatFocused', false, localize('notebookCellChatFocused', "Whether the cell chat editor is focused"));
export const CTX_NOTEBOOK_CHAT_HAS_ACTIVE_REQUEST = new RawContextKey<boolean>('notebookChatHasActiveRequest', false, localize('notebookChatHasActiveRequest', "Whether the cell chat editor has an active request"));
export const CTX_NOTEBOOK_CHAT_USER_DID_EDIT = new RawContextKey<boolean>('notebookChatUserDidEdit', false, localize('notebookChatUserDidEdit', "Whether the user did changes ontop of the notebook cell chat"));
export const CTX_NOTEBOOK_CHAT_OUTER_FOCUS_POSITION = new RawContextKey<'above' | 'below' | ''>('notebookChatOuterFocusPosition', '', localize('notebookChatOuterFocusPosition', "Whether the focus of the notebook editor is above or below the cell chat"));

export const MENU_CELL_CHAT_INPUT = MenuId.for('cellChatInput');
export const MENU_CELL_CHAT_WIDGET = MenuId.for('cellChatWidget');
export const MENU_CELL_CHAT_WIDGET_STATUS = MenuId.for('cellChatWidget.status');
export const MENU_CELL_CHAT_WIDGET_FEEDBACK = MenuId.for('cellChatWidget.feedback');
export const MENU_CELL_CHAT_WIDGET_TOOLBAR = MenuId.for('cellChatWidget.toolbar');

export const CTX_NOTEBOOK_CHAT_HAS_AGENT = new RawContextKey<boolean>('notebookChatAgentRegistered', false, localize('notebookChatAgentRegistered', "Whether a chat agent for notebook is registered"));
