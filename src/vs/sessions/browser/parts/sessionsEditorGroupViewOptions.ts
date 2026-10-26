/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorGroupViewOptions } from '../../../workbench/browser/parts/editor/editor.js';
import { Menus } from '../menus.js';

/**
 * The editor group header and tab menus shared by every Agents window editor part,
 * so editor header contributions (such as the Changes picker) show in the main
 * window and in chat windows alike.
 */
export function getSessionsEditorGroupViewOptions(): IEditorGroupViewOptions {
	return {
		menuIds: {
			headerPrimary: Menus.SessionsEditorHeaderPrimary,
			headerSecondary: Menus.SessionsEditorHeaderSecondary,
			headerLayout: Menus.SessionsEditorHeaderLayout,
			editorActions: Menus.SessionsEditorTitle,
			tabsBarContext: Menus.SessionsEditorTabsBarContext,
			tabsBarAddTab: Menus.SessionsEditorTabsBarAddTab
		},
		showHeader: true,
		useModernUITabs: true,
	};
}
