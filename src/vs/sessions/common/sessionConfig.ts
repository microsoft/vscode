/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ResolveSessionConfigResult } from '../../platform/agentHost/common/state/protocol/commands.js';

/**
 * When enabled, the Agents window docks the detail panel (auxiliary
 * bar) inside the editor part so a single editor tab bar spans the full width
 * across the editor content and the detail panel. Read once at startup; toggling
 * requires a window reload.
 */
export const DOCK_DETAIL_PANEL_SETTING = 'sessions.layout.singlePaneDetailPanel';

export const USE_WORKTREE_SETTING = 'sessions.useWorktree';

export const USE_WORKTREE_SETTING_TREATMENT = 'agentSessionsUseWorktree';

export const SESSIONS_CHAT_TABS_SETTING = 'sessions.showChatTabs';

export const SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING = 'sessions.list.groupExternalSessions';

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

export const enum SessionsChatTabsMode {
	Multiple = 'multiple',
	Single = 'single',
}

export const SESSIONS_CHAT_TABS_DEFAULT = SessionsChatTabsMode.Multiple;

export function isSessionConfigComplete(config: ResolveSessionConfigResult): boolean {
	return (config.schema.required ?? []).every(property => config.values[property] !== undefined);
}
