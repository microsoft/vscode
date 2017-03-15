/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { registerColor, editorBackground } from 'vs/platform/theme/common/colorRegistry';

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

export const PANEL_BACKGROUND = registerColor('panelBackground', {
	dark: editorBackground,
	light: editorBackground,
	hc: editorBackground
}, nls.localize('panelBackground', "Panel background color. Panels are shown below the editor area and contain views like output and integrated terminal."));