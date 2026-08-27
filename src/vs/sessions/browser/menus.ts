/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MenuId } from '../../platform/actions/common/actions.js';

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
	TitleBarUpdate: new MenuId('SessionsTitleBarUpdate'),
	BlockedSessionsHeader: new MenuId('SessionsBlockedSessionsHeader'),
	BlockedSessionsItem: new MenuId('SessionsBlockedSessionsItem'),
	TitleBarRightLayout: new MenuId('SessionsTitleBarRightLayout'),
	MobileTitleBarCenter: new MenuId('SessionsMobileTitleBarCenter'),
	PanelTitle: new MenuId('SessionsPanelTitle'),
	SidebarTitle: new MenuId('SessionsSidebarTitle'),
	SidebarSessionsHeader: new MenuId('SessionsSidebarSessionsHeader'),
	SessionSectionNewSession: new MenuId('SessionsSessionSectionNewSession'),
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
	/** Unified toolbar for all session-backed Automation history rows. Actions are conditionally shown via sessionItem.status context key. */
	AutomationsHistoryItem: new MenuId('SessionsAutomationsHistoryItem'),

	NewSessionConfig: new MenuId('NewSessions.SessionConfigMenu'),
	NewSessionControl: new MenuId('NewSessions.SessionControlMenu'),
	NewSessionRepositoryConfig: new MenuId('NewSessions.RepositoryConfigMenu'),
	SessionWorkspaceManage: new MenuId('Sessions.SessionWorkspaceManage'),
	SessionBarToolbar: new MenuId('SessionsSessionBarToolbar'),
	SessionConversations: new MenuId('SessionsSessionConversations'),
	SessionChatTab: new MenuId('SessionsSessionChatTab'),
	SessionChatItemContext: new MenuId('SessionsSessionChatItemContext'),
	SessionChatBackgroundContext: new MenuId('SessionsSessionChatBackgroundContext'),
	SessionsEditorHeaderPrimary: new MenuId('SessionsEditorHeaderPrimary'),
	SessionsEditorHeaderLayout: new MenuId('SessionsEditorHeaderLayout'),
	SessionsEditorTitle: new MenuId('SessionsEditorTitle'),
	SessionsEditorTabsBarContext: new MenuId('SessionsEditorTabsBarContext'),
	SessionsEditorTabsBarAddTab: new MenuId('SessionsEditorTabsBarAddTab'),
	SessionHeaderMeta: new MenuId('SessionsSessionHeaderMeta'),
	SessionHeaderContext: MenuId.SessionHeaderContext,
	SessionItemContextMenu: MenuId.SessionItemContextMenu,
} as const;
