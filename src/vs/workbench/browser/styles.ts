/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { registerColor, editorBackground } from 'vs/platform/theme/common/colorRegistry';

// < --- Tabs --- >

export const ACTIVE_TAB_BACKGROUND = registerColor('activeTabBackground', {
	dark: editorBackground,
	light: editorBackground,
	hc: editorBackground
}, nls.localize('activeTabBackground', "Active Tab background color. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group."));

export const INACTIVE_TAB_BACKGROUND = registerColor('inactiveTabBackground', {
	dark: '#2D2D2D',
	light: '#ECECEC',
	hc: '#00000000'
}, nls.localize('inactiveTabBackground', "Inactive Tab background color. Tabs are the containers for editors in the editor area. Multiple tabs can be opened in one editor group."));


// < --- Panels --- >

export const PANEL_BACKGROUND = registerColor('panelBackground', {
	dark: editorBackground,
	light: editorBackground,
	hc: editorBackground
}, nls.localize('panelBackground', "Panel background color. Panels are shown below the editor area and contain views like output and integrated terminal."));


// < --- Status --- >

export const STATUS_BAR_FOREGROUND = registerColor('statusBarForeground', {
	dark: '#FFFFFF',
	light: '#FFFFFF',
	hc: '#FFFFFF'
}, nls.localize('statusBarForeground', "Status bar foreground color. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_BACKGROUND = registerColor('statusBarBackground', {
	dark: '#007ACC',
	light: '#007ACC',
	hc: '#00000000'
}, nls.localize('statusBarBackground', "Standard status bar background color. The status bar is shown in the bottom of the window"));

export const STATUS_BAR_NO_FOLDER_BACKGROUND = registerColor('statusBarNoFolderBackground', {
	dark: '#68217A',
	light: '#68217A',
	hc: '#00000000'
}, nls.localize('statusBarNoFolderBackground', "Status bar background color when no folder is opened. The status bar is shown in the bottom of the window"));