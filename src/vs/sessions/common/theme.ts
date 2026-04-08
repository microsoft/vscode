/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { registerColor, transparent } from '../../platform/theme/common/colorUtils.js';
import { contrastBorder } from '../../platform/theme/common/colorRegistry.js';
import { editorWidgetBorder, editorBackground } from '../../platform/theme/common/colors/editorColors.js';
import { buttonBackground } from '../../platform/theme/common/colors/inputColors.js';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from '../../workbench/common/theme.js';

// Sessions sidebar background color
export const sessionsSidebarBackground = registerColor(
	'sessionsSidebar.background',
	{
		dark: editorBackground,
		light: SIDE_BAR_BACKGROUND,
		hcDark: editorBackground,
		hcLight: editorBackground,
	},
	localize('sessionsSidebar.background', 'Background color of the sidebar view in the agent sessions window.')
);

// Sessions auxiliary bar background color
export const sessionsAuxiliaryBarBackground = registerColor(
	'sessionsAuxiliaryBar.background',
	{
		dark: SIDE_BAR_BACKGROUND,
		light: editorBackground,
		hcDark: SIDE_BAR_BACKGROUND,
		hcLight: SIDE_BAR_BACKGROUND,
	},
	localize('sessionsAuxiliaryBar.background', 'Background color of the auxiliary bar in the agent sessions window.')
);

// Sessions panel background color
export const sessionsPanelBackground = registerColor(
	'sessionsPanel.background',
	{
		dark: SIDE_BAR_BACKGROUND,
		light: editorBackground,
		hcDark: SIDE_BAR_BACKGROUND,
		hcLight: SIDE_BAR_BACKGROUND,
	},
	localize('sessionsPanel.background', 'Background color of the panel in the agent sessions window.')
);

// Sessions chat bar background color
export const sessionsChatBarBackground = registerColor(
	'sessionsChatBar.background',
	{
		dark: SIDE_BAR_BACKGROUND,
		light: editorBackground,
		hcDark: SIDE_BAR_BACKGROUND,
		hcLight: SIDE_BAR_BACKGROUND,
	},
	localize('sessionsChatBar.background', 'Background color of the chat bar in the agent sessions window.')
);

// Sessions sidebar header colors
export const sessionsSidebarHeaderBackground = registerColor(
	'sessionsSidebarHeader.background',
	sessionsSidebarBackground,
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
	sessionsSidebarBackground,
	localize('chatBarTitle.background', 'Background color of the chat bar title area in the agent sessions window.')
);

export const chatBarTitleForeground = registerColor(
	'chatBarTitle.foreground',
	SIDE_BAR_FOREGROUND,
	localize('chatBarTitle.foreground', 'Foreground color of the chat bar title area in the agent sessions window.')
);

// Agent feedback input widget border color
export const agentFeedbackInputWidgetBorder = registerColor(
	'agentFeedbackInputWidget.border',
	{ dark: editorWidgetBorder, light: editorWidgetBorder, hcDark: contrastBorder, hcLight: contrastBorder },
	localize('agentFeedbackInputWidget.border', 'Border color of the agent feedback input widget shown in the editor.')
);

// Sessions update button colors
export const sessionsUpdateButtonDownloadingBackground = registerColor(
	'sessionsUpdateButton.downloadingBackground',
	transparent(buttonBackground, 0.4),
	localize('sessionsUpdateButton.downloadingBackground', 'Background color of the update button to show download progress in the agent sessions window.')
);

export const sessionsUpdateButtonDownloadedBackground = registerColor(
	'sessionsUpdateButton.downloadedBackground',
	transparent(buttonBackground, 0.7),
	localize('sessionsUpdateButton.downloadedBackground', 'Background color of the update button when download is complete in the agent sessions window.')
);
