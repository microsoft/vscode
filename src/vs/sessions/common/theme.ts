/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { registerColor } from '../../platform/theme/common/colorUtils.js';
import { contrastBorder } from '../../platform/theme/common/colorRegistry.js';
import { Color } from '../../base/common/color.js';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from '../../workbench/common/theme.js';

// Sessions sidebar background color
export const sessionsSidebarBackground = registerColor(
	'sessionsSidebar.background',
	SIDE_BAR_BACKGROUND,
	localize('sessionsSidebar.background', 'Background color of the sidebar view in the agent sessions window.')
);

// Sessions sidebar border color
export const sessionsSidebarBorder = registerColor(
	'sessionsSidebar.border',
	{ dark: Color.fromHex('#808080').transparent(0.35), light: Color.fromHex('#808080').transparent(0.35), hcDark: contrastBorder, hcLight: contrastBorder },
	localize('sessionsSidebar.border', 'Border color of the sidebar in the agent sessions window.')
);

// Sessions sidebar header colors
export const sessionsSidebarHeaderBackground = registerColor(
	'sessionsSidebarHeader.background',
	SIDE_BAR_BACKGROUND,
	localize('sessionsSidebarHeader.background', 'Background color of the sidebar header area in the agent sessions window.')
);

export const sessionsSidebarHeaderForeground = registerColor(
	'sessionsSidebarHeader.foreground',
	SIDE_BAR_FOREGROUND,
	localize('sessionsSidebarHeader.foreground', 'Foreground color of the sidebar header area in the agent sessions window.')
);

// Chat bar title colors
export const chatBarTitleBackground = registerColor(
	'chatBarTitle.background',
	SIDE_BAR_BACKGROUND,
	localize('chatBarTitle.background', 'Background color of the chat bar title area in the agent sessions window.')
);

export const chatBarTitleForeground = registerColor(
	'chatBarTitle.foreground',
	SIDE_BAR_FOREGROUND,
	localize('chatBarTitle.foreground', 'Foreground color of the chat bar title area in the agent sessions window.')
);
