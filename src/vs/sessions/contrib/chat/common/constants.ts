/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { COMPARE_AGENTS_ENABLED_SETTING } from '../../../services/sessions/common/sessionComparison.js';

export { NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID as NEW_SESSION_ACTION_ID } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
export const UNIFIED_WORKSPACE_PICKER_SETTING = ChatConfiguration.UnifiedWorkspacePicker;
export const AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING = 'chat.agentSessions.responseSelectionMenu.enabled';
export { COMPARE_AGENTS_ENABLED_SETTING };
export const COMPARE_AGENTS_OPEN_IN_GRID_SETTING = 'sessions.chat.compareAgents.openInGrid';
export const COMPARE_AGENTS_SHOW_PICKER_HINT_SETTING = 'sessions.chat.compareAgents.showPickerHint';
export const EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING = 'sessions.chat.experimental.newSessionComposerLayout';
export const WORKSPACE_OPT_OUT_SETTING = 'sessions.chat.experimental.workspaceOptOut';
export const ENVIRONMENT_PICKER_SETTING = 'sessions.chat.experimental.environmentPicker';
export const ENVIRONMENT_PICKER_BEFORE_WORKSPACE_SETTING = 'sessions.chat.experimental.environmentPickerBeforeWorkspace';
export const NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING = 'sessions.chat.experimental.newSessionComposerOptionsExpanded';
export const AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING = 'sessions.chat.experimental.agentsPickerInAttachContextMenu';
export const COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING = 'sessions.chat.experimental.collapsedSessionOptionsShowIcons';
export const NEW_SESSION_WELCOME_PHRASES_SETTING = 'sessions.chat.experimental.welcomePhrases';
export const NEW_SESSION_WELCOME_NAME_SETTING = 'sessions.chat.experimental.welcomeName';
export const NEW_SESSION_WELCOME_MESSAGES_SETTING = 'sessions.chat.experimental.welcomeMessages';
export const NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING = 'sessions.chat.experimental.connectorRecommendations';
