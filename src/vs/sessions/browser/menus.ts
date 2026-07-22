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
	BlockedSessionsHeader: new MenuId('SessionsBlockedSessionsHeader'),
	BlockedSessionsItem: new MenuId('SessionsBlockedSessionsItem'),
	TitleBarRightLayout: new MenuId('SessionsTitleBarRightLayout'),
	MobileTitleBarCenter: new MenuId('SessionsMobileTitleBarCenter'),
	PanelTitle: new MenuId('SessionsPanelTitle'),
	SidebarTitle: new MenuId('SessionsSidebarTitle'),
	SidebarSessionsHeader: new MenuId('SessionsSidebarSessionsHeader'),
	AuxiliaryBarTitle: new MenuId('SessionsAuxiliaryBarTitle'),
	SidebarFooter: new MenuId('SessionsSidebarFooter'),
	SidebarCustomizations: new MenuId('SessionsSidebarCustomizations'),
	SidebarAgentHost: new MenuId('SessionsSidebarAgentHost'),
	AccountMenu: new MenuId('SessionsAccountMenu'),
	GoMenu: new MenuId('SessionsGoMenu'),
	AgentFeedbackEditorContent: new MenuId('AgentFeedbackEditorContent'),

	NewSessionConfig: new MenuId('NewSessions.SessionConfigMenu'),
	NewSessionControl: new MenuId('NewSessions.SessionControlMenu'),
	NewSessionRepositoryConfig: new MenuId('NewSessions.RepositoryConfigMenu'),
	SessionWorkspaceManage: new MenuId('Sessions.SessionWorkspaceManage'),
	SessionBarToolbar: new MenuId('SessionsSessionBarToolbar'),
	SessionConversations: new MenuId('SessionsSessionConversations'),
	SessionChatTab: new MenuId('SessionsSessionChatTab'),
	SessionsEditorHeaderPrimary: new MenuId('SessionsEditorHeaderPrimary'),
	SessionsEditorHeaderSecondary: new MenuId('SessionsEditorHeaderSecondary'),
	SessionsEditorTitle: new MenuId('SessionsEditorTitle'),
	SessionsEditorTabsBarContext: new MenuId('SessionsEditorTabsBarContext'),
	SessionsEditorTabsBarAddTab: new MenuId('SessionsEditorTabsBarAddTab'),
	SessionHeaderMeta: new MenuId('SessionsSessionHeaderMeta'),
	SessionHeaderContext: MenuId.SessionHeaderContext,
	SessionItemContextMenu: MenuId.SessionItemContextMenu,
} as const;
