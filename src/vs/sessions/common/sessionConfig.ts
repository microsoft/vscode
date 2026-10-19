/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ResolveSessionConfigResult } from '../../platform/agentHost/common/state/protocol/commands.js';

export const USE_WORKTREE_SETTING = 'sessions.useWorktree';

export const SESSIONS_CHAT_TABS_SETTING = 'sessions.showChatTabs';

export const SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING = 'sessions.experimental.emptyFileEditorActions';

/** Whether the Session Activity Bar is shown beside the active chat in the desktop Agents window. */
export const SESSION_ACTIVITY_BAR_SETTING = 'sessions.showSessionActivityBar';

/** Whether the Session Activity Bar hosts the side panel and panel toggles in place of the title bar. */
export const SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING = 'sessions.sessionActivityBar.showLayoutActions';

/** The setting {@link SESSION_ACTIVITY_BAR_SETTING} was named before the Session Toolbar became the Session Activity Bar. */
export const LEGACY_SESSION_TOOLBAR_SETTING = 'sessions.showSessionToolbar';

export const SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING = 'sessions.list.groupExternalSessions';

export const SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SETTING = 'sessions.list.externalApplicationBadge';

export const SESSIONS_LIST_EXTERNAL_APPLICATION_BADGE_SHOW_FROM_SETTING = 'sessions.list.externalApplicationBadge.showFrom';

export const enum ExternalSessionApplicationBadgeMode {
	Off = 'off',
	Title = 'title',
	Details = 'details',
}

/** Whether session groups, and optionally workspace, Pinned and Chats sections, render with colors. */
export const SESSIONS_LIST_GROUP_COLORS_SETTING = 'sessions.list.groupColors';

/** How colored headers and their sessions are drawn. */
export const SESSIONS_LIST_GROUP_STYLE_SETTING = 'sessions.list.groupStyle';

export const enum SessionsListGroupStyle {
	/** A colored pill header with a colored rail beside its sessions. */
	Rail = 'rail',
	/** A solid header with a colored outline around its sessions. */
	Outline = 'outline',
	/** A colored pill inside a softly tinted card. */
	Tint = 'tint',
	/** A colored dot on the header and a thin rail beside its sessions. */
	Dot = 'dot',
}

/** Whether the sessions list is partitioned into user-defined collections. */
export const SESSIONS_LIST_COLLECTIONS_SETTING = 'sessions.list.collections';

/** Where the collection switcher is shown. */
export const SESSIONS_LIST_COLLECTION_SWITCHER_SETTING = 'sessions.list.collectionSwitcher';

export const enum SessionsCollectionSwitcher {
	/** A strip of collection icons in the title bar. */
	TitleBar = 'titleBar',
	/** Labeled tabs at the top of the sidebar. */
	Tabs = 'tabs',
	/** Only the Sessions header menu. */
	Menu = 'menu',
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
