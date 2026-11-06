/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MenuId } from '../../platform/actions/common/actions.js';

/**
 * Menu IDs of the Agents window shell: title bar, part titles, account and Go
 * menus, custom views, Automations, the docked desktop editor part's tabs bar,
 * empty editors and window canvases. Session surface menus live in `./menus.ts`.
 */
export const AgentsWindowMenus = {
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
	TitleBarRightLayout: new MenuId('SessionsTitleBarRightLayout'),
	/** The Layout menu of a window with layout modes, such as a chat window: how it shows its chat and its editor parts. */
	WindowLayout: new MenuId('SessionsWindowLayout'),
	/**
	 * The layout actions in the title bar of a window with layout modes, such as a chat window: its Layout menu, and a
	 * button for each of its actions, which the user shows and hides from the context menu of the buttons.
	 */
	TitleBarWindowLayout: new MenuId('SessionsTitleBarWindowLayout'),
	MobileTitleBarCenter: new MenuId('SessionsMobileTitleBarCenter'),
	PanelTitle: new MenuId('SessionsPanelTitle'),
	SidebarTitle: new MenuId('SessionsSidebarTitle'),
	AuxiliaryBarTitle: new MenuId('SessionsAuxiliaryBarTitle'),
	SidebarFooter: new MenuId('SessionsSidebarFooter'),
	AccountMenu: new MenuId('SessionsAccountMenu'),
	GoMenu: new MenuId('SessionsGoMenu'),

	/** Header actions of the test custom view. */
	CustomViewTest: new MenuId('SessionsCustomViewTest'),

	/** Header actions of the Automations custom view. */
	CustomViewAutomations: new MenuId('SessionsCustomViewAutomations'),
	/** Header actions of the pinned canvas page. */
	CustomViewCanvas: new MenuId('SessionsCustomViewCanvas'),
	/** Context menu actions for an Automation definition card. */
	AutomationCardContext: new MenuId('SessionsAutomationCardContext'),
	/** Target controls above the Automation dialog prompt editor. */
	AutomationsDialogTargetToolbar: new MenuId('AutomationsDialogTargetToolbar'),
	SessionsEditorTabsBarContext: new MenuId('SessionsEditorTabsBarContext'),
	SessionsEditorTabsBarAddTab: new MenuId('SessionsEditorTabsBarAddTab'),
	SessionsEditorTabsBarAddTabCanvas: new MenuId('SessionsEditorTabsBarAddTabCanvas'),
	EmptyFileEditorActions: new MenuId('SessionsEmptyFileEditorActions'),
	EmptySearchEditorActions: new MenuId('SessionsEmptySearchEditorActions'),
	EmptyBrowserEditorActions: new MenuId('SessionsEmptyBrowserEditorActions'),
	/**
	 * The Add Tab actions listed in place of the watermark in an empty editor
	 * group. A subset of {@link SessionsEditorTabsBarAddTab}, which still backs
	 * the group's `+` dropdown.
	 */
	SessionsEmptyEditorGroupAddTab: new MenuId('SessionsEmptyEditorGroupAddTab'),
	SessionActivityBarCanvas: new MenuId('SessionActivityBarCanvas'),
} as const;

/**
 * The groups of the Canvas submenus, {@link AgentsWindowMenus.SessionsEditorTabsBarAddTabCanvas} and
 * {@link AgentsWindowMenus.SessionActivityBarCanvas}, top to bottom, each shown under a title.
 */
export const SessionCanvasMenuGroup = {
	/** The active chat's canvases whose tab was closed but which are still running. */
	Running: '1_running',
	/** The canvases that can be opened: the active chat's canvas types and the window's canvases. */
	Available: '2_available',
	/** Entries that create a canvas or find more canvas types. */
	Discover: '3_discover',
} as const;
