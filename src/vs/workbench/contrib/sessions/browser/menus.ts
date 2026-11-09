/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MenuId } from '../../../../platform/actions/common/actions.js';

const NEW_SESSION_REPOSITORY_CONFIG_GROUP_PREFIX = 'navigation/';

/**
 * Returns a stable, ordered group for one action in the new-session repository toolbar.
 */
export function getNewSessionRepositoryConfigGroup(order: number, actionId: string): string {
	return `${NEW_SESSION_REPOSITORY_CONFIG_GROUP_PREFIX}${order.toString().padStart(16, '0')}/${actionId}`;
}

/**
 * Menu IDs for the Agent Sessions workbench layout.
 */
export const Menus = {
	BlockedSessionsHeader: new MenuId('SessionsBlockedSessionsHeader'),
	BlockedSessionsItem: new MenuId('SessionsBlockedSessionsItem'),
	SidebarSessionsHeader: new MenuId('SessionsSidebarSessionsHeader'),
	SessionSectionNewSession: new MenuId('SessionsSessionSectionNewSession'),
	SessionsViewFilter: new MenuId('SessionsViewPaneFilterSubMenu'),
	SessionsViewOrdering: new MenuId('SessionsViewOrdering'),
	SessionsViewGrouping: new MenuId('SessionsViewGrouping'),
	SessionsViewShow: new MenuId('SessionsViewShow'),
	SessionsViewEnvironment: new MenuId('SessionsViewEnvironment'),
	SessionsViewSource: new MenuId('SessionsViewSource'),
	SessionsViewHarness: new MenuId('SessionsViewHarness'),
	SessionsViewExternalFilter: new MenuId('SessionsViewExternalFilter'),
	SidebarCustomizations: new MenuId('SessionsSidebarCustomizations'),
	SidebarAgentHost: new MenuId('SessionsSidebarAgentHost'),
	AgentFeedbackEditorContent: new MenuId('AgentFeedbackEditorContent'),
	/** Context menu of a pinned canvas row in the sidebar. */
	SidebarCanvasContext: new MenuId('SessionsSidebarCanvasContext'),
	/** Hover toolbar of a pinned canvas row in the sidebar. */
	SidebarCanvasToolbar: new MenuId('SessionsSidebarCanvasToolbar'),
	/** Context menu for the Automations sidebar shortcut. */
	AutomationsContext: new MenuId('SessionsAutomationsContext'),
	/** Unified toolbar for all session-backed Automation history rows. Actions are conditionally shown via sessionItem.status context key. */
	AutomationsHistoryItem: new MenuId('SessionsAutomationsHistoryItem'),
	/** Context menu for session-backed Automation history rows. */
	AutomationsHistoryItemContext: new MenuId('SessionsAutomationsHistoryItemContext'),
	/** Input toolbar actions in the Automation dialog prompt editor. */
	AutomationsDialogInputToolbar: new MenuId('AutomationsDialogInputToolbar'),

	/** Input toolbar of the new-session and new-chat composers. */
	NewSessionChatInputToolbar: new MenuId('NewSessions.ChatInputToolbar'),
	NewSessionControl: new MenuId('NewSessions.SessionControlMenu'),
	NewSessionRepositoryConfig: new MenuId('NewSessions.RepositoryConfigMenu'),
	NewSessionWelcome: new MenuId('NewSessions.WelcomeMenu'),
	NewSessionWelcomeContext: new MenuId('NewSessions.WelcomeContextMenu'),
	SessionWorkspaceManage: new MenuId('Sessions.SessionWorkspaceManage'),
	SessionBarToolbar: new MenuId('SessionsSessionBarToolbar'),
	SessionGridLayout: new MenuId('SessionsGridLayout'),
	SessionChatTabs: new MenuId('SessionsSessionChatTabs'),
	SessionConversations: new MenuId('SessionsSessionConversations'),
	SessionChatTab: new MenuId('SessionsSessionChatTab'),
	SessionChatItemContext: new MenuId('SessionsSessionChatItemContext'),
	SessionItemOpenIn: new MenuId('SessionsSessionItemOpenIn'),
	SessionChatItemOpenIn: new MenuId('SessionsSessionChatItemOpenIn'),
	SessionChatItemToolbar: new MenuId('SessionsSessionChatItemToolbar'),
	SessionChatBackgroundContext: new MenuId('SessionsSessionChatBackgroundContext'),
	SessionItemToolbar: new MenuId('SessionItemToolbar'),
	SessionItemSettings: new MenuId('SessionsSessionItemSettings'),
	/** Context menu of a section header in the Sessions list. The list merges its own section actions into these groups. */
	SessionSectionContext: new MenuId('SessionsSessionSectionContext'),
	/** Context menu of a custom or comparison group header in the Sessions list. The list merges its own group actions into these groups. */
	SessionGroupContext: new MenuId('SessionsSessionGroupContext'),
	SessionsEditorHeaderPrimary: new MenuId('SessionsEditorHeaderPrimary'),
	/** Right-aligned actions of the editor header row; groups starting with `secondary/` go to its More Actions menu. */
	SessionsEditorHeaderSecondary: new MenuId('SessionsEditorHeaderSecondary'),
	/** Actions of the editor header row after {@link SessionsEditorHeaderSecondary}, behind a separator. */
	SessionsEditorHeaderLayout: new MenuId('SessionsEditorHeaderLayout'),
	SessionsEditorTitle: new MenuId('SessionsEditorTitle'),
	SessionsDiffEditorView: new MenuId('SessionsDiffEditorView'),
	EmptyChangesActions: new MenuId('SessionsEmptyChangesActions'),
	/**
	 * The Session Activity Bar, docked at the right edge of the active chat view, grouped by
	 * {@link SessionActivityBarGroup}. Each tab entry opens or activates its side pane tab, revealing
	 * the side pane when it is closed; these entries are gated on availability only. The terminal
	 * entry reveals the terminal in the panel. The side panel toggle before the tab entries and the
	 * panel toggle after the terminal leave the title bar while the activity bar shows its layout actions.
	 */
	SessionActivityBar: new MenuId('SessionActivityBar'),
	/** The Session Activity Bar's context menu, shown after the activity bar's own entry actions. */
	SessionActivityBarContext: new MenuId('SessionActivityBarContext'),
	/** The sizes of the Session Activity Bar, a submenu of {@link SessionActivityBarContext}. */
	SessionActivityBarSize: new MenuId('SessionActivityBarSize'),
	/** The positions of the Session Activity Bar, docked to the window edge or floating beside the chat, a submenu of {@link SessionActivityBarContext}. */
	SessionActivityBarPosition: new MenuId('SessionActivityBarPosition'),
	ChangesFilesView: new MenuId('SessionsChangesFilesView'),
	ChangesFilesViewAndPosition: new MenuId('SessionsChangesFilesViewAndPosition'),
	/**
	 * Entries merged into the dropdown of the changes button bar's primary
	 * button. A submenu contributed to its `primary` group names a group of
	 * related actions, takes over the button when it applies, and uses its first
	 * entry as the primary invocation.
	 */
	ChangesOperationsDropdown: new MenuId('SessionsChangesOperationsDropdown'),
	/** Agent Merge entries whose first visible action is invoked by its primary button. */
	ChangesAgentMerge: new MenuId('SessionsChangesAgentMerge'),
	/** Per-session Agent Merge configuration. */
	ChangesAgentMergeConfigure: new MenuId('SessionsChangesAgentMergeConfigure'),
	/** Choices for when Agent Merge may merge the pull request. */
	ChangesAgentMergeMergePullRequest: new MenuId('SessionsChangesAgentMergeMergePullRequest'),

	SessionHeaderContext: MenuId.SessionHeaderContext,
	SessionItemContextMenu: MenuId.SessionItemContextMenu,
} as const;

export const SessionHeaderMenus = [Menus.SessionHeaderContext, Menus.SessionBarToolbar] as const;

/** The groups of {@link Menus.SessionActivityBar}, top to bottom, each set apart by a separator. */
export const SessionActivityBarGroup = {
	/** The layout actions of a window with layout modes, such as a chat window, at the top of its Session Activity Bar while it shows the layout actions. */
	WindowLayout: '0_windowLayout',
	/** The side panel toggle, followed by the entries that open its tabs. */
	SidePanel: '1_sidePanel',
	/** The terminal, followed by the panel toggle. */
	Panel: '2_panel',
	/** Links to the active chat's pull requests and issues. */
	GitHub: '3_github',
} as const;
