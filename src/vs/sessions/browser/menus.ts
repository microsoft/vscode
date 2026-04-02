/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MenuId } from '../../platform/actions/common/actions.js';

/**
 * Menu IDs for the Agent Sessions workbench layout.
 */
export const Menus = {
	ChatBarTitle: new MenuId('ChatBarTitle'),
	CommandCenter: new MenuId('SessionsCommandCenter'),
	CommandCenterCenter: new MenuId('SessionsCommandCenterCenter'),
	TitleBarContext: new MenuId('SessionsTitleBarContext'),
	TitleBarLeftLayout: new MenuId('SessionsTitleBarLeftLayout'),
	TitleBarSessionTitle: new MenuId('SessionsTitleBarSessionTitle'),
	TitleBarSessionMenu: new MenuId('SessionsTitleBarSessionMenu'),
	TitleBarRightLayout: new MenuId('SessionsTitleBarRightLayout'),
	PanelTitle: new MenuId('SessionsPanelTitle'),
	SidebarTitle: new MenuId('SessionsSidebarTitle'),
	AuxiliaryBarTitle: new MenuId('SessionsAuxiliaryBarTitle'),
	AuxiliaryBarTitleLeft: new MenuId('SessionsAuxiliaryBarTitleLeft'),
	SidebarFooter: new MenuId('SessionsSidebarFooter'),
	SidebarCustomizations: new MenuId('SessionsSidebarCustomizations'),
	AgentFeedbackEditorContent: new MenuId('AgentFeedbackEditorContent'),

	// New session picker menus — providers contribute actions into these
	// scoped by context keys (sessionsProviderId, sessionType, etc.)
	NewSessionRepositoryConfig: new MenuId('NewSessions.RepositoryConfigMenu'),
	NewSessionConfig: new MenuId('NewSessions.SessionConfigMenu'),
	NewSessionControl: new MenuId('NewSessions.SessionControlMenu'),
} as const;
