/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MenuId } from '../../platform/actions/common/actions.js';

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
	SessionsTitle: new MenuId('SessionsTitle'),
	CommandCenter: new MenuId('SessionsCommandCenter'),
	CommandCenterCenter: new MenuId('SessionsCommandCenterCenter'),
	TitleBarContext: new MenuId('SessionsTitleBarContext'),
	TitleBarLeftLayout: new MenuId('SessionsTitleBarLeftLayout'),
	TitleBarCenterLeft: new MenuId('SessionsTitleBarCenterLeft'),
	TitleBarCenterRight: new MenuId('SessionsTitleBarCenterRight'),
	TitleBarSessionTitle: new MenuId('SessionsTitleBarSessionTitle'),
	TitleBarSessionMenu: new MenuId('SessionsTitleBarSessionMenu'),
	TitleBarAccessibility: new MenuId('SessionsTitleBarAccessibility'),
	BlockedSessionsHeader: new MenuId('SessionsBlockedSessionsHeader'),
	BlockedSessionsItem: new MenuId('SessionsBlockedSessionsItem'),
	TitleBarRightLayout: new MenuId('SessionsTitleBarRightLayout'),
	MobileTitleBarCenter: new MenuId('SessionsMobileTitleBarCenter'),
	PanelTitle: new MenuId('SessionsPanelTitle'),
	SidebarTitle: new MenuId('SessionsSidebarTitle'),
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
	AuxiliaryBarTitle: new MenuId('SessionsAuxiliaryBarTitle'),
	SidebarFooter: new MenuId('SessionsSidebarFooter'),
	SidebarCustomizations: new MenuId('SessionsSidebarCustomizations'),
	SidebarAgentHost: new MenuId('SessionsSidebarAgentHost'),
	AccountMenu: new MenuId('SessionsAccountMenu'),
	GoMenu: new MenuId('SessionsGoMenu'),
	AgentFeedbackEditorContent: new MenuId('AgentFeedbackEditorContent'),

	/** Header actions of the test custom view. */
	CustomViewTest: new MenuId('SessionsCustomViewTest'),

	/** Header actions of the Automations custom view. */
	CustomViewAutomations: new MenuId('SessionsCustomViewAutomations'),
	/** Context menu for the Automations sidebar shortcut. */
	AutomationsContext: new MenuId('SessionsAutomationsContext'),
	/** Context menu actions for an Automation definition card. */
	AutomationCardContext: new MenuId('SessionsAutomationCardContext'),
	/** Unified toolbar for all session-backed Automation history rows. Actions are conditionally shown via sessionItem.status context key. */
	AutomationsHistoryItem: new MenuId('SessionsAutomationsHistoryItem'),
	/** Context menu for session-backed Automation history rows. */
	AutomationsHistoryItemContext: new MenuId('SessionsAutomationsHistoryItemContext'),
	/** Input toolbar actions in the Automation dialog prompt editor. */
	AutomationsDialogInputToolbar: new MenuId('AutomationsDialogInputToolbar'),
	/** Target controls above the Automation dialog prompt editor. */
	AutomationsDialogTargetToolbar: new MenuId('AutomationsDialogTargetToolbar'),

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
	SessionChatItemToolbar: new MenuId('SessionsSessionChatItemToolbar'),
	SessionChatBackgroundContext: new MenuId('SessionsSessionChatBackgroundContext'),
	SessionItemToolbar: new MenuId('SessionItemToolbar'),
	SessionItemSettings: new MenuId('SessionsSessionItemSettings'),
	SessionsEditorHeaderPrimary: new MenuId('SessionsEditorHeaderPrimary'),
	SessionsEditorHeaderLayout: new MenuId('SessionsEditorHeaderLayout'),
	SessionsEditorTitle: new MenuId('SessionsEditorTitle'),
	SessionsDiffEditorView: new MenuId('SessionsDiffEditorView'),
	SessionsEditorTabsBarContext: new MenuId('SessionsEditorTabsBarContext'),
	SessionsEditorTabsBarAddTab: new MenuId('SessionsEditorTabsBarAddTab'),
	SessionsEditorTabsBarAddTabCanvas: new MenuId('SessionsEditorTabsBarAddTabCanvas'),
	EmptyFileEditorActions: new MenuId('SessionsEmptyFileEditorActions'),
	/**
	 * The Add Tab actions listed in place of the watermark in an empty editor
	 * group. A subset of {@link SessionsEditorTabsBarAddTab}, which still backs
	 * the group's `+` dropdown.
	 */
	SessionsEmptyEditorGroupAddTab: new MenuId('SessionsEmptyEditorGroupAddTab'),
	/**
	 * The Session Activity Bar, docked at the right edge of the active chat view, grouped by
	 * {@link SessionActivityBarGroup}. Each tab entry opens or activates its side pane tab, revealing
	 * the side pane when it is closed; these entries are gated on availability only. The side panel
	 * toggle above them and the panel toggle below them leave the title bar while the activity bar
	 * shows its layout actions.
	 */
	SessionActivityBar: new MenuId('SessionActivityBar'),
	/** The Session Activity Bar's context menu, shown after the activity bar's own entry actions. */
	SessionActivityBarContext: new MenuId('SessionActivityBarContext'),
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
	SidePanel: '1_sidePanel',
	Tabs: '2_tabs',
	Panel: '3_panel',
} as const;
