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
	TitleBarControlMenu: new MenuId('SessionsTitleBarControlMenu'),
	TitleBarLeft: new MenuId('SessionsTitleBarLeft'),
	TitleBarCenter: new MenuId('SessionsTitleBarCenter'),
	TitleBarRight: new MenuId('SessionsTitleBarRight'),
	OpenSubMenu: new MenuId('SessionsOpenSubMenu'),
	PanelTitle: new MenuId('SessionsPanelTitle'),
	SidebarTitle: new MenuId('SessionsSidebarTitle'),
	AuxiliaryBarTitle: new MenuId('SessionsAuxiliaryBarTitle'),
	AuxiliaryBarTitleLeft: new MenuId('SessionsAuxiliaryBarTitleLeft'),
	SidebarFooter: new MenuId('SessionsSidebarFooter'),
	SidebarCustomizations: new MenuId('SessionsSidebarCustomizations'),
	AgentFeedbackEditorContent: new MenuId('AgentFeedbackEditorContent'),
} as const;
