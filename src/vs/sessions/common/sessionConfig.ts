/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ResolveSessionConfigResult } from '../../platform/agentHost/common/state/protocol/commands.js';

export const USE_WORKTREE_SETTING = 'sessions.useWorktree';

export const SESSIONS_CHAT_TABS_SETTING = 'sessions.showChatTabs';

/** Whether the Session Activity Bar is shown beside the active chat in the desktop Agents window. */
export const SESSION_ACTIVITY_BAR_SETTING = 'sessions.showSessionActivityBar';

/** Whether the Session Activity Bar hosts the side panel and panel toggles in place of the title bar. */
export const SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING = 'sessions.sessionActivityBar.showLayoutActions';

/** The setting {@link SESSION_ACTIVITY_BAR_SETTING} was named before the Session Toolbar became the Session Activity Bar. */
export const LEGACY_SESSION_TOOLBAR_SETTING = 'sessions.showSessionToolbar';

export const SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING = 'sessions.list.groupExternalSessions';

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

export const SESSIONS_LIST_REARRANGE_TREATMENT = 'sessions.list.rearrage';

export const enum SessionsChatTabsMode {
	Multiple = 'multiple',
	Single = 'single',
}

export const SESSIONS_CHAT_TABS_DEFAULT = SessionsChatTabsMode.Multiple;

export function isSessionConfigComplete(config: ResolveSessionConfigResult): boolean {
	return (config.schema.required ?? []).every(property => config.values[property] !== undefined);
}
