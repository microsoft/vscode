/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ResolveSessionConfigResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';

export const USE_WORKTREE_SETTING = 'sessions.useWorktree';

export const SESSIONS_DRAFTS_ENABLED_SETTING = 'sessions.drafts.enabled';
export const SESSIONS_SEND_LATER_ENABLED_SETTING = 'sessions.sendLater.enabled';

export const SESSIONS_CHAT_TABS_SETTING = 'sessions.showChatTabs';

export const SESSIONS_DETAILS_POSITION_SETTING = 'sessions.experimental.detailsPosition';
export const SESSIONS_FLOATING_DETAILS_SETTING = 'sessions.experimental.floatingDetails';

export type DetailsPosition = 'right' | 'left' | 'top' | 'bottom';

/** Whether the Session Activity Bar is shown beside the active chat in the desktop Agents window. */
export const SESSION_ACTIVITY_BAR_SETTING = 'sessions.showSessionActivityBar';

/** Whether the Session Activity Bar hosts the side panel and panel toggles in place of the title bar. */
export const SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING = 'sessions.sessionActivityBar.showLayoutActions';

/**
 * Whether the Session Activity Bar of the active chat shows in a column of its own at the right edge of the main
 * Agents window, rather than beside the chat.
 */
export const SESSION_ACTIVITY_BAR_FIXED_COLUMN_SETTING = 'sessions.sessionActivityBar.fixedColumn';

/** The setting {@link SESSION_ACTIVITY_BAR_SETTING} was named before the Session Toolbar became the Session Activity Bar. */
export const LEGACY_SESSION_TOOLBAR_SETTING = 'sessions.showSessionToolbar';

export const SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING = 'sessions.list.groupExternalSessions';

export const SESSIONS_LIST_INBOX_ENABLED_SETTING = 'sessions.list.inboxEnabled';

/** When automation sessions automatically also appear in the Sessions list. */
export const SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING = 'sessions.list.showAutomationSessions';

export const enum AutomationSessionsListMode {
	/** Every automation session is listed. */
	Always = 'always',
	/** An automation session is listed once the user sends a message in it. */
	AfterReply = 'afterReply',
	/** Automation sessions are only listed when the user shows them. */
	Never = 'never',
}

/** Whether agents get tools to read and organize the Agents window Sessions list. */
export const SESSIONS_LIST_AGENT_TOOLS_SETTING = 'sessions.list.agentTools.enabled';

export const SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING = 'sessions.list.externalApplicationBadge';

/**
 * Not nested under {@link SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING}: a setting cannot also be
 * the parent of another setting, so the configuration model would ignore the nested value.
 */
export const SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING = 'sessions.list.externalApplicationBadgeShowFrom';

export const enum ExternalSessionApplicationBadgeMode {
	Off = 'off',
	Title = 'title',
	Details = 'details',
}

export const SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING = 'sessions.sidebar.separateNavigation';

/**
 * Whether Customizations keeps its own section below the Sessions list rather than joining the separate navigation
 * list. Only applies when {@link SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING} is enabled. Not nested under it: a
 * setting cannot also be the parent of another setting.
 */
export const SESSIONS_SIDEBAR_CUSTOMIZATIONS_AT_BOTTOM_SETTING = 'sessions.sidebar.customizationsAtBottom';

export const SESSIONS_LIST_REARRANGE_TREATMENT = 'sessions.list.rearrage';

export const enum SessionsChatTabsMode {
	Multiple = 'multiple',
	Single = 'single',
}

export const SESSIONS_CHAT_TABS_DEFAULT = SessionsChatTabsMode.Single;

export function isSessionConfigComplete(config: ResolveSessionConfigResult): boolean {
	return (config.schema.required ?? []).every(property => config.values[property] !== undefined);
}
