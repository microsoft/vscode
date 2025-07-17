/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { darken, inputBackground, editorWidgetBackground, lighten, registerColor, textLinkForeground, contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { localize } from '../../../../nls.js';

// Welcome Page Background - Pure Black
export const welcomePageBackground = registerColor(
	'welcomePage.background',
	{ dark: '#000000', hcDark: '#000000', hcLight: '#FFFFFF', light: '#FFFFFF' },
	localize('welcomePage.background', 'Background color for the Welcome page.')
);

// Tile Background - Pure Black
export const welcomePageTileBackground = registerColor(
	'welcomePage.tileBackground',
	{ dark: '#000000', light: '#F3F3F3', hcDark: '#000000', hcLight: '#FFFFFF' },
	localize('welcomePage.tileBackground', 'Background color for the tiles on the Welcome page.')
);

// Tile Hover Background - Darker Black
export const welcomePageTileHoverBackground = registerColor(
	'welcomePage.tileHoverBackground',
	{ dark: '#0F0F0F', light: '#E8E8E8', hcDark: '#0F4A85', hcLight: '#0F4A85' },
	localize('welcomePage.tileHoverBackground', 'Hover background color for the tiles on the Welcome.')
);

// Tile Border - Optional (set to blue or black)
export const welcomePageTileBorder = registerColor(
	'welcomePage.tileBorder',
	{ dark: '#1a1a1a', light: '#CECECE', hcDark: contrastBorder, hcLight: contrastBorder },
	localize('welcomePage.tileBorder', 'Border color for the tiles on the Welcome page.')
);

// Progress bar background
export const welcomePageProgressBackground = registerColor(
	'welcomePage.progress.background',
	{ dark: '#000000', light: inputBackground, hcDark: '#000000', hcLight: '#FFFFFF' },
	localize('welcomePage.progress.background', 'Foreground color for the Welcome page progress bars.')
);

// Progress bar foreground
export const welcomePageProgressForeground = registerColor(
	'welcomePage.progress.foreground',
	{ dark: '#3794FF', light: textLinkForeground, hcDark: '#3794FF', hcLight: '#0F4A85' },
	localize('welcomePage.progress.foreground', 'Background color for the Welcome page progress bars.')
);

// Walkthrough title color
export const walkthroughStepTitleForeground = registerColor(
	'walkthrough.stepTitle.foreground',
	{ dark: '#FFFFFF', light: '#000000', hcDark: '#FFFFFF', hcLight: '#000000' },
	localize('walkthrough.stepTitle.foreground', 'Foreground color of the heading of each walkthrough step')
);
